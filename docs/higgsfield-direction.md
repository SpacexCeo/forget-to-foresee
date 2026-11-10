# Direction from the Higgsfield "AAA in 4 hours" post — proposal and work spec

Status: **proposal, waiting for the owner's answers in §7.** Nothing here is built yet. Written 10.11.2026.
Code freeze stays 13.11 20:00 Kyiv; nothing in this document moves it.

## 1. What the source actually shows

Post: Higgsfield AI on X, 09.11.2026 (https://x.com/higgsfield_ai/status/2119926932343324795): "This AAA game was
built in 4 hours. We gave Claude Fable 5.2 one prompt and Higgsfield MCP: a complex 3D action-adventure, an open
world with a 3-act boss fight, cutscenes; playable in the browser."

Facts from the attached 110 s video (watched frame by frame):
- Third-person browser game: a hero with a sword, dense wind-blown grass, trees, a farm ("Hobb's Farm"), a walled
  town ("Bellhaven"), a castle gate. Armoured enemies, slimes, magic VFX, three hearts and a stamina bar.
- Presentation devices: **zone title cards** when you enter an area (serif name, fades in and out); **NPC dialogue**
  as a letterboxed close-up two-shot with a nameplate box ("Warden Hale", "Townswoman"); an **"Obtained" card** over
  an opened chest ("Suli's Toolbox — a heavy box of tools…"); a quest tracker top right ("The Hollow Bell — strike
  the training dummy 3 times"); a compass strip at the top; warm lit windows; fireflies and floating motes everywhere.
- No boss fight and no cutscene appear in the video itself.

The thread under the post (5 replies, read in full via api.fxtwitter.com on 10.11):
1. Game link: https://sunwarden.higgsfield.app/ ("Sunwarden — The Hollow Bell", desktop browser).
2. World: an 896 m map with 19 named sites (camp, town, castle, harbour, marsh); terrain generated in web workers;
   rocks, stone walls and roofs are **CC0 scans placed by code**; a temple with 8 stages; the final boss fight in 3 acts.
3. Characters: Higgsfield MCP produced only **references** (a three-view character sheet and a 360° turn). Blender
   scripts build every character on **one shared rig**, so any clip plays on any creature; the boss has no
   animations of his own, his dashes, leaps and spins are code.
4. Engine: Vite + three.js, a self-written HDR pipeline (volumetric fog with sun shadows, bloom, depth of field,
   auto-exposure), collision on three-mesh-bvh, **zero audio files**: music and effects are synthesized at runtime.
   A "full breakdown" link (higgsfield.ai/@adilinthewildtempo/blogs/…) answered 404 on 10.11.
5. Building: Higgsfield MCP "generates the art, publishes the game and ships every update".
- The image attached to reply 4 is the one-sentence prompt: *"Build a small 3D action-adventure that runs in the
  browser with three.js: a hero with a sword and a shield, one village, one dungeon with two puzzles and a boss at
  the end. Use only CC0 models and textures, and write bots that play it from start to finish in headless Chrome to
  check every change. When it works, publish it on Higgsfield as a website of type game."*

What the live game's own `LICENSES.txt` says (fetched 10.11) — this is the real reason it took hours, not weeks:
- **Base bodies, hairstyles, rig and all animations: Quaternius** "Universal Base Characters" and "Universal
  Animation Library 1 and 2", CC0.
- **Scanned props, PBR textures and HDRI skies: Poly Haven**, CC0.
- Fonts: Cinzel, Cinzel Decorative, Cormorant Garamond (OFL). Code: three.js, three-mesh-bvh (MIT).
- "Outfits, armour, monsters, boss, sound and music: made for this project."

Same stack as ours, side by side:

| Theirs | Ours today |
|---|---|
| Vite + three.js | same |
| Headless-Chrome bots play start to finish | `game/tests/e2e/hub-season.e2e.mjs` plays a whole judge season in Playwright; `server/examples/agent.mjs` plays over HTTP. Not run in CI (`npm run e2e`, ~15 min on SwiftShader) |
| HDR: volumetric fog + sun shadows, bloom, DoF, auto-exposure | volumetric light shafts, UnrealBloom, bokeh DoF, per-preset exposure (`game/src/render/lookdev.js`); no auto-exposure |
| three-mesh-bvh collision | own swept capsule at 30 Hz |
| Runtime-synthesized audio | 60 procedurally synthesized `.ogg` (`art/audio/`) |
| Characters: CC0 Quaternius bodies + rig + animation library, outfits by Blender scripts from Higgsfield reference sheets | everything procedural from scratch: own armature, **8 hand-coded clips** + `understand`; Iris rebuilt a dozen times against a third-party reference sheet |
| World dressing: CC0 Poly Haven scans placed by code | procedural Blender island and camps, no scans |
| 19 named sites with title cards | 13 places, no title cards |

What Higgsfield MCP is (vendor and third-party pages, see §8; treat as vendor claims):
- A hosted MCP server (`https://mcp.higgsfield.ai/mcp`, OAuth with a Higgsfield account, added in claude.ai as a
  custom connector). Claude writes the code; the MCP generates images, textures, audio, video and, by some listings,
  image-to-3D meshes. Paid in Higgsfield credits (vendor: a game "starts at around 70 credits ($3.50)"; video calls
  are the expensive part).
- The "4 hours" figure is not verified anywhere. Third-party write-ups agree on the limits: the MCP gives asset
  volume, not art direction; generated meshes are starting points, not production topology or rigs.
- **Not connected to our claude.ai account today** (checked 10.11: no Higgsfield connector).

## 2. Direction

**Take the presentation and the CC0 shortcut, not the genre.** The video's strength is not its game (a generic
sword-and-slime loop) but how cheaply it *reads* as a finished game: every place is named on arrival, every
conversation is framed like a film, every reward is announced, and the characters move with a full library of
ready animation instead of a handful of coded clips. Our game already has more depth (a committed season, verified
proofs, NFT shards, six agents); judges and players still see "a scene with panels". We borrow the devices that make
a world read as authored (HF-1…HF-4), take the CC0 libraries that saved them weeks where they fit our pipeline
(HF-10, HF-11), and use Higgsfield, if the owner connects it, the way they did: for references and 2D, motion and
audio around the game, never as shipped hero geometry.

Hard boundaries (from `docs/spec.md` §E "Cut" and the decision log, unchanged):
- No combat, no boss fight with HP, no open world, no genre pivot. The "3-act boss fight" maps onto our existing
  climax, the tick-13 crisis (HF-4), as staging only.
- Engine rules, `baseline-2d-1` parity, v3 and the proof schema are untouched. Presentation never changes state.
- Generated video never appears as gameplay footage in the jury video or the X post (a local-only demo must show the
  real build, Q-012). Generated hero characters never replace our rigged `agent_*.glb` (same armature, clips and
  sockets are load-bearing for animation, faces and films).
- Nothing copies the video's game or any existing game's look, names, characters or music.

## 3. Mapping: their device → our version

| In the video | Our version | Exists today | Package |
|---|---|---|---|
| Zone title card ("BELLHAVEN") | Camp, plaza, balcony and Shell names on first entry per season ("THE SALT COLONNADE", "SHELL II — THE MASSIVE") | Chapter title cards in films only (`game/src/cinematic/overlay.js`) | HF-1 |
| Letterboxed NPC dialogue two-shot + nameplate | Talk camera for clan conversations, offers and the Key | Dialogue strip at the bottom, no framing | HF-2 |
| "Obtained" chest card | "Received" card: memory shard, new word, fragment, first verified proof, testnet ✓ | Toasts and log rows | HF-3 |
| 3-act boss fight | Tick-13 crisis staged in three acts | Crisis film + 12 s VFX, one beat | HF-4 |
| Character art everywhere | Dialogue portraits, shard card art, title plates (generated 2D from our own renders) | None | HF-5 |
| Living backgrounds | Animated lobby background loop | Still image + canvas mist | HF-6 |
| Produced music and SFX | Music stems and Guest voice upgrade, procedural kept as fallback | 60 procedural `.ogg` | HF-7 |
| Dense set dressing | Non-hero props for camps (image→3D) | Procedural camps | HF-8 (optional) |
| Fireflies, motes, lit windows | Already have motes; tune density near camps at golden hour | `game/src/render/motes.js` | folded into HF-1 QA |
| Quaternius CC0 animation library on one shared rig | Retarget selected CC0 clips (idle variants, talk gestures, looks, turns) onto our agent armature | 8 coded clips | HF-10 |
| Poly Haven CC0 scans placed by code | Scanned rocks and ruins on the pillars and plateau rims, a CC0 HDRI check | none | HF-11 |
| Higgsfield three-view sheets + 360° turn as Blender references | Own reference sheets for the clans and the Guest (replaces third-party reference images) | owner-supplied third-party sheets | HF-5 |
| Bots play every change in headless Chrome | Fast judge-path e2e on every push | full-season e2e exists, manual only | HF-12 |

## 4. Work packages

Priorities: **P0** = no Higgsfield needed, ship before freeze; **P1** = needs HF-0; **P2** = only if time is left.
Every package: five UI languages (EN base, UA, RU, IT, ZH) through the existing ICU locales, reduced motion
honoured, skippable, never blocks input longer than the existing film rules allow, `npm test` green, verified in
headless Chromium on desktop and phone emulation with no console errors, README real/mock table updated if a
claim changes.

### HF-0 — Owner setup and licence gate (owner, P1 gate)
1. claude.ai → Settings → Connectors → add custom connector `https://mcp.higgsfield.ai/mcp`, sign in.
2. Set a credit cap for the whole project (proposal in §7).
3. Read Higgsfield's terms for the plan in use and confirm that generated images, video and audio may be shipped in
   an MIT-licensed public repository and a public demo. Without this confirmation HF-5…HF-8 stay out of the build.
Done when: a new cloud session lists Higgsfield tools, the cap and the licence answer are recorded in
`docs/decisions.md`.

### HF-1 — Zone title cards (P0, ~0.5 day)
- On the first entry per season into each place (balcony, plaza, six camps, four Shells, Shell interior) show a
  centred title: name in the HUD serif (Libre Caslon Text / WH Cyrillic, CJK fallback), a thin gold rule, one line
  of subtitle (clan or Shell trait). 2.4 s total: 320 ms fade/rise in, hold, 480 ms out, motion tokens from
  `game/src/ui/motion/`.
- Triggered from the play layer's zone/position data (camp radius, Shell entry), never from engine state. Suppressed
  during films, the tutorial and the judge link's first 3 s; a place already titled this season stays silent.
- Hub mode: the title plays on the fly-in landing.
- Also: re-check mote density near camps and the plaza so the golden-hour air reads as alive (no new system).
- Acceptance: each of the 13 places titles once per season; no overlap with the quest card, toasts or prompts at
  390 px, 1000 px and 1811 px; reduced motion = a 160 ms cross-fade; screen readers get the name once (live region).

### HF-2 — Talk camera (P0, ~1 day)
- When Iris talks to a clan agent (talk, offer, mediation, the Key line, the vote line): the camera eases (480 ms)
  into an over-the-shoulder two-shot using `game/src/cinematic/camera.js`, 2.35:1 letterbox bars slide in, the
  dialogue strip becomes a framed box with a nameplate (clan name, clan colour edge) and, once HF-5 lands, a portrait.
- Leaving the conversation restores the gameplay camera exactly (position, yaw, zoom). The camera sweep still
  prevents clipping; if the two-shot would clip, fall back to the current framing.
- Phones and the low tier: no camera move, letterbox + nameplate only.
- Acceptance: enter/exit 20 conversations in a row without camera drift; no input lost; keyboard, mouse, touch and
  gamepad all close the box; deterministic under `?cinematic=` capture.

### HF-3 — "Received" card (P0, ~0.5 day)
- One reusable card for meaningful gains: memory shard created (with its NFT link if minted), new confirmed word,
  fragment obtained, first verified proof ("Verified ✓"), "Verified on NEAR testnet ✓". Label "RECEIVED", item name,
  one line of meaning, the item's icon or the shard render; seal motion from the motion system, the existing
  stinger from the audio cue table.
- At most one card at a time, queued; never during films; 3.2 s or dismiss. Replaces the toast for those events
  only, the log row stays.
- Acceptance: the judge path (`?demo=judge`) shows the card for the trial-3 verified proof and the testnet ✓ without
  breaking README steps; hint pacing in `game/src/play/hints.js` still holds (no double toast).

### HF-4 — The crisis in three acts (P0, ~1 day, presentation only)
- Act I "The Reading" (tick 13 starts): Ash reads the sign as a weapon — existing crisis film shortened to its first
  shots, Ash's links break visibly (existing VFX), music switches to `mus_crisis`.
- Act II "The Search": play resumes with a single objective ("Find Ash's phrase") and a pulse on the Memories /
  vision action; the HUD shows a three-pip act indicator. Nothing new in the rules: the vision and the phrase are the
  existing mechanics.
- Act III "The Key": speaking the phrase plays a short resolution beat (hash match → Ash returns → links mend) with a
  Received card ("Ash's Key — the phrase matched its commitment"). If the player fails, Act III plays the existing
  failure branch instead.
- Acceptance: both branches reachable on seeds from the parity fixtures; skip never skips a rule or consent; films
  and chapters ledger stay consistent (`docs/chapters.md`).

### HF-5 — Generated 2D: reference sheets, portraits, shard art, title plates (P1, after HF-0, ~0.5 day)
- **Reference sheets first** (what Sunwarden actually used Higgsfield for): a three-view sheet (front, side, back)
  and a 360° turn per clan agent and for the Guest, generated from our current renders plus the decision-log
  descriptions. They become the art references in `docs/art/character-guide.md` for any further Blender pass, so we
  stop depending on third-party reference images. No rebuild of shipped characters before the freeze unless the
  owner asks.
- Portraits and card art use **our own renders** (QA renders of `agent_*.glb`, the Guest, the Shells) as image
  references, so they match the 3D models. Outputs: 7 dialogue portraits (Iris + 5 clans + Guest silhouette), 1 per
  memory type for shard NFT card art, 13 zone title backdrops (optional, subtle).
- Style prompt follows the decision log: hybrid faceted silhouettes, golden hour against cool shadows, restrained
  palette with gold accents, Elden Ring as mood only, no third-party names, characters or motifs in prompts.
- Every file: ≤ 512² WebP for portraits, ≤ 1024² for card art, lazy-loaded, never in the initial bundle.
- Acceptance: owner approves each set; manifest rows and prompts recorded (§5).

### HF-6 — Animated lobby background (P1, ~0.5 day)
- Image-to-video from the owner's `assets/ui/lobby_bg.jpg`: an 8–10 s seamless loop (Shells drift, clouds move,
  glyph glows), no text, no camera cuts. Ship as a muted WebM (VP9) + MP4 fallback, ≤ 3 MB, `poster` = the current
  still, loaded after first paint (the first-seconds rules in `docs/first-seconds.md` win).
