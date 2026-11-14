#!/usr/bin/env python3
"""Reads the real, public data the presentation video shows on its right side and writes panels/data.json.

Sources (read-only, all public): the relayer's /api/health and /api/market/stats, NEAR testnet RPC (transaction status,
contract view calls). Nothing is typed by hand; every panel names its source.
"""
import base64, json, os, sys, time, urllib.request

RELAYER = "https://159-195-130-113.sslip.io"
RPCS = ["https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org", "https://test.rpc.fastnear.com"]
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "panels")


def get(url, timeout=20):
    r = urllib.request.Request(url, headers={"User-Agent": "curl/8.5.0", "Accept": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=timeout).read())


def rpc(method, params):
    last = None
    for u in RPCS:
        try:
            r = urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": "v", "method": method, "params": params}).encode(), headers={"Content-Type": "application/json", "User-Agent": "curl/8.5.0"})
            d = json.loads(urllib.request.urlopen(r, timeout=25).read())
            if "result" in d:
                return d["result"], u
            last = d.get("error")
        except Exception as e:
            last = str(e)
    return {"error": last}, None


def view(account, method, args=None):
    res, u = rpc("query", {"request_type": "call_function", "finality": "final", "account_id": account, "method_name": method,
                           "args_base64": base64.b64encode(json.dumps(args or {}).encode()).decode()})
    if "result" in res:
        try:
            return json.loads(bytes(res["result"]).decode()), u
        except Exception as e:
            return {"raw": bytes(res["result"]).decode()[:400]}, u
    return res, u


def main():
    os.makedirs(OUT, exist_ok=True)
    d = {"at": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()), "relayer": RELAYER}
    for k, path in [("health", "/api/health"), ("market", "/api/market/stats"), ("p2p", "/api/market/p2p/stats")]:
        try:
            d[k] = get(RELAYER + path)
        except Exception as e:
            d[k] = {"error": str(e)}
    json.dump(d, open(f"{OUT}/raw.json", "w"), indent=1)
    m = d.get("market", {})
    out = {"at": d["at"], "relayer": RELAYER, "notes": []}
    out["trades"] = {"contract": m.get("contract"), "today": m.get("today"), "total": (m.get("chain") or {}).get("total"), "traders": m.get("traders"), "target": m.get("target"),
                     "recent": [{k: t.get(k) for k in ("buyer", "seller", "item", "qty", "price", "reason", "hash", "at")} for t in (m.get("recent") or [])[:14]]}
    # one trade checked on the public indexer and on RPC (an older one: the indexer lags a little)
    tx = None
    for t in (m.get("recent") or [])[8:20]:
        try:
            r = get("https://api-testnet.nearblocks.io/v1/txns/" + t["hash"])
            x = (r.get("txns") or [None])[0]
            if x:
                tx = {"hash": t["hash"], "signer": x.get("signer_account_id"), "receiver": x.get("receiver_account_id"), "block": (x.get("block") or {}).get("block_height"),
                      "method": ((x.get("actions") or [{}])[0]).get("method"), "status": (x.get("outcomes") or {}).get("status"), "source": "api-testnet.nearblocks.io", "trade": t}
                break
        except Exception as e:
            out["notes"].append("nearblocks " + str(e)[:80])
    if tx:
        res, u = rpc("tx", {"tx_hash": tx["hash"], "sender_account_id": tx["signer"], "wait_until": "EXECUTED"})
        if "status" in res:
            tx["rpc"] = u; tx["rpc_status"] = list(res["status"].keys())[0] if isinstance(res["status"], dict) else str(res["status"])
            tx["gas"] = sum(o["outcome"]["gas_burnt"] for o in res.get("receipts_outcome", [])) + res.get("transaction_outcome", {}).get("outcome", {}).get("gas_burnt", 0)
            tx["block_hash"] = res.get("transaction_outcome", {}).get("block_hash")
            try: tx["args"] = json.loads(base64.b64decode(res["transaction"]["actions"][0]["FunctionCall"]["args"]).decode())
            except Exception: pass
    out["tx"] = tx
    st = m.get("strategy") or {}
    out["ai"] = {"tee": (d.get("health") or {}).get("tee"), "decisions_today": st.get("decisions_today"), "llm_today": st.get("llm_today"),
                 "clans": [{k: c.get(k) for k in ("clan", "model", "chat_id", "verified", "prompt_hash", "params", "source", "at")} for c in (st.get("clans") or [])]}
    V = {}
    for name, acc, meth, args in [("guests", "guests.ftf-coordinator.testnet", "stats", {}), ("heroine_supply", "heroine.ftf-coordinator.testnet", "nft_total_supply", {}),
                                  ("heroine_tokens", "heroine.ftf-coordinator.testnet", "nft_tokens", {"from_index": "0", "limit": 3}),
                                  ("companions_supply", "companions.ftf-coordinator.testnet", "nft_total_supply", {}),
                                  ("companions_tokens", "companions.ftf-coordinator.testnet", "nft_tokens", {"from_index": "0", "limit": 12}),
                                  ("shards_supply", "ftf-shards.testnet", "nft_total_supply", {}), ("skins_supply", "skins.ftf-coordinator.testnet", "nft_total_supply", {}),
                                  ("season", "ftf-seasons.testnet", "get_season", {"season_id": "793f6c05e89839f2"}),
                                  ("leaves", "ftf-seasons.testnet", "get_revealed_leaves", {"season_id": "793f6c05e89839f2", "from_index": 0, "limit": 3}),
                                  ("ash_key", "ftf-seasons.testnet", "get_ash_key", {"season_id": "793f6c05e89839f2"}),
                                  ("chest_season", "chests.ftf-coordinator.testnet", "season_info", {}), ("chest_openings", "chests.ftf-coordinator.testnet", "list_openings", {"from_index": 0, "limit": 2}),
                                  ("chest_opening", "chests.ftf-coordinator.testnet", "get_opening", {"index": 0})]:
        V[name], _ = view(acc, meth, args)
    out["views"] = V
    # the ownership chain of one dragon (the owner's own test heroine when there is one)
    toks = V.get("companions_tokens") if isinstance(V.get("companions_tokens"), list) else []
    pick = next((t for t in toks if "lambada" in t["token_id"]), toks[0] if toks else None)
    if pick:
        hid = json.loads(pick["metadata"].get("extra") or "{}").get("heroine")
        ht, _ = view("heroine.ftf-coordinator.testnet", "nft_token", {"token_id": hid})
        out["nft"] = {"dragon": pick["token_id"], "dragonTitle": pick["metadata"].get("title"), "heroineAccount": pick["owner_id"], "heroine": hid,
                      "player": (ht or {}).get("owner_id") if isinstance(ht, dict) else None}
    json.dump(out, open(f"{OUT}/data.json", "w"), indent=1)
    o2 = {"nft": out.get("nft"), "tx": out.get("tx"), "notes": out["notes"]}
    print(json.dumps(o2, indent=1)[:int(sys.argv[1]) if len(sys.argv) > 1 else 9000])


if __name__ == "__main__":
    main()
