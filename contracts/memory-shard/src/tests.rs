//! Contract tests on near-sdk's mocked blockchain: init, coordinator-only mint, duplicates, season root binding,
//! views and enumeration, NEP-171 transfer by the owner, owner-only coordinator management.

use crate::image::ShardData;
use crate::*;
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_sdk::json_types::U128;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const ROOT: &str = "03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a";
const LEAF: &str = "c5992fa34e4329014c29e5ac9a4126755c9bea18301e11f01eeaed25f56ced88";

fn owner() -> AccountId { accounts(0) }
fn coordinator() -> AccountId { accounts(1) }
fn player() -> AccountId { accounts(2) }
fn stranger() -> AccountId { accounts(3) }

fn ctx(predecessor: AccountId, deposit: NearToken) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(accounts(4)).signer_account_id(predecessor.clone()).predecessor_account_id(predecessor).attached_deposit(deposit).block_timestamp(1_762_600_000_000_000_000).block_height(276_700_000);
    b
}

fn deposit() -> NearToken { NearToken::from_millinear(100) }

fn new_contract() -> Contract {
    testing_env!(ctx(owner(), NearToken::from_yoctonear(0)).build());
    Contract::new(owner(), vec![coordinator()], Some("ftf-seasons.testnet".parse().unwrap()))
}

fn shard(id: u32) -> ShardData {
    ShardData {
        season_id: "793f6c05e89839f2".into(), shard_id: id, owner_clan: "iris".into(), kind: "call".into(), weight: 2,
        forgotten_at_tick: 4, closes_at_tick: 6, winner_clan: Some("frost".into()), price: Some(12),
        unlocked_index: Some(1), unlocked_leaf: Some(LEAF.into()), schedule_root: ROOT.into(),
    }
}

#[test]
fn init_sets_owner_coordinators_and_metadata() {
    let c = new_contract();
    assert_eq!(c.get_owner(), owner());
    assert_eq!(c.get_coordinators(), vec![coordinator()]);
    assert!(c.is_coordinator(coordinator()));
    assert!(!c.is_coordinator(owner()));
    assert_eq!(c.season_commit_contract().unwrap().as_str(), "ftf-seasons.testnet");
    let m = c.nft_metadata();
    assert_eq!(m.spec, "nft-1.0.0");
    assert_eq!(m.symbol, "FTFSHARD");
    assert_eq!(c.nft_total_supply(), U128(0));
    assert_eq!(c.shard_spec(), "ftf-shard/1");
}

#[test]
fn coordinator_mints_a_shard_with_full_metadata() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), deposit()).build());
    let t = c.mint_shard(player(), shard(11));
    assert_eq!(t.token_id, "793f6c05e89839f2-11");
    assert_eq!(t.owner_id, player());
    let m = t.metadata.unwrap();
    assert_eq!(m.title.as_deref(), Some("Memory shard #11 · Call · season 793f6c05e89839f2"));
    assert!(m.description.unwrap().contains("bought by Frost for 12 silk"));
    assert!(m.media.as_deref().unwrap().starts_with("data:image/svg+xml;base64,"));
    assert_eq!(m.media_hash.unwrap().0.len(), 32);
    assert_eq!(m.copies, Some(1));
    assert_eq!(m.issued_at.as_deref(), Some("1762600000000"));
    let extra: ShardData = near_sdk::serde_json::from_str(&m.extra.unwrap()).unwrap();
    assert_eq!(extra, shard(11));
    assert_eq!(c.nft_total_supply(), U128(1));
    assert_eq!(c.nft_supply_for_owner(player()), U128(1));
    assert_eq!(c.nft_token("793f6c05e89839f2-11".into()).unwrap().owner_id, player());
    let v = c.get_shard("793f6c05e89839f2-11".into()).unwrap();
    assert_eq!(v.owner_id, player());
    assert_eq!(v.data, shard(11));
    assert_eq!(v.minted_by, coordinator());
    assert_eq!(v.minted_at_block.0, 276_700_000);
    assert!(v.metadata.is_some());
    assert_eq!(c.shard_svg("793f6c05e89839f2-11".into()).unwrap(), crate::image::svg(&shard(11)));
    assert_eq!(c.season_shard_count("793f6c05e89839f2".into()), 1);
    assert_eq!(c.season_schedule_root("793f6c05e89839f2".into()).as_deref(), Some(ROOT));
    assert_eq!(c.get_shard("nope".into()), None);
    assert_eq!(c.shard_svg("nope".into()), None);
}

#[test]
#[should_panic(expected = "ERR_NOT_COORDINATOR")]
fn a_stranger_cannot_mint() {
    let mut c = new_contract();
    testing_env!(ctx(stranger(), deposit()).build());
    c.mint_shard(player(), shard(11));
}

#[test]
#[should_panic(expected = "ERR_NOT_COORDINATOR")]
fn the_owner_is_not_a_coordinator_by_default() {
    let mut c = new_contract();
    testing_env!(ctx(owner(), deposit()).build());
    c.mint_shard(player(), shard(11));
}

#[test]
#[should_panic(expected = "ERR_TOKEN_EXISTS")]
fn a_shard_is_minted_once() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), deposit()).build());
    c.mint_shard(player(), shard(11));
    c.mint_shard(stranger(), shard(11));
}