- Reduced motion, Save-Data, the low tier and phones on slow networks keep the still.
- Acceptance: the lobby's first paint and the loading screen timings do not regress; the loop has no visible seam.

### HF-7 — Music and Guest voice (P1, ~0.5 day, A/B gated)
- Generate replacements for `mus_calm`, `mus_uneasy`, `mus_crisis` (same length, loopable, same stem roles) and a
  richer `guest_phrase_*` set. Loudness-match to the current mix, encode Opus as the current files.
- Ship only if the owner prefers them in a blind A/B; the procedural files stay in the repo as the fallback.

### HF-8 — Set-dressing props via image→3D (P2, optional, cut first)
- Only non-hero, non-interactive props (crates, banners, lanterns, plants) around camps. Must pass
  `tests/client/assets-budget.test.mjs` (KTX2, meshopt, phone variant), triangle budgets, have simple `_col`
  colliders, and survive close inspection or stay out of the inspect range. Anything that fails is not shipped.

### HF-10 — CC0 animation library on our rig (P0/P1, ~1 day, owner gate: CC0 assets in the characters)
- Source: Quaternius "Universal Animation Library" 1 and 2 (CC0; verify the licence file in the downloaded pack and
  keep it in `art/third_party/quaternius/`). No Higgsfield needed.
