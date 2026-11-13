# The Glass Shoal arena: technical spec (owner brief, 13 Nov)

The owner's technical brief for the level-5 boss fight, translated and mapped onto our plan
(`glass-shoal-boss.md`) and the seats' hand-offs (`HANDOFF-glass-shoal.md`, `docs/sprint/HANDOFF-A2.md`).
The reference the owner showed is a quality bar only: nothing of its code, assets or names enters the repo.

- Goal: the Glass Shoal episode (quest → Loomblade → ride → the Hollow Tide → reward) where camera, hits, HUD and
  frame time work together. A pretty still, a menu or unconnected systems is not done.
- Numbers are **starting requirements and tuning hypotheses**, not measurements. Where the brief disagrees with our
  plan or `docs/spec.md`, ours wins and the row says so.
- Behind the flag `glassShoal`; `npm test` green; boot check with `FTF_BASE=/forget-to-foresee/`, flag on and off.

## Seats

| Seat | Branch | Owns in this spec |
|---|---|---|
| **gameplay** | `claude/glass-shoal` (session branch) | episode loop, arena module (`scenes/shoal-arena.js`, `game/shoal-rules.js`, `rpg/shoal-skills.js`), simulation step, movement, arena camera, combat (`game/src/play/` hooks), boss, retry, fight music cues |
| **rendering** | A2, `claude/elise-v2` | settings service and popup, quality tiers and auto-quality (`render/quality.js`), lookdev and `render/shoal-look*.js`, `render/shoal-panel.js`, post, water/VFX look, loading/warm-up, device errors, budgets, benchmark |
| **assets** | Fable | models, rigs, clips, LODs, compression, asset registry entries |

**Evidence rule (all seats).** A claim carries: commit, config (flags, settings snapshot), device, browser, backend,
repro steps, before/after frames or a clip for motion, metrics. Anything not run on the named hardware is marked
**not verified**, with the device and scenario still to run. A screenshot of a control does not prove the parameter
works; a green build does not prove game quality.

---

## 1. Scope and the episode loop — gameplay

Mandatory loop, mapped onto our flow:

| # | Brief step | Glass Shoal |
|---|---|---|
| 1 | Loading with a clear status and error handling | arena chunk loads during the ride; honest stage text if Skip/reduced motion lands before it is ready (§15.2) |
| 2 | Main menu, settings, control check | the game's existing menu and settings popup; F1 control sheet |
| 3 | Short safe tutorial: move, attack, dodge, target | the landing strip before the first slam (the 3 s grace, extendable): one-line prompts for move, Loomblade combo / casts, dodge, target |
| 4 | Transition to the main encounter | the Hollow Tide rises out of the mirror |
| 5 | Fight with three clearly different phases | phases 1–3 of `BOSS.phases` |
| 6 | Defeat with a fast retry, or victory ending the episode | death → landing at the phase checkpoint; victory → chest, XP, title Tidebreaker |
| 7 | Back to the menu without breaking sound, state, settings | fly home / return to town; pause menu exits cleanly |

Build content: one controlled heroine at a time (Iris or Elise), a three-hit base combo, a dodge, a move-to-target
action, one special (Elise's Tempest of Embers; Iris's later), one boss with several attackable points, a small set
of dressing (monoliths, spires, lamp post, rocks).

Out of scope: open world, arena multiplayer, economy changes, big inventories, character editor, native mobile builds.

"Better than the bar" means five results: clear controls; a scene readable in motion; honest, saved settings; stable
frame time; a finished loop. Art comparison stays an expert opinion; technical claims need measurements.

## 2. Architecture and module boundaries — gameplay + rendering

### 2.1 Stack (ours; the brief's alternatives are not adopted)

| Area | Choice |
|---|---|
| Language, build | JavaScript with JSDoc, Vite, hashed production assets |
| Renderer | three.js 0.170 `WebGLRenderer` (WebGL 2), `EffectComposer` post chain; addons from the same three version only |
| Physics | our kinematic capsule and sweeps (`physics/collision.js`: `moveCapsule`, `sweepSphere`, `fixedSteps`) |
| Models | glTF 2.0 / GLB through `render/assets.js` and `render/asset-catalog.js` |
| Animation | `AnimationMixer` plus a game-state layer (`play/anim-library.js`) |
| UI | accessible HTML/CSS over the canvas; no second UI framework; no DOM/UI state update every frame |
| Audio | Web Audio (`audio/mix.js`, `audio/music.js`) |
| Tests | node tests for pure rules, Playwright e2e for flows; GPU checks only on real hardware |

Decoders, fonts and critical game files come from our own origin; game start never depends on a third-party CDN. No
generator service keys in the client. A debug tool (the `?render=1` panel) talks to the same settings service as the
player popup.

### 2.2 Module table

| Module | Our files | Owns | Must not |
|---|---|---|---|
| Boot, assets | `boot-world.js`, `render/assets.js`, `render/warmup.js`, `ui/webgl-guard.js` | loading, capability check, cache, errors | start the fight before required assets are ready |
| Simulation | `scenes/shoal-arena.js` step, `game/shoal-rules.js` | time, step, pause, episode state | depend on the render rate |
| Input | `ui/input.js`, `ui/gamepad.js`, `ui/keybinds.js` | actions and sources | move meshes directly |
| Character | arena movement block, `physics/collision.js` | movement, collisions, states | read DOM sliders |
| Combat, AI | `game/shoal-rules.js`, `rpg/shoal-skills.js`, `game/src/play/` hooks | attacks, hits, targets, phases | change user settings |
| Camera | `render/camera-rig.js` (arena mode) | follow, lock-on, collision, cinematic | store FOV itself |
| Render | `render/shoal-look.js`, `render/lookdev.js`, `render/post.js` | materials, passes, capabilities, GPU resources | decide hit outcomes |
| Settings | `ui/settings-store.js` → registry (§3), `ui/prefs.js`, `audio/mix.js` storage | schema, chosen and applied state, saving | hidden side effects between categories |
| UI | `ui/settings-popup.js`, `rpg/hud*.js`, arena fight HUD | display and user commands | keep a second copy of engine values |
| Audio | `audio/*` | buses, sources, music, spatial | bypass Master or SFX for any sound |
| Diagnostics | `ui/dev-hud.js`, panel fps line, benchmark (§16.4) | metrics, reproducible scenes | replace real results with estimates |

