//! Forget to Foresee (NEAR testnet): town items as NEP-245 multi-tokens (roadmap item 4; docs/town-items.md).
//! One contract for every kind of town item. The first token ids are the monster resources sold at the town's stalls
//! (relayer/market/catalog.js RESOURCES: spider_silk_thread, chitin_plate, veil_dust, ash_ore, crown_shard). Memory
//! shards stay NEP-171 (ftf-shards). Items are testnet game things with no value outside the game.
//!
//! Implemented: NEP-245 core (mt_transfer, mt_batch_transfer, mt_transfer_call, mt_batch_transfer_call with
//! mt_resolve_transfer, mt_token, mt_balance_of, mt_batch_balance_of, mt_supply, mt_batch_supply), metadata
//! (mt_metadata_contract, mt_metadata_token_all) and the NEP-245 events (mt_mint, mt_transfer, mt_burn). Approvals are
//! not supported: every `approval` must be null. Minting is for authorised minters only (the town's stalls via the
//! relayer, the coordinator); any holder can burn its own items (crafting uses them up). Separate from ftf-town, so the
//! deployed town contract needs no upgrade.
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{assert_one_yocto, env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, PanicOnDefault, PromiseOrValue};

pub type TokenId = String;
pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER: only the contract owner can call this";
pub const ERR_NOT_MINTER: &str = "ERR_NOT_MINTER: only an authorised minter can mint";
pub const ERR_TOKEN: &str = "ERR_TOKEN: unknown token id";
pub const ERR_AMOUNT: &str = "ERR_AMOUNT: amounts must be positive";
pub const ERR_FUNDS: &str = "ERR_FUNDS: not enough of this item";
pub const ERR_SELF: &str = "ERR_SELF: sender and receiver are the same";
pub const ERR_APPROVAL: &str = "ERR_APPROVAL: approvals are not supported";
pub const ERR_LENGTH: &str = "ERR_LENGTH: token_ids and amounts differ in length or are empty";
pub const ERR_TOKEN_ID: &str = "ERR_TOKEN_ID: ids are 1-32 characters [a-z0-9_]";
const GAS_ON_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_RESOLVE: Gas = Gas::from_tgas(15);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey { Balances, Supply, Meta }

#[near(serializers = [json])]
pub struct Token { pub token_id: TokenId, pub owner_id: Option<AccountId> }

#[near(serializers = [json])]
pub struct MtContractMetadata { pub spec: String, pub name: String, pub symbol: String, pub icon: Option<String>, pub base_uri: Option<String>, pub reference: Option<String>, pub reference_hash: Option<String> }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TokenMeta {
    pub title: String,
    pub description: String,
    /// "resource" (monster drop) or "good".
    pub kind: String,
    /// Base price at the town's stalls, in fifths of a town silk (informational).
    pub base: u32,
}

#[near(serializers = [json])]
pub struct MtBaseTokenMetadata { pub id: String, pub name: String, pub symbol: Option<String>, pub icon: Option<String>, pub decimals: Option<String>, pub base_uri: Option<String>, pub reference: Option<String>, pub copies: Option<u64>, pub reference_hash: Option<String> }
#[near(serializers = [json])]
pub struct MtTokenMetadata { pub title: Option<String>, pub description: Option<String>, pub media: Option<String>, pub media_hash: Option<String>, pub issued_at: Option<String>, pub expires_at: Option<String>, pub starts_at: Option<String>, pub updated_at: Option<String>, pub extra: Option<String>, pub reference: Option<String>, pub reference_hash: Option<String> }
#[near(serializers = [json])]
pub struct MtTokenMetadataAll { pub base: MtBaseTokenMetadata, pub token: MtTokenMetadata }

