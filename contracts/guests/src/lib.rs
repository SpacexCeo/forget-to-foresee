//! Forget to Foresee, Day 1 (NEAR testnet): guest accounts and the free mint of Elise.
//!
//! `create_guest(public_key, nickname)` creates `<nick>-<id>.<this contract>` with the player's browser-generated key
//! as its full-access key, funds its storage, and, once the account exists, mints Elise (heroine contract) to it.
//! One guest per public key, a sanitized nickname, a daily cap. It is called with a function-call key of this contract
//! that is limited to `create_guest` (the only key the web client holds); the owner may call it too. If the mint
//! fails, the guest record stays with `minted: false` and calling `create_guest` again with the same key retries it.
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PublicKey};

pub const ERR_NOT_ALLOWED: &str = "ERR_NOT_ALLOWED: create_guest is called with this contract's guest key or by the owner";
pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the owner can call this";
pub const ERR_EXISTS: &str = "ERR_EXISTS: this key already has a guest with Elise";
pub const ERR_PENDING: &str = "ERR_PENDING: this key's guest is being created";
pub const ERR_CAP: &str = "ERR_CAP: today's free mints are used up; try again tomorrow";
const DAY_NS: u64 = 86_400_000_000_000;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey { Guests, Pending }

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Guest {
    pub account_id: AccountId,
    pub token_id: String,
    pub nickname: String,
    pub minted: bool,
}

#[near(serializers = [json])]
pub struct Stats { pub guests: u64, pub today: u32, pub daily_cap: u32, pub fund: U128 }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    heroine: AccountId,
    guests: LookupMap<PublicKey, Guest>,
    pending: LookupMap<PublicKey, Guest>,
    counter: u64,
    day: u64,
    today: u32,
    daily_cap: u32,
    fund: NearToken,
    elise_media: String,
}

/// Lower-case a-z and 0-9 only, at most 12 characters; "guest" when nothing is left.
pub fn sanitize(nick: &str) -> String {
    let s: String = nick.to_lowercase().chars().filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit()).take(12).collect();
    if s.is_empty() { "guest".into() } else { s }
}

