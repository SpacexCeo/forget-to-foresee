//! Forget to Foresee (NEAR testnet): the town market. A fixed set of traders (the townsfolk and the clan agents, each a
//! testnet account whose function-call key lives only on the relayer's server) trade goods for town silk. One trade is
//! one call: the caller buys `qty` of `item` from `to` at `price` town silk each, silk moves between the two balances
//! (never below zero) and a NEP-297 event is logged. Nothing grows per trade: only the balances, the last price of each
//! item and a few day counters change, so storage stays flat however many trades there are. Town silk is an in-game
//! unit with no value outside the game; the goods themselves are not tracked on chain.
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the contract owner can call this";
pub const ERR_PAUSED: &str = "ERR_PAUSED: the market is paused";
pub const ERR_NOT_TRADER: &str = "ERR_NOT_TRADER: the caller is not a registered trader";
pub const ERR_NO_SELLER: &str = "ERR_NO_SELLER: the seller is not a registered trader";
pub const ERR_SELF: &str = "ERR_SELF: a trader cannot trade with itself";
pub const ERR_ITEM: &str = "ERR_ITEM: unknown item";
pub const ERR_QTY: &str = "ERR_QTY: qty is 1-20";
pub const ERR_PRICE: &str = "ERR_PRICE: price is outside half to twice the item's base price";
pub const ERR_FUNDS: &str = "ERR_FUNDS: the buyer does not have enough town silk";
pub const ERR_ITEMS: &str = "ERR_ITEMS: 1-48 items, ids 1-24 characters, base 1-10000, no duplicates";
/** Most units in one trade. */
pub const MAX_QTY: u32 = 20;
/** Days kept in the rolling history. */
pub const HISTORY_DAYS: usize = 14;
const DAY_MS: u64 = 86_400_000;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey { Balances, Traders }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Item { pub id: String, pub base: u32 }

#[near(serializers = [json])]
pub struct ItemView { pub id: String, pub base: u32, pub last: u32 }

#[near(serializers = [json])]
pub struct Stats {
    /** UTC day number (unix ms / 86 400 000) of `today`. */
    pub day: u32,
    pub today: u32,
    pub today_volume: u64,
    pub total: u64,
    pub total_volume: u64,
    pub traders: u32,
    pub paused: bool,
    /** Earlier days, newest first: [day, trades, volume]. */
    pub history: Vec<(u32, u32, u64)>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Market {
    owner_id: AccountId,
    paused: bool,
    items: Vec<Item>,
    last: Vec<u32>,
    day: u32,
    today: u32,
    today_volume: u64,
    total: u64,
    total_volume: u64,
    history: Vec<(u32, u32, u64)>,
    balances: LookupMap<AccountId, u64>,
    traders: Vector<AccountId>,
}

fn check_items(items: &[Item]) {
    require!(!items.is_empty() && items.len() <= 48, ERR_ITEMS);
    for (k, it) in items.iter().enumerate() {
        require!(!it.id.is_empty() && it.id.len() <= 24 && it.base >= 1 && it.base <= 10_000, ERR_ITEMS);
        require!(items[..k].iter().all(|o| o.id != it.id), ERR_ITEMS);
    }
}

#[near]
impl Market {
    #[init]
    pub fn new(owner_id: AccountId, items: Vec<Item>) -> Self {
        check_items(&items);
        let last = items.iter().map(|i| i.base).collect();
        Self {
            owner_id, paused: false, items, last, day: (env::block_timestamp_ms() / DAY_MS) as u32, today: 0, today_volume: 0,
            total: 0, total_volume: 0, history: Vec::new(),
            balances: LookupMap::new(StorageKey::Balances), traders: Vector::new(StorageKey::Traders),
        }
    }

    fn only_owner(&self) { require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER); }

    /// Registers traders with a starting balance (accounts already registered are left as they are).
    pub fn add_traders(&mut self, traders: Vec<AccountId>, balance: u64) {
        self.only_owner();
        for t in traders {
            if self.balances.get(&t).is_none() { self.balances.insert(t.clone(), balance); self.traders.push(t); }
        }
    }

