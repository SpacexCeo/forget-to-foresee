#![allow(deprecated)] // NEP-171 helpers of near-contract-standards use the legacy collections
//! Forget to Foresee (NEAR testnet): the town economy (docs/town-economy.md, docs/security-town.md).
//!
//! One currency: **silk**, the town's in-game currency (a testnet game resource with no value outside the game),
//! kept as internal balances in micro-units (1 silk = 1_000_000). No `ft_transfer`. One contract, all state atomic,
//! no cross-contract calls on the core path:
//! - **Market**: `trade` moves silk from the caller to a counterparty and takes a 0.12 % fee into the treasury. The 20
//!   scripted trader accounts make ~20,000 of these a day; there is no per-trade storage.
//! - **Works and deeds**: silk pledged to one of four town works for a lock tier becomes a deed (NEP-171, no
//!   approvals) holding the whole position. Weight counts from the next epoch. Rewards come only from the fees:
//!   `sweep_fees` splits the treasury (stakers / tournament purse / reserve / burn) and `distribute` shares the stake
//!   pot over the works, capped by a rate ceiling per unit of weight. Principal is never slashed.
//! - **Tournament**: `enter_tournament` costs silk (part burned, part to the Shell Observatory's stakers, the rest to
//!   the purse); `settle_season` pays ranks from the purse plus a mint bounded by a per-season ceiling.
//! Every operation logs a NEP-297 event (`ftf_town`); `pulse` returns the town's counters.
use near_contract_standards::non_fungible_token::core::{NonFungibleTokenCore, NonFungibleTokenResolver};
use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::store::LookupMap;
use near_sdk::{assert_one_yocto, env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, PromiseOrValue};
use std::collections::HashMap;

pub mod rules;
use rules::*;

pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the contract owner can call this";
pub const ERR_NOT_COORDINATOR: &str = "ERR_NOT_COORDINATOR: only a coordinator can call this";
pub const ERR_PAUSED: &str = "ERR_PAUSED: the town is paused";
pub const ERR_UNKNOWN_ACCOUNT: &str = "ERR_UNKNOWN_ACCOUNT: the account is not registered in the town";
pub const ERR_SELF: &str = "ERR_SELF: an account cannot trade with itself";
pub const ERR_MIN_TRADE: &str = "ERR_MIN_TRADE: a trade moves at least the minimum silk";
pub const ERR_FUNDS: &str = "ERR_FUNDS: not enough balance";
pub const ERR_REF: &str = "ERR_REF: ref is 0-32 characters";
pub const ERR_ASSET: &str = "ERR_ASSET: asset is 0-3 (loom, caravan, archive, observatory)";
pub const ERR_TIER: &str = "ERR_TIER: tier is 0-3";
pub const ERR_CAP: &str = "ERR_CAP: the pledge cap for this account is reached";
pub const ERR_CAP_RECEIVER: &str = "ERR_CAP_RECEIVER: the receiver would exceed its pledge cap";
pub const ERR_DEPOSIT: &str = "ERR_DEPOSIT: attach no deposit or at least DEED_DEPOSIT for the deed";
pub const ERR_NO_DEED: &str = "ERR_NO_DEED: no such deed";
pub const ERR_NOT_DEED_OWNER: &str = "ERR_NOT_DEED_OWNER: only the deed's owner can do this";
pub const ERR_STATE: &str = "ERR_STATE: the deed is not in the right state for this";
pub const ERR_LOCKED: &str = "ERR_LOCKED: the deed is still locked (use exit_early)";
pub const ERR_NOT_READY: &str = "ERR_NOT_READY: the unbonding period is not over";
pub const ERR_NO_EXIT_YET: &str = "ERR_NO_EXIT_YET: a deed that just changed hands cannot exit early for a day";
pub const ERR_ONCE_A_DAY: &str = "ERR_ONCE_A_DAY: already done this epoch";
pub const ERR_NO_APPROVALS: &str = "ERR_NO_APPROVALS: deeds have no approvals";
pub const ERR_GENESIS: &str = "ERR_GENESIS: genesis runs once, before anything else";
pub const ERR_CREDIT_CAP: &str = "ERR_CREDIT_CAP: the coordinator's daily silk credit ceiling is reached";
pub const ERR_SEASON: &str = "ERR_SEASON: not the open season";
pub const ERR_ENTERED: &str = "ERR_ENTERED: already entered this season";
pub const ERR_SETTLED: &str = "ERR_SETTLED: the season is settled";
pub const ERR_PAYOUT_CAP: &str = "ERR_PAYOUT_CAP: one payout is above the per-account cap";
pub const ERR_NO_STALL: &str = "ERR_NO_STALL: that account has no stall";
pub const ERR_GATE_PAID: &str = "ERR_GATE_PAID: this account has already paid this gate";
pub const ERR_SCRIPTED: &str = "ERR_SCRIPTED: the town's own wallets do not pay the gate";
pub const ERR_GATE_PRICE: &str = "ERR_GATE_PRICE: the gate price is 20-5,000 silk";
/** Default portal price (rev 4): 200 silk, burned. */
pub const GATE_PRICE_DEFAULT: u128 = 200 * UNIT;
// Upgrade v2 (pay_gate) keeps the deployed state untouched: its numbers live under their own raw storage keys and its
// records under two NEW collection prefixes, never as fields of `Town` (adding a field would break the stored root).
const K_GATE_PRICE: &[u8] = b"g:price";
const K_GATE_BURNED: &[u8] = b"g:burned";
const K_GATE_COUNT: &[u8] = b"g:count";
fn raw_u128(k: &[u8], default: u128) -> u128 { env::storage_read(k).and_then(|v| v.try_into().ok()).map(u128::from_le_bytes).unwrap_or(default) }
fn set_raw_u128(k: &[u8], v: u128) { env::storage_write(k, &v.to_le_bytes()); }
pub const ERR_PURSE: &str = "ERR_PURSE: the payouts exceed the purse plus the season's mint ceiling";
pub const ERR_SEASON_ROOT: &str = "ERR_SEASON_ROOT: a season keeps the schedule root it was opened with";
pub const ERR_PARAMS: &str = "ERR_PARAMS: a parameter is outside its bounds";

