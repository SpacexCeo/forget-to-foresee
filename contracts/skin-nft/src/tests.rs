use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;
use near_sdk::NearToken;

fn ctx(who: &str) { testing_env!(VMContextBuilder::new().predecessor_account_id(who.parse().unwrap()).current_account_id("skins.x.testnet".parse().unwrap()).account_balance(NearToken::from_near(50)).build()); }
fn ready(cap: u32) -> Contract { ctx("owner.testnet"); let mut c = Contract::new("owner.testnet".parse().unwrap(), "sheriffchenko".into(), "Sheriffchenko".into(), cap, None); c.add_minter("skins.x.testnet".parse().unwrap()); c }

#[test]
fn mint_one_per_account_with_claim_and_info() {
    let mut c = ready(100);
    ctx("skins.x.testnet");
    let t = c.mint_skin("ann.guests.testnet".parse().unwrap(), "a1b2c3d4-7".into());
    assert_eq!(t.token_id, "sheriffchenko-1");
    assert_eq!(c.skin_of("ann.guests.testnet".parse().unwrap()), Some("sheriffchenko-1".to_string()));
    let i = c.skin_info(); assert_eq!((i.cap, i.minted, i.left), (100, 1, 99));
    assert!(t.metadata.unwrap().extra.unwrap().contains("a1b2c3d4-7"));
}

#[test]
#[should_panic(expected = "ERR_OWNED")]
fn second_for_same_account_fails() { let mut c = ready(100); ctx("skins.x.testnet"); c.mint_skin("ann.testnet".parse().unwrap(), "s-1".into()); c.mint_skin("ann.testnet".parse().unwrap(), "s-2".into()); }

#[test]
#[should_panic(expected = "ERR_SOLD_OUT")]
fn cap_holds() { let mut c = ready(2); ctx("skins.x.testnet"); for k in 0..3 { c.mint_skin(format!("p{}.testnet", k).parse().unwrap(), "s-1".into()); } }

#[test]
#[should_panic(expected = "ERR_NOT_MINTER")]
fn minters_only() { let mut c = ready(5); ctx("ann.testnet"); c.mint_skin("ann.testnet".parse().unwrap(), "s-1".into()); }

#[test]
fn owner_replaces_media_on_minted_tokens() {
    let mut c = ready(5); ctx("skins.x.testnet"); c.mint_skin("ann.testnet".parse().unwrap(), "s-1".into());
    ctx("owner.testnet"); c.set_media(Some("https://example.org/sheriffchenko.png".into()));
    assert_eq!(c.nft_token("sheriffchenko-1".into()).unwrap().metadata.unwrap().media.as_deref(), Some("https://example.org/sheriffchenko.png"));
    assert_eq!(c.skin_info().media.as_deref(), Some("https://example.org/sheriffchenko.png"));
}

// ---------- transfer edge cases (docs/nft-threat-model.md) ----------
fn ctx1(who: &str) { testing_env!(VMContextBuilder::new().predecessor_account_id(who.parse().unwrap()).current_account_id("skins.x.testnet".parse().unwrap()).attached_deposit(NearToken::from_yoctonear(1)).account_balance(NearToken::from_near(50)).build()); }

#[test]
fn a_skin_moves_by_nft_transfer_and_the_one_mint_rule_stays_with_the_winner() {
    let mut c = ready(100); ctx("skins.x.testnet");
    c.mint_skin("ann.testnet".parse().unwrap(), "seed1".into());
    ctx1("ann.testnet");
    c.nft_transfer("bob.testnet".parse().unwrap(), "sheriffchenko-1".into(), None, None);
    assert_eq!(c.nft_token("sheriffchenko-1".into()).unwrap().owner_id.as_str(), "bob.testnet");
    // skin_of records who won the mint, not who holds it now: the winner still cannot be minted a second one
    assert_eq!(c.skin_of("ann.testnet".parse().unwrap()), Some("sheriffchenko-1".into()));
    assert_eq!(c.skin_info().minted, 1);
}

#[test]
#[should_panic(expected = "ERR_OWNED")]
fn giving_the_skin_away_does_not_unlock_a_second_mint() {
    let mut c = ready(100); ctx("skins.x.testnet");
    c.mint_skin("ann.testnet".parse().unwrap(), "seed1".into());
    ctx1("ann.testnet");
    c.nft_transfer("bob.testnet".parse().unwrap(), "sheriffchenko-1".into(), None, None);
    ctx("skins.x.testnet");
    c.mint_skin("ann.testnet".parse().unwrap(), "seed2".into());
}

#[test]
#[should_panic(expected = "Approval extension is disabled")]
fn a_stranger_cannot_take_a_skin() {
    let mut c = ready(100); ctx("skins.x.testnet");
    c.mint_skin("ann.testnet".parse().unwrap(), "seed1".into());
    ctx1("mallory.testnet");
    c.nft_transfer("mallory.testnet".parse().unwrap(), "sheriffchenko-1".into(), None, None);
}
