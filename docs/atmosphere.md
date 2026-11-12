# Atmosphere: shadows, light, fog, weather (task L-002)

Branch `claude/atmosphere`, started 10.11.2026 (owner: "add shadows, atmosphere, weather, lighting"). Covers both
locations: the town on the ground and the air archipelago. Builds on the 08.11 look-dev pass (`docs/lookdev.md`).
Owner files: `game/src/render/` lighting, shadow, sky, fog, post and quality code, `game/src/render/weather.js`,
their tests, this page.

## Method

Frames come from a production build on real WebGL (RTX 5090 on the rented server, headless Chromium through
ANGLE/Vulkan), captured by `tools/gpu-server/atmo-cap.cjs`: six fixed cameras in the town (gate, street, stairs,
altar, square, high) and five on the archipelago (overview, plaza, bridge, camp, shell), 1920×1080, reduced motion
on so two builds differ only by the look. The NVIDIA GL libraries live inside the work directory
(`tools/gpu-server/nvlocal.sh`); nothing is installed into system directories.

## 1. Audit of the look on 10.11 (before)

Sheets: `docs/atmosphere/audit/before-town-ultra.jpg`, `docs/atmosphere/audit/before-isle-ultra.jpg`.

Town:

1. **No sunlight in the streets.** The golden-hour sun stands 13° high in the north-north-west, behind the hill the
   town climbs: every street lies in the hill's shadow. No cast shadow is visible anywhere, Iris has none, and the
   whole town is lit by the flat cool fill alone.
2. **Fog as a grey wall.** The archipelago's fog settings (mist pooling on a cloud sea, distance fog from 30 m) are
   used unchanged; at 30–40 m the houses, the stairs and the shrine dissolve into blue-grey milk. No depth layers,
   no warm air.
3. **The altar is not the strongest light.** The amber core clips to cream, lights nothing around it and reads
   weaker than the street lamps.
4. **Washed-out colour.** Roofs, plaster, banners and stone share one desaturated grey-beige; the lit windows are
   flat cream rectangles.
5. **No contact shading.** Props, steps and Iris's feet do not sit on the ground in the shade.

Archipelago:

6. **Milky haze.** Sky, cloud sea and far islands merge into one white-yellow field; the overview has no dark value
   and no blue anywhere. Toward the sun the frame whites out (shell camera).
7. **Shadows end at a hard edge.** One shadow frustum follows Iris (16–64 m); beyond it nothing is shadowed and there
   is no fade, so from the overview most of the island is unshadowed.
8. **The grade exists only with the post stack.** The low tier and both phone tiers render without it, so their
   colours differ from desktop.

## 2. Plan

| Step | Change |
|---|---|
| Shadows | two cascades from one sun (a near one that follows Iris, a far one over the whole play area, redrawn only when it moves), texel-snapped, blended in the shader, fading out at the far edge; a rotated-disc soft filter; blob shadows under characters in the shade and on phones |
| Sun, sky, ambient | a light preset per location (the town gets a sun that reaches the main street), morning / midday / golden hour / dusk for both, lamps and lit windows taking over at dusk, an amber light on the altar, ambient from the same sky |
| Fog and grade | fog settings per location (valley haze under the town, lighter distance fog, sky-coloured aerial perspective on the far islands), the grade moved into the tone mapping so every tier and phone shares it, richer colour |
| Weather and wind | clear / haze / fog / overcast / drizzle / rain / storm (distant flashes), rain streaks and splashes, wet sheen and puddle reflections (not on cheap tiers), one shared wind uniform for banners, trees and smoke; a seeded weather timeline per session in the town (`render/daycycle.js`), window event `ftf:weather` {state} / {state, thunder}; `?weather=`, `?tod=`, `?cycle=<s>`, `?wseed=<n>` switches |
| Tiers and numbers | frame time per tier on desktop and the phone layout |

## 3. Second pass, 11.11 (branch `claude/lighting-v2`)

The first pass (shadow cascades, per-location looks, fog, grade in the tone mapping, weather, wind uniform) was
merged into `main` half-verified. This pass re-captured everything on real WebGL and fixed what the frames showed.
Sheets: `docs/atmosphere/v2/` (`before-*.jpg`, `after-*.jpg`, `weather-town.jpg`).

| Finding in the "before" frames | Change |
|---|---|
| Town at the `morning` preset: the sun stood 38° off the street axis at 34°, so the east row of houses shadowed half of the main street and the stairs; the light was near white and the shade deep blue | New hour `afternoon`, the town's default: sun at 43° in the south-south-west, 20° off the street axis (house shadows fall up the street, both sides are lit), pulled toward amber (`sunWarm` 0.7), a dimmer sky (`skyMean` 0.30), bounce 1.0 so shade is filled warm from the paving, exposure +0.15 |
| Archipelago golden hour read as white haze: grey stone, white cloud sea, faint shadows | Sun 6.2 and `sunWarm` 0.8 against a dimmer sky (`skyMean` 0.22), less aerosol (`mie` 1.3), thinner fog (0.026), bounce 0.55: gold on stone and cloud tops, cool shade, clear cast shadows |
| Altar core clipped to cream and lit nothing in daylight | Core emission forced to deep amber (`#ff7a16`, files with an emissive map keep theirs) at 0.9 asleep / 2.4 awake / flare 9; the hero point light is 16 + 14 × lamps (was 5 + 15), amber `#ff8a2a`: the dais is visibly lit by it at noon and it dominates at dusk |
| `sunWarm` | New optional preset key (`sky.js`): lerps the physically derived sun colour toward amber; the presets that do not set it are unchanged |

