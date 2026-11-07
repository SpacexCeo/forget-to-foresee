//! Contract-level unit tests on near-sdk's mocked blockchain, driven by the
//! cross-implementation vectors (tests/vectors.json).

use super::*;
use crate::vector_tests::{flip, vectors, SeasonVec, LeafVec, Vectors};
use near_sdk::test_utils::{accounts, get_logs, VMContextBuilder};
use near_sdk::testing_env;

const DEPOSIT: NearToken = NearToken::from_millinear(10);
const ZERO: NearToken = NearToken::from_yoctonear(0);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

fn owner() -> AccountId { accounts(1) }
fn coord() -> AccountId { accounts(2) }
fn player() -> AccountId { accounts(3) }
fn stranger() -> AccountId { accounts(4) }

fn set(predecessor: AccountId, deposit: NearToken) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(accounts(0))
        .predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .attached_deposit(deposit)
        .block_height(100)
        .block_timestamp(1_700_000_000_000_000_000);
    testing_env!(b.build());
}

fn setup() -> (Contract, Vectors) {
    set(owner(), ZERO);
    (Contract::new(owner(), vec![coord()]), vectors())
}

fn commit(c: &mut Contract, s: &SeasonVec) -> SeasonView {
    set(coord(), DEPOSIT);
    c.commit_season(s.season_id.clone(), s.schedule_root.clone(), s.schema_version.clone(), s.leaf_count)
}

fn reveal_raw(c: &mut Contract, season_id: &str, index: u32, event: &str, salt: &str, path: Vec<PathStep>) -> RevealedLeafView {
    set(player(), DEPOSIT);
    c.reveal_leaf(season_id.to_string(), index, event.to_string(), salt.to_string(), path)
}

fn reveal(c: &mut Contract, s: &SeasonVec, l: &LeafVec) -> RevealedLeafView {
    reveal_raw(c, &s.season_id, l.index, &l.canonical_event, &l.salt, l.path.clone())
}

fn commit_ash(c: &mut Contract, s: &SeasonVec) -> AshKeyView {
    set(coord(), DEPOSIT);
    c.commit_ash_key(s.season_id.clone(), s.ash_key.as_ref().unwrap().commitment.clone())
}

/* ---------- happy paths ---------- */

#[test]
fn full_season_commit_ash_key_reveal_every_leaf_and_views() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    let view = commit(&mut c, s);
    assert_eq!(view.schedule_root, s.schedule_root);
    assert_eq!(view.leaf_count, 15);
    assert_eq!(view.committed_by, coord());
    assert!(get_logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains("\"standard\":\"ftf_season\"") && l.contains("\"event\":\"season_committed\"")));

    let ak = commit_ash(&mut c, s);
    assert!(!ak.revealed);
    assert!(c.get_season(s.season_id.clone()).unwrap().ash_key_committed);

    for l in &s.leaves {
        let r = reveal(&mut c, s, l);
        assert_eq!(r.leaf, l.leaf);
        assert_eq!(r.canonical_event, l.canonical_event);
        assert_eq!(r.salt, l.salt);
        assert_eq!(r.revealed_by, player());
        assert!(get_logs().iter().any(|x| x.starts_with("EVENT_JSON:") && x.contains("\"event\":\"leaf_revealed\"")));
    }
    assert_eq!(c.get_season(s.season_id.clone()).unwrap().revealed_count, 15);
    assert_eq!(c.get_revealed_leaves(s.season_id.clone(), None, None).len(), 15);
    assert_eq!(c.get_revealed_leaves(s.season_id.clone(), Some(10), Some(3)).iter().map(|r| r.index).collect::<Vec<_>>(), vec![10, 11, 12]);
    assert_eq!(c.get_revealed_leaf(s.season_id.clone(), 7).unwrap().leaf, s.leaves[7].leaf);

    let a = s.ash_key.as_ref().unwrap();
    set(player(), DEPOSIT);
    let opened = c.reveal_ash_key(s.season_id.clone(), a.phrase.clone(), a.salt.clone());
    assert!(opened.revealed);
    assert_eq!(opened.phrase.as_deref(), Some(a.phrase.as_str()));
    assert_eq!(opened.revealed_by, Some(player()));
    assert!(get_logs().iter().any(|x| x.contains("\"event\":\"ash_key_revealed\"")));
}

