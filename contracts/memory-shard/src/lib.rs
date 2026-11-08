//! Forget to Foresee: memory shards as NEP-171 NFTs (NEAR testnet only).
//!
//! A forgotten memory becomes a shard (the Price of Memory) and goes to the clans' auction. The season
//! coordinator mints one token per shard to the auction winner's account; the token records the season id,
//! the memory's kind and weight, the trial it was forgotten, the auction result and the Merkle leaf of the
//! season event the vision unlocked (so the shard is tied to the season committed in `season-commit`), and
//! carries a deterministic ink-ring SVG as its media. NEP-171 core, NEP-177 metadata and NEP-181 enumeration
//! come from near-contract-standards; approvals (NEP-178) are not enabled (a shard moves only by `nft_transfer`
//! of its owner). Storage is paid by the minting coordinator's attached deposit; the rest is refunded.
#![allow(deprecated)] // the standard's NEP-171 / NEP-181 macros generate the canonical methods; hand-written impls would be the same code

use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U64;
use near_sdk::store::{IterableSet, LookupMap};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault, PromiseOrValue};

pub mod image;
pub use image::ShardData;

pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the owner can call this method";
pub const ERR_NOT_COORDINATOR: &str = "ERR_NOT_COORDINATOR: only an authorized coordinator can mint";
pub const ERR_TOKEN_EXISTS: &str = "ERR_TOKEN_EXISTS: this shard is already minted";
pub const ERR_NOT_A_COORDINATOR: &str = "ERR_NOT_A_COORDINATOR: account is not a coordinator";
pub const ERR_SEASON_ROOT: &str = "ERR_SEASON_ROOT: every shard of a season must carry the same schedule root";
pub const MAX_LIMIT: u32 = 100;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Coordinators,
    Shards,
    SeasonTokens,
    SeasonCount,
    SeasonRoot,
}

#[near(serializers = [borsh])]
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct SeasonSlot {
    pub season_id: String,
    pub n: u32,
}

/// A shard with its owner and metadata, as views return it.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShardView {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub data: ShardData,
    pub minted_at_ns: U64,
    pub minted_at_block: U64,
    pub minted_by: AccountId,
    pub metadata: Option<TokenMetadata>,
}

#[near(serializers = [borsh])]
pub struct ShardRecord {
    pub data: ShardData,
    pub minted_at_ns: u64,
    pub minted_at_block: u64,
    pub minted_by: AccountId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    coordinators: IterableSet<AccountId>,
    /// The season-commit contract this collection refers to (informational; the leaf and root in a shard can be
    /// checked there with `get_season` / `get_revealed_leaf`).
    season_contract: Option<AccountId>,
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    shards: LookupMap<TokenId, ShardRecord>,
    season_tokens: LookupMap<SeasonSlot, TokenId>,
    season_count: LookupMap<String, u32>,
    season_root: LookupMap<String, String>,
}

