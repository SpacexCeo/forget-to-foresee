#![allow(deprecated)] // the standard's NEP-171 / NEP-181 macros generate the canonical methods
//! Forget to Foresee, Day 1 (NEAR testnet): one NEP-171 contract deployed twice.
//!
//! - **Heroine** (`heroine.ftf-coordinator.testnet`, `token_accounts: true`): Elise. Every token has its own account,
//!   `<token_id>.<contract>`, derived at once (companions can be minted to it right away) and activated on demand
//!   with the `token-account` code, after which the token's current owner can act through it (`act_as_token`).
//! - **Companions** (`companions.ftf-coordinator.testnet`, `token_accounts: false`): the dragons, minted to a heroine
//!   token's account by an authorized minter.
//!
//! Mints are by authorized minters only (the coordinator, the guests contract); storage is paid by the contract.
use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC};
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::store::{IterableSet, LookupMap};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue};

pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the contract owner can call this";
pub const ERR_NOT_MINTER: &str = "ERR_NOT_MINTER: only an authorized minter can mint";
pub const ERR_TOKEN_ID: &str = "ERR_TOKEN_ID: token ids are 1-40 characters of a-z, 0-9 and -";
pub const ERR_NO_TOKEN_ACCOUNTS: &str = "ERR_NO_TOKEN_ACCOUNTS: this contract has no per-token accounts";
pub const ERR_NO_CODE: &str = "ERR_NO_CODE: the token-account code is not set";
pub const ERR_NOT_TOKEN_OWNER: &str = "ERR_NOT_TOKEN_OWNER: only the token's owner can do this";
pub const ERR_NOT_ACTIVE: &str = "ERR_NOT_ACTIVE: activate the token account first";
pub const ERR_ACTIVE: &str = "ERR_ACTIVE: the token account is already active";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Minters,
    Activated,
    Code,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    minters: IterableSet<AccountId>,
    token_accounts: bool,
    account_code: LazyOption<Vec<u8>>,
    activated: LookupMap<TokenId, bool>,
    /// NEAR sent to a token account when it is activated by a minter (an owner attaches their own).
    account_fund: NearToken,
}

