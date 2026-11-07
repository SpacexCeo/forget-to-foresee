# Forget to Foresee — spec (working summary)

Source: the owner's unified spec of 07.11.2026 (12 sections + appendices A–G). The full text is kept by the owner. This file holds the binding requirements, boundaries and gates for the implementer.
Status tags: **[C]** confirmed by the author · **[A]** author's version / proposal · **[?]** needs clarification.

## 0. Frame
- [C] Name Forget to Foresee; inspired by *Arrival* (no copying of its logograms, characters, objects, music or scenes); Three.js; "World + Shell" format.
- [C] The mechanics in the decision log are "the author's version, rules not confirmed". Reference: `prototype-2d/index.html`. Do not invent 12 slots: a logogram has exactly 4 slots.
- Work starts only after an explicit OK from the owner (gate G0 — granted 07.11). Real payments, mainnet and contract deployment only with separate permission.
- Working target: code freeze 13.11 20:00 (Kyiv); 14.11 is buffer and submission. Deadline 15.11 01:59.

## 1. Entry and onboarding
- [C] A lobby with a high-quality animated background (reduced motion → a still frame; animation never blocks input).
- [C] Order for the future paid mode: lobby → paid account check (server-side entitlement) → NEAR wallet (challenge + signature, NEP-413) → **tutorial** → **customization** → first contact with the world. Tutorial and customization never swap.
- In the hackathon slice: **guest/testnet demo** — a free synthetic entitlement, the wallet only for a voluntary testnet action, no real money, clearly labeled.
- [A] Timing of the first 20 minutes; tutorial example "Shell II / Gift / 20 / +2".

## 2. Mechanics (carried over from the prototype unchanged)
- Season, language (4 slots, 4 stroke forms, core dots set the reading start), anchors (10 silk), memory and shards, fragments with hidden V/tV, tension (100 = the Shells leave), the tick-13 crisis and Ash's Key, the double ring, vote, biography, Heir.
- Transport safety: idempotent actionId, expectedVersion, explicit rejection reasons, no partial state changes.
- **R0:** extract every constant, action, RNG use and event order into `docs/rules-baseline.md` with function references; reconcile log ↔ code ↔ spec with the author. *(done)*
- **Parity:** a pure `engine.js` without DOM/Three/network/LLM; clock and RNG passed explicitly. Fixtures: ≥20 seeds × 3 traces (cooperation, holding, breaks) + all memory types, ticks 12→13→14, tension 99→100, tie, finales, empty resource, repeated command. Same seed + intents → same normalized state in 2D and headless. A divergence blocks 3D. *(done)*
- Port in JS without changing rules at the same time; new modules and contracts in TypeScript.
- `S.fx` is an adapter for semantic visual events; camera, skip and FPS never change state.

## 3. Agents, holograms, lines
- [C] Every mechanical agent event is shown in the world: hologram + gesture/movement of information + VFX/SFX + a short localized line (speakerId, i18n key, args). The raw log is for developers only.
- Staging table: arrival, passing knowledge, asking the Guests, anchor, Gift/Storm/Call, trust, deceit/break, debt/escrow, fragment into the Scroll, rejection.
- Important tells have at least two forms (silhouette/stroke + text/sound). Reduced motion, no flashes, subtitles, contrast, color independence.
- Partial knowledge: NPCs only know what they observed. The LLM never computes outcomes.

## 4. NFTs and economy
- Hackathon: free guest demo; testnet — verifiable commitments and (if it passes its gate) demo NFTs. No real stakes, paid entry, money auctions or prizes.
- Silk, V and the gift share are closed in-game resources, not NEAR.
- [C] Future paid mode: 1 NEAR base access, 2 NEAR — the same access + cosmetics. Equal mechanics. Only after the beta gate.
- Minting is voluntary and carries no private data. Forbidden: pay-to-win, loot boxes, cash rewards, staking/yield, a token, selling trust.

## 5. Visual quality
- [C] A rich world, detailed objects and interiors **with ceilings and collision**; every inspectable object is individually crafted and holds up to close inspection.
- Diorama island: 6 camps around the Scroll, 4 Shells over the anchor zones, 30–45 s walks between points.
- Inside a Shell: a finished closed volume (floor, walls, vault); fog never hides missing geometry.
- Camera MUST: isometric 3/4 with limited rotation and zoom; WASD or click-to-move, E/tap for context; keyboard for every decision. No first-person.
- Collision: kinematic capsule, swept movement, 30 Hz, no tunneling at low FPS; camera sweep without clipping.
- Slice scope: 3 hero objects (anchor, Scroll table, shard), 6 agents, 4 Shells + 1 interior, 6 camps, the island. Anything that fails art QA is labeled greybox.

## 6. Rare VFX events
Memory burn (8 s), vision (10 s), crisis 13 (12 s), double ring (9 s), collective finale (12 s), the Shells leaving (10 s). Low tier, reduced motion; skip never skips a rule or a consent.

## 7. Weekly tournaments
- [C] Every week a tournament event **in the same world on the same engine**. The full production platform comes after its gates.
- Slice MUST: tournament card in the lobby → synthetic enrollment → accelerated server-clock fixture → one season → safe results table → non-monetary trophy. Labeled as a simulation. Tests: duplicate enrollment, coordinator restart, no reveal before the barrier.

