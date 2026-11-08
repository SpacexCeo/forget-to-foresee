# submission readiness (Task D): report

Branch `claude/submission-readiness` (based on `claude/loving-curie-ihasft` = `main` + worker docs), 08.11.2026.
Files owned and changed: `README.md`, `docs/hackathon-rules.md`, `docs/submission/{apply-form,x-post,video-shot-list,owner-steps}.md`,
this report, plus one appended row at the end of the `docs/decisions.md` §4 table. Nothing outside these paths was
touched; no tags, deploys, posts or pull requests.

## 1. Rules re-read

https://nearhackathon.com/HACKATHON.md was reachable (HTTP 200, 22 KB). Differences from the old checklist, now in
`docs/hackathon-rules.md`: results are announced by 18.11 23:59 UTC (the old file said 19.11); the hosted demo
should stay up until 18.11, ideally 25.11; the submission API contract (exact 11 fields, `size` enum with spaces,
13 track ids, mainnet `nearAddress` regex, `idea` 20–2000, body ≤ 12 KB, `website` is a spam trap, `requestId`
reused on retries, 201/400/403/409/413/503 meanings); **one attempt per repository**, fixes only through
https://nearhackathon.com/request-changes; optional tags @NearLegion / @NearBuilders; the consent sentence to read
verbatim; the agent never submits, posts, pushes, deploys or commits secrets without explicit confirmation.

## 2. Every README command from a fresh clone (`git clone` of this branch into a scratch directory)

Environment: Linux container, Node 22.23.4, npm 10.9.9, cargo 1.97.0, headless Chromium (SwiftShader, no GPU).

| Command | Result | Exact output (tail) |
|---|---|---|
| `cd game && npm ci` | pass, 1.8 s (warm cache) | no errors |
| `cd game && npm test` | **pass 260/260**, 12.1 s | `# tests 260` `# pass 260` `# fail 0` |
| `cd game && npm run build` | pass, 3.0 s | `✓ built in 2.70s`; `dist` = 295 MB (`du -sh`) |
| `cd game && npm run dev` + judge path in headless Chromium | pass, no console errors | see §3 |
| `cd server && npm ci` | **fails**: `server/` has no `package-lock.json` and no dependencies; `npm ci` refuses to run without a lockfile. The README therefore does not tell anyone to run it (it says `npm ci` in `game/` once, then `npm test` / `npm start` in `server/`) | `npm error Run "npm help ci" for more info` |
| `cd server && npm test` | **pass 28/28**, 1.8 s | `# tests 28` `# pass 28` `# fail 0` |
| `cd server && npm start` | pass | `Forget to Foresee agent API listening on http://127.0.0.1:8787/v1  (OpenAPI: /v1/openapi.yaml, catalog: /v1/actions)` |
| `node examples/agent.mjs --time-scale 1000` (5 runs, v3 ×4, `--rules v2` ×1) | pass, 0.6 s each | step log `session s-… (rules v3, timeScale 1000)` … `tick 13: end tick`; JSON with `"rejected": 0`, `"firstProofVerified": true`. Outcomes varied: `gift`, `gone` (×2, `"voted": false`), `lost`, `weapon`. The old README said the agent always "votes": corrected to "if the season reaches the vote" |
| `cd contracts/season-commit && cargo test --lib` | **pass 56/56**, compile 1 m 19 s | `test result: ok. 56 passed; 0 failed` |
| `cargo near build non-reproducible-wasm --no-abi` | **blocked in this container**: `cargo-near` is not installed; the release installer (`curl … \| sh`) is not allowed here, and `cargo install cargo-near --locked` (v0.23.0) failed to compile after 9 m 20 s. Plain `cargo build --release --target wasm32-unknown-unknown` does build `season_commit.wasm` (447 KB, 14 s), which shows the contract compiles for wasm | `error: failed to compile cargo-near v0.23.0` |
| `cargo test` (all tiers) | lib tier passes (56); the 2 `tests/sandbox.rs` tests **cannot run here**: near-workspaces could not start the sandbox node (`couldn't set the file descriptor limit to (65535, 65535), current limit = (20000, 20000)`, then `Could not startup and run sandbox node`). They pass in CI: `.github/workflows/contracts.yml` run #14 on 07.11 is green (https://github.com/SpacexCeo/forget-to-foresee/actions/runs/42384464589) | `test result: FAILED. 0 passed; 2 failed` (sandbox only) |
| `prototype-2d/index.html` | not opened in a browser this session (unchanged frozen file; the 60 parity tests replay it) | — |
| GitHub Pages | live: https://spacexceo.github.io/forget-to-foresee/ returns 200; workflow `pages.yml` run #2 on `main` (bf89d82) green on 08.11 11:26 UTC | — |

