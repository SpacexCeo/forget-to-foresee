#![allow(deprecated)] // the standard's NEP-171 / NEP-181 macros generate the canonical methods
//! Forget to Foresee (NEAR testnet): one capped NFT skin series, e.g. `sheriffchenko`, the wheel of fortune's grand
//! prize (game/src/game/wheel.js). An authorized minter (the relayer, after it re-derived the winning roll) mints one
//! token to a player's Day 1 guest account. Hard cap (100 for Sheriffchenko), one mint per account, storage paid by
//! the contract. The art is a placeholder until it exists: the owner can replace the media URL on every token.
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::LazyOption;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault, PromiseOrValue};

pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the contract owner can call this";
pub const ERR_NOT_MINTER: &str = "ERR_NOT_MINTER: only an authorized minter can mint";
pub const ERR_SOLD_OUT: &str = "ERR_SOLD_OUT: every token of this skin is minted";
pub const ERR_OWNED: &str = "ERR_OWNED: this account already has this skin";
pub const ERR_CLAIM: &str = "ERR_CLAIM: claim is 1-64 characters";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey { NonFungibleToken, Metadata, TokenMetadata, Enumeration, Owners }

#[near(serializers = [json])]
pub struct SkinInfo { pub skin: String, pub title: String, pub cap: u32, pub minted: u32, pub left: u32, pub media: Option<String> }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    minters: Vec<AccountId>,
    skin: String,
    title: String,
    cap: u32,
    minted: u32,
    media: Option<String>,
    owners: LookupMap<AccountId, TokenId>,
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, skin: String, title: String, cap: u32, media: Option<String>) -> Self {
        require!(!skin.is_empty() && skin.len() <= 24 && skin.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()), "ERR_SKIN");
        require!(cap > 0 && cap <= 10_000, "ERR_CAP");
        let metadata = NFTContractMetadata { spec: NFT_METADATA_SPEC.to_string(), name: format!("Forget to Foresee skin: {}", title), symbol: "FTFSKIN".to_string(), icon: None, base_uri: None, reference: None, reference_hash: None };
        Self {
            tokens: NonFungibleToken::new(StorageKey::NonFungibleToken, owner_id.clone(), Some(StorageKey::TokenMetadata), Some(StorageKey::Enumeration), None::<StorageKey>),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owners: LookupMap::new(StorageKey::Owners),
            owner_id, minters: Vec::new(), skin, title, cap, minted: 0, media,
        }
    }

    fn assert_owner(&self) { require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER); }
    pub fn add_minter(&mut self, account_id: AccountId) { self.assert_owner(); if !self.minters.contains(&account_id) { self.minters.push(account_id); } }
    pub fn remove_minter(&mut self, account_id: AccountId) { self.assert_owner(); self.minters.retain(|a| a != &account_id); }
    pub fn minters(&self) -> Vec<AccountId> { self.minters.clone() }

    fn meta(&self, n: u32, claim: &str) -> TokenMetadata {
        TokenMetadata {
            title: Some(format!("{} #{}", self.title, n)),
            description: Some(format!("The wheel of fortune's grand prize in Forget to Foresee: {} skin, {} of {} (NEAR testnet, no real money).", self.title, n, self.cap)),
            media: self.media.clone(), media_hash: None, copies: Some(self.cap as u64), issued_at: Some(env::block_timestamp_ms().to_string()),
            expires_at: None, starts_at: None, updated_at: None,
            extra: Some(format!("{{\"skin\":\"{}\",\"n\":{},\"claim\":\"{}\"}}", self.skin, n, claim)), reference: None, reference_hash: None,
        }
    }

    /// Mints the next token of the series to `receiver_id` (minters only). `claim` records what won it (the wheel seed).
    pub fn mint_skin(&mut self, receiver_id: AccountId, claim: String) -> Token {
        require!(self.minters.contains(&env::predecessor_account_id()), ERR_NOT_MINTER);
        require!(!claim.is_empty() && claim.len() <= 64 && claim.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'), ERR_CLAIM);
        require!(self.minted < self.cap, ERR_SOLD_OUT);
        require!(self.owners.get(&receiver_id).is_none(), ERR_OWNED);
        let n = self.minted + 1;
        let id: TokenId = format!("{}-{}", self.skin, n);
        let token = self.tokens.internal_mint_with_refund(id.clone(), receiver_id.clone(), Some(self.meta(n, &claim)), None);
        NftMint { owner_id: &receiver_id, token_ids: &[&id], memo: Some("wheel grand prize") }.emit();
        self.minted = n;
        self.owners.insert(receiver_id, id);
        token
    }

    /// Replaces the media URL (the art arrives later) on the series and on every minted token.
    pub fn set_media(&mut self, media: Option<String>) {
        self.assert_owner();
        self.media = media.clone();
        if let Some(by_id) = self.tokens.token_metadata_by_id.as_mut() {
            for n in 1..=self.minted {
                let id = format!("{}-{}", self.skin, n);
                if let Some(mut m) = by_id.get(&id) { m.media = media.clone(); by_id.insert(&id, &m); }
            }
        }
    }

    pub fn skin_info(&self) -> SkinInfo { SkinInfo { skin: self.skin.clone(), title: self.title.clone(), cap: self.cap, minted: self.minted, left: self.cap - self.minted, media: self.media.clone() } }
    pub fn skin_of(&self, account_id: AccountId) -> Option<TokenId> { self.owners.get(&account_id).cloned() }
    pub fn owner(&self) -> AccountId { self.owner_id.clone() }
}

near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata { self.metadata.get().unwrap() }
}

#[cfg(all(test, not(target_family = "wasm")))]
mod tests;
