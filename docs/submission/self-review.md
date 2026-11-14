# Self-review as the jury (14 Nov 2026, 00:00 UTC)

Scored on the five published criteria (equal weights) and the two track fits, with the same formula as the earlier
reviews: adjusted = 0.75 × mean + 0.25 × fit × 10. Every line says where its evidence is; **[V]** checked tonight
(command or URL named), **[I]** inferred. A self-review is not a jury: read the scores as a to-do list.

## Evidence read tonight [V]

| Source | What it said (13 Nov, 23:45 UTC) |
| --- | --- |
| `ftf-town.testnet` `pulse` (RPC view) | `trade` 21,688 since deployment; 26 accounts; `stake` 6; `entry`, `invest`, `stall_claim`, `claim` 0; `gates_paid` 0 |
| [`/api/market/stats`](https://159-195-130-113.sslip.io/api/market/stats) | 21,151 trades sent on 13 Nov (UTC) against a target of 24,000; 20 traders, none low on funds, none budget-capped; `failures_today` 1,082 (see below) |
| `guests.ftf-coordinator.testnet` `stats` | 56 guest accounts, 19 made on 13 Nov |
| `heroine` / `companions` / `agents` / `ftf-shards` / `skins` `nft_total_supply` | 56 / 6 / 1 / 3 / 0 |
| `items.ftf-town.testnet` `tokens` | five monster resources registered, supply 0 each |
| NearBlocks `accounts/chests.ftf-coordinator.testnet/txns` | `open_chest` transactions through 13 Nov 22:35 UTC, all successful |
| [`/api/health`](https://159-195-130-113.sslip.io/api/health) | TEE configured (`Qwen/Qwen3-VL-30B-A3B-Instruct`), chests, wheel, companions configured |
| `docs/STATS.md` (regenerated tonight on the server, `--skip-rust`) | see the file; the contract rows carry the last cargo run |

The 1,082 failed sends of 13 Nov all happened before the 12:08 UTC switch to the FastNear + archival RPC pair; none
after it. The relayer's day counter resets at 00:00 UTC.

## Scores

| Criterion | Score | Why |
| --- | ---: | --- |
| Technical implementation | **8.6** | 20 trader accounts with their own keys traded 21,233 times on 13 Nov (the final indexer count: 21,360 successful transactions, 2 failed), every trade with a reason and a hash; an independent recount tool (`tools/count/count.mjs`); commit-reveal season verified on chain; TEE answers re-checked in the browser; NEP-171 and NEP-245 contracts; CI on every push; 1,200+ game tests. Minus: the player side of the economy is thin on chain (gate 0, items 0, pledges 0), and one VPS holds every service key. |
| Design / UX | **7.6** [I] | Transparent HUD, a starter guide that walks the first ten minutes, Town Ledger with trader accounts and reasons, intro and prologue, five locales, guest play with no wallet prompt. Not seen tonight by me (no browser checks by workers); the lead's boot checks are the evidence. The boss fight is built but off on the live page. |
| Impact | **6.4** | A pattern others can reuse (sealed seasons, NPC merchants with their own accounts, NFT that owns an NFT). Testnet only; 56 guest accounts and 80 chest openings on 13 Nov are real players, but small. |
| Originality | **8.3** | Paying for prophecy with memories that become NFTs bound to a sealed season; merchants as wallets with readable price rules; a dragon NFT owned by a heroine NFT's account. |
| Sustainability | **6.2** | `SECURITY.md`, measured cost per trade, kill switch, runway tool, decisions log, MIT, CI. Minus: one VPS on an `sslip.io` host, manual funding, nothing on mainnet. |
| **Mean** | **7.42** | |

| Track | Fit | Adjusted | Gap that costs the most |
| --- | ---: | ---: | --- |
| Games (primary) | 0.82 | **7.62** | No social or e-mail login (wallet sign-in and guest play only); NEP-245 items exist with supply 0 |
| NFTs | 0.58 | **7.02** | Shards 3 (coordinator-minted), skins 0; the NFT-owns-NFT dragons (6) are the strongest NFT evidence |

## What would move the score tonight (points per hour)

| # | Fix | Owner of the fix | State |
| --- | --- | --- | --- |
| 1 | Final count of 13 Nov from the indexer, README live block and proof file | this branch | after 00:00 UTC |
| 2 | README numbers from tonight's run (STATS, trades, guests, chests, dragons), the 1,082 failures stated plainly | this branch | this branch |
| 3 | Real recent tx links per player action (guest mint, chest opening, dragon mint) | this branch | this branch |
| 4 | Player moves on chain: a pledge, a gate payment, an item sale | gameplay + the Town works window (`wip/defi-pass`) | pledges and goals in the window; the chain moves come from players |
| 5 | Turn on `damageNumbers` and `loadRitual` (see the flags below) | lead | proposed |
| 6 | The jury video and the X post | owner | drafts in this folder |

## Flags that are off on the live page (`game/public/features.json`)

New work ships with its flag on (owner, 14 Nov); a flag is only an off switch.

| Flag | Ready to turn on? | Why |
| --- | --- | --- |
| `damageNumbers` | **Yes**, after the lead's boot check | Wired in `boot-world.js` and `play/mobs.js`, pooled DOM (24 elements), `tests/client/float-numbers.test.mjs`; worker 3 polishes it tonight |
| `loadRitual` | **Yes**, after the lead's boot check | Wired in `main.js` (loading screen only), `tests/client/load-ritual.test.mjs` |
| `glassShoal` | Owner's call | Built and tested; placeholder models are being replaced tonight (Fable A/B) |
| `loomMeter`, `presenceChip`, `tuneOverlay`, `statusBanner`, `register` | No | Defined in `src/features.js`, but nothing in the game reads them: turning them on changes nothing |

The Town works goals and share (`wip/defi-pass`) have no flag: they are part of the window.
