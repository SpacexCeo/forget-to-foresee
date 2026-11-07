# Forget to Foresee — decision log and context

This file carries context between machines and sessions. New session: read it in full, then `docs/spec.md`, `docs/hackathon-rules.md` and `README.md`.
Last updated: 07.11.2026.

## 1. Hackathon
- NEAR Hackathon, 1–14 November 2026. **Submission deadline: 15.11.2026 01:59 Kyiv.** Rules and checklist: `docs/hackathon-rules.md`.
- Team: RAEN Computers. RAEN's core product is an NFT agent with its own wallet (an "NFT computer with an agent").
- Candidate tracks: **games**, **nfts**, possibly social.
- Competitor snapshot (7.11): 229 submissions in the catalog; nfts — 13 tags, games — 10, social — 10.
  - NFT containers (the NFT owns a wallet or business): Deed, Logen, Torch, Outlive, Handover, Zinc, OneUp.
  - AI traders in an economy: Nims, Nearverse, DiveMarket, Maven and **Bazaar Sovereign** (AI merchants are NFTs with wallets and remember relationships; the closest competitor).
  - Bluffing and contests: Agent Undercover, Overclock, DUEL.
  - "Social" in the catalog is mostly shared money: Roomy, Petty Cash.
- Takeaway: "an NFT with a wallet and memory" is not a differentiator by itself. We need our own game mechanic.

## 2. Concept
**Forget to Foresee** (earlier working titles: "RAEN: Twelve", "Arrival").

Shells have appeared over a world of agents; the Guests speak in round signs (logograms). Six clans are NFT agents with a wallet and memory. The player guides the agent **Iris** (Ирис). The Guests' message can only be assembled from the fragments of all six clans. At the end there is a vote: is it a gift or a weapon?

Inspired by *Arrival* (2016): non-linear time, language changes thinking, a message in parts. **No names, characters or visuals from the film.**

