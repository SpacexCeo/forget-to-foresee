# Iris: skirt and leg clipping — rig report (sprint plan 9.11, step 1)

Checked on `game/public/assets/models/agent_iris.glb` as shipped (13.11), in the running game (skin weights read
from the loaded model) and from the file's own node list.

**Finding: Iris has no skirt.** The 9.11 text was written for an earlier Iris (22 meshes, 61 bones, a skirt with
skirt bones). The model in the game today wears a sports top, a cropped jacket, leggings and trainers:

| Mesh | Vertices | Weight on leg bones | Main bones |
|---|---|---|---|
| leggings | 3 889 | 77% | thigh L/R 22% each, spine 16%, shin 15% |
| jacket (+ collar, cuffs, hem, plackets, stripes) | 9 945 | 0% | chest, upper arms, forearms |
| jacket_hem | 724 | 0% | chest 81%, spine 19% |
| sports_top | 3 065 | 0% | chest 82% |
| trainers L/R, ankle socks L/R | 2 754 | 100% | foot, shin |
| base (skin: head, hands, midriff), eyes | 11 403 | 0% | head, fingers, chest |
| hair (ponytail), hair_cap, hair_tie | 4 607 | 0% | tail_0..2, head |

Skeleton: 48 joints. No `skirt_*` bones, no cloth rig, no cloth bake for Iris (`art/anim/clips.json`: only Elise has a
`cloth` entry). Secondary motion on Iris: the ponytail chain `tail_0..2` (already firmed, see
`docs/art/animation-pipeline.md`) and three unweighted hair chains.

**Consequence for steps 2 to 6 of 9.11:** there is no skirt to reweight, no skirt bones to stiffen or clamp, no hem
to cap, and no leg mesh hidden under a skirt (the leggings ARE the leg surface; nothing lies under them that could
come through). Leggings on leg bones at 77% is what a trouser leg should have; the rest is the waistband on the spine.
Nothing was changed on Iris for this item: no weights, no clips, no mesh.

**Where the owner's screenshot came from:** the heroine in the long dark dress is Elise (v4). Her skirt was the one
with the leg through it and the high hem; that is fixed and measured (`art/agents/elise/v4/README.md`, "The skirt":
cloth grid re-seated on the dress, calmer cloth, shorter strides; no leg capsule through the dress in any clip).

**What could still clip on Iris** (not measured here, none reported): the jacket's hem against the forearms in the
boxing guard, and the ponytail against the jacket collar on a head turn. If the owner sees either, it is a small
animation-only fix (arm-out degrees in `clips.json`, or the tail chain's rest angle).