Checked and left as they were: the two shadow cascades are stable while the camera moves (texel snapping); the
town's camera far plane is 900 m; the sky islands (330–600 m) stay visible and hazed; `?weather=overcast|rain`
and `?tod=dusk` work in the town (lamps and windows take over, wet paving reflects the altar); the grade is in the
tone mapping, so the low and phone tiers show the same colours as the post tiers.

Tuning without a rebuild: `atmo-cap.cjs --look '{"town":{"elevation":40,"fog":{"density":0.01}},"isle":{…}}'`
merges overrides into the running look.

### Frame time per tier (11.11, RTX 5090 through ANGLE/Vulkan, headless, frame-rate limit off)

These are from the rented server, not from the minimum machine (RTX 2060 Super) or a real phone: they show the
relative cost of the tiers and that nothing regressed, not the frame rate a player gets.

| Layout | Tier | Camera | Mean ms | p95 ms | Drawing buffer |
|---|---|---|---|---|---|
| desktop | ultra | town street | 3.06 | 3.3 | 1920×1080 @ 1 |
| desktop | ultra | town altar | 3.17 | 3.4 | 1920×1080 @ 1 |
| desktop | high | town street | 3.07 | 3.3 | 1920×1080 @ 1 |
| desktop | high | town altar | 3 | 3.3 | 1920×1080 @ 1 |
| desktop | low | town street | 1.82 | 2.7 | 1920×1080 @ 1 |
| desktop | low | town altar | 1.46 | 1.7 | 1920×1080 @ 1 |
| desktop | ultra | isle plaza | 10.56 | 20.5 | 1920×1080 @ 1 |
| desktop | high | isle plaza | 8.57 | 17 | 1920×1080 @ 1 |
| desktop | low | isle plaza | 3.44 | 7.5 | 1920×1080 @ 1 |
| phone | ultra | town street | 1.94 | 5.2 | 585×1266 @ 1.5 |
| phone | ultra | town altar | 4.65 | 7.7 | 585×1266 @ 1.5 |
| phone | high | town street | 3.99 | 10.9 | 585×1266 @ 1.5 |
| phone | high | town altar | 3.43 | 8.5 | 585×1266 @ 1.5 |
| phone | low | town street | 3.01 | 8.7 | 390×844 @ 1 |
| phone | low | town altar | 7.47 | 24 | 390×844 @ 1 |
| phone | ultra | isle plaza | 8.39 | 20.3 | 585×1266 @ 1.5 |
| phone | high | isle plaza | 10.73 | 33.5 | 585×1266 @ 1.5 |
| phone | low | isle plaza | 7.19 | 15.2 | 390×844 @ 1 |

The phone layout is a 390×844 viewport at device pixel ratio 3 in the same headless browser (phone knob set, touch UI); its p95 is noisy there.

## Weather colour grade (12.11, owner: "haze and fog by day are a flat washed-out beige")

What was wrong: the height mist had its full density from the first metre (trees 10 to 15 m away were gone), the
weather haze took the warm horizon colour and was brighter than the scene, and haze, fog and overcast raised the
exposure and the ambient light, so the frame went to one milky tone.

What changed (`render/fog.js`, `render/weather.js`, `render/lookdev.js`):
- the mist reaches its full density only with distance (`ftfFogNear`: 12 % at 5 m, all of it past 60 m, sooner in
  thicker weather) and no surface is fogged more than 95 %: depth stays, silhouettes stay;
- each weather state has `cool` (how far its haze turns cool grey, a little darker than the horizon) and `vivid`
  (saturation given back to the near field under the veil); the sun's warm lobe in the haze fades with `cool`;
- haze, fog and overcast no longer lift the exposure (now -0.05, -0.10, -0.02 EV) and add less ambient; the fog
  multipliers are 1.4 (haze) and 2.3 (fog), were 1.7 and 3.4.
The grade itself (AgX, saturation, S-curve, split toning: `render/grade.js`) is unchanged and is the same on every
tier. Check sheet (7 states x day, dusk, night, before and after, plus the phone tier):
`docs/art/weather/weather_grade_before_after.jpg`, made by `art/tools/weather_sheet.mjs`.
The red edge on the owner's screenshot is the hurt flash of `play/mobs.js`; it is now a thin, faint rim.
