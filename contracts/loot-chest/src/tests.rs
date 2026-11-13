use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;
use near_sdk::NearToken;

const ROOT: &str = "18b54f9d37b2c3b0ed458f7ec90d8dd01e62d2fa468e1fea28ffc5a19620058e";
const REQ: &str = r#"{"model":"m","messages":[{"role":"user","content":"chest seed s1 18b54f9d37b2c3b0ed458f7ec90d8dd01e62d2fa468e1fea28ffc5a19620058e"}]}"#;
const TEXT: &str = "5be5db0df4925f4134c7af3b13ba988546e918d094bd859e77a22fb8b48dd4af:cf9b3160c4a5a9fac6789866c5920602fc6bb2cae40553b3a1641a2f3dbd2bd6";
const SIG: &str = "0xd47644539acec3da5e3ecf5fe8863c628a9c97e8b71e9ea9167a6f4f83c03c322a1278fe2a4498e51bcaed2181f1fda6105c59687d8d004b22b3ef27cfcb51381b";
const ADDR: &str = "0x2c7536e3605d9c16a7a3d7b1898e529396a65c23";

fn ctx(who: &str, seed: u8, day: u64) {
    testing_env!(VMContextBuilder::new().predecessor_account_id(who.parse().unwrap()).current_account_id("chests.x.testnet".parse().unwrap())
        .random_seed([seed; 32]).block_timestamp(day * 86_400_000_000_000 + 5).attached_deposit(NearToken::from_yoctonear(0)).account_balance(NearToken::from_near(100)).build());
}
fn ready() -> Contract {
    ctx("owner.testnet", 1, 1);
    let mut c = Contract::new("owner.testnet".parse().unwrap(), "s1".into());
    c.commit_deck(ROOT.into(), ROOT.into());
    c.fix_seed(REQ.into(), TEXT.into(), SIG.into(), ADDR.into());
    c.add_opener("relayer.testnet".parse().unwrap());
    c
}

#[test]
fn seed_and_draw_match_the_js_vector() {
    ctx("owner.testnet", 1, 1);
    let sig = vec![0xabu8; 65];
    let seed = season_seed(&sig, &[1u8; 32]);
    assert_eq!(hex(&seed), "a41f9c39bdc47c027e1d0798592501b8a5ac57434f4f69e292ffa5fb4bdf38c8");
    let r0 = draw_random(&seed, 0, &[2u8; 32]);
    assert_eq!(u64::from_le_bytes(r0[..8].try_into().unwrap()) % 10_000, 933);
    assert_eq!(tier_of(0), Some("legendary")); assert_eq!(tier_of(60), Some("rare")); assert_eq!(tier_of(999), Some("uncommon")); assert_eq!(tier_of(1000), None);
}

#[test]
fn open_records_and_mints_by_position() {
    let mut c = ready();
    let info = c.season_info();
    assert_eq!(info.seed.as_ref().unwrap().signing_address, ADDR);
    let mut seen = std::collections::HashSet::new();
    let mut nfts = 0;
    for k in 0..30u32 {
        ctx("relayer.testnet", (k + 2) as u8, 1);
        let o = c.open_chest("ann.guests.x.testnet".parse().unwrap());
        assert_eq!(o.index, k);
        assert!(seen.insert(o.position));
        assert_eq!(o.nft, o.position < 1000);
        assert_eq!(o.random, hex(&draw_random(&unhex(&info.seed.as_ref().unwrap().seed).unwrap(), k, &[(k + 2) as u8; 32])));
        if o.nft { nfts += 1; let t = c.nft_token(o.token_id.clone().unwrap()).unwrap(); assert_eq!(t.owner_id.as_str(), "ann.guests.x.testnet"); }
    }
    assert_eq!(c.season_info().opened, 30);
    assert_eq!(c.season_info().nft_minted, nfts);
    assert_eq!(c.list_openings(Some(28), Some(10)).len(), 2);
    assert_eq!(c.openings_of("ann.guests.x.testnet".parse().unwrap()).len(), 30);
    ctx("relayer.testnet", 99, 2); // next day: allowed again
    c.open_chest("ann.guests.x.testnet".parse().unwrap());
}

#[test]
fn a_full_season_is_exact_10000_and_1000_nft() {
    let mut c = ready();
    for k in 0..DECK_SIZE {
        ctx("relayer.testnet", (k % 251) as u8, k as u64); // one per account-day keeps the daily cap out of the way
        c.open_chest(format!("p{}.testnet", k % 7).parse().unwrap());
        // on chain every call writes its state at the end; the unit test flushes per call the same way
        c.moved.flush(); c.openings.flush(); c.by_account.flush(); c.daily.flush();
    }
    ctx("relayer.testnet", 1, 1);
    assert_eq!(c.season_info().opened, 10_000);
    assert_eq!(c.season_info().nft_minted, 1_000);
    ctx("relayer.testnet", 1, 1);
    assert_eq!(c.openings_of("p1.testnet".parse().unwrap()).len(), 50);
    ctx("relayer.testnet", 1, 1);
    let mut positions: Vec<u32> = c.list_openings(Some(0), Some(50)).iter().map(|o| o.position).collect();
    positions.sort(); positions.dedup(); assert_eq!(positions.len(), 50);
}