- Retarget in Blender onto the shared agent armature (same bone, clip, socket and node names; the face rig and the
  `understand` clip stay ours). Take only non-combat clips: 2–3 idle variants, talk gestures, look around, turn in
  place, sit/kneel at the Scroll, a cheer and a slump for the finale. Iris keeps her own stance and run tuning.
- Clips are added beside the current 8, not instead of them; `game/src/play/behaviour.js` picks idle variants and
  talk gestures. Each glb stays inside its budget (KTX2, meshopt, triangle cap; animation data size checked).
- Acceptance: foot-slip check passes, no hand/face intersections in the review contact sheets (`review_anim.py`),
  the films and NPC director still play, manifest and README name Quaternius CC0.

### HF-11 — CC0 scans for the island (P1, ~0.5 day)
- Poly Haven CC0 rock and ruin scans, placed by code on pillar faces, plateau rims and under the bridges (the
  "monumental weathered stone" of the style reference), through the existing streaming and greybox rules; compress
  with `art/tools/compress-glb-wasm.mjs`, phone variants via `glb_mobile.py`. Optionally compare a CC0 golden-hour
  HDRI with `assets/env/golden_1k.hdr`.
- Acceptance: draw calls and triangles stay inside spec §10 on desktop and phone tiers; no collision changes on
  walkable surfaces; manifest rows with the Poly Haven asset names.