/// Storage deposit a deed needs (refunded when the deed is burned; the excess is refunded at once).
pub const DEED_DEPOSIT: NearToken = NearToken::from_millinear(10);
pub const WORKS: [&str; 4] = ["loom", "caravan", "archive", "observatory"];

#[derive(BorshStorageKey)]
#[near]
// New variants go at the END only: a variant's index is its storage prefix (state-compatible upgrades, docs/town-upgrades.md).
enum StorageKey { Accounts, Deeds, Activation, Seasons, Entries, Nft, NftMeta, NftEnum, Stalls, StallPositions, Gates, GateOf }

/// One account's row: silk, entry credit (spendable only on tournament entry) and pledge totals.
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Account {
    pub silk: u128,
    pub credit: u128,
    pub staked: u128,
    pub staked_works: [u128; 4],
    /// Silk received (trades, rewards, payouts) and spent (trades, entries, deed fees), for the per-wallet Pulse table.
    pub earned: u128,
    pub spent: u128,
}

/// A trader's stall: silk invested in it by players, and the fee share waiting for them (index per invested silk).
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Stall { pub invested: u128, pub index: u128, pub rewards: u128 }

/// One investor's position in a stall.
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct StallPosition { pub amount: u128, pub snapshot: u128, pub pending: u128 }

/// One paid portal gate (upgrade v2).
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct GateRecord { pub gate_id: String, pub price: U, pub at_ms: u64, pub season_id: String }

