# Look-dev pass: the world as key art

State on 08.11.2026, branch `claude/lookdev` (worker task L). Owner files: `game/src/render/` except
`camera-rig.js` (task G) and `greybox.js` (task H); `game/public/assets/env/`; `game/tests/client/lookdev*.mjs`.
Direction: `docs/decisions.md` 07.11 rows "Target concept", "Style reference (Elden Ring as inspiration, adapted,
never copied)", "Art direction: hybrid"; palette from `docs/spec.md` §11 (cold grey-green surfaces, charcoal masses,
light fog, warm amber for human decisions); the lobby reference `docs/ui/lobby-reference.jpg` for the mood.

## Method

- **Fixed reference cameras**, rendered by `game/tests/client/lookdev-capture.mjs` (a manual Playwright tool, not part of
  `npm test`): overview (plaza from 90 m), plaza (third person on the Scroll), bridge (low on the Iris bridge, looking
  back), camp (the Iris camp), Shell exterior (from the plaza toward Shell I) and inside (Shell I, hub flight). The tool
  loads a **production build served by `vite preview`** (so editing sources does not reload the pages mid-capture),
  places Iris and the rig through `window.__ftf`, waits for the asset streamer to settle, hides the UI layers and reads
  the frame back. Reduced motion is on for the captures so clouds, wind, Shell hover and grain are frozen: frames of two
  builds differ only by the look change.
- **Renderer here is SwiftShader** (CPU; no GPU in the container): about 4 s per frame at ultra, 1 s at low. The frames
  are deterministic and show the look exactly; frame times are meaningless here and are not reported. Device-independent
  numbers (draw calls, triangles, pixel ratio, tier) are.
- Sizes: 1280×800 (every camera, ultra and low), 1920×1080 (ultra: overview, plaza, Shell, inside), 390×844 with the phone
  profile (high and low: overview, plaza, inside).
- Tests: `game/tests/client/lookdev.test.mjs` (9 tests, pure: fog integral vs a numeric integral, sun transmittance,
  preset contract, material slot rules, tint hook, quality knobs, post defaults).

## 1. Audit of the previous look (what read flat, noisy, washed out or cheap)

From the baseline frames (`docs/lookdev/before/`):

1. **Washed out, low contrast.** Sun 3.6 against a bright sky-dome IBL (mean 0.36 × 0.34) and a hemisphere fill: sunlit
   and shadowed stone differed by about 2.5:1, so the plaza read as flat light grey; the sky near the horizon was an
   almost white band. Golden-hour light needs the sun to dominate: warm key, cool and *darker* fill.
2. **A flat cloud deck.** The "sea of clouds" was three stacked value-noise planes; from the overview it read as a grey
   floor with a repeating pattern and no depth. The quality tiers declared `cloudSteps` (28/16) for a raymarched sea that
   was never built.
3. **Height fog evaluated at the fragment's height**, not integrated along the view ray: looking down from the overview,
   the whole plaza got the same haze as a horizontal look across it; the mist on the cloud sea did not thicken toward
   the deck. Fog constants were baked into the shader chunk as literals, so the tension tint (`presentation.js`) had to
   touch `scene.fog.color` and the fill light directly, and a time-of-day change could not move the fog at all.
4. **Nacre read as white plastic.** Thin-film iridescence 0.55 under a clearcoat on a near-white base: oil on a white
   ball. Mother of pearl has a soft glow where the surface turns away; nothing in the material produced it, so the
   Shells never read as the luminous landmark the direction asks for. Worse, the material-name rule `/nacre|shell|pearl/`
   turned the interior's **dark cracked stone floor** (`M_Shell_Stone`) into nacre.
5. **Textures without anisotropic filtering**: the plaza stone and the bridge decks blur at the grazing angles of the
   isometric camera on real GPUs (SwiftShader ignores anisotropy, so the frames here cannot show that one).
6. **Post**: bloom threshold 1.0 let sunlit stone near white bloom a little; the GTAO ran at full resolution on `high`
   although the tier declared `aoScale 0.5`; `raysScale` was declared and ignored; `smaa: true` on ultra was declared and
   never built; no grain; the grade's straight contrast line clipped highlights.
