# Elise v5: both legs walk, the dress lies on her

Status: **in the game** (`game/public/assets/models/agent_elise.glb`, `agent_elise_m.glb`, clips in
`game/public/assets/anim/elise.glb`). The model is still the owner's file (`../v4/src/`): face, body, hair, texture and
colours are untouched. Reverting the swap commit restores v4.

## What was wrong (v4)

1. **One leg did not walk.** The right leg, which the close dress encloses, was weighted 85% to the hips so it would
   stay inside the cloth. From her left side it read as a stiff second leg: the two legs moved differently.
2. **The knee was not at the knee.** v4 kept the leg joints of her older body: the knee 8 cm below the model's own
   knee (in the upper calf), the leg bones outside the legs.
3. **The check was blind.** The build checked "no leg through the dress" against capsules that had been shrunk until
   they fitted under the dress (3 to 5 cm of radius on a 6 cm thigh), and against the dress's outer envelope, not its
   folds. It passed while the real leg went through the real cloth.
4. **The cloth was held back.** After the simulation, every chain was pulled 30% back toward a tube hanging from the
   hips and limited to 24 degrees, which pulled cloth back into the leg that had just pushed it.

## What v5 does

`s30_two_legs.py` (Blender) builds the model and its cloth rig from the owner's file:

- **Legs.** Hips, knees, ankles and toes are the file's own joints (made symmetric). Both legs and shoes keep the
  file's own weights, cleaned: nothing of the other leg, and above the hip joint the thigh hands over to the pelvis.
- **The dress is skin where it lies on the body, cloth where it hangs.** The air between the dress and the body in the
  rest pose decides: under 2 cm (hips, seat, the top of the thighs) the dress takes the weights of the skin right
  under it (the closest point of the body's surface, on that leg's own side), so it moves exactly as the body it lies
  on. Over 5 cm it is cloth on her 13 skirt chains. Where the cloth bridges from one thigh to the other it is cloth
  too, whatever the air.
- **The dress is let out over the hips** to at least 12 mm of air (a tailor's ease; the source lies on the skin there
  and even dips under it): skin that slides a few millimetres under the cloth when a thigh turns stays under it.
- **The body under the tight part is not drawn** (778 faces: hips, seat, lower belly, the outside of the right
  thigh). A face goes only where the dress covers it closely, the cloth there is skin, and no edge of the dress (slit,
  lacing, open back) is near. Both legs, the left hip in the lacing and everything the slit can open on stay.
- **Across a hip crease the dress leads or lags the skin**: in front, a band below the hip joints takes the weights of
  the skin 3 cm lower (it turns with the thigh before the skin under it does); behind, the weights of the skin 4 cm
  higher (the seat keeps its shape).
- **The cloth grid is cut from this dress** (plane cuts, outer envelope, slit edge to slit edge), from the hip joints
  down. It carries the depth of the dress's real folds under that envelope (`inset`) and how much longer the folded
  cloth is than the envelope (`slack`).
- **Colliders are fitted to this body**: 23 capsules (thighs, knees, calves, ankles, shoes, heels, hips) that hold the
  skin to within 4 mm on the legs.
- The deepest folds of the flare are made shallower (beyond 2 cm under the envelope a fold keeps a quarter of its
  depth): the fit of the dress around a moving leg. The dress's outline does not change.

`art/anim/ftfanim/skirt.py` and `cloth.py` (the clip build):

- The cloth is simulated against **both real legs**, about a shape that hangs **upright** from the hips (their place
  and heading without their tilt), with the folds' depth kept clear of the legs and the folds' slack free to open.
- A particle never has to keep more air than it has at rest (the dress is tight at the top), and a point that is skin
  rides the body instead of being simulated.
- No limit pulls the cloth back after the simulation; inside it, a leash keeps every point within 30 degrees of
  its hanging place (a hem cannot fly).
- The cloth of all clips is baked at once, one process per clip.
- The phone model keeps the desktop model's triangles over the front of the hips: a coarse triangle that spans a hip
  crease lets the lifted thigh through its middle.