#[test]
fn every_vector_season_and_edge_tree_verifies_on_chain() {
    let (mut c, v) = setup();
    for s in v.seasons.iter().chain(v.edge_trees.iter()) {
        commit(&mut c, s);
        for l in s.leaves.iter().rev() {
            assert_eq!(reveal(&mut c, s, l).leaf, l.leaf);
        }
    }
}

#[test]
fn multibyte_ash_phrase_round_trips() {
    let (mut c, v) = setup();
    let s = &v.seasons[2];
    let a = s.ash_key.as_ref().unwrap();
    assert!(a.phrase.len() > a.phrase.chars().count(), "vector phrase must contain multi-byte characters");
    commit(&mut c, s);
    commit_ash(&mut c, s);
    set(stranger(), DEPOSIT);
    assert_eq!(c.reveal_ash_key(s.season_id.clone(), a.phrase.clone(), a.salt.clone()).phrase, Some(a.phrase.clone()));
}

#[test]
fn check_leaf_and_compute_leaf_are_read_only_dry_runs() {
    let (mut c, v) = setup();
    let s = &v.seasons[1];
    let l = &s.leaves[4];
    let pre = c.check_leaf(s.season_id.clone(), l.index, l.canonical_event.clone(), l.salt.clone(), l.path.clone());
    assert_eq!(pre.error.as_deref(), Some(ERR_SEASON_NOT_COMMITTED));
    commit(&mut c, s);
    let ok = c.check_leaf(s.season_id.clone(), l.index, l.canonical_event.clone(), l.salt.clone(), l.path.clone());
    assert!(ok.valid);
    assert_eq!(ok.leaf.as_deref(), Some(l.leaf.as_str()));
    let bad = c.check_leaf(s.season_id.clone(), l.index, l.canonical_event.clone(), flip(&l.salt, 0), l.path.clone());
    assert_eq!((bad.valid, bad.error.as_deref()), (false, Some(ERR_ROOT_MISMATCH)));
    assert_eq!(c.get_season(s.season_id.clone()).unwrap().revealed_count, 0);
    assert_eq!(c.compute_leaf("v2".into(), s.season_id.clone(), l.index, l.canonical_event.clone(), l.salt.clone()), l.leaf);
}

#[test]
fn storage_deposit_is_charged_and_the_rest_refunded() {
    // Each testing_env! starts a fresh storage_usage counter, so measure inside one context.
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    set(coord(), DEPOSIT);
    let before = env::storage_usage();
    c.commit_season(s.season_id.clone(), s.schedule_root.clone(), s.schema_version.clone(), s.leaf_count);
    let commit_cost = env::storage_byte_cost().saturating_mul(u128::from(env::storage_usage() - before));

    let l = &s.leaves[0];
    set(player(), DEPOSIT);
    let before = env::storage_usage();
    c.reveal_leaf(s.season_id.clone(), l.index, l.canonical_event.clone(), l.salt.clone(), l.path.clone());
    let reveal_cost = env::storage_byte_cost().saturating_mul(u128::from(env::storage_usage() - before));
    assert!(commit_cost > ZERO && reveal_cost > ZERO);
    assert!(commit_cost < DEPOSIT && reveal_cost < DEPOSIT, "0.01 NEAR covers commit ({commit_cost}) and reveal ({reveal_cost})");

    // Attaching exactly the storage cost is enough (leaf records have equal size).
    let l1 = &s.leaves[1];
    set(player(), reveal_cost);
    c.reveal_leaf(s.season_id.clone(), l1.index, l1.canonical_event.clone(), l1.salt.clone(), l1.path.clone());
    assert_eq!(c.get_season(s.season_id.clone()).unwrap().revealed_count, 2);
}
#[test]
fn owner_manages_coordinators() {
    let (mut c, v) = setup();
    set(owner(), ONE_YOCTO);
    c.add_coordinator(stranger());
    assert!(c.is_coordinator(stranger()));
    commit_as(&mut c, &v.seasons[0], stranger());
    set(owner(), ONE_YOCTO);
    c.remove_coordinator(stranger());
    assert!(!c.is_coordinator(stranger()));
    assert_eq!(c.get_coordinators(), vec![coord()]);
    assert_eq!(c.get_owner(), owner());
}

