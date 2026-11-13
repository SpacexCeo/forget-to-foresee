# Guest capacity: how many free Day-1 guests the funds cover

Read on 2026-11-13 around 11:00 UTC with view calls only (`view_account`, `view_access_key`, `view_code`, and the
contracts' `stats` / `nft_total_supply`). Storage costs 1 NEAR per 100 kB (10^19 yocto per byte). "Free" means
balance minus the NEAR locked for the account's storage.

| Account | Balance | Storage (code + state) | Free | Cost per new player | Players left |
| --- | --- | --- | --- | --- | --- |
| `guests.ftf-coordinator.testnet` | 3.317 NEAR | 180,296 B (code 172,856) = 1.803 NEAR | **1.51 NEAR** | 0.05 NEAR `fund` to the new account + ~160 B record + gas ≈ 0.06 NEAR | **≈ 25** |
| `heroine.ftf-coordinator.testnet` | 5.998 NEAR | 414,813 B (code 267,135) = 4.148 NEAR | 1.85 NEAR | ≈ 3.2 kB per Elise token (metadata + enumeration) ≈ 0.032 NEAR | ≈ 57 |
| `companions.ftf-coordinator.testnet` | 4.996 NEAR | 273,206 B (code 267,135) = 2.732 NEAR | 2.26 NEAR | ≈ 1 kB per dragon ≈ 0.01 NEAR, 1–2 dragons per player | ≈ 110–220 |
| guest key (`ed25519:3aViGk…`, `create_guest` only) | allowance 1.618 NEAR left | — | — | gas of one `create_guest` (part of the 0.06 above) | not the limit |

State at the read: 46 guests, 46 Elise tokens, 6 dragons, 9 guests created today, daily cap 200, `fund` 0.05 NEAR.

**The guests contract is the limit: about 25 more free guests.** After it, the heroine contract (≈ 57 mints). The
daily cap (200) is far away. Each figure divides the free balance by the per-player cost measured from the current
state (state bytes ÷ tokens); gas varies, so treat them as ±20 %.

## What happens when the fund runs out

`create_guest` sends `fund` to the new account. When the contract cannot pay it and keep its storage, the
transaction fails with `LackBalanceForState` / `NotEnoughBalance`. If the key's allowance runs out first, the RPC
refuses the transaction with `NotEnoughAllowance`.

- The relayer (`relayer/lib/core.js`, `createGuest`) answers **503 `{error: "fund_empty"}`** for these errors, not a
  generic `tx_failed`. The daily cap was already answered with **429 `{error: "daily_cap"}`**.
- The game (`game/src/play/day1-mint.js`) turns either reason into the phase `unavailable`, not `failed`, so it does
  not offer a pointless retry. The arrival panel (`game/src/play/day1.js`) shows "The free fund is empty for now —
  play on as a local guest; your progress stays in this browser." (or the daily-cap line). The player still gets
  Elise as a local preview and plays on. No fake checkmark appears and no error is thrown.
- Tests: `relayer/tests/core.test.mjs` (a `LackBalanceForState` receipt and a `NotEnoughAllowance` send both give
  `fund_empty`) and `game/tests/client/day1-mint.test.mjs` (relayer 503/429 and the in-browser signer → `unavailable`
  with the reason; the English and Russian copy exist).

## Top-up (owner, from the owner's own machine)

```bash
# 10 NEAR covers about 165 more guests; 6 NEAR about 185 more Elise mints; 2 NEAR about 200 more dragons
near tokens ftf-coordinator.testnet send-near guests.ftf-coordinator.testnet '10 NEAR' network-config testnet sign-with-keychain send
near tokens ftf-coordinator.testnet send-near heroine.ftf-coordinator.testnet '6 NEAR' network-config testnet sign-with-keychain send
near tokens ftf-coordinator.testnet send-near companions.ftf-coordinator.testnet '2 NEAR' network-config testnet sign-with-keychain send
# the funding account itself had 2.51 NEAR at the read: top it up from the testnet faucet first
```

A spent key allowance is refilled by adding a new `create_guest` key (`contracts/scripts/day1-guest-key.sh`,
`ALLOWANCE=…`), not by sending NEAR. Check after a top-up:

```bash
node -e 'fetch("https://test.rpc.fastnear.com",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"query",params:{request_type:"view_account",finality:"final",account_id:"guests.ftf-coordinator.testnet"}})}).then(r=>r.json()).then(j=>console.log((Number(BigInt(j.result.amount)/10n**20n)/1e4)-j.result.storage_usage/1e5,"NEAR free"))'
```
