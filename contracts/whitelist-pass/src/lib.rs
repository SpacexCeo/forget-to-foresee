#![allow(deprecated)] // near_sdk::collections (write-through sets) and the standard's trait impls
//! Forget to Foresee: the whitelist pass (docs/whitelist-pass.md; story TZ §11.2).
//!
//! A free NEP-171 token (+ NEP-177 metadata, + NEP-181 enumeration) that the game's relayer mints to a player's NEAR
//! wallet after it has verified, from the replayed expedition log, that the player paid 10,000 town silk at the
//! Gate-Loom. The pass is TRANSFERABLE (standard `nft_transfer` / `nft_transfer_call`, 1 yoctoNEAR, only by its
//! holder); there are NO approvals (NEP-178 absent: any call that passes an `approval_id` panics), NO royalties, no burn.
//!
//! Limits enforced here, on chain: only `minter_id` can mint (`mint_pass`, zero deposit, the minter can be a
//! function-call key); a total `cap` and a UTC-day `daily_cap`; ONE MINT PER WALLET EVER (`minted_to` keeps every
//! first receiver and is never pruned, so a wallet that sent its pass away cannot be minted another); `claim_id`
//! idempotency (a server that lost its state cannot mint twice for one claim); storage is paid by the contract and a
//! mint or a transfer that would leave less than `RESERVE` available fails.
//!
//! The owner can only `set_minter`, `pause` / `unpause` (minting only: holders can always transfer) and `set_media`.
//! The owner cannot mint, move funds, upgrade, freeze or seize a token. Once the contract account's keys are deleted
//! (owner-gated runbook, docs/mainnet-pass-runbook.md) the code cannot change.
use near_contract_standards::non_fungible_token::core::{NonFungibleTokenCore, NonFungibleTokenResolver};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::collections::LookupSet; // writes through at once: the storage reserve check below sees every byte
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue};
use std::collections::HashMap;

pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the contract owner can call this";
pub const ERR_NOT_MINTER: &str = "ERR_NOT_MINTER: only the minter can mint";
pub const ERR_PAUSED: &str = "ERR_PAUSED: minting is paused";
pub const ERR_SOLD_OUT: &str = "ERR_SOLD_OUT: every pass is minted";
pub const ERR_DAILY_CAP: &str = "ERR_DAILY_CAP: today's passes are all minted";
pub const ERR_WALLET_MINTED: &str = "ERR_WALLET_MINTED: a pass was already minted to this wallet";
pub const ERR_CLAIM_ID: &str = "ERR_CLAIM_ID: claim_id is 64 lowercase hex characters";
pub const ERR_CLAIM_USED: &str = "ERR_CLAIM_USED: this claim was already minted";
pub const ERR_NO_APPROVALS: &str = "ERR_NO_APPROVALS: this contract has no approvals";
pub const ERR_LOW_BALANCE: &str = "ERR_LOW_BALANCE: the contract would drop below its storage reserve";
pub const ERR_DEPOSIT: &str = "ERR_DEPOSIT: mint_pass takes no deposit";
pub const ERR_CAPS: &str = "ERR_CAPS: need 0 < daily_cap <= cap <= 10000";

/// Available balance the contract keeps after any mint or transfer (0.05 NEAR).
pub const RESERVE: NearToken = NearToken::from_millinear(50);
const NANOS_PER_DAY: u64 = 86_400_000_000_000;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey { OwnerById, Metadata, TokenMetadata, Enumeration, MintedTo, ClaimIds }

#[near(serializers = [json])]
pub struct PassInfo {
    pub owner_id: AccountId,
    pub minter_id: AccountId,
    pub cap: u32,
    pub daily_cap: u32,
    pub minted: u32,
    /// Passes minted on the current UTC day.
    pub minted_today: u32,
    pub paused: bool,
    pub media: Option<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    minter_id: AccountId,
    cap: u32,
    daily_cap: u32,
    minted: u32,
    day_index: u64,
    day_count: u32,
    paused: bool,
    media: Option<String>,
    /// Every receiver at mint time; never removed (one mint per wallet ever, also after a transfer).
    minted_to: LookupSet<AccountId>,
    claim_ids: LookupSet<String>,
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
}

