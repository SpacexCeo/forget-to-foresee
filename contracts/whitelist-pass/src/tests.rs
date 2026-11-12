use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, NearToken, PromiseResult};

const CONTRACT: &str = "pass.owner.testnet";
const OWNER: &str = "owner.testnet";
const MINTER: &str = "minter.owner.testnet";

fn acc(s: &str) -> AccountId { s.parse().unwrap() }
fn claim(n: u32) -> String { format!("{:064x}", n as u128 * 0x9e3779b97f4a7c15 + 7) }

struct Env { who: String, deposit: NearToken, day: u64, balance: NearToken, usage: Option<u64> }
impl Env {
    fn new(who: &str) -> Self { Env { who: who.into(), deposit: NearToken::from_yoctonear(0), day: 20_400, balance: NearToken::from_near(50), usage: None } }
    fn deposit(mut self, y: u128) -> Self { self.deposit = NearToken::from_yoctonear(y); self }
    fn day(mut self, d: u64) -> Self { self.day = d; self }
    fn balance(mut self, b: NearToken) -> Self { self.balance = b; self }
    fn set(self) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(acc(CONTRACT)).predecessor_account_id(acc(&self.who)).signer_account_id(acc(&self.who))
            .attached_deposit(self.deposit).block_timestamp(self.day * NANOS_PER_DAY + 3_600_000_000_000).account_balance(self.balance);
        if let Some(u) = self.usage { b.storage_usage(u); }
        testing_env!(b.build());
    }
}
/// Keeps the VM's storage counter running across context switches (testing_env! would reset it otherwise).
fn keep(e: Env) { let u = env::storage_usage(); Env { usage: Some(u), ..e }.set(); }

fn ready(cap: u32, daily: u32) -> Contract { Env::new(OWNER).set(); Contract::new(acc(OWNER), acc(MINTER), cap, daily) }
fn mint(c: &mut Contract, to: &str, n: u32) -> Token { keep(Env::new(MINTER)); c.mint_pass(acc(to), claim(n)) }

#[test]
fn mint_records_wallet_claim_and_metadata() {
    let mut c = ready(1000, 100);
    let t = mint(&mut c, "ann.near", 1);
    assert_eq!(t.token_id, "1");
    assert_eq!(t.owner_id, acc("ann.near"));
    let m = t.metadata.unwrap();
    assert_eq!(m.title.as_deref(), Some("FTF Whitelist Pass #1"));
    assert!(m.description.unwrap().contains("No monetary value is promised"));
    assert_eq!(m.extra.as_deref(), Some(format!("{{\"board_season\":1,\"claim\":\"{}\"}}", claim(1)).as_str()));
    assert!(m.issued_at.is_some());
    assert!(c.has_minted(acc("ann.near")) && c.is_whitelisted(acc("ann.near")) && c.is_claimed(claim(1)));
    assert!(!c.has_minted(acc("bob.near")) && !c.is_whitelisted(acc("bob.near")) && !c.is_claimed(claim(2)));
    let i = c.pass_info();
    assert_eq!((i.cap, i.daily_cap, i.minted, i.minted_today, i.paused), (1000, 100, 1, 1, false));
    assert_eq!((c.minter(), c.owner(), c.paused()), (acc(MINTER), acc(OWNER), false));
    assert_eq!(c.nft_total_supply().0, 1);
    assert_eq!(c.nft_tokens(None, None).len(), 1);
    assert_eq!(c.nft_tokens_for_owner(acc("ann.near"), None, None)[0].token_id, "1");
    assert_eq!(c.nft_metadata().symbol, "FTFPASS");
}

#[test]
fn mint_with_zero_deposit_storage_delta_printed() {
    let mut c = ready(1000, 100);
    mint(&mut c, "warmup.near", 1); // first-write overheads out of the way
    let before = env::storage_usage();
    mint(&mut c, "ann.near", 2);
    let delta = env::storage_usage() - before;
    println!("STORAGE mint_pass: {} bytes (x 1e19 yocto = {} NEAR)", delta, delta as f64 * 1e-5);
    assert!(delta > 0 && delta < 2_000, "{}", delta);
}

#[test]
#[should_panic(expected = "ERR_NOT_MINTER")]
fn non_minter_rejected() { let mut c = ready(10, 10); keep(Env::new("ann.near")); c.mint_pass(acc("ann.near"), claim(1)); }

#[test]
#[should_panic(expected = "ERR_NOT_MINTER")]
fn owner_cannot_mint() { let mut c = ready(10, 10); keep(Env::new(OWNER)); c.mint_pass(acc(OWNER), claim(1)); }

#[test]
#[should_panic(expected = "ERR_DEPOSIT")]
fn mint_refuses_a_deposit() { let mut c = ready(10, 10); keep(Env::new(MINTER).deposit(1)); c.mint_pass(acc("ann.near"), claim(1)); }

