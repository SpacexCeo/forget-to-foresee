use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, NearToken, PromiseResult};
use std::collections::HashMap;

fn acc(s: &str) -> AccountId { s.parse().unwrap() }
fn ctx_full(who: &str, yocto: u128, results: Vec<PromiseResult>) {
    testing_env!(VMContextBuilder::new().predecessor_account_id(acc(who)).current_account_id(acc("items.ftf-town.testnet")).attached_deposit(NearToken::from_yoctonear(yocto)).build(),
        near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), HashMap::default(), results);
}
fn ctx(who: &str) { ctx_full(who, 0, vec![]) }
fn one(who: &str) { ctx_full(who, 1, vec![]) }
const RES: [(&str, u32); 5] = [("spider_silk_thread", 15), ("chitin_plate", 25), ("veil_dust", 75), ("ash_ore", 200), ("crown_shard", 1000)];
fn items() -> Items {
    ctx("owner.testnet");
    let mut c = Items::new(acc("owner.testnet"), vec![acc("trader-01.ftf-town.testnet")]);
    for (id, base) in RES { c.add_token(id.into(), id.replace('_', " "), "A monster resource.".into(), "resource".into(), base); }
    c
}

#[test]
fn the_five_resources_are_the_first_tokens_and_minters_mint() {
    let mut c = items();
    assert_eq!(c.tokens().iter().map(|t| t.0.as_str()).collect::<Vec<_>>(), RES.iter().map(|r| r.0).collect::<Vec<_>>());
    ctx("trader-01.ftf-town.testnet"); c.mint(acc("ann.testnet"), "veil_dust".into(), U128(5), Some("bought at the shrine".into()));
    assert_eq!(c.mt_balance_of(acc("ann.testnet"), "veil_dust".into()).0, 5);
    assert_eq!(c.mt_supply("veil_dust".into()).unwrap().0, 5);
    assert_eq!(get_logs()[0], r#"EVENT_JSON:{"standard":"nep245","version":"1.0.0","event":"mt_mint","data":[{"owner_id":"ann.testnet","token_ids":["veil_dust"],"amounts":["5"],"memo":"bought at the shrine"}]}"#);
    assert!(c.mt_token(vec!["veil_dust".into(), "gold".into()])[1].is_none());
    let meta = c.mt_metadata_token_all(vec!["crown_shard".into()]); assert!(meta[0].as_ref().unwrap().token.extra.as_ref().unwrap().contains("1000"));
    assert_eq!(c.mt_metadata_contract().spec, "mt-1.0.0");
}
#[test] #[should_panic(expected = "ERR_NOT_MINTER")]
fn strangers_cannot_mint() { let mut c = items(); ctx("eve.testnet"); c.mint(acc("eve.testnet"), "ash_ore".into(), U128(1), None); }
#[test] #[should_panic(expected = "ERR_TOKEN")]
fn unknown_tokens_cannot_be_minted() { let mut c = items(); ctx("owner.testnet"); c.mint(acc("ann.testnet"), "gold".into(), U128(1), None); }

#[test]
fn transfers_and_batches_move_balances_and_log_nep245_events() {
    let mut c = items();
    ctx("owner.testnet"); c.mint(acc("ann.testnet"), "chitin_plate".into(), U128(10), None); c.mint(acc("ann.testnet"), "ash_ore".into(), U128(3), None);
    one("ann.testnet"); c.mt_transfer(acc("bob.testnet"), "chitin_plate".into(), U128(4), None, None);
    assert_eq!(get_logs()[0], r#"EVENT_JSON:{"standard":"nep245","version":"1.0.0","event":"mt_transfer","data":[{"old_owner_id":"ann.testnet","new_owner_id":"bob.testnet","token_ids":["chitin_plate"],"amounts":["4"]}]}"#);
    one("ann.testnet"); c.mt_batch_transfer(acc("bob.testnet"), vec!["chitin_plate".into(), "ash_ore".into()], vec![U128(6), U128(3)], None, Some("trade".into()));
    assert_eq!(c.mt_batch_balance_of(acc("bob.testnet"), vec!["chitin_plate".into(), "ash_ore".into()]).iter().map(|x| x.0).collect::<Vec<_>>(), vec![10, 3]);
    assert_eq!(c.mt_balance_of(acc("ann.testnet"), "chitin_plate".into()).0, 0);
    ctx("bob.testnet"); c.burn("ash_ore".into(), U128(2), Some("crafted".into()));
    assert_eq!(c.mt_supply("ash_ore".into()).unwrap().0, 1);
}
#[test] #[should_panic(expected = "ERR_FUNDS")]
fn no_overdraft() { let mut c = items(); ctx("owner.testnet"); c.mint(acc("ann.testnet"), "ash_ore".into(), U128(1), None); one("ann.testnet"); c.mt_transfer(acc("bob.testnet"), "ash_ore".into(), U128(2), None, None); }
#[test] #[should_panic(expected = "ERR_APPROVAL")]
fn approvals_are_not_supported() { let mut c = items(); ctx("owner.testnet"); c.mint(acc("ann.testnet"), "ash_ore".into(), U128(1), None); one("ann.testnet"); c.mt_transfer(acc("bob.testnet"), "ash_ore".into(), U128(1), Some((acc("x.testnet"), 1)), None); }
#[test] #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn transfers_need_one_yocto() { let mut c = items(); ctx("owner.testnet"); c.mint(acc("ann.testnet"), "ash_ore".into(), U128(1), None); ctx("ann.testnet"); c.mt_transfer(acc("bob.testnet"), "ash_ore".into(), U128(1), None, None); }

#[test]
fn transfer_call_returns_what_the_receiver_did_not_use() {
    let mut c = items();
    ctx("owner.testnet"); c.mint(acc("ann.testnet"), "veil_dust".into(), U128(10), None);
    one("ann.testnet"); let _ = c.mt_transfer_call(acc("stall.testnet"), "veil_dust".into(), U128(10), None, None, "sell".into());
    assert_eq!(c.mt_balance_of(acc("stall.testnet"), "veil_dust".into()).0, 10);
    ctx_full("items.ftf-town.testnet", 0, vec![PromiseResult::Successful(b"[\"4\"]".to_vec())]);
    let kept = c.mt_resolve_transfer(vec![acc("ann.testnet")], acc("stall.testnet"), vec!["veil_dust".into()], vec![U128(10)], None);
    assert_eq!(kept[0].0, 6);
    assert_eq!((c.mt_balance_of(acc("ann.testnet"), "veil_dust".into()).0, c.mt_balance_of(acc("stall.testnet"), "veil_dust".into()).0), (4, 6));
    one("ann.testnet"); let _ = c.mt_transfer_call(acc("broken.testnet"), "veil_dust".into(), U128(4), None, None, "".into());
    ctx_full("items.ftf-town.testnet", 0, vec![PromiseResult::Failed]);
    let kept = c.mt_resolve_transfer(vec![acc("ann.testnet")], acc("broken.testnet"), vec!["veil_dust".into()], vec![U128(4)], None);
    assert_eq!(kept[0].0, 0); // a failed receiver gives everything back
    assert_eq!(c.mt_balance_of(acc("ann.testnet"), "veil_dust".into()).0, 4);
    assert_eq!(c.mt_supply("veil_dust".into()).unwrap().0, 10);
}

// ---------- v2: the player market's settlement ----------
fn h(n: u32) -> String { format!("{:064x}", n) }
#[test]
fn a_minter_moves_a_sale_between_players_once_per_request() {
    let mut c = items();
    ctx("owner.testnet"); c.mint(acc("ann.testnet"), "spider_silk_thread".into(), U128(10), None);
    ctx("trader-01.ftf-town.testnet");
    c.coordinator_transfer(acc("ann.testnet"), acc("bob.testnet"), "spider_silk_thread".into(), U128(4), h(1));
    assert_eq!(c.mt_balance_of(acc("ann.testnet"), "spider_silk_thread".into()).0, 6);
    assert_eq!(c.mt_balance_of(acc("bob.testnet"), "spider_silk_thread".into()).0, 4);
    assert!(c.request_used(h(1)));
    assert!(get_logs().last().unwrap().contains(r#""event":"mt_transfer""#) && get_logs().last().unwrap().contains(r#""memo":"p2p""#));
    assert_eq!(c.mt_supply("spider_silk_thread".into()).unwrap().0, 10); // a move, never a mint
}
#[test] #[should_panic(expected = "ERR_REQUEST")]
fn a_market_request_moves_items_once() {
    let mut c = items(); ctx("owner.testnet"); c.mint(acc("ann.testnet"), "ash_ore".into(), U128(5), None);
    c.coordinator_transfer(acc("ann.testnet"), acc("bob.testnet"), "ash_ore".into(), U128(1), h(2));
    c.coordinator_transfer(acc("ann.testnet"), acc("bob.testnet"), "ash_ore".into(), U128(1), h(2));
}
#[test] #[should_panic(expected = "ERR_NOT_MINTER")]
fn strangers_cannot_move_other_players_items() { let mut c = items(); ctx("eve.testnet"); c.coordinator_transfer(acc("ann.testnet"), acc("eve.testnet"), "ash_ore".into(), U128(1), h(3)); }
#[test] #[should_panic(expected = "ERR_FUNDS")]
fn a_sale_needs_the_sellers_items() { let mut c = items(); ctx("owner.testnet"); c.coordinator_transfer(acc("ann.testnet"), acc("bob.testnet"), "ash_ore".into(), U128(1), h(4)); }
#[test] #[should_panic(expected = "ERR_REQUEST")]
fn a_sale_needs_a_request_hash() { let mut c = items(); ctx("owner.testnet"); c.coordinator_transfer(acc("ann.testnet"), acc("bob.testnet"), "ash_ore".into(), U128(1), "x".into()); }