### HF-12 — Judge-path bot on every push (P0, ~0.5 day)
- Their prompt's last rule ("bots play it from start to finish in headless Chrome to check every change") is the
  one AI judges reward. We already have the bots; make a short one run in CI: `smoke` + `proof-line` on
  `?demo=judge` (lobby → trial 3 → "Verified ✓" → testnet ✓ line) in the Pages workflow, with the full season staying
  manual. Document the commands and expected output in the README "Judge in 5 minutes" section.
- Acceptance: the job is green on `main`, takes under 10 minutes, and fails if "Verified ✓" never appears.

### HF-9 — "How it was made" thread (owner, optional)
- The Higgsfield post went far because it showed the process. Our X demo post (required by the rules, draft in
  `docs/submission/x-post.md`) can carry a short reply thread: one season committed on NEAR before the first move,
  agents that built it, the verified proof on screen. Only claims that run (README rule). The owner posts.

## 5. Rules for generated assets
- Folder `art/generated/<asset>/` with `prompt.md` (exact prompt, model, reference images by repo path, date, credit
  cost) and the chosen output; rejected outputs are not committed.
- A row per file in `docs/art/manifest.md`: author "Higgsfield MCP (model …) under owner direction", licence as
  confirmed in HF-0, status `review` until the owner approves.
