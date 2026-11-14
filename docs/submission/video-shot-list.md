# Jury video: shot list (60–90 s, the live testnet economy first, 14 Nov)

Replaces the 75 s demo cut of 08.11 (it captioned the season contract as "not yet deployed" and called the clans'
silk "wallets") and puts the strongest live evidence first, as the jury reviews of 12 and 13 Nov asked. The older
storyboard `jury-video.md` (season and shards only) stays as the source of the motion-graphics pages it lists.

Rules: real time in the game (cuts, no speed ramps); every number on screen is read on the day of the render from the
source in the last column; nothing the README calls built-but-off or not built is shown as live (the Glass Shoal is
off on the live page, items have supply 0, nobody has paid the Gate on chain yet); never "invest", "APY", "profit",
"returns" or "AI" for the scripted traders. Captions in English, at most 3 words a second, outside the bottom 12%.
The game's own music and sounds; no voice-over.

| # | Time | Picture | Caption | Source to re-read before rendering |
| --- | --- | --- | --- | --- |
| 1 | 0–4 s | The hill town at dusk from above the market; the camera falls toward the stalls as a trade ticker line slides in at the top | "A town that trades on NEAR. Nobody presses a button." | — |
| 2 | 4–12 s | The market ticker and the Town Ledger (game menu → Town): trader rows with their own `trader-NN.ftf-town.testnet` accounts; one trade opens: buyer, seller, item, the price's reason ("cheap: few buyers"), the tx link | "20 merchants. Each one a NEAR account with its own key." / "Every price has a reason." | `/api/market/stats` `recent[]`; the Ledger in the game |
| 3 | 12–18 s | Screen capture: the tx link opened on testnet.nearblocks.io (signer `trader-NN`, method `trade`, success) | "Every trade is a real testnet transaction." | the hash from shot 2 |
| 4 | 18–24 s | Town Pulse (`pulse.html`) counting live; then the day total in large type | "21,233 trades on 13 Nov." | `docs/proof/tx-2026-11-13.md` (recount: `node tools/count/count.mjs --day 2026-11-13`) |
| 5 | 24–30 s | `economy-lab.html`: a week of the market in one minute, prices rising and falling with stock | "A week of the economy in a minute." | `node tools/town/fast-week.mjs` |
| 6 | 30–38 s | The player: Iris arrives, the elder, the starter guide; no wallet prompt; the Day 1 mint card | "You play as a guest. No wallet, no gas." / "Take the free mint: your own account owns your heroine." | `guests.ftf-coordinator.testnet` `stats` |
| 7 | 38–46 s | Combat outside the walls (strike, dash, Q / V), a chest drops and opens with its rarity | "Chests roll from a deck sealed on chain." | `chests.ftf-coordinator.testnet`, `node tools/verify-chest/verify.mjs` |
| 8 | 46–52 s | Profile → NFTs: the dragon card, "owned by elise-…heroine.ftf-coordinator.testnet" | "An NFT that owns an NFT." | `companions.ftf-coordinator.testnet` (`nft_tokens`) |
| 9 | 52–62 s | The Tournament altar, trial 1 of 17; **V**: Signs & Visions, Resolved, "Verified ✓"; **M**: forget a memory for a vision, the shard card | "Every prophecy is sealed before the first move." / "Pay with a memory. It becomes a shard." | `ftf-seasons.testnet` `get_season`, `ftf-shards.testnet` |
| 10 | 62–70 s | The Town works window: pledges as deeds, "your share today", the goals strip | "Pledge silk to the town works. Your share, shown live." | the window on the live page (only if `wip/defi-pass` is merged and live) |
| 11 | 70–78 s | Townsfolk line from NEAR AI Cloud; the small "checked in TEE" mark | "Townsfolk speak through NEAR AI Cloud, checked in a TEE." | `/api/health` `tee` |
| 12 | 78–86 s | End card: FORGET TO FORESEE · spacexceo.github.io/forget-to-foresee · Built at NEAR HACKATHON · @Lambada_eth · "Testnet. Free to play. No real value." | "What would you forget to see the future?" | — |

Live since the night of 14 Nov, for the 90 s cut or to swap in (each is on the live page, no flag to set):

| # | Picture | Caption |
| --- | --- | --- |
| 7a | A Frost Lance hit throws ice shards, a Storm Snare flickers violet, damage numbers float up | "Every blow has its element." |
| 9a | "Return to town" on the Biography, then the loot card in town: new level, the shard NFT, chests | "Back from a season, you see what you brought home." |
| 9b | Inside a shop with its baked light; through the curtain into the hidden grotto behind the Shard Exchange | "Walk into the shops. One hides a grotto." |
| 9c | The Scribe with a gold "!" ("The Ink That Remembers"), or the Wayfarer from Kallima on the main street | "Small stories, told by the townsfolk." |

Cut to 60 s: drop shots 5, 10 and 11 (and trim 9 to 6 s).

Export: H.264 High, 1080p60, ≤ 90 MB, captions as SRT and burned in; a 9:16 version for phones crops shots 2, 4 and 8
to the panel. Render path: `tools/capture/` (virtual clock, frozen quality governor) for the in-game shots; screen
recordings for the explorer and `pulse.html`.