#[test]
#[should_panic(expected = "ERR_SOLD_OUT")]
fn total_cap_holds() { let mut c = ready(2, 2); for k in 0..3 { mint(&mut c, &format!("p{}.near", k), k + 1); } }

#[test]
fn daily_cap_resets_at_utc_midnight() {
    let mut c = ready(10, 2);
    mint(&mut c, "a.near", 1); mint(&mut c, "b.near", 2);
    keep(Env::new(MINTER));
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.mint_pass(acc("c.near"), claim(3)); }));
    assert!(r.is_err(), "the third pass of the day is refused");
    keep(Env::new(MINTER).day(20_401)); // the next UTC day
    c.mint_pass(acc("c.near"), claim(3));
    assert_eq!(c.pass_info().minted_today, 1);
    assert_eq!(c.pass_info().minted, 3);
}

#[test]
#[should_panic(expected = "ERR_DAILY_CAP")]
fn daily_cap_holds() { let mut c = ready(10, 1); mint(&mut c, "a.near", 1); mint(&mut c, "b.near", 2); }

#[test]
#[should_panic(expected = "ERR_WALLET_MINTED")]
fn second_mint_to_same_wallet_rejected() { let mut c = ready(10, 10); mint(&mut c, "ann.near", 1); mint(&mut c, "ann.near", 2); }

#[test]
#[should_panic(expected = "ERR_WALLET_MINTED")]
fn wallet_that_sent_its_pass_away_cannot_mint_again() {
    let mut c = ready(10, 10);
    mint(&mut c, "ann.near", 1);
    keep(Env::new("ann.near").deposit(1)); c.nft_transfer(acc("bob.near"), "1".into(), None, None);
    assert!(!c.is_whitelisted(acc("ann.near")) && c.has_minted(acc("ann.near")));
    mint(&mut c, "ann.near", 2);
}

#[test]
#[should_panic(expected = "ERR_CLAIM_USED")]
fn same_claim_for_another_wallet_rejected() { let mut c = ready(10, 10); mint(&mut c, "ann.near", 1); mint(&mut c, "bob.near", 1); }

#[test]
fn claim_id_must_be_64_lowercase_hex() {
    for bad in ["", "abc", &"A".repeat(64), &"g".repeat(64), &"a".repeat(63), &"a".repeat(65)] {
        let mut c = ready(10, 10); keep(Env::new(MINTER));
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.mint_pass(acc("ann.near"), bad.to_string()); }));
        assert!(r.is_err(), "{:?}", bad);
    }
}

#[test]
fn transfer_moves_the_pass_and_the_spot() {
    let mut c = ready(10, 10);
    mint(&mut c, "ann.near", 1);
    let before = env::storage_usage();
    keep(Env::new("ann.near").deposit(1));
    c.nft_transfer(acc("bob.near"), "1".into(), None, Some("gift".into()));
    let delta = env::storage_usage() as i64 - before as i64;
    println!("STORAGE nft_transfer: {} bytes net", delta);
    assert_eq!(c.nft_token("1".into()).unwrap().owner_id, acc("bob.near"));
    assert!(!c.is_whitelisted(acc("ann.near")) && c.is_whitelisted(acc("bob.near")));
    assert!(c.has_minted(acc("ann.near")) && !c.has_minted(acc("bob.near")), "has_minted follows the mint, not the holder");
    assert_eq!(c.nft_supply_for_owner(acc("ann.near")).0, 0);
    assert_eq!(c.nft_tokens_for_owner(acc("bob.near"), None, None)[0].token_id, "1");
}

#[test]
#[should_panic]
fn transfer_by_non_owner_rejected() { let mut c = ready(10, 10); mint(&mut c, "ann.near", 1); keep(Env::new("eve.near").deposit(1)); c.nft_transfer(acc("eve.near"), "1".into(), None, None); }

#[test]
#[should_panic]
fn transfer_with_zero_yocto_rejected() { let mut c = ready(10, 10); mint(&mut c, "ann.near", 1); keep(Env::new("ann.near")); c.nft_transfer(acc("bob.near"), "1".into(), None, None); }

#[test]
#[should_panic]
fn self_transfer_rejected() { let mut c = ready(10, 10); mint(&mut c, "ann.near", 1); keep(Env::new("ann.near").deposit(1)); c.nft_transfer(acc("ann.near"), "1".into(), None, None); }

#[test]
#[should_panic(expected = "ERR_NO_APPROVALS")]
fn approval_id_panics_on_transfer() { let mut c = ready(10, 10); mint(&mut c, "ann.near", 1); keep(Env::new("ann.near").deposit(1)); c.nft_transfer(acc("bob.near"), "1".into(), Some(0), None); }

#[test]
#[should_panic(expected = "ERR_NO_APPROVALS")]
fn approval_id_panics_on_transfer_call() { let mut c = ready(10, 10); mint(&mut c, "ann.near", 1); keep(Env::new("ann.near").deposit(1)); let _ = c.nft_transfer_call(acc("bob.near"), "1".into(), Some(1), None, "".into()); }

