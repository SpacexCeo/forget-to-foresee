//! Sandbox integration tests: the real wasm contract on a local NEAR sandbox node, driven by
//! the cross-implementation vectors (tests/vectors.json).
//! The NEAR sandbox has no Windows build, so this file is compiled only off Windows.
#![cfg(not(windows))]

use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const DEPOSIT: NearToken = NearToken::from_millinear(10);
const GAS: Gas = Gas::from_tgas(30);

struct Env {
    _worker: Worker<Sandbox>,
    contract: Contract,
    owner: Account,
    coord: Account,
    player: Account,
    stranger: Account,
    v: Value,
}

async fn init() -> anyhow::Result<Env> {
    let wasm = near_workspaces::compile_project("./").await?;
    let worker = near_workspaces::sandbox().await?;
    let contract = worker.dev_deploy(&wasm).await?;
    let owner = worker.dev_create_account().await?;
    let coord = worker.dev_create_account().await?;
    let player = worker.dev_create_account().await?;
    let stranger = worker.dev_create_account().await?;
    let r = contract.call("new").args_json(json!({ "owner_id": owner.id(), "coordinators": [coord.id()] })).transact().await?;
    assert!(r.is_success(), "init failed: {:#?}", r.failures());
    let v: Value = serde_json::from_str(include_str!("vectors.json"))?;
    Ok(Env { _worker: worker, contract, owner, coord, player, stranger, v })
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

fn commit_args(s: &Value) -> Value {
    json!({ "season_id": s["seasonId"], "schedule_root": s["scheduleRoot"], "schema_version": s["schemaVersion"], "leaf_count": s["leafCount"] })
}

fn reveal_args(season_id: &Value, l: &Value) -> Value {
    json!({ "season_id": season_id, "index": l["index"], "canonical_event": l["canonicalEvent"], "salt": l["salt"], "merkle_path": l["path"] })
}

async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json::<Value>()?)
}

#[tokio::test]
async fn sandbox_full_season_commit_reveal_and_ash_key() -> anyhow::Result<()> {
    let e = init().await?;
    let s = &e.v["seasons"][0];
    let sid = &s["seasonId"];

    let r = call(&e.coord, &e.contract, "commit_season", commit_args(s), DEPOSIT).await?;
    ok(&r);
    assert!(r.logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains("\"standard\":\"ftf_season\"") && l.contains("\"event\":\"season_committed\"")));
    let season = view(&e.contract, "get_season", json!({ "season_id": sid })).await?;
    assert_eq!(season["schedule_root"], s["scheduleRoot"]);
    assert_eq!(season["leaf_count"], 15);
    assert_eq!(season["committed_by"], json!(e.coord.id()));

    let ash = &s["ashKey"];
    ok(&call(&e.coord, &e.contract, "commit_ash_key", json!({ "season_id": sid, "commitment": ash["commitment"] }), DEPOSIT).await?);

    // dry run first (free view), then every leaf on-chain
    let l0 = &s["leaves"][0];
    let check = view(&e.contract, "check_leaf", reveal_args(sid, l0)).await?;
    assert_eq!(check["valid"], true);
    assert_eq!(check["leaf"], l0["leaf"]);

    let before = e.player.view_account().await?.balance;
    for l in s["leaves"].as_array().unwrap() {
        let r = call(&e.player, &e.contract, "reveal_leaf", reveal_args(sid, l), DEPOSIT).await?;
        ok(&r);
        assert!(r.logs().iter().any(|x| x.starts_with("EVENT_JSON:") && x.contains("\"event\":\"leaf_revealed\"")));
        let rec: Value = r.json()?;
        assert_eq!(rec["leaf"], l["leaf"]);
        assert_eq!(rec["canonical_event"], l["canonicalEvent"]);
    }
    let spent = before.saturating_sub(e.player.view_account().await?.balance);
    // 15 reveals attached 0.15 NEAR in total; storage is a fraction and the rest is refunded.
    assert!(spent < NearToken::from_millinear(60), "spent {spent} for 15 reveals");

    let season = view(&e.contract, "get_season", json!({ "season_id": sid })).await?;
    assert_eq!(season["revealed_count"], 15);
    assert_eq!(season["ash_key_committed"], true);
    let all = view(&e.contract, "get_revealed_leaves", json!({ "season_id": sid })).await?;
    assert_eq!(all.as_array().unwrap().len(), 15);
    let one = view(&e.contract, "get_revealed_leaf", json!({ "season_id": sid, "index": 7 })).await?;
    assert_eq!(one["leaf"], s["leaves"][7]["leaf"]);
    assert_eq!(one["salt"], s["leaves"][7]["salt"]);

    let r = call(&e.stranger, &e.contract, "reveal_ash_key", json!({ "season_id": sid, "phrase": ash["phrase"], "salt": ash["salt"] }), DEPOSIT).await?;
    ok(&r);
    assert!(r.logs().iter().any(|x| x.contains("\"event\":\"ash_key_revealed\"")));
    let k = view(&e.contract, "get_ash_key", json!({ "season_id": sid })).await?;
    assert_eq!(k["revealed"], true);
    assert_eq!(k["phrase"], ash["phrase"]);
    assert_eq!(k["revealed_by"], json!(e.stranger.id()));

    // a multi-byte phrase and the edge trees
    let s2 = &e.v["seasons"][2];
    ok(&call(&e.coord, &e.contract, "commit_season", commit_args(s2), DEPOSIT).await?);
    ok(&call(&e.coord, &e.contract, "commit_ash_key", json!({ "season_id": s2["seasonId"], "commitment": s2["ashKey"]["commitment"] }), DEPOSIT).await?);
    ok(&call(&e.player, &e.contract, "reveal_ash_key", json!({ "season_id": s2["seasonId"], "phrase": s2["ashKey"]["phrase"], "salt": s2["ashKey"]["salt"] }), DEPOSIT).await?);
    for t in e.v["edgeTrees"].as_array().unwrap() {
        ok(&call(&e.coord, &e.contract, "commit_season", commit_args(t), DEPOSIT).await?);
        for l in t["leaves"].as_array().unwrap() {
            ok(&call(&e.player, &e.contract, "reveal_leaf", reveal_args(&t["seasonId"], l), DEPOSIT).await?);
        }
    }
    Ok(())
}