Measured on the live site in headless Chromium (`?demo=judge`): the lobby is interactive after 11 MB / 1.9 s, the
world is playable after 57 MB / 10.5 s, and 140 MB had streamed after one minute in the world (70 MB of it `.glb`).
The README says "~60 MB before you can play, models keep streaming".

## 3. The judge path, verified step by step (headless Chromium, `npm run dev` from the fresh clone)

`?demo=judge` → ENTER THE WORLD → Continue as guest → Next ×3 → Guide me (Novice) → Begin first contact → Step onto
the island. World: `Trial 1 of 17`, Silk 63, Attention 3, quest *Cross the bridge to the Scroll*, hint *A sign woke.
I read it as a Gift of 10 at Shell I, trial 2. Press V to see why.*, log *Owner's Key committed: 0x…* (differs per
run: salted). Then, exactly as the README table says:

1. At the Scroll: quest *Decide your fragment at the Scroll*, prompt `E Give your fragment to the Scroll (forfeit the prize of 40)`; E → log *Iris places your fragment in the Scroll.*, quest *The Price of Memory…*.
2. M → Memories panel (First Word weight 4, the Shells' Call weight 2, Moss shared silk weight 1, each with *Forget it for a vision*); forgetting the First Word → Signs panel with 4 *vision* cards, log *Vision: Iris sees 4 future signs before anyone else.*, *Iris forgot who her owner is. She obeys less.*, *Shard "First Word…" is up for auction.*, Attention 2/2, quest *Anchor on Shell I for tick 3*.
3. Anchor zone Shell I: menu `E Anchor here for tick 2 (as your reading says) · 2 … · 5 Enter Shell I · 6 Look at the zone`; E → silk 63 → 53, log *Anchor: Shell I, tick 2.*, quest *End tick 1 and watch the sign revealed*.
4. T, T (the first press shows *You still have 3 attention. End the tick anyway? Press T again.*) three times → trial 4, silk 84; log **`Tick 3 · Shell II: Gift, power 20. Leaf #0 checked against the root ✓`**, *The gift went to Frost.*, *Salt bought Iris's First Word. They now know your Key.*; V → Resolved: **`Sign #1 · Revealed · Verified ✓ · Came true: Gift of 20 at Shell II, trial 3`**.
5. From the anchor zone, option 5 *Enter Shell I* → zone `shell`, prompt *E Leave the Shell*; E → back on the island. No console errors in any run.

Caveats of the headless check, so the lead does not over-read it: SwiftShader rendered at 0.3–1.3 fps, so walking in
real time was impractical (Iris moved ~0.26 m/s) and two key presses 0.7 s apart land in one frame. The walk steps
were replaced by setting the player position to the Scroll / anchor zone, and the play keys from step 1 on were
sent through the same `play.handleKey(code)` the keyboard path calls (real `keydown` events were confirmed to reach
the input layer: the T confirm toast appeared). On a real GPU the keys and the ~30 s walk work as the README says
(the owner's own gameplay recordings of 08.11 and the Pages run show that); the lead should still click through the
table once on a desktop before the video.

Screenshots of the run are in the session scratchpad only (not committed): lobby, tutorial, world, memories,
signs with *Verified ✓*, inside the Shell.

## 4. Checklist state (from `docs/hackathon-rules.md`)

| Item | State |
|---|---|
| Working prototype, hosted demo | **done** (Pages live from `main`; keep until 18.11/25.11) |
| Public repo + MIT LICENSE | **done** |
| README for machine and human readers, "do X, see Y", real/mock boundary | **done** on this branch; **lead**: merge and re-check the rows listed in §5 after A, B, E |
| Tag `pre-hackathon` | **done** (exists on origin) |
| Tag `hackathon-submission` + diff link | **owner action** at freeze; commands in README and `docs/submission/owner-steps.md`; the README already links `compare/pre-hackathon...hackathon-submission` |
| Libraries, templates, AI code listed (Q-005) | **done** (README "Baseline and third-party code", from the lockfiles) |
| Concrete NEAR role (Q-011) | **done** as a tested, undeployed contract; testnet deploy is an **owner action** (optional for eligibility, Q-010) |
| X post with video, "built at NEAR HACKATHON", @NEARProtocol, #NEARHackathon | **owner action**; draft `docs/submission/x-post.md`, shot list `docs/submission/video-shot-list.md` |
| Form / API submission | **owner action**; values and payload `docs/submission/apply-form.md`; `idea` draft 1,860 characters |
| Second project cross-links (Q-015) | **owner decision** still open (`docs/decisions.md` §6 item 3) |
| No secrets in the repo | **done** (nothing added; `.env.example` policy unchanged) |
| Tests green | **done**: 260 / 28 / 56 (+2 sandbox in CI) |

## 5. README lines the lead must re-check after merging A (audio/VFX), B (translations) and E (mobile)

All of these describe the state on **this** branch (= `main` of 08.11 morning). If a worker branch lands, update the
line, never leave a claim that is weaker or stronger than what merged.

- **After A:** "What works today" rows *Audio* ("partly wired: unlock on first input, tension-driven music, the Guest
  speaks the strokes, zone ambience; footsteps, UI clicks and volume settings are not wired") and *VFX* ("partly
  wired … not every cue has an effect yet"); the real/mock row *Audio / VFX*; the test breakdown numbers "6 audio,
  14 VFX" and the total **260** (appears in the judge section, the Run section and the decisions row). Re-measure
  with `npm test`.
- **After B:** the *UI languages* row ("EN and RU complete … UA, IT, 中文 cover the lobby and core labels, every other
  key falls back to English"); the judge-section sentence "Settings switches Novice/Pro and the five UI languages";
  the test breakdown ("16 i18n") and the total if `tests/ui-i18n-locales.test.mjs` is added; the Controls row
  "**L** EN⇄RU" if L cycles more locales; the Libraries line if a CJK font package is added.
- **After E:** the *Input* row ("touch (tap to walk, drag to orbit, pinch to zoom); phones get the miniature HUD and
  skip the lobby": add the run button / double-tap and the phone tier); the *3D client* row ("look-dev stack with
  quality tiers"); the test breakdown if `tests/client/mobile*.mjs` / `quality*.mjs` are added, and the total; the
  judge section's "desktop Chrome, Edge or Firefox" if phones become a supported judge path.
- **After any merge:** the test total **260** and the per-file numbers; the `dist` size (295 MB); the "~60 MB before
  you can play" figure if models are re-encoded; the *3D art* row's "67 glb files" if models are added or the
  faces are rebuilt (`art/faces-wink`).
- **At freeze:** replace nothing else; the tag link becomes live by itself once the owner pushes the tag.

## 6. Not done / out of scope

- `cargo near build` and the sandbox tests did not run in this container (see §2); CI covers them.
- The 2D prototype was not opened in a browser (frozen file; parity tests cover it).
- Phone emulation of the judge path was not run (Task E owns mobile).
- `docs/submission.md` (the earlier "DAY ONE OR ONE DAY" thread and the long form description) is not a Task D path
  and was left as is; the new drafts in `docs/submission/` supersede it and say so. The lead may delete or keep it.
- `docs/HANDOFF.md` has no submission row, so it was not edited.
- The README real/mock row "Season commitment" and the contract row must change if the owner deploys to testnet
  before the freeze (`docs/submission/owner-steps.md` §3 says what to write).
