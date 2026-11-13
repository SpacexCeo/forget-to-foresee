# Companion dragons

The three companions (Nacre, Rill, Cinder) are built from the owner's two generated sculpts by
`art/dragons/generated_dragons.py` (sources in `art/dragons/generated/src/`); the clip set and the rig conventions
come from the procedural build, `art/dragons/build_dragons.py`. The `.glb` files here are copies of what ships in
`game/public/assets/models/`; `art/dragons/qa_dragons.py` renders the contact sheet.

## Alive in flight (13.11, owner's note: "they float stiffly")

The sculpts are wingless and stand on four legs, so the life had to come from the clips and from the scene:

- **Legs** paddle and tuck through `follow`, `fly` and `glide`, front and back out of phase, left and right
  alternating, and dangle in the hover (`generated_dragons.py`, `pose()`, which wraps the procedural `pose`).
- **Tail**: a full S-wave from root to tip, growing toward the tip, plus a slow pitch wave.
- **Spirit wings**: the companion skeleton's wing bones carry a separate mesh (`spirit_wings`, material
  `M_Spirit_Wing`, about 100 triangles a pair) that the game draws as tinted light (pearl, teal, amber) with an
  alpha map that is bright along the leading edge and the ribs. They beat softly with the flight and fold away when
  the dragon sits. Plain blending, not additive: additive light vanishes against this game's bright sky.
- **Levitation** (`game/src/scenes/companion.js`, numbers in `companion-rules.js`): the body bobs 12 cm, a soft
  tinted light lies on the ground under the dragon and shrinks as it rises (gone when it sits), and a few slow
  sparks drift down from its belly. Under reduced motion: a 3 cm bob, no sparks. On phones: 3 sparks instead of 7.
- There are **no frill or fin bones** on these sculpts, so nothing flutters there.

Checked in the running game (`?companion=cinder`): ground light on at 0.37 opacity and 0.46 to 0.53 m across as it
breathes, 4 to 6 sparks alive at a time, wings at 0.85 opacity, no page errors. Frames:
`alive_flight_frames.jpg` (top: one dragon beside the heroine, hovering, flying and sitting; bottom: the three of
them, wings and legs). The eight clip names are unchanged, so `game/src/scenes/companion.js` flies them as before.