/// A short base-36 id.
pub fn base36(mut n: u64) -> String {
    const D: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 { return "0".into(); }
    let mut out = Vec::new();
    while n > 0 { out.push(D[(n % 36) as usize]); n /= 36; }
    out.reverse();
    String::from_utf8(out).unwrap()
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, heroine: AccountId, daily_cap: u32, elise_media: String) -> Self {
        Self { owner_id, heroine, guests: LookupMap::new(StorageKey::Guests), pending: LookupMap::new(StorageKey::Pending), counter: 0, day: 0, today: 0, daily_cap, fund: NearToken::from_millinear(50), elise_media }
    }

    fn assert_owner(&self) { require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER); }
    pub fn set_daily_cap(&mut self, daily_cap: u32) { self.assert_owner(); self.daily_cap = daily_cap; }
    pub fn set_fund(&mut self, yocto: U128) { self.assert_owner(); self.fund = NearToken::from_yoctonear(yocto.0); }
    pub fn set_elise_media(&mut self, url: String) { self.assert_owner(); self.elise_media = url; }

    pub fn guest_of(&self, public_key: PublicKey) -> Option<Guest> { self.guests.get(&public_key).cloned() }
    pub fn stats(&self) -> Stats { Stats { guests: self.counter, today: if env::block_timestamp() / DAY_NS == self.day { self.today } else { 0 }, daily_cap: self.daily_cap, fund: U128(self.fund.as_yoctonear()) } }

    /// Creates the guest account and mints Elise to it (or retries the mint for a guest whose mint failed).
    pub fn create_guest(&mut self, public_key: PublicKey, nickname: String) -> Promise {
        let caller = env::predecessor_account_id();
        require!(caller == env::current_account_id() || caller == self.owner_id, ERR_NOT_ALLOWED);
        require!(self.pending.get(&public_key).is_none(), ERR_PENDING);
        if let Some(g) = self.guests.get(&public_key).cloned() {
            require!(!g.minted, ERR_EXISTS);
            return self.mint(public_key, g); // retry: the account exists, the mint did not land
        }
        let day = env::block_timestamp() / DAY_NS;
        if day != self.day { self.day = day; self.today = 0; }
        require!(self.today < self.daily_cap, ERR_CAP);
        self.today += 1;
        self.counter += 1;
        let sub = format!("{}-{}", sanitize(&nickname), base36(self.counter));
        let account_id: AccountId = format!("{}.{}", sub, env::current_account_id()).parse().unwrap();
        let guest = Guest { account_id: account_id.clone(), token_id: format!("elise-{}", sub), nickname: sanitize(&nickname), minted: false };
        self.pending.insert(public_key.clone(), guest.clone());
        let cb = near_sdk::serde_json::json!({ "public_key": public_key }).to_string().into_bytes();
        Promise::new(account_id)
            .create_account()
            .add_full_access_key(public_key)
            .transfer(self.fund)
            .then(Promise::new(env::current_account_id()).function_call("on_account".to_string(), cb, NearToken::from_yoctonear(0), Gas::from_tgas(60)))
    }

    fn mint(&self, public_key: PublicKey, g: Guest) -> Promise {
        let metadata = near_sdk::serde_json::json!({
            "title": "Elise",
            "description": "Forget to Foresee heroine. Day 1 free mint on NEAR testnet to the player's own guest account.",
            "media": self.elise_media,
            "copies": 1,
        });
        let args = near_sdk::serde_json::json!({ "token_id": g.token_id, "receiver_id": g.account_id, "metadata": metadata }).to_string().into_bytes();
        let cb = near_sdk::serde_json::json!({ "public_key": public_key }).to_string().into_bytes();
        Promise::new(self.heroine.clone())
            .function_call("nft_mint".to_string(), args, NearToken::from_yoctonear(0), Gas::from_tgas(25))
            .then(Promise::new(env::current_account_id()).function_call("on_minted".to_string(), cb, NearToken::from_yoctonear(0), Gas::from_tgas(5)))
    }

    /// After the account: on success the guest is recorded and Elise is minted; on failure the key is free again.
    #[private]
    pub fn on_account(&mut self, public_key: PublicKey, #[callback_result] result: Result<(), PromiseError>) -> Option<Promise> {
        let g = self.pending.remove(&public_key)?;
        if result.is_err() { self.today = self.today.saturating_sub(1); return None; }
        self.guests.insert(public_key.clone(), g.clone());
        Some(self.mint(public_key, g))
    }

    /// After the mint: `minted` is true only when the heroine contract confirmed it.
    #[private]
    pub fn on_minted(&mut self, public_key: PublicKey, #[callback_result] result: Result<near_sdk::serde_json::Value, PromiseError>) -> bool {
        let ok = result.is_ok();
        if let Some(g) = self.guests.get_mut(&public_key) { g.minted = ok; }
        ok
    }
}

