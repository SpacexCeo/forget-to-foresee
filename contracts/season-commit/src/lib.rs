//! Forget to Foresee: season schedule commitment contract (NEAR testnet).
//!
//! * A coordinator commits a season's schedule Merkle root before play (`commit_season`).
//!   The commitment is immutable.
//! * Anyone holding a revealed event and its salt can submit it with its Merkle path
//!   (`reveal_leaf`). The contract recomputes the leaf exactly as the game does, folds the
//!   path, and records the event only if it lands on the committed root.
//! * Ash's secret phrase has its own salted commitment (`commit_ash_key` / `reveal_ash_key`).
//!
//! Storage is paid by the caller of each state-changing method through the attached
//! deposit; the unused part is refunded in the same call.

use near_sdk::json_types::U64;
use near_sdk::store::{IterableSet, LookupMap};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

pub mod proof;

pub use proof::{CanonicalEvent, PathStep};
use proof::Hash;

pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the owner can call this method";
pub const ERR_NOT_COORDINATOR: &str = "ERR_NOT_COORDINATOR: only an authorized coordinator can commit";
pub const ERR_SEASON_EXISTS: &str = "ERR_SEASON_EXISTS: this season is already committed and cannot be changed";
pub const ERR_SEASON_NOT_COMMITTED: &str = "ERR_SEASON_NOT_COMMITTED: no commitment for this season";
pub const ERR_BAD_LEAF_COUNT: &str = "ERR_BAD_LEAF_COUNT: leaf_count must be 1-1024";
pub const ERR_ROOT_MISMATCH: &str = "ERR_ROOT_MISMATCH: the proof does not lead to the committed schedule root";
pub const ERR_ALREADY_REVEALED: &str = "ERR_ALREADY_REVEALED: this leaf is already recorded";
pub const ERR_ASH_KEY_EXISTS: &str = "ERR_ASH_KEY_EXISTS: Ash's key is already committed for this season";
pub const ERR_ASH_KEY_NOT_COMMITTED: &str = "ERR_ASH_KEY_NOT_COMMITTED: no Ash key commitment for this season";
pub const ERR_ASH_KEY_MISMATCH: &str = "ERR_ASH_KEY_MISMATCH: phrase and salt do not match the commitment";
pub const ERR_ASH_KEY_REVEALED: &str = "ERR_ASH_KEY_REVEALED: Ash's key is already revealed";
pub const ERR_SEASON_STARTED: &str = "ERR_SEASON_STARTED: leaves are already revealed, commitments are closed";
pub const ERR_INSUFFICIENT_DEPOSIT: &str = "ERR_INSUFFICIENT_DEPOSIT: attach enough NEAR to cover storage";
pub const ERR_NOT_A_COORDINATOR: &str = "ERR_NOT_A_COORDINATOR: account is not a coordinator";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Coordinators,
    Seasons,
    Reveals,
    AshKeys,
}

#[near(serializers = [borsh])]
pub struct Season {
    pub schema_version: String,
    pub root: Hash,
    pub leaf_count: u32,
    pub committed_by: AccountId,
    pub committed_at_ns: u64,
    pub committed_at_block: u64,
    pub revealed_count: u32,
}

#[near(serializers = [borsh])]
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct RevealKey {
    pub season_id: String,
    pub index: u32,
}

#[near(serializers = [borsh])]
pub struct RevealedLeaf {
    pub leaf: Hash,
    pub event: CanonicalEvent,
    pub salt: Vec<u8>,
    pub revealed_by: AccountId,
    pub revealed_at_ns: u64,
    pub revealed_at_block: u64,
}

#[near(serializers = [borsh])]
pub struct AshReveal {
    pub phrase: String,
    pub salt: Vec<u8>,
    pub revealed_by: AccountId,
    pub revealed_at_ns: u64,
    pub revealed_at_block: u64,
}

