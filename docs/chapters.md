# Chapter films

Short in-engine cutscenes between the chapters of a season, so that anyone from 12 to 95 understands the story
(owner idea 08.11: "films between chapters"). Task P, branch `claude/chapter-films`.

Code: `game/src/play/chapters.js` (the pure half: chapter model, triggers, season ledger, film scripts) and
`game/src/cinematic/chapters/` (the player in the 3D client: camera, overlay, Chronicle menu, glue). Tests:
`game/tests/client/chapters.test.mjs`, `chapters-player.test.mjs`. Review frames: `docs/chapters/` (rendered by
`node tests/client/chapters-stills.mjs`).

## The chapters

| # | Chapter | Trials | When the film plays | What it tells |
|---|---|---|---|---|
| I | Arrival | 1–4 | about two seconds after the world opens | the island, the Shells, the Guests and their signs, Iris, the message in six pieces |
| II | The Language | 5–8 | the first observation of trial 5 | the first reveal and its seal check, Iris's stakes so far, words known, the first clan offer, a lie exposed (if one was) |
| III | Trust | 9–12 | trial 9 | a broken promise or a repaid debt, who trusts Iris most and least, the Price of Memory (what she forgot), broken bridges and tension, the Scroll |
| IV | The Crisis | 13 | trial 13 (after the crisis) | Ash turned away, whom Ash cut off, tension, the state of Ash's Key, the Scroll and its deadline |
| V | The Vote | 14–17 | trial 14 | the pieces on the Scroll, whether the double ring is there, Ash's state, Iris's words and memories, how many trials remain |
| VI | The ending | outcome known | the observation that carries the outcome | the outcome (gift / weapon / a gift refused / a weapon refused / the Shells leave / a broken seal), who voted how, Iris's silk and memories, what she forgot and who holds it, the Heir or the next season |

Each film is five shots of 6 s, a 2.6 s chapter title over the first shot and a 4.5 s final card
"What matters now: …" (37 s in all; the task asked for 20–40 s). One idea per shot, one calm narrator line per shot.

## Storytelling rules

- **Built from what actually happened.** A film is built when it becomes due, from a ledger that only sees what
  the player sees: the per-viewer observation (anchors, memories, relationships, the Scroll, the chronicle and its
  proof checks, votes, outcome) and the room's events (reveals, offers, betrayal memories, broken and mended
  links, the crisis, the Key, memory burns, auctions). No hidden state is read, so a film cannot say anything the
  HUD could not, and it never contradicts the engine. The same seed and the same play give the same films
  (`chapters.test.mjs`, "deterministic per seed").
- **Lines, not lectures.** Every narrator line is one or two short sentences with ICU variants for the facts
  (`chapter.*` strings in `game/src/play/locales/{en,ru,uk,it,zh}.js`; lists such as "Salt, Moss and Frost" are
  joined per language). Subtitles are always on, 17–27 px, at most two lines; the final card is one sentence.
- **Spoken when the player asks for it.** The player's `narration.js` (Task Q) is loaded through a guarded
  import; when narration is on, each line is spoken on the `film` channel (it interrupts hints and clan lines)
  and cancelled on skip. Without the module, or with narration off, nothing changes but the voice.
- **Skippable, never trapping.** Hold any key, or a finger, for 0.7 s to skip the film; a quick tap or key press
  (under 0.35 s) cuts to the next shot, then to the final card, so a viewer can click through a film. The hint
  "Tap: next shot · Hold: skip the film" shows once at 2.2 s and after every tap;
  a tap on the final card ends the film. Every key and pointer event is captured on the window during a film,
  and Iris is held exactly where the film found her (any movement is undone each frame). The season clock
  pauses: the Shell hub's automatic trials stop after the current trial and resume after the film when nothing
  else needs the player; in the walking mode trials end only by the player anyway.
- **Replayable.** The Chronicle (key C, or the round button at the bottom left) lists the six chapters with
  their state (seen / now / skipped / not yet) and replays any film that can be watched; a replay tells the
  story as it was first shown. Chapters passed without their film (never on the normal path) stay watchable.
