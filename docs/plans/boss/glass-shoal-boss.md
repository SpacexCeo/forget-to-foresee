# The Glass Shoal: the level-5 boss fight (owner, 13 Nov)

The first big set piece of the game. Original designs only: the owner showed a public web demo as a *quality bar* for
lighting and reflections; it has no licence, so nothing of its code, art or names is copied. We build the look ourselves.

## Player flow
1. **Level 5 unlocks "The Call of the Shoal"** (a main quest). Its giver marker and its tracker line pulse and shimmer
   (gold, slow breathing glow, a light ray above the giver) so nobody misses it. Phones: the glow only, no pop-up.
2. **The weapon.** The quest sends Iris to find the **Loomblade**, a sword woven from gate-loom thread (a short find
   at a marked spot outside the walls). From then on Iris fights with the sword. **Elise remembers her gift**: she can
   hover and fly short hops, throw **Ember Palms** (fire orbs from both palms) and cast **Gale Discs** (flat spinning
   wind blades, like thrown discs). Both heroines get these as new skills on the hotbar.
3. **The ride.** At the cliff stone above today's boss area (the Crownrift arena), a great **pearl dragon** lands.
   Press **E** to mount. The flight to the island is a guided ride: the player steers within a bounded corridor (a
   soft leash; leaving it turns the dragon back), the camera follows wide, clouds and sea pass below; ~40–60 s.
   Reduced motion or "Skip" jumps straight to the landing.
4. **The Glass Shoal**: a new, bounded island location. A vast mirror-wet salt flat under a low sun, mist, broken
   monoliths, crystal spires on the horizon, a lone lamp post. The floor reflects everything (the look target below).
5. **The boss: the Hollow Tide**, a colossal stone-and-crystal sea serpent that rises out of the mirror. Three
   phases, readable telegraphs (glowing ground rings before slams, a charge line before a lunge), adds in phase 2,
   a weak point that opens after a dodge. HP and stamina pickups glow on the flat. Hard but fair: a death returns you
   to the landing with the boss at its phase checkpoint.
6. **Reward**: a crown-grade chest, XP, a title, and the way home continues (no real value; testnet only).

## The look target (the arena)
- **Reflections**: a planar reflection of the whole scene on the flat (mirror with slight roughness and ripple
  normal map), plus screen-space fallback where the reflector is too costly. Wet sheen, puddle edges.
- **Light**: low warm sun with long shadows (cascaded), cool sky fill, bloom on crystals and VFX, gentle god rays
  through the mist, colour grade (lift/gamma/gain + a LUT). Exposure and fog density tuned for this scene.
- **VFX**: boss attacks with glowing rings, sparks, fire orbs and wind discs in the heroines' colours.
- **A render panel** (debug, `?render=1`): FOV, exposure, sun height and bearing, fog, presets, Copy JSON of the
  current look, reset. It lets the owner tune the scene live, like a lookdev tool.
- **Performance tiers**: desktop high (reflector + cascades + bloom), phone (screen-space or static reflection,
  one cascade, half-res effects). Never below ~30 fps on a mid phone; the existing quality tiers decide.

## Assets (Fable)
- Loomblade (sword) model, Iris sword moveset: draw, idle-ready, 3-hit combo, heavy slash, dodge roll, fingers wrapped
  on the grip (finger rig; the owner can pass models through an auto-rigger if needed).
- Elise: hover/fly loop, take-off and landing, Ember Palms cast (both palms), Gale Discs cast (a throwing sweep).
- Great pearl dragon mount (scaled and re-detailed from the companion sculpt, or a licensed rigged dragon the owner
  buys): glide, flap, bank left/right, land, take-off; a saddle socket for the heroine (riding pose).
- The Hollow Tide: segmented serpent body, crystal crest, rise, slam, lunge, sweep, roar, hit, death.
- Arena dressing: monoliths, crystal spires, lamp post, rock with cracks.

## Who builds what
| Part | Seat |
|---|---|
| Quest, unlock glow, weapon find, skills on the hotbar, mount interaction, flight corridor, arena location, boss AI and phases, pickups, reward | Opus seat "boss gameplay" |
| Arena look: reflector, sun/sky/fog, bloom, god rays, grade, the render panel, quality tiers | Opus seat "rendering" (A2) |
| Every model and animation above | Fable (models seat) |

## Rules
- Everything in the repo is English; original names; no other game's or demo's names anywhere.
- Behind a flag `glassShoal` until the owner says go; `?ff=glassShoal` previews it.
- `npm test` green; boot-check the built page with `FTF_BASE=/forget-to-foresee/` (with and without the flag).
- Phones: nothing auto-pops; taps outside close panels; the ride and the fight work with touch controls.
