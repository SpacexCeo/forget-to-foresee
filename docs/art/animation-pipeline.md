# Animation pipeline (R-001): motion capture → our rig

State on 10.11.2026, branch `claude/anim-rig`. Owner: "the rigs and animation are very bad; use the best
technique." The hand-coded procedural clips of `art/agents/agent_anim.py` are being replaced by clips retargeted
from human motion capture, cleaned up and styled per character. Everything is scripted and reproducible.

## Sources and licences

| Source | Licence | Use |
|---|---|---|
| CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu (BVH conversion by B. Hahne, cgspeed.com, mirrored at github.com/una-dinosauria/cmu-mocap) | "This data is free for use in research and commercial projects worldwide" (CMU); the BVH conversion adds no restrictions. Acknowledgement requested: "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217." | every clip so far |

Not used: LAFAN1, the Bandai Namco set and other NC/ND data; no Mixamo files. The takes behind each shipped clip
are listed in `art/anim/clips.json`, in the clip's `extras.take` inside the .glb and in `docs/art/manifest.md`.
The BVH files themselves are not committed (2.9 GB for the whole database); `art/anim/fetch_mocap.py` downloads
exactly the takes `clips.json` names.

## Steps (`art/anim/ftfanim/`, numpy only; no Blender needed for the clips)

1. **Read the take** (`bvh.py`): BVH hierarchy and channels, forward kinematics for all frames (120 fps).
2. **Read our skeleton** (`rig.py`) from the shipped character .glb: the exact rest pose three.js skins with (bone
   names, parents, rest translations and rotations). No rebuild of the model is needed to make clips for it.
3. **Retarget** (`retarget.py`): for every mapped bone the actor's world-space rotation since the take's T-pose
   frame is applied to our bone; arms and legs are first aligned to the take's T-pose directions, so each limb bone
   points exactly where the actor's did, whatever the two skeletons' rest poses are. Positions are scaled by the
   leg-length ratio (proportion-aware root motion: a child or a tall elder takes steps of its own size); standing
   with straight legs maps to our character standing with straight legs.
4. **Locomotion cycles** (`loco.py: build_cycle`): one stride is cut between two matching foot events, turned to
   travel along +Z, its loop closed by spreading the end-to-start difference over the cycle, low-pass filtered and
   resampled to the clip's frame count. The clip is in place and its stride is scaled so that it covers exactly
   speed × duration (walk 1.7 m/s, run 3.3 m/s, the numbers of `game/src/play/gait.js`).
5. **Actions** (`loco.py: build_action`): idles, gestures and work loops stay where the actor stood; a loop is
   closed by cross-fading the end into the start.
6. **Planted feet** (`plant_and_solve`): contacts are detected from the sole (heel or ball low and moving with the
   ground); a planted foot is locked to the ground (which runs at exactly the clip speed under an in-place cycle),
   pivoting on the heel at the strike and on the ball at the toe-off; soles never go below the ground; the hips come
   down where a leg would over-extend; both legs are solved with two-bone IK toward the captured knee direction;
   the toes stay flat while the heel peels off.
7. **Style per character** (`clips.json` → `DEFAULT_STYLE`): foot track width, arm swing, pelvis and chest
   rotation, bounce, lean, head stabilisation, hand poses; the spine, neck and head are re-centred on our rig's own
   posture (the take's T-pose is a guess, so its mean posture carries a constant error).
8. **Secondary motion** (`chains.py`): hair, tail, scarf, cloak and skirt chains are damped springs simulated over
   the baked body motion with warm-up passes, so loops close.
9. **Export** (`gltfio.py`): a side-car `game/public/assets/anim/<character>.glb` with the skeleton and the clips
   (rotations for the body, fingers and chains, translation for the pelvis only; 30 fps).

Build: `python3 art/anim/build_clips.py --char iris --mocap <dir>`; the numbers of every clip (source stride and
speed, stride and time scale, foot slip, hip correction, contact frames) go to `art/anim/out/<character>.json`.

## Runtime (`game/src/play/`)

- `anim-library.js`: loads the side-car clips and puts them in place of the model's own clips of the same name; the
  face (blinks, brows, lips, gaze) stays on an always-on layer cut from the model's own idle clip. Until the owner
  approves the new clips the game uses them only with `?anim=mocap`.
- `gait.js: GaitLayer`: walk and run are driven by one shared stride phase, so the feet stay in step through the
  whole walk ↔ run blend whatever the two clips' lengths are; a stride starts from rest at the passing pose.

## Review (`game/anim-review.html`, `art/anim/capture.mjs`)

A dev page that runs one or two characters through the game's own motion model and gait layer on a checker ground,
frame by frame and deterministically; `capture.mjs` saves an mp4, a contact sheet and a foot-slip number (speed of
the ball of the foot over the ground while it is planted). Scenarios: `idle`, `walk`, `run`, `loco` (stand → walk →
run → walk → stop), `turn` (pivot on the spot, 90° corner, reversal at a run), `clip:<name>`.
