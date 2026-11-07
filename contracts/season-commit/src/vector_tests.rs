//! Pure verification tests (no blockchain needed, run on every platform) against the
//! cross-implementation vectors in tests/vectors.json, which
//! game/scripts/gen-contract-vectors.mjs produces from engine.js (rules v2) and crypto.js.

use crate::proof::{self, CanonicalEvent, PathStep};
use near_sdk::serde::Deserialize;

#[derive(Deserialize, Clone)]
#[serde(crate = "near_sdk::serde", rename_all = "camelCase")]
pub(crate) struct Vectors {
    pub schema_version: String,
    pub seasons: Vec<SeasonVec>,
    pub edge_trees: Vec<SeasonVec>,
}

#[derive(Deserialize, Clone)]
#[serde(crate = "near_sdk::serde", rename_all = "camelCase")]
pub(crate) struct SeasonVec {
    pub season_id: String,
    pub schema_version: String,
    pub schedule_root: String,
    pub leaf_count: u32,
    pub leaves: Vec<LeafVec>,
    pub ash_key: Option<AshVec>,
}

#[derive(Deserialize, Clone)]
#[serde(crate = "near_sdk::serde", rename_all = "camelCase")]
pub(crate) struct LeafVec {
    pub index: u32,
    pub canonical_event: String,
    pub salt: String,
    pub leaf: String,
    pub path: Vec<PathStep>,
}

#[derive(Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub(crate) struct AshVec {
    pub phrase: String,
    pub salt: String,
    pub commitment: String,
}

pub(crate) fn vectors() -> Vectors {
    near_sdk::serde_json::from_str(include_str!("../tests/vectors.json")).expect("vectors.json parses")
}

/// Replaces the hex character at `pos` with a different one.
pub(crate) fn flip(s: &str, pos: usize) -> String {
    let mut b = s.as_bytes().to_vec();
    b[pos] = if b[pos] == b'0' { b'1' } else { b'0' };
    String::from_utf8(b).unwrap()
}

/// What the contract's `verify` does after loading the season: leaf, then path, then root.
fn check(s: &SeasonVec, season_id: &str, index: u32, event: &str, salt: &str, path: &[PathStep]) -> Result<(), &'static str> {
    CanonicalEvent::parse(event)?;
    proof::parse_salt(salt)?;
    let leaf = proof::leaf_hash(&s.schema_version, season_id, index, event, salt);
    let root = proof::root_from_path(leaf, index, s.leaf_count, path)?;
    if root == proof::parse_hash(&s.schedule_root).unwrap() { Ok(()) } else { Err("root mismatch") }
}

/// A forged leaf either folds to a different root or, for a self-paired last node, breaks
/// the duplicate rule before reaching the root.
fn rejected(r: Result<(), &'static str>) -> bool {
    matches!(r, Err("root mismatch") | Err(proof::ERR_BAD_PATH_DUPLICATE))
}

fn season() -> SeasonVec {
    vectors().seasons[0].clone()
}

#[test]
fn vectors_leaves_roots_and_paths_match_the_game() {
    let v = vectors();
    assert_eq!(v.schema_version, "v2");
    let mut checked = 0;
    for s in v.seasons.iter().chain(v.edge_trees.iter()) {
        let root = proof::parse_hash(&s.schedule_root).unwrap();
        assert_eq!(s.leaves.len() as u32, s.leaf_count);
        for l in &s.leaves {
            let leaf = proof::leaf_hash(&s.schema_version, &s.season_id, l.index, &l.canonical_event, &l.salt);
            assert_eq!(proof::to_hex(&leaf), l.leaf, "leaf {}#{}", s.season_id, l.index);
            let ev = CanonicalEvent::parse(&l.canonical_event).unwrap();
            assert_eq!(ev.to_canonical_string(), l.canonical_event);
            assert_eq!(proof::root_from_path(leaf, l.index, s.leaf_count, &l.path), Ok(root), "path {}#{}", s.season_id, l.index);
            checked += 1;
        }
    }
    assert_eq!(checked, 3 * 15 + 1 + 2 + 5);
}