7. **Grass**: a sinusoidal sway identical across the island (no gust fronts, no wind direction), no backlight, so the
   plateaus looked like a green carpet rather than grass in golden-hour light.
8. **Inside a Shell** (low tier): the Guests' chamber behind the glass blew out to white; the amber floor lights read
   as dots.

## 2. What changed

| Area | Before | After |
|---|---|---|
| Light balance (`sky.js` presets, `lookdev.js`) | sun 3.6, sky mean 0.36, HDR 0.34, hemi 0.18 | sun 5.0, sky mean 0.30, HDR 0.28, hemi 0.12: about 5:1 between sunlit and shadowed ground, warm key against a cool, darker fill. Sun direction unchanged (elevation 13°, azimuth 34°), so the baked HDR still matches |
| Sky dome | altocumulus cover 0.46, light cores | cover 0.58 with darker cores and a stronger silver lining: shape in the sky instead of a white band |
| Fog (`fog.js`) | fragment-height exponential + linear distance, literals in the chunk | analytic ray integral of the height fog (Quilez), distance fog from 30 m, a cool "aerial" shift before the fog mix, the warm sun lobe; all parameters are **shared typed-array uniforms** (`FOG_UNIFORMS`) so presets and the tint change every material at once |
| Mood tint hook | `presentation.js` touched `scene.fog.color` and `hemi` | `lookdev.sky.tint(hex, amount)` (requested in `docs/collab-requests.md` §6): dome horizon, cloud ambient, fog uniforms, scene fog colour and fill follow together; amount 0 restores the preset |
| Sea of clouds (`clouds.js`) | 3 value-noise planes | an opaque lit deck (the valley floor) plus a **raymarched slab** on ultra (28 steps) and high (16): Beer-Lambert extinction, two-tap sun shadow for silver linings, Henyey-Greenstein forward scatter, ambient from the sky's zenith and horizon, powder term, per-pixel jitter; real parallax between near and far clouds and the pillars sinking into them. Low and phones keep the deck alone (one draw call) |
| Nacre (`materials.js`) | iridescence 0.55 | iridescence 0.75 with a wider film, plus a **pearl rim** injected into the shader (Fresnel-weighted emissive that drifts violet → aqua with the view angle): the Shells glow at their edges and the bloom picks that up. Low tier: no thin film, a stronger rim |
| Material slot rules | regex on names, `shell` matched the interior floor | `slotForMaterial(asset, name)` (pure, tested): stone/rock/floor/atlas/body/wood/foliage materials are never upgraded; artist emissives survive the upgrade (Shell glow strips, lantern panes) |
| Textures | default filtering | anisotropic filtering at the renderer maximum on every loaded colour/normal/ORM map, set before the first upload |
| Post (`post.js`) | bloom threshold 1.0; AO full res on high; no SMAA; no grain | bloom threshold 1.18 (only emissives, the glyph, the sun disc and the nacre rim bloom); GTAO at the tier's `aoScale`; god rays at `raysScale` in the sun's colour; **SMAA on ultra** after the output pass (no temporal pass, nothing smears); grade with a soft shoulder/toe, cool shadows / warm highlights, vignette 0.26 and **grain 0.028** weighted to the mids, frozen under reduced motion |
| Grass (`foliage.js`) | one sine sway, no light response | gust fronts from the shared noise texture travelling downwind (`WIND_DIR`), fine flutter, bending in the world wind direction with the tip drooping; a 4-segment blade; **backlight** (blades between camera and sun glow warm). Flowers share the shader at lower amplitude |
| Time of day | `?tod=` chose a preset at start | `lookdev.setPreset('golden'|'morning'|'noon'|'dusk')` re-derives sky, sun, fill, fog, clouds, light shafts, exposure and IBL at runtime (for the trailer, task J); `stats().preset` |

Draw-call budget: the slab adds one call on ultra/high; nothing else adds calls. Low and the phone profile add none.

## 3. Before / after

_Frames in `docs/lookdev/before/` and `docs/lookdev/after/` (JPEG q4 from the PNG read-backs). Filled in below._

## 4. Low tier, reduced motion, phones

_Filled in below._

## 5. Not done / open

_Filled in below._
