//! Contract tests on near-sdk's mocked blockchain (Linux/macOS; CI): init, coordinator-only mint, the recomputed state
//! hash, one card per (season, agent), season root binding, the storage deposit, views and enumeration, immutability
//! (no update path; a transfer keeps the data), owner-only coordinator management.

use crate::*;
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_sdk::json_types::U128;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const JUDGE_MINT: &str = include_str!("../judge/793f6c05e89839f2/mint-agent.json");
const ROOT: &str = "03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a";
const TOKEN: &str = "793f6c05e89839f2-agent-iris";

fn owner() -> AccountId { accounts(0) }
fn coordinator() -> AccountId { accounts(1) }
fn player() -> AccountId { accounts(2) }
fn stranger() -> AccountId { accounts(3) }

fn ctx(predecessor: AccountId, deposit: NearToken) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(accounts(4)).signer_account_id(predecessor.clone()).predecessor_account_id(predecessor).attached_deposit(deposit).block_timestamp(1_762_700_000_000_000_000).block_height(276_800_000);
    b
}

fn deposit() -> NearToken { NearToken::from_millinear(500) }

fn new_contract() -> Contract {
    testing_env!(ctx(owner(), NearToken::from_yoctonear(0)).build());
    Contract::new(owner(), vec![coordinator()], Some("ftf-seasons.testnet".parse().unwrap()), Some("ftf-shards.testnet".parse().unwrap()))
}

/// The judge playthrough's Iris (judge/793f6c05e89839f2/mint-agent.json, written by scripts/judge-agent-args.mjs).
fn judge() -> (AgentState, String) {
    let v: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(JUDGE_MINT).unwrap();
    let state: AgentState = near_sdk::serde_json::from_value(v["state"].clone()).unwrap();
    (state, v["state_hash"].as_str().unwrap().to_string())
}

fn mint(c: &mut Contract) -> Token {
    let (s, h) = judge();
    testing_env!(ctx(coordinator(), deposit()).build());
    c.mint_agent(player(), s, h)
}

#[test]
fn init_sets_owner_coordinators_and_metadata() {
    let c = new_contract();
    assert_eq!(c.get_owner(), owner());
    assert_eq!(c.get_coordinators(), vec![coordinator()]);
    assert!(c.is_coordinator(coordinator()));
    assert!(!c.is_coordinator(owner()));
    assert_eq!(c.season_commit_contract().unwrap().as_str(), "ftf-seasons.testnet");
    assert_eq!(c.shard_contract().unwrap().as_str(), "ftf-shards.testnet");
    let m = c.nft_metadata();
    assert_eq!(m.spec, "nft-1.0.0");
    assert_eq!(m.symbol, "FTFAGENT");
    assert_eq!(c.nft_total_supply(), U128(0));
    assert_eq!(c.agent_spec(), "ftf-agent/1");
}

#[test]
fn coordinator_mints_the_judge_card_with_full_metadata() {
    let mut c = new_contract();
    let (s, h) = judge();
    let t = mint(&mut c);
    assert_eq!(t.token_id, TOKEN);
    assert_eq!(t.owner_id, player());
    let m = t.metadata.unwrap();
    assert_eq!(m.title.as_deref(), Some("Iris · agent card · season 793f6c05e89839f2"));
    let d = m.description.clone().unwrap();
    assert!(d.contains("bought by Frost for 13 silk, shard 793f6c05e89839f2-7"), "{d}");
    assert!(d.contains(&h));
    assert!(m.media.as_deref().unwrap().starts_with("data:image/svg+xml;base64,"));
    assert_eq!(m.media_hash.unwrap().0.len(), 32);
    assert_eq!(m.copies, Some(1));
    assert_eq!(m.issued_at.as_deref(), Some("1762700000000"));
    let extra = m.extra.unwrap();
    assert_eq!(extra, s.canonical_json());
    assert_eq!(crate::state::hex(&env::sha256(extra.as_bytes())), h, "sha256(extra) is the state hash");
    assert_eq!(c.nft_total_supply(), U128(1));
    assert_eq!(c.nft_supply_for_owner(player()), U128(1));
    assert_eq!(c.nft_token(TOKEN.into()).unwrap().owner_id, player());
    let v = c.get_agent(TOKEN.into()).unwrap();
    assert_eq!(v.owner_id, player());
    assert_eq!(v.state, s);
    assert_eq!(v.state_hash, h);
    assert_eq!(v.minted_by, coordinator());
    assert_eq!(v.minted_at_block.0, 276_800_000);
    assert_eq!(c.agent_of_season("793f6c05e89839f2".into(), "iris".into()).unwrap().token_id, TOKEN);
    assert_eq!(c.agent_of_season("793f6c05e89839f2".into(), "salt".into()), None);
    assert_eq!(c.agent_svg(TOKEN.into()).unwrap(), crate::image::svg(&s));
    assert_eq!(c.season_schedule_root("793f6c05e89839f2".into()).as_deref(), Some(ROOT));
    assert_eq!(c.get_agent("nope".into()), None);
}