Small modules with clear contracts and small state machines; no ECS unless proven necessary.

### 2.3 Conventions
- 1 unit = 1 m, Y-up, seconds; every attack event is keyed to simulation time. Do not rescale the existing world;
  add a transform layer where scales differ.
- Fix in code before parallel work: action names, coordinate systems, sim clock vs real clock, event shape, asset
  manifest format, resource owners and disposal order.

### 2.4 App states (arena)

States: loading, menu, playing, paused, cutscene (ride, boss rise, victory), defeat, victory, error. Each state
defines input context, sound, cursor, whether the simulation runs, and allowed transitions. Closing a menu never
fires an attack with the same click (G10).

## 3. Settings system — rendering

### 3.1 Single state source
- One settings service for the player popup and the debug panel. It keeps four distinct states per key:
  **chosen** (user), **allowed** (this device), **applied** (what systems actually run), **last saved**.
- Never show "Ultra / on" when a backend limit or a compile error turned the effect off.
- Conflict order: device capabilities bound what is allowed → accessibility limits motion and flashes → explicit user
  choices beat automation → automation changes only permitted keys inside the user's bounds → preset and factory
  defaults fill the rest.
- A cutscene (the ride, the boss rise) may change camera composition temporarily but never overrides no-shake,
  flash limits or a fixed user FOV. Temporary values are never written over user values.

### 3.2 Parameter passport
Before building controls, write a registry entry per key (pure module, e.g. `ui/settings-registry.js`, node-tested):

stable ID · category · type · unit · range · step · default · display · dependencies · required capabilities ·
apply mode · owning system · reset scope · save rule · expected effect · verification method.

Apply modes:

| Mode | Used for | Rule |
|---|---|---|
| Instant | sensitivity, volume, brightness in the approved range, HUD visibility | applied on change |
| On commit | keys that rebuild passes or large buffers | show the chosen value while dragging; apply on release or after 250 ms idle |
| After graphics restart | context-creation parameters | show the reason; save a checkpoint; restore after restart |
| With image confirmation | risky display changes | 15 s to confirm, then roll back; the timer uses real time, runs during game pause, and rolls back safely if the page is hidden |

Change pipeline: validate → prepare resources → apply → verify → **then** save. If a new pipeline fails to build, the
previous one keeps running; the UI shows the error and the actual value. Never dispose the working variant before
its replacement is ready.

### 3.3 Presets and Custom
- Low, Medium, High, Ultra fill **every** graphics key, including values of disabled effects.
- Re-selecting the current preset re-applies it fully. Low → Ultra → Medium equals a clean start on Medium.
- Any manual graphics edit switches the profile to **Custom**; it never touches audio, controls, language or
  accessibility.
- In **Auto** the user picks the target FPS, the scale bounds, and a preference **Sharpness** or **Effects**. Editing
  a key Auto controls offers "lock this key" or "leave Auto"; the choice is visible.

### 3.4 Save, import, export
- A small settings document stored locally with a schema version and migrations (`ftf.settings.v1` → v2 migrates its
  valid fields). Game progress (`ftf.shoal.v1`, ledger, profile) is stored separately.
- Save after a successful apply, coalescing frequent changes; never write storage every frame.
- Storage unavailable: the game runs and says values last this session only. Corrupt data never breaks start-up.
  Valid old fields migrate; unknown fields are not applied.
- Import/export: only our own settings JSON, ≤ 64 KiB. Import checks types, finite numbers, ranges, enums and
  dependencies; never executes text; lists the changes before applying; an invalid import changes nothing (atomic).
  Reject arbitrary URLs, paths and prototype keys (`__proto__`, `constructor`, `prototype`).
- Category reset and full reset never delete progress.
- Export separates **preferences** from a **diagnostic snapshot** of applied values (build version, backend, limits);
  the snapshot cannot be silently imported as preferences.

## 4. Image and performance settings — rendering

Starting values are our own test profile; the real default comes from the device test. Accessibility prefs are the
same in every profile.

