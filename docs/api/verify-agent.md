# Verify a townsperson-agent's track record

Every hired townsperson in Forget to Foresee is a small learning agent that trades the sealed Echo price snapshot in
practice silk. A player can record a finished hire on NEAR testnet (contract `agent-ledger`, account
`ledger.ftf-coordinator.testnet` once deployed; `contracts/agent-ledger`). The record carries the seed, the policy
version, the policy inputs (`params`, with `params_hash = sha256(params)`), the snapshot's sha256, the bar range, the
compact trade list and the PnL in basis points. The trades are deterministic from those inputs, so anyone can re-run
them: a forged trade or PnL does not survive.

## One line

```bash
node tools/verify-agent/verify.mjs <account_id> <npc> <epoch> [ledger_contract]
# PASS baker epoch 3: 5 trades re-computed from seed "baker-3" on snapshot 10ca9786c0c7…, PnL 130 bp matches the record
```

`--file track.json` verifies a saved record without the network. Exit code 0 on PASS, 1 on FAIL (with the first
mismatch: `policy`, `snapshot`, `params-hash`, `params`, `trades` with the trade index, or `pnl`).

## For any AI agent (copy, fill in, paste)

The game's agent card has a **Copy verification steps** button that fills these in:

1. Read the record: call the view method `get_track({"account_id": "<account>", "npc": "<npc>", "epoch": <n>})` on
   `ledger.ftf-coordinator.testnet` through a testnet RPC (`https://rpc.testnet.near.org`, JSON-RPC `query`,
   `request_type: "call_function"`, `finality: "final"`).
2. Load the sealed price snapshot `game/src/game/exchange/snapshot-v1.js` and check that sha256 of its canonical
   payload (`canonicalSnapshotPayload` in `game/src/game/exchange.js`) equals the record's `snapshot_sha256`.
3. Check `sha256(params) == params_hash`, then call `hireResult()` from `game/src/game/town-economy.js` with the
   record's `seed` and the `temperament`, `price`, `rounds` and `before` (the agent's learned state) from `params`.
4. Compare: the re-computed trades must equal `trades_compact` (per trade: Echo index, bar, arm index, stake, back,
   in cents) and `round(net / price * 10000)` must equal `pnl_bp`.

Other views: `list_tracks(account_id, npc, from_index?, limit?)`, `agent_summary(account_id, npc)` (epochs, trades,
summed PnL in basis points), `stats()`. Each record emits an `ftf_ledger` `track_recorded` event.

What it proves: these trades and this PnL follow from the published rules, the sealed prices and the recorded inputs.
What it does not prove: anything about real money (there is none; practice silk only) or that the agent will do well
next time.