- **Phones and the low tier: the same films, cheaper shots.** The `cheap` profile keeps every line but holds the
  camera still (J's slow breath, 12 cm) and shows the Shell from outside instead of visiting the interior.
  Reduced motion freezes the still cameras completely and shortens the fades to a few frames.
- **Motion from the motion design system** (`game/src/ui/motion`, Task S, `docs/motion.md`): the title's eyebrow,
  title and rule rise 12 px in a 40 ms stagger over the screen duration (480 ms) and leave over 320 ms; each
  subtitle rises in over 200 ms and leaves in 120 ms; the final card's eyebrow and sentence are staggered; the
  fade to black takes 480 ms; the progress dot of the current shot pops. All of it is evaluated on the film
  clock (`filmMotion` in `overlay.js`), so the frames stay deterministic under the capture clock; reduced motion
  turns every movement into the 160 ms cross-fade. The Chronicle opens with the panel scaling in, its rows
  rising in a stagger, its buttons lifting and pressing (the module's own helpers). `ui/motion/index.js` on
  this branch is Task S's file from `claude/motion`, unchanged (a full merge conflicts in the shared docs).
- **Music and sound from the game's own assets.** One cue per film from `game/public/assets/audio`: the Guest
  call for Arrival, the gift chime for a verified reveal, the memory dissolve when a memory was forgotten, the
  storm crack for the crisis, the vote stone, and the outcome stingers (`sting_weapon`, `sting_survived`,
  `sting_gone`, the gift chime). Stingers and the Guest voice duck the music through the audio runtime.

## How it is wired

- `play/chapters.js`: `createChapterDirector({ obs, storage, mode, profile, reducedMotion })` is fed every
  observation, event and command result; `observe(obs)` returns the chapter whose film is due;
  `build(id)` returns the film script `{ id, numeral, title, shots: [{ id, seconds, cam, line, cue, actors }], card, seconds }`.
  Cameras are plain data: absolute `path` shots (`from`/`to` poses) and two runtime kinds resolved against the
  live scene (`iris`, `interior`).
- `cinematic/chapters/index.js`: `attachChapters(...)` is called once from `play/game.js` (one import, one call,
  one `update(dt)` after the camera rig, two lines in `handleKey`). It owns the safe-moment logic (no flight or
  advance in progress, 1.6 s after the world opened), closes the panels, stops and resumes the hub, re-syncs
  the glass sign after a film, exposes `play.chapters` (`director`, `player`, `chronicle`, `replay(id)`,
  `openChronicle()`, `build(id)`, `dev(id)`).
- `cinematic/chapters/player.js`: performs a film. The camera is written after the rig and before the render
  (the rig keeps following Iris underneath and takes over again at the end), through Task J's camera module
  (`src/cinematic/camera.js`: `dolly` with a look track for moving shots, `static` with a slow breath for
  still ones). `camera.js` and `ease.js` on this branch are J's files from `claude/trailer`, unchanged.
- `cinematic/chapters/overlay.js`: letterbox (2.2:1 on landscape screens, fixed bands in portrait), title,
  subtitle, final card, progress dots, skip ring; all opacities are set from the film clock each frame.
- `cinematic/chapters/chronicle.js`: the replay menu, world HUD tokens, keyboard and touch (48 px targets).
- Seen films are remembered per season commitment (`ftf.chapters.v1`): a random season is new on every load, so the
  Arrival film plays again; the fixed judge seed remembers its films across reloads (`?films=reset` forgets them).
- Dev parameters: `?films=off` (no films), `?films=reset`, `?film=<chapter>` (advance the local season to that chapter and play
  its film at once), `&stills=1` (start paused; the frames tool seeks it), `?tier=high` on SwiftShader (which
  otherwise detects the low tier and plays the cheap films).

## Review frames

Rendered in headless Chromium through SwiftShader (no GPU in the cloud container) on the judge seed
(`cc161d30…`), hub mode, English, 1280×800, with `node tests/client/chapters-stills.mjs` (desktop frames use
`?films=full`; SwiftShader detects the low tier, which would otherwise play the cheap films). The owner's wrap-up
order (08.11 evening) stopped the render after the first film: **five frames of Arrival are in `docs/chapters/`**;
the other films' frames, the 1920×1080 and the 390×844 samples are rendered by the same command (about 90 s per
frame here; a few minutes on a GPU). Where a model had not decoded in time, its greybox stands in (the flat spiral
is the greybox Shell; the real nacre Shell replaces it when it streams).

| Frame | What to look at |
|---|---|
| `arrival-title.jpg` | the chapter title over the crane shot of the archipelago; letterbox, dots |
| `arrival-1-island.jpg` | "An island floats above a sea of clouds…": the island framed whole, the subtitle band |
| `arrival-2-shells.jpg` | the Shell three-quarters from the plaza side (greybox Shell in this run) |
| `arrival-3-guests.jpg` | inside the Shell: the Guest's first sign forming on the glass as ink |
| `arrival-4-iris.jpg` | Iris from the front at head height on the balcony; nameplates hidden |

Earlier runs of the same tool (before the Shell shot was reframed and the stills tool was fixed) also showed the
Scroll shot, the final card over the plaza and the portrait layout at 390×844 (subtitle in the bottom band, two
lines); they were not kept in git. `docs/chapters/stills.json` is written at the end of a complete run.

## Checks

- `cd game && npm test`: 16 chapter tests (`chapters.test.mjs`: model, both play modes on the judge seed in order
  I–VI, facts against the observation, five languages, cheap/reduced motion, determinism, seen store, keys;
  `chapters-player.test.mjs`: timeline, every shot camera of every film above the ground and smooth, runtime
  cameras, letterbox). `npm run build` green.
- Headless Chromium (SwiftShader): the Arrival film starts in hub mode, W does not move Iris during it, a short
  press shows the hint and a 0.9 s hold skips, the Chronicle opens on C with six rows and replays, no console
  errors (one SwiftShader performance warning about ReadPixels, from the renderer itself).
- Not verified here: a human listening to the cue mix with the narration voice; the films on a real GPU at
  60 fps (the container renders at a frame per second or two, the frames above are seeked, not played); a
  gamepad during a film (the pad is polled by `main.js` and is not captured: the menu button would open the
  settings dialog over the film; movement is undone by the pin).

## Open items and requests

- Task J: when the trailer's frame-stepped clock runs (`?cinematic=`), the films step with it; J may cut the
  trailer from `play.chapters.build(<chapter>)` (`docs/collab-requests.md` 9).
- Task Q: the narration contract P calls is Q's `speak(text, { channel: 'film', interrupt: true })` (request 10).
- Tasks G and F: forward `KeyC` and add a Chronicle hotbar entry (request 11). Task I and the README: the Arrival
  film on the judge path (request 12).
- Task O: when the Guests stage lands, pass it as `guests` to `attachChapters` (duck-typed `cue(moment, { force })`);
  the interior shots then call `sign` / `crisis` / `vote` moments.
