use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, PromiseResult};

const DAY: u64 = 86_400_000_000_000;
const D0: u64 = 20_400; // a UTC day number
const W: u128 = UNIT;
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
const ACCS: [&str; 5] = ["t0.testnet", "t1.testnet", "t2.testnet", "t3.testnet", "town.testnet"];

fn town() -> Town {
    ctx("owner.testnet", 0);
    let mut t = Town::new(acc("owner.testnet"), vec![acc("coord.testnet")], None);
    t.genesis(ACCS[..4].iter().map(|a| acc(a)).collect(), U(700 * W), U(1_000 * W), U(10_000 * W), U(20_000 * W));
    t
}
/// minted − burned = everything held (acceptance 1), and silk likewise.
fn conserved(t: &Town) {
    let wool: u128 = ACCS.iter().filter_map(|a| t.balance_of(acc(a))).map(|r| r.wool).sum();
    assert_eq!(t.minted_wool - t.burned_wool, wool + t.wool_held_outside_accounts().0, "wool conservation");
    let silk: u128 = ACCS.iter().filter_map(|a| t.balance_of(acc(a))).map(|r| r.silk).sum();
    assert_eq!(t.minted_silk, silk + t.silk_held_outside_accounts().0, "silk conservation");
    let pending: u128 = (0..4).map(|a| t.works[a].rewards).sum();
    let _ = pending;
}
fn bal(t: &Town, a: &str) -> Account { t.balance_of(acc(a)).unwrap() }
fn k(t: &Town) -> u128 { t.pool.wool * t.pool.silk }
fn trades(t: &mut Town, n: usize, day: u64) {
    for i in 0..n { let (a, b) = (ACCS[i % 4], ACCS[(i + 1) % 4]); ctx(a, day); t.trade(acc(b), U(2 * W), "bread".into()); }
}

