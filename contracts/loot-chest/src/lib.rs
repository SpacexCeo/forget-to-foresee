#![allow(deprecated)] // the standard's NEP-171 / NEP-181 macros generate the canonical methods
//! Forget to Foresee (NEAR testnet): loot chests dropped by monsters outside the town walls (docs/chests.md).
//!
//! 1. `commit_deck`: the owner commits the Merkle root of the season's canonical deck (10,000 outcomes, positions
//!    0..999 are the NFT slots), before any seed exists.
//! 2. `fix_seed`: once, after the commit. The owner passes a NEAR AI Cloud TEE answer whose request names the root;
//!    the contract checks the request hash and the ECDSA signature, then mixes sha256(signature) with this block's
//!    random seed. Nobody can know the seed before this transaction executes.
//! 3. `open_chest(account_id)`: an authorized opener (the relayer) opens the next chest for a player. The draw takes a
//!    uniformly random position among the ones not drawn yet (sparse Fisher-Yates), from sha256(season seed ||
//!    index || this block's random seed), so even the next outcome is unknown in advance. Positions below 1,000 mint
//!    a loot NFT to the player. Caps: 10,000 openings, 1,000 NFTs (exact, by construction), 30 per account per day.
//!
//! Every opening is recorded (index, account, position, the random value used, block) and anyone replays the draws
//! and checks the outcome's Merkle proof with tools/verify-chest.
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U64;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault, PromiseOrValue};

pub const DECK_SIZE: u32 = 10_000;
pub const NFT_SLOTS: u32 = 1_000;
pub const DAILY_CAP: u32 = 30;
/** NFT tiers by position, the same bounds as relayer/lib/chest-deck.js NFT_TIERS. */
pub const TIERS: [(&str, u32); 3] = [("legendary", 60), ("rare", 240), ("uncommon", 700)];

pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the contract owner can call this";
pub const ERR_NOT_OPENER: &str = "ERR_NOT_OPENER: only an authorized opener can open chests";
pub const ERR_COMMITTED: &str = "ERR_COMMITTED: the deck is already committed";
pub const ERR_NO_COMMIT: &str = "ERR_NO_COMMIT: commit the deck first";
pub const ERR_SEEDED: &str = "ERR_SEEDED: the season seed is already fixed";
pub const ERR_NO_SEED: &str = "ERR_NO_SEED: the season seed is not fixed yet";
pub const ERR_HEX: &str = "ERR_HEX: root and deck_sha256 are 64 lowercase hex characters";
pub const ERR_TEE_ROOT: &str = "ERR_TEE_ROOT: the TEE request must name the committed root";
pub const ERR_TEE_HASH: &str = "ERR_TEE_HASH: sha256(request_body) is not the request hash in signed_text";
pub const ERR_TEE_SIG: &str = "ERR_TEE_SIG: the signature does not recover to signing_address";
pub const ERR_SOLD_OUT: &str = "ERR_SOLD_OUT: all chests of this season are opened";
pub const ERR_DAILY: &str = "ERR_DAILY: this account opened its chests for today";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey { NonFungibleToken, Metadata, TokenMetadata, Enumeration, Openers, Moved, Openings, ByAccount, Daily }

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Opening {
    pub index: u32,
    pub account_id: AccountId,
    pub position: u32,
    pub nft: bool,
    pub tier: Option<String>,
    pub token_id: Option<String>,
    /// hex of sha256(season seed || index u32 LE || block random seed)
    pub random: String,
    /// hex of the block random seed mixed in
    pub block_random: String,
    pub block: U64,
    pub at_ns: U64,
}

/// What is stored per opening (about 120 bytes); views expand it into `Opening`.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Stored { pub account_id: AccountId, pub position: u32, pub block_random: [u8; 32], pub block: u64, pub at_ns: u64 }

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct SeedRecord {
    pub seed: String,
    pub request_body: String,
    pub signed_text: String,
    pub signature: String,
    pub signing_address: String,
    pub block_random: String,
    pub block: U64,
}

