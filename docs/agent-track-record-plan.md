# Agent track record on-chain, verifiable by another agent (owner, 11.11)

## Goal
Every hired townsperson-agent's card shows its trade history and PnL, and anyone — a person or another AI agent — can verify on NEAR testnet that this agent really made those trades and that its skill (PnL) is what the card says. The agent itself explains how to verify it.

## Why it is verifiable
- Prices: the sealed Echo snapshot in the repo (sha256 already published).
- Decisions: each agent's learning policy is deterministic from (agent id, seed, its parameters, the bars it had seen). Re-running it on the same bars reproduces the same trades.
- So a record = (agent id, seed, policy version, params hash, bar range, the trades, the PnL). A verifier re-runs the policy and the PnL math; any forged trade or PnL fails.

## On-chain
- New contract `agent-ledger` (sub-account `ledger.ftf-coordinator.testnet`): `record_track(agent_id, epoch, seed, policy_version, params_hash, snapshot_sha256, bar_from, bar_to, trades_compact, pnl_bp)` stores the compact trade list (~40 bytes/trade, small) and emits an event; views `get_track(agent_id, epoch)`, `list_tracks(agent_id)`, `agent_summary(agent_id)` (total trades, cumulative PnL, verified epochs). Signed by the player's guest account (browser key from Day 1); storage paid by a small deposit or by the contract's fund with a per-account cap.
- Tests: record and read back; size/limit checks; summary math.

## Verifier
- `tools/verify-agent/verify.mjs` (Node, no deps beyond the repo): fetch `get_track` from testnet RPC, load the sealed snapshot (check its sha256), re-run the agent policy for that seed/params/bar range, recompute PnL; print PASS/FAIL with the first mismatch.
- The same verifier runs in the browser: the agent card shows "Verified on NEAR testnet ✓ (re-computed just now)" only after it passes; explorer link to the record's transaction.
- `docs/api/verify-agent.md`: a short, copy-pasteable prompt + steps for any AI agent ("Read get_track(...) on ledger.ftf-coordinator.testnet via RPC, load the snapshot from <url>, run the policy in game/src/... with these inputs, compare trades and PnL").

## In the game
- Agent card: trade history list, PnL curve, win rate, epochs recorded on-chain with links, a "Record this session on-chain" button (signs with the guest key) and the verification badge.
- The agent explains itself in its scripted dialogue (new intent "how-can-i-verify-you"): a few lines in its temperament's voice that say what is recorded, how to check it, and offer "Copy verification steps" (the prompt above, filled with its ids).

## Order
After the Day-1 client flow. The lead deploys the ledger contract with the coordinator key (scripts as for Day 1).
