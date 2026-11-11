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

const TEE_TEXT: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TEE_SIG: &str = "0xd47644539acec3da5e3ecf5fe8863c628a9c97e8b71e9ea9167a6f4f83c03c3243ae1786b94340698cc46ca33276da33c14b2b58281c7f4d1c5628c4557ce6751c";
const TEE_ADDR: &str = "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23";
fn tee(c: &mut Contract, chat: &str, text: &str, resp: &str, sig: &str) -> TeeDecision {
    c.record_tee_decision("courier".into(), "sell".into(), H.into(), "Qwen/Qwen3-VL-30B-A3B-Instruct".into(), chat.into(), text.into(), resp.into(), sig.into(), TEE_ADDR.into())
}

#[test]
fn ethereum_personal_sign_vector_recovers() {
    ctx("ann-1.guests.x.testnet", NearToken::from_millinear(20));
    assert_eq!(recover_personal("Some data", "0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c").unwrap(), TEE_ADDR.to_ascii_lowercase());
    assert_eq!(recover_personal("Some data", "0x00"), None);
}

#[test]
fn tee_decision_recorded_after_signature_check() {
    ctx("ann-1.guests.x.testnet", NearToken::from_millinear(20));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    let d = tee(&mut c, "chatcmpl-1", TEE_TEXT, &"bb".repeat(32), TEE_SIG);
    assert_eq!(d.signing_address, TEE_ADDR.to_ascii_lowercase());
    let acc: AccountId = "ann-1.guests.x.testnet".parse().unwrap();
    assert_eq!(c.list_tee_decisions(acc.clone(), "courier".into(), None, None), vec![d]);
    assert!(c.list_tee_decisions(acc, "baker".into(), None, None).is_empty());
    assert_eq!(c.stats().0, 0); // track records unchanged
}

#[test]
#[should_panic(expected = "ERR_TEE_SIG")]
fn tee_decision_with_another_text_fails() {
    ctx("ann-1.guests.x.testnet", NearToken::from_millinear(20));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    let other = TEE_TEXT.replacen('a', "c", 1);
    tee(&mut c, "chatcmpl-1", &other, &"bb".repeat(32), TEE_SIG);
}

#[test]
#[should_panic(expected = "ERR_TEE_HASH")]
fn tee_decision_with_another_response_hash_fails() {
    ctx("ann-1.guests.x.testnet", NearToken::from_millinear(20));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    tee(&mut c, "chatcmpl-1", TEE_TEXT, &"cc".repeat(32), TEE_SIG);
}

#[test]
#[should_panic(expected = "ERR_EXISTS")]
fn tee_decision_twice_fails() {
    ctx("ann-1.guests.x.testnet", NearToken::from_millinear(20));
    let mut c = Contract::new("owner.testnet".parse().unwrap());
    tee(&mut c, "chatcmpl-1", TEE_TEXT, &"bb".repeat(32), TEE_SIG);
    tee(&mut c, "chatcmpl-1", TEE_TEXT, &"bb".repeat(32), TEE_SIG);
}