#[test]
fn vectors_ash_key_commitments_match_the_game() {
    for s in vectors().seasons {
        let a = s.ash_key.unwrap();
        let h = proof::key_commitment(&s.schema_version, &s.season_id, &a.phrase, &a.salt);
        assert_eq!(proof::to_hex(&h), a.commitment);
    }
}

#[test]
fn sha256_matches_known_answers() {
    assert_eq!(proof::to_hex(&proof::sha256(b"")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert_eq!(proof::to_hex(&proof::sha256(b"abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}

#[test]
fn tree_depth_matches_crypto_js_levels() {
    assert_eq!([1, 2, 3, 4, 5, 8, 9, 15, 16, 17].map(proof::tree_depth), [0, 1, 2, 2, 3, 3, 4, 4, 4, 5]);
}

#[test]
fn canonical_event_parser_is_strict() {
    let good = r#"{"t":5,"place":3,"action":0,"power":2,"delay":4,"dots":1}"#;
    assert!(CanonicalEvent::parse(good).is_ok());
    for bad in [
        r#"{"t":5, "place":3,"action":0,"power":2,"delay":4,"dots":1}"#,
        r#"{"place":3,"t":5,"action":0,"power":2,"delay":4,"dots":1}"#,
        r#"{"t":05,"place":3,"action":0,"power":2,"delay":4,"dots":1}"#,
        r#"{"t":5,"place":4,"action":0,"power":2,"delay":4,"dots":1}"#,
        r#"{"t":5,"place":3,"action":0,"power":2,"delay":0,"dots":1}"#,
        r#"{"t":4,"place":3,"action":0,"power":2,"delay":4,"dots":1}"#,
        r#"{"t":5,"place":3,"action":0,"power":2,"delay":4,"dots":1} "#,
        r#"{"t":5,"place":3,"action":0,"power":2,"delay":4,"dots":1,"x":0}"#,
        r#"{"t":256,"place":3,"action":0,"power":2,"delay":4,"dots":1}"#,
        r#"{"t":-5,"place":3,"action":0,"power":2,"delay":4,"dots":1}"#,
        "",
    ] {
        assert_eq!(CanonicalEvent::parse(bad), Err(proof::ERR_BAD_EVENT), "{bad}");
    }
}

#[test]
fn input_validation() {
    assert!(proof::check_schema("v2").is_ok());
    assert_eq!(proof::check_schema("v1"), Err(proof::ERR_BAD_SCHEMA));
    assert!(proof::check_season_id("7ae85e26fbe7d35f").is_ok());
    for bad in ["", "abc", "7AE85E26FBE7D35F", "7ae85e26|be7d35f", &"a".repeat(65)] {
        assert_eq!(proof::check_season_id(bad), Err(proof::ERR_BAD_SEASON_ID), "{bad}");
    }
    let salt = "ab".repeat(32);
    assert_eq!(proof::parse_salt(&salt).unwrap().len(), 32);
    assert_eq!(proof::parse_salt(&"ab".repeat(64)).unwrap().len(), 64);
    for bad in ["ab".repeat(31), "ab".repeat(65), format!("{salt}a"), salt.to_uppercase(), format!("{}g", &salt[..63])] {
        assert_eq!(proof::parse_salt(&bad), Err(proof::ERR_BAD_SALT), "{bad}");
    }
    assert_eq!(proof::parse_hash(&"A".repeat(64)), Err(proof::ERR_BAD_HASH));
    assert_eq!(proof::parse_hash(&"a".repeat(63)), Err(proof::ERR_BAD_HASH));
    assert_eq!(proof::check_phrase(""), Err(proof::ERR_BAD_PHRASE));
    assert_eq!(proof::check_phrase(&"x".repeat(257)), Err(proof::ERR_BAD_PHRASE));
}

#[test]
fn every_vector_leaf_passes_the_full_check() {
    let v = vectors();
    for s in v.seasons.iter().chain(v.edge_trees.iter()) {
        for l in &s.leaves {
            assert_eq!(check(s, &s.season_id, l.index, &l.canonical_event, &l.salt, &l.path), Ok(()));
        }
    }
}

#[test]
fn tampered_event_fails() {
    let s = season();
    for l in &s.leaves {
        let mut e = CanonicalEvent::parse(&l.canonical_event).unwrap();
        e.dots = (e.dots + 1) % 4;
        assert!(rejected(check(&s, &s.season_id, l.index, &e.to_canonical_string(), &l.salt, &l.path)), "#{}", l.index);
    }
    let l = &s.leaves[0];
    assert_eq!(check(&s, &s.season_id, 0, &l.canonical_event.replace(':', ": "), &l.salt, &l.path), Err(proof::ERR_BAD_EVENT));
}

#[test]
fn tampered_salt_fails() {
    let s = season();
    for l in &s.leaves {
        for pos in [0, 31, 63] {
            assert!(rejected(check(&s, &s.season_id, l.index, &l.canonical_event, &flip(&l.salt, pos), &l.path)), "#{}", l.index);
        }
    }
}

#[test]
fn tampered_path_fails() {
    let s = season();
    let l = &s.leaves[0];
    for step in 0..l.path.len() {
        let mut p = l.path.clone();
        p[step].h = flip(&p[step].h, 7);
        assert_eq!(check(&s, &s.season_id, 0, &l.canonical_event, &l.salt, &p), Err("root mismatch"));
        let mut p = l.path.clone();
        p[step].left = !p[step].left;
        assert_eq!(check(&s, &s.season_id, 0, &l.canonical_event, &l.salt, &p), Err(proof::ERR_BAD_PATH_DIRECTION));
    }
    let mut p = l.path.clone();
    p.pop();
    assert_eq!(check(&s, &s.season_id, 0, &l.canonical_event, &l.salt, &p), Err(proof::ERR_BAD_PATH_LENGTH));
    let mut p = l.path.clone();
    p.push(PathStep { h: s.schedule_root.clone(), left: false });
    assert_eq!(check(&s, &s.season_id, 0, &l.canonical_event, &l.salt, &p), Err(proof::ERR_BAD_PATH_LENGTH));
    let mut p = l.path.clone();
    p[0].h = "Z".repeat(64);
    assert_eq!(check(&s, &s.season_id, 0, &l.canonical_event, &l.salt, &p), Err(proof::ERR_BAD_HASH));
    // The 15th leaf has no sibling: crypto.js pairs it with itself and so must the proof.
    let last = &s.leaves[14];
    let mut p = last.path.clone();
    p[0].h = s.leaves[13].leaf.clone();
    assert_eq!(check(&s, &s.season_id, 14, &last.canonical_event, &last.salt, &p), Err(proof::ERR_BAD_PATH_DUPLICATE));
}

#[test]
fn wrong_season_fails() {
    let v = vectors();
    let (a, b) = (&v.seasons[0], &v.seasons[1]);
    for l in &a.leaves {
        // a's leaf claimed under b's id, checked against either root
        assert!(rejected(check(b, &b.season_id, l.index, &l.canonical_event, &l.salt, &l.path)));
        assert!(rejected(check(a, &b.season_id, l.index, &l.canonical_event, &l.salt, &l.path)));
    }
}

#[test]
fn wrong_index_fails() {
    let s = season();
    for (i, l) in s.leaves.iter().enumerate() {
        for j in 0..s.leaf_count {
            if j as usize == i {
                continue;
            }
            // the claimed index's own path, and the original path
            let other = &s.leaves[j as usize].path;
            assert!(check(&s, &s.season_id, j, &l.canonical_event, &l.salt, other).is_err(), "{i} as {j}");
            assert!(check(&s, &s.season_id, j, &l.canonical_event, &l.salt, &l.path).is_err(), "{i} as {j} (own path)");
        }
    }
    let l = &s.leaves[14];
    assert_eq!(check(&s, &s.season_id, 15, &l.canonical_event, &l.salt, &l.path), Err(proof::ERR_INDEX_OUT_OF_RANGE));
}

#[test]
fn hex_round_trip() {
    let h = proof::sha256(b"ftf");
    assert_eq!(proof::parse_hash(&proof::to_hex(&h)), Ok(h));
}