#[near(serializers = [borsh])]
pub struct AshKey {
    pub commitment: Hash,
    pub committed_by: AccountId,
    pub committed_at_ns: u64,
    pub committed_at_block: u64,
    pub revealed: Option<AshReveal>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeasonView {
    pub season_id: String,
    pub schema_version: String,
    pub schedule_root: String,
    pub leaf_count: u32,
    pub committed_by: AccountId,
    pub committed_at_ns: U64,
    pub committed_at_block: U64,
    pub revealed_count: u32,
    pub ash_key_committed: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RevealedLeafView {
    pub season_id: String,
    pub index: u32,
    pub leaf: String,
    pub canonical_event: String,
    pub event: CanonicalEvent,
    pub salt: String,
    pub revealed_by: AccountId,
    pub revealed_at_ns: U64,
    pub revealed_at_block: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AshKeyView {
    pub season_id: String,
    pub commitment: String,
    pub committed_by: AccountId,
    pub committed_at_ns: U64,
    pub committed_at_block: U64,
    pub revealed: bool,
    pub phrase: Option<String>,
    pub salt: Option<String>,
    pub revealed_by: Option<AccountId>,
    pub revealed_at_ns: Option<U64>,
}

/// Result of the read-only `check_leaf` dry run.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LeafCheck {
    pub valid: bool,
    pub leaf: Option<String>,
    pub error: Option<String>,
}

/// NEP-297 events: `EVENT_JSON:{"standard":"ftf_season","version":"1.0.0","event":...,"data":...}`.
#[near(event_json(standard = "ftf_season"))]
pub enum SeasonEvent {
    #[event_version("1.0.0")]
    SeasonCommitted { season_id: String, schema_version: String, schedule_root: String, leaf_count: u32, committed_by: AccountId },
    #[event_version("1.0.0")]
    LeafRevealed { season_id: String, index: u32, leaf: String, canonical_event: String, revealed_by: AccountId },
    #[event_version("1.0.0")]
    AshKeyCommitted { season_id: String, commitment: String, committed_by: AccountId },
    #[event_version("1.0.0")]
    AshKeyRevealed { season_id: String, phrase: String, revealed_by: AccountId },
    #[event_version("1.0.0")]
    CoordinatorAdded { account_id: AccountId },
    #[event_version("1.0.0")]
    CoordinatorRemoved { account_id: AccountId },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    coordinators: IterableSet<AccountId>,
    seasons: LookupMap<String, Season>,
    reveals: LookupMap<RevealKey, RevealedLeaf>,
    ash_keys: LookupMap<String, AshKey>,
}

fn fail(msg: &str) -> ! {
    env::panic_str(msg)
}

fn ok<T>(r: Result<T, &'static str>) -> T {
    r.unwrap_or_else(|e| fail(e))
}

/// Charges the storage added since `initial_usage` to the attached deposit and refunds the rest.
fn settle_storage(initial_usage: u64) {
    let used = env::storage_usage().saturating_sub(initial_usage);
    let cost = env::storage_byte_cost().saturating_mul(u128::from(used));
    let attached = env::attached_deposit();
    if attached < cost {
        fail(&format!("{ERR_INSUFFICIENT_DEPOSIT} (need {} yoctoNEAR, attached {})", cost.as_yoctonear(), attached.as_yoctonear()));
    }
    let refund = attached.saturating_sub(cost);
    if refund > NearToken::from_yoctonear(0) {
        let _ = Promise::new(env::predecessor_account_id()).transfer(refund);
    }
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, coordinators: Vec<AccountId>) -> Self {
        let mut set = IterableSet::new(StorageKey::Coordinators);
        for c in coordinators {
            set.insert(c);
        }
        Self {
            owner_id,
            coordinators: set,
            seasons: LookupMap::new(StorageKey::Seasons),
            reveals: LookupMap::new(StorageKey::Reveals),
            ash_keys: LookupMap::new(StorageKey::AshKeys),
        }
    }

    /* ---------- coordinator writes ---------- */

    /// Commits a season's schedule root. Coordinator only; immutable once set.
    /// Attach a storage deposit (0.01 NEAR is plenty); the unused part is refunded.
    #[payable]
    pub fn commit_season(&mut self, season_id: String, schedule_root: String, schema_version: String, leaf_count: u32) -> SeasonView {
        self.assert_coordinator();
        ok(proof::check_season_id(&season_id));
        ok(proof::check_schema(&schema_version));
        let root = ok(proof::parse_hash(&schedule_root));
        require!((1..=proof::MAX_LEAF_COUNT).contains(&leaf_count), ERR_BAD_LEAF_COUNT);
        if self.seasons.contains_key(&season_id) {
            fail(ERR_SEASON_EXISTS);
        }
        let initial = env::storage_usage();
        let season = Season {
            schema_version: schema_version.clone(),
            root,
            leaf_count,
            committed_by: env::predecessor_account_id(),
            committed_at_ns: env::block_timestamp(),
            committed_at_block: env::block_height(),
            revealed_count: 0,
        };
        self.seasons.insert(season_id.clone(), season);
        self.seasons.flush();
        settle_storage(initial);
        SeasonEvent::SeasonCommitted {
            season_id: season_id.clone(),
            schema_version,
            schedule_root,
            leaf_count,
            committed_by: env::predecessor_account_id(),
        }
        .emit();
        self.get_season(season_id).unwrap_or_else(|| fail(ERR_SEASON_NOT_COMMITTED))
    }

    /// Commits Ash's secret phrase: `commitment` = keyCommit(phrase, salt) from engine.js.
    /// Coordinator only, after `commit_season` and before the first leaf is revealed; immutable.
    #[payable]
    pub fn commit_ash_key(&mut self, season_id: String, commitment: String) -> AshKeyView {
        self.assert_coordinator();
        let commitment_hash = ok(proof::parse_hash(&commitment));
        let season = self.seasons.get(&season_id).unwrap_or_else(|| fail(ERR_SEASON_NOT_COMMITTED));
        if season.revealed_count > 0 {
            fail(ERR_SEASON_STARTED);
        }
        if self.ash_keys.contains_key(&season_id) {
            fail(ERR_ASH_KEY_EXISTS);
        }
        let initial = env::storage_usage();
        self.ash_keys.insert(
            season_id.clone(),
            AshKey {
                commitment: commitment_hash,
                committed_by: env::predecessor_account_id(),
                committed_at_ns: env::block_timestamp(),
                committed_at_block: env::block_height(),
                revealed: None,
            },
        );
        self.ash_keys.flush();
        settle_storage(initial);
        SeasonEvent::AshKeyCommitted { season_id: season_id.clone(), commitment, committed_by: env::predecessor_account_id() }.emit();
        self.get_ash_key(season_id).unwrap_or_else(|| fail(ERR_ASH_KEY_NOT_COMMITTED))
    }

    /* ---------- public writes ---------- */

    /// Verifies one schedule leaf on-chain and records it. Anyone may call.
    /// `canonical_event` is the exact JSON string engine.js hashes, `salt` the leaf's hex salt,
    /// `merkle_path` the crypto.js `proofFor` output. Attach a storage deposit (0.01 NEAR).
    #[payable]
    pub fn reveal_leaf(&mut self, season_id: String, index: u32, canonical_event: String, salt: String, merkle_path: Vec<PathStep>) -> RevealedLeafView {
        let (leaf, event, salt_bytes) = ok(self.verify(&season_id, index, &canonical_event, &salt, &merkle_path));
        let key = RevealKey { season_id: season_id.clone(), index };
        if self.reveals.contains_key(&key) {
            fail(ERR_ALREADY_REVEALED);
        }
        let initial = env::storage_usage();
        self.reveals.insert(
            key,
            RevealedLeaf {
                leaf,
                event,
                salt: salt_bytes,
                revealed_by: env::predecessor_account_id(),
                revealed_at_ns: env::block_timestamp(),
                revealed_at_block: env::block_height(),
            },
        );
        if let Some(season) = self.seasons.get_mut(&season_id) {
            season.revealed_count += 1;
        }
        self.reveals.flush();
        self.seasons.flush();
        settle_storage(initial);
        SeasonEvent::LeafRevealed {
            season_id: season_id.clone(),
            index,
            leaf: proof::to_hex(&leaf),
            canonical_event,
            revealed_by: env::predecessor_account_id(),
        }
        .emit();
        self.get_revealed_leaf(season_id, index).unwrap_or_else(|| fail(ERR_SEASON_NOT_COMMITTED))
    }

    /// Opens Ash's key: checks keyCommit(phrase, salt) against the commitment. Anyone may call
    /// (in the game, the player who saw the phrase in a vision). Attach a storage deposit.
    #[payable]
    pub fn reveal_ash_key(&mut self, season_id: String, phrase: String, salt: String) -> AshKeyView {
        ok(proof::check_phrase(&phrase));
        let salt_bytes = ok(proof::parse_salt(&salt));
        let schema = self.seasons.get(&season_id).unwrap_or_else(|| fail(ERR_SEASON_NOT_COMMITTED)).schema_version.clone();
        let key = self.ash_keys.get(&season_id).unwrap_or_else(|| fail(ERR_ASH_KEY_NOT_COMMITTED));
        if key.revealed.is_some() {
            fail(ERR_ASH_KEY_REVEALED);
        }
        if proof::key_commitment(&schema, &season_id, &phrase, &salt) != key.commitment {
            fail(ERR_ASH_KEY_MISMATCH);
        }
        let initial = env::storage_usage();
        if let Some(k) = self.ash_keys.get_mut(&season_id) {
            k.revealed = Some(AshReveal {
                phrase: phrase.clone(),
                salt: salt_bytes,
                revealed_by: env::predecessor_account_id(),
                revealed_at_ns: env::block_timestamp(),
                revealed_at_block: env::block_height(),
            });
        }
        self.ash_keys.flush();
        settle_storage(initial);
        SeasonEvent::AshKeyRevealed { season_id: season_id.clone(), phrase, revealed_by: env::predecessor_account_id() }.emit();
        self.get_ash_key(season_id).unwrap_or_else(|| fail(ERR_ASH_KEY_NOT_COMMITTED))
    }

    /* ---------- owner ---------- */

    #[payable]
    pub fn add_coordinator(&mut self, account_id: AccountId) {
        self.assert_owner();
        if self.coordinators.insert(account_id.clone()) {
            SeasonEvent::CoordinatorAdded { account_id }.emit();
        }
    }

    #[payable]
    pub fn remove_coordinator(&mut self, account_id: AccountId) {
        self.assert_owner();
        require!(self.coordinators.remove(&account_id), ERR_NOT_A_COORDINATOR);
        SeasonEvent::CoordinatorRemoved { account_id }.emit();
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

    pub fn supported_schemas(&self) -> Vec<String> {
        proof::SUPPORTED_SCHEMAS.iter().map(|s| s.to_string()).collect()
    }

    pub fn get_season(&self, season_id: String) -> Option<SeasonView> {
        let s = self.seasons.get(&season_id)?;
        Some(SeasonView {
            season_id: season_id.clone(),
            schema_version: s.schema_version.clone(),
            schedule_root: proof::to_hex(&s.root),
            leaf_count: s.leaf_count,
            committed_by: s.committed_by.clone(),
            committed_at_ns: U64(s.committed_at_ns),
            committed_at_block: U64(s.committed_at_block),
            revealed_count: s.revealed_count,
            ash_key_committed: self.ash_keys.contains_key(&season_id),
        })
    }

    pub fn get_revealed_leaf(&self, season_id: String, index: u32) -> Option<RevealedLeafView> {
        let r = self.reveals.get(&RevealKey { season_id: season_id.clone(), index })?;
        Some(RevealedLeafView {
            season_id,
            index,
            leaf: proof::to_hex(&r.leaf),
            canonical_event: r.event.to_canonical_string(),
            event: r.event,
            salt: proof::to_hex(&r.salt),
            revealed_by: r.revealed_by.clone(),
            revealed_at_ns: U64(r.revealed_at_ns),
            revealed_at_block: U64(r.revealed_at_block),
        })
    }

    /// Recorded leaves of a season in index order, starting at `from_index` (default 0),
    /// scanning at most `limit` indices (default and maximum 100).
    pub fn get_revealed_leaves(&self, season_id: String, from_index: Option<u32>, limit: Option<u32>) -> Vec<RevealedLeafView> {
        let Some(season) = self.seasons.get(&season_id) else { return vec![] };
        let from = from_index.unwrap_or(0);
        let to = from.saturating_add(limit.unwrap_or(100).min(100)).min(season.leaf_count);
        (from..to).filter_map(|i| self.get_revealed_leaf(season_id.clone(), i)).collect()
    }

    pub fn get_ash_key(&self, season_id: String) -> Option<AshKeyView> {
        let k = self.ash_keys.get(&season_id)?;
        let r = k.revealed.as_ref();
        Some(AshKeyView {
            season_id,
            commitment: proof::to_hex(&k.commitment),
            committed_by: k.committed_by.clone(),
            committed_at_ns: U64(k.committed_at_ns),
            committed_at_block: U64(k.committed_at_block),
            revealed: r.is_some(),
            phrase: r.map(|x| x.phrase.clone()),
            salt: r.map(|x| proof::to_hex(&x.salt)),
            revealed_by: r.map(|x| x.revealed_by.clone()),
            revealed_at_ns: r.map(|x| U64(x.revealed_at_ns)),
        })
    }

    /// The leaf hash the contract computes for these inputs (no state is read).
    pub fn compute_leaf(&self, schema_version: String, season_id: String, index: u32, canonical_event: String, salt: String) -> String {
        ok(proof::check_schema(&schema_version));
        ok(proof::check_season_id(&season_id));
        ok(proof::parse_salt(&salt));
        ok(CanonicalEvent::parse(&canonical_event));
        proof::to_hex(&proof::leaf_hash(&schema_version, &season_id, index, &canonical_event, &salt))
    }

    /// Dry run of `reveal_leaf` without writing anything (free view call).
    pub fn check_leaf(&self, season_id: String, index: u32, canonical_event: String, salt: String, merkle_path: Vec<PathStep>) -> LeafCheck {
        match self.verify(&season_id, index, &canonical_event, &salt, &merkle_path) {
            Ok((leaf, _, _)) => LeafCheck { valid: true, leaf: Some(proof::to_hex(&leaf)), error: None },
            Err(e) => LeafCheck { valid: false, leaf: None, error: Some(e.to_string()) },
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

    /// Full on-chain check of one leaf against the committed root.
    fn verify(&self, season_id: &str, index: u32, canonical_event: &str, salt: &str, path: &[PathStep]) -> Result<(Hash, CanonicalEvent, Vec<u8>), &'static str> {
        let season = self.seasons.get(season_id).ok_or(ERR_SEASON_NOT_COMMITTED)?;
        let event = CanonicalEvent::parse(canonical_event)?;
        let salt_bytes = proof::parse_salt(salt)?;
        let leaf = proof::leaf_hash(&season.schema_version, season_id, index, canonical_event, salt);
        let root = proof::root_from_path(leaf, index, season.leaf_count, path)?;
        if root != season.root {
            return Err(ERR_ROOT_MISMATCH);
        }
        Ok((leaf, event, salt_bytes))
    }
}

#[cfg(test)]
mod vector_tests;

/// Contract-level tests on near-sdk's mocked blockchain (needs the unit-testing feature,
/// which is enabled for native non-Windows hosts; see Cargo.toml).
#[cfg(all(test, not(any(windows, target_family = "wasm"))))]
mod tests;