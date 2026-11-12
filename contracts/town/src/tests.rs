use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, PromiseResult};

const DAY: u64 = 86_400_000_000_000;
const D0: u64 = 20_400; // a UTC day number
const S: u128 = UNIT;
fn acc(s: &str) -> AccountId { s.parse().unwrap() }
fn ctx_full(who: &str, day: u64, deposit: NearToken, results: Vec<PromiseResult>) {
    testing_env!(
        VMContextBuilder::new().predecessor_account_id(acc(who)).current_account_id(acc("town.testnet")).block_timestamp((D0 + day) * DAY + 1_000)
            .attached_deposit(deposit).account_balance(NearToken::from_near(100)).build(),
        near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), HashMap::default(), results
    );
}
fn ctx(who: &str, day: u64) { ctx_full(who, day, NearToken::from_yoctonear(0), vec![]) }
fn ctx_dep(who: &str, day: u64, dep: NearToken) { ctx_full(who, day, dep, vec![]) }
const ACCS: [&str; 6] = ["t0.testnet", "t1.testnet", "t2.testnet", "t3.testnet", "p0.testnet", "p1.testnet"];

fn town() -> Town {
    ctx("owner.testnet", 0);
    let mut t = Town::new(acc("owner.testnet"), vec![acc("coord.testnet")], None);
    t.genesis(ACCS[..4].iter().map(|a| acc(a)).collect(), U(1_000 * S));
    t
}
/// minted − burned = everything held (acceptance 1, in silk).
fn conserved(t: &Town) {
    let rows: u128 = ACCS.iter().filter_map(|a| t.balance_of(acc(a))).map(|r| r.silk + r.credit).sum();
    assert_eq!(t.minted_silk - t.burned_silk, rows + t.silk_held_outside_accounts().0, "silk conservation");
}
fn bal(t: &Town, a: &str) -> Account { t.balance_of(acc(a)).unwrap() }
fn trades(t: &mut Town, n: usize, day: u64) {
    for i in 0..n { let (a, b) = (ACCS[i % 4], ACCS[(i + 1) % 4]); ctx(a, day); t.trade(acc(b), U(2 * S), "bread".into()); }
}
fn stake(t: &mut Town, who: &str, day: u64, asset: u8, amount: u128, tier: u8) -> TokenId { ctx_dep(who, day, DEED_DEPOSIT); t.stake(asset, U(amount), tier) }
fn day_close(t: &mut Town, day: u64) { ctx("anyone.testnet", day); t.sweep_fees(); t.distribute(); }

