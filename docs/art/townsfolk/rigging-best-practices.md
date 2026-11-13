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
| 4 | clips baked offline on the character's own skeleton | no run-time retarget |
| 5 | no vertex pulled away from its rest neighbours | edge stretch under 2.5 cm on the legs |
| 6 | knee angle | 3 to 150 degrees, never negative |
| 7 | knee bend plane continuous | under 25 degrees change per frame |
| 8 | planted foot | slides under 2 cm while down |
| 9 | feet on the floor | sole within 2 cm of the floor while down, never below it |
| 10 | quaternion tracks continuous; loops close | exact |
| 11 | looked at from the side at the game camera | film |

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