fn commit_as(c: &mut Contract, s: &SeasonVec, who: AccountId) -> SeasonView {
    set(who, DEPOSIT);
    c.commit_season(s.season_id.clone(), s.schedule_root.clone(), s.schema_version.clone(), s.leaf_count)
}

/* ---------- negative tests: commit ---------- */

#[test]
#[should_panic(expected = "ERR_NOT_COORDINATOR")]
fn unauthorized_commit_is_rejected() {
    let (mut c, v) = setup();
    commit_as(&mut c, &v.seasons[0], stranger());
}

#[test]
#[should_panic(expected = "ERR_NOT_COORDINATOR")]
fn owner_is_not_a_coordinator_by_default() {
    let (mut c, v) = setup();
    commit_as(&mut c, &v.seasons[0], owner());
}

#[test]
#[should_panic(expected = "ERR_SEASON_EXISTS")]
fn recommit_is_rejected_even_with_a_different_root() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    set(coord(), DEPOSIT);
    c.commit_season(s.season_id.clone(), v.seasons[1].schedule_root.clone(), "v2".into(), 15);
}

#[test]
#[should_panic(expected = "ERR_NOT_COORDINATOR")]
fn removed_coordinator_cannot_commit() {
    let (mut c, v) = setup();
    set(owner(), ONE_YOCTO);
    c.remove_coordinator(coord());
    commit(&mut c, &v.seasons[0]);
}

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn non_owner_cannot_add_coordinators() {
    let (mut c, _) = setup();
    set(coord(), ONE_YOCTO);
    c.add_coordinator(stranger());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn owner_calls_require_one_yocto() {
    let (mut c, _) = setup();
    set(owner(), ZERO);
    c.add_coordinator(stranger());
}

#[test]
#[should_panic(expected = "ERR_BAD_SCHEMA")]
fn unsupported_schema_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    set(coord(), DEPOSIT);
    c.commit_season(s.season_id.clone(), s.schedule_root.clone(), "v1".into(), 15);
}

#[test]
#[should_panic(expected = "ERR_BAD_HASH")]
fn uppercase_root_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    set(coord(), DEPOSIT);
    c.commit_season(s.season_id.clone(), s.schedule_root.to_uppercase(), "v2".into(), 15);
}

#[test]
#[should_panic(expected = "ERR_BAD_SEASON_ID")]
fn season_id_with_separator_is_rejected() {
    let (mut c, v) = setup();
    set(coord(), DEPOSIT);
    c.commit_season("abcd|ef0123".into(), v.seasons[0].schedule_root.clone(), "v2".into(), 15);
}

#[test]
#[should_panic(expected = "ERR_BAD_LEAF_COUNT")]
fn zero_leaf_count_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    set(coord(), DEPOSIT);
    c.commit_season(s.season_id.clone(), s.schedule_root.clone(), "v2".into(), 0);
}

#[test]
#[should_panic(expected = "ERR_INSUFFICIENT_DEPOSIT")]
fn commit_without_storage_deposit_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    set(coord(), ONE_YOCTO);
    c.commit_season(s.season_id.clone(), s.schedule_root.clone(), "v2".into(), 15);
}

/* ---------- negative tests: reveal ---------- */

#[test]
#[should_panic(expected = "ERR_SEASON_NOT_COMMITTED")]
fn reveal_before_commit_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    reveal(&mut c, s, &s.leaves[0]);
}