| Setting | Values, start | What must change | Proof | Maps to |
|---|---|---|---|---|
| Profile | Auto, Low, Medium, High, Ultra, Custom; start Auto | the full graphics key set | snapshot of the effective profile | `prefs.quality`, §6 |
| Target FPS | 30 / 60 / 120; start 60 where possible | auto-quality target | frame budget changes | governor budget (§7) |
| FPS limit | 30 / 60 / 120 / no extra limit | frame submission rate | frame-pacing graph | `fpsCap` (today 0/30/60) |
| Scene scale | 50–100 %, step 5 %; manual start 100 % | 3D buffer size, not HUD size | actual width/height | `resScale` |
| Dynamic resolution | on/off; on in Auto, minimum 67 % | scale inside chosen bounds | scale history with reasons | governor `pixelScales` |
| Upscale sharpness | 0–100 %, start 15 % | the chosen upscaler's parameter | frames on thin detail | shown only when a sharpening upscale pass exists |
| Anti-aliasing | Off / FXAA / SMAA / temporal | the real edge method | pipeline and motion frames | MSAA 4x + SMAA today; "temporal" hidden until a velocity-based pass exists |
| Shadows | Off / low / medium / high | maps, cascades, distance | buffers, thin-shadow scene | `render/shadows.js`, shoal CSM |
| Contact shadows | on/off where supported | local contact darkening | foot-on-floor scene | GTAO / blob discs |
| Indirect light | Basic / GTAO / SSGI | the available AO/GI scheme | corners and colour-bleed scene | GTAO in `post.js`; SSGI not offered on WebGL 2 |
| Reflections | Basic / water / extended | probes, planar or SSR per profile | camera at the water, screen edges | shoal flat: PMREM / `Reflector` / + SSR |
| Volumetric light | off / low / high | sample density, effect resolution | ray in mist, GPU metric | `GodRaysPass` |
| Bloom | 0–100 %, start 20 % | glow intensity | bright object on dark | `UnrealBloomPass` strength |
| Motion blur | off by default; 0–100 % | a separate motion blur | camera pan | new, optional |
| Depth of field | off / cutscenes only / always; start cutscenes only | where DoF runs | near and far target | ride and boss-rise shots |
| Film grain | 0–100 %, start 0 % | added noise | static flat surface | `GradePass` grain (the grade's built-in fine grain is art base) |
| Environment detail | low / medium / high | LOD and dressing distance | geometry; landmarks kept | spires, rocks, mist sheets |
| Particles | low / medium / high | cosmetic VFX limits | particle counters in a busy fight | `vfx/` pools |
| Texture quality | 512 / 1024 / 2048 as set levels | loads prepared variants | texture sizes, resource accounting | asset variants (§14) |
| Brightness | exposure −1…+1 EV; start 0 | exposure around the art base | calibration scene | `toneMappingExposure` × look exposure |
| Fullscreen | if the platform allows | the real window mode | API state change | Fullscreen API |
| Performance monitor | off / brief / detailed | diagnostic overlay | FPS, frame time, backend | `ui/dev-hud.js`, panel fps line |

Rules:
- Never call an image "native" when a DPR cap or upscale limits it. Show e.g. "Output 1920×1080; scene 1440×810;
  upscaled". Compute sizes from the actual buffers.
- Output resolution = CSS size × DPR × the chosen cap; scene resolution = a separate 0.50–1.00 multiplier of output.
  At DPR = 1, scale 50 % halves both sides of the 3D buffers (today a pixel-ratio cap can swallow the scale: fix and
  test, S09). Align sizes as each pass requires.
- An FPS limit is not VSync control; "no extra limit" is still bounded by browser, display and device. No fake VSync
  toggle. Never promise 120 FPS on a 60 Hz display. Show GPU time only when measurable, else "unavailable".

## 5. Controls, camera, sound and accessibility settings — rendering (store, UI); gameplay (arena consumers)

### 5.1 Controls and camera

| Parameter | Range, start | Behaviour |
|---|---|---|
| Rebinding | keyboard, mouse, supported gamepad | two bindings per action; conflicts detected before saving (`rebind()` swap question) |
| Mouse sensitivity | 0.1–3.0×; start 1.0× | its own multiplier for relative mouse motion |
| Stick speed | 30–300°/s; start 150°/s | independent of FPS |
| Invert Y | separate for mouse / stick / touch; start off | never inverts character movement |
| Stick dead zone | 0–30 %; start 12 % | radial, rescales the remaining range |
| Stick curve | linear / smooth; start smooth | show a small response graph |
| Camera smoothing | 0–100 %; start 20 % | affects follow only; no hidden lag on raw input |
| Vertical FOV | 50–85°; start 60° | the base game FOV |
| Camera distance | 2.5–7 m; start 4.5 m | collision shortens it temporarily |
| Camera shoulder | left / right / centre | saved and respected by collisions |
| Camera auto-assist | off / light / normal; start light | manual input takes priority for a while |
| Lock-on | hold / toggle | visible target; clear release |
| Shake | 0–100 %; start 25 % | off = no shake source at all |
| Dynamic FOV | on/off; start off | off: speed and hits never change the base FOV |
| Vibration | 0–100 %; where supported | only on a verified device (`audio/haptics.js`) |
| Touch HUD | size 80–150 %, opacity, layout | saved separately for phones; buttons outside the safe area |

- Bind game keys by physical code, display by layout; check Russian and English layouts. Text input in menus never
  fires heroine actions. Escape/Back always leaves rebind mode; the player can never lose access to the menu.
- Separate, labelled settings per device (mouse vs stick vs touch); one sensitivity never silently applies to another.

### 5.2 Sound

| Parameter | Start | Requirement |
|---|---|---|
| Master | 80 % (ours: 0.8) | controls every source |
| Music | brief 60 %; ours stays 0.7 | its own music bus |
| Effects | brief 80 %; ours stays 0.35 | hits, ambience, synthesised effects |
| Interface | 65 % | navigation, confirms, errors (new bus) |
| Dialogue | 80 % if any | its own bus; hidden when there is no content |
| Dynamic range | normal / night | proven with a loud and a quiet scene |
| Sound in background | off | follows page visibility |

All sliders 0–100 %; 0 is a physical mute of that bus. One shared non-linear volume curve; 30–80 ms ramps (no clicks).
"Test sound" buttons play a short sample on the chosen bus. Existing buses in `audio/mix.js` keep their defaults.

### 5.3 Accessibility
- Required: UI scale (ours 100–200 %, covers the brief's 80–150 %), subtitle scale covering 100–175 %, a contrast
  backing for subtitles, speaker names, reduced motion, a separate flash limit, hold/toggle for repeated actions,
  important states never shown by colour alone.
- Touch targets ≥ 44 CSS px; main combat buttons 56–72 px (fight HUD: 64 / 58 px today). Visible focus; menus fully
  navigable by keyboard and gamepad; sections, plain descriptions, keyboard changes, reset of the current category.
- Reduced motion turns off shake, roll, dynamic FOV and motion blur and shortens decorative UI flights, **also in
  cutscenes and specials** (the ride, the boss rise, Tempest of Embers). The flash limit has its own behaviour and test.

## 6. Starting graphics presets — rendering

Starting points; after measurement the seat pins profiles per test device. A device name alone does not define
performance.

| Parameter | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Anti-aliasing | FXAA | SMAA | TRAA where supported | TRAA where supported |
| Shadows | 1024, 1 cascade | 2048, 2 cascades | 2048, 2 cascades | 2048, 3 cascades |
| AO and GI | basic lighting | GTAO moderate | GTAO high | SSGI after verification |
| Reflections | environment probes | probes + cheap water | one planar water pass | planar; SSR on suitable surfaces |
| Volumetric rays | off | low | medium | high |
| Texture quality | 512–1024 | 1024 | up to 2048 | up to 2048 on key assets |
| Cosmetic particles | 35 % of budget | 60 % | 85 % | 100 % |
| Dressing distance | 50 % | 70 % | 90 % | 100 % |
| Motion blur and grain | off | off | off | off |
| DoF | user choice | user choice | user choice | user choice |

Mapping onto our stack:
- Tiers stay `ultra | high | low` (+ the phone profile) so code keyed on them keeps working. Presets are full key
  sets layered through `applyOverrides`: Low → `low`, **Medium → a preset over `high`**, High → `high`, Ultra → `ultra`.
- WebGL 2 today: "TRAA" falls back to the existing MSAA 4x + SMAA and is labelled so; Ultra AO is GTAO high (SSGI is
  not offered). Shadows: `shoal-look.js` runs 3 cascades on high and 4 on ultra; align with the table or record the
  measured reason in `docs/decisions.md`.
- Volumetric rays multiply the look preset's god-ray amount; at amount 0 the pass is skipped (owner 13.11: light,
  no sun disc).

Rules:
- Quality never changes hitbox sizes, simulation rate, attack durations or danger warnings. Dressing distance never
  removes an enemy, cover, a walkable surface or the target marker.
- Below 100 % scale the temporal branch uses one suitable temporal upscaler, never a chain of them; otherwise a
  verified spatial one. The menu name matches the real algorithm.
- Screen-space GI depends on temporal filtering; prove its compatibility with temporal upscaling before using it
  with dynamic resolution, until then use GTAO. It is screen data, not world GI.
- No pointless Ultra (noise, blur, huge resolution). 4K textures, 4096 shadow maps and extra reflection passes only
  after a quality-vs-cost comparison.

## 7. Auto-quality algorithm — rendering

Replaces/extends `TierGovernor` in `render/quality.js` (pure, node-tested). It keeps the frame budget steady; it never
rewrites saved settings or bounces quality up and down.

1. At start check the backend, required formats, creation of needed buffers and a minimal render. Run a short
   calibration after warm-up, then keep assessing during real play.
2. Take first data after loading and compilation. Exclude a hidden tab, menus, artificial pause, asset loading and
   pipeline transitions.
3. Keep a ~1 s window: exponentially smoothed mean, p95 frame time, CPU stages and GPU time when available. Never
   pass CPU submission time off as full GPU render time.
4. Total budget B = 1000 / FPS: 33.33 ms at 30; 16.67 ms at 60; 8.33 ms at 120. Initial GPU budget ≈ 85 % of B,
   then corrected per profile. CPU and GPU overlap; never just add their times.
5. Thresholds: step down when sustained above 1.08 B for ~2 s; step up when below 0.82 B for ~8 s. Re-decide at most
   twice per second; hold at least 3 s after a change.
6. GPU-bound: first change resolution inside the user's bounds. Next scale ≈ current scale × √(GPU budget / measured
   GPU time) (a pixel-load approximation); limit each change to one 5-point step and verify the result.
