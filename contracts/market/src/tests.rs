use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const DAY_NS: u64 = 86_400_000_000_000;
fn acc(s: &str) -> AccountId { s.parse().unwrap() }
fn ctx_at(who: &str, ns: u64) {
    testing_env!(VMContextBuilder::new().predecessor_account_id(acc(who)).current_account_id(acc("market.x.testnet")).block_timestamp(ns).account_balance(NearToken::from_near(10)).build());
}
fn ctx(who: &str) { ctx_at(who, 20_000 * DAY_NS + 1) }
fn items() -> Vec<Item> { vec![Item { id: "bread".into(), base: 4 }, Item { id: "lamp_oil".into(), base: 10 }] }
fn ready() -> Market {
    ctx("owner.testnet");
    let mut m = Market::new(acc("owner.testnet"), items());
    m.add_traders(vec![acc("tf-baker.testnet"), acc("tf-guard.testnet"), acc("tf-elder.testnet")], 100);
    m
}

#[test]
fn trade_moves_silk_and_logs_an_event() {
    let mut m = ready();
    ctx("tf-guard.testnet");
    m.trade(acc("tf-baker.testnet"), "bread".into(), 3, 5);
    assert_eq!(m.balance_of(acc("tf-guard.testnet")), Some(85));
    assert_eq!(m.balance_of(acc("tf-baker.testnet")), Some(115));
    let logs = get_logs();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0], r#"EVENT_JSON:{"standard":"ftf_market","version":"1.0.0","event":"trade","data":[{"buyer":"tf-guard.testnet","seller":"tf-baker.testnet","item":"bread","qty":3,"price":5,"n":1}]}"#);
    let s = m.stats();
    assert_eq!((s.today, s.today_volume, s.total, s.traders), (1, 15, 1, 3));
    assert_eq!(m.items()[0].last, 5);
}

#[test]
fn total_silk_is_conserved_over_many_trades() {
    let mut m = ready();
    let names = ["tf-baker.testnet", "tf-guard.testnet", "tf-elder.testnet"];
    for k in 0..300u32 {
        let (b, s) = (names[(k % 3) as usize], names[((k + 1 + k / 3) % 3) as usize]);
        if b == s { continue; }
        ctx(b);
        if m.balance_of(acc(b)).unwrap() >= 8 { m.trade(acc(s), "bread".into(), 2, 4); }
    }
    let sum: u64 = m.balances().iter().map(|(_, v)| v).sum();
    assert_eq!(sum, 300);
}

#[test]
#[should_panic(expected = "ERR_FUNDS")]
fn balance_never_goes_negative() { let mut m = ready(); ctx("tf-guard.testnet"); m.trade(acc("tf-baker.testnet"), "lamp_oil".into(), 11, 10); }

#[test]
#[should_panic(expected = "ERR_NOT_TRADER")]
fn strangers_cannot_trade() { let mut m = ready(); ctx("eve.testnet"); m.trade(acc("tf-baker.testnet"), "bread".into(), 1, 4); }

#[test]
#[should_panic(expected = "ERR_NO_SELLER")]
fn seller_must_be_a_trader() { let mut m = ready(); ctx("tf-guard.testnet"); m.trade(acc("eve.testnet"), "bread".into(), 1, 4); }

#[test]
#[should_panic(expected = "ERR_SELF")]
fn no_self_trades() { let mut m = ready(); ctx("tf-guard.testnet"); m.trade(acc("tf-guard.testnet"), "bread".into(), 1, 4); }

#[test]
#[should_panic(expected = "ERR_PRICE")]
fn price_band_holds() { let mut m = ready(); ctx("tf-guard.testnet"); m.trade(acc("tf-baker.testnet"), "bread".into(), 1, 9); }

#[test]
#[should_panic(expected = "ERR_QTY")]
fn qty_band_holds() { let mut m = ready(); ctx("tf-guard.testnet"); m.trade(acc("tf-baker.testnet"), "bread".into(), 21, 4); }

#[test]
#[should_panic(expected = "ERR_ITEM")]
fn unknown_items_fail() { let mut m = ready(); ctx("tf-guard.testnet"); m.trade(acc("tf-baker.testnet"), "gold".into(), 1, 4); }

#[test]
#[should_panic(expected = "ERR_PAUSED")]
fn paused_market_refuses_trades() {
    let mut m = ready(); m.set_paused(true);
    ctx("tf-guard.testnet"); m.trade(acc("tf-baker.testnet"), "bread".into(), 1, 4);
}

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn only_owner_registers() { let mut m = ready(); ctx("tf-guard.testnet"); m.add_traders(vec![acc("eve.testnet")], 1_000_000); }

#[test]
fn day_rollover_keeps_a_rolling_history() {
    let mut m = ready();
    for d in 0..20u64 {
        ctx_at("tf-guard.testnet", (20_000 + d) * DAY_NS + 5);
        m.trade(acc("tf-baker.testnet"), "bread".into(), 1, 2);
        ctx_at("tf-baker.testnet", (20_000 + d) * DAY_NS + 6);
        m.trade(acc("tf-guard.testnet"), "bread".into(), 1, 2);
    }
    let s = m.stats();
    assert_eq!((s.day, s.today, s.total), (20_019, 2, 40));
    assert_eq!(s.history.len(), HISTORY_DAYS);
    assert_eq!(s.history[0], (20_018, 2, 4));
    // a quiet day shows zero today, without writing
    ctx_at("tf-guard.testnet", 20_025 * DAY_NS);
    let q = m.stats();
    assert_eq!((q.day, q.today, q.history[0]), (20_025, 0, (20_019, 2, 4)));
}

#[test]
fn storage_stays_flat_after_the_first_trades() {
    let mut m = ready();
    ctx("tf-guard.testnet"); m.trade(acc("tf-baker.testnet"), "bread".into(), 1, 4);
    let save = |m: &mut Market| { m.balances.flush(); m.traders.flush(); near_sdk::env::state_write(m); env::storage_usage() };
    let before = save(&mut m);
    for _ in 0..50 { ctx("tf-guard.testnet"); m.trade(acc("tf-baker.testnet"), "bread".into(), 1, 4); ctx("tf-baker.testnet"); m.trade(acc("tf-guard.testnet"), "bread".into(), 1, 4); }
    let after = save(&mut m);
    assert!(after <= before + 8, "storage grew: {} -> {}", before, after);
}

#[test]
fn set_items_keeps_last_prices_and_fund_adds_silk() {
    let mut m = ready();
    ctx("tf-guard.testnet"); m.trade(acc("tf-baker.testnet"), "lamp_oil".into(), 1, 12);
    ctx("owner.testnet");
    m.set_items(vec![Item { id: "lamp_oil".into(), base: 10 }, Item { id: "candle".into(), base: 2 }]);
    let v = m.items();
    assert_eq!((v[0].last, v[1].last), (12, 2));
    m.fund(acc("tf-guard.testnet"), 50);
    assert_eq!(m.balance_of(acc("tf-guard.testnet")), Some(138));
}
