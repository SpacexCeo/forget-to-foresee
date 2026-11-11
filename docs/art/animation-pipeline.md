# Animation pipeline (R-001): motion capture → our rig

State on 11.11.2026, branch `claude/characters-v2`. Owner: "the rigs and animation are very bad; use the best
technique." The hand-coded procedural clips of `art/agents/agent_anim.py` are replaced by clips retargeted from human
motion capture, cleaned up and styled per character. Everything is scripted and reproducible. The motion-capture
clips are the game's default since 11.11 (`?anim=classic` keeps a model's own clips).

## Sources and licences

| Source | Licence | Use |
|---|---|---|
| CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu (BVH conversion by B. Hahne, cgspeed.com, mirrored at github.com/una-dinosauria/cmu-mocap) | "This data is free for use in research and commercial projects worldwide" (CMU); the BVH conversion adds no restrictions. Acknowledgement requested: "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217." | every clip |

Not used: LAFAN1, the Bandai Namco set and other NC/ND data; no Mixamo files. The takes behind each shipped clip
are listed in `art/anim/clips.json`, in the clip's `extras.take` inside the .glb and in `docs/art/manifest.md`.
The BVH files themselves are not committed (2.9 GB for the whole database); `art/anim/fetch_mocap.py` downloads
exactly the takes `clips.json` names (into `art/anim/src/`, git-ignored).

## Shipped clips

| File | Clip | Take (CMU) | What |
|---|---|---|---|
| `iris.glb` | `idle`, `idle2` | 82_08 | 6 s loops: calm stand, breathing, a slow weight shift (left / right); arms hung along the body |
| | `walk` 1.7 m/s, `run` 3.3 m/s | 08_01, 35_20 | one stride each, feet planted |
| | `register` | 82_08 + reach layer | one-shot: the right hand reaches for the altar ring, holds, comes back (town flow, at the altar) |
| | `greet` | 141_16 | one-shot wave |
| `townsfolk.glb` | `idle`, `idle_shift`, `idle_look` | 82_08 (+ layers) | calm, weight shift, look left and right |
| | `walk` 1.3 m/s, `elder_walk` 0.45 m/s, `child_run` 2.8 m/s, `carry` 1.0 m/s | 08_01, 142_07, 35_20, 113_26 | cycles (speeds at the reference leg length; see `userData.speed`) |
| | `talk`, `talk_b` | 18_08 | conversation with hand gestures, two loops |
| | `wave`, `salute`, `nod` | 141_16; 82_08 + layers | one-shots, start and end in the idle pose |
| | `sit` | 82_08 on the seated pose of 113_15 | seated loop (chair height: `userData.pelvis_y`) |
| | `sweep`, `play`, `counter` | 79_55, 80_36, 79_14 | broom, violin bowing, kneading at counter height |

## Steps (`art/anim/ftfanim/`, numpy only; no Blender needed for the clips)

1. **Read the take** (`bvh.py`): BVH hierarchy and channels, forward kinematics for all frames (120 fps).
2. **Read our skeleton** (`rig.py`) from the shipped character .glb: the exact rest pose three.js skins with (bone
   names, parents, rest translations and rotations). No rebuild of the model is needed to make clips for it.
3. **Retarget** (`retarget.py`): for every mapped bone the actor's world-space rotation since the take's T-pose
   frame is applied to our bone; arms and legs are first aligned to the take's T-pose directions, so each limb bone
   points exactly where the actor's did, whatever the two skeletons' rest poses are. Positions are scaled by the
   leg-length ratio; standing with straight legs maps to our character standing with straight legs.
4. **Locomotion cycles** (`loco.py: build_cycle`): one stride is cut between two matching foot events, turned to
   travel along +Z, its loop closed by spreading the end-to-start difference over the cycle, low-pass filtered and
   resampled to the clip's frame count. The clip is in place and its stride is scaled so that it covers exactly
   speed × duration.
5. **Actions** (`loco.py: build_action`): idles, gestures and work loops stay where the actor stood; a loop is
   closed by cross-fading the end into the start.
6. **Planted feet** (`plant_and_solve`): contacts are detected from the sole; a planted foot is locked to the ground
   (which runs at exactly the clip speed under an in-place cycle), pivoting on the heel at the strike and on the ball
   at the toe-off; soles never go below the ground; the hips come down where a leg would over-extend; both legs are
   solved with two-bone IK toward the captured knee direction; the toes stay flat while the heel peels off.