#[test]
#[should_panic(expected = "ERR_ROOT_MISMATCH")]
fn tampered_event_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[5];
    let mut e = CanonicalEvent::parse(&l.canonical_event).unwrap();
    e.dots = (e.dots + 1) % 4;
    reveal_raw(&mut c, &s.season_id, l.index, &e.to_canonical_string(), &l.salt, l.path.clone());
}

#[test]
#[should_panic(expected = "ERR_BAD_EVENT")]
fn non_canonical_event_bytes_are_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[5];
    reveal_raw(&mut c, &s.season_id, l.index, &l.canonical_event.replace(':', ": "), &l.salt, l.path.clone());
}

#[test]
#[should_panic(expected = "ERR_ROOT_MISMATCH")]
fn tampered_salt_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[3];
    reveal_raw(&mut c, &s.season_id, l.index, &l.canonical_event, &flip(&l.salt, 63), l.path.clone());
}

#[test]
#[should_panic(expected = "ERR_BAD_SALT")]
fn short_salt_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[3];
    reveal_raw(&mut c, &s.season_id, l.index, &l.canonical_event, &l.salt[..62], l.path.clone());
}

#[test]
#[should_panic(expected = "ERR_BAD_SALT")]
fn uppercase_salt_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[3];
    reveal_raw(&mut c, &s.season_id, l.index, &l.canonical_event, &l.salt.to_uppercase(), l.path.clone());
}

#[test]
#[should_panic(expected = "ERR_ROOT_MISMATCH")]
fn tampered_path_hash_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[0];
    let mut path = l.path.clone();
    path[2].h = flip(&path[2].h, 10);
    reveal_raw(&mut c, &s.season_id, l.index, &l.canonical_event, &l.salt, path);
}

#[test]
#[should_panic(expected = "ERR_BAD_PATH_DUPLICATE")]
fn tampered_self_paired_node_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[14]; // the 15th leaf has no sibling and is paired with itself
    let mut path = l.path.clone();
    path[0].h = s.leaves[13].leaf.clone();
    reveal_raw(&mut c, &s.season_id, l.index, &l.canonical_event, &l.salt, path);
}

#[test]
#[should_panic(expected = "ERR_BAD_PATH_DIRECTION")]
fn flipped_path_side_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[6];
    let mut path = l.path.clone();
    path[1].left = !path[1].left;
    reveal_raw(&mut c, &s.season_id, l.index, &l.canonical_event, &l.salt, path);
}

#[test]
#[should_panic(expected = "ERR_BAD_PATH_LENGTH")]
fn truncated_path_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[6];
    let mut path = l.path.clone();
    path.pop();
    reveal_raw(&mut c, &s.season_id, l.index, &l.canonical_event, &l.salt, path);
}

#[test]
#[should_panic(expected = "ERR_BAD_PATH_LENGTH")]
fn extended_path_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[6];
    let mut path = l.path.clone();
    path.push(PathStep { h: s.schedule_root.clone(), left: false });
    reveal_raw(&mut c, &s.season_id, l.index, &l.canonical_event, &l.salt, path);
}

#[test]
#[should_panic(expected = "ERR_ROOT_MISMATCH")]
fn wrong_season_is_rejected() {
    let (mut c, v) = setup();
    let (a, b) = (&v.seasons[0], &v.seasons[1]);
    commit(&mut c, a);
    commit(&mut c, b);
    let l = &a.leaves[2];
    reveal_raw(&mut c, &b.season_id, l.index, &l.canonical_event, &l.salt, l.path.clone());
}

#[test]
#[should_panic(expected = "ERR_ROOT_MISMATCH")]
fn wrong_index_with_that_index_path_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let (l2, l3) = (&s.leaves[2], &s.leaves[3]);
    reveal_raw(&mut c, &s.season_id, 3, &l2.canonical_event, &l2.salt, l3.path.clone());
}

#[test]
#[should_panic(expected = "ERR_BAD_PATH_DIRECTION")]
fn wrong_index_with_the_original_path_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[2];
    reveal_raw(&mut c, &s.season_id, 3, &l.canonical_event, &l.salt, l.path.clone());
}

