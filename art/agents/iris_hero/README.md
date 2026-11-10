# Iris hero (stylized realism)

Owner brief of 09.11 (`art/agents/reference/README.md`): rebuild Iris as a hero character, the quality of a
good indie RPG close-up, still loaded by the game as `agent_iris.glb` with the same clip, bone, socket and
node names as every agent.

```
blender -b --command extension install-file -r user_default -e mpfb-2.0.18.zip   # once
blender -b -P art/agents/iris_hero/build_iris_hero.py -- full                   # GPU bakes (Cycles OptiX)
art/tools/compress-glb.sh art/agents/_raw/iris_hero/agent_iris.glb game/public/assets/models/agent_iris.glb agent_iris
blender -b -P art/agents/iris_hero/qa_render.py -- <glb> <out_prefix> [clip] [frame]
```

Stages: `body` (MPFB body, re-pose, rig, face morphs), `costume` (+ garments, hair, weights), `full`
(+ bakes, clips, face layer, export). `--noshade` skips the bakes for a fast CPU check.

## Pipeline

1. **Body**: MPFB `create_human` (female, young adult; macro targets) plus detail targets for slight
   stylization and asymmetry (eye scale and height per side, cheekbones per side, nose, chin, lips).
2. **Rest pose**: MPFB's `default` rig with its CC0 weights poses the arms 14° off the body and the legs
   under the hips (the agent rest stance the clips are built for); the pose is applied to the mesh and the
   body is scaled so the eye line sits at 1.64 m like every agent.
