//! Forget to Foresee (NEAR testnet): the track records of hired townsperson-agents (docs/agent-track-record-plan.md).
//!
//! A player's account (the Day 1 guest account, signed with the key in their browser) records each closed hire of an
//! agent: the seed, the policy version, the policy inputs (`params`, with their sha256), the sealed price snapshot's
//! sha256, the bar range, the compact trade list and the PnL in basis points. The contract stores it under
//! (account, npc, epoch), keeps a per-agent summary and emits an event. It does not judge the record: anyone re-runs
//! the deterministic policy on the snapshot and compares (tools/verify-agent/verify.mjs); a forged record fails there.
//! Storage is paid by the attached deposit (the excess is refunded).
use near_sdk::json_types::U64;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

pub const MAX_TRADES: usize = 50;
pub const MAX_COMPACT: usize = 1200;
pub const MAX_PARAMS: usize = 512;
pub const ERR_NPC: &str = "ERR_NPC: npc is 1-32 characters of a-z, 0-9 and _";
pub const ERR_EXISTS: &str = "ERR_EXISTS: this epoch is already recorded for this agent";
pub const ERR_FIELD: &str = "ERR_FIELD: a field is empty or too long";
pub const ERR_HASH: &str = "ERR_HASH: params_hash and snapshot_sha256 are 64 lowercase hex characters";
pub const ERR_TRADES: &str = "ERR_TRADES: 1-50 trades of five integers each";
pub const ERR_BARS: &str = "ERR_BARS: bar_from must be below bar_to";
pub const ERR_DEPOSIT: &str = "ERR_DEPOSIT: attach enough NEAR for the record's storage";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey { Tracks, Lists, Summaries }

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Track {
    pub account_id: AccountId,
    pub npc: String,
    pub epoch: u32,
    pub seed: String,
    pub policy_version: String,
    pub params: String,
    pub params_hash: String,
    pub snapshot_sha256: String,
    pub bar_from: u32,
    pub bar_to: u32,
    pub trades_compact: String,
    pub trades: u32,
    pub pnl_bp: i32,
    pub recorded_at_ns: U64,
    pub block: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Summary { pub epochs: u32, pub trades: u32, pub pnl_bp_sum: i64 }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    tracks: LookupMap<String, Track>,
    lists: LookupMap<String, Vec<u32>>,
    summaries: LookupMap<String, Summary>,
    count: u64,
}

fn agent_key(account: &AccountId, npc: &str) -> String { format!("{}|{}", account, npc) }
fn is_hex64(s: &str) -> bool { s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn valid_npc(s: &str) -> bool { !s.is_empty() && s.len() <= 32 && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_') }
/** Counts trades and checks that each is five integers ("echo,bar,arm,stake,back"). */
fn count_trades(s: &str) -> Option<u32> {
    if s.is_empty() || s.len() > MAX_COMPACT { return None; }
    let mut n = 0u32;
    for t in s.split(';') {
        let parts: Vec<&str> = t.split(',').collect();
        if parts.len() != 5 || parts.iter().any(|p| p.is_empty() || p.parse::<i64>().is_err()) { return None; }
        n += 1;
    }
    if n as usize > MAX_TRADES { None } else { Some(n) }
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self { owner_id, tracks: LookupMap::new(StorageKey::Tracks), lists: LookupMap::new(StorageKey::Lists), summaries: LookupMap::new(StorageKey::Summaries), count: 0 }
    }

    /// Records one closed hire of `npc` for the calling account. Payable: storage comes from the deposit.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn record_track(&mut self, npc: String, epoch: u32, seed: String, policy_version: String, params: String, params_hash: String,
                        snapshot_sha256: String, bar_from: u32, bar_to: u32, trades_compact: String, pnl_bp: i32) -> Track {
        require!(valid_npc(&npc), ERR_NPC);
        require!(!seed.is_empty() && seed.len() <= 64 && !policy_version.is_empty() && policy_version.len() <= 32 && !params.is_empty() && params.len() <= MAX_PARAMS, ERR_FIELD);
        require!(is_hex64(&params_hash) && is_hex64(&snapshot_sha256), ERR_HASH);
        require!(bar_from < bar_to, ERR_BARS);
        let trades = count_trades(&trades_compact).unwrap_or_else(|| env::panic_str(ERR_TRADES));
        let account_id = env::predecessor_account_id();
        let key = format!("{}|{}", agent_key(&account_id, &npc), epoch);
        require!(self.tracks.get(&key).is_none(), ERR_EXISTS);
        let before = env::storage_usage();
        let track = Track { account_id: account_id.clone(), npc: npc.clone(), epoch, seed, policy_version, params, params_hash, snapshot_sha256, bar_from, bar_to,
            trades_compact, trades, pnl_bp, recorded_at_ns: U64(env::block_timestamp()), block: U64(env::block_height()) };
        self.tracks.insert(key, track.clone());
        let ak = agent_key(&account_id, &npc);
        let mut list = self.lists.get(&ak).cloned().unwrap_or_default();
        list.push(epoch);
        self.lists.insert(ak.clone(), list);
        let mut s = self.summaries.get(&ak).cloned().unwrap_or_default();
        s.epochs += 1; s.trades += trades; s.pnl_bp_sum += pnl_bp as i64;
        self.summaries.insert(ak, s);
        self.count += 1;
        self.tracks.flush(); self.lists.flush(); self.summaries.flush();
        let used = env::storage_usage().saturating_sub(before);
        let cost = env::storage_byte_cost().saturating_mul(used as u128);
        let deposit = env::attached_deposit();
        require!(deposit >= cost, ERR_DEPOSIT);
        let refund = deposit.saturating_sub(cost);
        if refund > NearToken::from_yoctonear(1) { let _ = Promise::new(account_id.clone()).transfer(refund); } // scheduled when dropped
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"ftf_ledger\",\"version\":\"1.0.0\",\"event\":\"track_recorded\",\"data\":[{{\"account_id\":\"{}\",\"npc\":\"{}\",\"epoch\":{},\"trades\":{},\"pnl_bp\":{}}}]}}",
            account_id, npc, epoch, trades, pnl_bp));
        track
    }

    pub fn get_track(&self, account_id: AccountId, npc: String, epoch: u32) -> Option<Track> {
        self.tracks.get(&format!("{}|{}", agent_key(&account_id, &npc), epoch)).cloned()
    }

    pub fn list_tracks(&self, account_id: AccountId, npc: String, from_index: Option<u32>, limit: Option<u32>) -> Vec<Track> {
        let ak = agent_key(&account_id, &npc);
        let list = self.lists.get(&ak).cloned().unwrap_or_default();
        let from = from_index.unwrap_or(0) as usize;
        let lim = limit.unwrap_or(20).min(50) as usize;
        list.iter().skip(from).take(lim).filter_map(|e| self.tracks.get(&format!("{}|{}", ak, e)).cloned()).collect()
    }

    pub fn agent_summary(&self, account_id: AccountId, npc: String) -> Summary {
        self.summaries.get(&agent_key(&account_id, &npc)).cloned().unwrap_or_default()
    }

    pub fn stats(&self) -> U64 { U64(self.count) }
    pub fn owner(&self) -> AccountId { self.owner_id.clone() }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests;