/// Whether a token id can also be an account name part: 1-40 of [a-z0-9-], not starting or ending with '-'.
pub fn valid_token_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') && !id.starts_with('-') && !id.ends_with('-')
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, name: String, symbol: String, token_accounts: bool, minters: Vec<AccountId>, icon: Option<String>, base_uri: Option<String>) -> Self {
        let metadata = NFTContractMetadata { spec: NFT_METADATA_SPEC.to_string(), name, symbol, icon, base_uri, reference: None, reference_hash: None };
        let mut m = IterableSet::new(StorageKey::Minters);
        m.insert(owner_id.clone());
        for a in minters { m.insert(a); }
        Self {
            tokens: NonFungibleToken::new(StorageKey::NonFungibleToken, owner_id.clone(), Some(StorageKey::TokenMetadata), Some(StorageKey::Enumeration), None::<StorageKey>),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owner_id,
            minters: m,
            token_accounts,
            account_code: LazyOption::new(StorageKey::Code, None),
            activated: LookupMap::new(StorageKey::Activated),
            account_fund: NearToken::from_millinear(300),
        }
    }

    fn assert_owner(&self) { require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER); }

    pub fn add_minter(&mut self, account_id: AccountId) { self.assert_owner(); self.minters.insert(account_id); }
    pub fn remove_minter(&mut self, account_id: AccountId) { self.assert_owner(); self.minters.remove(&account_id); }
    pub fn minters(&self) -> Vec<AccountId> { self.minters.iter().cloned().collect() }
    pub fn set_account_fund(&mut self, yocto: U128) { self.assert_owner(); self.account_fund = NearToken::from_yoctonear(yocto.0); }

    /// Mints one token (authorized minters only; storage paid by the contract).
    pub fn nft_mint(&mut self, token_id: TokenId, receiver_id: AccountId, metadata: TokenMetadata) -> Token {
        require!(self.minters.contains(&env::predecessor_account_id()), ERR_NOT_MINTER);
        require!(valid_token_id(&token_id), ERR_TOKEN_ID);
        let token = self.tokens.internal_mint_with_refund(token_id, receiver_id, Some(metadata), None); // the contract pays the storage
        NftMint { owner_id: &token.owner_id, token_ids: &[&token.token_id], memo: None }.emit();
        token
    }

    /// The account of a token: `<token_id>.<this contract>` (it exists only after activation).
    pub fn token_account_id(&self, token_id: TokenId) -> AccountId {
        format!("{}.{}", token_id, env::current_account_id()).parse().unwrap()
    }
    pub fn token_account_active(&self, token_id: TokenId) -> bool { self.activated.get(&token_id).copied().unwrap_or(false) }

    /// The `token-account` wasm deployed on activation (owner only; sent once by the deploy script).
    pub fn set_account_code(&mut self, code: Base64VecU8) {
        self.assert_owner();
        require!(self.token_accounts, ERR_NO_TOKEN_ACCOUNTS);
        self.account_code.set(&code.0);
    }

    /// Creates and deploys a token's account. The token's owner attaches the funding; a minter may use the contract's.
    #[payable]
    pub fn activate_token_account(&mut self, token_id: TokenId) -> Promise {
        require!(self.token_accounts, ERR_NO_TOKEN_ACCOUNTS);
        require!(!self.token_account_active(token_id.clone()), ERR_ACTIVE);
        let owner = self.tokens.owner_by_id.get(&token_id).expect("ERR_NO_TOKEN: no such token");
        let caller = env::predecessor_account_id();
        let fund = if caller == owner { env::attached_deposit() } else { require!(self.minters.contains(&caller), ERR_NOT_TOKEN_OWNER); self.account_fund };
        let code = self.account_code.get().expect(ERR_NO_CODE);
        let account = self.token_account_id(token_id.clone());
        let init = near_sdk::serde_json::json!({ "parent": env::current_account_id(), "token_id": token_id }).to_string().into_bytes();
        Promise::new(account)
            .create_account()
            .transfer(fund)
            .deploy_contract(code)
            .function_call("new".to_string(), init, NearToken::from_yoctonear(0), Gas::from_tgas(10))
            .then(Promise::new(env::current_account_id()).function_call("on_activated".to_string(), near_sdk::serde_json::json!({ "token_id": token_id }).to_string().into_bytes(), NearToken::from_yoctonear(0), Gas::from_tgas(5)))
    }

    #[private]
    pub fn on_activated(&mut self, token_id: TokenId, #[callback_result] result: Result<(), PromiseError>) -> bool {
        let ok = result.is_ok();
        if ok { self.activated.insert(token_id, true); }
        ok
    }

    /// The token's current owner acts through the token's own account (it forwards one function call).
    pub fn act_as_token(&mut self, token_id: TokenId, receiver_id: AccountId, method_name: String, args: Base64VecU8, deposit: U128, gas_tgas: u64) -> Promise {
        let owner = self.tokens.owner_by_id.get(&token_id).expect("ERR_NO_TOKEN: no such token");
        require!(env::predecessor_account_id() == owner, ERR_NOT_TOKEN_OWNER);
        require!(self.token_account_active(token_id.clone()), ERR_NOT_ACTIVE);
        let args = near_sdk::serde_json::json!({ "receiver_id": receiver_id, "method_name": method_name, "args": args, "deposit": deposit, "gas_tgas": gas_tgas }).to_string().into_bytes();
        Promise::new(self.token_account_id(token_id)).function_call("execute".to_string(), args, NearToken::from_yoctonear(0), Gas::from_tgas(gas_tgas.min(250) + 15))
    }
}

near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata { self.metadata.get().unwrap() }
}

#[cfg(all(test, not(target_family = "wasm")))]
mod tests;