#[test]
fn genesis_once_and_trade_takes_the_fee() {
    let mut t = town();
    ctx("t0.testnet", 0);
    t.trade(acc("t1.testnet"), U(2 * S), "bread".into());
    assert_eq!(bal(&t, "t0.testnet").silk, 998 * S);
    assert_eq!(bal(&t, "t1.testnet").silk, 1_002 * S - 2_400);
    assert_eq!(t.treasury_silk, 2_400);
    let log = get_logs().pop().unwrap();
    assert!(log.starts_with(r#"EVENT_JSON:{"standard":"ftf_town","version":"1.0.0","event":"trade","data":[{"from":"t0.testnet","to":"t1.testnet","silk":"2000000","fee":"2400","ref":"bread","n":1}]}"#), "{}", log);
    let p = t.pulse();
    assert_eq!((p.counters.trade, p.volume_silk.as_str(), p.minted_silk.as_str()), (1, "2000000", "4000000000"));
    conserved(&t);
}
#[test] #[should_panic(expected = "ERR_GENESIS")]
fn genesis_runs_once() { let mut t = town(); t.genesis(vec![], U(1)); }
#[test] #[should_panic(expected = "ERR_MIN_TRADE")]
fn trade_minimum() { let mut t = town(); ctx("t0.testnet", 0); t.trade(acc("t1.testnet"), U(S / 2 - 1), "".into()); }
#[test] #[should_panic(expected = "ERR_SELF")]
fn no_self_trade() { let mut t = town(); ctx("t0.testnet", 0); t.trade(acc("t0.testnet"), U(S), "".into()); }
#[test] #[should_panic(expected = "ERR_UNKNOWN_ACCOUNT")]
fn counterparty_must_be_registered() { let mut t = town(); ctx("t0.testnet", 0); t.trade(acc("eve.testnet"), U(S), "".into()); }
#[test] #[should_panic(expected = "ERR_FUNDS")]
fn trade_needs_funds() { let mut t = town(); ctx("t0.testnet", 0); t.trade(acc("t1.testnet"), U(1_001 * S), "".into()); }
#[test] #[should_panic(expected = "ERR_PAUSED")]
fn paused_town_refuses_trades() { let mut t = town(); t.set_paused(true); ctx("t0.testnet", 0); t.trade(acc("t1.testnet"), U(S), "".into()); }

#[test]
fn sweep_splits_the_fees_and_mints_nothing() {
    let mut t = town();
    trades(&mut t, 1_000, 0); // 2,000 silk of volume -> 2.4 silk of fees
    let minted = t.minted_silk;
    ctx("x.testnet", 1); t.sweep_fees();
    assert_eq!(t.station_silk, 2_400_000 * 1_200 / 10_000);
    let swept = 2_400_000 - t.station_silk;
    assert_eq!((t.stake_pot, t.purse, t.reserve), (swept * 65 / 100, swept / 10, swept / 10));
    assert_eq!(t.treasury_silk, 0);
    assert_eq!(t.minted_silk, minted);
    conserved(&t);
}

#[test]
fn deed_lifecycle_rewards_from_fees_only() {
    let mut t = town();
    let id = stake(&mut t, "t0.testnet", 0, 2, 300 * S, 0);
    assert_eq!(bal(&t, "t0.testnet").silk, 1_000 * S - 300 * S - S / 2); // deed fee burned
    assert_eq!(t.nft_token(id.clone()).unwrap().owner_id, acc("t0.testnet"));
    trades(&mut t, 400, 0);
    day_close(&mut t, 0); // same epoch: the deed's weight is still warming (acceptance 7)
    assert_eq!(t.get_deed(id.clone()).unwrap().2 .0, 0);
    trades(&mut t, 400, 1);
    day_close(&mut t, 1);
    let claimable = t.get_deed(id.clone()).unwrap().2 .0;
    assert!(claimable > 0, "rewards after an epoch");
    ctx("t0.testnet", 1);
    assert_eq!(t.claim(id.clone()).0, claimable);
    conserved(&t);
    let minted = t.minted_silk;
    ctx("t0.testnet", 2); t.begin_unbond(id.clone());
    assert_eq!(t.get_deed(id.clone()).unwrap().1.state, 1);
    ctx("t0.testnet", 4);
    assert_eq!(t.finish_unbond(id.clone()).0, 300 * S);
    assert!(t.nft_token(id.clone()).is_none() && t.get_deed(id.clone()).is_none());
    assert_eq!(t.minted_silk, minted); // trades, pledges and claims never mint (acceptance 2)
    assert_eq!(bal(&t, "t0.testnet").staked, 0);
    conserved(&t);
}
#[test] #[should_panic(expected = "ERR_NOT_READY")]
fn unbonding_waits_the_cooldown() { let mut t = town(); let id = stake(&mut t, "t0.testnet", 0, 0, 100 * S, 0); ctx("t0.testnet", 1); t.begin_unbond(id.clone()); ctx("t0.testnet", 2); t.finish_unbond(id); }
#[test] #[should_panic(expected = "ERR_NO_DEED")]
fn double_finish_unbond_fails() {
    let mut t = town(); let id = stake(&mut t, "t0.testnet", 0, 0, 100 * S, 0);
    ctx("t0.testnet", 1); t.begin_unbond(id.clone()); ctx("t0.testnet", 3); t.finish_unbond(id.clone()); t.finish_unbond(id);
}
#[test] #[should_panic(expected = "ERR_LOCKED")]
fn locked_tiers_cannot_unbond_early() { let mut t = town(); let id = stake(&mut t, "t0.testnet", 0, 0, 100 * S, 1); ctx("t0.testnet", 4); t.begin_unbond(id); }
#[test] #[should_panic(expected = "ERR_DEPOSIT")]
fn a_deed_needs_its_storage_deposit() { let mut t = town(); ctx("t0.testnet", 0); t.stake(0, U(10 * S), 0); }

#[test]
fn early_exit_takes_ten_percent_half_burned_half_to_the_other_stakers() {
    let mut t = town();
    let a = stake(&mut t, "t0.testnet", 0, 1, 200 * S, 1);
    let b = stake(&mut t, "t1.testnet", 0, 1, 200 * S, 0);
    day_close(&mut t, 1);
    let before_b = t.get_deed(b.clone()).unwrap().2 .0;
    let burned = t.burned_silk;
    ctx("t0.testnet", 2);
    let back = t.exit_early(a.clone()).0;
    assert!(back >= 180 * S && back < 181 * S);
    assert_eq!(t.burned_silk - burned, 10 * S);
    assert!(t.get_deed(b.clone()).unwrap().2 .0 >= before_b + 10 * S - 1);
    conserved(&t);
}

#[test]
fn deed_transfer_moves_the_whole_position() {
    let mut t = town();
    let id = stake(&mut t, "t0.testnet", 0, 3, 150 * S, 2);
    trades(&mut t, 200, 1); day_close(&mut t, 1); trades(&mut t, 200, 2); day_close(&mut t, 2);
    let pending = t.get_deed(id.clone()).unwrap().2 .0;
    ctx_dep("t0.testnet", 3, NearToken::from_yoctonear(1));
    t.nft_transfer(acc("t2.testnet"), id.clone(), None, None);
    let (owner, d, claim) = t.get_deed(id.clone()).unwrap();
    assert_eq!(owner, acc("t2.testnet"));
    assert_eq!((d.principal, d.locked_until_day, claim.0), (150 * S, (D0 as u32) + 10, pending));
    assert_eq!((bal(&t, "t0.testnet").staked, bal(&t, "t2.testnet").staked), (0, 150 * S));
    ctx("t2.testnet", 3); assert!(t.claim(id.clone()).0 == pending);
    conserved(&t);
}
#[test] #[should_panic(expected = "ERR_NO_EXIT_YET")]
fn a_new_owner_cannot_exit_early_for_a_day() {
    let mut t = town(); let id = stake(&mut t, "t0.testnet", 0, 0, 100 * S, 1);
    ctx_dep("t0.testnet", 1, NearToken::from_yoctonear(1)); t.nft_transfer(acc("t1.testnet"), id.clone(), None, None);
    ctx("t1.testnet", 2); t.exit_early(id);
}
#[test] #[should_panic(expected = "ERR_CAP_RECEIVER")]
fn receiver_cap_is_checked_on_transfer() {
    let mut t = town();
    let a = stake(&mut t, "t0.testnet", 0, 0, 500 * S, 0);
    stake(&mut t, "t1.testnet", 0, 1, 400 * S, 0);
    ctx_dep("t0.testnet", 1, NearToken::from_yoctonear(1)); t.nft_transfer(acc("t1.testnet"), a, None, None); // 900 > the 800 floor cap
}
#[test] #[should_panic(expected = "ERR_NO_APPROVALS")]
fn deeds_have_no_approvals() { let mut t = town(); let id = stake(&mut t, "t0.testnet", 0, 0, 10 * S, 0); ctx_dep("t0.testnet", 0, NearToken::from_yoctonear(1)); t.nft_transfer(acc("t1.testnet"), id, Some(1), None); }
#[test]
fn transfer_call_rollback_restores_the_owner_and_the_books() {
    let mut t = town();
    let id = stake(&mut t, "t0.testnet", 0, 0, 100 * S, 0);
    ctx_dep("t0.testnet", 1, NearToken::from_yoctonear(1));
    let _ = t.nft_transfer_call(acc("t1.testnet"), id.clone(), None, None, "".into());
    assert_eq!(bal(&t, "t1.testnet").staked, 100 * S);
    ctx_full("town.testnet", 1, NearToken::from_yoctonear(0), vec![PromiseResult::Successful(b"true".to_vec())]); // the receiver returns it
    assert!(!t.nft_resolve_transfer(acc("t0.testnet"), acc("t1.testnet"), id.clone(), None));
    assert_eq!(t.get_deed(id).unwrap().0, acc("t0.testnet"));
    assert_eq!((bal(&t, "t0.testnet").staked, bal(&t, "t1.testnet").staked), (100 * S, 0));
}

#[test] #[should_panic(expected = "ERR_CAP")]
fn per_account_cap_floor() { let mut t = town(); stake(&mut t, "t0.testnet", 0, 0, 500 * S, 0); stake(&mut t, "t0.testnet", 0, 1, 301 * S, 0); }
#[test]
fn caps_follow_tvl_and_the_per_works_ceiling() {
    let p = Params::default();
    assert_eq!(stake_cap(&p, 0), 800 * S);
    assert_eq!(stake_cap(&p, 40_000 * S), 2_000 * S);
    assert_eq!(stake_cap(&p, 1_000_000 * S), 8_000 * S);
}

#[test]
fn rate_ceiling_sends_the_excess_to_the_purse() {
    let mut t = town();
    stake(&mut t, "t0.testnet", 0, 0, 10 * S, 0); // a tiny works
    t.stake_pot = 1_000 * S; t.minted_silk += 1_000 * S; // as if a big fee flow arrived (test only)
    let purse = t.purse;
    ctx("anyone.testnet", 1); t.distribute();
    assert_eq!(t.works[0].rewards, 10 * S * 40 / 10_000); // 0.4 % of weight per epoch
    assert_eq!(t.purse - purse, 1_000 * S - 40_000);
    conserved(&t);
}

#[test]
fn wash_trading_loses_more_than_it_earns() {
    // The attacker owns t0 and t1 and the only deed; it washes 400 trades a day for 5 days.
    let mut t = town();
    let id = stake(&mut t, "t0.testnet", 0, 0, 390 * S, 0);
    let silk0 = bal(&t, "t0.testnet").silk + bal(&t, "t1.testnet").silk;
    for day in 1..=5 {
        for i in 0..400 { let (a, b) = if i % 2 == 0 { ("t0.testnet", "t1.testnet") } else { ("t1.testnet", "t0.testnet") }; ctx(a, day); t.trade(acc(b), U(2 * S), "".into()); }
        day_close(&mut t, day);
        ctx("t0.testnet", day); t.claim(id.clone());
    }
    let after = bal(&t, "t0.testnet").silk + bal(&t, "t1.testnet").silk;
    assert!(after < silk0, "the washer ended with {} vs {}", after, silk0);
    conserved(&t);
}

fn open(t: &mut Town, id: &str) { ctx("coord.testnet", 0); t.open_season(id.into(), "03dbd4587b5d".into()); }
#[test]
fn tournament_entry_costs_silk_and_splits_it() {
    let mut t = town();
    let obs = stake(&mut t, "t2.testnet", 0, 3, 100 * S, 0);
    day_close(&mut t, 0);
    open(&mut t, "s1");
    ctx("t0.testnet", 1); t.enter_tournament("s1".into());
    assert_eq!(bal(&t, "t0.testnet").silk, 960 * S);
    assert_eq!(t.purse, 26 * S);
    assert_eq!(t.get_deed(obs).unwrap().2 .0, 6 * S); // 15 % to the Shell Observatory's stakers
    ctx("coord.testnet", 1); t.register(vec![acc("p0.testnet")]); t.credit_entry(acc("p0.testnet"), U(40 * S));
    ctx("p0.testnet", 1); t.enter_tournament("s1".into()); // paid with the entry credit
    assert_eq!(bal(&t, "p0.testnet").credit, 0);
    assert_eq!(t.season("s1".into()).unwrap().entrants, 2);
    conserved(&t);
}
#[test] #[should_panic(expected = "ERR_ENTERED")]
fn one_entry_per_season() { let mut t = town(); open(&mut t, "s1"); ctx("t0.testnet", 1); t.enter_tournament("s1".into()); t.enter_tournament("s1".into()); }
#[test] #[should_panic(expected = "ERR_SEASON")]
fn entry_only_for_the_open_season() { let mut t = town(); open(&mut t, "s1"); ctx("t0.testnet", 1); t.enter_tournament("s0".into()); }
#[test]
fn settle_pays_from_the_purse_then_mints_inside_the_ceiling() {
    let mut t = town();
    open(&mut t, "s1");
    for a in &ACCS[..4] { ctx(a, 1); t.enter_tournament("s1".into()); }
    let purse = t.purse; // 4 x (26 + 6: the Observatory has no stakers, so its share joins the purse)
    assert_eq!(purse, 128 * S);
    // ceiling = min(12,000, 1,000 + 0.8 x 0 burned last season, 24 x 4 entrants) = 96 -> pot 224, one payout <= 4 % = 8.96
    ctx("coord.testnet", 2);
    let minted = t.minted_silk;
    t.settle_season("s1".into(), vec![(acc("t0.testnet"), U(8 * S)), (acc("t1.testnet"), U(8 * S))], "h1".into(), false);
    assert_eq!(t.purse, purse - 16 * S);
    assert_eq!(t.minted_silk, minted);
    let s = t.season("s1".into()).unwrap();
    assert_eq!((s.mint_cap, s.pot), (96 * S, 224 * S));
    let many: Vec<(AccountId, U)> = (0..16).map(|i| (acc(ACCS[i % 4]), U(8 * S))).collect(); // 128 more: 112 from the purse, 16 minted
    t.settle_season("s1".into(), many, "h2".into(), true);
    assert_eq!(t.purse, 0);
    assert_eq!(t.minted_silk - minted, 16 * S);
    assert!(t.season("s1".into()).unwrap().settled);
    conserved(&t);
}
#[test] #[should_panic(expected = "ERR_PAYOUT_CAP")]
fn one_payout_is_capped() { let mut t = town(); open(&mut t, "s1"); for a in &ACCS[..4] { ctx(a, 1); t.enter_tournament("s1".into()); } ctx("coord.testnet", 2); t.settle_season("s1".into(), vec![(acc("t0.testnet"), U(9 * S))], "h".into(), false); }
#[test] #[should_panic(expected = "ERR_PURSE")]
fn settle_cannot_exceed_purse_plus_ceiling() {
    let mut t = town(); open(&mut t, "s1"); for a in &ACCS[..4] { ctx(a, 1); t.enter_tournament("s1".into()); }
    ctx("coord.testnet", 2); let many: Vec<(AccountId, U)> = (0..29).map(|i| (acc(ACCS[i % 4]), U(8 * S))).collect(); t.settle_season("s1".into(), many, "h".into(), false);
}
#[test] #[should_panic(expected = "ERR_SETTLED")]
fn a_settled_season_stays_closed() { let mut t = town(); open(&mut t, "s1"); ctx("coord.testnet", 2); t.settle_season("s1".into(), vec![], "h".into(), true); t.settle_season("s1".into(), vec![], "h".into(), false); }
#[test]
fn the_mint_ceiling_follows_last_seasons_burn() {
    let p = Params::default();
    assert_eq!(season_mint_cap(&p, 0, 1_000), 1_000 * S);
    assert_eq!(season_mint_cap(&p, 5_000 * S, 1_000), 5_000 * S);
    assert_eq!(season_mint_cap(&p, 50_000 * S, 10_000), 12_000 * S);
    assert_eq!(season_mint_cap(&p, 50_000 * S, 10), 240 * S);
}

#[test] #[should_panic(expected = "ERR_CREDIT_CAP")]
fn silk_credit_has_a_daily_ceiling() { let mut t = town(); ctx("coord.testnet", 0); t.credit_silk(acc("t0.testnet"), U(3_000 * S), "a".into()); t.credit_silk(acc("t0.testnet"), U(1_001 * S), "b".into()); }
#[test] #[should_panic(expected = "ERR_NOT_COORDINATOR")]
fn only_coordinators_credit_silk() { let mut t = town(); ctx("t0.testnet", 0); t.credit_silk(acc("t0.testnet"), U(1), "".into()); }
#[test]
fn season_root_is_fixed_and_deeds_carry_it() {
    let mut t = town();
    ctx("coord.testnet", 0); t.open_season("793f6c05e89839f2".into(), "03dbd4587b5d".into());
    let id = stake(&mut t, "t0.testnet", 0, 0, 10 * S, 0);
    assert!(id.starts_with("deed-793f6c05e89839f2-"));
    assert_eq!(t.get_deed(id).unwrap().1.schedule_root, "03dbd4587b5d");
}
#[test] #[should_panic(expected = "ERR_SEASON_ROOT")]
fn season_root_cannot_change() { let mut t = town(); ctx("coord.testnet", 0); t.open_season("s1".into(), "aa".into()); t.open_season("s1".into(), "bb".into()); }
#[test] #[should_panic(expected = "ERR_PARAMS")]
fn params_are_bounded() { let mut t = town(); let mut p = Params::default(); p.trade_fee_bps = 500; t.set_params(p); }
#[test] #[should_panic(expected = "ERR_ONCE_A_DAY")]
fn sweep_once_per_epoch() { let mut t = town(); ctx("x.testnet", 1); t.sweep_fees(); t.sweep_fees(); }

#[test]
fn long_random_run_conserves_everything() {
    let mut t = town();
    open(&mut t, "s1");
    let mut deeds: Vec<(String, TokenId)> = vec![];
    let mut s: u64 = 42;
    let mut rnd = |n: u64| { s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407); (s >> 33) % n };
    for day in 0..12u64 {
        for _ in 0..300 {
            let a = ACCS[rnd(4) as usize]; let b = ACCS[rnd(4) as usize];
            match rnd(20) {
                0 => { if bal(&t, a).silk > 60 * S && bal(&t, a).staked + 40 * S <= stake_cap(&t.params, t.tvl()) { let id = stake(&mut t, a, day, rnd(4) as u8, 40 * S, rnd(4) as u8); deeds.push((a.into(), id)); } }
                1 => { ctx(a, day); if bal(&t, a).silk > 50 * S && !t.has_entered("s1".into(), acc(a)) { t.enter_tournament("s1".into()); } }
                3 => if let Some((o, id)) = deeds.get(rnd(deeds.len().max(1) as u64) as usize).cloned() {
                    if t.get_deed(id.clone()).is_some() { ctx(&o, day); t.claim(id); }
                },
                4 => if let Some((o, id)) = deeds.get(rnd(deeds.len().max(1) as u64) as usize).cloned() {
                    if let Some((_, d, _)) = t.get_deed(id.clone()) {
                        ctx(&o, day);
                        if d.state == 0 && day as u32 + D0 as u32 >= d.locked_until_day { t.begin_unbond(id); }
                        else if d.state == 1 && day as u32 + D0 as u32 >= d.unbond_ready_day { t.finish_unbond(id); }
                    }
                },
                _ => { if a != b && bal(&t, a).silk > 3 * S { ctx(a, day); t.trade(acc(b), U(S + rnd(2 * S as u64) as u128), "x".into()); } }
            }
        }
        day_close(&mut t, day);
        conserved(&t);
        let claimable: u128 = deeds.iter().filter_map(|(_, id)| t.get_deed(id.clone())).map(|x| x.2 .0).sum();
        let rewards: u128 = t.works.iter().map(|w| w.rewards).sum();
        assert!(claimable <= rewards, "claimable {} > credited {}", claimable, rewards); // acceptance 4
    }
    ctx("coord.testnet", 13); t.settle_season("s1".into(), vec![(acc("t0.testnet"), U(S))], "h".into(), true);
    conserved(&t);
}

/// contracts/town/tests/vectors.json (written by tools/town/vectors.mjs from the JS rules) must match rules.rs.
#[test]
fn rules_match_the_shared_vectors() {
    let v: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(include_str!("../tests/vectors.json")).unwrap();
    let n = |x: &near_sdk::serde_json::Value| -> u128 { x.as_str().unwrap().parse().unwrap() };
    let p = Params::default();
    for c in v["fees"].as_array().unwrap() { assert_eq!(trade_fee(&p, n(&c["silk"])), n(&c["fee"])); }
    for c in v["caps"].as_array().unwrap() { assert_eq!(stake_cap(&p, n(&c["tvl"])), n(&c["cap"])); }
    for c in v["sweeps"].as_array().unwrap() {
        let s = split_sweep(&p, n(&c["silk"]));
        assert_eq!((s.stakers, s.purse, s.reserve, s.burn), (n(&c["stakers"]), n(&c["purse"]), n(&c["reserve"]), n(&c["burn"])));
    }
    for c in v["entries"].as_array().unwrap() {
        let s = split_entry(&p, n(&c["fee"]));
        assert_eq!((s.burn, s.works, s.purse), (n(&c["burn"]), n(&c["works"]), n(&c["purse"])));
    }
    for c in v["mint_caps"].as_array().unwrap() { assert_eq!(season_mint_cap(&p, n(&c["burn_prev"]), c["entrants"].as_u64().unwrap() as u32), n(&c["cap"])); }
    for c in v["plans"].as_array().unwrap() {
        let w: Vec<u128> = c["weights"].as_array().unwrap().iter().map(n).collect();
        let r = plan_distribution(&p, n(&c["pot"]), &[w[0], w[1], w[2], w[3]]);
        let pots: Vec<u128> = c["pots"].as_array().unwrap().iter().map(n).collect();
        assert_eq!((r.pots.to_vec(), r.overflow), (pots, n(&c["overflow"])), "plan {}", c);
    }
    for c in v["pendings"].as_array().unwrap() { assert_eq!(pending_reward(n(&c["weight"]), n(&c["snapshot"]), n(&c["index"])), n(&c["pending"])); }
}