#[test]
#[should_panic(expected = "ERR_NOT_COORDINATOR")]
fn a_stranger_cannot_mint() {
    let mut c = new_contract();
    let (s, h) = judge();
    testing_env!(ctx(stranger(), deposit()).build());
    c.mint_agent(player(), s, h);
}

#[test]
#[should_panic(expected = "ERR_NOT_COORDINATOR")]
fn the_owner_is_not_a_coordinator_unless_added() {
    let mut c = new_contract();
    let (s, h) = judge();
    testing_env!(ctx(owner(), deposit()).build());
    c.mint_agent(player(), s, h);
}

#[test]
#[should_panic(expected = "ERR_STATE_HASH")]
fn a_wrong_state_hash_is_refused() {
    let mut c = new_contract();
    let (s, _) = judge();
    testing_env!(ctx(coordinator(), deposit()).build());
    c.mint_agent(player(), s, "00".repeat(32));
}

#[test]
#[should_panic(expected = "ERR_STATE_HASH")]
fn a_changed_state_with_the_old_hash_is_refused() {
    let mut c = new_contract();
    let (mut s, h) = judge();
    s.traits.silk = 999;
    testing_env!(ctx(coordinator(), deposit()).build());
    c.mint_agent(player(), s, h);
}

#[test]
#[should_panic(expected = "ERR_TOKEN_EXISTS")]
fn one_card_per_season_and_agent() {
    let mut c = new_contract();
    mint(&mut c);
    mint(&mut c);
}

#[test]
#[should_panic(expected = "ERR_SEASON_ROOT")]
fn every_card_of_a_season_carries_the_same_root() {
    let mut c = new_contract();
    mint(&mut c);
    let (mut s, _) = judge();
    s.agent = "salt".into();
    s.traits.trust.retain(|e| e.clan != "salt");
    s.schedule_root = "11".repeat(32);
    let h = s.state_hash();
    testing_env!(ctx(coordinator(), deposit()).build());
    c.mint_agent(player(), s, h);
}

#[test]
fn another_agent_of_the_same_season_with_the_same_root_is_a_second_card() {
    let mut c = new_contract();
    mint(&mut c);
    let (mut s, _) = judge();
    s.agent = "salt".into();
    s.traits.trust.retain(|e| e.clan != "salt");
    let h = s.state_hash();
    testing_env!(ctx(coordinator(), deposit()).build());
    let t = c.mint_agent(player(), s, h);
    assert_eq!(t.token_id, "793f6c05e89839f2-agent-salt");
    assert_eq!(c.nft_total_supply(), U128(2));
}

#[test]
#[should_panic(expected = "ERR_BAD_FATE")]
fn invalid_state_is_refused() {
    let mut c = new_contract();
    let (mut s, _) = judge();
    s.biography.forgotten[0].buyer = None;
    let h = s.state_hash();
    testing_env!(ctx(coordinator(), deposit()).build());
    c.mint_agent(player(), s, h);
}

#[test]
#[should_panic(expected = "Must attach")]
fn the_storage_deposit_is_required() {
    let mut c = new_contract();
    let (s, h) = judge();
    testing_env!(ctx(coordinator(), NearToken::from_millinear(1)).build());
    c.mint_agent(player(), s, h);
}

#[test]
fn preview_matches_the_mint_and_stores_nothing() {
    let mut c = new_contract();
    let (s, h) = judge();
    let p = c.preview_agent(s.clone());
    assert_eq!(p.token_id, TOKEN);
    assert_eq!(p.state_hash, h);
    assert_eq!(c.nft_total_supply(), U128(0));
    let t = mint(&mut c);
    let m = t.metadata.unwrap();
    assert_eq!(p.metadata.media, m.media);
    assert_eq!(p.metadata.extra, m.extra);
    assert_eq!(p.metadata.description, m.description);
    assert_eq!(p.metadata.issued_at, None);
}

#[test]
fn a_transfer_moves_ownership_and_keeps_the_card() {
    let mut c = new_contract();
    let (s, h) = judge();
    mint(&mut c);
    testing_env!(ctx(player(), NearToken::from_yoctonear(1)).build());
    c.nft_transfer(stranger(), TOKEN.into(), None, None);
    let v = c.get_agent(TOKEN.into()).unwrap();
    assert_eq!(v.owner_id, stranger());
    assert_eq!(v.state, s);
    assert_eq!(v.state_hash, h);
    assert_eq!(c.nft_tokens_for_owner(stranger(), None, None).len(), 1);
    assert_eq!(c.nft_tokens_for_owner(player(), None, None).len(), 0);
}

#[test]
fn owner_manages_coordinators() {
    let mut c = new_contract();
    testing_env!(ctx(owner(), NearToken::from_yoctonear(1)).build());
    c.add_coordinator(stranger());
    assert!(c.is_coordinator(stranger()));
    c.remove_coordinator(stranger());
    assert!(!c.is_coordinator(stranger()));
}

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn a_coordinator_cannot_add_coordinators() {
    let mut c = new_contract();
    testing_env!(ctx(coordinator(), NearToken::from_yoctonear(1)).build());
    c.add_coordinator(stranger());
}