#[near(serializers = [json])]
pub struct SeasonInfo {
    pub season: String,
    pub root: Option<String>,
    pub deck_sha256: Option<String>,
    pub committed_block: Option<U64>,
    pub seed: Option<SeedRecord>,
    pub size: u32,
    pub nft_slots: u32,
    pub opened: u32,
    pub nft_minted: u32,
    pub daily_cap: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    season: String,
    openers: Vec<AccountId>,
    root: Option<String>,
    deck_sha256: Option<String>,
    committed_block: Option<u64>,
    seed: Option<SeedRecord>,
    opened: u32,
    nft_minted: u32,
    moved: LookupMap<u32, u32>,
    openings: LookupMap<u32, Stored>,
    by_account: LookupMap<AccountId, Vec<u32>>,
    daily: LookupMap<AccountId, (u64, u32)>,
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
}

fn is_hex64(s: &str) -> bool { s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{:02x}", x)).collect() }
fn unhex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 { return None; }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok()).collect()
}

/// EIP-191 personal_sign recovery: the 0x-prefixed lowercase address that signed `text`, or None.
pub fn recover_personal(text: &str, signature_hex: &str) -> Option<String> {
    let sig = unhex(signature_hex.strip_prefix("0x").unwrap_or(signature_hex))?;
    if sig.len() != 65 { return None; }
    let v = if sig[64] >= 27 { sig[64] - 27 } else { sig[64] };
    if v > 1 { return None; }
    let mut msg = format!("\x19Ethereum Signed Message:\n{}", text.len()).into_bytes();
    msg.extend_from_slice(text.as_bytes());
    let pk = env::ecrecover(&env::keccak256_array(&msg), &sig[..64], v, true)?;
    Some(format!("0x{}", hex(&env::keccak256_array(&pk)[12..])))
}

/// sha256("ftf-chest-seed-1" || sha256(signature bytes) || block random seed)
pub fn season_seed(signature: &[u8], block_random: &[u8]) -> [u8; 32] {
    let mut m = b"ftf-chest-seed-1".to_vec();
    m.extend_from_slice(&env::sha256_array(signature));
    m.extend_from_slice(block_random);
    env::sha256_array(&m)
}

/// sha256(season seed || index u32 LE || block random seed)
pub fn draw_random(seed: &[u8], index: u32, block_random: &[u8]) -> [u8; 32] {
    let mut m = seed.to_vec();
    m.extend_from_slice(&index.to_le_bytes());
    m.extend_from_slice(block_random);
    env::sha256_array(&m)
}