7. CPU-bound: do not treat fewer pixels as the main cure. Check draw calls, decorative AI rate, distant animation
   updates, allocations and DOM. Never reduce required combat precision.
8. At the bottom of the scale, drop allowed effects one at a time: SSR, volumetric light, reflection detail, cosmetic
   particles, AO/GI, shadows. With the **Sharpness** preference, start with effects earlier.
9. Restore in reverse order with a longer stability period. Restoration includes effects turned off earlier, not
   only resolution.
10. Show the current scale and a short reason for the last change. Never save each automatic swing as a preference.

- No GPU timer: conservative decisions from frame time and our CPU metrics, flagging the uncertain classification.
  Never lower quality because a 60 Hz display caps a requested 120.
- Constant budget breach at the minimum profile: offer a lower FPS target. Never lower sharpness forever.
- Calibration does not prove stability on a warm phone: a separate run of at least 15 minutes (G18).

## 8. Lighting and post passes — rendering

### 8.1 Art base
One clear profile: readable silhouettes, large forms, limited palette, one main light accent, controlled detail
density. Iris/Elise, the Hollow Tide, the walkable flat and attack telegraphs must read with every optional effect
off. For the Shoal: low warm key light, cool sky fill, crystals as the bloom accent (`glass-shoal-boss.md`, look
target).

### 8.2 Lighting
- Start from the key directional light, environment lighting (PMREM sky) and few local lights (the lamp post).
  Emissive does not light neighbours by itself; bounce comes from the chosen light system, probes or verified
  screen-space GI.
- Shadows: stable cascades, texel-grid snapping where applicable, bounded distance, matched bias and normal bias.
  On the moving heroine check acne, peter-panning and shimmer. No dynamic shadows on decorative lights.
- Base colour and emissive in their colour space; normal, roughness, metalness and AO are data. One tone mapper,
  one transform order: no double exposure, double tone mapping or second sRGB conversion.

### 8.3 Pass composition
- Two verified branches. **Temporal**: HDR colour, depth, normals and valid velocity first; then AO/GI/reflections
  and temporal resolve; then art effects and the single output transform. **Spatial**: respect the colour space FXAA
  or SMAA needs in our implementation (FXAA after the colour transform is a separate case). No one fixed order is
  right for every method. The HUD stays sharp over the final image.
- Today (`shoal-look.js`): RenderPass → GodRaysPass (skipped at 0) → bloom (HDR threshold 2.2) → OutputPass → LUT
  grade with vignette. The spatial branch; any temporal pass needs depth/velocity, MSAA off in that branch, velocity
  that covers skinned and deforming meshes (or an honest fallback); test transparent particles, bright trails and
  disoccluded areas.
- Reset temporal history on teleports, hard camera cuts, resolution changes, scene restart and incompatible FOV
  changes; never carry the previous frame across a scene change.
- DoF runs in cutscenes by default. Motion blur, flare and grain are optional expression, never a cover for bad
  geometry. Cap bloom so telegraphs and character shapes never turn into light blobs.
- A numeric uniform change never rebuilds the pipeline (S12). A graph change rebuilds under control, with warm-up and
  disposal of old resources. Each render target has one owner.

## 9. Water, environment and VFX — rendering (look); gameplay (telegraph data)

- **The flat** (mirror-wet salt): two scrolling normal-map layers for the fine surface (the ripple normal), sizes in
  world units, direction matched to the wind. **The open sea** around the island (seen on the ride and past the rim):
  2–4 matched Gerstner waves for large forms plus the same two normal layers.
- Reflection by Fresnel (Schlick, chosen F0): more reflection at grazing angles, more visible base colour from above;
  tune per material, never by raising brightness. Colour absorption follows film/water thickness exponentially, with
  depth in one coordinate system.
