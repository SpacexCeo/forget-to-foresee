# Forget to Foresee — Hackathon Implementation Spec (TZ)

**Audience:** Claude (coding agent) working in [SpacexCeo/forget-to-foresee](https://github.com/SpacexCeo/forget-to-foresee).
**Owner:** Lambada_eth (GitHub: SpacexCeo). **Language of all repo work: English only.**
**Written:** 11 Nov 2026, morning, Europe/Kiev (UTC+2). **Repo baseline inspected:** `main` @ `948e7e0330` (11 Nov 2026 06:58 Kyiv). Live Pages deploy matches that commit (`Last-Modified` 11 Nov 2026 07:01 Kyiv): https://spacexceo.github.io/forget-to-foresee/?demo=judge
**Deadline:** 14 Nov 2026 23:59 UTC = **15 Nov 2026 01:59 Kyiv**. **Code freeze target:** 13 Nov 2026 20:00 Kyiv (`docs/hackathon-rules.md`, `docs/submission/owner-steps.md`).
**Tracks to claim:** `games` (primary) and `nfts` (memory shards only). Do **not** claim `social`.

This is an execution spec, not a pitch. Every task below is grounded in files that exist on `main` today. Do not invent new subsystems after freeze. Do not claim in the README, UI, video, or posts anything that does not run.

---

## 0. Purpose and non-goals

**Purpose.** Ship a judge-ready demo in about three and a half days: a beautiful, playable 8–12 minute path; an honest, visible NFT moment; a short town beat that teaches the loop; tests green; copy aligned with the README real/mock table; owner can tag, post, and submit once.

**Non-goals (P3 / after the hackathon):** wallet sign-in, player-owned live minting, hosted agent API, multiplayer, on-chain escrow, a companion spirit pet, a bow mini-game, mainnet, Social-track features, rewriting the engine, or a new game.

**Product direction (do not pivot).** Keep Forget to Foresee. The judged loop is already the right one: town (or lobby) → Shell → logogram at the glass → stake silk → trial 3 verified (browser + NEAR testnet on the judge season) → forget a memory → shard card. Strengthen that path. Do not start a second game.

---

## 1. Global rules

1. **English only** in this repository: code, comments, commit messages, test names, docs, and default game text (`CLAUDE.md`). Russian/Ukrainian/Italian/Chinese exist only as UI locales (and tests that check those locales). When you change an English string, update the other four locales or keep key parity (`game/tests/ui-i18n-locales.test.mjs`).
2. **Branch and PR, not `main`.** Work on a topic branch (suggested: `claude/hackathon-tz`). Open a pull request. **Do not push to `main`, merge to `main`, force-push `main`, or tag `hackathon-submission` without the owner's explicit OK.** Historically the owner merges as SpacexCeo (PRs #14–#33). `.github/workflows/pages.yml` deploys **every** `main` push that touches `game/**` after `npm test`. A bad merge goes live for judges.
3. **Commit small, push the branch.** Follow `CLAUDE.md`: small commits after each finished piece, no secrets, record course changes in `docs/decisions.md`.
4. **Tests stay green.** `cd game && npm test` and `cd server && npm test` must pass before a PR is offered. Do not weaken `baseline-2d-1` parity with `prototype-2d/`. Prefer adding tests listed in each task. `npm test` in Pages CI is the gate to the live demo.
5. **Honest copy.** Keep the README real/mock table current. Never say “wallet,” “player-owned NFT,” “live mint,” or “on-chain silk/outcome” unless that exact behaviour runs. Judge-season shards and the season-commit contract **are** real on testnet; ordinary seasons **are not** minted or committed. The weekly lobby tournament **is** still a simulation until P2 lands — and P2 must stay labeled local, no prizes.
6. **No fake mint, no fake wallet, no fake usage.** An unminted shard may be shown only as a clearly labeled **preview**. Usage counters (P2) ship only if the owner approves, and then with no PII.
7. **No secrets** in the repo or in this TZ. Testnet account ids and public transaction hashes already live in `game/src/net/near-deployment.js` and `docs/near.md`. Deploy/mint scripts stay coordinator-signed on the owner's machine (`docs/submission/owner-steps.md`).
8. **No new systems after freeze (13 Nov 20:00 Kyiv).** After freeze, only bugfixes, copy, tests, video, and submission support.
9. **Judge desktop path is sacred.** Default judged URL: `/?demo=judge` (Shell hub). Walking variant: `/?demo=judge&mode=walk`. English unless the player picks a language. Do not break the README “Judge in 5 minutes” table; if you change a beat, update that table in the same PR.
10. **Read first, every session:** `docs/decisions.md`, `docs/spec.md`, `docs/hackathon-rules.md`, then this file.

---

## 2. Baseline (facts, already verified)

Do not re-litigate these; treat them as given.

- **Client:** Vite 6 + Three.js 0.170, rules `v3`, engine `game/src/game/engine.js`, room `game/src/net/room.js`. The 3D client uses a **local in-memory transport**, not the HTTP API. GitHub Pages is static; `server/` is local only (`docs/api/README.md`).
- **NEAR (testnet, read-only in the game):** `ftf-seasons.testnet` holds judge season `793f6c05e89839f2`, root `03dbd458…5075769a`, **all 15 leaves already revealed** (committed 09 Nov 2026 08:40:43 Kyiv). `ftf-shards.testnet` holds three coordinator-minted NEP-171 tokens (`…-7`, `…-10`, `…-15`), now owned by `lambada_eth.testnet`. Client: `game/src/net/near.js`, `near-season.js`, `near-deployment.js`, `shard-nft.js`. **No wallet-selector, no mainnet, no client signing.**
- **Agent card:** `contracts/agent-card` is built and tested, **not deployed**. `docs/submission/owner-steps.md` §0 is the owner mint command. The Biography shows “Not minted yet.”
- **Town start:** Play now begins in the ground town (`game/src/boot-world.js`, `docs/town.md`). Iris walks to the Tournament altar and registers (`game/src/scenes/town-flow.js`, objective key `town.objective`). The season / island / balcony come after that.
- **Physics:** Fixed 30 Hz (`PHYSICS_DT` in `game/src/physics/character.js`), `fixedSteps(..., maxSteps = 8)` in `game/src/physics/collision.js`. A long frame is clamped: `Math.min(frameDt, step * maxSteps)` — a 5 s stall runs only **8 steps** (~267 ms of motion); the rest is dropped (already asserted in `game/tests/client/collision.test.mjs`). Render delta is also capped at 0.25 s in `boot-world.js`. Smooth locomotion has `stepHeight = 0.35`. Click-to-move uses `steerTo` + world `rayCast` (CPU), not GPU picking.
- **Input:** World movement already keys off `KeyboardEvent.code` (`KeyW` / `KeyA` / `KeyS` / `KeyD`) in `game/src/ui/input.js`. That is why WASD works on a Russian layout (the owner types ЦФЫВ). Do not regress this.
- **Shell interior:** `game/src/scenes/shell.js` switches `REAL` vs `GREY` layouts when `shell_interior.glb` streams in. The README still warns that interior coordinates can be off (glass where the entrance should be). This is the intended wow shot. Live `shell_interior.glb` is 8.3 MB.
- **Heavy heroes on the live site:** `assets/models/anchor.glb` 19.8 MB, `scroll_table.glb` 20.9 MB; phone `_m` variants still ~8–9 MB. Catalog and budgets: `game/src/render/asset-catalog.js`. Existing budget tests: `game/tests/client/assets-budget.test.mjs`.
- **Cinematic `readPixels`:** `ShotRunner.grabCanvas` in `game/src/cinematic/runner.js` calls `gl.finish()` then `gl.readPixels` (and may `toDataURL`). It is loaded **only** when the URL has `?cinematic=` (`game/src/cinematic/index.js`) and a grab is requested by `tools/capture`. It must **not** run in the normal play loop. Keep it for jury-video capture.
- **Tournament today:** `game/src/ui/tournament.js` + `tournament-card.js` — labeled UI simulation, synthetic schedule, localStorage enrollment, not played seasons.
- **Townsfolk today:** 13 scripted walkers, no dialogue, shops not enterable (`docs/townsfolk.md`, `game/src/play/townsfolk.js`). Useful named NPCs already in the town: `shrinekeeper` (altar approach), `baker` (square stall), `innkeeper`, `scribe` / `shardkeeper`.
- **Submission still open for the owner:** tag `hackathon-submission`, X post with the 60 s video, apply form once. Tag `pre-hackathon` already exists. Claimed test counts (09.11): game 516, server 28.

---

## 3. Playtest notes (11 Nov 2026)

A playthrough was attempted on a **no-GPU test box** (software renderer, severe frame hitch). The owner's machine (real GPU) is the authority for movement feel.

| Finding | Status | Action |
|---|---|---|
| After “Step onto the island,” click-to-move and W stopped at the foot of the main staircase toward “Walk to the Tournament altar.” | **Not a P0 bug.** The owner confirmed the stairs **do** climb on his machine with mouse click and WASD, including a Russian keyboard layout (ЦФЫВ). The stall reproduced only under severe no-GPU lag. | **P1-A** robustness: nav must not die when frame time is huge; keep `KeyboardEvent.code` for letter keys. |
| First-contact copy says “Iris waits on the balcony” (`onb.fc.body`) while the first objective is “Walk to the Tournament altar” (`town.objective`) and the button says “Step onto the island” (`fc.enter`). | Confirmed in `game/src/locales/en.js` and `game/src/play/locales/en.js`. Town is now the start. | **P0-B** |
| Tutorial front-loads “silk,” “Shell II,” “trials,” “weight” before the player has seen the world (`tut.read.sentence`, `tut.stake.button`, `tut.price.memoryNote`, …). | Confirmed in `game/src/locales/en.js` and `game/src/ui/flow.js` / `onboarding.js`. | **P0-C** |
| Slot labels Place / Action / Power / Delay are not clickable; only the drawing is; no hint (`tut.slots.*`, SVG hits in `onboarding.js`). | Confirmed. Keys `slot.0`–`slot.3` exist. | **P0-D** |
| Hologram picker: large empty preview frame and **two** Begin buttons. | Confirmed: `game/src/ui/onboarding.js` lines 343 and 350 both call `primary('onb.look.begin', begin)`. Preview: `game/src/ui/hologram/constructor.js`, `preview.js`. | **P0-E** |
| Severe input lag; console “GPU stall due to ReadPixels”; Controls panel slow to open (`game/src/ui/scene-controls.js` `open()` → `dialog.showModal()`, wired from `boot-world.js` `onSettings`). | Partly environmental (SwiftShader). Still audit and remove any **play-path** sync GPU readbacks. Do not delete capture-only `grabCanvas`. | **P0-F** |

---

## 4. Tasks

Do them in priority order. P0 before P1 content. P2 only if P0 and the agreed P1 items are done and tests are green. P3 is backlog text only — do not implement before freeze.

### P0-A — Freeze the judge path and polish the wow shot

**Goal.** `/?demo=judge` (and `&mode=walk`) is a tight, pretty, reliable 8–12 minute demo. The Shell-interior shot (corridor → glass → Guest drawing a sign) lands. Iris, Shell, and interior are not greybox on the first judged view.

**Why it matters for judges.** Product quality is the first screen. The interior misalignment is called out in the README today; a judge who flies into Shell I and sees a broken hall will not care about Merkle proofs.

**Scope.**
- Fix `REAL` socket / spawn / glass placement in `game/src/scenes/shell.js` (and any loader offset in `game/src/play/game.js` / `game/src/play/logogram.js`) so the player enters a hall and walks to the glass, with the Guest clearly behind it. Keep greybox `GREY` layout only as fallback before the model arrives.
- Streaming priority: Iris, the four Shell exteriors, and `shell_interior` before decorative town pieces and the two 20 MB heroes (`anchor.glb`, `scroll_table.glb`). Prefer phone `_m` meshes on low/medium tiers. If a hero cannot be recompressed in time, delay its load until the first Shell stake is done, with an unlabeled (non-dev) stand-in only off the judge camera.
- Do not add features on this path. If a chapter film fights the 5-minute table, keep the current judge default (films off unless `&films=full`).
- Re-walk the README judge table after the change and update wording only if a beat actually changed.

**Files likely touched.** `game/src/scenes/shell.js`, `game/src/render/streaming.js`, `game/src/render/asset-catalog.js`, `game/src/render/assets.js`, `game/src/play/game.js`, `game/src/boot-world.js`, `README.md` (interior note + judge table if needed), optionally art/export notes under `docs/art/`.

**Acceptance.**
- On `/?demo=judge` (desktop, WebGL 2): fly into Shell I, see a readable corridor and the Guest drawing on the glass; no “entrance is the glass” mix-up.
- Iris is her model (not a capsule) within a few seconds of play-ready on `?play=direct`.
- `npm test` green. No new console errors on the judge path.

**Tests.** Extend or add a unit test around interior layout constants (spawn on the hall side of the glass, glass z between spawn and Guest stand) in the existing shell/play tests if present; otherwise a focused node test next to `game/src/scenes/shell.js`. Do not rely only on a GPU e2e.

**Out of scope.** New interior art from scratch; town shops; films rewrite.

**Risk.** Layout numbers may still disagree with the glb sockets; prefer sockets (`socket_*` in `asset-catalog.js`) over hard-coded metres if the model already has them. A wrong fix is worse than the current greybox. Verify in the review page (`game/review.html?model=shell_interior`) as well as in-game.

---

### P0-B — Align first-contact copy with the town start

**Goal.** The last onboarding screen, the first in-world objective, and the enter button tell the same story: Iris is in the town and should walk to the Tournament altar (then the season begins).

**Why it matters.** Judges read “balcony” and then “altar” and think the build is inconsistent. It is leftover copy from the island-first flow (`docs/tutorial.md` still mentions the balcony walk).

**Scope.** Rewrite `onb.fc.body` (“The island wakes. Iris waits on the balcony.”) and `fc.enter` (“Step onto the island”) in `game/src/locales/en.js` (and the other four locale files). Keep `map.balcony` for the later island map. Do not rename the altar. Optional: “The town wakes. Walk Iris to the Tournament altar.” / “Step into the town.” Update `docs/tutorial.md` if it still teaches the balcony as the spawn.

**Files.** `game/src/locales/{en,uk,ru,it,zh}.js`, `game/src/ui/onboarding.js` only if structure must change, `docs/tutorial.md`, `game/tests/tutorial.test.mjs` / i18n tests.

**Acceptance.** After the hologram page, the body, the primary button, and `town.objective` (“Walk to the Tournament altar”) agree. No “balcony” on that screen. Locale parity tests pass.

**Tests.** String/i18n tests: first-contact keys no longer contain “balcony”; `town.objective` still names the altar.

**Out of scope.** Moving the spawn back to the balcony; changing altar registration rules.

**Risk.** Low. Do not break `fc.enter` flow wiring in `onboarding.js`.

---

### P0-C — Teach terms when they appear, not before the world

**Goal.** The five tutorial beats remain skippable and short, but they stop front-loading jargon. The player can finish the tutorial knowing what to *do*, and meet silk / Shell / trial / weight in context (town quest or first Shell).

**Why it matters.** Abstract words before any 3D world make the game feel like a lecture. Judges have minutes, not a glossary.

**Scope.** Rewrite beat copy in `game/src/locales/en.js` (`tut.slots.*`, `tut.read.sentence`, `tut.stake.*`, `tut.price.memoryNote`, and related bodies) and keep behaviour in `game/src/ui/flow.js` unchanged unless a label must become a plain synonym. Suggested tone: “a stake of ten coins (we call them silk)”; “the second hanging Shell”; “in two turns (trials)”; “this memory is heavy — forgetting it shows more.” Do not remove the stake-and-verify beat or the forget beat; those are the loop.

**Files.** Locales (all five), `game/src/ui/onboarding.js` if a line of help UI is needed, `docs/tutorial.md`, `game/tests/tutorial.test.mjs`.

**Acceptance.** A new player can complete the tutorial without needing a glossary first. The stake still demonstrates Verified ✓. Word limits in `tests/tutorial.test.mjs` (titles under seven words, hints under thirteen, where those rules apply) still hold or are updated deliberately.

**Tests.** Existing tutorial tests updated for new strings; no raw keys.

**Out of scope.** Deleting the tutorial; moving the whole tutorial into the 3D world (the town quest in P1-B can reinforce, not replace, it).

**Risk.** Over-explaining. Prefer one concrete sentence per term, once.

---

### P0-D — Slot labels are clickable and hinted

**Goal.** In tutorial beats that teach the four slots, the labels Place, Action, Power, Delay are hit targets equal to the strokes, and a one-line hint says what the current slot means.

**Why it matters.** The language is the game. If labels cannot be used, the tutorial is a drawing toy.

**Scope.** In `game/src/ui/onboarding.js` (SLOT_POS / stroke hits) and `game/src/ui/flow.js` (`tap` / `readIndex` logic), clicking or tapping a slot label performs the same action as clicking that stroke. Show a short hint (use or add keys next to `slot.0`–`slot.3` and `tut.slots.*`). Do not change later HUD reading cards unless the same dead-label problem exists there (`game/src/play/hub-ui.js`, `game/src/ui/world-hud/signs.js`) — if it does, fix the judge-path reading card too (‹ › already change slots; labels should be discoverable).

**Files.** `onboarding.js`, `flow.js`, locales, `game/tests/tutorial.test.mjs`.

**Acceptance.** Each label click advances or selects the matching slot; a wrong-order click in beat 3 uses the same “Not yet. Stroke N comes first.” feedback. A hint is visible without hovering a hidden control.

**Tests.** Tutorial unit tests: label hit equals stroke hit; hint key present in all locales.

**Out of scope.** Redesigning the sign language; making Ask-the-Guests the tutorial.

**Risk.** Overlapping hit areas on a small ring. Keep labels outside the strokes with a generous tap target (≥ 40 px, already a HUD rule).

---

### P0-E — Hologram picker: one Begin, a visible preview

**Goal.** The look-picker page has a single primary Begin button and a preview that actually draws the selected look in the frame.

**Why it matters.** A large empty frame and two identical buttons look unfinished.

**Scope.** Remove the duplicate `primary('onb.look.begin', begin)` in `game/src/ui/onboarding.js` (header line ~343 **or** the row inserted at ~350, not both). Keep one obvious primary in a stable place. Fix compact preview layout / first paint in `game/src/ui/hologram/constructor.js` and `preview.js` so the canvas is not an empty box (size the canvas to its CSS box, draw immediately, including reduced-motion still). Keep Customize → full constructor (`ctor.done` = “Begin first contact”) as a separate, clearly secondary path.

**Files.** `onboarding.js`, `hologram/constructor.js`, `hologram/preview.js`, onboarding CSS in `onboarding.js`, `game/tests/ui-logic.test.mjs` or tutorial tests.

**Acceptance.** Exactly one visible Begin on the compact look page; choosing a tile updates a visible preview; Customize still opens the full constructor. No empty 380 px hole.

**Tests.** DOM test: one `[data-…]` / button bound to `onb.look.begin` on the compact page. Preview: after `setRecipe`, the canvas is non-blank (sample pixels or a `drawn` hook), including reduced motion.

**Out of scope.** A 3D hologram in the town; changing the recipe format.

**Risk.** Low. Do not drop the constructor; it is cosmetic and already hashed.

---

### P0-F — Remove play-path sync GPU readbacks; make Controls open immediately

**Goal.** Normal play (including opening Controls / Settings) does no synchronous full-framebuffer `readPixels` / `readRenderTarget` / WebGL `toDataURL`. Input stays usable during streaming hitches as far as the JS thread allows.

**Why it matters.** “GPU stall due to ReadPixels” plus a laggy Controls dialog makes a mid-range or a software-renderer machine feel broken. Judges may open Controls.

**Scope.**
- Audit the **play path** (`game/src/boot-world.js`, `game/src/render/lookdev.js`, `post.js`, `warmup.js`, `hdr-guard.js`, inspect/HUD, hologram preview). Remove or defer any per-frame or dialog-open sync readbacks.
- Leave `ShotRunner.grabCanvas` / `regrab` / `probe` in `game/src/cinematic/runner.js` for `?cinematic=` capture only. Never call them from `boot-world` or `play/game.js`.
- `game/src/ui/scene-controls.js` `open()` should `showModal()` without waiting on the renderer. If `onTransition()` / `clearWorldInput` does heavy work, defer it until after the dialog is visible.
- Click-to-move must stay on the existing CPU `Raycaster` + `rayCast` path in `boot-world.js`, not GPU picking.

**Files.** Listed above; add a short comment in `runner.js` that grab is capture-only. `docs/tutorial.md` / `docs/movement.md` currently call the SwiftShader warning “driver, not the game” — update if a game-side readback is found and removed.

**Acceptance.** On the judge path without `?cinematic=`, a search of the running modules shows no play-loop `readPixels`. Controls (`onSettings` → `controls.open()`) appears on the next frame without a canvas readback. Capture tools still grab when `?cinematic=` is set.

**Tests.** A unit test or static assertion: `boot-world.js` / `play/game.js` do not import or call `grabCanvas`. If you add a debug screenshot helper, it must be behind a query flag, not a frame loop.

**Out of scope.** Fixing SwiftShader itself; rewriting the post stack; deleting the capture runner.

**Risk.** A hidden readback may live inside Three.js (composer, `getPixel`, pixel-ratio probes). If it is third-party and not per-frame, document it; do not vendor-fork Three.js this week unless the call is clearly ours.

---

### P1-A — Low-end robustness: huge frame times and keyboard layouts

**Goal.** Navigation still climbs the town stairs and follows click-to-move when a frame takes a very long time (texture upload, shader compile, software renderer). Letter movement keys keep using `KeyboardEvent.code`, so WASD works on RU/UA layouts.

**Why it matters.** The owner's GPU path is fine. A hitchy first load (20 MB heroes, first town stream) can still drop ~267 ms of motion per long frame today and strand the climb mid-step. Russian/Ukrainian judges will type on non-Latin layouts.

**Scope.**
- In `game/src/physics/collision.js` `fixedSteps` and the loop in `game/src/boot-world.js`: when `frameDt` is huge, do **not** lose the climb. Options (pick one, test both 10-vs-144 FPS parity and a 1 s hitch): raise or budget `maxSteps` after a stall; carry leftover time across frames without exploding the spiral of death; or pause non-essential streaming for one beat while a step-up is in progress. Keep `character.js` `stepHeight` (0.35 m) able to climb the town stair mesh used by `TOWN_ROUTE` (`game/src/scenes/town-layout.js`). Click-to-move (`steerTo`, ground `rayCast`) must not cancel at the stair foot after a hitch.
- **Layouts:** Keep `input.js` on `e.code`. Add a test that `keydown` with `{ code: 'KeyW', key: 'ц' }` moves forward. Audit other letter bindings (hub, tutorial, settings). `hub-ui.js` uses `e.key` for Arrow / Home / End only — arrows are fine; do not switch those to letters via `e.key`.

**Files.** `collision.js`, `character.js`, `boot-world.js`, `input.js`, `game/tests/client/collision.test.mjs`, `movement.test.mjs`, `input.test.mjs`, `town.test.mjs`.

**Acceptance.**
- A node test simulates a stair (or the town route profile) with occasional 1.0 s frames and still arrives at the altar stand / top of the steps.
- The existing “same walk at 10 FPS and 144 FPS” test still passes.
- `{ code: 'KeyW', key: 'ц' }` is equivalent to `{ code: 'KeyW', key: 'w' }`. No movement code uses `e.key` for WASD.

**Tests.** As above. Extend the current `fixedSteps(0, 5)` stall test so that *gameplay* (not only the accumulator) still makes progress on a stepped ramp after a stall, without taking dozens of unconstrained steps in one frame (avoid the spiral of death: cap wall-clock physics budget, e.g. ≤ 100 ms).

**Out of scope.** Treating the owner's GPU stair climb as broken; rewriting collision from scratch; supporting remappable keys this week.

**Risk.** Raising `maxSteps` without a budget can hitch worse. Prefer a modest catch-up budget. Do not change `PHYSICS_HZ`.

---

### P1-B — Town quest chain (3 NPCs, 3–5 minutes)

**Goal.** Before (or as the path toward) the first Shell, a short English quest with **three existing townsfolk** teaches: read a sign, trade silk, deliver an item or word, then leads the player to the first Shell / altar registration in a way that still starts the season cleanly.

**Why it matters.** The town is already built but is presentation-only. A 3–5 minute human beat shows “real use” of the world and teaches the loop without a glossary.

**Scope.**
- Reuse models and spawn points: prefer `shrinekeeper` (altar approach), `baker` (square), and one of `innkeeper` / `scribe` / `shardkeeper` (`docs/townsfolk.md`). No new characters, no enterable shop interiors.
- English dialogue only in default locale; add keys to the other four locales (AI translation is acceptable, same as current UA/IT/ZH). Keep lines short.
- Three beats, about 3–5 minutes including walks: (1) an NPC shows or asks the player to read a simple four-slot sign (reuse the existing sign drawing, not a new language); (2) a small silk trade or gift (purely in-game silk, or a tutorial purse if the season has not started — **do not** invent a NEAR token); (3) deliver a note / word / parcel to the third NPC, who points to the altar or the waiting Shell.
- Wire into `game/src/scenes/town-flow.js` so the current altar registration still works (E to register, transition cover, then the season). If the judged `?demo=judge` should skip the town for the 5-minute table, keep a flag: e.g. `?demo=judge` may continue to skip or shorten town (document the choice in the README). A first-time guest path should play the quest once (localStorage flag, like `ftf.firstloop.v1`).
- Presentation-only talks that do not change engine rules until the season has started. If silk is granted before `start_season`, it is a teaching prop, clearly not on-chain.

**Files.** `town-flow.js`, `town-layout.js` / `town-data.js` (markers only if needed), `game/src/play/townsfolk.js`, locales under `game/src/play/locales/`, `docs/town.md`, `docs/townsfolk.md`, `game/tests/client/town.test.mjs`, new `game/tests/client/town-quest.test.mjs`.

**Acceptance.** A first-time player can finish the three beats in ≤ 5 minutes of normal walking, in English, with no missing-key strings, and then register at the altar (or be led to Shell I if that is the documented judge start). NPCs without the quest still idle as today. `?demo=judge` remains a valid timed path (either skips the quest or includes a shortened scripted version that does not break the README table).

**Tests.** Pure tests: quest state machine (start → read → trade → deliver → done), flags persist, skip flag honored, dialogue keys exist in five locales, no engine command is sent before the season starts (or only documented teaching commands).

**Out of scope.** Shop interiors, combat, new meshes, LLM dialogue, multiplayer townsfolk, tying this quest to an NFT.

**Risk.** Scope creep. Hard cap: three talk trees, no more than ~8 short lines each. If time is short, ship shrinekeeper + baker only plus a pointer to the altar, and say so in the README.

---

### P1-C — Memory Shard moment, unavoidable and honest, for every player

**Goal.** Every completed forget-and-auction (or the judge-path scripted one) shows a shard **card** with biography. If this is the judge season and the on-chain token matches, the card is a real testnet NFT with explorer links. Otherwise it is an **“Unminted shard preview”**, clearly labeled. **No fake mint, no fake “Minted on NEAR” toast.**

**Why it matters.** The NFT track is “NFTs That Do Something.” Today the card appears only when local shard data equals the three pre-minted judge tokens; a diverging playthrough shows nothing. Judges who wander off the script will think NFTs are missing.

**Scope.**
- Keep `game/src/net/shard-nft.js`, `createShardWatcher`, and HUD pieces `game/src/ui/world-hud/shard-card.js`, `shard-card-model.js`, `game/src/play/world-hud.js`, Memories in `game/src/play/ui.js`.
- **Judge path, matching token:** keep current behaviour: on-chain SVG (byte-checked), token id, owner, biography, leaf binding, Nearblocks links, toast “Minted on NEAR testnet” only when the token exists and extras match.
- **Any other season, or a judge playthrough that diverges:** still open a card after the auction resolves, built from local `shardSvg()` / metadata, with a visible status such as “Unminted shard preview — on-chain mint is for the published judge season only.” No mint transaction link. No “Verified on NEAR” badge.
- Make the moment hard to miss on `?demo=judge`: after Frost buys Iris’s shard at trial 6 (current scripted auction), auto-open Memories or the toast with “Open card.” Document this in the README judge table.
- Copy in all five play locales (`shard.nft.*`). Update `docs/shard-nft.md` and the README real/mock row.

**Files.** Listed above; `game/tests/client/shard-nft.test.mjs`, `shard-nft-hud.test.mjs`.

**Acceptance.** (1) Judge seed, scripted forget: real token card + links. (2) Same build, `?seed=` other than the judge seed, or a different forgotten memory: preview card, no mint toast, no explorer mint link. (3) RPC failure on the judge path: no fake card; existing “nothing / retry” behaviour may remain, but a local preview may be shown **with** the unminted label, never as on-chain.

**Tests.** The three cases above in `shard-nft-hud.test.mjs`. Locale keys for the unminted label.

**Out of scope.** Live coordinator mint from the browser; wallet connect; minting mid-season for random seeds.

**Risk.** A preview that looks too much like a real token will be called dishonest. The word **Unminted** and the absence of a tx link are mandatory.

---

### P1-D — Optional: deploy `agent-card` on testnet (coordinator-minted, honest label)

**Goal.** If the owner has time and keys, deploy the existing `contracts/agent-card` and mint the judge-season Iris card to `lambada_eth.testnet`, then show it in the Biography as a real token. If not deployed, keep “Not minted yet” plus a local preview.

**Why it matters.** A second, end-of-season NFT (traits, biography, state hash) strengthens the NFT track without inventing a new contract.

**Scope.** Owner runs `bash contracts/agent-card/scripts/mint-judge-card.sh` (`docs/submission/owner-steps.md` §0, `docs/agent-nft.md`). Agent work: wire `game/src/net/agent-nft.js` and Biography UI so a matching on-chain hash shows “Minted on NEAR testnet” with links; otherwise “Not minted yet” and a labeled local preview. Update `near-deployment.js` only with public account ids and tx hashes via the existing write-deployment script pattern (testnet only). Client still never signs.

**Files.** `contracts/agent-card/*`, `game/src/net/agent-nft.js`, `near-deployment.js`, Biography in `game/src/play/outcome-ui.js` / locales `agentcard.*`, `game/tests/client/agent-nft.test.mjs`, `docs/agent-nft.md`, `docs/near.md`, README.

**Acceptance.** After a successful owner deploy: Biography on `?demo=judge` at season end shows the token, owner, explorer link, and “coordinator-minted, not player-owned.” Without deploy: no false minted state. `ftf-agents.testnet` (or the actual id written by the script) is testnet.

**Tests.** Existing agent-nft tests: minted / not minted / hash mismatch (treat mismatch as not minted, never as verified).

**Out of scope.** Player-owned mint; wallet; mainnet.

**Risk.** Optional. Do not block P0 or P1-C on this. Do not put keys in the repo.

---

### P2-A — Honest timed “Predict three events” run (only after P0 and P1-C)

**Goal.** Replace the *impression* of a live weekly tournament with a real, local, 10-minute challenge: predict three upcoming events, play them out, then show a result you can save and share. Labeled **local**, **no prizes**, **no other players**.

**Why it matters.** The lobby card today says “Simulation” (`game/src/ui/tournament.js`). A shareable local result is honest “usage” without a server.

**Scope.**
- New or extended mode, e.g. `/?challenge=predict3` or a lobby button “Predict three events (local).” Timer 10 minutes. The player records three predictions (Shell + action + trial, or the game’s four-slot reading) for forthcoming events, then plays (hub or accelerated ticks). Score = correct predictions. Persist a leaderboard in `localStorage` (existing `STORAGE_KEYS.tournament` or a new key `ftf.challenge.v1`). Export / copy a JSON or short text result (seed, predictions, score, date). Every screen says “Local challenge — no prizes, not a live tournament.”
- Retire or relabel the synthetic weekly enrollment so it cannot be mistaken for this mode.

**Files.** `tournament.js`, `tournament-card.js`, `lobby.js`, locales, new tests next to existing tournament idempotency tests in `game/tests/ui-logic.test.mjs`.

**Acceptance.** A player can finish a 10-minute run, see a score, reload the machine, and still see the local leaderboard. Export does not include PII beyond an optional local guest id already used in the demo entitlement. No network writes.

**Tests.** Scoring function, persistence, export shape, “local / no prizes” strings present.

**Out of scope.** Server brackets, prizes, NFT trophies, on-chain scores, the current fake “Week 46” results table presented as real.

**Risk.** Time. If this slips past freeze, keep the old card labeled Simulation and do not start a half-built challenge.

---

### P2-B — Minimal privacy-respecting usage counters (owner approval required)

**Goal.** Only if the owner says yes: anonymous, aggregated counters (e.g. judge-path started, trial 3 verified, shard card shown). No PII, no wallet, no IP storage in our repo, no fingerprinting beyond a first-party session flag.

**Why it matters.** Judges ask about real usage. Fake tournament numbers are worse than no numbers.

**Scope.** TBD after a written owner yes. Prefer a tiny static-friendly beacon or a manual “N playtests” note in the README from honest observation. If a beacon is used, document the exact fields (event name, ISO day, no guest id). Default is **do not implement**.

**Acceptance.** If built: a public, field-level description in `docs/` and the README; no guest ids, seeds, or phrases. If not approved: nothing ships.

**Tests.** If built, a test that the payload schema contains only allow-listed keys.

**Out of scope.** Analytics suites (no gtag, PostHog, Sentry). The play-path has none today; keep it that way unless this task is approved.

**Risk.** Privacy and honesty. When in doubt, skip.

---

### P3 — Post-hackathon backlog (do not build now)

Record in `docs/decisions.md` or a short `docs/backlog.md` if useful, then stop.

- **Companion spirit pet:** remembers one hint per season; a future NFT, not claimed in this submission.
- **Bow mini-game:** light-sign arrow into a Shell ring; no combat.
- **Wallet + player-owned mint** for shards and the agent card; live mint per season; on-chain escrow.
- **Hosted agent API** (today: `server/` on localhost, OpenAPI at `docs/api/openapi.yaml`, example `server/examples/agent.mjs`).
- **Multiplayer.**

These are future work. Mentioning them in a pitch is fine if labeled future; implementing them before 13 Nov 20:00 Kyiv is out of scope.

---

## 5. Day-by-day plan (Europe/Kiev)

Assume work starts **11 Nov 2026** afternoon. Freeze **13 Nov 20:00**. Submit buffer **14 Nov**, deadline **15 Nov 01:59**.

### 11 Nov (today) — stabilize the first minutes

- Branch `claude/hackathon-tz`. Read this TZ, `docs/decisions.md`, `docs/hackathon-rules.md`.
- P0-B, P0-E, P0-D, P0-C (copy and tutorial UX — fast, high judge impact).
- Start P0-A (interior layout investigation + streaming order).
- Start P0-F audit (prove whether any play-path `readPixels` exists; gate capture).
- Tests green; push branch; draft PR. **No merge to main** without the owner.

### 12 Nov — wow shot, shard card, robustness

- Finish P0-A (interior + streaming). Re-walk `/?demo=judge` and `&mode=walk`.
- P0-F remaining work; Controls open.
- P1-C shard card for every player (honest labels).
- P1-A hitch / stair robustness + `KeyW`+`ц` test.
- Begin P1-B town quest scaffolding (state machine + two NPCs if time).
- Optional: prepare agent-card deploy docs for the owner (P1-D), do not run mint yourself.

### 13 Nov — quest, copy freeze, video plates

- Finish P1-B or the documented short version.
- P1-D only if the owner has already minted and given public tx hashes.
- Align README real/mock table, judge table, `docs/shard-nft.md`, `docs/tutorial.md`, `docs/town.md`.
- Copy-alignment pass (section 7). Fix phone overlaps (QA-011 / QA-035) only if they still reproduce and time remains — desktop judge path wins.
- **20:00 Kyiv: code freeze.** After this, bugfixes, copy, tests, video support only.
- Owner: play the full judge path on a real GPU. Agent: supply a 60 s shot list (section 6).

### 14 Nov — buffer, video, submission (owner)

- Pages build from the frozen `main` (after the owner merges). Walk https://spacexceo.github.io/forget-to-foresee/?demo=judge in English.
- P2 only if everything above is done and the owner asks; otherwise skip.
- Record the 60 s jury video (`docs/submission/jury-video.md`). Check captions against section 7.
- Owner: tag `hackathon-submission`, X post, apply form once (section 8). Agent may prepare payloads and checklists, not send.

### After 15 Nov 01:59 Kyiv

- Do not force-push `main` or delete the tag during judging (16–18 Nov). Keep the repo public and the demo up until at least 18 Nov (ideally 25 Nov).

---

## 6. Demo script — 60 second jury video

Follow `docs/submission/jury-video.md` for capture mechanics. Suggested spoken/caption spine (English). Every caption must be true.

| t | Picture | Caption (must stay honest) |
|---|---|---|
| 0–6 s | Town or island establishing shot, Iris | Forget to Foresee. A strategy game: the future costs a memory. Built at NEAR HACKATHON. |
| 6–16 s | Fly into Shell I, hall, Guest at the glass, sign drawing | Inside a Shell, the Guests speak in four-slot signs. Iris reads with you. |
| 16–26 s | Stake 10 silk, leave, trials pass, Verified ✓ and Verified on NEAR testnet ✓ | The season was sealed before play. This reveal matches the root on NEAR testnet. |
| 26–38 s | Forget a memory, auction, shard card with biography and explorer link | Iris forgets a memory to see ahead. On the judge season, that shard is a NEP-171 token on testnet. |
| 38–50 s | Brief clans / silk / Scroll, or the town NPC handoff if it looks good | Six clans trade silk, words and trust in a closed in-game economy. No paid entry, no token price. |
| 50–60 s | Title, URLs | Play: spacexceo.github.io/forget-to-foresee/?demo=judge — Code: github.com/SpacexCeo/forget-to-foresee |

**Forbidden captions:** clans have NEAR wallets; Iris is a player-owned NFT; every season mints shards; the contract is “not yet deployed”; weekly tournament prizes; “the outcome is on-chain.” Silk, stakes, auctions, and the vote are **local**. Only the judge season’s event root, its reveals, and the pre-minted shards (and the agent card if actually minted) are on testnet.

Prefer desktop 1920×1080, WebGL 2, English, `?demo=judge` (add `&films=full` only if a short in-engine shot is cleaner than live play). Do not post the older 75 s cut without re-rendering (`docs/submission/owner-steps.md` §3).

---

## 7. Copy-alignment checklist

Before freeze, every public surface must match the README real/mock table. Fix or note each line.

| Surface | Risk today | Required line |
|---|---|---|
| GitHub repo description | “3D game where NFT agents pay for prophecy…” overclaims Iris as an NFT agent | Agents are in-game; shards are NEP-171 on the judge path; Iris is not a player-owned NFT |
| near.social / any teaser | “each an agent with a wallet and a memory” | In-game silk balance, not a NEAR wallet |
| `prototype-2d/index.html` intro | Frozen text may still say Iris is an NFT | Add a one-line present-tense disclaimer, or leave the prototype frozen and say in the README (already does) that this line is historical |
| Lobby `lobby.demoNotice` | “Guest demo on NEAR testnet. No real money, no prizes.” | Keep. Good. |
| Tournament card | Synthetic week, labeled Simulation | Keep the word Simulation until P2-A ships; P2-A must say Local, no prizes |
| README “Not built” list | Must stay accurate if P1-D deploys the agent card | If minted, move that row to “deployed, coordinator-minted, not player-owned” |
| X post (`docs/submission/x-post.md`) | Must include “built at NEAR HACKATHON”, @NEARProtocol, #NEARHackathon, and the video | No wallet / live-mint claims |
| This game’s UI strings | P0-B balcony vs altar; shard preview label | As in P0-B and P1-C |

Do not add a `website` field to the apply form (spam trap). Do not claim the `social` track.

---

## 8. Submission checklist (owner actions)

The agent prepares files and reminders. The **owner** performs irreversible steps. Order from `docs/submission/owner-steps.md`:

1. **Merge the PR to `main` only when the owner is satisfied.** Confirm Pages is green and https://spacexceo.github.io/forget-to-foresee/?demo=judge walks the table: trial 3 “Verified ✓” and “Verified on NEAR testnet ✓,” shard card honest.
2. **Optional P1-D:** `bash contracts/agent-card/scripts/mint-judge-card.sh` on the owner's machine, then a small follow-up PR with public ids/hashes only.
3. **Freeze tag (owner):**
   ```bash
   git fetch origin main
   git checkout main && git pull --ff-only origin main
   cd game && npm ci && npm test && npm run build && cd ..
   cd server && npm test && cd ..
   git tag -a hackathon-submission -m "NEAR Hackathon submission" main
   git push origin hackathon-submission
   ```
   Check: https://github.com/SpacexCeo/forget-to-foresee/compare/pre-hackathon...hackathon-submission
4. **Video** per section 6 and `docs/submission/jury-video.md`.
5. **X post** from `docs/submission/x-post.md`: video attached, “built at NEAR HACKATHON”, @NEARProtocol, #NEARHackathon. Copy the post URL into the apply form (`demoUrl`).
6. **Apply once** via https://nearhackathon.com/#apply or the documented API (`docs/submission/apply-form.md`). Tracks: `games` and `nfts` only. `nearAddress` is a **mainnet** payout account. Consent must be the owner's. One attempt per repository; later fixes go to https://nearhackathon.com/request-changes. Keep the payload (email, etc.) out of the repo.
7. After 201: note the date in `docs/decisions.md`. Do not force-push `main` or delete the tag during 16–18 Nov judging. Keep the demo up.

---

## 9. Definition of done (hackathon cut)

A branch or frozen `main` is done when:

- All **P0** tasks meet their acceptance criteria.
- **P1-C** is shipped (honest shard card for every player).
- **P1-A** tests for hitch climb and `KeyW`+`ц` pass (even if no visual change on a fast GPU).
- **P1-B** is shipped or explicitly documented as cut/short in the README.
- `cd game && npm test` and `cd server && npm test` are green; Pages is green after the owner merges.
- README real/mock table, judge table, and section 7 surfaces agree.
- No new secrets, no fake mint, no Social track, no unapproved analytics.

P1-D, P2, and P3 are not required for done.

---

## 10. Quick command map

```bash
cd game && npm ci && npm test && npm run dev
# Judge: http://localhost:5173/?demo=judge
# Walk:  http://localhost:5173/?demo=judge&mode=walk
# Skip lobby: &play=direct
cd ../server && npm test   # do not assume this is hosted
```

Review a model: `http://localhost:5173/review.html?model=shell_interior` (also `anchor`, `scroll_table`).
Dev HUD budgets: **F3**. Capture / jury plates: `?cinematic=` only (`docs/submission/trailer.md`).

When a behaviour is unclear, prefer the README real/mock table and this TZ over older branch docs or social posts.
