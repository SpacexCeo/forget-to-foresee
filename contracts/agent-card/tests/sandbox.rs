//! Sandbox integration tests: the real agent-card wasm (and the real season-commit wasm) on a local NEAR sandbox node.
//! The judge season's root is committed on season-commit, the judge playthrough's card is minted from the exact
//! arguments the owner will send (judge/793f6c05e89839f2/mint-agent.json), and the stored root is compared with the
//! committed one, as anyone can do on testnet. The NEAR sandbox has no Windows build, so this file compiles only off
//! Windows. CI builds both wasm files first (.github/workflows/contracts.yml, job agent-card).
#![cfg(not(windows))]

use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const MINT_DEPOSIT: NearToken = NearToken::from_millinear(500);
const GAS: Gas = Gas::from_tgas(100);
const SEASON: &str = "793f6c05e89839f2";
const TOKEN: &str = "793f6c05e89839f2-agent-iris";

struct Env {
    _worker: Worker<Sandbox>,
    agents: Contract,
    seasons: Contract,
    coord: Account,
    player: Account,
    stranger: Account,
    mint: Value,
}

fn wasm(var: &str, default: &str) -> anyhow::Result<Vec<u8>> {
    let path = std::env::var(var).unwrap_or_else(|_| format!("{}/{default}", env!("CARGO_MANIFEST_DIR")));
    std::fs::read(&path).map_err(|e| anyhow::anyhow!("{path}: {e}; run `cargo near build non-reproducible-wasm --no-abi` in the crate first"))
}

async fn init() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let seasons = worker.dev_deploy(&wasm("SEASON_COMMIT_WASM", "../season-commit/target/near/season_commit.wasm")?).await?;
    let agents = worker.dev_deploy(&wasm("AGENT_CARD_WASM", "target/near/agent_card.wasm")?).await?;
    let owner = worker.dev_create_account().await?;
    let coord = worker.dev_create_account().await?;
    let player = worker.dev_create_account().await?;
    let stranger = worker.dev_create_account().await?;
    let r = seasons.call("new").args_json(json!({ "owner_id": owner.id(), "coordinators": [coord.id()] })).transact().await?;
    assert!(r.is_success(), "season-commit init failed: {:#?}", r.failures());
    let r = agents.call("new").args_json(json!({ "owner_id": owner.id(), "coordinators": [coord.id()], "season_contract": seasons.id(), "shard_contract": null })).transact().await?;
    assert!(r.is_success(), "agent-card init failed: {:#?}", r.failures());
    let mint: Value = serde_json::from_str(include_str!("../judge/793f6c05e89839f2/mint-agent.json"))?;
    // the judge season's commitment, as on ftf-seasons.testnet (docs/near.md)
    let r = coord
        .call(seasons.id(), "commit_season")
        .args_json(json!({ "season_id": SEASON, "schedule_root": mint["state"]["schedule_root"], "schema_version": "v2", "leaf_count": 15 }))
        .deposit(NearToken::from_millinear(10))
        .gas(Gas::from_tgas(30))
        .transact()
        .await?;
    assert!(r.is_success(), "commit_season failed: {:#?}", r.failures());
    Ok(Env { _worker: worker, agents, seasons, coord, player, stranger, mint })
}

fn mint_args(e: &Env, receiver: &Account) -> Value {
    json!({ "receiver_id": receiver.id(), "state": e.mint["state"], "state_hash": e.mint["state_hash"] })
}

async fn call(who: &Account, c: &Contract, method: &str, args: Value, deposit: NearToken) -> anyhow::Result<ExecutionFinalResult> {
    Ok(who.call(c.id(), method).args_json(args).deposit(deposit).gas(GAS).transact().await?)
}

fn ok(r: &ExecutionFinalResult) {
    assert!(r.is_success(), "expected success: {:#?}", r.failures());
}

fn fails(r: ExecutionFinalResult, code: &str) {
    assert!(r.is_failure(), "expected {code}, but the call succeeded");
    let msg = format!("{:?}", r.into_result().unwrap_err());
    assert!(msg.contains(code), "expected {code}, got {msg}");
}

async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json::<Value>()?)
}