fn fail(msg: &str) -> ! {
    env::panic_str(msg)
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, coordinators: Vec<AccountId>, season_contract: Option<AccountId>) -> Self {
        let mut set = IterableSet::new(StorageKey::Coordinators);
        for c in coordinators {
            set.insert(c);
        }
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Forget to Foresee: Memory Shards".to_string(),
            symbol: "FTFSHARD".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        };
        metadata.assert_valid();
        Self {
            tokens: NonFungibleToken::new(StorageKey::NonFungibleToken, owner_id.clone(), Some(StorageKey::TokenMetadata), Some(StorageKey::Enumeration), None::<StorageKey>),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owner_id,
            coordinators: set,
            season_contract,
            shards: LookupMap::new(StorageKey::Shards),
            season_tokens: LookupMap::new(StorageKey::SeasonTokens),
            season_count: LookupMap::new(StorageKey::SeasonCount),
            season_root: LookupMap::new(StorageKey::SeasonRoot),
        }
    }

    /* ---------- coordinator ---------- */

    /// Mints the NFT of one shard to `receiver_id` (the auction winner's account, or the coordinator's vault for an
    /// AI clan). Coordinator only; token id = `<season_id>-<shard_id>`, once. Attach a storage deposit (0.1 NEAR is
    /// plenty: the SVG lives on-chain); the unused part is refunded to the caller.
    #[payable]
    pub fn mint_shard(&mut self, receiver_id: AccountId, shard: ShardData) -> Token {
        self.assert_coordinator();
        if let Err(e) = shard.validate() {
            fail(e);
        }
        let token_id = shard.token_id();
        if self.shards.contains_key(&token_id) || self.tokens.owner_by_id.contains_key(&token_id) {
            fail(ERR_TOKEN_EXISTS);
        }
        match self.season_root.get(&shard.season_id) {
            Some(root) if root != &shard.schedule_root => fail(ERR_SEASON_ROOT),
            Some(_) => {}
            None => {
                self.season_root.insert(shard.season_id.clone(), shard.schedule_root.clone());
            }
        }
        let parts = image::metadata_parts(&shard);
        let metadata = TokenMetadata {
            title: Some(parts.title),
            description: Some(parts.description),
            media: Some(parts.media),
            media_hash: Some(parts.media_hash),
            copies: Some(1),
            issued_at: Some((env::block_timestamp() / 1_000_000).to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(parts.extra),
            reference: None,
            reference_hash: None,
        };
        let n = self.season_count.get(&shard.season_id).copied().unwrap_or(0);
        self.season_tokens.insert(SeasonSlot { season_id: shard.season_id.clone(), n }, token_id.clone());
        self.season_count.insert(shard.season_id.clone(), n + 1);
        self.shards.insert(
            token_id.clone(),
            ShardRecord { data: shard, minted_at_ns: env::block_timestamp(), minted_at_block: env::block_height(), minted_by: env::predecessor_account_id() },
        );
        self.shards.flush();
        self.season_tokens.flush();
        self.season_count.flush();
        self.season_root.flush();
        // internal_mint charges the storage of the token (and, measured from here, of the records above) to the
        // attached deposit, refunds the rest to the predecessor and emits the NEP-171 nft_mint event.
        self.tokens.internal_mint(token_id, receiver_id, Some(metadata))
    }

    /* ---------- owner ---------- */

    #[payable]
    pub fn add_coordinator(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.coordinators.insert(account_id);
    }

    #[payable]
    pub fn remove_coordinator(&mut self, account_id: AccountId) {
        self.assert_owner();
        require!(self.coordinators.remove(&account_id), ERR_NOT_A_COORDINATOR);
    }

    /* ---------- views ---------- */

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn get_coordinators(&self) -> Vec<AccountId> {
        self.coordinators.iter().cloned().collect()
    }

    pub fn is_coordinator(&self, account_id: AccountId) -> bool {
        self.coordinators.contains(&account_id)
    }

    pub fn season_commit_contract(&self) -> Option<AccountId> {
        self.season_contract.clone()
    }

    pub fn shard_spec(&self) -> String {
        image::SPEC.to_string()
    }

    pub fn get_shard(&self, token_id: TokenId) -> Option<ShardView> {
        let r = self.shards.get(&token_id)?;
        let owner_id = self.tokens.owner_by_id.get(&token_id)?;
        Some(ShardView {
            token_id: token_id.clone(),
            owner_id,
            data: r.data.clone(),
            minted_at_ns: U64(r.minted_at_ns),
            minted_at_block: U64(r.minted_at_block),
            minted_by: r.minted_by.clone(),
            metadata: self.tokens.token_metadata_by_id.as_ref().and_then(|m| m.get(&token_id)),
        })
    }

    /// The SVG of a shard, as the browser also renders it.
    pub fn shard_svg(&self, token_id: TokenId) -> Option<String> {
        self.shards.get(&token_id).map(|r| image::svg(&r.data))
    }

    pub fn season_shard_count(&self, season_id: String) -> u32 {
        self.season_count.get(&season_id).copied().unwrap_or(0)
    }

    /// The schedule root every shard of this season carries (None before the first mint).
    pub fn season_schedule_root(&self, season_id: String) -> Option<String> {
        self.season_root.get(&season_id).cloned()
    }

    /// Shards of a season in mint order, from `from_index` (default 0), at most `limit` (default and maximum 100).
    pub fn shards_of_season(&self, season_id: String, from_index: Option<u32>, limit: Option<u32>) -> Vec<ShardView> {
        let total = self.season_shard_count(season_id.clone());
        let from = from_index.unwrap_or(0);
        let to = from.saturating_add(limit.unwrap_or(MAX_LIMIT).min(MAX_LIMIT)).min(total);
        (from..to)
            .filter_map(|n| self.season_tokens.get(&SeasonSlot { season_id: season_id.clone(), n }))
            .filter_map(|id| self.get_shard(id.clone()))
            .collect()
    }

    /// The metadata the contract would mint for this data, without minting (free view; validates the data).
    pub fn preview_shard(&self, shard: ShardData) -> TokenMetadata {
        if let Err(e) = shard.validate() {
            fail(e);
        }
        let parts = image::metadata_parts(&shard);
        TokenMetadata {
            title: Some(parts.title),
            description: Some(parts.description),
            media: Some(parts.media),
            media_hash: Some(parts.media_hash),
            copies: Some(1),
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(parts.extra),
            reference: None,
            reference_hash: None,
        }
    }
}

impl Contract {
    fn assert_owner(&self) {
        near_sdk::assert_one_yocto();
        require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER);
    }

    fn assert_coordinator(&self) {
        require!(self.coordinators.contains(&env::predecessor_account_id()), ERR_NOT_COORDINATOR);
    }
}

// The standard's macros still generate the canonical NEP-171 / NEP-181 methods; they are marked deprecated in favour
// of hand-written trait impls, which would be the same code.
near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod vector_tests;

#[cfg(all(test, not(any(windows, target_family = "wasm"))))]
mod tests;