pub fn tier_of(position: u32) -> Option<&'static str> {
    let mut b = 0;
    for (t, n) in TIERS { if position < b + n { return Some(t); } b += n; }
    None
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, season: String) -> Self {
        require!(!season.is_empty() && season.len() <= 16 && season.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()), "ERR_SEASON");
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(), name: format!("Forget to Foresee loot, season {}", season), symbol: "FTFLOOT".to_string(),
            icon: None, base_uri: None, reference: None, reference_hash: None,
        };
        Self {
            tokens: NonFungibleToken::new(StorageKey::NonFungibleToken, owner_id.clone(), Some(StorageKey::TokenMetadata), Some(StorageKey::Enumeration), None::<StorageKey>),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owner_id, season, openers: Vec::new(), root: None, deck_sha256: None, committed_block: None, seed: None, opened: 0, nft_minted: 0,
            moved: LookupMap::new(StorageKey::Moved), openings: LookupMap::new(StorageKey::Openings), by_account: LookupMap::new(StorageKey::ByAccount), daily: LookupMap::new(StorageKey::Daily),
        }
    }

    fn assert_owner(&self) { require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER); }

    pub fn add_opener(&mut self, account_id: AccountId) { self.assert_owner(); if !self.openers.contains(&account_id) { self.openers.push(account_id); } }
    pub fn remove_opener(&mut self, account_id: AccountId) { self.assert_owner(); self.openers.retain(|a| a != &account_id); }

    /// Commits the season deck's Merkle root and the sha256 of its canonical lines. Once, before the seed.
    pub fn commit_deck(&mut self, root: String, deck_sha256: String) {
        self.assert_owner();
        require!(self.root.is_none(), ERR_COMMITTED);
        require!(is_hex64(&root) && is_hex64(&deck_sha256), ERR_HEX);
        env::log_str(&format!("EVENT_JSON:{{\"standard\":\"ftf_chest\",\"version\":\"1.0.0\",\"event\":\"deck_committed\",\"data\":[{{\"season\":\"{}\",\"root\":\"{}\",\"deck_sha256\":\"{}\"}}]}}", self.season, root, deck_sha256));
        self.root = Some(root); self.deck_sha256 = Some(deck_sha256); self.committed_block = Some(env::block_height());
    }

    /// Fixes the season seed from a TEE-signed answer whose request names the committed root. Once.
    pub fn fix_seed(&mut self, request_body: String, signed_text: String, signature: String, signing_address: String) -> SeedRecord {
        self.assert_owner();
        let root = self.root.clone().unwrap_or_else(|| env::panic_str(ERR_NO_COMMIT));
        require!(self.seed.is_none(), ERR_SEEDED);
        require!(request_body.len() <= 2000 && signed_text.len() <= 220, "ERR_FIELD");
        require!(request_body.contains(&root), ERR_TEE_ROOT);
        let parts: Vec<&str> = signed_text.split(':').collect();
        let req_hash = match parts.len() { 2 => parts[0], 3 => parts[1], _ => env::panic_str(ERR_TEE_HASH) };
        require!(req_hash == hex(&env::sha256_array(request_body.as_bytes())), ERR_TEE_HASH);
        let addr = signing_address.to_ascii_lowercase();
        require!(recover_personal(&signed_text, &signature).as_deref() == Some(addr.as_str()), ERR_TEE_SIG);
        let sig = unhex(signature.strip_prefix("0x").unwrap_or(&signature)).unwrap_or_default();
        let br = env::random_seed_array();
        let seed = season_seed(&sig, &br);
        let rec = SeedRecord { seed: hex(&seed), request_body, signed_text, signature, signing_address: addr, block_random: hex(&br), block: U64(env::block_height()) };
        env::log_str(&format!("EVENT_JSON:{{\"standard\":\"ftf_chest\",\"version\":\"1.0.0\",\"event\":\"seed_fixed\",\"data\":[{{\"season\":\"{}\",\"seed\":\"{}\",\"signing_address\":\"{}\"}}]}}", self.season, rec.seed, rec.signing_address));
        self.seed = Some(rec.clone());
        rec
    }

    /// Opens the next chest for `account_id` (an opener only). Returns the recorded opening.
    pub fn open_chest(&mut self, account_id: AccountId) -> Opening {
        require!(self.openers.contains(&env::predecessor_account_id()), ERR_NOT_OPENER);
        let seed = unhex(&self.seed.as_ref().unwrap_or_else(|| env::panic_str(ERR_NO_SEED)).seed).unwrap();
        require!(self.opened < DECK_SIZE, ERR_SOLD_OUT);
        let day = env::block_timestamp() / 86_400_000_000_000;
        let (d, n) = self.daily.get(&account_id).cloned().unwrap_or((day, 0));
        let n = if d == day { n } else { 0 };
        require!(n < DAILY_CAP, ERR_DAILY);
        self.daily.insert(account_id.clone(), (day, n + 1));

        let index = self.opened;
        let br = env::random_seed_array();
        let r = draw_random(&seed, index, &br);
        let remaining = DECK_SIZE - index;
        let j = (u64::from_le_bytes(r[..8].try_into().unwrap()) % remaining as u64) as u32;
        let at = |m: &LookupMap<u32, u32>, i: u32| m.get(&i).copied().unwrap_or(i);
        let position = at(&self.moved, j);
        let last = at(&self.moved, remaining - 1);
        self.moved.insert(j, last);
        if j != remaining - 1 { self.moved.remove(&(remaining - 1)); }
        self.opened += 1;

        let tier = tier_of(position);
        let mut token_id = None;
        if let Some(t) = tier {
            require!(self.nft_minted < NFT_SLOTS, "ERR_NFT_CAP");
            let id: TokenId = format!("{}-{}", self.season, index);
            let meta = TokenMetadata {
                title: Some(format!("Chest loot #{} ({})", index, t)),
                description: Some(format!("Season {} loot chest #{}: deck position {} ({} relic). Verify: tools/verify-chest.", self.season, index, position, t)),
                media: None, media_hash: None, copies: Some(1), issued_at: Some(env::block_timestamp_ms().to_string()), expires_at: None, starts_at: None, updated_at: None,
                extra: Some(format!("{{\"season\":\"{}\",\"index\":{},\"position\":{},\"tier\":\"{}\"}}", self.season, index, position, t)), reference: None, reference_hash: None,
            };
            self.tokens.internal_mint_with_refund(id.clone(), account_id.clone(), Some(meta), None);
            NftMint { owner_id: &account_id, token_ids: &[&id], memo: Some("loot chest") }.emit();
            self.nft_minted += 1;
            token_id = Some(id);
        }
        let stored = Stored { account_id: account_id.clone(), position, block_random: br, block: env::block_height(), at_ns: env::block_timestamp() };
        let o = self.expand(index, &stored);
        debug_assert_eq!(o.token_id, token_id);
        self.openings.insert(index, stored);
        let mut list = self.by_account.get(&account_id).cloned().unwrap_or_default();
        list.push(index);
        if list.len() > 100 { list.remove(0); } // the full history is in `openings`; this is the recent index per account
        self.by_account.insert(account_id.clone(), list);
        env::log_str(&format!("EVENT_JSON:{{\"standard\":\"ftf_chest\",\"version\":\"1.0.0\",\"event\":\"chest_opened\",\"data\":[{{\"season\":\"{}\",\"index\":{},\"account_id\":\"{}\",\"position\":{},\"nft\":{}}}]}}", self.season, index, account_id, position, o.nft));
        o
    }

    fn expand(&self, index: u32, s: &Stored) -> Opening {
        let seed = self.seed.as_ref().and_then(|x| unhex(&x.seed)).unwrap_or_default();
        let tier = tier_of(s.position);
        Opening { index, account_id: s.account_id.clone(), position: s.position, nft: tier.is_some(), tier: tier.map(|t| t.to_string()),
            token_id: tier.map(|_| format!("{}-{}", self.season, index)), random: hex(&draw_random(&seed, index, &s.block_random)), block_random: hex(&s.block_random),
            block: U64(s.block), at_ns: U64(s.at_ns) }
    }

    pub fn season_info(&self) -> SeasonInfo {
        SeasonInfo { season: self.season.clone(), root: self.root.clone(), deck_sha256: self.deck_sha256.clone(), committed_block: self.committed_block.map(U64), seed: self.seed.clone(),
            size: DECK_SIZE, nft_slots: NFT_SLOTS, opened: self.opened, nft_minted: self.nft_minted, daily_cap: DAILY_CAP }
    }
    pub fn get_opening(&self, index: u32) -> Option<Opening> { self.openings.get(&index).map(|s| self.expand(index, s)) }
    pub fn list_openings(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Opening> {
        let from = from_index.unwrap_or(0);
        let to = from.saturating_add(limit.unwrap_or(50).min(200)).min(self.opened);
        (from..to).filter_map(|i| self.openings.get(&i).map(|s| self.expand(i, s))).collect()
    }
    pub fn openings_of(&self, account_id: AccountId) -> Vec<Opening> {
        self.by_account.get(&account_id).cloned().unwrap_or_default().iter().rev().take(50).filter_map(|i| self.openings.get(i).map(|s| self.expand(*i, s))).collect()
    }
    pub fn get_openers(&self) -> Vec<AccountId> { self.openers.clone() }
    pub fn owner(&self) -> AccountId { self.owner_id.clone() }
}

near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata { self.metadata.get().unwrap() }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests;