#[test]
fn genesis_once_and_trade_takes_the_fee() {
    let mut t = town();
    ctx("t0.testnet", 0);
    t.trade(acc("t1.testnet"), U(2 * W), "bread".into());
    assert_eq!(bal(&t, "t0.testnet").silk, 998 * W);
    assert_eq!(bal(&t, "t1.testnet").silk, 1_002 * W - 2_400);
    assert_eq!(t.treasury_silk, 2_400);
    let log = get_logs().pop().unwrap();
    assert!(log.starts_with(r#"EVENT_JSON:{"standard":"ftf_town","version":"1.0.0","event":"trade","data":[{"from":"t0.testnet","to":"t1.testnet","silk":"2000000","fee":"2400","ref":"bread","n":1}]}"#), "{}", log);
    let p = t.pulse();
    assert_eq!((p.counters.trade, p.volume_silk.as_str(), p.pool_price.as_str()), (1, "2000000", "2000000"));
    conserved(&t);
}
#[test] #[should_panic(expected = "ERR_GENESIS")]
fn genesis_runs_once() { let mut t = town(); t.genesis(vec![], U(1), U(1), U(1), U(1)); }
#[test] #[should_panic(expected = "ERR_MIN_TRADE")]
fn trade_minimum() { let mut t = town(); ctx("t0.testnet", 0); t.trade(acc("t1.testnet"), U(W / 2 - 1), "".into()); }
#[test] #[should_panic(expected = "ERR_SELF")]
fn no_self_trade() { let mut t = town(); ctx("t0.testnet", 0); t.trade(acc("t0.testnet"), U(W), "".into()); }
#[test] #[should_panic(expected = "ERR_UNKNOWN_ACCOUNT")]
fn counterparty_must_be_registered() { let mut t = town(); ctx("t0.testnet", 0); t.trade(acc("eve.testnet"), U(W), "".into()); }
#[test] #[should_panic(expected = "ERR_FUNDS")]
fn trade_needs_funds() { let mut t = town(); ctx("t0.testnet", 0); t.trade(acc("t1.testnet"), U(1_001 * W), "".into()); }
#[test] #[should_panic(expected = "ERR_PAUSED")]
fn paused_town_refuses_trades() { let mut t = town(); t.set_paused(true); ctx("t0.testnet", 0); t.trade(acc("t1.testnet"), U(W), "".into()); }

#[test]
fn amm_keeps_k_and_sends_a_fifth_of_the_fee_to_stakers() {
    let mut t = town();
    let k0 = k(&t);
    ctx("t0.testnet", 0);
    let q = t.quote_swap(true, U(100 * W)).0;
    let out = t.swap_wool_for_silk(U(100 * W), U(q)).0;
    assert_eq!(out, q);
    assert!(k(&t) >= k0);
    assert_eq!(t.stake_pot, (100 * W * 30 / 10_000) * 2_000 / 10_000);
    let k1 = k(&t);
    t.swap_silk_for_wool(U(50 * W), U(1)).0;
    assert!(k(&t) >= k1);
    assert!(t.treasury_silk > 0); // the silk side of the stakers' fee waits in the treasury for the sweep
    conserved(&t);
}
#[test] #[should_panic(expected = "ERR_MIN_OUT")]
fn min_out_holds() { let mut t = town(); ctx("t0.testnet", 0); let q = t.quote_swap(true, U(10 * W)).0; t.swap_wool_for_silk(U(10 * W), U(q + 1)); }
#[test] #[should_panic(expected = "ERR_SWAP_CAP")]
fn daily_swap_cap_is_five_percent_of_the_input_reserve() {
    let mut t = town(); ctx("owner.testnet", 0); t.credit_wool(acc("t0.testnet"), U(600 * W), "test".into());
    ctx("t0.testnet", 0); t.swap_wool_for_silk(U(300 * W), U(1)); t.swap_wool_for_silk(U(250 * W), U(1)); // 550 > 5 % of the 10,300 reserve
}
#[test]
fn swap_cap_resets_next_day() {
    let mut t = town(); ctx("t0.testnet", 0); t.swap_wool_for_silk(U(400 * W), U(1));
    ctx("t0.testnet", 1); t.swap_wool_for_silk(U(200 * W), U(1));
}
#[test]
fn liquidity_round_trip_never_gains_and_never_empties() {
    let mut t = town();
    ctx("t0.testnet", 0);
    let before = bal(&t, "t0.testnet");
    let shares = t.add_liquidity(U(100 * W), U(500 * W), U(1)).0;
    let after_add = bal(&t, "t0.testnet");
    assert_eq!(before.wool - after_add.wool, 100 * W);
    assert!((before.silk - after_add.silk).abs_diff(200 * W) <= 1);
    let (w, s) = t.remove_liquidity(U(shares), U(0), U(0));
    assert!(w.0 <= 100 * W && s.0 <= before.silk - after_add.silk);
    conserved(&t);
}
#[test] #[should_panic(expected = "ERR_POOL")]
fn the_pool_cannot_be_emptied() { let mut t = town(); let s = bal(&t, "town.testnet").lp; ctx("town.testnet", 0); t.remove_liquidity(U(s), U(0), U(0)); }

fn stake(t: &mut Town, who: &str, day: u64, asset: u8, amount: u128, tier: u8) -> TokenId { ctx_dep(who, day, DEED_DEPOSIT); t.stake(asset, U(amount), tier) }
fn day_close(t: &mut Town, day: u64) { ctx("anyone.testnet", day); t.sweep_fees(); t.distribute(); }

#[test]
fn deed_lifecycle_rewards_from_fees_only() {
    let mut t = town();
    let id = stake(&mut t, "t0.testnet", 0, 2, 300 * W, 0);
    assert_eq!(bal(&t, "t0.testnet").wool, 700 * W - 300 * W - W / 4); // deed fee burned
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
    let minted = t.minted_wool;
    ctx("t0.testnet", 2); t.begin_unbond(id.clone());
    assert_eq!(t.get_deed(id.clone()).unwrap().1.state, 1);
    ctx("t0.testnet", 4);
    let back = t.finish_unbond(id.clone()).0;
    assert_eq!(back, 300 * W);
    assert!(t.nft_token(id.clone()).is_none() && t.get_deed(id.clone()).is_none());
    assert_eq!(t.minted_wool, minted); // claims, swaps and stakes never mint (acceptance 2)
    assert_eq!(bal(&t, "t0.testnet").staked, 0);
    conserved(&t);
}
#[test] #[should_panic(expected = "ERR_NOT_READY")]
fn unbonding_waits_the_cooldown() { let mut t = town(); let id = stake(&mut t, "t0.testnet", 0, 0, 100 * W, 0); ctx("t0.testnet", 1); t.begin_unbond(id.clone()); ctx("t0.testnet", 2); t.finish_unbond(id); }
#[test] #[should_panic(expected = "ERR_NO_DEED")]
fn double_finish_unbond_fails() {
    let mut t = town(); let id = stake(&mut t, "t0.testnet", 0, 0, 100 * W, 0);
    ctx("t0.testnet", 1); t.begin_unbond(id.clone()); ctx("t0.testnet", 3); t.finish_unbond(id.clone()); t.finish_unbond(id);
}
#[test] #[should_panic(expected = "ERR_LOCKED")]
fn locked_tiers_cannot_unbond_early() { let mut t = town(); let id = stake(&mut t, "t0.testnet", 0, 0, 100 * W, 1); ctx("t0.testnet", 4); t.begin_unbond(id); }
#[test] #[should_panic(expected = "ERR_DEPOSIT")]
fn a_deed_needs_its_storage_deposit() { let mut t = town(); ctx("t0.testnet", 0); t.stake(0, U(10 * W), 0); }

#[test]
fn early_exit_takes_ten_percent_half_burned_half_to_the_other_stakers() {
    let mut t = town();
    let a = stake(&mut t, "t0.testnet", 0, 1, 200 * W, 1);
    let b = stake(&mut t, "t1.testnet", 0, 1, 200 * W, 0);
    day_close(&mut t, 1); // both earn from day 1
    let before_b = t.get_deed(b.clone()).unwrap().2 .0;
    let burned = t.burned_wool;
    ctx("t0.testnet", 2);
    let back = t.exit_early(a.clone()).0;
    assert!(back >= 180 * W && back < 181 * W);
    assert_eq!(t.burned_wool - burned, 10 * W);
    assert!(t.get_deed(b.clone()).unwrap().2 .0 >= before_b + 10 * W - 1);
    conserved(&t);
}

#[test]
fn deed_transfer_moves_the_whole_position() {
    let mut t = town();
    let id = stake(&mut t, "t0.testnet", 0, 3, 150 * W, 2);
    trades(&mut t, 200, 1); day_close(&mut t, 1); trades(&mut t, 200, 2); day_close(&mut t, 2);
    let pending = t.get_deed(id.clone()).unwrap().2 .0;
    ctx_dep("t0.testnet", 3, NearToken::from_yoctonear(1));
    t.nft_transfer(acc("t2.testnet"), id.clone(), None, None);
    let (owner, d, claim) = t.get_deed(id.clone()).unwrap();
    assert_eq!(owner, acc("t2.testnet"));
    assert_eq!((d.principal, d.locked_until_day, claim.0), (150 * W, (D0 as u32) + 10, pending));
    assert_eq!((bal(&t, "t0.testnet").staked, bal(&t, "t2.testnet").staked), (0, 150 * W));
    ctx("t2.testnet", 3); assert!(t.claim(id.clone()).0 == pending);
    conserved(&t);
}
#[test] #[should_panic(expected = "ERR_NO_EXIT_YET")]
fn a_new_owner_cannot_exit_early_for_a_day() {
    let mut t = town(); let id = stake(&mut t, "t0.testnet", 0, 0, 100 * W, 1);
    ctx_dep("t0.testnet", 1, NearToken::from_yoctonear(1)); t.nft_transfer(acc("t1.testnet"), id.clone(), None, None);
    ctx("t1.testnet", 2); t.exit_early(id);
}
#[test] #[should_panic(expected = "ERR_CAP_RECEIVER")]
fn receiver_cap_is_checked_on_transfer() {
    let mut t = town();
    let a = stake(&mut t, "t0.testnet", 0, 0, 300 * W, 0);
    stake(&mut t, "t1.testnet", 0, 1, 300 * W, 0);
    ctx_dep("t0.testnet", 1, NearToken::from_yoctonear(1)); t.nft_transfer(acc("t1.testnet"), a, None, None); // 600 > the 400 floor cap
}
#[test] #[should_panic(expected = "ERR_NO_APPROVALS")]
fn deeds_have_no_approvals() { let mut t = town(); let id = stake(&mut t, "t0.testnet", 0, 0, 10 * W, 0); ctx_dep("t0.testnet", 0, NearToken::from_yoctonear(1)); t.nft_transfer(acc("t1.testnet"), id, Some(1), None); }
#[test]
fn transfer_call_rollback_restores_the_owner_and_the_books() {
    let mut t = town();
    let id = stake(&mut t, "t0.testnet", 0, 0, 100 * W, 0);
    ctx_dep("t0.testnet", 1, NearToken::from_yoctonear(1));
    let _ = t.nft_transfer_call(acc("t1.testnet"), id.clone(), None, None, "".into());
    assert_eq!(bal(&t, "t1.testnet").staked, 100 * W);
    ctx_full("town.testnet", 1, NearToken::from_yoctonear(0), vec![PromiseResult::Successful(b"true".to_vec())]); // the receiver returns it
    assert!(!t.nft_resolve_transfer(acc("t0.testnet"), acc("t1.testnet"), id.clone(), None));
    assert_eq!(t.get_deed(id).unwrap().0, acc("t0.testnet"));
    assert_eq!((bal(&t, "t0.testnet").staked, bal(&t, "t1.testnet").staked), (100 * W, 0));
}

#[test] #[should_panic(expected = "ERR_CAP")]
fn per_account_cap_floor() { let mut t = town(); stake(&mut t, "t0.testnet", 0, 0, 300 * W, 0); stake(&mut t, "t0.testnet", 0, 1, 101 * W, 0); }
#[test]
fn caps_follow_tvl_and_the_per_works_ceiling() {
    let p = Params::default();
    assert_eq!(stake_cap(&p, 0), 400 * W);
    assert_eq!(stake_cap(&p, 20_000 * W), 1_000 * W);
    assert_eq!(stake_cap(&p, 1_000_000 * W), 4_000 * W);
}

#[test]
fn rate_ceiling_sends_the_excess_to_the_purse() {
    let mut t = town();
    stake(&mut t, "t0.testnet", 0, 0, 10 * W, 0); // a tiny works
    t.stake_pot = 1_000 * W; t.minted_wool += 1_000 * W; // as if a big fee flow arrived (test only)
    let purse = t.purse;
    ctx("anyone.testnet", 1); t.distribute();
    assert_eq!(t.works[0].rewards, 10 * W * 40 / 10_000); // 0.4 % of weight per epoch
    assert_eq!(t.purse - purse, 1_000 * W - 40_000);
    conserved(&t);
}

#[test]
fn wash_trading_loses_more_than_it_earns() {
    // The attacker owns t0 and t1 and the only deed; it washes 400 trades a day for 5 days.
    let mut t = town();
    let id = stake(&mut t, "t0.testnet", 0, 0, 390 * W, 0);
    let silk0 = bal(&t, "t0.testnet").silk + bal(&t, "t1.testnet").silk;
    let mut earned = 0;
    for day in 1..=5 {
        for i in 0..400 { let (a, b) = if i % 2 == 0 { ("t0.testnet", "t1.testnet") } else { ("t1.testnet", "t0.testnet") }; ctx(a, day); t.trade(acc(b), U(2 * W), "".into()); }
        day_close(&mut t, day);
        ctx("t0.testnet", day); earned += t.claim(id.clone()).0;
    }
    let lost_silk = silk0 - (bal(&t, "t0.testnet").silk + bal(&t, "t1.testnet").silk);
    let earned_in_silk = earned * t.pool.silk / t.pool.wool;
    assert!(earned_in_silk < lost_silk, "earned {} silk-equivalent, lost {}", earned_in_silk, lost_silk);
    conserved(&t);
}

#[test] #[should_panic(expected = "ERR_CREDIT_CAP")]
fn wool_credit_has_a_daily_ceiling() { let mut t = town(); ctx("coord.testnet", 0); t.credit_wool(acc("t0.testnet"), U(1_500 * W), "a".into()); t.credit_wool(acc("t0.testnet"), U(501 * W), "b".into()); }
#[test] #[should_panic(expected = "ERR_NOT_COORDINATOR")]
fn only_coordinators_credit_wool() { let mut t = town(); ctx("t0.testnet", 0); t.credit_wool(acc("t0.testnet"), U(1), "".into()); }
#[test]
fn season_root_is_fixed_and_deeds_carry_it() {
    let mut t = town();
    ctx("coord.testnet", 0); t.set_season("793f6c05e89839f2".into(), "03dbd4587b5d".into());
    let id = stake(&mut t, "t0.testnet", 0, 0, 10 * W, 0);
    assert!(id.starts_with("deed-793f6c05e89839f2-"));
    assert_eq!(t.get_deed(id).unwrap().1.schedule_root, "03dbd4587b5d");
}
#[test] #[should_panic(expected = "ERR_SEASON_ROOT")]
fn season_root_cannot_change() { let mut t = town(); ctx("coord.testnet", 0); t.set_season("s1".into(), "aa".into()); t.set_season("s1".into(), "bb".into()); }
#[test] #[should_panic(expected = "ERR_PARAMS")]
fn params_are_bounded() { let mut t = town(); let mut p = Params::default(); p.trade_fee_bps = 500; t.set_params(p); }
#[test] #[should_panic(expected = "ERR_ONCE_A_DAY")]
fn sweep_once_per_epoch() { let mut t = town(); ctx("x.testnet", 1); t.sweep_fees(); t.sweep_fees(); }

#[test]
fn long_random_run_conserves_everything() {
    let mut t = town();
    let mut deeds: Vec<(String, TokenId)> = vec![];
    let mut s: u64 = 42;
    let mut rnd = |n: u64| { s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407); (s >> 33) % n };
    for day in 0..12u64 {
        for _ in 0..300 {
            let a = ACCS[rnd(4) as usize]; let b = ACCS[rnd(4) as usize];
            match rnd(20) {
                0 => { if bal(&t, a).wool > 30 * W && bal(&t, a).staked + 20 * W <= stake_cap(&t.params, t.tvl()) { let id = stake(&mut t, a, day, rnd(4) as u8, 20 * W, rnd(4) as u8); deeds.push((a.into(), id)); } }
                1 => { ctx(a, day); if bal(&t, a).wool > 5 * W { let _ = t.swap_wool_for_silk(U(W), U(1)); } }
                2 => { ctx(a, day); if bal(&t, a).silk > 5 * W { let _ = t.swap_silk_for_wool(U(2 * W), U(1)); } }
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
                _ => { if a != b && bal(&t, a).silk > 3 * W { ctx(a, day); t.trade(acc(b), U(W + rnd(2 * W as u64) as u128), "x".into()); } }
            }
        }
        day_close(&mut t, day);
        conserved(&t);
        let claimable: u128 = deeds.iter().filter_map(|(_, id)| t.get_deed(id.clone())).map(|x| x.2 .0).sum();
        let rewards: u128 = t.works.iter().map(|w| w.rewards).sum();
        assert!(claimable <= rewards, "claimable {} > credited {}", claimable, rewards); // acceptance 4
    }
}

/// contracts/town/tests/vectors.json (written by tools/town/vectors.mjs from the JS rules) must match rules.rs.
#[test]
fn rules_match_the_shared_vectors() {
    let v: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(include_str!("../tests/vectors.json")).unwrap();
    let n = |x: &near_sdk::serde_json::Value| -> u128 { x.as_str().unwrap().parse().unwrap() };
    let p = Params::default();
    for c in v["swaps"].as_array().unwrap() {
        let q = swap_quote(&p, n(&c["x"]), n(&c["y"]), n(&c["amount"]));
        assert_eq!((q.out, q.fee, q.to_stakers), (n(&c["out"]), n(&c["fee"]), n(&c["to_stakers"])), "swap {}", c);
    }
    for c in v["fees"].as_array().unwrap() { assert_eq!(trade_fee(&p, n(&c["silk"])), n(&c["fee"])); }
    for c in v["caps"].as_array().unwrap() { assert_eq!(stake_cap(&p, n(&c["tvl"])), n(&c["cap"])); }
    for c in v["lps"].as_array().unwrap() {
        assert_eq!(lp_add(&n(&c["x"]), &n(&c["y"]), n(&c["total"]), n(&c["wool_max"]), n(&c["silk_max"])), (n(&c["shares"]), n(&c["wool"]), n(&c["silk"])), "lp {}", c);
    }
    for c in v["splits"].as_array().unwrap() {
        let s = split_bought(&p, n(&c["bought"]));
        assert_eq!((s.stakers, s.purse, s.reserve, s.burn), (n(&c["stakers"]), n(&c["purse"]), n(&c["reserve"]), n(&c["burn"])));
    }
    for c in v["plans"].as_array().unwrap() {
        let w: Vec<u128> = c["weights"].as_array().unwrap().iter().map(n).collect();
        let r = plan_distribution(&p, n(&c["pot"]), &[w[0], w[1], w[2], w[3]]);
        let pots: Vec<u128> = c["pots"].as_array().unwrap().iter().map(n).collect();
        assert_eq!((r.pots.to_vec(), r.overflow), (pots, n(&c["overflow"])), "plan {}", c);
    }
    for c in v["pendings"].as_array().unwrap() { assert_eq!(pending_reward(n(&c["weight"]), n(&c["snapshot"]), n(&c["index"])), n(&c["pending"])); }
}