3. **Rig**: the agent armature (`agent_rig` bone names, rolls and parenting) placed on the MPFB joints,
   plus `eye_L` / `eye_R` (the game's look-at already turns bones named `eye`) and spring chains for the
   coat (`cloak`, `cloak_L`, `cloak_R`), scarf tail, folded hood, dress (`skirt_F`, `skirt_B`) and hair
   (`hair_L`, `hair_R`, `hair_B`). MPFB's weights are summed onto the agent bones.
4. **Face**: 23 morph targets from MakeHuman expression units: blink, squint and wide per eye; brow up,
   down, inner and outer per side; mouth open, smile, frown, pucker, press, lips part, upper lip, wide,
   nose wrinkle. The lid, brow and jaw bones stay for the contract but carry no weights.
5. **Costume** (separate skinned meshes with solidified thickness, trim bands, hem folds): long open
   charcoal coat with a standing collar and set-in sleeves with cuffs, shoulder capelet, folded-down hood,
   near-black navy dress, laced boots, dusty-violet scarf (two wraps, a tail and a fringe), leather belt,
   cognac pouch, silver pendant. Weights come from the nearest body vertices, blended into the spring
   chains below the hips and along the tails.
6. **Hair**: about 250 cards that slide down the skull under gravity, then fall past the jaw with a wave;
   a side parting and a fringe swept to her right above the brows; a thin cap under the cards.
7. **Textures** (Cycles bakes on the GPU): skin 2K (tone variation, blush, brows, lips, pores), garment
   atlas 2K (wool fibre, trims, leather, metal), hair 2K (strand alpha, MASK), eyes 512. Each set has base
   colour, ORM (AO, roughness, metal) and a tangent normal map; names follow `compress-glb.sh`.
8. **Clips**: `agent_anim.bake_clips` (idle, walk, run, talk, think, gesture_offer, celebrate, defeat;
   same frames and loops), then a face layer on morphs and eye bones: irregular blinks (some doubled, the
   right eye a frame late), gaze saccades, brow and lip motion per clip, syllables in `talk`. Morph and
   bone curves are exported as one glTF animation per clip (NLA tracks merged by name).

## Final look pass (11.11, target sheet `docs/art/iris/refs/I-001_01_target.png`)

The athletic costume (cropped jacket, top, leggings, trainers) is the default (`IRIS_COSTUME=athletic`); the coat
described above is the older `wanderer` costume. The pass of 11.11 added four modules; each old path is still
selectable by an environment variable for comparison.

| Module | What it builds | Old path |
|---|---|---|
| `hero_hair2.py` | Hair as a solid volume over the scalp (cut along a smooth hairline, a 5 mm strand fringe on its edge), broad overlapping locks on it, a ponytail with an opaque core and soft-tipped cards. One 2048 atlas made in numpy: opaque strand field on top, seven lock strips and the lash strip below. Flow is polar round the axis tie -> a point under the hairline over her left brow (a side parting). | `IRIS_HAIR=cards` |
| `hero_face.py` | Upper lashes rooted on the lid's outer rim (found from the blink morph), teeth and tongue inside the mouth cavity (the lower arch and tongue ride the jaw rotation fitted from `mouth_open`), the cavity marked for the skin bake, `smile` blended with the retraction unit. All inside the body mesh, so every morph moves them. | - |
| `hero_shoes.py` | Constructed trainers (a height field sliced into rings: sole band, toe bumper, heel tab, padded collar, lace bars; about 1,750 triangles each) and plain sock tubes. | `IRIS_SHOES=shell` |
| `ship.sh` | The two shipped files: `agent_iris.glb` and the phone variant `agent_iris_m.glb` (1024 textures, simplified meshes). | - |

Other changes of the pass: the head is 6 % larger (`IRIS_HEAD`, about 7.1 heads; grown about a point on the eye
line), a softer seat, flank, thigh and bust (`hero_anatomy.AMOUNT`, `ATHLETIC`, `IRIS_CUP`); the midriff skin
ends in a true cut 1 cm under the leggings' edge; the leggings reach the trainers' collar; the face bake has a
soft contour, defined lips, a scalp tone under the hair and a dark mouth; the eyes have a larger green-grey
iris with a limbal ring, a darker sclera, a lid shadow and a catchlight; no vertex colours are exported (the
bake attributes went out as `COLOR_0..3` and the game multiplied the garment by them).

Materials: `M_Iris_Skin`, `M_Iris_Garment`, `M_Iris_Eye`, `M_Iris_CapHair` (volume, locks, tail core:
alpha-tested, single-sided), `M_Iris_Hair` (tail cards and lashes: alpha-tested, double-sided), `M_Iris_Mouth`.

QA: `qa_audit.py` (Cycles sheets; back faces of single-sided materials are made transparent, as in the game),
`qa_ingame.cjs` (the real renderer), `qa_restpose.py old.glb new.glb` (skeleton rest pose diff). Against the
build shipped on 10.11 only `eye_*`, `lid_*`, `brow_*` (3 mm), `tail_0` (7 mm) and `hair_*_0` (1 mm) moved, all
children of `head`; the 36 bones the mocap side-car rotates and `pelvis` are unchanged.

## Standing stance adjustment

Iris's six standing clips use no additional outward foot offset: each foot is 3 cm
closer to the centre, reducing the ankle span from 22.42 cm to 16.42 cm. Walking
and running retain their existing tracks. This reduces the upper-thigh gap without
changing the mesh, weights, costume, face, or textures.

To refresh a recovered final build without repeating the GPU bakes:

```sh
blender -b --python art/agents/iris_hero/update_stance.py -- /path/to/iris_hero.blend /path/to/separate-output
node art/agents/iris_hero/apply-stance-animation.mjs /path/to/original-compressed.glb /path/to/separate-output/agent_iris.glb game/public/assets/models/agent_iris.glb
```

The first command saves a separate editable file with packed textures. The second
copies only standing pelvis/leg animation channels into the original compressed
asset and checks that geometry, textures, walking, and running remain unchanged.
Source: `art-sources` commit `f07d745566f7223a512779d02f27c70c17b473a0`,
`iris_hero_final/`. Rear-view pose comparison: [before / after](../../../docs/art/qa/iris-hero/stance-before-after-detail.png).

## Third-party asset licences

| Asset | Source | Licence |
|---|---|---|
| MakeHuman base mesh (`data/3dobjs/base.obj`) | MPFB 2.0.18 add-on, extensions.blender.org | CC0 1.0 (stated in the file header, released 2020 by Data Collection AB, Joel Palmius, Jonas Hauquier) |
| MakeHuman macro, detail and expression-unit targets (`data/targets/...`) | MPFB 2.0.18 | CC0 1.0 (MakeHuman licence explanation: base mesh, targets and system assets are CC0 since 1.1; the `.target.gz` files carry no header of their own) |
| MakeHuman `default` rig and weights (`data/rigs/standard/*.default.json`) | MPFB 2.0.18 | CC0 (`"license": "CC0"` in the weights file) |
| MPFB add-on code | extensions.blender.org/add-ons/mpfb, sha256 `c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad` | GPL-3.0-or-later: used as a build tool only, nothing of its code ships |

Everything else (costume, hair, props, shaders, clips) is generated by the scripts in this folder. No
character, outfit or asset of an existing game is copied; the design follows the owner's reference.
