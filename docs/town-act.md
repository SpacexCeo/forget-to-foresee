# The player's moves in the town, through the relayer

A guest's browser key is a function-call key of the guests contract and cannot sign to `ftf-town`, so the guest signs
a request and the relayer, a town coordinator, makes the move with the matching `*_for` method (contract v4,
`docs/town-upgrades.md`). It works like the portal (`docs/town-gate.md`) and uses the same coordinator key.

## Endpoint (`relayer/api/town/act.js`, `relayer/lib/town-act.js`)

`GET /api/town/act?account_id=<guest>` reads what the windows show from the chain:
`{registered, silk, credit, staked, deeds: [{token_id, asset, principal, tier, state, locked_until_day,
unbond_ready_day, claimable}], limits: {today, per_day, all_today, all_per_day}, day, season_id, entered, entry_fee,
paused, configured, contract}`. Amounts are micro-silk strings (1 silk = 1,000,000). `asset` 0-3 = loom, caravan,
archive, observatory. Deed `state` 0 = active, 1 = unbonding.

`POST /api/town/act {account_id, public_key, at, action, args, signature}`, where the signature (ed25519, the guest
key, base58) is over

    ftf-town-act|<account>|<action>|<the action's fields in order, joined by ",">|<at ms>

| action | args (in signing order) | contract method |
|---|---|---|
| `pledge` | `asset` 0-3, `amount` µsilk string, `tier` 0-3 | `pledge_for` → the deed id in `result` |
| `claim` | `token_id` | `claim_for` |
| `unbond` | `token_id` | `unbond_for` (begins, or finishes after the cooldown) |
| `exit_early` | `token_id` | `exit_early_for` |
| `invest_stall` | `trader` (a stall, e.g. `trader-03.ftf-town.testnet`), `amount` µsilk string | `invest_stall_for` |
| `claim_stall` | `trader` | `claim_stall_for` |
| `enter_tournament` | `season_id` | `enter_tournament_for` |

Example: `ftf-town-act|ann-1a.guests.ftf-coordinator.testnet|pledge|0,20000000,1|1763035200000`.

Answer: `{ok, action, tx_hash, request_hash, result, silk, credit, contract}`. Moves that spend silk (pledge,
invest_stall, enter_tournament) first credit the guest's verified expedition income (`credit` shows what was added);
a guest without a stored log moves only the silk it already holds.

Refusals: 400 `bad_account` / `bad_public_key` / `stale` (more than 5 minutes off) / `bad_action` / `bad_args`;
401 `bad_signature`; 403 `not_your_key` / `not_your_deed` / `not_for_town_wallets`; 402 `not_enough_silk`;
404 `no_stall`; 409 `replayed` / `not_registered` / `pledge_cap` / `locked` / `cooling_down` / `wrong_state` /
`already_entered` / `no_open_season` / `no_exit_yet`; 429 `rate_limited` / `daily_limit` (40 moves a player a day);
502 `act_failed`; 503 `town_act_not_configured` / `paused` / `contract_not_upgraded`.

## Safety

- The relayer checks the signature, that the key is an access key of that account (`view_access_key`), the time, and
  the replay (in memory and on chain, `act_request_used`). The contract records each request hash once.
- The silk only moves on the guest's own row; the deed is the guest's. A leaked coordinator key could make moves a
  guest did not ask for (capped at 40 a player and 20,000 a day), but it cannot take silk out: a stall pledge pays
  the town's own stall wallets, never the coordinator.
- One send at a time with the coordinator key (`coordQueue`, shared with the portal).

Tests: `relayer/tests/town-act.test.mjs` (5) and the contract's v4 tests (8).
