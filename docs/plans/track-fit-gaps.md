# Track fit: what a judge can see in the first 10 minutes (13 Nov 2026, night)

Read from the code on `main` (684a97af), the live flags (`game/public/features.json`) and the live relayer
(`/api/market/stats`, 13 Nov ~21:00 Kyiv: 18,493 trades today, target 24,000, 30 recent rows with reasons and
hashes, 21 clan strategy decisions today, all from NEAR AI Cloud). "Visible" means: on the live page, without the
README, a URL trick or a dev tool. Hours are hands-on agent hours.

| Track prompt point | Visible today? | Where | Gap | Fix (hours) |
|---|---|---|---|---|
| NPC merchants are agents with their OWN NEAR accounts | Partly | Town market pill (bottom left): 5 latest trades, each a link to its tx | No account id anywhere in the game; the 20 `trader-NN.ftf-town.testnet` and 6 `clan-*.ftf-town.testnet` wallets are only in docs | Town Ledger: every name opens a trader card with its own account id, explorer link, silk balance, goods for sale (1.5) **built** |
| Readable reasons for prices | Hidden | Reason is only the `title` tooltip of a ticker link (never on touch); the resource stall desk shows it when you walk there | A judge never hovers a 13 px link | Ledger shows "why this price" under every trade, localised from the relayer's reason words (`relayer/market/prices.js` vocabulary) (0.5) **built** |
| Decisions on NEAR AI Cloud | No (for the economy) | The TEE panel covers townsfolk dialogue lines; the clans' trading strategy (`stats.strategy`, Qwen3 on NEAR AI Cloud, attested chat id, prompt hash) has no window | The strongest AI-agent proof is invisible | Ledger section "Clan strategy": model, risk / buy / favour, the model's own reason, verified mark, chat id, today's LLM share (0.5) **built** |
| Real-world inputs moving prices | No | Prices move from stock and demand only | No external input exists | Out of scope tonight (server change + redeploy); say so honestly. Later: a weather or NEAR-price input in `prices.js` with its reason word (3+) |
| Fast-forward, "a week in a minute" | Not from the game | `economy-lab.html` (model run, labelled), live and 200 | No link from inside the game | Ledger links "A week in a minute" to the Economy Lab (0.1) **built** |
| No wallet popups / guest login | Yes | Day-1 guest account made in the browser, relayer pays gas; account sign-in (NEAR Connect, EVM, Solana) in the menu | — | — |
| Readable on-chain trail per action | Yes for player actions, partly for the town | Chest opens, works pledges, stall buys, market sales show their tx links | The town's 18k trades/day are a 5-line list; no count vs target, no per-trader trail | Ledger: 12 live trades with tx links, today vs target bar, failures, per-trader trades in the card (included above) |
| Player-owned shops | No | `register` / stall claim flag OFF; `invest_stall` exists on the contract, never exercised | Not shippable tonight without a live chain test | Keep off; mention in the pitch as built-not-live |
| NFT owns an account, carries earnings on transfer | No | NFT tab lists shards / heroine / companions with owner | Structural (contract work) | Out of scope tonight |
| Seasons | Yes (judge season committed, shards) | Judge path, NFT tab, `?judge=1` panel | — | — |

## Entry points (no HUD file touched)

- The game menu (tray [Esc] / the Bag) gets a "Town" tab, first after Profile, behind flag `townLedger`.
- The Town market pill's box gets an "Open the Town Ledger" button (same flag), so the judge who taps the live
  trade count lands in the ledger.