7. **Style per character** (`clips.json` → `DEFAULT_STYLE`): foot track width, arm swing, pelvis and chest
   rotation, bounce, lean, head stabilisation, hand poses, gesture size; the spine, neck and head are re-centred on
   our rig's own posture; `arms_down` hangs the arms along the body at a set clearance (no held-out elbows) while
   the take's small motion stays; `stance` puts the hips of a standing clip over the ankles at the rest height
   (an actor's own forward stance would slant the legs).
8. **Animator layers** (`layers.py`, listed per clip in `clips.json`): a held pose from another take (`pose`: the
   seated loop), a contrapposto weight shift (`shift`), an arm reach solved with two-bone IK toward a target in
   character space or relative to a bone (`reach`: register, salute), eased additive rotations (`rotate`: nod, look,
   lean) and, for one-shots, the blend of both ends into the idle's first frame (`ease`).
9. **Secondary motion** (`chains.py`): hair, tail, scarf, cloak and skirt chains are damped springs simulated over
   the baked body motion with warm-up passes, so loops close (per-character files only).
10. **Export** (`gltfio.py`): a side-car `game/public/assets/anim/<name>.glb` with the skeleton and the clips
    (rotations for the body, fingers and chains, translation for the pelvis only; 30 fps). Each animation's `extras`
    carry `take`, `speed`, `loop`, `pelvis_y`.

Build: `python3 art/anim/fetch_mocap.py`, then `python3 art/anim/build_clips.py --char iris` and `--char townsfolk`;
the numbers of every clip go to `art/anim/out/<character>.json`. A model rebuild that keeps the bone names and the
rest pose needs nothing; otherwise run the build again (it reads the rest pose from the model).

Picking takes without a browser: `take_info.py` (time line of hip height, hand heights, foot speeds),
`find_segments.py` (calm standing windows), `find_loop.py` (best loop window of a repeated action), `preview.py`
(stick-figure contact sheet).

## Runtime (`game/src/play/`)

- `anim-library.js`
  - `sidecarClips(asset)` / `mergeClips(own, extra)`: a character's own side-car file (Iris) replaces the model's
    clips of the same name; `faceLayerClip(own)` keeps the face (blinks, brows, lips, gaze) on an always-on layer cut
    from the model's own idle clip, and a clip with its own face (the `understand` wink) takes that layer over.
  - **`townsfolkClips(model, { body, armOut, names, key })`** → `Promise<AnimationClip[]>`: the shared file
    retargeted onto any character of the shared agent rig. Call it on the freshly loaded (or `SkeletonUtils.clone`d)
    model before a mixer poses it. Limb bones are aligned to the reference's rest directions, the spine keeps the
    model's own posture, the pelvis travel is scaled by the leg-length ratio and both legs are solved again onto the
    scaled ankle positions, so feet stay planted on a 1.2 m child and a 1.9 m guard; scaled armatures are handled.
    `body` is `'adult' | 'elder' | 'child' | 'guard'` or an object like `BODY_STYLE`'s entries: playback rate,
    stride, lean, bounce and arm clearance per body type. Each clip's `userData`: `loop`, `speed` (m/s on that
    character and body type: move at this speed, or advance the clip by distance / speed), `pelvis_y`, `scale`,
    `take`. `TOWNSFOLK_CLIPS` lists the names.
- `gait.js`
  - `GaitLayer`: walk and run are driven by one shared stride phase, so the feet stay in step through the whole
    walk ↔ run blend; a stride starts from rest at the passing pose; the stride speeds come from the clips
    (`userData.speed`).
  - `FootPlant`: while a character stands, the model follows the game's heading at a human rate (320°/s, the game
    itself pivots at up to 690°/s), each foot stays where it stands in the world and steps to its place when the
    body has turned or drifted too far (one foot at a time), legs solved with two-bone IK (`solveTwoBone`). It fades
    out with the gait's weight, and holds fully once the body's real speed is zero, so it also settles the feet at
    the end of a stop. Off under reduced motion.
- `iris-avatar.js` uses all of the above; the town flow cues `register` at the altar (`createTownFlow({ onRegister })`).

## Review (`game/anim-review.html`, `art/anim/capture.mjs`, `art/anim/ingame.mjs`)

A dev page that runs one or two characters through the game's own motion model, gait layer and planted-feet layer on
a checker ground, frame by frame and deterministically; `capture.mjs` saves an mp4, a contact sheet and foot numbers
(`stance_speed_m_s`: mean speed of the slowest 30 % of frames of the balls of the feet; `slip_*`: speed while within
1 cm of the lowest height). Scenarios: `idle`, `walk`, `run`, `loco` (stand → walk → run → walk → stop), `turn`,
`pivot` (half and quarter turn on the spot), `clip:<name>`. Townsfolk: `?a=townsfolk_elder&aclips=townsfolk&body=elder
&walkclip=elder_walk&walk=clip&scenario=walk`. `ingame.mjs` records Iris in the real town (walk, run, stop, pivots,
the registration, the wink), every townsperson and a phone run through the keyboard and a spy camera on the game's own
renderer (works on software WebGL; results in `docs/art/qa/anim/chars-v2/ingame/`). `ingame-gpu.mjs` is the real-time pass on
a GPU browser: foot speeds in the game for Iris and the walkers, bursts of side stills for start, stop and turns, the
wink and the registration on the wall clock, look-at angles and the frame cost (`.../ingame-gpu/`).