- README "AI-generated code and content" gains one sentence naming Higgsfield and which assets came from it.
- No real person's likeness, no brand, no third-party character or game in prompts or outputs.
- Budgets: initial load ≤ 10 MB desktop / 6 MB phone (spec §10) is unchanged; generated media is lazy.

## 6. Timeline against the freeze

| When (Kyiv) | Work |
|---|---|
| 10.11 evening | Owner answers §7; HF-0 if Higgsfield is a yes |
| 11.11 | HF-1, HF-3 (one worker); HF-2 (one worker); HF-12 (one worker); HF-10 retarget on the GPU/Blender machine; HF-5 generation starts after HF-0 |
| 12.11 | HF-4; HF-10 clips wired into the NPC director; HF-11; HF-6, HF-7 A/B; HF-5 portraits wired into HF-2 |
| 13.11 until 20:00 | QA pass on the judge path, README check, merge; HF-8 only if everything else is green |
| after freeze | No new assets; the jury video is re-rendered only if the owner wants the new framing in it |

Cut order if late: HF-8 → HF-7 → HF-6 → HF-11 → HF-5 → HF-4 act indicator → HF-10. HF-1, HF-2, HF-3 and HF-12 are
the core of this direction.

## 7. Owner decisions needed
1. Approve the direction "presentation, not genre" (P0 packages HF-1…HF-4 need no Higgsfield).
2. Higgsfield: yes or no. If yes — connect the connector (HF-0) and set a credit cap (proposal: 25 USD total).
3. Licence: confirm that the Higgsfield plan allows shipping its outputs in this public MIT repository and demo.
4. Which generated sets you want: reference sheets and portraits (HF-5), lobby loop (HF-6), music A/B (HF-7),
   props (HF-8).
5. HF-9: whether the X post gets a "how it was made" thread.
6. CC0 libraries: may Quaternius CC0 animations go onto our agents (HF-10) and Poly Haven CC0 scans onto the island
   (HF-11)? The README then says "own procedural art plus named CC0 assets" instead of "made from scratch".
7. HF-12: may the Pages workflow get a ~10-minute browser job (it runs on every push to `main`)?

## 8. Sources
- The post, its video and the 5-reply thread: https://x.com/higgsfield_ai/status/2119926932343324795 (text and media
  via api.fxtwitter.com `/2/thread/`; videos watched as contact sheets; the prompt image read).
- The live game and its licence file: https://sunwarden.higgsfield.app/ , https://sunwarden.higgsfield.app/LICENSES.txt
- Quaternius (CC0 characters and animation libraries): https://quaternius.com ; Poly Haven (CC0): https://polyhaven.com/license
- Higgsfield Games: https://higgsfield.ai/blog/higgsfield-ai-games
- Higgsfield academy, "Build 3D Games with MCP": https://higgsfield.ai/academy/courses/build-3d-games-mcp/intro-three-games-no-code
- Third-party workflow write-up: https://www.developersdigest.tech/blog/claude-opus-5-5-3d-world-higgsfield-mcp
- Tool listings (disagree with each other): https://composio.dev/toolkits/higgsfield_mcp ,
  https://github.com/jfikrat/higgsfield-mcp