## 8. Hologram constructor
- [C] An agent is assembled "from something" and processed by filters; the player adjusts color and other parameters.
- Recipe: shape, components, particles, layers (whitelist), palette, noise, light, trails, gesture → canonical recipeHash. Preview, randomize, reset, save, low-tier profile. Cosmetics never affect mechanics.

## 9. Localization
- [C] Every line is localized. MUST: English (base) and Russian; switching language without a new season; no raw keys.
- Events store meaning and IDs; the client renders via ICU placeholders. Proof bytes and secret phrases are never translated.

## 10. Infrastructure
- [C] 3 servers and 3 GPUs exist; their specs [?] are unknown. No CCU claims without an inventory.
- Three.js renders on the player's device; the server is a CPU job (rooms, persistence). The LLM runs via API with a template fallback, never on the critical path.
- Perf targets (desktop/mobile): 60/30 FPS, ≤120/65 draw calls, ≤500k/180k triangles, initial load ≤10/6 MB.

## 11. Storyboard
16 text keyframes (lobby → access → tutorial hologram → four sectors → constructor → first island → characters → inside a Shell → inspection → passing evidence → price of memory → vision/proof → crisis → double ring → weekly event → finale). Palette: cold grey-green surfaces, charcoal masses, light fog, warm amber for human decisions.

## Appendices (key points)

### A. Architecture
2D baseline + parity fixtures → pure deterministic engine → authoritative room + event log → Three.js + S.fx + i18n → Merkle + testnet verifier → full season.
Logical folders: `game/src/game/` (engine, crypto), `game/src/shared/` (TS schemas), `game/src/render/`, `game/src/scenes/`, `game/src/ui/` + `locales/`, `server/` (rooms, tournaments, persistence, near), `contracts/`, `tests/fixtures/`. A local guest mode may run the engine in the browser, labeled "local demo".

### B. Data and API
Entities: Session, Room/Snapshot (per-viewer projection; secrets never go to everyone), Memory, Relationship, Anchor, Fragment, Shard, DomainEvent, Commitment/Reveal, Order/Entitlement, Tournament/Enrollment/Result. WS `room.command` {actionId, expectedVersion, type, args}; resume by lastSeq. Transport 10 Hz ≠ story tick.

### C. Verifiability
- The schedule root is fixed before the first action. Leaf = domain tag + schemaVersion + seasonId + index + canonicalEvent + a ≥32-byte CSPRNG salt. Test vectors and negative tests (tampered event/salt/path/season is rejected). *(v2 rules implement this; schemaVersion is the `v2` tag)*
- Say "verified on-chain" only if the testnet contract actually checks the proof. Root on-chain + browser verification is called exactly that.
- Ash's secret phrase has its own salted commitment. A vision separates eventRoot (fixed) from the contingent branch (assuming inaction).
- Wallet: challenge with nonce, NEP-413, never a seed phrase. The LLM never sees keys. NFTs (NEP-171/177) are optional, after testnet tests.

### D. Security and AI
The client never changes silk/memory directly; idempotency; no leak of V/phrases/future in the bundle or API; prompt injection — the LLM has no tools/RPC/wallet, JSON-schema intents only. No LLM for the language, outcomes or proofs; MUST — deterministic clan policies and templates, 3 s timeout → template.

### E. Week scope
- **MUST:** engine parity; full season Iris + 5 NPCs; island + Shell interior; 4-slot logogram; anchors; price of memory; shards; fragments; crisis 13; finales; S.fx; EN/RU; template AI; local proof verifier; at least one reproducible **testnet commitment/reveal**; guest/demo onboarding; designed weekly tournament + a minimal labeled event; approved hero scope with inspection QA.
- **SHOULD:** a shared room with 2–4 helpers via QR; proof verification by the contract; a voluntary testnet NFT of the final card; reconnect; more accessibility.
- **LATER:** 6 human clans, production NFTs/escrow, gallery, new seasons, voice-over, paid onboarding.
- **Cut:** photorealism, open world, combat, live voice AI, own token, mainnet auctions, real prizes, MMO.
- **Cut rule:** if there is no full season without blockers by the end of D2 — disable helpers, NFT mint, LLM, complex fog; keep the island, Shell, 4 sectors, memory, proof, outcomes. If testnet is unavailable — product and video are labeled "local cryptographic demo".
- Roadmap: D0 (7.11) baseline + fixtures + skeleton; D1 parity + renderer; D2–3 full greybox season, testnet root; D4 staging, first hero, tournament fixture; D5 QA; D6 (13.11) freeze 20:00; D7 buffer.

### F. Ownership
One owner per folder/contract; engine.js and crypto.js only by their owners. Critical path P0 → P1 → P3 → P7, art (P10) in parallel. Network helpers, NFTs and the LLM never block the solo season.

### G. Acceptance (selection)
2D ↔ headless parity; a repeated command never doubles a cost; cancel before a memory burn; no secret leaks over the network; the verifier rejects tampering; vision vs intervention labeled; crisis 12→13 by baseline; language switch mid-season; full season without LLM; skip/quality tier never change state; a helper leaving causes no softlock; wallet without signature ≠ identity; weekly job idempotent on restart; interior without holes or falling through at 10–15 FPS; recipe stable after save→reload→low→reset.
Gates: G0 owner OK → G1 headless parity + solo loop → G2 testnet slice → G3 social/weekly beta → G4 real money/NFT.
