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
| 07.11 | NEAR contract: **Rust + near-sdk** (Rust and cargo-near may be installed; consent given 07.11). The user creates the testnet account for deployment. |
| 07.11 | R0 answers: **CSPRNG salts + RNG compatibility**; **UI-only guards move into the engine**; **defects fixed in a separate commit** as rules v2. |
| 07.11 | **Strict rule: the repository and the game are English-only.** Russian only as the second UI language (spec requires RU/EN). Chat with the user stays Russian. |
| 07.11 | NEAR contract `contracts/season-commit` (Rust, near-sdk 5.30, testnet only): coordinator commits the season's schedule root (immutable), anyone submits a leaf + salt + crypto.js path and the contract recomputes the v2 leaf byte for byte and verifies the path on-chain; Ash's phrase has its own salted commit-reveal. `leaf_count` is part of the commitment so a proof binds exactly one position; the Ash key commit closes once the first leaf is revealed. Storage is paid by the caller's attached deposit, the rest is refunded. Cross-implementation vectors come from the real engine (`npm run vectors`). |
| 07.11 | Contract tests: pure verification tests run everywhere (on Windows as wasm32-wasip1 under Node WASI, because near-sdk's mocked blockchain needs a C toolchain); mocked-blockchain and near-workspaces sandbox tests run on Linux in GitHub Actions (`.github/workflows/contracts.yml`); the NEAR sandbox has no Windows build. The owner deploys to testnet with one `cargo near deploy` command (contract README). |

## 5. Status
- `prototype-2d/index.html` — the full 2D loop, playable. UI is still Russian; it is the frozen parity reference.
- `game/` — Vite + Three.js.
  - **R0 done:** `docs/rules-baseline.md` (prototype rules with line references, discrepancies, answered questions).
  - **G1 done:** `src/game/engine.js` — headless engine, actions return `{ok, reason}`. Rule modes: `baseline-2d-1` (bit-exact with 2D), `v2` (default: CSPRNG commitments + fixes), `v2-crypto` (test only).
  - `npm test` — 75 tests green: 60 parity seasons, 8 edge cases, 7 v2 tests. `npm run fixtures` regenerates fixtures from the prototype.
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