#[cfg(all(test, not(target_family = "wasm")))]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const ME: &str = "guests.ftf-coordinator.testnet";
    fn acc(s: &str) -> AccountId { s.parse().unwrap() }
    fn ctx(pred: &str, day: u64) { testing_env!(VMContextBuilder::new().current_account_id(acc(ME)).predecessor_account_id(acc(pred)).block_timestamp(day * DAY_NS + 5).account_balance(NearToken::from_near(20)).build()); }
    fn pk(n: u8) -> PublicKey { let mut b = vec![0u8]; b.extend([n; 32]); PublicKey::try_from(b).unwrap() }
    fn contract(cap: u32) -> Contract { ctx("ftf-coordinator.testnet", 1); Contract::new(acc("ftf-coordinator.testnet"), acc("heroine.ftf-coordinator.testnet"), cap, "https://example.test/elise.webp".into()) }

    #[test]
    fn nickname_sanitizing_and_ids() {
        assert_eq!(sanitize("Ann the Brave!"), "annthebrave");
        assert_eq!(sanitize("Анна"), "guest");
        assert_eq!(sanitize("a.b-c_d"), "abcd");
        assert_eq!(sanitize(&"x".repeat(40)).len(), 12);
        assert_eq!(base36(0), "0"); assert_eq!(base36(35), "z"); assert_eq!(base36(36), "10");
    }

    #[test]
    fn happy_path_creates_then_mints_and_records() {
        let mut c = contract(10);
        ctx(ME, 1);
        let _ = c.create_guest(pk(1), "Ann!".into());
        assert!(c.pending.get(&pk(1)).is_some());
        assert_eq!(c.pending.get(&pk(1)).unwrap().account_id, acc("ann-1.guests.ftf-coordinator.testnet"));
        ctx(ME, 1);
        assert!(c.on_account(pk(1), Ok(())).is_some());
        let g = c.guest_of(pk(1)).unwrap();
        assert_eq!((g.token_id.as_str(), g.minted), ("elise-ann-1", false));
        assert!(c.on_minted(pk(1), Ok(near_sdk::serde_json::Value::Null)));
        assert!(c.guest_of(pk(1)).unwrap().minted);
    }

    #[test]
    #[should_panic(expected = "ERR_EXISTS")]
    fn one_guest_per_key() {
        let mut c = contract(10);
        ctx(ME, 1);
        let _ = c.create_guest(pk(2), "bo".into());
        c.on_account(pk(2), Ok(()));
        c.on_minted(pk(2), Ok(near_sdk::serde_json::Value::Null));
        let _ = c.create_guest(pk(2), "bo".into());
    }

    #[test]
    #[should_panic(expected = "ERR_PENDING")]
    fn a_key_in_flight_cannot_start_twice() {
        let mut c = contract(10);
        ctx(ME, 1);
        let _ = c.create_guest(pk(3), "cy".into());
        let _ = c.create_guest(pk(3), "cy".into());
    }

    #[test]
    fn a_failed_account_frees_the_key_and_the_cap_slot() {
        let mut c = contract(1);
        ctx(ME, 1);
        let _ = c.create_guest(pk(4), "dee".into());
        assert!(c.on_account(pk(4), Err(PromiseError::Failed)).is_none());
        assert!(c.guest_of(pk(4)).is_none());
        assert_eq!(c.stats().today, 0);
        let _ = c.create_guest(pk(4), "dee".into()); // allowed again
    }

    #[test]
    fn a_failed_mint_is_retried_by_calling_again() {
        let mut c = contract(10);
        ctx(ME, 1);
        let _ = c.create_guest(pk(5), "eve".into());
        c.on_account(pk(5), Ok(()));
        assert!(!c.on_minted(pk(5), Err(PromiseError::Failed)));
        assert!(!c.guest_of(pk(5)).unwrap().minted);
        let before = c.counter;
        let _ = c.create_guest(pk(5), "eve".into()); // retry: no new account
        assert_eq!(c.counter, before);
    }

    #[test]
    #[should_panic(expected = "ERR_CAP")]
    fn the_daily_cap_holds() {
        let mut c = contract(2);
        ctx(ME, 1);
        let _ = c.create_guest(pk(6), "a".into());
        let _ = c.create_guest(pk(7), "b".into());
        let _ = c.create_guest(pk(8), "c".into());
    }

    #[test]
    fn the_cap_resets_the_next_day() {
        let mut c = contract(1);
        ctx(ME, 1);
        let _ = c.create_guest(pk(9), "a".into());
        ctx(ME, 2);
        let _ = c.create_guest(pk(10), "b".into());
        assert_eq!(c.stats().today, 1);
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_ALLOWED")]
    fn strangers_cannot_spend_the_fund() {
        let mut c = contract(10);
        ctx("mallory.testnet", 1);
        let _ = c.create_guest(pk(11), "m".into());
    }
}
