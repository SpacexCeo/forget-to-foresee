# Rigging and animating a generated humanoid for a real-time web game

Notes for the five quest givers (`npc_guard`, `npc_innkeeper`, `npc_elder`, `npc_lamplighter`, `npc_shardkeeper`):
generated, auto-rigged models that have to stand and move in a three.js scene. Sources: forum threads and engine
documentation listed at the end, plus what this project already learned on Iris, Elise and the townsfolk. Where the
sources are thin (they are mostly forum practice, not a standard) the note says so.

## 1. Skeleton: keep, clean or merge

- An auto-rig's skeleton is made for its own skin weights. The deform bones that matter beyond the plain chain are the
  **twist** bones (forearm, upper arm, thigh, calf: they spread a roll along the limb) and the **share / helper**
  bones at the elbow and the knee (they turn by half of the joint's angle and hold the volume of the bend).
- Merging to a smaller skeleton is fine for a web game (fewer bones, shared clips) **only if each helper's weight is
  redistributed to where the helper's motion came from**:
  - a twist bone's weight goes to the limb segment it sits on (a twist bone moves with its segment except for roll);
  - a knee or elbow share bone turns by half the joint angle, so its weight is **split between the two segments**
    (thigh and shin, upper arm and forearm), about half and half. Giving all of it to the lower segment makes the
    whole knee cap swing with the shin: the joint breaks sharply and the mesh above the knee tears off the thigh;
  - face, eye and finger-tip bones go to their parent.
- Bones whose weight is dropped must never fall back to an unrelated bone (the hips): that leaves vertices behind
  when the limb moves ("the leg comes off").
- Keep the joint positions of the source rig for the bones that stay; do not move a joint without re-weighting.

## 2. Rest poses before retargeting

- A retarget transfers rotations **relative to a rest pose**. The source clips' rest pose and the character's rest
  pose must describe the same stance, or every frame carries the difference: clips authored on legs that hang
  straight down, played on a model bound in an A-stance with the feet apart, stand with the legs spread; the arms
  have the same problem between T- and A-pose.
- Two sound ways to remove the difference: (a) re-pose the character into the clips' rest stance and **apply that pose
  as the new rest pose** (the mesh is re-bound there), or (b) retarget in world space with a per-bone rest-to-rest
  offset that aligns the **direction of every limb segment**, not only the bone's frame.
- Bone roll matters whenever rotations are copied in bone-local space: a different roll turns a knee bend into a
  sideways bend. World-space retargeting with a rest-to-rest offset is not sensitive to roll, but a hinge joint
  (knee, elbow) still needs its bend plane checked.
- Apply object transforms (scale 1, no rotation on the armature or the mesh) before binding and before export.

## 3. Retarget method

- Blender has no built-in retarget; the usual tools map bones by name and either copy rotations through constraints
  and **bake** to keyframes, or compute the offsets directly. Whatever the tool, the output should be a baked clip on
  the character's own skeleton: nothing left to resolve at run time.
- Retargeting at load time (in the browser) is attractive for sharing one clip set, but it hides errors: the result
  is never looked at in an editor and cannot be checked by a build. Prefer **baking per character offline** and
  shipping the baked clips; keep the run-time path only for bodies that match the clips' proportions closely.
- Legs: after copying rotations, proportions differ, so the feet no longer land where the source's did. Solve the
  legs with **two-bone IK toward the source's foot targets scaled by leg length**, with the knee's **pole direction
  taken from the source pose** (the plane of thigh and shin), not from a fixed axis: a fixed pole flips when the leg
  passes straight.
- Hips height is scaled by the leg-length ratio; hips sway and bob should be scaled too, or short characters bounce.

## 4. Weights

- Start from the auto-rig's own weights (they fit this mesh), merged as in section 1. Use a transfer from a clean
  body (Data Transfer, nearest face interpolated) only for regions the auto-rig got wrong, typically cloth hanging
  beside a limb (a coat on the arm that rests against it) or the crotch.
- After merging: **normalize**, **limit to 4 influences** (glTF stores joints in sets of four and three.js reads only
  the first set), normalize again, and drop weights below about 0.5%.
- Smooth across the knee and elbow so the blend covers a few centimetres on both sides; a hard boundary gives a
  crease that reads as a broken joint.
- Vertices that share a position must share weights (generated meshes arrive as triangle soups: weld or copy
  weights across duplicates), or seams open when the joint bends.
- Long coats and skirts welded to the legs: cap the leg influence on cloth that hangs away from the leg, give the rest
  to the hips; do not let one leg's weight cross the centre line.

## 5. Feet

- A planted foot must not move: in an in-place clip the stance foot travels backward at exactly the character's
  speed; in a standing clip (idle, talk, wave) both feet stay where they are for the whole clip.
- Enforce it with IK after the retarget: pin each foot to its planted position while it is down, keep the ankle
  height, and let the hips absorb the difference.
- Knees: never fully straight (keep a few degrees of bend, or the IK snaps when the target moves out of reach: the
  "pop"), never bent backward, and the bend plane continuous from frame to frame.
- Reach: if the target is farther than the leg, lower the hips or shorten the step instead of stretching.

## 6. Root motion or in-place

- This game moves characters in code, so clips are **in-place** with the speed they were authored for stored beside
  them; the mover plays the walk at `speed / authored speed`. A mismatch between the two is the most common cause
  of sliding feet.
- The root bone carries nothing; the hips carry the bob and sway only.

## 7. glTF export

- Sample every clip at a fixed rate (30 fps is enough for these clips), linear interpolation, one action per clip.
- Quaternion tracks must be **continuous** (no sign flips between neighbouring keys: flip `q` to `-q` where the dot
  product with the previous key is negative), or the run-time interpolation takes the long way round for one frame.
- Loops: first and last key equal.
- Scale 1 everywhere, +Y up, no animated scale; skin with at most 4 influences; no tangents or extra attributes for
  these bodies.
- Check the exported file, not the Blender scene: load it, play every clip, measure (section 8).

## 8. Checklist (measured on the exported file)

| # | Check | Limit |
|---|---|---|
| 1 | every helper bone's weight redistributed (twist to its segment, knee and elbow shares split) | no weight left on dropped bones |
| 2 | weights normalized, at most 4 influences, duplicates at one position share weights | exact |
| 3 | rest stance of the character matches the clips' rest stance, or a direction-aligned rest offset is used | legs within 3 degrees |
| 4 | clips baked offline on the character's own skeleton, or the run-time retarget measured by the same check | measured |
| 5 | no vertex pulled away from its rest neighbours | leg edges stretch under 3 cm while the legs stay nearly straight, under 10 cm in clips that bend a knee past 25 degrees (the outside of a bent knee lengthens by radius times angle) |
| 6 | knee angle | 3 to 150 degrees, never negative |
| 7 | knee bend plane continuous | under 25 degrees change per frame |
| 8 | planted foot | slides under 2 cm while down |
| 9 | feet on the floor | sole within 2 cm of the floor while down, never below it |
| 10 | quaternion tracks continuous; loops close | exact |
| 11 | looked at from the side at the game camera | film |

## 9. Diagnosis of the five quest givers (13.11)

Measured with `art/townsfolk/npc_check.mjs` on what the game played (`check/before.json`; the stretch column of that
first run also counted the hands hanging beside the legs, the later runs count the legs' own skin only):

| giver | ankles off their own stance, idle (cm) | knee bend plane turns in one frame, walk (deg) | planted foot slides, walk (cm) | feet slide, wave (cm) | worst edge stretch below the hips (cm) |
|---|---|---|---|---|---|
| guard | 18 | 106 | 5 | 20 | 7 |
| innkeeper | 11 | 115 | 4 | 19 | 17 |
| elder | 5 | 90 | 4 | 10 | 8 |
| lamplighter | 2 | 106 | 5 | 20 | 68 |
| shardkeeper | 12 | 105 | 5 | 18 | 4 |

What the owner saw, and its cause:

- **"The legs spread apart."** The load-time retarget sent each ankle to the reference's absolute foot position
  scaled by leg length. The reference stands with its feet close; these models are bound in a wider stance. Every
  clip pulled the feet 3 to 17 cm off the model's own stance, so the legs leaned in or out from the hips
  (checklist 3).
- **"They straighten sharply" / "the movements look absurd."** The knee's bend plane was taken from the retargeted
  thigh alone. When the leg came near straight, or the thigh fell behind the hip-to-ankle line, the plane swung by
  90 to 128 degrees in one frame: the knee snapped sideways or bent backward for a frame (checklist 6, 7).
- **"The legs lag."** Nothing held a planted foot: 4 to 5 cm of slide per step in the walk, and up to 20 cm in the
  standing clips (the reference shifts its feet during the wave; scaled to another body that reads as skating)
  (checklist 8).
- **"They come off."** Weights. The knee and elbow share bones were merged whole into the shin and the forearm, so the
  knee cap swung with the shin and the skin above it tore away from the thigh; cloth and hip skin next to a resting
  arm carried arm weight, and some leg weight crossed the centre line (the lamplighter worst: 15 to 68 cm of
  stretch) (checklist 1, 4).

## 10. What was changed

- `game/src/play/anim-library.js`, the careful legs (`planted`, on for `npc_*`): the reference's foot travel is added
  to the character's own rest foot; a foot that is down stays put in a standing clip and travels at exactly the
  clip's speed in a walk, the difference fading out over the swing; the knee's plane leans on the way the hips face
  and never points behind them.
- `art/townsfolk/npc_build.py`: share bones split half and half between the two segments; arm weight removed from
  everything farther than 8 to 13 cm from the arm's own bones; leg weight returned to its own side; the coat rule
  (cloth hanging away from a leg follows it by 35% at most) on the three coats.
- Not done: clips are still retargeted at load, not baked per character offline (checklist 4). The check therefore
  runs the game's own loader and retarget, so it measures what is played.

## 11. Result

`check/after.json` (run: `node art/townsfolk/npc_check.mjs`, dev server up): every clip the givers play is within the
limits on all five. Ankles within 3 cm of the model's own stance in the standing clips (were up to 18), knee bend
plane turns 13 degrees a frame at most (were up to 128), a planted foot slides under 1 cm in every clip (were 5 cm a
step, 20 cm in the wave), the legs' own skin stretches 3 cm at most while standing (the lamplighter's was 15 to 68).
The fingers are no longer flat: a relaxed curl, long fingers most, with a slow small movement.

Frames, before on the left and after on the right, side view: `givers_walk_before_after.jpg`,
`givers_wave_before_after.jpg`, `givers_talk_before_after.jpg`; film `givers_before_after.mp4` (walk and wave).

Still open: the clips are the shared townsfolk set (motion capture retargeted), not hand-made per character; the
fingers are one bone per group (index, the other three, thumb), so they curl at the knuckle only; the guard stands
with slightly bent knees; `play` (the violin) and `child_run` are measured but not judged for the givers.

## Sources

Forum practice and tool documentation (links only):

- retargeting needs matching rest poses; bone orientation and skin distortion; rigging for the web:
  <https://discourse.threejs.org/t/retargeting-issues/45895>,
  <https://discourse.threejs.org/t/how-to-solve-the-problem-of-skin-distortion-caused-by-different-orientations-of-model-bones-during-animation-migration/62883>,
  <https://discourse.threejs.org/t/rigging-and-animation/58300>
- rest pose, bone roll, applying transforms before export:
  <https://docs.godotengine.org/en/4.5/tutorials/assets_pipeline/retargeting_3d_skeletons.html>,
  <https://blenderartists.org/t/issues-with-retargeting-animations-in-auto-rig-pro/1604289>
- animation sampling on export: <https://documentation-6yx6en5g3-babylonjs.vercel.app/preparingArtForBabylon/dccToGltf>
- skin weights come in sets of four, and the web renderer reads the first set:
  <https://web3d.org/pipermail/x3d-public_web3d.org/2024-November/020879.html>
- pinning a foot while it is down; speed matching for in-place clips:
  <https://dev.epicgames.com/documentation/unreal-engine/fix-foot-sliding-with-ik-retargeter-in-unreal-engine>,
  <https://bugnet.io/blog/how-to-fix-animation-foot-sliding>
