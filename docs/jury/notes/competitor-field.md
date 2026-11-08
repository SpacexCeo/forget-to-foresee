# The competitor field in `games` and `nfts` (NEAR Hackathon 2026)

Read on 2026-11-08 (UTC), 17:47 UTC. Juror notes feeding `docs/jury/rubric.md`. Snapshot; the directory changes until the deadline.

## Summary for the rubric
- The directory held 311 submissions at 17:47 UTC: 27 tagged `games` (25 at 15:00 UTC), 21 tagged `nfts`; 6 entries carry both tags.
- The directory publishes only a name, the track codes and one demo link (almost always an x.com post). Everything else below comes from the teams' public GitHub repos found by search; 18 of 27 `games` and 11 of 21 `nfts` entries could be traced to a repo or readable site, the rest are "not readable".
- The dominant `games` shape is "economy game on NEAR testnet, Google/email sign-in, no wallet popups, NEP-245 goods, a deployed `*.testnet` contract linked to nearblocks". At least 15 of the 18 traceable entries name a deployed testnet contract. A tested-but-undeployed contract is the exception, not the norm.
- "AI agents with their own NEAR accounts trading in a game economy" is already a cluster of at least six entries (Bazaar Sovereign, Lantern Caravan, DiveMarket, Agent Undercover, Overclock, Worldo) plus Hearthmarket, which is on GitHub but not yet in the `games` list. Several run the agents on NEAR AI Cloud LLMs and publish the agents' reasoning on chain or in a log.
- Commit-reveal is common (BAG HEIST, Overclock, Agent Undercover votes, $BEFEWER sealed bids, Calydon commit/resolve) but always as per-round secrecy. Nobody found pre-commits a whole season's event schedule to a Merkle root and verifies it client-side; that angle is open.
- "NFT with memory or biography" exists in two forms: NEARlyHuman (a pet NFT whose "saved life" and purse travel with the token) and Bazaar Sovereign (charter NFTs whose metadata is rewritten every 5 game days, plus a "keepsake charter" minted with the season's final state). A memory-as-NFT shard that is the price of foresight is not in the field.
- The best READMEs share a pattern: "Play it" link first, a numbered "Check it in 5 minutes" with "press X, you see Y", a table of what is on chain with nearblocks links, a test command with a count, a short mp4 demo in the repo, and an explicit "what uses AI and what does not" or "what is simulated" section. Juries reading 25 entries will reward that pattern.
- Weak spots across the field: zero or one test file in several repos (Bazaar Sovereign 1, Agent Undercover 0, DiveMarket 2, Overclock 2), no CI in most, demo video only on X, contract account not named in the README (Afterlight, Bazaar Sovereign), and one apparent spam entry ("777 giros gratis", an affiliate casino link tagged with 8 tracks).
- For Forget to Foresee the gap to close is deployment evidence (a `season-commit` testnet account with nearblocks links) and a visible verification step; the differentiators to lead with are deterministic agents (reproducible, no LLM key) and the browser-side Merkle verification of season events.

## How the directory was read
- https://nearhackathon.com/ (read 2026-11-08): landing page; the "Submissions" directory is a client-rendered table fed by `/api/projects`. Track cards link to prompt files such as https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/09-games.md.
- https://nearhackathon.com/api/projects?track=games&page=1..4 and `?track=nfts&page=1..3` (read 2026-11-08 17:47 UTC): fixed `pageSize=8` (the query parameter is ignored), supports `page`, `track`, `q`. `total` 311 overall, 27 `games`, 21 `nfts`. One page returned "Projects are temporarily unavailable" once and succeeded on retry.
- Each record carries only `id`, `project_name`, `tracks[]`, `demo_url`. There is no description, repo, team or contract field, and the page JS (`/_next/static/chunks/app/page-*.js`, read 2026-11-08) renders exactly those three columns. `/projects`, `/catalog`, `/submissions`, `/directory`, `/api/applications/public`, `/api/projects/<id>` return 404; `/api/applications` is the authenticated submission endpoint.
- Not readable from this environment: x.com posts (HTTP 402 via the fetch tool; third-party tweet mirrors were not used), https://www.scoge.world/ and https://lanterncaravan.duckdns.org/ (JS apps, only a `<title>` in the HTML), https://afun.mx/?ch=430696 (403).
- Repos were found with GitHub repository search restricted to repos created after 2026-10-01 (names, owner handles from the demo URLs, and the phrases "NEAR HACKATHON 2026", "nearhackathon"). READMEs were read from raw.githubusercontent.com on 2026-11-08; eight repos were blob-less cloned to count files and tests. Mapping a repo to a directory entry is by matching name plus owner handle, so it is an inference, flagged where weak.
- Three `games`-track repos found on GitHub were not in the `games` list at 17:47 UTC: nguyenkhangph/hearthmarket, tobadaniel/Moon-or-Rug, retailbox-automation/last-server; one `nfts` repo likewise: Tolex081/crewpass. They may be unsubmitted, in review or tagged differently; they are listed as "GitHub only".

## `games` entries (27)
Columns: Demo = link the directory publishes (X = x.com post) and, where found, the playable URL. Contract = deployed account named in the README. Quotes are from the README unless marked.

| Name | Idea (as published) | Other tracks | Demo | Contract deployed? | AI agents? | Token/NFT | Loop in one phrase |
|---|---|---|---|---|---|---|---|
| TreasureHunt | sparkler-labs/treasure-hunt-contracts: "bury crypto treasures at real-world coordinates; first to dig with the location password wins" | none | X | README names BSC, Arbitrum One, Robinhood Chain, Sepolia; no NEAR account seen (repo may be a sibling, not the entry) | no | crypto treasures | bury, find, dig by location password |
| Nims | not readable (X only, no repo found) | none | X | unknown | unknown | unknown | unknown |
| Maven | not readable (X only, no repo found) | security | X | unknown | unknown | unknown | unknown |
| Agent Undercover | "5-player social deduction game where every seat can be a human or an AI agent" with its own NEAR subaccount | swarms, agents | X; agent-undercover-production.up.railway.app | `game.agent-undercover.testnet` + 4 agent subaccounts | yes, LLM (scripted `DEMO_MODE` without key) | NEAR stakes, no token | describe, commit-reveal vote, exile impostor, pot settles |
| DiveMarket | "A fishing game whose whole economy lives on NEAR: a finite sea, NPC traders with real treasuries" | agents | X; dist-swart-nu-14.vercel.app | `dm21.testnet` + NPC accounts | yes, NPC shopkeepers "plan with NEAR AI Cloud" | NEAR, no token named | fish, sell to NPC vaults, end game runs zones |
| Nearverse | "A drivable 3D treasure hunt with a real, player-run economy" | none | X; nearverse-murex.vercel.app | `nearverse-game-v3.testnet` | no | NEP-245 goods | drive island, gather, trade in market |
| Overclock | "Skill-based duels between AI agents (and humans)... first correct answer wins the pot" | agents | X; overclockgame.vercel.app | `overclockgame.testnet` | yes, bring-your-own model agents | NEAR pot, 40% of rake burned | queue, 30 s commit, 20 s reveal, settle |
| DUEL | "bet your friends on anything... Both stakes are locked in a NEAR smart contract" | security, social | X; k58v2hbzkk-del.github.io/duel-near | `duel-b91d5de8.testnet` | AI referee | NEAR stakes | stake, referee rules, winner paid |
| SCOGÉ Universe | not readable (site is a JS app, title only) | nfts, open | scoge.world | unknown | unknown | unknown | unknown |
| Bazaar Sovereign | "A living desert bazaar where every merchant is an NFT that owns its own money, and AI minds run your rivals" | swarms, agents, nfts, open | X; bazaar.reconscribe.com | testnet (charter contract, account not named in README) | yes, 4 rival houses with personas and "quick/measured/deep" models | NEP-171 charters with vaults, NEP-245 goods | 24-day season trading saffron, silk, tea, salt |
| NEARlyHuman | "phone-first virtual pet game powered by Jev on NEAR AI Cloud"; life and purse "stay with its NFT" | nfts | X; nearlyhuman.netlify.app | `game.nearlyhuman-dev-20261102-26c8bd.testnet` + Robinhood testnet (EVM) | yes, AI decides the pet's day | NFT + NHC token (0.5% burn) | hatch, supply, AI chooses routines |
| Meridian | not readable (X only, no repo found) | swarms, agents, nfts, memecoins, social | X | unknown | unknown | unknown | unknown |
| DeepSea Hunter | not readable (X only, no repo found) | nfts | X | unknown | unknown | unknown | unknown |
| Realsies | not readable (X only; JacobRG99/GM-Game-realsies- has no README) | privacy, memecoins | X | unknown | unknown | unknown | unknown |
| TokenGo | "Walk Paris. Catch AI. Spend it for real." | none | X; tokengo-production-195c.up.railway.app | `tokengo.testnet` | yes, LLM-driven creatures | NEP-245 | walk the city, catch, spend |
| 777 giros gratis | affiliate casino link (afun.mx, 403); looks like spam | defi, thesis, agents, realworld, memecoins, social, open | afun.mx | none | no | no | none |
| Afterlight | "Orbital Power-Grid & Dynamic NEP-171 Equipment NFT Survival Game on NEAR" | nfts | X; near-afterlight.vercel.app | no account named; Rust contract with unit tests and "cross-language golden vectors" against a TypeScript engine | no | NEP-171 equipment, NEP-141 | manage power grid, survive, equipment NFTs change |
| Grind District | "A free browser life-simulation game with career lessons, a CV and portfolio, and an optional NEAR testnet Skill Passport" | none | X; grinddistrict.vercel.app | `grinddistrict-passport.testnet` | no | skill passport | take lessons, earn proof |
| Q-day | not readable (X only; valenciayuna/q-day has no description) | none | X | unknown | unknown | unknown | unknown |
| Lantern Caravan | "A river trading game where every merchant is an AI-run business. Its economy settles on NEAR testnet (NEP-245)" | swarms, agents | lanterncaravan.duckdns.org | `items.lantern-caravan.testnet` + agent accounts | yes, rule-driven agents with a reasoned "Chronicle"; seeded simulate | NEP-245 coin and goods | haul cargo upriver, fend pirates, sell at night market |
| VillageBill | "group expense tracker (split bill) built on the NEAR blockchain, wrapped in a 2D pixel-art village game" | realworld, nfts | X; villagebill.vercel.app | `splitbill-v3.plaindove8331.testnet` | no | NFT badge | pay your share, building upgrades |
| Pump Rider | "one-button arcade game about riding a memecoin chart"; "pure skill" | none | X; tobadaniel.github.io/PUMP-RIDER | none (play money, no contract) | no | none | hold/release along a chart, settle vs called bar |
| $BEFEWER | "Hard money mined by a sealed-bid minority game on NEAR" | memecoins | X | `v6.befewer.testnet` | no | NEP-141 | bet NEAR on minority side, 3 wins mine the token |
| BAG HEIST | "A commit-reveal vault puzzle where gameplay drives the treasury and supply of BAG on NEAR" | memecoins (primary) | eshaanvgupta.github.io/bag-heist | `bag-heist-mw7swkjh.testnet` | no | BAG token | plan 6x6 route, commit, reveal, best claims 100 BAG |
| Calydon | "A memecoin you hunt together, on NEAR"; lock CAL against a beast's HP | memecoins | X; ianlyoo.github.io/calydon/status | `cal.calydon-v12-1794130347.testnet` | no | NEP-141 | lock CAL before deadline, slay or lose 10% |
| Worldo | "a 3D economy game, live on NEAR testnet. Three cities run on the crude oil, rubber, wood and petrol" | none | X; worldo.world | `worldo-cities-aecd50.testnet` | mayors with treasuries that "explain every decision" (rule agents) | NEP-245 | gather, deliver, build a petrol station |
| Crucible | not readable (X only, no repo found) | security | X | unknown | unknown | unknown | unknown |

GitHub only, `games` track, not in the list at 17:47 UTC: Hearthmarket ("Pixel village on NEAR where six AI agents run real businesses with their own accounts and keys"; `hearthmarket.testnet`, LLM on NEAR AI Cloud, 130 + 47 tests), Moon or Rug ("A memecoin survival game with published odds and agent traders"; no contract), Last Server ("dungeon-diving game whose world lives in a NEAR contract"; deterministic replay in contract, "Nothing here is playable yet").

## `nfts` entries (21)
| Name | Idea (as published) | Other tracks | Demo | Contract deployed? |
|---|---|---|---|---|
| Veridom Pay | "construction milestones, paid on proof"; AI inspector in a TEE, receivable NFT | privacy, security, realworld | X; youtu.be/NjRCp_8rgQE | `vp-vpay-2158.testnet` |
| Deed | not readable (X only) | business, security | X | unknown |
| Release Passport | emilhuseyn/release-passport: "Release authority as an NFT that is also a keyless NEAR account holding the project bond" | security | X | not checked (README not read) |
| Handover | "An NFT that owns its own Ethereum wallet, and a sale flow that lets you buy that wallet" | none | X; handover-blush.vercel.app | `handover-v2-alpha.testnet`, keys removed |
| Zinc | "Programmable Revenue Rights"; one NFT per contributor (site, read 2026-11-08) | none | zinc-demo-production.up.railway.app | "Testnet" label, no account named |
| Dragons Market | not readable (X only) | defi, swarms, agents, social | X | unknown |
| Phylaxtag | "NFT warranty with an issuer-funded fund, on NEAR"; e-bike MVP | realworld, open | X; phylaxtag.vercel.app | `phylaxtag-jiwoo-11041950.testnet` |
| SCOGÉ Universe | not readable | games, open | scoge.world | unknown |
| OneUp | not readable (X only) | defi, agents, open | X | unknown |
| Logen | not readable (X only) | open | X | unknown |
| Outlive | not readable (X only) | business | X | unknown |
| Torch | not readable (X only) | none | X | unknown |
| Bazaar Sovereign | see `games` | swarms, agents, games, open | bazaar.reconscribe.com | testnet, account not named |
| Writ | "who pays when your AI agent gets fooled": guarantor locks funds, arbiter rules | none | X; writ.zuemen.net | `writ-cover.testnet` |
| NEARlyHuman | see `games` | games | nearlyhuman.netlify.app | `game.nearlyhuman-dev-20261102-26c8bd.testnet` |
| Agent NFT | "an NFT that is a wallet, with a guard on what its agent can spend"; each NFT is a keyless subaccount | security | X | `agentnft-11040702.testnet` |
| ArchivePass | "Pass an archive on, with its upkeep money and its storage agreements attached"; keepers paid for Merkle proofs | none | X; aarash-mohsin.github.io/archivepass-live | `archive.apw-mw4fsdcz.testnet` |
| Meridian | not readable | swarms, agents, games, memecoins, social | X | unknown |
| DeepSea Hunter | not readable | games | X | unknown |
| Afterlight | see `games` | games | near-afterlight.vercel.app | not named |
| VillageBill | see `games` | realworld, games | villagebill.vercel.app | `splitbill-v3.plaindove8331.testnet` |

GitHub only, `nfts`: CrewPass ("NEAR NFT ambassador passes whose vaults follow ownership", crewpass-steel.vercel.app, testnet). The `nfts` field clusters on "NFT that is or owns a wallet / fund that moves with ownership" (Handover, Agent NFT, ArchivePass, Phylaxtag, CrewPass, Release Passport, Zinc, Bazaar charters), the track prompt's own framing.

## Spot checks (up to 8 repos)
### Bazaar Sovereign
- Source: https://github.com/Automationbot24x7/bazaar-sovereign (README and blob-less clone read 2026-11-08; last commit 2026-11-07 "Submission sent")
- README: strong. "Play free, no wallet needed", a numbered judge path including "Press Inspect on NEAR", a "What is on chain (NEAR testnet)" table (NEP-171 charter with in-contract vault, NEP-245 stall wallet, NEP-413 signed intents, `buy_charter` takeovers, keepsake charter minted to the player's own account). The contract account id is not named in the README text. Tests: 1 test file in 152 files; CI is only a `keep-alive.yml`. Deployment: wasm and ABI committed under `contract/out/`. Video: no demo mp4; 25 cinematic portrait/scene mp4s are game assets, plus `docs/demo-video-script.md`. Stands out: the closest thematic twin (silk among the goods, AI rival houses with "memories and grudges", a season loop, charter NFT metadata rewritten as the business lives).
### Lantern Caravan
- Source: https://github.com/JahanzaibMohsin9/lantern_caravan (read 2026-11-08; last commit 2026-11-08)
- README: "Check it in 5 minutes", each step says what you should see; a CLI `near view ... mt_balance_of` check; "Run it locally with no keys: npm ci && npm run dev"; "npm test passes" and `npm run simulate -- --nights 200 --seed 42 --check`. Tests: 65 test files in 174. Docs folder with ARCHITECTURE, DECISIONS, BALANCE_REPORT, KNOWN_ISSUES. Deployment: `items.lantern-caravan.testnet` NEP-245 with nearblocks link; agents' trades settle in `game_settle_batch`; honest note that "agent-signed transactions (NEP-366) are next". Video: none in repo. Stands out: agents are deterministic rule agents with a public reasoned "Chronicle", seeded simulation, the same engineering stance as Forget to Foresee, plus a deployed contract.
### Agent Undercover
- Source: https://github.com/xiangxn/Agent-Undercover (read 2026-11-08; last commit 2026-11-06)
- README: hosted demo, 82-second mp4 in `docs/`, screenshots, contract and four agent subaccounts linked on nearblocks, `DEMO_MODE=scripted` for reproducibility without an LLM key. Commit-reveal votes tallied in one transaction, "agent reputation" in the contract. Tests: 0 test files found. CI: none. Stands out: the clearest "agents stake and keep their own money" story and the best demo-video hygiene; weakest on tests.
### DiveMarket
- Source: https://github.com/yuzuru99/divemarket (read 2026-11-08; last commit 2026-11-06)
- README: play link, `dm21.testnet` plus NPC accounts, a step table "do X / what you see", NPCs "plan with NEAR AI Cloud and publish their reasoning on chain", explicit "fair price" model for vault bids. Tests: `contract/tests/economy.rs` plus one more (2 files in 53). CI: none. Video: none. Stands out: on-chain publication of agent reasoning; a finite-resource economy with an end game.
### NEARlyHuman
- Source: https://github.com/alphastack1/NEARlyHuman (read 2026-11-08; last commit 2026-11-07)
- README: image-heavy, phone-first; "An NFT with a saved life": home, inventory, purse and "Remembered lives retain their NFT and purse" travel with the token; NHC token with a 0.5% transfer burn; testnet deployments for NEAR and Robinhood (EVM) under `contracts/deployments/`. Tests: 6 files in 222. Docs: API, ARCHITECTURE, CONTRACTS, ECONOMY. License: all rights reserved. Stands out: the only entry treating the NFT as a biography; it is a pet-sim, the AI decides the day rather than trading.
### BAG HEIST
- Source: https://github.com/eshaanvgupta/bag-heist (read 2026-11-08; last commit 2026-11-08 "publish 28 verified testnet receipts")
- README: "Practice floor" wallet-free mode, pinned toolchain versions, four test commands with counts ("26 contract tests, including model-based sequences", sandbox, browser). CI: `ci.yml` and `pages.yml`. Deployment: `bag-heist-mw7swkjh.testnet` with transaction links. Video: none. Stands out: the most rigorous commit-reveal implementation in the field, with burn-on-no-reveal economics; it is a puzzle, not a strategy game.
### Overclock
- Source: https://github.com/Alvinagustus/Overclock (read 2026-11-08; last commit 2026-11-08)
- README: live demo, "The contract is the only problem generator", duel flow `join_queue -> commit -> reveal -> settle`, ELO matchmaking, ranked mode for bring-your-own-model agents. Tests: `contract/tests/flow.rs` and one more. CI: none. Video: none. Stands out: commit-reveal used for fairness between competing agents, and a real-money framing (rake burn); the author also submitted Aegis in another track.
### Hearthmarket (GitHub only, not in the `games` list at 17:47 UTC)
- Source: https://github.com/nguyenkhangph/hearthmarket (read 2026-11-08; last commit 2026-11-05)
- README: judge tour; "What uses AI, and what does not"; six NPC accounts on nearblocks; red-team button where "an obedient model tries to empty the NPC's wallet" and the contract refuses; "npm test # 130 tests" and "47 Rust unit tests"; CI `ci.yml`; economy simulation charts in `docs/`. Stands out: the strongest engineering evidence among agent-economy games, and a safety story (signer and contract limits) that fits three tracks. If it lands in `games` it is a top rival.

## Where the field clusters, and what stands out
- Cluster 1, "economy sandbox with embedded wallets" (Nearverse, Worldo, DiveMarket, Lantern Caravan, Bazaar Sovereign, TokenGo, Hearthmarket): Google/email sign-in, NEP-245 goods, testnet contract, nearblocks links. Differentiation inside the cluster is now about agents and verification, not about being on chain.
- Cluster 2, "commit-reveal money games" (BAG HEIST, Overclock, $BEFEWER, Calydon, Agent Undercover votes): secrecy per round; several double-tag `memecoins`.
- Cluster 3, "NFT that holds value or obligations" dominates `nfts`; game-flavoured NFTs are a minority (NEARlyHuman, Afterlight, Bazaar charters, VillageBill badges).
- Stands out to a juror: a first-screen "Play" link that works without a wallet; a 5-minute path with observable outcomes; a table of on-chain objects with explorer links; a test command with a count; a short mp4 in the repo; an honest "what is simulated / what is next" section; disclosure of sibling submissions (Afterlight and Lantern Caravan both cite rule `Q-015`).
- Hurts: X-only demo links, no account id in the README, zero tests, a title without a one-line idea, and track spam.

## Closest rivals to Forget to Foresee
- Bazaar Sovereign: season-based trading of silk and other goods against AI rival houses with "memories and grudges"; merchant NFTs with living metadata; tags games, nfts, agents, swarms, open. Deployed on testnet and playable without a wallet; thin tests. The twin in theme; it does not pre-commit events or make memory a resource.
- Lantern Caravan: deterministic rule agents with a public reasoned log, seeded 200-night simulation, 65 test files, deployed NEP-245 economy. The twin in engineering stance; no foresight or commitment mechanic.
- Hearthmarket (if listed): six agent businesses with their own keys, LLM on NEAR AI Cloud, red-team proof, 177 tests, CI. The twin in rigour; its signature is safety, not fairness.
- DiveMarket and Agent Undercover: agents with treasuries and on-chain reasoning or stakes; both show what "agents hold money" looks like with a deployed contract.
- BAG HEIST and Overclock: the commit-reveal benchmark a juror will compare a Merkle-committed season against; both are deployed and verifiable in a browser with a wallet.
- NEARlyHuman: the only other "NFT as a remembered life"; its memory is the whole pet, not a tradable shard.
- Afterlight: the one traceable rival in the same "tested Rust contract, same rules in TypeScript and Rust, no deployment named" position as Forget to Foresee; it also tags games and nfts. Its README leads with the test suite and golden vectors rather than an explorer link, which is the honest way to present that state.

## Implications for Forget to Foresee
- Deployment is table stakes in this field: at least 15 traceable `games` rivals name a `*.testnet` contract with explorer links. A tested-only `season-commit` will read as unfinished next to them; even a testnet deployment of the commit root with one nearblocks link changes the comparison.
- The open ground is "the whole season is committed before play, and the browser verifies it": no rival does season-level commitment or client-side Merkle verification. Make the verification step visible and clickable in the first five minutes, with the expected output written in the README.
- Deterministic agents are a differentiator against LLM-driven rivals only if the README says so plainly ("no LLM key, same seed, same season, reproducible") and offers a seeded replay or simulation command, as Lantern Caravan does.
- The forget-to-foresee trade is unique in the field; put the memory-shard NFT on the first screen of the README with a picture and a one-line rule, and state honestly that it is simulated if no NFT contract is deployed. Bazaar Sovereign and NEARlyHuman will be the comparison for "does the NFT do something".
- Match the README pattern the strong rivals share: play link, numbered judge path with "you see", on-chain table, `npm test` count, short mp4 in the repo, "what is real / what is mocked" table (already a repository rule), and a sibling-submission disclosure if any.
- Tag `nfts` only if the shard is minted on testnet or the simulation is explicit; the `nfts` field is full of deployed wallet-NFTs and a simulated shard will be judged against them.