- Foam / wet rings at contact: around monolith and rock bases, from the heroine's movement and from slams. No random
  white blotches. Trails are pooled with a lifetime.
- Base profile: environment reflection and a stable colour (phones: `MeshPhysicalMaterial` + PMREM sky). Higher: one
  planar reflection of the main surface with bounded resolution and an object list (`Reflector`). The reflecting
  surface is excluded from its own pass; no recursion.
- SSR helps some wet solids but fails at screen edges and cannot see off-screen objects: always a fallback and a
  smooth fade at borders. SSR alone never covers the flat's reflection.
- Visual waves never move gameplay colliders. The walkable surface is separate verified geometry (`ARENA`, the rim
  soft wall). Edges, steps and platform rims read even at low water quality.
- Attack VFX: pooled sprites/meshes, short trails, few local flashes. **Required warnings vs cosmetics**: auto-quality
  may drop sparks, never the slam ring, sweep band, lunge line, projectile path or the weak-point marker.
- Check transparency overdraw, sorting, intersections and sudden brightness jumps. On the low profile expensive
  refraction becomes a matched cheap material, never black or invisible water.

## 10. Simulation time and movement — gameplay

- The arena fight runs on a fixed 1/60 s step; render uses an accumulator and interpolates previous/current state.
  At most 4 steps per displayed frame; overflow is logged by diagnostics and the debt is not stretched forever. (The
  town's 30 Hz physics step, `docs/spec.md` and `docs/movement.md`, is unchanged.)
- Pause, hidden tab and focus loss clear queued actions and suspend the simulation. On return, never catch up a
  minute with hundreds of steps. Menus, the image-confirmation timer and device recovery use a separate real clock.
- Input is collected separately. A press is consumed once on the right tick; a hold is a state. Several steps in one
  frame never repeat a single press.

Heroine movement per step:
1. Read the move vector; normalise to remove diagonal speed-up.
2. Convert into the camera's horizontal frame.
3. Get target velocity; limit acceleration/deceleration.
4. Compute vertical velocity, support, steps and slope (Elise: lift and the ~6 m soft ceiling).
5. Check the capsule move and move-and-slide (`moveCapsule`; monoliths, rocks, the rim).
6. Update authoritative position, state and animation.
7. Hand interpolated state to render; hits are computed from the simulation.

Vertical capsule; the model's visual yaw is separate from the symmetric collider. The capsule controller does not
solve weapon rotation collisions (§12 sweeps do).

| Design value | Brief start | Ours |
|---|---|---|
| Walk | 2.0 m/s | — (no walk in the fight) |
| Run | 5.0 m/s | `HERO.speed` 6.5 m/s stays |
| Acceleration | 25 m/s² | adopt |
| Max slope | ~45° | adopt |
| Step height | 0.25 m | adopt |
| Coyote time / input buffer | 100 ms / 150 ms | apply to Elise's take-off (double-tap jump / Lift) |

Movement, attacks and dodges take the same time and cover the same distance at 30/60/120 FPS (G03). No jump is added
just for the feature list.

## 11. Input and camera — gameplay (arena); rendering (device-settings plumbing)

### 11.1 Device independence
- Mouse gives relative motion, never multiplied again by frame time. The stick sets an angular speed integrated over
  time. Touch rotation accounts for the CSS size of the area and display density, so a DPR change does not change
  sensitivity.
- Stick: radial dead zone → zero below the threshold, the remaining range rescaled to full, then the response curve.
  Circles stay circles; no diagonal boost.
- Mouse look stays right-drag (`ui/input.js`). Pointer lock is optional in the arena, requested only after a user
  gesture; refusal and exit are handled; without it, drag-to-look or the gamepad, with the limit shown.
- Menus and the fight are separate input contexts: with settings open, camera and attacks ignore sliders. Gamepad
  disconnect clears held buttons and axes; reconnect needs no restart. Prompts show the source in use and its bindings.

### 11.2 Follow and collisions
- Follow a pivot at chest/shoulder height with the user distance and shoulder. Smoothing factor 1 − exp(−k × dt), so
  the feel is FPS-independent.
- Sphere cast (not a thin ray) from pivot to the desired position (`sweepSphere`, `MASK_CAMERA`). Pull in fast on an
  obstacle, ease back out slower. Check minimum distance, near plane and wall corners. Fade the heroine model when the
  camera is critically close; never show the inside of a mesh.
- Lock-on keeps the heroine and the target in frame; distance depends on their separation and the target size in a
  bounded range (the Hollow Tide is colossal); no sharp orbit on switching. Manual input wins for a set period, then
  allowed assist eases back.
- The base FOV belongs to the settings service. Combat, speed and cinematic offsets apply on top with explicit limits;
  the user value returns after the effect. No other system sets a hidden permanent FOV (S17).
- Teleports and snaps (death respawn, ride → landing, fly home): a short follow or a soft snap with temporal history
  cleared; never pass the camera through a wall for smoothness. Under reduced motion keep clear orientation, no roll,
  no strong zoom.
- On aspect change keep the vertical FOV definition and recompute the projection. Check 16:9, 16:10, 21:9 and phone
  landscape.

## 12. Combat and target selection — gameplay

### 12.1 Actions
- Every action has windup, active and recovery phases; damage only in the active window. Action data: durations,
  motion, weapon path, allowed transitions, resource cost, effects, cancel rules (`rpg/shoal-skills.js` grows these
  fields).
- Base combo: three visibly different strikes (Iris: Loomblade 3-hit; Elise: Ember Palms chain). Feel target: the
  first response on the next tick; light windup ~120–180 ms; next-input buffer 150 ms. Exact windows are fixed after
  the clips are chosen, not faked with a rough timer.
- Animation events fire when their time mark is crossed, even if a step jumps past it; each event fires once.
  Animation speed changes and hit-stop stay matched to damage windows.
- Hits use sweep volumes between the previous and current weapon/projectile position, or a pre-authored action path.
  Each swing keeps a set of already-hit targets: no multi-hit per swing, no FPS dependence (G04, G05). For fast moves,
  add sub-samples from the motion and hitbox size; one distance check per displayed frame is not enough.
- A debug view shows the attack volume, the active window, contact IDs and the reject reason.
- Dodge has an explicit i-frame window. Starting hypothesis: total 0.40 s; invulnerable 0.10–0.24 s (today
  `HERO.dodgeTime` 0.45 with i-frames for the whole dodge; move to the window in the tuning pass). Start and end are
  game events; distance is limited by collision.
- A hit is confirmed by a short sound, a target reaction, a small hit-stop and a readable effect. Hit-stop is a time,
  not a frame count; UI and camera use their matched clocks. Accessibility reduces flash and shake but keeps the hit
  information.

### 12.2 Target algorithm
1. Filter out: destroyed, out of range, occluded, inactive in the current phase.
2. Score candidates on normalised criteria:

| Criterion | Weight |
|---|---|
| closeness to the aim centre | 0.45 |
| suitable distance | 0.25 |
| weak-point priority (the open crest) | 0.20 |
| keeping the current target | 0.10 |

- A new target must beat the current one by a hysteresis of ~0.15 and stay valid ~100 ms. An explicit player switch
  beats the automatic score. Off-screen targets only by a defined rule and with an indicator; never a sudden turn
  toward an unseen enemy.
- Candidates: the Hollow Tide's body, its weak point (an entity, §13), adds.

### 12.3 Moving to a target
Applies to every action that carries the heroine to a target or point (Iris's dash strike to the locked target,
Elise's flight hop).
- Before the move check: target reachable, resource, approach point, room for the capsule, support, allowed path.
  First build rule: **obstacles are never crossed**. Passing through specific objects later is a separate, explicit
  property.
- Charge the cost only after the action is reserved. If the point becomes invalid before execution, cancel or take a
  safe alternative by a fixed rule. Never spend the resource and leave the heroine inside a wall. A target that dies
  mid-move never breaks the return to the normal state (G07).

## 13. The enemy and the episode — gameplay

- A finite state machine with phases and an attack table (`BOSS` in `game/shoal-rules.js`); no big behaviour tree.
- Phases stay ours: above 66 % / 33 % / below (`BOSS.phases`; the brief's 70 % / 35 % split is not adopted). Intent per
  phase: 1 teaches the basic warnings; 2 adds combinations and a shifting safe zone (lunge, adds); 3 raises the tempo
  without cutting readable windows. Phase transitions are idempotent and never fire twice.
- Each attack is described by: selection conditions, minimum distance, windup, direction-lock moment, active area,
  recovery, cooldown. Heavy-hit warning starts at 600–1100 ms and never drops below 600 ms (ours: telegraph 1.4 /
  1.15 / 0.9 s; phase 1's 1.4 s is a deliberate teaching value). Direction stops tracking the player before the
  active phase, so a dodge stays meaningful.
- The attack director excludes invalid actions, respects cooldowns, never uses the same attack more than twice in a
  row, and picks among allowed options with a reproducible seed for tests (the seed does not imply bit-identical
  physics on every device).
- Weak points are separate entities with state and markers, not just paint on the model (`exposeBoss` becomes a
  crest entity). Their position updates in sync with combat transforms; they stay readable with effects off.
- The pre-fight checkpoint saves the needed state. A retry clears projectiles, temporary effects, targets, AI timers
  and the previous fight's music. The outcome is decided by the simulation; a cutscene only shows it. Skipping a
  cutscene runs the required completion events with no duplicated reward or transition (G12).
- The pearl dragon is a mount, not a combat companion; it never blocks the path or pulls the camera without reason.

## 14. Assets, rig and animation — assets (Fable); import and wiring: gameplay

- AI-assisted generation is a production stage, not proof a model is game-ready. Order: concept art → model → scale
  and silhouette check → topology → UV and materials → rig → weights → clips → LOD and compression → import → check
  under the real lighting (`shoal.html`).
- Clean deformation of shoulders, hands, pelvis and knees matters more than detail. A smooth static model without a
  verified rig is not a game asset.

| Budget (LOD0, starting) | Triangles |
|---|---|
| Heroine (Iris, Elise) | 15–30k |
| Other notable character (pearl dragon, adds) | 10–20k |
| Large boss (the Hollow Tide) | 30–60k |

- Lighter phone variants; triangle budgets never replace control of materials, skinning and overdraw. 2–4 main
  materials per heroine; 1K or 2K textures on key objects; repeated props merged by material or instanced. Never one
  high-poly mesh for the whole arena; split by visibility and play zones.
- **Skeleton contract**: bone names and hierarchy, rest pose, scale, orientation, root, sockets (Loomblade hand
  socket, dragon saddle socket). If an auto-rigger is used, pin its normalisation and retarget procedure; a "humanoid"
  label alone does not prove compatibility.
- Clips (from `glass-shoal-boss.md`), plus the brief's base set for each heroine: idle, start/stop, run, turn, three
  strikes, dodge, hit, death, move-to-target windup/finish, victory.
  - Iris: Loomblade draw, idle-ready, 3-hit combo, heavy slash, dodge roll, fingers on the grip.
  - Elise: take-off, hover idle, fly forward/back/side with bank, land, Ember Palms and Gale Discs on the ground and
    in the air, Tempest of Embers rise-and-release.
  - Pearl dragon: glide, flap, bank left/right, land, take-off. Hollow Tide: rise, slam, lunge, sweep, roar, hit, death.
- A locomotion graph plus a separate action layer. Prefer in-place locomotion driven by the controller; a single
  attack may carry an authored offset curve checked against collision. Root motion is never added on top of the same
  controller motion.
- The weapon hangs on a socket. Feet do not visibly slide at constant speed; turns have transitions; the sword never
  passes through the hand. Foot IK comes after correct clips, not instead. Additive poses and secondary motion stay
  bounded and never distort combat hitboxes.
- Tools: glTF Transform for inspect/validate and targeted transforms; Meshopt for geometry/animation; KTX2/Basis for
  textures (different jobs). Configure the KTX2 loader to the renderer's real support; check textures after
  transcoding and decode time on a weak device.
- Registry entry per asset (`render/asset-catalog.js`): origin, licence to use, version, scale, triangle count,
  materials, textures, LOD, rig, clips, limits. Source work files are kept apart from the optimised game export.

## 15. Sound, loading and recovery

### 15.1 Sound — gameplay (fight cues, music states); rendering (bus settings)
- Every source goes through its category bus and Master; synthesised UI sound obeys the same buses as files.
- The AudioContext starts after the first user action. If the browser blocks playback, show a clear "enable sound"
  action; the game never hangs. Restore the context correctly after returning from the background.
- Music states: calm (landing), fight, intensified phase, defeat, victory. Crossfades; for independent layers a
  verified equal-power transition with the summed level controlled. Short combat sounds: polyphony limits and small
  variation that keeps them recognisable.
- Every audio warning of an attack also has a visual one; spatial audio helps with direction but is never the only
  channel.

### 15.2 Loading — rendering
- Show the stage and real progress where the size is known: prepare, required assets, decode, warm-up, ready. No
  invented percentages creeping to 99 %.
- Split required from background resources. The arena streams during the ride; the landing waits only for required
  assets, and the "ready" state is honest. A failed required GLB shows retry and the reason; a failed optional sound
  uses a fallback (and today's placeholders stay valid when a model is missing, `hasModelFile`).
- Warm up the material/pass combinations actually used and the first combat effect (`render/warmup.js`). On a quality
  change re-warm what is needed, under control. Never precompile every theoretical settings combination.

### 15.3 Device errors — rendering
- WebGL 2 is our only backend. Without it, `ui/webgl-guard.js` shows the "3D unavailable" message, the requirements
  and a re-check button; never an endless "Loading".
- On context loss (`webglcontextlost`): pause the simulation, save what is available, release resources by the
  supported path and try to restore. If a reload is needed, offer it explicitly with preferences and the checkpoint
  kept. Never promise seamless recovery until it is tested.
- Cache policy prevents mixing new JS with old assets (hashed Vite assets). A service worker or offline mode only
  after stable base loading, with its own update test.

## 16. Budgets and the measuring method — rendering

### 16.1 Test machines
Before optimising, pin each machine: CPU/GPU model, memory, OS, browser and version, backend, output and scene size,
power state, quality profile. Minimum: one Windows PC with a discrete GPU, one integrated-graphics device, one real
iPhone/Safari, one Android/Chrome (phones claimed only after their run).

### 16.2 Frame targets (agreed device set; not a promise for every machine)

| Profile | Target | Pass after warm-up |
|---|---|---|
| Desktop High, output 1920×1080 | 60 FPS | mean FPS ≥ 57; p95 frame interval ≤ 20 ms; 1% low ≥ 45 |
| Integrated Medium, agreed resolution ~900p | 60, or an explicitly chosen 30 FPS | the same relative requirements for the chosen target |
| Mobile Low, agreed internal resolution | 30 FPS | mean FPS ≥ 29; p95 ≤ 36.7 ms; 1% low ≥ 24 after 15 minutes |
| Ultra | quality on the measured device | its own cost report; never the default for an unknown device |

At 60 FPS the control budgets are CPU ≤ 6 ms and GPU ≤ 13 ms per game frame: overlapping stages, not addends. Find the
real bottleneck by profiling.

### 16.3 Content and loading
- Draw calls and triangles: **`docs/spec.md` caps apply** — desktop ≤ 120 draw calls, ≤ 500k triangles; mobile ≤ 65,
  ≤ 180k (the brief's looser 200/400 draw calls and 250k/700k triangles are not adopted). State whether extra passes
  (reflector, shadows) are counted. Going over needs a measurement and a reason; meeting the caps does not by itself
  guarantee FPS.
- The game's initial load stays within the spec (≤ 10 / 6 MB). The lazily loaded arena: critical compressed package
  ~15 MB or less (what the landing needs), full episode content ≤ 50 MB as a guide. On a 20 Mbit/s link with ~80 ms
  RTT, reach a controllable state within 12 s on desktop and 18 s on mobile (the ride covers most of it). Record cold
  and warm starts separately.
- Track texture and render-target memory, not file sizes: one uncompressed RGBA8 2048×2048 texture is 16 MiB without
  mips and ~21.3 MiB with a full mip chain; a PNG's file size is not its GPU cost. Count shadow maps, HDR buffers,
  temporal history and the reflector separately.
- `renderer.info` does not measure all GPU memory. Show resource counts, the computed memory of known buffers and the
  measurements actually available, separately.
- Never measure GPU performance on headless or software renderers (SwiftShader, llvmpipe) and never carry such results
  over to real devices. The A2 look was tuned under software GL: retune and measure on the GPU server.

### 16.4 Single benchmark
- One scripted 60–90 s run (`shoal.html?bench=1` or the arena with a fixed seed): calm scene, camera along fine detail
  (spires, rocks), a fight with VFX, the large boss, the reflecting flat, a fast move to target. Fixed seed and input
  sequence; at least three runs after the same warm-up.
- Report: median, p95, p99, mean FPS, count of frames over 50 / 100 ms, CPU/GPU stages, effective settings.
- **1% low** everywhere = 1000 ÷ mean time of the slowest 1 % of frames (not the 1st percentile of instantaneous FPS).
- Record cold start and compile stalls separately: they stay part of the player's experience but are excluded from
  the auto-quality steady-state assessment.

## 17. Settings acceptance matrix — rendering

- One test row per setting. Numbers: minimum, middle, maximum and invalid input. Toggles: both states. Enums: every
  option. Then pairwise combinations of dependent settings.
- Evidence = the UI value + the system state read back + the observed effect. A changed variable without a checked
  consumer is not enough.

| ID | Scenario | Required result |
|---|---|---|
| S01 | Clean start | correct defaults, real capabilities, no false Ultra |
| S02 | Low → Ultra → Medium | identical to a clean Medium |
| S03 | Edit inside a preset → re-select the same preset | the whole profile restored |
| S04 | Manual graphics edit | Custom shown, or an explicit lock in Auto |
| S05 | Change, close the menu, reload | successfully applied preferences kept |
| S06 | Corrupt storage and an old schema | start-up continues, migration predictable |
| S07 | Valid / invalid JSON | import atomic; error explained |
| S08 | Category reset and full reset | the right scope resets; progress kept |
| S09 | Scale 100 % → 50 % at DPR 1 | scene buffer sides roughly halved |
| S10 | Unavailable effect / backend | no false "on"; reason shown |
| S11 | Graphics rebuild and a compile error | last working pipeline kept |
| S12 | Uniform change | no needless structural rebuild |
| S13 | Image confirmation, cancel, timeout | correct rollback, also while paused |
| S14 | 30/60/120 FPS and Auto | automation uses the right budget |
| S15 | Load rises, then disappears | quality drops and recovers without oscillation |
| S16 | Category volume 0 and Master 0 | no audio signal on that output |
| S17 | FOV before / during / after a dash and a cutscene | the user's base FOV respected |
| S18 | Reduced motion and flash limit | no bypass by combat or cutscenes |
| S19 | Rebinding and a layout switch | prompts and real actions match |
| S20 | 20 quality switches and 10 fight retries | resource counters settle; no accumulating objects |

- Visual comparisons: fixed camera, exposure, scene time and seed, the same temporal warm-up (`?still=1`,
  `?shoalLook=`). Motion effects get a short clip, not one frame. Image diffs allow an agreed tolerance between
  backends and GPUs.
- For an unavailable effect, acceptance is an honest limit and a working fallback, not forced activation. Supported
  profiles need not be pixel-identical.
- Memory after repeats: stable counters and our own allocation accounting, with a bounded shader-cache allowance.
  Monotonic growth of unexplained textures, geometries, audio sources or listeners is a defect.

## 18. Game-loop and compatibility acceptance — gameplay

| ID | Check | Expected |
|---|---|---|
| G01 | Play from launch to victory | no softlock; required events done |
| G02 | Lose and retry 10 times | fight state cleared; retry fast |
| G03 | Same input at 30/60/120 FPS | distance over 10 s differs by ≤ 2 % |
| G04 | Combo and one swing on one target | no repeated damage from frame rate |
| G05 | Fast weapon at low FPS | the sweep detects the hit |
| G06 | Dodge at the window edge | damage matches the authoritative ticks |
| G07 | Target behind a wall / dead / gone | move-to-target and lock-on end safely |
| G08 | Camera at a wall, a step, the large boss | no leaving geometry, no uncontrolled jump |
| G09 | Pause, blur, hidden tab | no background damage, no stuck actions |
| G10 | Close a menu with a click | that click fires no attack |
| G11 | Gamepad disconnected while the stick is held | movement stops; menu reachable |
| G12 | Skip every cutscene (ride, boss rise, victory) | game state equals normal completion |
| G13 | WebGPU unavailable | the verified WebGL 2 profile or a clear error (ours: WebGL 2 is the profile) |
| G14 | Neither WebGPU nor WebGL 2 | no endless loading (`webgl-guard.js`) |
| G15 | Graphics device lost | controlled recovery, or reload with the checkpoint |
| G16 | Required asset fails to load | visible retry/error, no hidden empty heroine |
| G17 | Touch, multi-touch, safe area, landscape | moving and attacking at the same time work |
| G18 | 15 minutes on a phone | heat, FPS and Auto changes recorded |

- Required support of the first desktop build: mouse/keyboard and a standard gamepad on actually tested browsers.
  Safari and mobile browsers join the supported list only after the full loop on the device, not after the page
  opens. The README's real/mock table follows the same rule.
- Automated checks cover the settings schema, migrations, presets, input mapping, attack-window maths, AI transitions
  and menus (`game/tests/client/glass-shoal.test.mjs`, `tests/render/shoal-look.test.mjs`, new registry and governor
  tests). Manual play judges camera feel, readability, prompt clarity and animation quality. Both are required.
- Tests check the contract and the observable result, not the implementation line by line. Every defect gets a
  reproducible scenario and a re-check of the fix.
- Hardware unavailable: status **not verified**, with the exact device and scenario for a later run; never a tick
  based on a build or someone else's video.

## 19. Order of work and definition of done

| Gate | Content | Seat | Opens the next gate when |
|---|---|---|---|
| 1 Skeleton | fixed step, input contexts, settings registry and service, boot errors | gameplay + rendering | the heroine moves; real settings persist; a start failure is handled |
| 2 Full loop on placeholders | heroine, camera, attacks, boss, victory, defeat, retry | gameplay | G01, G02, G09, G10 pass with no softlock |
| 3 Visual vertical | final heroines, the flat, light, sound, clips | rendering + assets | movement quality and the scene look approved in the build itself |
| 4 Graphics profiles | pipeline, effects, preset/capability matrix, Auto | rendering | settings really change systems; S01–S15 |
| 5 Usability and devices | rebinding, gamepad, accessibility, touch | rendering + gameplay | full loop on target devices; G11, G17 |
| 6 Optimisation and regression | benchmark, loading, leaks, context loss, repeated fights | rendering | required S/G rows and agreed performance targets |

- Integrate in small portions; after each merge check loading, controls, fight, menus, retry. Release checks use one
  pinned commit. Building and testing never mean publishing; the owner decides go.
- Short on time (deadline 15.11 01:59 Kyiv): cut extra dressing, photo mode, complex secondary animation, SSR and other
  expensive reflections. Keep the full loop, a correct camera, honest settings, controls and retry.

**Done** when a player starts and finishes the episode alone, every visible control works, settings persist and
explain their limits, retry does not break state, performance is measured on the claimed devices, and the seats can
reproduce the result from a clean checkout.

Hand-off package per seat: commit; run/build/test steps; settings registry (defaults, ranges, dependencies, apply
modes); tested-device capability matrix; controls and accessibility notes; asset registry, clip list, skeleton contract,
combat event parameters; launch-to-victory and defeat/retry clips; S01–S20 and G01–G18 with real statuses; benchmark
raw numbers; known limits, no hidden TODO in the required loop.

### Decisions to record in `docs/decisions.md` (by the owning seat)
- The arena's 1/60 fixed step vs the town's 30 Hz physics.
- Medium as a preset over the `high` tier (no fourth tier name).
- Cascade counts in `shoal-look.js` vs the preset table.
- Dodge i-frame window (0.10–0.24 s of 0.40 s) replacing whole-dodge i-frames.
- New audio buses (Interface, Dialogue) with existing bus defaults unchanged.
