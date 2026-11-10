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
| Weather and wind | clear / overcast / light rain, one shared wind uniform for banners, trees and smoke, `?weather=` and `?tod=` switches |
| Tiers and numbers | frame time per tier on desktop and the phone layout |