#[test]
#[should_panic(expected = "ERR_SEASON_ROOT")]
fn shards_of_one_season_share_the_schedule_root() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), deposit()).build());
    c.mint_shard(player(), shard(11));
    let mut other = shard(12);
    other.schedule_root = "ab".repeat(32);
    c.mint_shard(player(), other);
}

#[test]
#[should_panic(expected = "ERR_BAD_KIND")]
fn invalid_shard_data_is_rejected() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), deposit()).build());
    let mut bad = shard(11);
    bad.kind = "dream".into();
    c.mint_shard(player(), bad);
}

#[test]
#[should_panic(expected = "ERR_BAD_UNLOCK")]
fn leaf_without_index_is_rejected() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), deposit()).build());
    let mut bad = shard(11);
    bad.unlocked_index = None;
    c.mint_shard(player(), bad);
}

#[test]
fn preview_matches_the_mint_without_writing() {
    let mut c = new_contract();
    let p = c.preview_shard(shard(11));
    assert_eq!(c.nft_total_supply(), U128(0));
    testing_env!(ctx(coordinator(), deposit()).build());
    let t = c.mint_shard(player(), shard(11));
    let m = t.metadata.unwrap();
    assert_eq!(p.title, m.title);
    assert_eq!(p.description, m.description);
    assert_eq!(p.media, m.media);
    assert_eq!(p.media_hash, m.media_hash);
    assert_eq!(p.extra, m.extra);
    assert_eq!(p.issued_at, None);
}

#[test]
fn season_enumeration_in_mint_order_with_paging() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), deposit()).build());
    for id in [11u32, 23, 31] {
        let mut s = shard(id);
        if id == 31 { s.owner_clan = "frost".into(); s.kind = "insight".into(); s.weight = 0; s.unlocked_index = None; s.unlocked_leaf = None; s.winner_clan = None; s.price = None; }
        c.mint_shard(if id == 31 { coordinator() } else { player() }, s);
    }
    let all = c.shards_of_season("793f6c05e89839f2".into(), None, None);
    assert_eq!(all.iter().map(|v| v.token_id.clone()).collect::<Vec<_>>(), vec!["793f6c05e89839f2-11", "793f6c05e89839f2-23", "793f6c05e89839f2-31"]);
    assert_eq!(all[2].owner_id, coordinator());
    let page = c.shards_of_season("793f6c05e89839f2".into(), Some(1), Some(1));
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].token_id, "793f6c05e89839f2-23");
    assert!(c.shards_of_season("793f6c05e89839f2".into(), Some(5), None).is_empty());
    assert!(c.shards_of_season("0000000000000000".into(), None, None).is_empty());
    assert_eq!(c.season_shard_count("793f6c05e89839f2".into()), 3);
    assert_eq!(c.nft_total_supply(), U128(3));
    assert_eq!(c.nft_supply_for_owner(player()), U128(2));
    let mine = c.nft_tokens_for_owner(player(), None, None);
    assert_eq!(mine.len(), 2);
    assert_eq!(c.nft_tokens(None, Some(2)).len(), 2);
}

#[test]
fn the_owner_of_a_shard_can_transfer_it() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), deposit()).build());
    c.mint_shard(player(), shard(11));
    testing_env!(ctx(player(), NearToken::from_yoctonear(1)).build());
    c.nft_transfer(stranger(), "793f6c05e89839f2-11".into(), None, Some("sold at the auction".into()));
    assert_eq!(c.nft_token("793f6c05e89839f2-11".into()).unwrap().owner_id, stranger());
    assert_eq!(c.get_shard("793f6c05e89839f2-11".into()).unwrap().owner_id, stranger());
    assert_eq!(c.nft_supply_for_owner(player()), U128(0));
}

#[test]
#[should_panic]
fn a_stranger_cannot_transfer_someone_elses_shard() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), deposit()).build());
    c.mint_shard(player(), shard(11));
    testing_env!(ctx(stranger(), NearToken::from_yoctonear(1)).build());
    c.nft_transfer(stranger(), "793f6c05e89839f2-11".into(), None, None);
}

#[test]
fn owner_manages_coordinators_with_one_yocto() {
    let mut c = new_contract();
    testing_env!(ctx(owner(), NearToken::from_yoctonear(1)).build());
    c.add_coordinator(stranger());
    assert!(c.is_coordinator(stranger()));
    c.remove_coordinator(coordinator());
    assert!(!c.is_coordinator(coordinator()));
    testing_env!(ctx(stranger(), deposit()).build());
    let t = c.mint_shard(player(), shard(11));
    assert_eq!(t.owner_id, player());
}

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn only_the_owner_adds_coordinators() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), NearToken::from_yoctonear(1)).build());
    c.add_coordinator(stranger());
}

#[test]
#[should_panic(expected = "ERR_NOT_A_COORDINATOR")]
fn removing_a_non_coordinator_fails() {
    let mut c = new_contract();
    testing_env!(ctx(owner(), NearToken::from_yoctonear(1)).build());
    c.remove_coordinator(stranger());
}

#[test]
#[should_panic(expected = "Must attach")]
fn minting_needs_a_storage_deposit() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), NearToken::from_yoctonear(0)).build());
    c.mint_shard(player(), shard(11));
}