#[tokio::test]
async fn sandbox_mint_the_judge_card_and_compare_roots() -> anyhow::Result<()> {
    let e = init().await?;

    // free dry run: the contract validates the state and computes the same hash as the game
    let p = view(&e.agents, "preview_agent", json!({ "state": e.mint["state"] })).await?;
    assert_eq!(p["token_id"], TOKEN);
    assert_eq!(p["state_hash"], e.mint["state_hash"]);

    let before = e.coord.view_account().await?.balance;
    let r = call(&e.coord, &e.agents, "mint_agent", mint_args(&e, &e.player), MINT_DEPOSIT).await?;
    ok(&r);
    assert!(r.logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains("\"standard\":\"nep171\"") && l.contains("\"event\":\"nft_mint\"") && l.contains(TOKEN)));
    let spent = before.as_yoctonear() - e.coord.view_account().await?.balance.as_yoctonear();
    assert!(spent < NearToken::from_millinear(300).as_yoctonear(), "most of the 0.5 NEAR deposit comes back (spent {spent} yocto)");

    let card = view(&e.agents, "get_agent", json!({ "token_id": TOKEN })).await?;
    assert_eq!(card["owner_id"], json!(e.player.id()));
    assert_eq!(card["state"], e.mint["state"]);
    assert_eq!(card["state_hash"], e.mint["state_hash"]);
    assert_eq!(card["metadata"]["extra"], include_str!("../judge/793f6c05e89839f2/state.json"));
    assert_eq!(card["minted_by"], json!(e.coord.id()));
    let svg = view(&e.agents, "agent_svg", json!({ "token_id": TOKEN })).await?;
    assert_eq!(svg, include_str!("../judge/793f6c05e89839f2/card.svg"), "the on-chain image is the game's");

    // anyone can compare the card's root with the committed season
    let season = view(&e.seasons, "get_season", json!({ "season_id": SEASON })).await?;
    assert_eq!(card["state"]["schedule_root"], season["schedule_root"]);
    assert_eq!(view(&e.agents, "season_commit_contract", json!({})).await?, json!(e.seasons.id()));

    // NEP-171 / NEP-181 views
    assert_eq!(view(&e.agents, "nft_token", json!({ "token_id": TOKEN })).await?["owner_id"], json!(e.player.id()));
    assert_eq!(view(&e.agents, "nft_total_supply", json!({})).await?, json!("1"));
    assert_eq!(view(&e.agents, "nft_metadata", json!({})).await?["symbol"], "FTFAGENT");
    assert_eq!(view(&e.agents, "agent_of_season", json!({ "season_id": SEASON, "agent": "iris" })).await?["token_id"], TOKEN);

    // the owner of the card may move it; the data does not change
    let r = call(&e.player, &e.agents, "nft_transfer", json!({ "receiver_id": e.stranger.id(), "token_id": TOKEN }), NearToken::from_yoctonear(1)).await?;
    ok(&r);
    let moved = view(&e.agents, "get_agent", json!({ "token_id": TOKEN })).await?;
    assert_eq!(moved["owner_id"], json!(e.stranger.id()));
    assert_eq!(moved["state_hash"], e.mint["state_hash"]);
    Ok(())
}

#[tokio::test]
async fn sandbox_refusals() -> anyhow::Result<()> {
    let e = init().await?;
    fails(call(&e.stranger, &e.agents, "mint_agent", mint_args(&e, &e.player), MINT_DEPOSIT).await?, "ERR_NOT_COORDINATOR");
    let mut wrong = mint_args(&e, &e.player);
    wrong["state_hash"] = json!("00".repeat(32));
    fails(call(&e.coord, &e.agents, "mint_agent", wrong, MINT_DEPOSIT).await?, "ERR_STATE_HASH");
    let mut tampered = mint_args(&e, &e.player);
    tampered["state"]["traits"]["silk"] = json!(999);
    fails(call(&e.coord, &e.agents, "mint_agent", tampered, MINT_DEPOSIT).await?, "ERR_STATE_HASH");
    let mut invalid = mint_args(&e, &e.player);
    invalid["state"]["biography"]["forgotten"][0]["buyer"] = Value::Null;
    fails(call(&e.coord, &e.agents, "mint_agent", invalid, MINT_DEPOSIT).await?, "ERR_BAD_FATE");
    fails(call(&e.coord, &e.agents, "mint_agent", mint_args(&e, &e.player), NearToken::from_millinear(1)).await?, "Must attach");
    ok(&call(&e.coord, &e.agents, "mint_agent", mint_args(&e, &e.player), MINT_DEPOSIT).await?);
    fails(call(&e.coord, &e.agents, "mint_agent", mint_args(&e, &e.stranger), MINT_DEPOSIT).await?, "ERR_TOKEN_EXISTS");
    assert_eq!(view(&e.agents, "nft_total_supply", json!({})).await?, json!("1"));
    Ok(())
}