#[tokio::test]
async fn sandbox_rejects_forgeries_and_unauthorized_calls() -> anyhow::Result<()> {
    let e = init().await?;
    let (a, b) = (&e.v["seasons"][0], &e.v["seasons"][1]);
    let (aid, bid) = (&a["seasonId"], &b["seasonId"]);
    let l = &a["leaves"][5];

    // reveal before commit
    fails(call(&e.player, &e.contract, "reveal_leaf", reveal_args(aid, l), DEPOSIT).await?, "ERR_SEASON_NOT_COMMITTED");
    // unauthorized commit (a random account and the owner, who is not a coordinator)
    fails(call(&e.stranger, &e.contract, "commit_season", commit_args(a), DEPOSIT).await?, "ERR_NOT_COORDINATOR");
    fails(call(&e.owner, &e.contract, "commit_season", commit_args(a), DEPOSIT).await?, "ERR_NOT_COORDINATOR");
    // no storage deposit
    fails(call(&e.coord, &e.contract, "commit_season", commit_args(a), NearToken::from_yoctonear(1)).await?, "ERR_INSUFFICIENT_DEPOSIT");

    ok(&call(&e.coord, &e.contract, "commit_season", commit_args(a), DEPOSIT).await?);
    ok(&call(&e.coord, &e.contract, "commit_season", commit_args(b), DEPOSIT).await?);
    // re-commit, even with another root
    let mut forged = commit_args(a);
    forged["schedule_root"] = b["scheduleRoot"].clone();
    fails(call(&e.coord, &e.contract, "commit_season", forged, DEPOSIT).await?, "ERR_SEASON_EXISTS");

    // tampered event: same shape, one value changed
    let mut args = reveal_args(aid, l);
    let ev = l["canonicalEvent"].as_str().unwrap();
    let dots = ev.rsplit(':').next().unwrap().trim_end_matches('}').parse::<u8>()?;
    args["canonical_event"] = json!(format!("{}:{}}}", &ev[..ev.rfind(':').unwrap()], (dots + 1) % 4));
    fails(call(&e.player, &e.contract, "reveal_leaf", args, DEPOSIT).await?, "ERR_ROOT_MISMATCH");
    // non-canonical bytes of the same event
    let mut args = reveal_args(aid, l);
    args["canonical_event"] = json!(ev.replace(':', ": "));
    fails(call(&e.player, &e.contract, "reveal_leaf", args, DEPOSIT).await?, "ERR_BAD_EVENT");
    // tampered salt
    let mut args = reveal_args(aid, l);
    let salt = l["salt"].as_str().unwrap();
    args["salt"] = json!(format!("{}{}", &salt[..63], if salt.ends_with('0') { '1' } else { '0' }));
    fails(call(&e.player, &e.contract, "reveal_leaf", args, DEPOSIT).await?, "ERR_ROOT_MISMATCH");
    // tampered path hash
    let mut args = reveal_args(aid, l);
    let h = args["merkle_path"][2]["h"].as_str().unwrap().to_string();
    args["merkle_path"][2]["h"] = json!(format!("{}{}", if h.starts_with('0') { '1' } else { '0' }, &h[1..]));
    fails(call(&e.player, &e.contract, "reveal_leaf", args, DEPOSIT).await?, "ERR_ROOT_MISMATCH");
    // flipped path side
    let mut args = reveal_args(aid, l);
    args["merkle_path"][1]["left"] = json!(!args["merkle_path"][1]["left"].as_bool().unwrap());
    fails(call(&e.player, &e.contract, "reveal_leaf", args, DEPOSIT).await?, "ERR_BAD_PATH_DIRECTION");
    // truncated path
    let mut args = reveal_args(aid, l);
    args["merkle_path"].as_array_mut().unwrap().pop();
    fails(call(&e.player, &e.contract, "reveal_leaf", args, DEPOSIT).await?, "ERR_BAD_PATH_LENGTH");
    // wrong season: season A's leaf under committed season B
    fails(call(&e.player, &e.contract, "reveal_leaf", reveal_args(bid, l), DEPOSIT).await?, "ERR_ROOT_MISMATCH");
    // wrong index: leaf 2 claimed as index 3 with index 3's path
    let mut args = reveal_args(aid, &a["leaves"][2]);
    args["index"] = json!(3);
    args["merkle_path"] = a["leaves"][3]["path"].clone();
    fails(call(&e.player, &e.contract, "reveal_leaf", args, DEPOSIT).await?, "ERR_ROOT_MISMATCH");
    // index beyond the committed leaf count
    let mut args = reveal_args(aid, &a["leaves"][14]);
    args["index"] = json!(15);
    fails(call(&e.player, &e.contract, "reveal_leaf", args, DEPOSIT).await?, "ERR_INDEX_OUT_OF_RANGE");
    // nothing above was recorded
    assert_eq!(view(&e.contract, "get_season", json!({ "season_id": aid })).await?["revealed_count"], 0);

    // the genuine leaf still verifies, once
    ok(&call(&e.player, &e.contract, "reveal_leaf", reveal_args(aid, l), DEPOSIT).await?);
    fails(call(&e.player, &e.contract, "reveal_leaf", reveal_args(aid, l), DEPOSIT).await?, "ERR_ALREADY_REVEALED");

    // Ash's key: commit is closed once leaves are revealed; season B is still open
    let ka = &a["ashKey"];
    let kb = &b["ashKey"];
    fails(call(&e.coord, &e.contract, "commit_ash_key", json!({ "season_id": aid, "commitment": ka["commitment"] }), DEPOSIT).await?, "ERR_SEASON_STARTED");
    fails(call(&e.player, &e.contract, "reveal_ash_key", json!({ "season_id": bid, "phrase": kb["phrase"], "salt": kb["salt"] }), DEPOSIT).await?, "ERR_ASH_KEY_NOT_COMMITTED");
    fails(call(&e.stranger, &e.contract, "commit_ash_key", json!({ "season_id": bid, "commitment": kb["commitment"] }), DEPOSIT).await?, "ERR_NOT_COORDINATOR");
    ok(&call(&e.coord, &e.contract, "commit_ash_key", json!({ "season_id": bid, "commitment": kb["commitment"] }), DEPOSIT).await?);
    fails(call(&e.coord, &e.contract, "commit_ash_key", json!({ "season_id": bid, "commitment": ka["commitment"] }), DEPOSIT).await?, "ERR_ASH_KEY_EXISTS");
    fails(call(&e.player, &e.contract, "reveal_ash_key", json!({ "season_id": bid, "phrase": "we arrived after our time", "salt": kb["salt"] }), DEPOSIT).await?, "ERR_ASH_KEY_MISMATCH");
    fails(call(&e.player, &e.contract, "reveal_ash_key", json!({ "season_id": bid, "phrase": ka["phrase"], "salt": ka["salt"] }), DEPOSIT).await?, "ERR_ASH_KEY_MISMATCH");
    ok(&call(&e.player, &e.contract, "reveal_ash_key", json!({ "season_id": bid, "phrase": kb["phrase"], "salt": kb["salt"] }), DEPOSIT).await?);
    fails(call(&e.player, &e.contract, "reveal_ash_key", json!({ "season_id": bid, "phrase": kb["phrase"], "salt": kb["salt"] }), DEPOSIT).await?, "ERR_ASH_KEY_REVEALED");

    // coordinator management is owner-only and needs 1 yoctoNEAR
    fails(call(&e.stranger, &e.contract, "add_coordinator", json!({ "account_id": e.stranger.id() }), NearToken::from_yoctonear(1)).await?, "ERR_NOT_OWNER");
    fails(call(&e.owner, &e.contract, "add_coordinator", json!({ "account_id": e.stranger.id() }), NearToken::from_yoctonear(0)).await?, "1 yoctoNEAR");
    ok(&call(&e.owner, &e.contract, "add_coordinator", json!({ "account_id": e.stranger.id() }), NearToken::from_yoctonear(1)).await?);
    assert_eq!(view(&e.contract, "is_coordinator", json!({ "account_id": e.stranger.id() })).await?, true);
    ok(&call(&e.owner, &e.contract, "remove_coordinator", json!({ "account_id": e.stranger.id() }), NearToken::from_yoctonear(1)).await?);
    assert_eq!(view(&e.contract, "get_coordinators", json!({})).await?, json!([e.coord.id()]));
    Ok(())
}