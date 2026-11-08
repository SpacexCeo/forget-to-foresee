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

Frames are JPEG (q4) from the PNG read-backs. **Before:** `docs/lookdev/before/` (23 frames: six cameras × ultra/low at
1280×800, four at 1920×1080 ultra, three × high/low at 390×844 with the phone profile; the Shell exterior shot was
recomposed on 08.11 evening, so its three before-frames are from the new camera). **After (verified, this pass):**
`docs/lookdev/after/overview-ultra-1280x800.jpg` and `plaza-ultra-1280x800.jpg`, rendered from the final tuning.

| Camera | Before (`before/`) | After (`after/`) | What to look at |
|---|---|---|---|
| overview, ultra | `overview-ultra-1280x800.jpg`: milky grey haze, the Amber camp a blown-out orange blob (its whole atlas was treated as an emissive), black boxes where the agent nameplates are, a flat cloud floor | `overview-ultra-1280x800.jpg`: the Amber camp reads as a wooden pavilion, nameplates are intact, soft lit billows below the pillars, warm haze toward the sun, cooler away from it | Amber camp, nameplates, the sea of clouds, plateau tops |
| plaza, ultra | `plaza-ultra-1280x800.jpg`: blank white-yellow sky, pale low-contrast stone, lanterns blooming into the stone | `plaza-ultra-1280x800.jpg`: cloud structure in the sky, golden haze on the sun side, stone with a 5:1 sun/shade ratio, bloom only on the lantern flames, grain in the mids | sky, stone texture, lanterns, the far camps in aerial perspective |

Frames of the intermediate tuning (not kept in the repo) also confirmed: the interior floor is dark cracked stone with
amber floor lights again (it was lilac nacre), the raymarched slab renders with no console errors on ultra, the low tier
renders the deck alone with no errors. The other after-cameras (bridge, camp, Shell exterior, inside, the 1920×1080 and
390×844 sets) were **not re-rendered** before the stop order: the capture takes about four seconds per frame on
SwiftShader, so the full set is roughly 50 minutes. Command for whoever continues:

    cd game && npx vite build --outDir .scratch/dist && (npx vite preview --outDir .scratch/dist --port 4173 &)
    node tests/client/lookdev-capture.mjs --out ../docs/lookdev/after --tier ultra,low --size 1280x800
    node tests/client/lookdev-capture.mjs --out ../docs/lookdev/after --tier ultra --size 1920x1080 --shots overview,plaza,shell,inside
    node tests/client/lookdev-capture.mjs --out ../docs/lookdev/after --tier high,low --size 390x844 --profile phone --shots overview,plaza,inside

## 4. Low tier, reduced motion, phones

- **Low tier** (desktop): no post stack, deck-only clouds (one draw call, as before), the nacre keeps a slightly stronger
  pearl rim instead of the thin film, grass wind and backlight run (vertex/fragment cost only), 120 air motes (one
  draw call). Verified on two frames (overview, plaza) with no console errors; draw calls 129 / 82 on those cameras,
  the same as the baseline plus the motes call.
- **Reduced motion**: every capture frame in this doc was rendered with reduced motion, so the deterministic path is
  the verified one: clouds, wind, Shell hover, lantern flicker, nacre shimmer, mist drift and grain all stop (their
  clocks take dt = 0); nothing pops or flashes.
- **Phones** (`docs/mobile.md` profile): knobs unchanged except `motes` (80 on phone/high, 0 on phone/low, so phone/low
  adds no draw call); the governor and pixel-ratio steps are untouched. Baseline phone numbers (390×844, SwiftShader):
  overview 88 calls / 193k triangles (high) and 88 / 187k (low), plaza 43 / 116k and 43 / 110k, inside 20 / 145k and
  20 / 139k, all within the mobile budget (≤ 65 calls on the play cameras, ≤ 180k triangles except the 90 m overview).
  The after-numbers were not re-measured before the stop order (same command as above with `--profile phone`).

## 5. Not done / open

- After-frames for the remaining cameras and sizes (see §3); phone re-measurement.
- The Guests' chamber behind the glass still blows out to white (the chamber light lives in `scenes/shell.js`, now task O:
  `docs/collab-requests.md` §8).
- Cloth wind on the clan banners: no banner prop is placed in the scene yet; when they land, a vertex sway for materials
  named banner/flag/canopy belongs in `materials.js`.
- The SMAA pass on ultra and the anisotropic filtering could not be judged on SwiftShader (no anisotropy, MSAA already
  smooth); they need one look on a real GPU.
- The Shell exterior reference shot was recomposed late (from the Moss camp across the plaza toward Shell III); only its
  before-frames exist.