### Signature mechanic — "The Price of Memory" (proposed by Fable)
To see the future, the agent **forgets a memory forever**. The human chooses what to forget. The forgotten memory becomes a shard NFT and goes to auction; the buyer "remembers" it instead of you.
- Forget a betrayal: the agent trusts the betrayer again (repairs a broken link, but can be fooled again).
- Forget a debt: the debt disappears; the claim passes to the shard's buyer.
- Forget a promise: freedom, but the one you promised can buy the shard and find out.
- Forget the "First Word" (the owner's Key): the agent obeys worse (2 actions instead of 3), and the buyer speaks the owner's secret phrase in the finale.
- Pitch: "An NFT that pays for prophecy with its own biography."

### Other mechanics (in the prototype; full rules in `docs/rules-baseline.md`)
- **Language.** A sign is a ring of 4 slots: Place (Shell I–IV), Action (Gift/Storm/Silence/Call), Power (10/20/40/80), Delay (+1…+4 ticks). Four stroke forms: arc, spike, loop, drop. Permutations come from the seed. Dots in the core set where reading starts (0 = top, clockwise): the player's "aha" moment. The agent learns from the chronicle (sign + what happened); the player sets the reading rule and pays to ask the Guests.
- **Anchors.** 10 silk on (Shell, tick). A Gift is shared by those who anchored, earlier anchors get a larger share. A Storm burns the stake. A Call gives a new memory.
- **Commit-reveal.** The season's events are generated before play and a Merkle root is published; every reveal is checked against it. The Guests' language is deterministic code, not an LLM (otherwise it looks fake).
- **Fragments.** Each clan holds a fragment with a hidden personal prize V. Contribute to the Scroll for a share of the gift, or hold until tick tV for the prize, after which the fragment goes dark. The key sign (double ring) decides gift or weapon.
- **World tension.** Deceit and broken links raise it; at 100 the Shells leave and everyone loses.
- **Crisis at tick 13.** Пепел (Ash) reads the sign as "weapon" and breaks links. **Key:** Ash's secret phrase is committed from tick 1; an agent with a good dictionary sees it in a vision, speaks it, the hash matches, and Ash returns.
- **Finale.** Vote, then the agent's NFT card with its biography (what it remembers, what it forgot, who bought the forgotten). Choice: forget everything for an Heir, or keep the memory.
- AI clans: Соль/Salt (lies about words), Пепел/Ash (paranoid, crisis), Мох/Moss (honest), Янтарь/Amber (greedy, escrow), Иней/Frost (scholar, learns fastest).

## 3. Findings of the three independent agents (07.11)
- **Fable (game design):** proposed "The Price of Memory". The human is conscience and will (chooses what to forget); the agent is body and memory. A vision is only honest if you do nothing. Drop the wall-of-text "newspaper".
- **Systems designer:** numbers and rules (slot ring, questions like "bulls and cows", a prisoner's dilemma around a fragment with hidden V, a tension threshold, anti-degeneration rules). On-chain: NEP-171 NFTs, an agent sub-account with a FunctionCall key, commit-reveal, escrow.
- **Judge / red team:** average score about 6/10. Main risk: blending in with Bazaar Sovereign, so memory and the trust graph must not be the core. Core: a distributed message and verifiable predictions. Killer demo: the audience scans a QR code and assembles fragments; finale shows the vision verified on-chain. Too many terms for 3 minutes — simplify.
- Pitch line: "We handed the room a fragment each of an alien language — only together can you read it — and the future we are about to see was committed to the blockchain before you walked in."

## 4. User decisions
| Date | Decision |
|---|---|
| 07.11 | Build a **3D game**. Format **"World + Shell"**: an isometric island (6 clan camps, 4 floating Shells, walking agents, anchors on the ground) plus a scene inside a Shell (fog, glass, a Guest drawing a logogram). |
| 07.11 | Engine: **Three.js in the browser** (Vite). |
| 07.11 | Project folder **F:\Hackaton** (external KINGSTON drive, moved between a PC and a laptop). |
| 07.11 | Name: **Forget to Foresee**, repository `forget-to-foresee`. |
| 07.11 | Work on GitHub by the hackathon rules: public repo, MIT, small commits, tags `pre-hackathon` and `hackathon-submission`. |
| 07.11 | Public repository created: https://github.com/SpacexCeo/forget-to-foresee. |
| 07.11 | The drive is **not reformatted** (stays exFAT). Windows write caching disabled ("Quick removal"); repeat on the laptop. |
| 07.11 | Unified spec received (summary: `docs/spec.md`). **G0 granted** — start with R0. |
| 07.11 | Art: **there is an artist / Blender** — hero objects arrive as glTF and code loads them; until then a labeled greybox. Brief and asset manifest: `docs/art/`. |
| 07.11 | **Art direction: hybrid.** Silhouettes and large facets read from the isometric camera; materials stay detailed PBR for close inspection. |
| 07.11 | **Target concept (owner's favourite):** a floating archipelago above a sea of clouds — central round plaza with a gold-inlaid Scroll medallion, six camp plateaus on rock pillars linked by arched bridges (Salt crystal colonnade, Iris violet canopy, Frost glass pavilion, Ash dark pagoda roof, Moss overgrown dome, Amber warm pavilion), a stone balcony spawn, four iridescent nacre ammonite Shells that **levitate** (IV cracked open), a floating glyph above the plaza. This supersedes the brief's flat 70×70 m island layout. |
| 07.11 | Inside a Shell: a spiralling hall of nacre growth ribs, dark cracked stone floor with amber floor lights, a huge glass wall with three translucent Guests behind it (sail/fin membranes, nacre-crystal bodies; no Arrival heptapods). New assets on owner request: `guest.glb`, clan agent costumes `agent_<clan>.glb`, Shell-entry suit `agent_suit.glb`. |
| 07.11 | Camera: isometric 3/4 by default; zooming in lowers it to a close third-person view behind the character (never first person). |
| 07.11 | NEAR contract: **Rust + near-sdk** (Rust and cargo-near may be installed; consent given 07.11). The user creates the testnet account for deployment. |
| 07.11 | R0 answers: **CSPRNG salts + RNG compatibility**; **UI-only guards move into the engine**; **defects fixed in a separate commit** as rules v2. |
| 07.11 | **Strict rule: the repository and the game are English-only.** Russian only as the second UI language (spec requires RU/EN). Chat with the user stays Russian. |
| 07.11 | **3D client skeleton** built on branch `client/3d-skeleton`: Vite multi-page (game + dev asset review page), streaming asset system, labeled greyboxes, swept capsule at 30 Hz, isometric camera with sweep, F3 dev HUD. No game rules in the 3D client yet. |
| 07.11 | **Streaming contract (owner: load only what the player can see):** the build lists the `.glb` files present (`virtual:model-list`); on-screen assets within their kind's load distance load first (larger apparent size first), off-screen ones only within 14 m of the player; at most 2 downloads at once; an asset unwanted for 8 s falls back to its greybox and its template goes cold in a 512 MB LRU; eviction disposes GPU resources. `<name>_inspect` replaces the runtime mesh when the camera is within the asset's inspect distance; `*_col` meshes go to the physics world and are never rendered (if a file has no `_col`, the greybox colliders stay); `socket_*` empties carry code-drawn content (anchor pads: Shell number and tick, pad size from `pad_size_m`). |
| 07.11 | **Art direction hybrid:** low-poly faceted silhouettes with detailed PBR materials for close inspection; greyboxes follow it (faceted shapes, soft grey-green palette, haze). |
| 07.11 | **World layout = floating archipelago** (owner's third concept image; supersedes the brief's flat 70 m island with camps at r 13 and anchor zones at r 25): a plaza plateau (r 9) with the Scroll as a floor medallion and four anchor zones on its diagonals; six camp plateaus (r 6.5) on a 30 m ring on rock pillars, each joined to the plaza by a railed bridge, three neighbor links; a viewing balcony at 120° / 46 m where the player starts; four Shells levitate beyond the camps (r 50–54, 14–25 m up), hovering in code (bounded bob and sway, visual only), with mist below; sea of clouds at −28 m with height fog. Falling off respawns at the last safe point. Asset names unchanged (`island.glb` = rock + plaza + bridges + balcony). The brief's island section needs this update. |
| 07.11 | **Walk speed 1.7 m/s** so walks are 30–45 s (camp → neighbor camp via the plaza ≈ 37 s, balcony → plaza ≈ 29 s, plaza center → camp ≈ 19 s). |
| 07.11 | **Camera:** isometric 3/4 by default with yaw limited to ±50° around the +Z view; zoom runs from the high overview (90 m, 62° pitch) down to a low third-person view (4.5 m, 14° pitch, behind and above Iris); never first person; a sphere sweep keeps it out of geometry. E on a hero object enters an inspect orbit. UI overlays: objective label top-left, context prompt bottom-center. |
| 07.11 | UI shell (branch `ui/lobby-i18n`): **own ICU MessageFormat subset** instead of a dependency; locale files are JS modules (`src/locales/en.js`, `ru.js`). The engine stays untouched: an **adapter parses its Russian strings into `{key, args}`** with ID arguments; the engine-side migration is planned in `docs/i18n-migration.md` so the parity fixtures stay valid. |
| 07.11 | Hackathon onboarding = guest demo: **synthetic entitlement** (free, testnet, labeled) → tutorial → hologram → first contact; enforced by `src/ui/flow.js`. Weekly tournament = **local simulation** (schedule, idempotent enrollment, sealed results), no server yet. |
| 07.11 | Owner picked the target concept: a floating archipelago over a sea of clouds, four iridescent nacre ammonite Shells (IV cracked open), a gold-inlaid central plaza, six camp plateaus on rock pillars. The lobby background (canvas 2D) evokes it until the 3D client replaces it; the concept image is a reference only and is not shipped. |

## 5. Status
- `prototype-2d/index.html` — the full 2D loop, playable. UI is still Russian; it is the frozen parity reference.
- `game/` — Vite + Three.js.
  - **R0 done:** `docs/rules-baseline.md` (prototype rules with line references, discrepancies, answered questions).
  - **G1 done:** `src/game/engine.js` — headless engine, actions return `{ok, reason}`. Rule modes: `baseline-2d-1` (bit-exact with 2D), `v2` (default: CSPRNG commitments + fixes), `v2-crypto` (test only).
  - `npm test` — 75 tests green: 60 parity seasons, 8 edge cases, 7 v2 tests. `npm run fixtures` regenerates fixtures from the prototype.
  - **3D client skeleton** (branch `client/3d-skeleton`): `game/index.html` (archipelago greybox scene, camera, player, streaming, F3 HUD) and `game/review.html` (dev asset review). `npm test` now also runs 31 client tests (106 total). Not yet: the Shell interior scene, pathfinding for click-to-move, KTX2/Draco decoders, wiring the engine and i18n into the 3D UI.
  - UI shell (`src/ui/`, `src/locales/`): lobby, onboarding, settings, hologram constructor, tournament card (simulation), HUD with localized chronicle and subtitles; runs standalone at `/ui-preview.html`; integration lines for `main.js` in `docs/ui.md`. `npm test` — 108 tests.
  - `npm test` — 78 tests green: 60 parity seasons, 8 edge cases, 7 v2 tests, 3 simulation-harness tests. `npm run fixtures` regenerates fixtures from the prototype.
  - **Economy simulation done (07.11):** `game/scripts/sim/` (`npm run sim`, `--quick`), report `docs/math/economy-report.md`. Verdict: all six commercial-review findings reproduce; holding the fragment beats contributing by +11.5 silk (paired, 3000 seeds); every active honest strategy ends below a passive player; defecting is the silk-dominant trust strategy. Rules v2 unchanged; v3 proposals in the report.
  - 3D scenes and UI not started yet.
- Engine game strings (logs, memory texts, offers) are still Russian, as in the prototype. **Planned in the localization step:** events carry i18n keys + args, English is the base locale, Russian is the second; the prototype's UI text gets translated and fixtures regenerated at the same time so parity holds.
- GitHub: https://github.com/SpacexCeo/forget-to-foresee (public, branch main, tag pre-hackathon). Push after every commit.

## 6. Open questions
1. ~~Spec~~ — received 07.11, see `docs/spec.md`.
2. ~~GitHub repository~~ — created 07.11.
3. Is the game a separate submission or part of RAEN Computers (the user has another project, RAEN Computers with Guard)? If separate, it is the second project and both READMEs must link to each other.
4. **NEAR's role:** everything is simulated locally for now. Needed: an own testnet contract — commit-reveal of the event root, NEP-171 NFTs for agents/fragments/shards, escrow.
5. Audience mode (QR fragments): in the MVP or not.

## 7. Environment notes
- exFAT does not store file owners, so git reports "dubious ownership". Either run `git config --global --add safe.directory F:/Hackaton` once per machine, or run every command as `git -c safe.directory=F:/Hackaton ...`.
- The drive letter may differ on the laptop — pin it to F: in Disk Management.
- `node_modules` is not committed: after moving run `cd game && npm install`.
- On the main PC npm could not write logs to its default cache; the `--cache` and `--logs-dir` flags pointing to a temp folder help.
| 07.11 | **Art workflow:** GitHub is the single source of truth (commit + push after every step). The rented RTX 5090 (Clore) is compute only (Blender bake/renders); results are pulled into git right away. SSH to it uses a dedicated key, never a password in chat. |
| 07.11 | Anchor work continues on branch **`art/anchor-first`** cut from current `main`; the art files from `claude/adoring-darwin-r9mu72` (script, blockout, handoff) were carried over, because that branch predates rules v2 and the docs translation. |
| 07.11 | Owner: use the GPU fully and make the objects highly detailed (multi-million-triangle masters, supersampled GPU bakes, high-sample QA renders). |
| 07.11 | **Minimum spec: RTX 2060 Super or better.** Asset budgets are set for quality: **all triangle budgets in the brief are doubled** (hero runtime ≤16k, `_inspect` ≤60k, Shell exterior ≤30k, interior ≤160k, camp ≤24k, island ≤120k); hero textures up to 4096². Load spikes are handled by streaming: the client loads only what the player can currently see (engine requirement for the 3D client). |
| 07.11 | Assets: every asset is made from scratch (procedural Blender sources in `art/`) or taken from a verified free licence (e.g. CC0) and reworked; each source and licence goes into `docs/art/manifest.md`. |