#[test]
#[should_panic(expected = "ERR_INDEX_OUT_OF_RANGE")]
fn index_beyond_leaf_count_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[14];
    reveal_raw(&mut c, &s.season_id, 15, &l.canonical_event, &l.salt, l.path.clone());
}

#[test]
#[should_panic(expected = "ERR_ALREADY_REVEALED")]
fn double_reveal_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    reveal(&mut c, s, &s.leaves[1]);
    reveal(&mut c, s, &s.leaves[1]);
}

#[test]
#[should_panic(expected = "ERR_INSUFFICIENT_DEPOSIT")]
fn reveal_without_storage_deposit_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let l = &s.leaves[1];
    set(player(), ZERO);
    c.reveal_leaf(s.season_id.clone(), l.index, l.canonical_event.clone(), l.salt.clone(), l.path.clone());
}

/* ---------- negative tests: Ash's key ---------- */

#[test]
#[should_panic(expected = "ERR_ASH_KEY_NOT_COMMITTED")]
fn ash_reveal_before_commit_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    let a = s.ash_key.as_ref().unwrap();
    set(player(), DEPOSIT);
    c.reveal_ash_key(s.season_id.clone(), a.phrase.clone(), a.salt.clone());
}

#[test]
#[should_panic(expected = "ERR_SEASON_NOT_COMMITTED")]
fn ash_commit_before_season_commit_is_rejected() {
    let (mut c, v) = setup();
    commit_ash(&mut c, &v.seasons[0]);
}

#[test]
#[should_panic(expected = "ERR_ASH_KEY_MISMATCH")]
fn wrong_ash_phrase_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    commit_ash(&mut c, s);
    set(player(), DEPOSIT);
    c.reveal_ash_key(s.season_id.clone(), "water remembers stones".into(), s.ash_key.as_ref().unwrap().salt.clone());
}

#[test]
#[should_panic(expected = "ERR_ASH_KEY_MISMATCH")]
fn wrong_ash_salt_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    commit_ash(&mut c, s);
    let a = s.ash_key.as_ref().unwrap();
    set(player(), DEPOSIT);
    c.reveal_ash_key(s.season_id.clone(), a.phrase.clone(), flip(&a.salt, 5));
}

#[test]
#[should_panic(expected = "ERR_ASH_KEY_MISMATCH")]
fn ash_key_of_another_season_is_rejected() {
    let (mut c, v) = setup();
    let (a, b) = (&v.seasons[0], &v.seasons[1]);
    commit(&mut c, a);
    commit_ash(&mut c, a);
    let k = b.ash_key.as_ref().unwrap();
    set(player(), DEPOSIT);
    c.reveal_ash_key(a.season_id.clone(), k.phrase.clone(), k.salt.clone());
}

#[test]
#[should_panic(expected = "ERR_ASH_KEY_EXISTS")]
fn ash_recommit_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    commit_ash(&mut c, s);
    commit_ash(&mut c, s);
}

#[test]
#[should_panic(expected = "ERR_NOT_COORDINATOR")]
fn unauthorized_ash_commit_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    set(stranger(), DEPOSIT);
    c.commit_ash_key(s.season_id.clone(), s.ash_key.as_ref().unwrap().commitment.clone());
}

#[test]
#[should_panic(expected = "ERR_SEASON_STARTED")]
fn ash_commit_after_the_first_reveal_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    reveal(&mut c, s, &s.leaves[0]);
    commit_ash(&mut c, s);
}

#[test]
#[should_panic(expected = "ERR_ASH_KEY_REVEALED")]
fn ash_double_reveal_is_rejected() {
    let (mut c, v) = setup();
    let s = &v.seasons[0];
    commit(&mut c, s);
    commit_ash(&mut c, s);
    let a = s.ash_key.as_ref().unwrap();
    set(player(), DEPOSIT);
    c.reveal_ash_key(s.season_id.clone(), a.phrase.clone(), a.salt.clone());
    set(player(), DEPOSIT);
    c.reveal_ash_key(s.season_id.clone(), a.phrase.clone(), a.salt.clone());
}