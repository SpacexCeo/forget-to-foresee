use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const H: &str = "10ca9786c0c7cb3286f3022853cde8474441672f1e1f47171af7ff02987c4be6";

fn ctx(who: &str, deposit: NearToken) {
    testing_env!(VMContextBuilder::new().predecessor_account_id(who.parse().unwrap()).current_account_id("ledger.x.testnet".parse().unwrap()).attached_deposit(deposit).block_timestamp(7).build());
}
fn rec(c: &mut Contract, epoch: u32, trades: &str, pnl: i32) -> Track {
    c.record_track("innkeeper".into(), epoch, format!("innkeeper-{}", epoch), "town-ts-1".into(), "{\"temperament\":\"steady\",\"price\":10,\"rounds\":5,\"before\":null}".into(), H.into(), H.into(), 3, 40, trades.into(), pnl)
}

#[test]
fn record_and_read_back_with_summary() {
    ctx("ann-1.guests.x.testnet", NearToken::from_millinear(20));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    let t = rec(&mut c, 1, "0,12,0,200,196;1,30,1,200,205;2,7,2,200,196;0,9,0,200,190;1,22,0,200,201", -120);
    assert_eq!(t.trades, 5);
    assert_eq!(t.account_id.as_str(), "ann-1.guests.x.testnet");
    rec(&mut c, 2, "0,12,0,200,210", 500);
    let acc: AccountId = "ann-1.guests.x.testnet".parse().unwrap();
    assert_eq!(c.get_track(acc.clone(), "innkeeper".into(), 1).unwrap().pnl_bp, -120);
    assert!(c.get_track(acc.clone(), "innkeeper".into(), 3).is_none());
    assert_eq!(c.list_tracks(acc.clone(), "innkeeper".into(), None, None).len(), 2);
    assert_eq!(c.agent_summary(acc.clone(), "innkeeper".into()), Summary { epochs: 2, trades: 6, pnl_bp_sum: 380 });
    assert_eq!(c.agent_summary(acc, "baker".into()), Summary::default());
    assert_eq!(c.stats().0, 2);
}

#[test]
#[should_panic(expected = "ERR_EXISTS")]
fn an_epoch_is_recorded_once() {
    ctx("a.testnet", NearToken::from_millinear(20));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    rec(&mut c, 1, "0,1,0,1,1", 0);
    rec(&mut c, 1, "0,1,0,1,1", 0);
}

#[test]
#[should_panic(expected = "ERR_TRADES")]
fn malformed_trades_are_refused() {
    ctx("a.testnet", NearToken::from_millinear(20));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    rec(&mut c, 1, "0,1,0,1", 0);
}

#[test]
#[should_panic(expected = "ERR_TRADES")]
fn more_than_fifty_trades_are_refused() {
    ctx("a.testnet", NearToken::from_millinear(50));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    let many = vec!["0,1,0,1,1"; 51].join(";");
    rec(&mut c, 1, &many, 0);
}

#[test]
#[should_panic(expected = "ERR_DEPOSIT")]
fn storage_must_be_paid() {
    ctx("a.testnet", NearToken::from_yoctonear(0));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    rec(&mut c, 1, "0,1,0,1,1", 0);
}

#[test]
#[should_panic(expected = "ERR_HASH")]
fn hashes_are_hex() {
    ctx("a.testnet", NearToken::from_millinear(20));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    c.record_track("innkeeper".into(), 1, "s".into(), "town-ts-1".into(), "{}".into(), "xyz".into(), H.into(), 0, 1, "0,1,0,1,1".into(), 0);
}

#[test]
#[should_panic(expected = "ERR_NPC")]
fn npc_names_are_checked() {
    ctx("a.testnet", NearToken::from_millinear(20));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    c.record_track("Inn Keeper".into(), 1, "s".into(), "town-ts-1".into(), "{}".into(), H.into(), H.into(), 0, 1, "0,1,0,1,1".into(), 0);
}
