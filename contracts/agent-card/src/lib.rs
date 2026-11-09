//! Forget to Foresee: the agent card, one NEP-171 NFT per (season, agent) that records the agent's end-of-season
//! state (NEAR testnet only).
//!
//! At the end of a season the coordinator mints one card for an agent (for the hackathon: Iris in the judge season).
//! The card stores the agent's canonical state (traits, biography, outcome; `state.rs`), and the contract itself
//! recomputes its state hash (sha256 of the canonical JSON, which is also the token's NEP-177 `extra`) and refuses a
//! mint whose declared hash differs. The state carries the season's schedule root, which anyone can compare with the
//! root committed on the season-commit contract (`get_season` there), and the token ids of the memory shards the agent
//! forgot (memory-shard contract). The image is a deterministic SVG rendered on-chain (`image.rs`), byte-identical to
//! the game's `agentSvg()`. Cards are immutable: there is no update method; NEP-171 transfers move ownership only.
//! Approvals (NEP-178) are not enabled. Storage is paid by the minting coordinator's attached deposit, measured over
//! the whole mint; the unused part is refunded.
#![allow(deprecated)] // the standard's NEP-171 / NEP-181 macros generate the canonical methods; hand-written impls would be the same code

use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC};
use near_contract_standards::non_fungible_token::{refund_deposit, NonFungibleToken, Token, TokenId};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U64;
use near_sdk::store::{IterableSet, LookupMap};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault, PromiseOrValue};

pub mod image;
pub mod state;
pub use state::AgentState;

pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the owner can call this method";
pub const ERR_NOT_COORDINATOR: &str = "ERR_NOT_COORDINATOR: only an authorized coordinator can mint";
pub const ERR_NOT_A_COORDINATOR: &str = "ERR_NOT_A_COORDINATOR: account is not a coordinator";
pub const ERR_TOKEN_EXISTS: &str = "ERR_TOKEN_EXISTS: this season already has a card for this agent";
pub const ERR_STATE_HASH: &str = "ERR_STATE_HASH: state_hash is not sha256 of the canonical state JSON";
pub const ERR_SEASON_ROOT: &str = "ERR_SEASON_ROOT: every card of a season must carry the same schedule root";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Coordinators,
    Agents,
    SeasonRoot,
}

#[near(serializers = [borsh])]
pub struct AgentRecord {
    pub state: AgentState,
    pub state_hash: String,
    pub minted_at_ns: u64,
    pub minted_at_block: u64,
    pub minted_by: AccountId,
}

/// A card with its owner and metadata, as views return it.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentView {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub state: AgentState,
    /// sha256 (hex) of the canonical state JSON = sha256 of `metadata.extra`.
    pub state_hash: String,
    pub minted_at_ns: U64,
    pub minted_at_block: U64,
    pub minted_by: AccountId,
    pub metadata: Option<TokenMetadata>,
}

/// What `mint_agent` would store, without minting.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentPreview {
    pub token_id: TokenId,
    pub state_hash: String,
    pub metadata: TokenMetadata,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    coordinators: IterableSet<AccountId>,
    /// The season-commit contract whose committed roots the cards carry (informational: compare `get_season` there).
    season_contract: Option<AccountId>,
    /// The memory-shard contract whose token ids the biographies list (informational).
    shard_contract: Option<AccountId>,
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    agents: LookupMap<TokenId, AgentRecord>,
    season_root: LookupMap<String, String>,
}

fn fail(msg: &str) -> ! {
    env::panic_str(msg)
}