/// A sealed season: its schedule root, entrants and settlement.
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Season {
    pub schedule_root: String,
    pub entrants: u32,
    /// Silk burned during the previous season (for the mint ceiling).
    pub burn_prev: u128,
    pub mint_cap: u128,
    /// Purse + mint ceiling, fixed by the first settle call.
    pub pot: u128,
    pub paid: u128,
    pub minted: u128,
    pub settled: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Works {
    /// Weight that earns (activated at an epoch boundary).
    pub weight: u128,
    /// Weight pledged in epoch `incoming_day`, earning from the next epoch.
    pub incoming: u128,
    pub incoming_day: u32,
    pub principal: u128,
    /// Reward per unit of weight, scaled by INDEX_SCALE.
    pub index: u128,
    /// The works' own stream waiting for the next distribute (the Observatory's share of entry fees).
    pub extra: u128,
    /// Silk credited to this works and not yet claimed.
    pub rewards: u128,
    /// Silk paid into this works on each of the last 7 epochs (newest first), for the displayed rate.
    pub paid_7d: [u128; 7],
    pub weight_7d: [u128; 7],
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Deed {
    pub asset: u8,
    pub principal: u128,
    pub tier: u8,
    pub weight: u128,
    pub opened_day: u32,
    pub locked_until_day: u32,
    pub season_id: String,
    pub schedule_root: String,
    /// 0 active, 1 unbonding.
    pub state: u8,
    pub unbond_ready_day: u32,
    /// The works' index at activation (None while the weight is still warming up).
    pub snapshot: Option<u128>,
    pub pending: u128,
    pub no_exit_until_day: u32,
    pub deposit: u128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Counters { pub trade: u64, pub entry: u64, pub settle: u64, pub invest: u64, pub stall_claim: u64, pub stake: u64, pub claim: u64, pub unbond: u64, pub withdraw: u64, pub early_exit: u64, pub sweep: u64, pub distribute: u64, pub deed_transfer: u64 }

#[near(serializers = [json])]
pub struct Pulse {
    pub day: u32,
    pub counters: Counters,
    pub accounts: u32,
    pub volume_silk: String,
    pub minted_silk: String,
    pub burned_silk: String,
    pub tvl_staked: String,
    pub treasury_silk: String,
    pub stake_pot: String,
    pub purse: String,
    pub reserve: String,
    /// Silk paid per 100 silk of weight per day over the last 7 epochs, micro-units, per works ("variable, can be zero").
    pub rate_7d_per_100: [String; 4],
    pub season_id: String,
    pub schedule_root: String,
    pub season_entrants: u32,
    /// Silk burned by the portal gate (kept apart from burned_silk: it does not feed the season mint-match).
    pub gate_burned: String,
    pub gates_paid: u64,
    pub entry_fee: String,
    pub paused: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Town {
    owner_id: AccountId,
    coordinators: Vec<AccountId>,
    params: Params,
    paused: bool,
    genesis_done: bool,
    accounts: LookupMap<AccountId, Account>,
    account_count: u32,
    works: [Works; 4],
    activation: LookupMap<(u8, u32), u128>,
    deeds: LookupMap<TokenId, Deed>,
    deed_seq: u64,
    tokens: NonFungibleToken,
    treasury_silk: u128,
    station_silk: u128,
    stake_pot: u128,
    purse: u128,
    reserve: u128,
    minted_silk: u128,
    burned_silk: u128,
    last_open_burned: u128,
    volume_silk: u128,
    credited_day: u32,
    credited_today: u128,
    last_sweep_day: u32,
    last_distribute_day: u32,
    season_id: String,
    schedule_root: String,
    seasons: LookupMap<String, Season>,
    entries: LookupMap<String, bool>,
    stalls: LookupMap<AccountId, Stall>,
    stall_positions: LookupMap<String, StallPosition>,
    /// Silk waiting in all stalls for their investors.
    stall_rewards: u128,
    counters: Counters,
}

fn event(name: &str, data: String) { env::log_str(&format!(r#"EVENT_JSON:{{"standard":"ftf_town","version":"1.0.0","event":"{}","data":[{}]}}"#, name, data)); }

#[near]
impl Town {
    #[init]
    pub fn new(owner_id: AccountId, coordinators: Vec<AccountId>, params: Option<Params>) -> Self {
        let params = params.unwrap_or_default();
        require!(params.valid(), ERR_PARAMS);
        Self {
            tokens: NonFungibleToken::new(StorageKey::Nft, env::current_account_id(), Some(StorageKey::NftMeta), Some(StorageKey::NftEnum), None::<StorageKey>),
            owner_id, coordinators, params, paused: false, genesis_done: false,
            accounts: LookupMap::new(StorageKey::Accounts), account_count: 0, works: Default::default(),
            activation: LookupMap::new(StorageKey::Activation), deeds: LookupMap::new(StorageKey::Deeds), deed_seq: 0,
            treasury_silk: 0, station_silk: 0, stake_pot: 0, purse: 0, reserve: 0, minted_silk: 0, burned_silk: 0, last_open_burned: 0, volume_silk: 0,
            credited_day: 0, credited_today: 0, last_sweep_day: 0, last_distribute_day: 0,
            season_id: String::new(), schedule_root: String::new(), seasons: LookupMap::new(StorageKey::Seasons), entries: LookupMap::new(StorageKey::Entries), stalls: LookupMap::new(StorageKey::Stalls), stall_positions: LookupMap::new(StorageKey::StallPositions), stall_rewards: 0, counters: Counters::default(),
        }
    }

    // ---------- helpers ----------
    fn today(&self) -> u32 { (env::block_timestamp() / (self.params.epoch_secs as u64 * 1_000_000_000)) as u32 }
    fn only_owner(&self) { require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER); }
    fn only_coordinator(&self) { let p = env::predecessor_account_id(); require!(p == self.owner_id || self.coordinators.contains(&p), ERR_NOT_COORDINATOR); }
    fn live(&self) { require!(!self.paused, ERR_PAUSED); }
    fn acc(&self, a: &AccountId) -> Account { self.accounts.get(a).cloned().unwrap_or_else(|| env::panic_str(ERR_UNKNOWN_ACCOUNT)) }
    fn put(&mut self, a: &AccountId, row: Account) { self.accounts.insert(a.clone(), row); }
    fn register_one(&mut self, a: &AccountId) { if !self.accounts.contains_key(a) { self.accounts.insert(a.clone(), Account::default()); self.account_count += 1; } }
    fn tvl(&self) -> u128 { self.works.iter().map(|w| w.principal).sum() }
    fn cap(&self) -> (u128, u128) { let c = stake_cap(&self.params, self.tvl()); (c, c.min(self.params.cap_asset)) }

    /// Moves a works' warming weight into its earning weight once its epoch is over, recording the index it starts at.
    fn roll(&mut self, a: usize) {
        let today = self.today();
        let w = &mut self.works[a];
        if w.incoming > 0 && w.incoming_day < today {
            self.activation.insert((a as u8, w.incoming_day), w.index);
            w.weight += w.incoming; w.incoming = 0;
        }
    }
    /// Brings a deed's pending reward up to the works' current index.
    fn accrue(&mut self, d: &mut Deed) {
        if d.state != 0 { return; }
        let a = d.asset as usize;
        self.roll(a);
        if d.snapshot.is_none() {
            match self.activation.get(&(d.asset, d.opened_day)) { Some(i) => d.snapshot = Some(*i), None => return }
        }
        let idx = self.works[a].index;
        d.pending += pending_reward(d.weight, d.snapshot.unwrap(), idx);
        d.snapshot = Some(idx);
    }
    /// Takes a deed's weight out of its works (begin_unbond, exit_early).
    fn remove_weight(&mut self, d: &Deed) {
        let a = d.asset as usize;
        if d.snapshot.is_none() { self.works[a].incoming -= d.weight; } else { self.works[a].weight -= d.weight; }
    }
    fn pay_pending(&mut self, d: &mut Deed, owner: &AccountId) -> u128 {
        let p = d.pending.min(self.works[d.asset as usize].rewards);
        self.works[d.asset as usize].rewards -= p;
        d.pending = 0;
        let mut row = self.acc(owner); row.silk += p; row.earned += p; self.put(owner, row);
        p
    }
    fn deed_owner(&self, id: &TokenId) -> AccountId { self.tokens.owner_by_id.get(id).unwrap_or_else(|| env::panic_str(ERR_NO_DEED)) }
    fn burn_deed(&mut self, id: &TokenId, owner: &AccountId) -> u128 {
        let d = self.deeds.remove(id).unwrap();
        self.tokens.owner_by_id.remove(id);
        if let Some(m) = self.tokens.token_metadata_by_id.as_mut() { m.remove(id); }
        if let Some(t) = self.tokens.tokens_per_owner.as_mut() {
            if let Some(mut set) = t.get(owner) { set.remove(id); if set.is_empty() { t.remove(owner); } else { t.insert(owner, &set); } }
        }
        d.deposit
    }
    fn release_principal(&mut self, owner: &AccountId, d: &Deed, back: u128) {
        let mut row = self.acc(owner);
        row.staked -= d.principal; row.staked_works[d.asset as usize] -= d.principal; row.silk += back;
        self.put(owner, row);
        self.works[d.asset as usize].principal -= d.principal;
    }

    // ---------- setup ----------
    /// Once: registers the trader accounts with their starting silk.
    pub fn genesis(&mut self, traders: Vec<AccountId>, silk_each: U) {
        self.only_owner();
        require!(!self.genesis_done, ERR_GENESIS);
        self.genesis_done = true;
        for t in &traders { self.register_one(t); let mut r = self.acc(t); r.silk += silk_each.0; self.put(t, r); self.stalls.insert(t.clone(), Stall::default()); }
        self.minted_silk += silk_each.0 * traders.len() as u128;
        event("genesis", format!(r#"{{"traders":{},"silk_each":"{}"}}"#, traders.len(), silk_each.0));
    }
    /// Registers accounts with empty balances (players, guests, new traders). The contract pays their row's storage.
    pub fn register(&mut self, accounts: Vec<AccountId>) { self.only_coordinator(); for a in &accounts { self.register_one(a); } }
    fn credit_inner(&mut self, account_id: &AccountId, amount: u128) {
        let today = self.today();
        if self.credited_day != today { self.credited_day = today; self.credited_today = 0; }
        require!(self.credited_today + amount <= self.params.credit_day_cap, ERR_CREDIT_CAP);
        self.credited_today += amount;
        self.minted_silk += amount;
        let _ = account_id;
    }
    /// Silk for an account (trader wages, descent settlement, corrections): only inside the daily ceiling.
    pub fn credit_silk(&mut self, account_id: AccountId, amount: U, reference: String) {
        self.only_coordinator();
        require!(reference.len() <= 64, ERR_REF);
        self.credit_inner(&account_id, amount.0);
        let mut r = self.acc(&account_id); r.silk += amount.0; self.put(&account_id, r);
        event("silk_credit", format!(r#"{{"account":"{}","amount":"{}","ref":"{}"}}"#, account_id, amount.0, reference.replace('"', "")));
    }
    /// Entry credit for a new guest: spendable only on tournament entry (inside the same daily ceiling).
    pub fn credit_entry(&mut self, account_id: AccountId, amount: U) {
        self.only_coordinator();
        self.credit_inner(&account_id, amount.0);
        let mut r = self.acc(&account_id); r.credit += amount.0; self.put(&account_id, r);
        event("entry_credit", format!(r#"{{"account":"{}","amount":"{}"}}"#, account_id, amount.0));
    }
    /// Opens the sealed season that new deeds and tournament entries belong to (its schedule root never changes).
    pub fn open_season(&mut self, season_id: String, schedule_root: String) {
        self.only_coordinator();
        require!(season_id.len() <= 32 && schedule_root.len() <= 80 && !season_id.is_empty(), ERR_REF);
        if let Some(r) = self.seasons.get(&season_id) { require!(r.schedule_root == schedule_root, ERR_SEASON_ROOT); } else {
            let burn_prev = self.burned_silk - self.last_open_burned;
            self.last_open_burned = self.burned_silk;
            self.seasons.insert(season_id.clone(), Season { schedule_root: schedule_root.clone(), burn_prev, ..Default::default() });
        }
        self.season_id = season_id.clone(); self.schedule_root = schedule_root.clone();
        event("season_open", format!(r#"{{"season_id":"{}","schedule_root":"{}"}}"#, season_id, schedule_root));
    }
    /// Pays the tournament entry fee in silk (entry credit first): part burned, part to the Shell Observatory's
    /// stakers, the rest to the purse.
    pub fn enter_tournament(&mut self, season_id: String) {
        self.live();
        require!(!self.season_id.is_empty() && season_id == self.season_id, ERR_SEASON);
        let mut season = self.seasons.get(&season_id).cloned().unwrap();
        require!(!season.settled, ERR_SETTLED);
        let me = env::predecessor_account_id();
        let key = format!("{}:{}", season_id, me);
        require!(!self.entries.contains_key(&key), ERR_ENTERED);
        let fee = self.params.entry_fee;
        let mut row = self.acc(&me);
        let from_credit = row.credit.min(fee);
        require!(row.silk >= fee - from_credit, ERR_FUNDS);
        row.credit -= from_credit; row.silk -= fee - from_credit; row.spent += fee; self.put(&me, row);
        let sp = split_entry(&self.params, fee);
        self.burned_silk += sp.burn;
        self.works[3].extra += sp.works; // shared at the next distribute, under the rate ceiling
        self.purse += sp.purse;
        season.entrants += 1; self.seasons.insert(season_id.clone(), season);
        self.entries.insert(key, true);
        self.counters.entry += 1;
        event("entry", format!(r#"{{"account":"{}","season_id":"{}","fee":"{}","credit_used":"{}"}}"#, me, season_id, fee, from_credit));
    }
    /// Pays tournament ranks in silk (batches). The pot is the purse plus a mint bounded by the season's ceiling
    /// (min(cap, floor + match·burned last season, per-entrant·entrants)); one payout is at most payout_cap of the pot.
    /// `last` closes the season. The coordinator attests the ranks (`payouts_hash` of the full list is logged).
    pub fn settle_season(&mut self, season_id: String, payouts: Vec<(AccountId, U)>, payouts_hash: String, last: bool) {
        self.only_coordinator();
        require!(payouts_hash.len() <= 80, ERR_REF);
        let mut season = self.seasons.get(&season_id).cloned().unwrap_or_else(|| env::panic_str(ERR_SEASON));
        require!(!season.settled, ERR_SETTLED);
        if season.pot == 0 {
            season.mint_cap = season_mint_cap(&self.params, season.burn_prev, season.entrants);
            season.pot = self.purse + season.mint_cap;
        }
        let cap_one = season.pot * self.params.payout_cap_bps as u128 / BPS;
        let mut total = 0u128;
        for (a, amt) in &payouts {
            require!(amt.0 <= cap_one, ERR_PAYOUT_CAP);
            let mut r = self.acc(a); r.silk += amt.0; r.earned += amt.0; self.put(a, r);
            total += amt.0;
        }
        require!(season.paid + total <= season.pot, ERR_PURSE);
        let from_purse = total.min(self.purse);
        self.purse -= from_purse;
        let mint = total - from_purse;
        require!(season.minted + mint <= season.mint_cap, ERR_PURSE);
        season.minted += mint; self.minted_silk += mint;
        season.paid += total;
        if last { season.settled = true; }
        self.seasons.insert(season_id.clone(), season);
        self.counters.settle += 1;
        event("season_settle", format!(r#"{{"season_id":"{}","payouts":{},"total":"{}","minted":"{}","hash":"{}","last":{}}}"#, season_id, payouts.len(), total, mint, payouts_hash.replace('"', ""), last));
    }
    /// Adds silk to a works' rewards (its stakers' share by weight), or to the purse when it has no earning weight.
    fn add_to_works(&mut self, a: usize, amount: u128) {
        if amount == 0 { return; }
        self.roll(a);
        if self.works[a].weight > 0 { let inc = amount * INDEX_SCALE / self.works[a].weight; self.works[a].index += inc; self.works[a].rewards += amount; } else { self.purse += amount; }
    }
    pub fn set_params(&mut self, params: Params) {
        self.only_owner();
        require!(params.valid() && params.epoch_secs == self.params.epoch_secs, ERR_PARAMS);
        self.params = params;
        event("params", format!(r#"{{"hash":"{}"}}"#, hex(&env::sha256(&near_sdk::borsh::to_vec(&self.params).unwrap()))));
    }
    pub fn set_paused(&mut self, paused: bool) { self.only_owner(); self.paused = paused; event("pause", format!(r#"{{"paused":{}}}"#, paused)); }
    pub fn set_coordinators(&mut self, coordinators: Vec<AccountId>) { self.only_owner(); self.coordinators = coordinators; }

    // ---------- market ----------
    /// The caller pays `silk` to `counterparty` for goods (`reference`, e.g. "bread"); the fee goes to the treasury.
    pub fn trade(&mut self, counterparty: AccountId, silk: U, reference: String) {
        self.live();
        let me = env::predecessor_account_id();
        require!(me != counterparty, ERR_SELF);
        require!(silk.0 >= self.params.min_trade, ERR_MIN_TRADE);
        require!(reference.len() <= 32, ERR_REF);
        let mut a = self.acc(&me);
        let mut b = self.acc(&counterparty);
        require!(a.silk >= silk.0, ERR_FUNDS);
        let fee = trade_fee(&self.params, silk.0);
        a.silk -= silk.0; a.spent += silk.0; b.silk += silk.0 - fee; b.earned += silk.0 - fee;
        self.put(&me, a); self.put(&counterparty, b);
        // the seller's stall investors take their share of the fee (roadmap item 3); the rest goes to the treasury
        let mut to_treasury = fee;
        if let Some(stall) = self.stalls.get_mut(&counterparty) {
            if stall.invested > 0 {
                let share = stall_share(&self.params, fee);
                stall.index += share * INDEX_SCALE / stall.invested; stall.rewards += share; to_treasury -= share;
                self.stall_rewards += share;
            }
        }
        self.treasury_silk += to_treasury; self.volume_silk += silk.0; self.counters.trade += 1;
        event("trade", format!(r#"{{"from":"{}","to":"{}","silk":"{}","fee":"{}","ref":"{}","n":{}}}"#, me, counterparty, silk.0, fee, reference.replace('"', ""), self.counters.trade));
    }

    // ---------- the portal gate (upgrade v2; City Economy rev 4 §2.13) ----------
    /// Pays the portal: burns the gate price (default 200 silk) from the caller's own silk (never entry credit), once per
    /// account and gate. The town's own wallets (stalls, clan wallets) cannot pay. The burn is counted in `gate_burned`,
    /// apart from `burned_silk`, so it does not raise the next season's mint ceiling.
    pub fn pay_gate(&mut self, gate_id: String) -> GateRecord {
        self.live();
        require!(!gate_id.is_empty() && gate_id.len() <= 32 && gate_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'), ERR_REF);
        let me = env::predecessor_account_id();
        let suffix = format!(".{}", env::current_account_id());
        require!(!self.stalls.contains_key(&me) && !me.as_str().ends_with(&suffix), ERR_SCRIPTED);
        let mut book: LookupMap<String, GateRecord> = LookupMap::new(StorageKey::Gates);
        let key = format!("{}:{}", me, gate_id);
        require!(!book.contains_key(&key), ERR_GATE_PAID);
        let price = raw_u128(K_GATE_PRICE, GATE_PRICE_DEFAULT);
        let mut row = self.acc(&me);
        require!(row.silk >= price, ERR_FUNDS);
        row.silk -= price; row.spent += price; self.put(&me, row);
        set_raw_u128(K_GATE_BURNED, raw_u128(K_GATE_BURNED, 0) + price);
        set_raw_u128(K_GATE_COUNT, raw_u128(K_GATE_COUNT, 0) + 1);
        let rec = GateRecord { gate_id: gate_id.clone(), price: U(price), at_ms: env::block_timestamp_ms(), season_id: self.season_id.clone() };
        book.insert(key, rec.clone()); book.flush();
        let mut latest: LookupMap<AccountId, GateRecord> = LookupMap::new(StorageKey::GateOf);
        latest.insert(me.clone(), rec.clone()); latest.flush();
        event("gate_paid", format!(r#"{{"account":"{}","gate_id":"{}","price":"{}","season_id":"{}"}}"#, me, gate_id, price, self.season_id));
        rec
    }
    /// The account's latest paid gate (the relayer reads this for the whitelist pass and the story's eligibility).
    pub fn gate_paid_of(&self, account_id: AccountId) -> Option<GateRecord> { LookupMap::<AccountId, GateRecord>::new(StorageKey::GateOf).get(&account_id).cloned() }
    pub fn gate_paid_for(&self, account_id: AccountId, gate_id: String) -> bool { LookupMap::<String, GateRecord>::new(StorageKey::Gates).contains_key(&format!("{}:{}", account_id, gate_id)) }
    pub fn gate_burned(&self) -> U { U(raw_u128(K_GATE_BURNED, 0)) }
    pub fn gate_price(&self) -> U { U(raw_u128(K_GATE_PRICE, GATE_PRICE_DEFAULT)) }
    /// Owner: the gate price, 20-5,000 silk (rev 4 §2.13.4). Logged.
    pub fn set_gate_price(&mut self, price: U) {
        self.only_owner();
        require!(price.0 >= 20 * UNIT && price.0 <= 5_000 * UNIT, ERR_GATE_PRICE);
        set_raw_u128(K_GATE_PRICE, price.0);
        event("gate_price", format!(r#"{{"price":"{}"}}"#, price.0));
    }

    // ---------- stalls ----------
    fn stall_key(trader: &AccountId, investor: &AccountId) -> String { format!("{}:{}", trader, investor) }
    fn stall_accrue(&self, trader: &AccountId, pos: &mut StallPosition) {
        let idx = self.stalls.get(trader).map(|s| s.index).unwrap_or(0);
        pos.pending += pos.amount * (idx - pos.snapshot) / INDEX_SCALE; pos.snapshot = idx;
    }
    /// Pledges silk into a trader's stall: the silk becomes the trader's working capital (a closed stall reopens once its
    /// purse is back above the reopen line) and the investor earns a share of the fees on that stall's sales from now on.
    /// A pledge, not a loan: the silk does not come back; the fee share does, for as long as the stall trades.
    pub fn invest_stall(&mut self, trader: AccountId, amount: U) {
        self.live();
        let me = env::predecessor_account_id();
        require!(me != trader, ERR_SELF);
        require!(self.stalls.contains_key(&trader), ERR_NO_STALL);
        require!(amount.0 >= self.params.min_trade, ERR_MIN_TRADE);
        let mut row = self.acc(&me); require!(row.silk >= amount.0, ERR_FUNDS);
        row.silk -= amount.0; row.spent += amount.0; self.put(&me, row);
        let mut t = self.acc(&trader); t.silk += amount.0; t.earned += amount.0; self.put(&trader, t);
        let key = Self::stall_key(&trader, &me);
        let mut pos = self.stall_positions.get(&key).cloned().unwrap_or_default();
        self.stall_accrue(&trader, &mut pos);
        pos.amount += amount.0;
        self.stall_positions.insert(key, pos);
        self.stalls.get_mut(&trader).unwrap().invested += amount.0;
        self.counters.invest += 1;
        event("stall_invest", format!(r#"{{"investor":"{}","stall":"{}","silk":"{}"}}"#, me, trader, amount.0));
    }
    /// Pays an investor's fee share from a stall.
    pub fn claim_stall(&mut self, trader: AccountId) -> U {
        let me = env::predecessor_account_id();
        let key = Self::stall_key(&trader, &me);
        let mut pos = self.stall_positions.get(&key).cloned().unwrap_or_else(|| env::panic_str(ERR_NO_STALL));
        self.stall_accrue(&trader, &mut pos);
        let stall = self.stalls.get_mut(&trader).unwrap();
        let p = pos.pending.min(stall.rewards);
        stall.rewards -= p; pos.pending -= p;
        self.stall_rewards -= p;
        self.stall_positions.insert(key, pos);
        let mut row = self.acc(&me); row.silk += p; row.earned += p; self.put(&me, row);
        self.counters.stall_claim += 1;
        event("stall_claim", format!(r#"{{"investor":"{}","stall":"{}","silk":"{}"}}"#, me, trader, p));
        U(p)
    }
    pub fn stall_of(&self, trader: AccountId) -> Option<Stall> { self.stalls.get(&trader).cloned() }
    pub fn stall_position(&self, trader: AccountId, investor: AccountId) -> Option<(StallPosition, U)> {
        let pos = self.stall_positions.get(&Self::stall_key(&trader, &investor))?.clone();
        let idx = self.stalls.get(&trader).map(|s| s.index).unwrap_or(0);
        let claimable = pos.pending + pos.amount * (idx - pos.snapshot) / INDEX_SCALE;
        Some((pos, U(claimable)))
    }

    // ---------- pledges ----------
    /// Pledges `amount` silk to works `asset` for lock `tier`; mints a deed to the caller. Attach DEED_DEPOSIT or nothing.
    #[payable]
    pub fn stake(&mut self, asset: u8, amount: U, tier: u8) -> TokenId {
        self.live();
        require!((asset as usize) < 4, ERR_ASSET); require!((tier as usize) < 4, ERR_TIER);
        // A wallet may attach DEED_DEPOSIT for the deed's storage (refunded at burn). The town's own accounts pledge with
        // function-call keys, which cannot attach NEAR: then the contract pays the storage and the burned deed fee is the
        // spam brake. Anything between 0 and DEED_DEPOSIT is refused, so a deposit is either full or none.
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit == 0 || deposit >= DEED_DEPOSIT.as_yoctonear(), ERR_DEPOSIT);
        let me = env::predecessor_account_id();
        let fee = self.params.deed_fee;
        let mut row = self.acc(&me);
        require!(amount.0 > 0 && row.silk >= amount.0 + fee, ERR_FUNDS);
        let (cap, cap_asset) = self.cap();
        require!(row.staked + amount.0 <= cap && row.staked_works[asset as usize] + amount.0 <= cap_asset, ERR_CAP);
        row.silk -= amount.0 + fee; row.spent += fee; row.staked += amount.0; row.staked_works[asset as usize] += amount.0;
        self.put(&me, row);
        self.burned_silk += fee;
        let a = asset as usize;
        self.roll(a);
        let today = self.today();
        let weight = amount.0 * self.params.lock_mult_bps[tier as usize] as u128 / BPS;
        let w = &mut self.works[a];
        w.incoming += weight; w.incoming_day = today; w.principal += amount.0;
        self.deed_seq += 1;
        let id: TokenId = format!("deed-{}-{}", if self.season_id.is_empty() { "0" } else { &self.season_id }, self.deed_seq);
        let d = Deed {
            asset, principal: amount.0, tier, weight, opened_day: today, locked_until_day: today + self.params.lock_days[tier as usize],
            season_id: self.season_id.clone(), schedule_root: self.schedule_root.clone(), state: 0, unbond_ready_day: 0,
            snapshot: None, pending: 0, no_exit_until_day: 0, deposit,
        };
        self.deeds.insert(id.clone(), d);
        let meta = TokenMetadata {
            title: Some(format!("Town deed: {} · tier {}", WORKS[a], tier)),
            description: Some("A pledge of silk (the town's testnet game currency) to a town works. Live state: get_deed.".into()),
            extra: Some(format!(r#"{{"v":1,"kind":"town_deed","asset":"{}","principal":"{}","tier":{},"opened_day":{},"season_id":"{}","schedule_root":"{}"}}"#, WORKS[a], amount.0, tier, today, self.season_id, self.schedule_root)),
            media: None, media_hash: None, copies: None, issued_at: None, expires_at: None, starts_at: None, updated_at: None, reference: None, reference_hash: None,
        };
        self.tokens.internal_mint_with_refund(id.clone(), me.clone(), Some(meta), None); // the deposit is kept and refunded at burn
        near_contract_standards::non_fungible_token::events::NftMint { owner_id: &me, token_ids: &[&id], memo: None }.emit();
        self.counters.stake += 1;
        event("stake", format!(r#"{{"account":"{}","deed":"{}","asset":"{}","principal":"{}","tier":{},"fee":"{}"}}"#, me, id, WORKS[a], amount.0, tier, fee));
        id
    }
    pub fn claim(&mut self, token_id: TokenId) -> U {
        let me = env::predecessor_account_id();
        require!(self.deed_owner(&token_id) == me, ERR_NOT_DEED_OWNER);
        let mut d = self.deeds.get(&token_id).cloned().unwrap();
        self.accrue(&mut d);
        let p = self.pay_pending(&mut d, &me);
        self.deeds.insert(token_id.clone(), d); self.counters.claim += 1;
        event("claim", format!(r#"{{"account":"{}","deed":"{}","silk":"{}"}}"#, me, token_id, p)); U(p)
    }
    pub fn begin_unbond(&mut self, token_id: TokenId) {
        let me = env::predecessor_account_id();
        require!(self.deed_owner(&token_id) == me, ERR_NOT_DEED_OWNER);
        let mut d = self.deeds.get(&token_id).cloned().unwrap();
        require!(d.state == 0, ERR_STATE);
        let today = self.today();
        require!(today >= d.locked_until_day, ERR_LOCKED);
        self.accrue(&mut d);
        self.remove_weight(&d);
        d.state = 1; d.unbond_ready_day = today + self.params.cooldown_days;
        self.deeds.insert(token_id.clone(), d.clone()); self.counters.unbond += 1;
        event("unbond_begin", format!(r#"{{"account":"{}","deed":"{}","ready_day":{}}}"#, me, token_id, d.unbond_ready_day));
    }
    /// After the cooldown: principal and pending back to the owner, the deed burned, its storage deposit refunded.
    pub fn finish_unbond(&mut self, token_id: TokenId) -> U {
        let me = env::predecessor_account_id();
        require!(self.deed_owner(&token_id) == me, ERR_NOT_DEED_OWNER);
        let mut d = self.deeds.get(&token_id).cloned().unwrap();
        require!(d.state == 1, ERR_STATE);
        require!(self.today() >= d.unbond_ready_day, ERR_NOT_READY);
        let p = self.pay_pending(&mut d, &me);
        self.release_principal(&me, &d, d.principal);
        let dep = self.burn_deed(&token_id, &me);
        if dep > 0 { Promise::new(me.clone()).transfer(NearToken::from_yoctonear(dep)).detach(); }
        self.counters.withdraw += 1;
        event("unbond_finish", format!(r#"{{"account":"{}","deed":"{}","principal":"{}","reward":"{}"}}"#, me, token_id, d.principal, p));
        U(d.principal + p)
    }
    /// Leaves an active deed now: 10 % of principal is taken (half burned, half to the works' other stakers).
    pub fn exit_early(&mut self, token_id: TokenId) -> U {
        let me = env::predecessor_account_id();
        require!(self.deed_owner(&token_id) == me, ERR_NOT_DEED_OWNER);
        let mut d = self.deeds.get(&token_id).cloned().unwrap();
        require!(d.state == 0, ERR_STATE);
        require!(self.today() >= d.no_exit_until_day, ERR_NO_EXIT_YET);
        self.accrue(&mut d);
        self.remove_weight(&d);
        let p = self.pay_pending(&mut d, &me);
        let pen = d.principal * self.params.early_exit_bps as u128 / BPS;
        let burn = pen / 2; let share = pen - burn;
        self.burned_silk += burn;
        self.add_to_works(d.asset as usize, share);
        self.release_principal(&me, &d, d.principal - pen);
        let dep = self.burn_deed(&token_id, &me);
        if dep > 0 { Promise::new(me.clone()).transfer(NearToken::from_yoctonear(dep)).detach(); }
        self.counters.early_exit += 1;
        event("early_exit", format!(r#"{{"account":"{}","deed":"{}","penalty":"{}","reward":"{}"}}"#, me, token_id, pen, p));
        U(d.principal - pen + p)
    }

    // ---------- fee flow ----------
    /// Once per epoch, anyone: 12 % of the treasury's silk goes to the station bucket (P2); the rest splits 65 % to the
    /// stake pot, 10 % to the tournament purse, 10 % to the Shell Reserve, 15 % burned.
    pub fn sweep_fees(&mut self) -> U {
        let today = self.today();
        require!(self.last_sweep_day < today || (self.last_sweep_day == 0 && self.counters.sweep == 0), ERR_ONCE_A_DAY);
        self.last_sweep_day = today;
        let station = self.treasury_silk * self.params.station_tax_bps as u128 / BPS;
        self.station_silk += station;
        let swept = self.treasury_silk - station;
        self.treasury_silk = 0;
        let s = split_sweep(&self.params, swept);
        self.stake_pot += s.stakers; self.purse += s.purse; self.reserve += s.reserve; self.burned_silk += s.burn;
        self.counters.sweep += 1;
        event("sweep", format!(r#"{{"silk":"{}","station":"{}","stakers":"{}","purse":"{}","reserve":"{}","burn":"{}"}}"#, swept, station, s.stakers, s.purse, s.reserve, s.burn));
        U(swept)
    }
    /// Once per epoch, anyone: shares the stake pot over the works with earning weight (base shares renormalised),
    /// each capped at the rate ceiling per unit of weight; the excess goes to the purse.
    pub fn distribute(&mut self) -> U {
        let today = self.today();
        require!(self.last_distribute_day < today || (self.last_distribute_day == 0 && self.counters.distribute == 0), ERR_ONCE_A_DAY);
        self.last_distribute_day = today;
        for a in 0..4 { self.roll(a); }
        let weights: [u128; 4] = [self.works[0].weight, self.works[1].weight, self.works[2].weight, self.works[3].weight];
        let extras: [u128; 4] = [self.works[0].extra, self.works[1].extra, self.works[2].extra, self.works[3].extra];
        let plan = plan_distribution(&self.params, self.stake_pot, &weights, &extras);
        let extra_total: u128 = extras.iter().sum();
        let mut paid = 0;
        for a in 0..4 {
            let w = &mut self.works[a];
            w.paid_7d.rotate_right(1); w.weight_7d.rotate_right(1);
            w.paid_7d[0] = plan.pots[a]; w.weight_7d[0] = w.weight; w.extra = 0;
            if plan.pots[a] > 0 { w.index += plan.pots[a] * INDEX_SCALE / w.weight; w.rewards += plan.pots[a]; paid += plan.pots[a]; }
        }
        self.stake_pot = self.stake_pot + extra_total - paid - plan.overflow;
        self.purse += plan.overflow;
        self.counters.distribute += 1;
        event("distribute", format!(r#"{{"pots":["{}","{}","{}","{}"],"overflow":"{}","kept":"{}"}}"#, plan.pots[0], plan.pots[1], plan.pots[2], plan.pots[3], plan.overflow, self.stake_pot));
        U(paid)
    }

    // ---------- views ----------
    pub fn balance_of(&self, account_id: AccountId) -> Option<Account> { self.accounts.get(&account_id).cloned() }
    pub fn balances_of(&self, account_ids: Vec<AccountId>) -> Vec<Option<Account>> { account_ids.iter().take(50).map(|a| self.accounts.get(a).cloned()).collect() }
    pub fn stake_pools(&self) -> Vec<Works> { self.works.to_vec() }
    pub fn get_deed(&self, token_id: TokenId) -> Option<(AccountId, Deed, U)> {
        let owner = self.tokens.owner_by_id.get(&token_id)?;
        let d = self.deeds.get(&token_id)?.clone();
        let w = &self.works[d.asset as usize];
        let snap = d.snapshot.or_else(|| if w.incoming > 0 && w.incoming_day == d.opened_day { None } else { self.activation.get(&(d.asset, d.opened_day)).copied().or(Some(w.index)) });
        let claimable = d.pending + if d.state == 0 { snap.map(|s| pending_reward(d.weight, s, w.index)).unwrap_or(0) } else { 0 };
        Some((owner, d, U(claimable)))
    }
    pub fn params(&self) -> Params { self.params.clone() }
    pub fn season(&self, season_id: String) -> Option<Season> { self.seasons.get(&season_id).cloned() }
    pub fn has_entered(&self, season_id: String, account_id: AccountId) -> bool { self.entries.contains_key(&format!("{}:{}", season_id, account_id)) }
    pub fn pulse(&self) -> Pulse {
        let rate = |w: &Works| { let paid: u128 = w.paid_7d.iter().sum(); let wt: u128 = w.weight_7d.iter().sum(); if wt == 0 { 0 } else { paid * 100 * 1_000_000 / wt } };
        let s = |v: u128| v.to_string();
        let entrants = self.seasons.get(&self.season_id).map(|x| x.entrants).unwrap_or(0);
        Pulse {
            day: self.today(), counters: self.counters.clone(), accounts: self.account_count, volume_silk: s(self.volume_silk),
            minted_silk: s(self.minted_silk), burned_silk: s(self.burned_silk), tvl_staked: s(self.tvl()),
            treasury_silk: s(self.treasury_silk), stake_pot: s(self.stake_pot), purse: s(self.purse), reserve: s(self.reserve),
            rate_7d_per_100: [s(rate(&self.works[0])), s(rate(&self.works[1])), s(rate(&self.works[2])), s(rate(&self.works[3]))],
            season_id: self.season_id.clone(), schedule_root: self.schedule_root.clone(), season_entrants: entrants, entry_fee: s(self.params.entry_fee), paused: self.paused,
            gate_burned: s(raw_u128(K_GATE_BURNED, 0)), gates_paid: raw_u128(K_GATE_COUNT, 0) as u64,
        }
    }
    /// Every place silk can be outside account rows (for the conservation check: minted − burned = rows + this).
    pub fn silk_held_outside_accounts(&self) -> U {
        U(self.treasury_silk + self.station_silk + self.stall_rewards + self.stake_pot + self.purse + self.reserve + self.works.iter().map(|w| w.rewards + w.principal + w.extra).sum::<u128>())
    }

    // ---------- deed transfer rules ----------
    fn before_transfer(&mut self, from: &AccountId, to: &AccountId, token_id: &TokenId) {
        require!(self.deed_owner(token_id) == *from, ERR_NOT_DEED_OWNER);
        require!(from != to, ERR_SELF);
        let d = self.deeds.get(token_id).cloned().unwrap_or_else(|| env::panic_str(ERR_NO_DEED));
        let (cap, cap_asset) = self.cap();
        let mut r = self.acc(to);
        require!(r.staked + d.principal <= cap && r.staked_works[d.asset as usize] + d.principal <= cap_asset, ERR_CAP_RECEIVER);
        r.staked += d.principal; r.staked_works[d.asset as usize] += d.principal; self.put(to, r);
        let mut f = self.acc(from); f.staked -= d.principal; f.staked_works[d.asset as usize] -= d.principal; self.put(from, f);
        let mut d = d; d.no_exit_until_day = self.today() + 2; self.deeds.insert(token_id.clone(), d);
        self.counters.deed_transfer += 1;
        event("deed_transfer", format!(r#"{{"deed":"{}","from":"{}","to":"{}"}}"#, token_id, from, to));
    }
}

#[near]
impl NonFungibleTokenCore for Town {
    #[payable]
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        assert_one_yocto();
        require!(approval_id.is_none(), ERR_NO_APPROVALS);
        let from = env::predecessor_account_id();
        self.before_transfer(&from, &receiver_id, &token_id);
        self.tokens.internal_transfer(&from, &receiver_id, &token_id, None, memo);
    }
    #[payable]
    fn nft_transfer_call(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>, msg: String) -> PromiseOrValue<bool> {
        require!(approval_id.is_none(), ERR_NO_APPROVALS);
        let from = env::predecessor_account_id();
        self.before_transfer(&from, &receiver_id, &token_id);
        self.tokens.nft_transfer_call(receiver_id, token_id, None, memo, msg)
    }
    fn nft_token(&self, token_id: TokenId) -> Option<Token> { self.tokens.nft_token(token_id) }
}

#[near]
impl NonFungibleTokenResolver for Town {
    #[private]
    fn nft_resolve_transfer(&mut self, previous_owner_id: AccountId, receiver_id: AccountId, token_id: TokenId, approved_account_ids: Option<HashMap<AccountId, u64>>) -> bool {
        let kept = self.tokens.nft_resolve_transfer(previous_owner_id.clone(), receiver_id.clone(), token_id.clone(), approved_account_ids);
        if !kept {
            // The receiver gave it back: the position's bookkeeping follows the owner back.
            if let Some(d) = self.deeds.get(&token_id).cloned() {
                let mut r = self.acc(&receiver_id); r.staked -= d.principal; r.staked_works[d.asset as usize] -= d.principal; self.put(&receiver_id, r);
                let mut p = self.acc(&previous_owner_id); p.staked += d.principal; p.staked_works[d.asset as usize] += d.principal; self.put(&previous_owner_id, p);
            }
        }
        kept
    }
}

near_contract_standards::impl_non_fungible_token_enumeration!(Town, tokens);

#[near]
impl NonFungibleTokenMetadataProvider for Town {
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata { spec: NFT_METADATA_SPEC.to_string(), name: "Forget to Foresee town deeds".into(), symbol: "FTFDEED".into(), icon: None, base_uri: None, reference: None, reference_hash: None }
    }
}

fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{:02x}", x)).collect() }

#[cfg(test)]
mod tests;
