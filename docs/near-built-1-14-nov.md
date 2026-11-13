# NEAR work built 1–14 Nov 2026

Everything below was written and deployed during the hackathon window (every commit in this repository is dated
7 Nov 2026 or later). NEAR **testnet** only; nothing here has real-world value. Figures marked "13.11" were read
from the testnet RPC and the live relayer on 13 Nov 2026.

To call a view method without our code (replace ACCOUNT, METHOD and ARGS):

```bash
view() { curl -s https://rpc.testnet.near.org -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "${3:-{\}}" | base64 -w0)\"}}" | python3 -c 'import json,sys;print(bytes(json.load(sys.stdin)["result"]["result"]).decode())'; }
```

Explorer: `https://testnet.nearblocks.io/address/<account>`.

## Contracts

| What | Account | Source | Verify |
|---|---|---|---|
| Season commit-reveal (Merkle root before trial 1, each leaf re-hashed on chain) | `ftf-seasons.testnet` | `contracts/season-commit/` | `curl` in README "Verify in 60 seconds" → `"leaf_count":15`, `"revealed_count":15` |
| Memory shards (NEP-171, metadata bound to the season's Merkle leaf) | `ftf-shards.testnet` | `contracts/memory-shard/` | `view ftf-shards.testnet nft_tokens_for_owner '{"account_id":"lambada_eth.testnet"}'` |
| Agent card NFT (Iris's end-of-season state) | `agents.ftf-coordinator.testnet` | `contracts/agent-card/` | `view agents.ftf-coordinator.testnet nft_total_supply` |
| Day 1 guests (a browser key becomes a guest sub-account) | `guests.ftf-coordinator.testnet` | `contracts/guests/` | `/api/health` → `stats.guests` (46 on 13.11); sub-accounts `<name>.guests.ftf-coordinator.testnet` |
| Heroine NFTs (Elise), each token with its own account (`act_as_token`) | `heroine.ftf-coordinator.testnet` | `contracts/character-nft/`, `contracts/token-account/` | `view heroine.ftf-coordinator.testnet nft_total_supply` → 46 on 13.11 |
| Companion dragons, owned by a heroine token's account | `companions.ftf-coordinator.testnet` | `contracts/character-nft/` (same NFT code), `relayer/lib/companion.js` | `view companions.ftf-coordinator.testnet nft_total_supply` → 6 on 13.11 |
| Agent track records (hire, trades, PnL; TEE decisions) | `ledger.ftf-coordinator.testnet` | `contracts/agent-ledger/` | `node tools/verify-agent/verify.mjs ledgercheck-5.guests.ftf-coordinator.testnet baker 1` → PASS |
| Loot chests (10,000-card deck, 1,000 NFT, committed root, TEE-attested seed) | `chests.ftf-coordinator.testnet` | `contracts/loot-chest/` | `view chests.ftf-coordinator.testnet season_info`; `node tools/verify-chest/verify.mjs`; 36 openings on 13.11 |
| Wheel skin NFT (cap 100, one per account) | `skins.ftf-coordinator.testnet` | `contracts/skin-nft/` | `view skins.ftf-coordinator.testnet skin_info` → `minted: 0` on 13.11 (mint pending: minter key not added) |
| Town economy (silk ledger, stalls, pledges, portal gate, tournament) | `ftf-town.testnet` (v4) | `contracts/town/` | [explorer](https://testnet.nearblocks.io/address/ftf-town.testnet); `/api/market/stats` → `chain.total` (7,716 on 13.11) |
| Town items (NEP-245 multi-token: core, metadata, events) | `items.ftf-town.testnet` | `contracts/town-items/` | `view items.ftf-town.testnet tokens` → 5 resources registered, supply 0 on 13.11 |

Not deployed: the whitelist pass (`contracts/whitelist-pass/`, `/api/health` → `pass.configured: false`), town v5 /
items v2 (`trade_for`, `coordinator_transfer` for the player market; tests only).

## The relayer coordinator pattern

The browser never holds a funded key. It makes its own ed25519 key; the relayer (`relayer/`, live at
`https://159-195-130-113.sslip.io`) pays for the guest sub-account and makes that key its full-access key. For
contracts a guest key cannot sign to, the guest signs a request; the relayer's coordinator key calls a
coordinator-only `*_for` method (`pay_gate_for`, `pledge_for`, `claim_for`, `invest_stall_for`,
`enter_tournament_for`, ...) that records the request hash once (replay-safe) and enforces limits (40 moves a player
a day, 20,000 for everyone). Each server key is a function-call key limited to the methods it needs (for example
`nft_mint` only for the dragon minter). One send queue per key keeps nonces in order.
Code: `relayer/lib/town-act.js`, `relayer/lib/near-tx.js`; docs: [town-act.md](town-act.md).
Check: `curl -s https://159-195-130-113.sslip.io/api/health`.

## Trader wallets with on-chain trades

26 NPC wallets on `ftf-town.testnet`: `trader-01` … `trader-20.ftf-town.testnet` and six clans
(`clan-iris`, `clan-salt`, `clan-ash`, `clan-moss`, `clan-amber`, `clan-frost` `.ftf-town.testnet`), each with a
game-methods-only key. The trades are **scripted** (price rules and demand schedules, `relayer/market/`); each
trade is a real testnet transaction (3.06 Tgas). Check: `/api/market/stats` → `recent[].hash`, open any hash at
`https://testnet.nearblocks.io/txns/<hash>`.

## TEE agents

Townsfolk speech, the trade advisor and the clans' strategy parameters come from `Qwen/Qwen3-VL-30B-A3B-Instruct`
through NEAR AI Cloud confidential inference (Intel TDX + GPU attestation). The browser re-checks the signature
before an answer replaces the scripted line; the model only picks bounded parameters, the rules engine makes every
move. Check: `/api/health` → `tee.model`; `/api/market/stats` → `strategy.clans[].label`;
`node tools/verify-tee/verify.mjs answer.json` → PASS. Docs: [tee.md](tee.md).

## Chests, skins, companions

- Chests: see the table; the season seed comes from an attested TEE answer and is stored in `season_info.seed`.
- Skins: the wheel's grand prize; contract live, no token minted yet.
- Companions: one dragon at the Day 1 mint, a second after the first boss (checked against the stored, hash-verified
  expedition log); minted by an `nft_mint`-only key. Example: `nacre-cy-8` owned by
  `elise-cy-8.heroine.ftf-coordinator.testnet`. Docs: [companions.md](companions.md).
