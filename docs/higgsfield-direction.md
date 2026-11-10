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

What Higgsfield MCP is (vendor and third-party pages, see §8; treat as vendor claims):
- A hosted MCP server (`https://mcp.higgsfield.ai/mcp`, OAuth with a Higgsfield account, added in claude.ai as a
  custom connector). Claude writes the code; the MCP generates images, textures, audio, video and, by some listings,
  image-to-3D meshes. Paid in Higgsfield credits (vendor: a game "starts at around 70 credits ($3.50)"; video calls
  are the expensive part).
- The "4 hours" figure is not verified anywhere. Third-party write-ups agree on the limits: the MCP gives asset
  volume, not art direction; generated meshes are starting points, not production topology or rigs.
- **Not connected to our claude.ai account today** (checked 10.11: no Higgsfield connector).

## 2. Direction

**Take the presentation, not the genre.** The video's strength is not its game (a generic sword-and-slime loop) but
how cheaply it *reads* as a finished game: every place is named on arrival, every conversation is framed like a
film, every reward is announced. Our game already has more depth (a committed season, verified proofs, NFT shards,
six agents); judges and players still see "a scene with panels". We borrow the devices that make a world read as
authored and use Higgsfield, if the owner connects it, only for 2D, motion and audio assets around the game.

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

### HF-5 — Generated 2D: portraits, shard art, title plates (P1, after HF-0, ~0.5 day)
- Inputs are **our own renders** (QA renders of `agent_*.glb`, the Guest, the Shells) used as image references, so
  the portraits match the 3D models. Outputs: 7 dialogue portraits (Iris + 5 clans + Guest silhouette), 1 per
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
| 11.11 | HF-1, HF-3 (one worker); HF-2 (one worker); HF-5 generation starts after HF-0 |
| 12.11 | HF-4; HF-6, HF-7 A/B; HF-5 portraits wired into HF-2 |
| 13.11 until 20:00 | QA pass on the judge path, README check, merge; HF-8 only if everything else is green |
| after freeze | No new assets; the jury video is re-rendered only if the owner wants the new framing in it |

Cut order if late: HF-8 → HF-7 → HF-6 → HF-5 → HF-4 Act indicator. HF-1, HF-2, HF-3 are the core of this direction.

## 7. Owner decisions needed
1. Approve the direction "presentation, not genre" (P0 packages HF-1…HF-4 need no Higgsfield).
2. Higgsfield: yes or no. If yes — connect the connector (HF-0) and set a credit cap (proposal: 25 USD total).
3. Licence: confirm that the Higgsfield plan allows shipping its outputs in this public MIT repository and demo.
4. Which generated sets you want: portraits (HF-5), lobby loop (HF-6), music A/B (HF-7), props (HF-8).
5. HF-9: whether the X post gets a "how it was made" thread.

## 8. Sources
- The post and its video: https://x.com/higgsfield_ai/status/2119926932343324795 (text and media via
  api.fxtwitter.com; video watched as 3 s contact sheets).
- Higgsfield Games: https://higgsfield.ai/blog/higgsfield-ai-games
- Higgsfield academy, "Build 3D Games with MCP": https://higgsfield.ai/academy/courses/build-3d-games-mcp/intro-three-games-no-code
- Third-party workflow write-up: https://www.developersdigest.tech/blog/claude-opus-5-5-3d-world-higgsfield-mcp
- Tool listings (disagree with each other): https://composio.dev/toolkits/higgsfield_mcp ,
  https://github.com/jfikrat/higgsfield-mcp
