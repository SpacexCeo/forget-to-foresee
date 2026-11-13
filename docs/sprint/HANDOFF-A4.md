# Hand-off: A4 (new-player experience, glossary, tips, voice, agent tournament)

Branch: `claude/art-queue` (this session can push only there; the lead opens the PRs into `sprint/5h`).
English only; every string is in `game/src/play/locales/en-npe.js` and `en-tips.js`.

## What is built

| Piece | Files | Flag | Tests |
|---|---|---|---|
| Wake-up script (19 lines, speakers, camera beats), barks, quest-giver lines `npc.talk.<quest>.<stage>` | `game/src/npe/dialogue-script.js`, `en-npe.js` | — | `tests/npe/script.test.mjs` |
| Dialogue box and subtitle bar (40 cps, instant under reduced motion; E / Enter / Space / click next; Esc or Skip skips all; "n / 19") | `game/src/npe/dialogue-ui.js`, `subtitles.js` | — | `tests/npe/flow.test.mjs` |
| Intro flow `idle → prologue → wakeup → dialogue → card → handoff → done`, persisted at `ftf.npe.v1`, `?intro=0/1` | `game/src/npe/flow.js`, `game/src/npe/index.js` | `newPlayerIntro` | `tests/npe/flow.test.mjs` |
| "What waits for you" card (seven rows of 1.3, Start / Show me later), reopenable | `game/src/npe/roadmap-card.js`, `openWhatsNext(ctx)` in `npe/index.js` | — | `tests/npe/flow.test.mjs` |
| Glossary (15 entries of 1.4, search, "For the curious", `attach(root)` for `abbr[data-glossary]`) | `game/src/npe/glossary.js` | — | `tests/npe/tips-glossary.test.mjs` |
| A4 first-seen tips and the queue rules (one at a time, never while busy, 1.5 s gap, three a minute, Skip tips) | `game/src/npe/tips.js`, `en-tips.js` | `firstSeenTips` | `tests/npe/tips-glossary.test.mjs` |
| Iris's voice (file → female speech synthesis → silent; never blocks) | `game/src/npe/voice.js`, `game/public/assets/audio/voice/*.ogg`, `docs/audio/voice.md` | — | `tests/npe/voice.test.mjs` |
| Agent entry in the Season Cup over the API: command `enter_tournament`, `GET /v1/tournament`, OpenAPI | `game/src/ui/tournament-cup.js` (pure core), `server/src/tournament.js`, `server/src/server.js`, `docs/api/openapi.yaml` | — | `server/tests/tournament-agent.test.mjs` |
| Example client: N scripted agents enter and play; prints the sealed leaderboard; exit 0 only if every agent scored | `server/examples/agent-tournament.mjs` (+ optional `onSession` hook in `agent.mjs`) | — | same |
| Season Cup card: Agent / Player badges, Enter the tournament (opens the on-chain entry with its price), Add an agent, agents-only exhibition (real seasons in the browser, seed 5, about a second, "not recorded on chain") | `game/src/play/season-cup.js`, `game/src/play/agent-policies.js` | `agentTournament` | `tests/npe/cup.test.mjs` |

Run the example: `node server/src/main.js & node server/examples/agent-tournament.mjs --agents 3 --time-scale 1000`.

## Seams the integrator (A5) wires

- **Registry entry:** `{ id: 'newPlayerIntro', flag: 'newPlayerIntro', load: () => retryImport(() => import('../npe/index.js')) }`. `mount(ctx)` reads `ctx.storage, ctx.t, ctx.toast, ctx.ledger, ctx.bus, ctx.flags, ctx.reduced, ctx.lockControls(on), ctx.cameraCue(target), ctx.award(c), ctx.base`. All are optional except `storage`.
- **Locales:** add `npe` and `tips` to the `Object.assign` in `en.js`. Until then every A4 module falls back to the English tables itself (`withNpe`).
- **A6's prologue:** set `globalThis.__ftfPrologue = { playLabPrologue({subtitles, reduced}) → 'done' | 'skipped', playWakeUp({reduced}), skip() }`, or pass `ctx.prologue`. Cues come in as bus `prologue.cue {text, speaker, durMs}`. Without it, a 2.5 s "FORGET TO FORESEE / Year 2048." card stands in.
- **Tips:** `registerTips(firstSeen, {fee})` from `npe/tips.js`; `createTipQueue()` is the queue the coach-mark component can use.
- **Settings (A2's popup):** "Replay intro" = `clearNpe(storage)` from `npe/flow.js` and a reload with `?intro=1`; "Reset tips" = the seam's `resetTips()`.
- **Menu:** "What's next" = `openWhatsNext(ctx)`; "Glossary" = `openGlossary({t, vars})`.
- **Altar:** `ftf:tournament-open` opens the Season Cup card when `features.on('agentTournament')`, else the on-chain entry panel (`game/src/boot-world.js`, inside the existing tournament block).

## Open items

- **Stipend:** W17 pays 10 silk once (`ftf.npe.v1.stipend`); the story also grants `stipendC` at `TWIST_DONE`. One stipend in total: waiting on A1's answer. Then either W17 replaces it (pass `ctx.award` = A1's verified grant), or W17 grants nothing.
- **Barks:** the ten lines are in `en-npe.js` (`BARKS` in `dialogue-script.js`). They are not wired into `scenes/barks.js`: until `en-npe` is in the i18n table, a bark would show its key.
- **E2E E1–E7:** written as DOM tests only, because the e2e harness is not on `main` yet.
- **"?" re-show handle and the panels test (7.8):** these belong to the first-seen component.
- **Voice takes:** checked for length only; listen and re-record if needed (`docs/audio/voice.md`).
- **On chain:** the API cup records entries in the simulation only (`settlement: "simulation"`). The coordinator path `enter_tournament_for` exists for guests through the relayer (`/api/town/act`), and the altar's on-chain entry uses it.