fn resolve(c: &mut Contract, receiver_says_return: bool) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc(CONTRACT)).predecessor_account_id(acc(CONTRACT)).storage_usage(env::storage_usage()).account_balance(NearToken::from_near(50));
    let ret = if receiver_says_return { b"true".to_vec() } else { b"false".to_vec() };
    testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Successful(ret)]);
    c.nft_resolve_transfer(acc("ann.near"), acc("market.near"), "1".into(), None);
}

#[test]
fn transfer_call_receiver_returns_true_token_goes_back() {
    let mut c = ready(10, 10);
    mint(&mut c, "ann.near", 1);
    keep(Env::new("ann.near").deposit(1));
    let _ = c.nft_transfer_call(acc("market.near"), "1".into(), None, None, "hello".into());
    assert_eq!(c.nft_token("1".into()).unwrap().owner_id, acc("market.near"));
    resolve(&mut c, true);
    assert_eq!(c.nft_token("1".into()).unwrap().owner_id, acc("ann.near"));
}

#[test]
fn transfer_call_receiver_returns_false_token_stays() {
    let mut c = ready(10, 10);
    mint(&mut c, "ann.near", 1);
    keep(Env::new("ann.near").deposit(1));
    let _ = c.nft_transfer_call(acc("market.near"), "1".into(), None, None, "hello".into());
    resolve(&mut c, false);
    assert_eq!(c.nft_token("1".into()).unwrap().owner_id, acc("market.near"));
}

#[test]
fn pause_stops_minting_only() {
    let mut c = ready(10, 10);
    mint(&mut c, "ann.near", 1);
    keep(Env::new(OWNER)); c.pause();
    assert!(c.paused() && c.pass_info().paused);
    keep(Env::new(MINTER));
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.mint_pass(acc("bob.near"), claim(2)); }));
    assert!(r.is_err(), "paused: no mint");
    keep(Env::new("ann.near").deposit(1)); c.nft_transfer(acc("bob.near"), "1".into(), None, None);
    assert_eq!(c.nft_token("1".into()).unwrap().owner_id, acc("bob.near"), "paused: transfers still work");
    keep(Env::new(OWNER)); c.unpause();
    mint(&mut c, "cat.near", 2);
    assert_eq!(c.pass_info().minted, 2);
}

#[test]
#[should_panic(expected = "ERR_PAUSED")]
fn paused_mint_panics() { let mut c = ready(10, 10); keep(Env::new(OWNER)); c.pause(); mint(&mut c, "ann.near", 1); }

#[test]
fn holder_of_two_passes_is_whitelisted_once() {
    let mut c = ready(10, 10);
    mint(&mut c, "ann.near", 1); mint(&mut c, "bob.near", 2);
    keep(Env::new("bob.near").deposit(1)); c.nft_transfer(acc("ann.near"), "2".into(), None, None);
    assert_eq!(c.nft_supply_for_owner(acc("ann.near")).0, 2);
    assert!(c.is_whitelisted(acc("ann.near")));
}

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn only_owner_pauses() { let mut c = ready(10, 10); keep(Env::new(MINTER)); c.pause(); }

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn only_owner_sets_minter() { let mut c = ready(10, 10); keep(Env::new(MINTER)); c.set_minter(acc("eve.near")); }

#[test]
fn owner_rotates_minter_and_sets_shared_media() {
    let mut c = ready(10, 10);
    mint(&mut c, "ann.near", 1);
    keep(Env::new(OWNER));
    c.set_media(Some("https://example.org/pass.png".into()));
    c.set_minter(acc("minter2.owner.testnet"));
    assert_eq!(c.nft_token("1".into()).unwrap().metadata.unwrap().media.as_deref(), Some("https://example.org/pass.png"), "media shown on minted tokens");
    keep(Env::new(MINTER));
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.mint_pass(acc("bob.near"), claim(2)); }));
    assert!(r.is_err(), "the old minter is out");
    keep(Env::new("minter2.owner.testnet"));
    c.mint_pass(acc("bob.near"), claim(2));
}

#[test]
#[should_panic(expected = "ERR_LOW_BALANCE")]
fn low_balance_guard_stops_a_mint() {
    let mut c = ready(10, 10);
    // just enough for the storage already used, less than the reserve once the mint adds its bytes
    let locked = env::storage_usage() as u128 * env::storage_byte_cost().as_yoctonear();
    keep(Env::new(MINTER).balance(NearToken::from_yoctonear(locked + RESERVE.as_yoctonear())));
    c.mint_pass(acc("ann.near"), claim(1));
}

#[test]
fn init_checks_the_caps() {
    for (cap, daily) in [(0u32, 0u32), (10, 0), (10, 11), (10_001, 100)] {
        Env::new(OWNER).set();
        let r = std::panic::catch_unwind(|| { Contract::new(acc(OWNER), acc(MINTER), cap, daily); });
        assert!(r.is_err(), "{} {}", cap, daily);
    }
}
