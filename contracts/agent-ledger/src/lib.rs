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
pub const ERR_TEE_FIELD: &str = "ERR_TEE_FIELD: a TEE decision field is empty, too long or malformed";
pub const ERR_TEE_SIG: &str = "ERR_TEE_SIG: the signature does not recover to signing_address";
pub const ERR_TEE_HASH: &str = "ERR_TEE_HASH: response_hash is not the response hash in signed_text";
pub const MAX_TEE_PER_AGENT: usize = 50;
pub const ERR_DEPOSIT: &str = "ERR_DEPOSIT: attach enough NEAR for the record's storage";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey { Tracks, Lists, Summaries, TeeDecisions }

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

/// One decision an agent took through a model in a TEE (docs/tee.md). The contract checks that `signature` is a valid
/// secp256k1 personal_sign of `signed_text` by `signing_address` and that `response_hash` is the one signed; the
/// attestation of `signing_address` (that the key lives in a real TEE) is checked off-chain by tools/verify-tee.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct TeeDecision {
    pub account_id: AccountId,
    pub npc: String,
    pub action: String,
    pub decision_hash: String,
    pub model: String,
    pub chat_id: String,
    pub signed_text: String,
    pub response_hash: String,
    pub signature: String,
    pub signing_address: String,
    pub recorded_at_ns: U64,
    pub block: U64,
}

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
    let hash = env::keccak256_array(&msg);
    let pk = env::ecrecover(&hash, &sig[..64], v, true)?;
    let addr = env::keccak256_array(&pk);
    Some(format!("0x{}", addr[12..].iter().map(|b| format!("{:02x}", b)).collect::<String>()))
}

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

    /// Records a TEE decision of `npc` for the calling account after checking its signature on-chain.
    /// Payable: storage comes from the deposit. Returns the stored record.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn record_tee_decision(&mut self, npc: String, action: String, decision_hash: String, model: String, chat_id: String,
                               signed_text: String, response_hash: String, signature: String, signing_address: String) -> TeeDecision {
        require!(valid_npc(&npc), ERR_NPC);
        require!(matches!(action.as_str(), "buy" | "sell" | "hold"), ERR_TEE_FIELD);
        require!(is_hex64(&decision_hash) && is_hex64(&response_hash), ERR_HASH);
        require!(!model.is_empty() && model.len() <= 80 && !chat_id.is_empty() && chat_id.len() <= 80 && !signed_text.is_empty() && signed_text.len() <= 220, ERR_TEE_FIELD);
        let addr = signing_address.to_ascii_lowercase();
        require!(addr.len() == 42 && addr.starts_with("0x") && unhex(&addr[2..]).is_some(), ERR_TEE_FIELD);
        require!(signed_text.rsplit(':').next() == Some(response_hash.as_str()), ERR_TEE_HASH);
        require!(recover_personal(&signed_text, &signature).as_deref() == Some(addr.as_str()), ERR_TEE_SIG);
        let account_id = env::predecessor_account_id();
        let ak = agent_key(&account_id, &npc);
        let mut map: LookupMap<String, Vec<TeeDecision>> = LookupMap::new(StorageKey::TeeDecisions);
        let mut list = map.get(&ak).cloned().unwrap_or_default();
        require!(list.len() < MAX_TEE_PER_AGENT, ERR_TEE_FIELD);
        require!(!list.iter().any(|d| d.chat_id == chat_id), ERR_EXISTS);
        let before = env::storage_usage();
        let d = TeeDecision { account_id: account_id.clone(), npc: npc.clone(), action, decision_hash, model, chat_id, signed_text, response_hash, signature,
            signing_address: addr, recorded_at_ns: U64(env::block_timestamp()), block: U64(env::block_height()) };
        list.push(d.clone());
        map.insert(ak, list);
        map.flush();
        let used = env::storage_usage().saturating_sub(before);
        let cost = env::storage_byte_cost().saturating_mul(used as u128);
        let deposit = env::attached_deposit();
        require!(deposit >= cost, ERR_DEPOSIT);
        let refund = deposit.saturating_sub(cost);
        if refund > NearToken::from_yoctonear(1) { let _ = Promise::new(account_id.clone()).transfer(refund); }
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"ftf_ledger\",\"version\":\"1.1.0\",\"event\":\"tee_decision_recorded\",\"data\":[{{\"account_id\":\"{}\",\"npc\":\"{}\",\"action\":\"{}\",\"decision_hash\":\"{}\",\"signing_address\":\"{}\"}}]}}",
            account_id, npc, d.action, d.decision_hash, d.signing_address));
        d
    }

    pub fn list_tee_decisions(&self, account_id: AccountId, npc: String, from_index: Option<u32>, limit: Option<u32>) -> Vec<TeeDecision> {
        let map: LookupMap<String, Vec<TeeDecision>> = LookupMap::new(StorageKey::TeeDecisions);
        let list = map.get(&agent_key(&account_id, &npc)).cloned().unwrap_or_default();
        list.into_iter().skip(from_index.unwrap_or(0) as usize).take(limit.unwrap_or(20).min(50) as usize).collect()
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