fn is_claim_id(s: &str) -> bool { s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, minter_id: AccountId, cap: u32, daily_cap: u32) -> Self {
        require!(cap > 0 && cap <= 10_000 && daily_cap > 0 && daily_cap <= cap, ERR_CAPS);
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(), name: "Forget to Foresee Whitelist Pass".to_string(), symbol: "FTFPASS".to_string(),
            icon: None, base_uri: None, reference: None, reference_hash: None,
        };
        Self {
            owner_id: owner_id.clone(), minter_id, cap, daily_cap, minted: 0, day_index: 0, day_count: 0, paused: false, media: None,
            minted_to: LookupSet::new(StorageKey::MintedTo),
            claim_ids: LookupSet::new(StorageKey::ClaimIds),
            // no approvals: the approval prefix is None, so the standard keeps no approval map
            tokens: NonFungibleToken::new(StorageKey::OwnerById, owner_id, Some(StorageKey::TokenMetadata), Some(StorageKey::Enumeration), None::<StorageKey>),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
        }
    }

    fn assert_owner(&self) { require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER); }

    /// Balance not locked by storage.
    fn available(&self) -> u128 {
        let locked = env::storage_byte_cost().as_yoctonear() * env::storage_usage() as u128;
        env::account_balance().as_yoctonear().saturating_sub(locked)
    }
    fn assert_reserve(&self) { require!(self.available() >= RESERVE.as_yoctonear(), ERR_LOW_BALANCE); }

    fn today(&self) -> u64 { env::block_timestamp() / NANOS_PER_DAY }
    fn minted_today(&self) -> u32 { if self.day_index == self.today() { self.day_count } else { 0 } }

    /// With the media shared by every pass, it is stored once (here) and put on each token as it is read.
    fn dress(&self, mut t: Token) -> Token {
        if let Some(m) = t.metadata.as_mut() { m.media = self.media.clone(); }
        t
    }

    // ---------------------------------------------------------------- owner

    pub fn set_minter(&mut self, minter_id: AccountId) { self.assert_owner(); self.minter_id = minter_id; }
    /// Stops minting only: holders can always transfer.
    pub fn pause(&mut self) { self.assert_owner(); self.paused = true; }
    pub fn unpause(&mut self) { self.assert_owner(); self.paused = false; }
    pub fn set_media(&mut self, media: Option<String>) { self.assert_owner(); self.media = media; }

    // ---------------------------------------------------------------- minter

    /// The only mint path: one pass to `receiver_id` for the relayer's `claim_id` (64 lowercase hex). Zero deposit:
    /// the contract pays the storage, so the minter can be a function-call key restricted to this method.
    pub fn mint_pass(&mut self, receiver_id: AccountId, claim_id: String) -> Token {
        require!(env::predecessor_account_id() == self.minter_id, ERR_NOT_MINTER);
        require!(env::attached_deposit().is_zero(), ERR_DEPOSIT);
        require!(!self.paused, ERR_PAUSED);
        require!(self.minted < self.cap, ERR_SOLD_OUT);
        let today = self.today();
        if self.day_index != today { self.day_index = today; self.day_count = 0; }
        require!(self.day_count < self.daily_cap, ERR_DAILY_CAP);
        require!(!self.minted_to.contains(&receiver_id), ERR_WALLET_MINTED);
        require!(is_claim_id(&claim_id), ERR_CLAIM_ID);
        require!(!self.claim_ids.contains(&claim_id), ERR_CLAIM_USED);
        let n = self.minted + 1;
        let id: TokenId = n.to_string();
        let meta = TokenMetadata {
            title: Some(format!("FTF Whitelist Pass #{}", n)),
            description: Some("Gives its holder a free NFT mint at the official Forget to Foresee launch. The right follows whoever holds the pass at that time. No monetary value is promised.".to_string()),
            media: None, media_hash: None, copies: None, issued_at: Some(env::block_timestamp_ms().to_string()),
            expires_at: None, starts_at: None, updated_at: None,
            extra: Some(format!("{{\"board_season\":1,\"claim\":\"{}\"}}", claim_id)), reference: None, reference_hash: None,
        };
        let token = self.tokens.internal_mint_with_refund(id.clone(), receiver_id.clone(), Some(meta), None);
        self.minted_to.insert(&receiver_id);
        self.claim_ids.insert(&claim_id);
        self.minted = n;
        self.day_count += 1;
        self.assert_reserve();
        NftMint { owner_id: &receiver_id, token_ids: &[&id], memo: Some("whitelist pass") }.emit();
        self.dress(token)
    }

    // ---------------------------------------------------------------- views

    pub fn pass_info(&self) -> PassInfo {
        PassInfo { owner_id: self.owner_id.clone(), minter_id: self.minter_id.clone(), cap: self.cap, daily_cap: self.daily_cap, minted: self.minted, minted_today: self.minted_today(), paused: self.paused, media: self.media.clone() }
    }
    /// True for every wallet a pass was ever minted to (stays true after it sent the pass away).
    pub fn has_minted(&self, account_id: AccountId) -> bool { self.minted_to.contains(&account_id) }
    /// True while the account holds at least one pass (one allowlist spot however many it holds).
    pub fn is_whitelisted(&self, account_id: AccountId) -> bool { self.nft_supply_for_owner(account_id).0 > 0 }
    pub fn is_claimed(&self, claim_id: String) -> bool { self.claim_ids.contains(&claim_id) }
    pub fn minter(&self) -> AccountId { self.minter_id.clone() }
    pub fn owner(&self) -> AccountId { self.owner_id.clone() }
    pub fn paused(&self) -> bool { self.paused }
}

#[near]
impl NonFungibleTokenCore for Contract {
    /// Standard NEP-171 transfer by the holder (1 yoctoNEAR). No approvals: an `approval_id` panics.
    #[payable]
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        require!(approval_id.is_none(), ERR_NO_APPROVALS);
        self.tokens.nft_transfer(receiver_id, token_id, None, memo);
        self.assert_reserve();
    }

    #[payable]
    fn nft_transfer_call(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>, msg: String) -> PromiseOrValue<bool> {
        require!(approval_id.is_none(), ERR_NO_APPROVALS);
        let r = self.tokens.nft_transfer_call(receiver_id, token_id, None, memo, msg);
        self.assert_reserve();
        r
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> { self.tokens.nft_token(token_id).map(|t| self.dress(t)) }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(&mut self, previous_owner_id: AccountId, receiver_id: AccountId, token_id: TokenId, approved_account_ids: Option<HashMap<AccountId, u64>>) -> bool {
        self.tokens.nft_resolve_transfer(previous_owner_id, receiver_id, token_id, approved_account_ids)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 { self.tokens.nft_total_supply() }
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit).into_iter().map(|t| self.dress(t)).collect()
    }
    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 { self.tokens.nft_supply_for_owner(account_id) }
    fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens_for_owner(account_id, from_index, limit).into_iter().map(|t| self.dress(t)).collect()
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata { self.metadata.get().unwrap() }
}

#[cfg(all(test, not(target_family = "wasm")))]
mod tests;