#[test]
#[should_panic(expected = "ERR_SOLD_OUT")]
fn sold_out_after_10000() {
    let mut c = ready();
    c.opened = DECK_SIZE;
    ctx("relayer.testnet", 3, 1);
    c.open_chest("ann.testnet".parse().unwrap());
}

#[test]
#[should_panic(expected = "ERR_DAILY")]
fn daily_cap() {
    let mut c = ready();
    for k in 0..=DAILY_CAP { ctx("relayer.testnet", k as u8, 1); c.open_chest("ann.testnet".parse().unwrap()); }
}

#[test]
#[should_panic(expected = "ERR_NOT_OPENER")]
fn only_openers() { let mut c = ready(); ctx("ann.testnet", 3, 1); c.open_chest("ann.testnet".parse().unwrap()); }

#[test]
#[should_panic(expected = "ERR_NO_SEED")]
fn no_opening_before_the_seed() {
    ctx("owner.testnet", 1, 1);
    let mut c = Contract::new("owner.testnet".parse().unwrap(), "s1".into());
    c.add_opener("owner.testnet".parse().unwrap());
    c.open_chest("ann.testnet".parse().unwrap());
}

#[test]
#[should_panic(expected = "ERR_NO_COMMIT")]
fn no_seed_before_the_commit() {
    ctx("owner.testnet", 1, 1);
    let mut c = Contract::new("owner.testnet".parse().unwrap(), "s1".into());
    c.fix_seed(REQ.into(), TEXT.into(), SIG.into(), ADDR.into());
}

#[test]
#[should_panic(expected = "ERR_TEE_ROOT")]
fn seed_request_must_name_the_root() {
    ctx("owner.testnet", 1, 1);
    let mut c = Contract::new("owner.testnet".parse().unwrap(), "s1".into());
    c.commit_deck("00".repeat(32), ROOT.into());
    c.fix_seed(REQ.into(), TEXT.into(), SIG.into(), ADDR.into());
}

#[test]
#[should_panic(expected = "ERR_TEE_SIG")]
fn seed_signature_must_recover() {
    ctx("owner.testnet", 1, 1);
    let mut c = Contract::new("owner.testnet".parse().unwrap(), "s1".into());
    c.commit_deck(ROOT.into(), ROOT.into());
    c.fix_seed(REQ.into(), TEXT.into(), SIG.into(), "0x1111111111111111111111111111111111111111".into());
}

#[test]
#[should_panic(expected = "ERR_SEEDED")]
fn seed_once() { let mut c = ready(); ctx("owner.testnet", 5, 1); c.fix_seed(REQ.into(), TEXT.into(), SIG.into(), ADDR.into()); }

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn commit_owner_only() { ctx("ann.testnet", 1, 1); let mut c = Contract::new("owner.testnet".parse().unwrap(), "s1".into()); c.commit_deck(ROOT.into(), ROOT.into()); }

// ---------- transfer edge cases (docs/nft-threat-model.md) ----------
fn first_loot(c: &mut Contract) -> String {
    for k in 0..30u32 {
        ctx("relayer.testnet", (k + 2) as u8, 1);
        if let Some(id) = c.open_chest("ann.testnet".parse().unwrap()).token_id { return id; }
    }
    // a fresh day keeps the daily cap out of the way
    for k in 0..30u32 {
        ctx("relayer.testnet", (k + 40) as u8, 2);
        if let Some(id) = c.open_chest("ann.testnet".parse().unwrap()).token_id { return id; }
    }
    panic!("no loot NFT in 60 openings");
}
fn ctx1(who: &str) {
    testing_env!(VMContextBuilder::new().predecessor_account_id(who.parse().unwrap()).current_account_id("chests.x.testnet".parse().unwrap())
        .attached_deposit(NearToken::from_yoctonear(1)).account_balance(NearToken::from_near(100)).build());
}

#[test]
fn chest_loot_moves_by_nft_transfer_and_the_opening_record_stays() {
    let mut c = ready();
    let id = first_loot(&mut c);
    ctx1("ann.testnet");
    c.nft_transfer("bob.testnet".parse().unwrap(), id.clone(), None, None);
    assert_eq!(c.nft_token(id.clone()).unwrap().owner_id.as_str(), "bob.testnet");
    let index: u32 = id.rsplit('-').next().unwrap().parse().unwrap();
    assert_eq!(c.get_opening(index).unwrap().account_id.as_str(), "ann.testnet"); // provenance: who opened it
}

#[test]
#[should_panic(expected = "Approval extension is disabled")]
fn a_stranger_cannot_take_chest_loot() {
    let mut c = ready();
    let id = first_loot(&mut c);
    ctx1("mallory.testnet");
    c.nft_transfer("mallory.testnet".parse().unwrap(), id, None, None);
}