fn token_metadata(state: &AgentState, issued_at: Option<String>) -> (TokenMetadata, String) {
    let parts = image::metadata_parts(state);
    (
        TokenMetadata {
            title: Some(parts.title),
            description: Some(parts.description),
            media: Some(parts.media),
            media_hash: Some(parts.media_hash),
            copies: Some(1),
            issued_at,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(parts.extra),
            reference: None,
            reference_hash: None,
        },
        parts.state_hash,
    )
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, coordinators: Vec<AccountId>, season_contract: Option<AccountId>, shard_contract: Option<AccountId>) -> Self {
        let mut set = IterableSet::new(StorageKey::Coordinators);
        for c in coordinators {
            set.insert(c);
        }
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Forget to Foresee: Agent Cards".to_string(),
            symbol: "FTFAGENT".to_string(),
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
            shard_contract,
            agents: LookupMap::new(StorageKey::Agents),
            season_root: LookupMap::new(StorageKey::SeasonRoot),
        }
    }

    /* ---------- coordinator ---------- */

    /// Mints the card of one agent for one season to `receiver_id`. Coordinator only; token id
    /// `<season_id>-agent-<agent>`, once. The contract validates the state, recomputes its hash and refuses the mint
    /// unless it equals `state_hash`. Attach a storage deposit (0.5 NEAR is plenty: the image lives on-chain); the
    /// whole mint's storage is charged and the rest refunded to the caller. Emits the standard `nft_mint` event.
    #[payable]
    pub fn mint_agent(&mut self, receiver_id: AccountId, state: AgentState, state_hash: String) -> Token {
        self.assert_coordinator();
        let initial_storage = env::storage_usage();
        if let Err(e) = state.validate() {
            fail(e);
        }
        let token_id = state.token_id();
        if self.agents.contains_key(&token_id) || self.tokens.owner_by_id.contains_key(&token_id) {
            fail(ERR_TOKEN_EXISTS);
        }
        match self.season_root.get(&state.season_id) {
            Some(root) if root != &state.schedule_root => fail(ERR_SEASON_ROOT),
            Some(_) => {}
            None => {
                self.season_root.insert(state.season_id.clone(), state.schedule_root.clone());
            }
        }
        let (metadata, computed) = token_metadata(&state, Some((env::block_timestamp() / 1_000_000).to_string()));
        if computed != state_hash {
            fail(ERR_STATE_HASH);
        }
        self.agents.insert(
            token_id.clone(),
            AgentRecord { state, state_hash: computed, minted_at_ns: env::block_timestamp(), minted_at_block: env::block_height(), minted_by: env::predecessor_account_id() },
        );
        self.agents.flush();
        self.season_root.flush();
        let token = self.tokens.internal_mint_with_refund(token_id, receiver_id, Some(metadata), None);
        NftMint { owner_id: &token.owner_id, token_ids: &[&token.token_id], memo: None }.emit();
        // Charge everything this mint stored (the record, the season root, the token, its metadata and enumeration
        // entries) to the attached deposit; refund the rest to the coordinator.
        refund_deposit(env::storage_usage().saturating_sub(initial_storage));
        token
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

    pub fn shard_contract(&self) -> Option<AccountId> {
        self.shard_contract.clone()
    }

    pub fn agent_spec(&self) -> String {
        state::SPEC.to_string()
    }

    pub fn get_agent(&self, token_id: TokenId) -> Option<AgentView> {
        let r = self.agents.get(&token_id)?;
        let owner_id = self.tokens.owner_by_id.get(&token_id)?;
        Some(AgentView {
            token_id: token_id.clone(),
            owner_id,
            state: r.state.clone(),
            state_hash: r.state_hash.clone(),
            minted_at_ns: U64(r.minted_at_ns),
            minted_at_block: U64(r.minted_at_block),
            minted_by: r.minted_by.clone(),
            metadata: self.tokens.token_metadata_by_id.as_ref().and_then(|m| m.get(&token_id)),
        })
    }

    /// The card of `agent` for `season_id`, or None.
    pub fn agent_of_season(&self, season_id: String, agent: String) -> Option<AgentView> {
        self.get_agent(format!("{season_id}-agent-{agent}"))
    }

    /// The card's image, as the browser also renders it.
    pub fn agent_svg(&self, token_id: TokenId) -> Option<String> {
        self.agents.get(&token_id).map(|r| image::svg(&r.state))
    }

    /// The schedule root the cards of this season carry (None before the first mint).
    pub fn season_schedule_root(&self, season_id: String) -> Option<String> {
        self.season_root.get(&season_id).cloned()
    }

    /// Free dry run of `mint_agent`: validates the state and returns the token id, the state hash and the metadata the
    /// contract would mint.
    pub fn preview_agent(&self, state: AgentState) -> AgentPreview {
        if let Err(e) = state.validate() {
            fail(e);
        }
        let (metadata, state_hash) = token_metadata(&state, None);
        AgentPreview { token_id: state.token_id(), state_hash, metadata }
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