`leg_check.py` is the check that counts: for every frame of every clip it skins the **game mesh itself** and tests
every point of the dress below the waist (vertices, edge midpoints, face centres) against the body under it. A dress
point under the skin is a leg through the cloth, from any camera. It fails the build over 2 mm.

## The walk and the run

`art/anim/clips.json`, `characters.elise`. A close floor-length dress allows a short step; a long one stretches the
cloth into a tent between the feet. So she walks with light quick steps on a narrow track, hips swaying (a stride of
0.89 m in 0.93 s), and when she hurries she takes quicker ones with a forward lean (180 steps a minute, heels kept
low: a higher back kick outruns the hem). The ground her steps do not cover she still glides over (owner 12.11), less
than in v4. The keyed strikes and casts keep their upper bodies; their steps and crouches are scaled down (`--legs
0.4` for the dash, `0.3` for the strikes and casts). The stairs clips are gone: the game never played them.

## Build

On the GPU server (Blender 4.5, gltf-transform, toktx):

    blender -b -P art/agents/elise/v5/s30_two_legs.py -- art/agents/elise/v4/src/elise_owner2.fbx art/agents/elise/v4/src/elise_owner2_base.jpg <work> agent_elise 30000
    blender -b -P art/agents/elise/v5/s30_two_legs.py -- ...                                                                            <work> agent_elise_m 11900
    gltf-transform resize <work>/agent_elise_m_raw.glb <work>/agent_elise_m_1k.glb --width 1024 --height 1024
    bash art/tools/compress-glb.sh <work>/agent_elise_raw.glb game/public/assets/models/agent_elise.glb agent_elise      # and _m
    cp <work>/cloth_rig.npz art/agents/elise/cloth_rig.npz
    python3 art/anim/build_clips.py --char elise --bake --out <work>/clips1.glb
    python3 art/anim/iris_combat.py --model game/public/assets/models/agent_elise.glb --in <work>/clips1.glb --out <work>/clips2.glb --legs 0.4 --cloth art/agents/elise/cloth_rig.npz
    python3 art/anim/iris_actions.py --model game/public/assets/models/agent_elise.glb --in <work>/clips2.glb --out <work>/clips3.glb --only cast_lance,cast_snare,strike1,strike2,strike3,strike_charge,strike_super --release 0.14 --legs 0.3 --cloth art/agents/elise/cloth_rig.npz
    python3 art/agents/elise/v5/leg_check.py <work>/agent_elise_raw.glb <work>/clips3.glb --json art/agents/elise/v5/out/leg_check.json
    gltf-transform meshopt <work>/clips3.glb game/public/assets/anim/elise.glb

`out/`: `skeleton.json` (her 90 bones with the new leg joints), `leg_check.json`, `leg_check_m.json`.

## Result

`out/leg_check.json` (desktop mesh) and `out/leg_check_m.json` (phone mesh), 17 clips, tolerance 2 mm:

- Desktop: 16 clips clean (0.0 mm). The walk has one dress point 4.4 mm under the skin for 6 of 57 frames, at the
  front edge of the lacing on the left hip (skin shows between the laces there anyway).
- Phone: 15 clips clean; the same walk point, and one point in one frame of `strike3` at the back of the left thigh.
- No shoe comes through the cloth on the desktop mesh; on the phone mesh a toe passes the coarser hem by up to 5 cm
  where the hem rests on the instep.

`docs/art/elise/v5/two_legs_before_after.jpg` and `.mp4`: the game's own renderer at the game camera, side, back and
front; in every pair the top row is v4, the bottom row v5. The built page boots with `?hero=elise` without page
errors.

Open: no blink morph on this face; the ribbon tails are stiff in a cast (both as in v4). The run is a hurried short
step with the glide; a longer reach of the leg needs more cloth freedom than this dress has (next: trial strides with
`FTF_CLIPS` / `FTF_BAKE`, see `build_clips.py`).
