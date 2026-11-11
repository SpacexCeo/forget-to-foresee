//! The account of one heroine token (Day 1, "NFTs as accounts"): deployed on `<token>.<heroine contract>` when the
//! token's owner activates it. It can hold NEAR and NFTs (companions are minted to it), and it acts only when its
//! parent contract (the heroine NFT contract) forwards a call from the token's current owner (`act_as_token`).
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise};

pub const ERR_NOT_PARENT: &str = "ERR_NOT_PARENT: only the heroine contract can act for this token";

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TokenAccount {
    pub parent: AccountId,
    pub token_id: String,
}

#[near]
impl TokenAccount {
    #[init]
    pub fn new(parent: AccountId, token_id: String) -> Self {
        Self { parent, token_id }
    }

    /// Forwards one function call from this account. Only the parent contract may call it (it checks the owner).
    pub fn execute(&mut self, receiver_id: AccountId, method_name: String, args: Base64VecU8, deposit: U128, gas_tgas: u64) -> Promise {
        require!(env::predecessor_account_id() == self.parent, ERR_NOT_PARENT);
        Promise::new(receiver_id).function_call(method_name, args.0, NearToken::from_yoctonear(deposit.0), Gas::from_tgas(gas_tgas.min(250)))
    }

    pub fn info(&self) -> (AccountId, String) {
        (self.parent.clone(), self.token_id.clone())
    }
}

#[cfg(all(test, not(target_family = "wasm")))]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn ctx(pred: &str) { testing_env!(VMContextBuilder::new().current_account_id("elise-1.heroine.ftf-coordinator.testnet".parse().unwrap()).predecessor_account_id(pred.parse().unwrap()).build()); }

    #[test]
    fn only_the_parent_can_execute() {
        ctx("heroine.ftf-coordinator.testnet");
        let mut c = TokenAccount::new("heroine.ftf-coordinator.testnet".parse().unwrap(), "elise-1".into());
        let _ = c.execute("companions.ftf-coordinator.testnet".parse().unwrap(), "nft_transfer".into(), Base64VecU8(vec![]), U128(1), 30);
        assert_eq!(c.info().1, "elise-1");
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_PARENT")]
    fn a_stranger_cannot_execute() {
        ctx("heroine.ftf-coordinator.testnet");
        let mut c = TokenAccount::new("heroine.ftf-coordinator.testnet".parse().unwrap(), "elise-1".into());
        ctx("mallory.testnet");
        let _ = c.execute("x.testnet".parse().unwrap(), "m".into(), Base64VecU8(vec![]), U128(0), 30);
    }
}
