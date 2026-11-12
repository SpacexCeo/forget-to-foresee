# Town market: townsfolk trading on NEAR testnet

The townsfolk and the clan agents trade goods for town silk all day. Each trade is a real NEAR testnet transaction
signed by that trader's own account, about 20,000 a day. In the game, a ticker shows "Town market · N trades today"
and links the last trades to the testnet explorer. Sellers in view show what they sold, and by day buyers walk to the
stalls by the Shard Exchange. **These are AI townsfolk making automated trades.** Players do not trade here. Town
silk is an in-game unit with no value outside the game.

## Pieces

| Piece | Where | What |
|---|---|---|
| Contract | `contracts/market` (`market.ftf-coordinator.testnet`) | `trade({to, item, qty, price})`: the caller buys from `to`. Price must be half to twice the item's base, qty 1–20, and balances never go negative. Only registered traders can trade. It logs a NEP-297 event (`ftf_market` / `trade`). State is fixed: 20 balances, the last price of 25 goods, today/total counters and a 14-day history, so storage does not grow per trade (unit-tested). Owner: `add_traders`, `fund`, `set_items`, `set_paused`. Views: `stats`, `items`, `balances`, `balance_of`. |
| Cast and goods | `relayer/market/catalog.js` | 13 townsfolk + 7 clan agents (the six clans and the tinker). 25 goods, each made and sold by one trader. Accounts: `tf-<key>.ftf-coordinator.testnet`. |
| Schedule | `relayer/market/schedule.js` | A day curve on the town's clock (Kyiv): 0.33× the mean at 03:00, 1.86× at 15:00, normalised to the daily target (20,000). Each trader runs an independent Poisson process, ~1,000 trades a day each (one every ~86 s on average). |
| Behaviour | `relayer/market/behaviour.js` | Buyers pick goods others make: staples (bread, stew, candles…) often, dear goods rarely, cheap goods more than dear ones. Each trade spends ~2–6 % of the buyer's silk. Prices revert toward base with noise, and a rich seller cuts the price while a poor one asks more. A 100k-trade simulation conserves silk and keeps every balance between ~0.2× and ~3.5× the start. |
| Daemon | `relayer/market/daemon.js`, `index.js` | Runs inside the relayer when `FTF_MARKET=1`. One loop per trader, each signing with its own trade-only key, so nonces never collide. The nonce and block hash are cached, so a trade is one RPC call. A global cap limits sends (`FTF_MARKET_MAX_PER_MIN`, default 60). The daemon can be paused (`FTF_MARKET_PAUSED=1`, or the contract's `set_paused`). State is saved in `data/market-state.json` and survives restarts, and there is one JSONL log per day in `data/market-log/`. A trader whose NEAR falls below 0.05 sits out for 10 minutes at a time and is listed in `low_funds`. |
| Stats | `GET /api/market/stats` | `{enabled, paused, today, target, chain: {day, today, total}, recent: [{at, buyer, seller, item, qty, price, hash}], low_funds, failures_today, last_error}`. Without the daemon in the process it answers from the contract's counters, with `recent` empty. Never contains a key. |
| Game | `game/src/net/market.js`, `ui/market-ticker.js`, `play/market-scene.js`, hooks in `boot-world.js` | The ticker polls every 20 s while Iris is in the town and hides when there is no market. Lines are localised (`mk.*`). `?market=0` turns it off. |

## Keys

Each trader account has two keys:

- **Full-access key:** the coordinator's, made by `market-deploy.sh` in the lead's keychain. It is used to fund the
  account or delete it.
- **Trade key:** a function-call key that can call only `trade` on the market contract. It is made **on the relayer's
  server** by `node relayer/scripts/market-keys.mjs`. That command writes `relayer/data/market-keys.json` (mode 600,
  ignored by git) and prints only accounts and public keys. The trade key has no allowance cap: it is limited by its
  account's small balance and by the one method it can call.

## Cost

Gas per trade was computed for the 176 KB wasm: live testnet protocol config (v88) plus the host gas measured in the
unit VM (0.50 Tgas):

| Part | Tgas |
|---|---|
| Transaction → receipt (function call send) | 0.31 |
| Function-call receipt execution | 0.89 |
| Contract load | 0.19 |
| Storage reads/writes + event log | 0.50 |
| Wasm instructions (estimate) | ~0.2 |
| **Total** | **≈ 2.1–2.3** |

Testnet gas price is 1e8 yoctoNEAR per gas (checked 12.11), so a trade costs ≈ 0.00022 NEAR. 20,000 trades a day cost
≈ 4.4 testnet NEAR, about 0.22 NEAR per trader per day. Prepaid gas is 10 Tgas; the unused part is refunded.

`node tools/market/sandbox-gas.mjs <near-sandbox> <market.wasm>` measures it on a local sandbox node: real gas burnt,
the NEAR spent per trade, allowance use and storage before/after. The worker's container could not run the sandbox
binary, so the first testnet trades are the first real measurement. Record them here once they exist.

## Deploy (lead) and run (server)

1. On the server: `cd relayer && node scripts/market-keys.mjs > market-public.json` (public keys only), then send
   that file to the lead.
2. The lead runs `TRADER_KEYS=market-public.json bash contracts/scripts/market-deploy.sh`. This builds and deploys the
   market (2 NEAR for storage), creates the 20 trader accounts (`TRADER_FUND`, default 0.2 NEAR each), adds each trade
   key, registers the traders with 1,000 town silk and writes `market` into `game/src/net/day1-deployment.js`.
3. On the server: add `FTF_MARKET=1` to `relayer/.env` and restart the relayer. Its start line says
   `market 20 traders`, and `curl -s $H/api/market/stats` shows `today` growing.
4. Top up: `MODE=topup TOPUP=0.3 MIN=0.1 bash contracts/scripts/market-deploy.sh` refills every trader below 0.1 NEAR.
   Running to 25.11 needs about 55 testnet NEAR in all.

Pause without a redeploy: `FTF_MARKET_PAUSED=1` plus a restart, or `near contract call-function as-transaction
market.ftf-coordinator.testnet set_paused json-args '{"paused":true}' …` signed by the coordinator.