#[ext_contract(ext_receiver)]
pub trait MtReceiver {
    fn mt_on_transfer(&mut self, sender_id: AccountId, previous_owner_ids: Vec<AccountId>, token_ids: Vec<TokenId>, amounts: Vec<U128>, msg: String) -> PromiseOrValue<Vec<U128>>;
}
#[ext_contract(ext_self)]
pub trait MtResolver {
    fn mt_resolve_transfer(&mut self, previous_owner_ids: Vec<AccountId>, receiver_id: AccountId, token_ids: Vec<TokenId>, amounts: Vec<U128>, approvals: Option<Vec<Option<Vec<(AccountId, u64, U128)>>>>) -> Vec<U128>;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Items {
    owner_id: AccountId,
    minters: Vec<AccountId>,
    balances: LookupMap<String, u128>,
    supply: LookupMap<TokenId, u128>,
    meta: LookupMap<TokenId, TokenMeta>,
    token_ids: Vec<TokenId>,
}

fn key(token_id: &str, account: &AccountId) -> String { format!("{}:{}", token_id, account) }
fn list<T: std::fmt::Display>(v: &[T]) -> String { v.iter().map(|x| format!("\"{}\"", x)).collect::<Vec<_>>().join(",") }
fn event(name: &str, data: String) { env::log_str(&format!(r#"EVENT_JSON:{{"standard":"nep245","version":"1.0.0","event":"{}","data":[{}]}}"#, name, data)); }

#[near]
impl Items {
    #[init]
    pub fn new(owner_id: AccountId, minters: Vec<AccountId>) -> Self {
        Self { owner_id, minters, balances: LookupMap::new(StorageKey::Balances), supply: LookupMap::new(StorageKey::Supply), meta: LookupMap::new(StorageKey::Meta), token_ids: Vec::new() }
    }
    fn only_owner(&self) { require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER); }
    fn bal(&self, token_id: &str, a: &AccountId) -> u128 { self.balances.get(&key(token_id, a)).copied().unwrap_or(0) }
    fn set_bal(&mut self, token_id: &str, a: &AccountId, v: u128) { let k = key(token_id, a); if v == 0 { self.balances.remove(&k); } else { self.balances.insert(k, v); } }
    fn known(&self, token_id: &str) { require!(self.meta.contains_key(token_id), ERR_TOKEN); }

    /// Registers a kind of item (owner). Ids are short and lowercase; re-registering updates the metadata.
    pub fn add_token(&mut self, token_id: TokenId, title: String, description: String, kind: String, base: u32) {
        self.only_owner();
        require!(!token_id.is_empty() && token_id.len() <= 32 && token_id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_'), ERR_TOKEN_ID);
        require!(title.len() <= 64 && description.len() <= 200 && kind.len() <= 16, ERR_TOKEN_ID);
        if !self.meta.contains_key(&token_id) { self.token_ids.push(token_id.clone()); self.supply.insert(token_id.clone(), 0); }
        self.meta.insert(token_id, TokenMeta { title, description, kind, base });
    }
    pub fn set_minters(&mut self, minters: Vec<AccountId>) { self.only_owner(); self.minters = minters; }

    /// Mints items to an account (authorised minters: the town's stalls through the relayer, the coordinator).
    pub fn mint(&mut self, account_id: AccountId, token_id: TokenId, amount: U128, memo: Option<String>) {
        require!(self.minters.contains(&env::predecessor_account_id()) || env::predecessor_account_id() == self.owner_id, ERR_NOT_MINTER);
        self.known(&token_id); require!(amount.0 > 0, ERR_AMOUNT);
        let b = self.bal(&token_id, &account_id); self.set_bal(&token_id, &account_id, b + amount.0);
        let s = self.supply.get(&token_id).copied().unwrap_or(0); self.supply.insert(token_id.clone(), s + amount.0);
        event("mt_mint", format!(r#"{{"owner_id":"{}","token_ids":["{}"],"amounts":["{}"]{}}}"#, account_id, token_id, amount.0, memo.map(|m| format!(r#","memo":"{}""#, m.replace('"', "").chars().take(64).collect::<String>())).unwrap_or_default()));
    }
    /// Burns the caller's own items (crafting, quests that consume them).
    pub fn burn(&mut self, token_id: TokenId, amount: U128, memo: Option<String>) {
        let me = env::predecessor_account_id();
        self.known(&token_id); require!(amount.0 > 0, ERR_AMOUNT);
        let b = self.bal(&token_id, &me); require!(b >= amount.0, ERR_FUNDS);
        self.set_bal(&token_id, &me, b - amount.0);
        let s = self.supply.get(&token_id).copied().unwrap_or(0); self.supply.insert(token_id.clone(), s - amount.0);
        event("mt_burn", format!(r#"{{"owner_id":"{}","token_ids":["{}"],"amounts":["{}"]{}}}"#, me, token_id, amount.0, memo.map(|m| format!(r#","memo":"{}""#, m.replace('"', "").chars().take(64).collect::<String>())).unwrap_or_default()));
    }

    fn internal_transfer(&mut self, from: &AccountId, to: &AccountId, token_ids: &[TokenId], amounts: &[U128], memo: Option<String>) {
        require!(from != to, ERR_SELF);
        require!(!token_ids.is_empty() && token_ids.len() == amounts.len() && token_ids.len() <= 32, ERR_LENGTH);
        for (t, a) in token_ids.iter().zip(amounts) {
            self.known(t); require!(a.0 > 0, ERR_AMOUNT);
            let b = self.bal(t, from); require!(b >= a.0, ERR_FUNDS);
            self.set_bal(t, from, b - a.0);
            let r = self.bal(t, to); self.set_bal(t, to, r + a.0);
        }
        let amts: Vec<String> = amounts.iter().map(|a| a.0.to_string()).collect();
        event("mt_transfer", format!(r#"{{"old_owner_id":"{}","new_owner_id":"{}","token_ids":[{}],"amounts":[{}]{}}}"#, from, to, list(token_ids), list(&amts), memo.map(|m| format!(r#","memo":"{}""#, m.replace('"', "").chars().take(64).collect::<String>())).unwrap_or_default()));
    }

    // ---------- NEP-245 core ----------
    #[payable]
    pub fn mt_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, amount: U128, approval: Option<(AccountId, u64)>, memo: Option<String>) {
        assert_one_yocto(); require!(approval.is_none(), ERR_APPROVAL);
        let me = env::predecessor_account_id();
        self.internal_transfer(&me, &receiver_id, &[token_id], &[amount], memo);
    }
    #[payable]
    pub fn mt_batch_transfer(&mut self, receiver_id: AccountId, token_ids: Vec<TokenId>, amounts: Vec<U128>, approvals: Option<Vec<Option<(AccountId, u64)>>>, memo: Option<String>) {
        assert_one_yocto(); require!(approvals.map(|v| v.iter().all(|a| a.is_none())).unwrap_or(true), ERR_APPROVAL);
        let me = env::predecessor_account_id();
        self.internal_transfer(&me, &receiver_id, &token_ids, &amounts, memo);
    }
    #[payable]
    pub fn mt_transfer_call(&mut self, receiver_id: AccountId, token_id: TokenId, amount: U128, approval: Option<(AccountId, u64)>, memo: Option<String>, msg: String) -> PromiseOrValue<Vec<U128>> {
        require!(approval.is_none(), ERR_APPROVAL);
        self.mt_batch_transfer_call(receiver_id, vec![token_id], vec![amount], None, memo, msg)
    }
    #[payable]
    pub fn mt_batch_transfer_call(&mut self, receiver_id: AccountId, token_ids: Vec<TokenId>, amounts: Vec<U128>, approvals: Option<Vec<Option<(AccountId, u64)>>>, memo: Option<String>, msg: String) -> PromiseOrValue<Vec<U128>> {
        assert_one_yocto(); require!(approvals.map(|v| v.iter().all(|a| a.is_none())).unwrap_or(true), ERR_APPROVAL);
        let me = env::predecessor_account_id();
        self.internal_transfer(&me, &receiver_id, &token_ids, &amounts, memo);
        ext_receiver::ext(receiver_id.clone()).with_static_gas(GAS_ON_TRANSFER)
            .mt_on_transfer(me.clone(), vec![me.clone(); token_ids.len()], token_ids.clone(), amounts.clone(), msg)
            .then(ext_self::ext(env::current_account_id()).with_static_gas(GAS_RESOLVE).mt_resolve_transfer(vec![me; token_ids.len()], receiver_id, token_ids, amounts, None))
            .into()
    }
    /// Returns what the receiver kept for each token; the unused amounts it asked to return go back to the sender (as
    /// much as the receiver still holds).
    #[private]
    pub fn mt_resolve_transfer(&mut self, previous_owner_ids: Vec<AccountId>, receiver_id: AccountId, token_ids: Vec<TokenId>, amounts: Vec<U128>, approvals: Option<Vec<Option<Vec<(AccountId, u64, U128)>>>>) -> Vec<U128> {
        let _ = approvals;
        let unused: Vec<u128> = match env::promise_result_checked(0, 1_000) {
            Ok(bytes) => near_sdk::serde_json::from_slice::<Vec<U128>>(&bytes).ok().filter(|v| v.len() == amounts.len()).map(|v| v.iter().zip(&amounts).map(|(u, a)| u.0.min(a.0)).collect()).unwrap_or_else(|| amounts.iter().map(|a| a.0).collect()),
            Err(_) => amounts.iter().map(|a| a.0).collect(), // the receiver failed: everything comes back
        };
        let mut kept = Vec::with_capacity(amounts.len());
        let mut back_ids = vec![]; let mut back_amts = vec![];
        for (i, t) in token_ids.iter().enumerate() {
            let have = self.bal(t, &receiver_id);
            let refund = unused[i].min(have);
            if refund > 0 {
                self.set_bal(t, &receiver_id, have - refund);
                let p = self.bal(t, &previous_owner_ids[i]); self.set_bal(t, &previous_owner_ids[i], p + refund);
                back_ids.push(t.clone()); back_amts.push(refund.to_string());
            }
            kept.push(U128(amounts[i].0 - refund));
        }
        if !back_ids.is_empty() {
            event("mt_transfer", format!(r#"{{"old_owner_id":"{}","new_owner_id":"{}","token_ids":[{}],"amounts":[{}],"memo":"refund"}}"#, receiver_id, previous_owner_ids[0], list(&back_ids), list(&back_amts)));
        }
        kept
    }
    pub fn mt_token(&self, token_ids: Vec<TokenId>) -> Vec<Option<Token>> {
        token_ids.into_iter().map(|t| if self.meta.contains_key(&t) { Some(Token { token_id: t, owner_id: None }) } else { None }).collect()
    }
    pub fn mt_balance_of(&self, account_id: AccountId, token_id: TokenId) -> U128 { U128(self.bal(&token_id, &account_id)) }
    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<TokenId>) -> Vec<U128> { token_ids.iter().map(|t| U128(self.bal(t, &account_id))).collect() }
    pub fn mt_supply(&self, token_id: TokenId) -> Option<U128> { self.supply.get(&token_id).map(|s| U128(*s)) }
    pub fn mt_batch_supply(&self, token_ids: Vec<TokenId>) -> Vec<Option<U128>> { token_ids.iter().map(|t| self.supply.get(t).map(|s| U128(*s))).collect() }

    // ---------- metadata ----------
    pub fn mt_metadata_contract(&self) -> MtContractMetadata {
        MtContractMetadata { spec: "mt-1.0.0".into(), name: "Forget to Foresee town items".into(), symbol: "FTFITEM".into(), icon: None, base_uri: None, reference: None, reference_hash: None }
    }
    pub fn mt_metadata_token_all(&self, token_ids: Vec<TokenId>) -> Vec<Option<MtTokenMetadataAll>> {
        token_ids.into_iter().map(|t| self.meta.get(&t).map(|m| MtTokenMetadataAll {
            base: MtBaseTokenMetadata { id: t.clone(), name: m.title.clone(), symbol: None, icon: None, decimals: Some("0".into()), base_uri: None, reference: None, copies: None, reference_hash: None },
            token: MtTokenMetadata { title: Some(m.title.clone()), description: Some(m.description.clone()), media: None, media_hash: None, issued_at: None, expires_at: None, starts_at: None, updated_at: None,
                extra: Some(format!(r#"{{"kind":"{}","base_price_fifths_silk":{}}}"#, m.kind, m.base)), reference: None, reference_hash: None },
        })).collect()
    }
    /// Every registered token id with its metadata (for the game and the Pulse page).
    pub fn tokens(&self) -> Vec<(TokenId, TokenMeta, U128)> {
        self.token_ids.iter().map(|t| (t.clone(), self.meta.get(t).unwrap().clone(), U128(self.supply.get(t).copied().unwrap_or(0)))).collect()
    }
    pub fn minters(&self) -> Vec<AccountId> { self.minters.clone() }
}

#[cfg(test)]
mod tests;