    /// Adds town silk to a trader (the town treasury, if the economy ever stalls).
    pub fn fund(&mut self, account_id: AccountId, amount: u64) {
        self.only_owner();
        let b = self.balances.get_mut(&account_id).unwrap_or_else(|| env::panic_str(ERR_NO_SELLER));
        *b = b.saturating_add(amount);
    }

    /// Replaces the item table (prices of items that stay keep their last value).
    pub fn set_items(&mut self, items: Vec<Item>) {
        self.only_owner();
        check_items(&items);
        self.last = items.iter().map(|i| self.items.iter().position(|o| o.id == i.id).map(|k| self.last[k]).unwrap_or(i.base)).collect();
        self.items = items;
    }

    pub fn set_paused(&mut self, paused: bool) { self.only_owner(); self.paused = paused; }

    /// The caller buys `qty` of `item` from `to` at `price` town silk each.
    pub fn trade(&mut self, to: AccountId, item: String, qty: u32, price: u32) {
        require!(!self.paused, ERR_PAUSED);
        let buyer = env::predecessor_account_id();
        require!(buyer != to, ERR_SELF);
        let k = self.items.iter().position(|i| i.id == item).unwrap_or_else(|| env::panic_str(ERR_ITEM));
        require!(qty >= 1 && qty <= MAX_QTY, ERR_QTY);
        let base = self.items[k].base;
        require!(price >= (base / 2).max(1) && price <= base.saturating_mul(2), ERR_PRICE);
        let cost = qty as u64 * price as u64;
        let have = *self.balances.get(&buyer).unwrap_or_else(|| env::panic_str(ERR_NOT_TRADER));
        require!(self.balances.contains_key(&to), ERR_NO_SELLER);
        require!(have >= cost, ERR_FUNDS);
        self.balances.insert(buyer.clone(), have - cost);
        let s = self.balances.get_mut(&to).unwrap();
        *s = s.saturating_add(cost);
        self.last[k] = price;
        let day = (env::block_timestamp_ms() / DAY_MS) as u32;
        if day != self.day {
            self.history.insert(0, (self.day, self.today, self.today_volume));
            self.history.truncate(HISTORY_DAYS);
            self.day = day; self.today = 0; self.today_volume = 0;
        }
        self.today += 1; self.today_volume += cost; self.total += 1; self.total_volume += cost;
        env::log_str(&format!(
            r#"EVENT_JSON:{{"standard":"ftf_market","version":"1.0.0","event":"trade","data":[{{"buyer":"{}","seller":"{}","item":"{}","qty":{},"price":{},"n":{}}}]}}"#,
            buyer, to, item, qty, price, self.total
        ));
    }

    pub fn stats(&self) -> Stats {
        // A view cannot write: a day that ended without a trade shows as today = 0.
        let day = (env::block_timestamp_ms() / DAY_MS) as u32;
        let (mut today, mut today_volume, mut history) = (self.today, self.today_volume, self.history.clone());
        if day != self.day { history.insert(0, (self.day, today, today_volume)); history.truncate(HISTORY_DAYS); today = 0; today_volume = 0; }
        Stats { day, today, today_volume, total: self.total, total_volume: self.total_volume, traders: self.traders.len(), paused: self.paused, history }
    }

    pub fn items(&self) -> Vec<ItemView> {
        self.items.iter().zip(&self.last).map(|(i, &last)| ItemView { id: i.id.clone(), base: i.base, last }).collect()
    }

    pub fn balance_of(&self, account_id: AccountId) -> Option<u64> { self.balances.get(&account_id).copied() }

    pub fn balances(&self) -> Vec<(AccountId, u64)> {
        self.traders.iter().map(|t| (t.clone(), *self.balances.get(t).unwrap())).collect()
    }

    pub fn owner(&self) -> AccountId { self.owner_id.clone() }
}

#[cfg(test)]
mod tests;
