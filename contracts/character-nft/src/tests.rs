use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const CONTRACT: &str = "heroine.ftf-coordinator.testnet";
fn acc(s: &str) -> AccountId { s.parse().unwrap() }
fn ctx(pred: &str, deposit: u128) {
    testing_env!(VMContextBuilder::new().current_account_id(acc(CONTRACT)).predecessor_account_id(acc(pred)).attached_deposit(NearToken::from_yoctonear(deposit)).account_balance(NearToken::from_near(50)).build());
}
fn meta() -> TokenMetadata { TokenMetadata { title: Some("Elise".into()), ..Default::default() } }
fn heroine() -> Contract { ctx("ftf-coordinator.testnet", 0); Contract::new(acc("ftf-coordinator.testnet"), "Forget to Foresee: Heroines".into(), "FTFHERO".into(), true, vec![acc("guests.ftf-coordinator.testnet")], None, None) }

#[test]
fn minters_mint_and_the_token_account_is_derived() {
    let mut c = heroine();
    ctx("guests.ftf-coordinator.testnet", 0);
    let t = c.nft_mint("elise-ann-1".into(), acc("ann-1.guests.ftf-coordinator.testnet"), meta());
    assert_eq!(t.owner_id, acc("ann-1.guests.ftf-coordinator.testnet"));
    assert_eq!(c.token_account_id("elise-ann-1".into()), acc("elise-ann-1.heroine.ftf-coordinator.testnet"));
    assert!(!c.token_account_active("elise-ann-1".into()));
    assert_eq!(c.nft_total_supply().0, 1);
}

#[test]
#[should_panic(expected = "ERR_NOT_MINTER")]
fn strangers_cannot_mint() {
    let mut c = heroine();
    ctx("mallory.testnet", 0);
    c.nft_mint("elise-x".into(), acc("mallory.testnet"), meta());
}

#[test]
#[should_panic(expected = "ERR_TOKEN_ID")]
fn token_ids_must_fit_an_account_name() {
    let mut c = heroine();
    c.nft_mint("Elise#1".into(), acc("a.testnet"), meta());
}

#[test]
fn valid_ids() {
    assert!(valid_token_id("elise-ann-1"));
    for bad in ["", "-a", "a-", "A", "a.b", &"x".repeat(41)] { assert!(!valid_token_id(bad), "{bad}"); }
}

#[test]
#[should_panic(expected = "ERR_NOT_ACTIVE")]
fn acting_needs_an_active_account() {
    let mut c = heroine();
    c.nft_mint("elise-1".into(), acc("ann.testnet"), meta());
    ctx("ann.testnet", 0);
    c.act_as_token("elise-1".into(), acc("companions.ftf-coordinator.testnet"), "nft_transfer".into(), Base64VecU8(vec![]), U128(1), 30);
}

#[test]
#[should_panic(expected = "ERR_NOT_TOKEN_OWNER")]
fn only_the_owner_acts_through_the_token() {
    let mut c = heroine();
    c.nft_mint("elise-1".into(), acc("ann.testnet"), meta());
    c.activated.insert("elise-1".into(), true);
    ctx("mallory.testnet", 0);
    c.act_as_token("elise-1".into(), acc("x.testnet"), "m".into(), Base64VecU8(vec![]), U128(0), 30);
}

#[test]
fn activation_by_the_owner_or_a_minter_needs_the_code() {
    let mut c = heroine();
    c.nft_mint("elise-1".into(), acc("ann.testnet"), meta());
    ctx("ftf-coordinator.testnet", 0);
    c.set_account_code(Base64VecU8(vec![0, 97, 115, 109]));
    ctx("ann.testnet", 300_000_000_000_000_000_000_000);
    let _ = c.activate_token_account("elise-1".into());
    // the callback marks it active only on success
    ctx(CONTRACT, 0);
    testing_env!(VMContextBuilder::new().current_account_id(acc(CONTRACT)).predecessor_account_id(acc(CONTRACT)).build());
    assert!(c.on_activated("elise-1".into(), Ok(())));
    assert!(c.token_account_active("elise-1".into()));
    ctx("ann.testnet", 0);
    let _ = c.act_as_token("elise-1".into(), acc("companions.ftf-coordinator.testnet"), "nft_transfer".into(), Base64VecU8(vec![]), U128(1), 30);
}

#[test]
#[should_panic(expected = "ERR_NO_TOKEN_ACCOUNTS")]
fn companions_have_no_token_accounts() {
    ctx("ftf-coordinator.testnet", 0);
    let mut c = Contract::new(acc("ftf-coordinator.testnet"), "Forget to Foresee: Companions".into(), "FTFDRAGON".into(), false, vec![], None, None);
    c.set_account_code(Base64VecU8(vec![1]));
}

#[test]
fn companions_mint_to_a_heroine_token_account() {
    testing_env!(VMContextBuilder::new().current_account_id(acc("companions.ftf-coordinator.testnet")).predecessor_account_id(acc("ftf-coordinator.testnet")).build());
    let mut c = Contract::new(acc("ftf-coordinator.testnet"), "Forget to Foresee: Companions".into(), "FTFDRAGON".into(), false, vec![], None, None);
    let t = c.nft_mint("dragon-1".into(), acc("elise-1.heroine.ftf-coordinator.testnet"), TokenMetadata { title: Some("Ember".into()), ..Default::default() });
    assert_eq!(t.owner_id, acc("elise-1.heroine.ftf-coordinator.testnet"));
}
