# Character guide: bodies and animation (one page)

Quality bar (owner, 08.11): appealing stylized hero characters that read instantly, with the clarity of
the best stylized shooters. **Original designs only**: no character, outfit, silhouette or asset is copied.
Applies to Iris and the six clan agents (`art/agents/`), built procedurally and checked in QA renders.

## Body design

- **Proportions.** About 7 heads tall: a slightly larger head and hands than realistic, so faces and
  gestures read from the isometric camera. Eye line on the middle of the head (`agent_geometry.FACE`).
- **Silhouette first.** Each clan must be recognisable as a black shape: Iris (tall collar, long open cloak,
  scarf tail), Salt (tiered bell robe, hood, balance), Ash (stake crown, hunched), Moss (round leafy
  capelet, cauldron), Amber (flat hat, coat, strong-box), Frost (tall pointed hood, staff). Cloaks must
  not swallow the body: keep shoulders, waist and legs readable (narrower cloaks, shorter capes).
- **Shape language.** Round and soft = friendly (Moss); triangles and spikes = threat (Ash); tall
  verticals = cold authority (Frost); squares = trade (Amber); bells and tiers = ritual (Salt).
- **Material breakup.** Two to three value groups per character, a trim or hem band in a second colour,
  leather and metal accents at belts, clasps and cuffs; smooth shading on soft parts, a painted value
  gradient (lighter top, deeper bottom).
- **Hands and feet.** Readable silhouettes: thumb separated, boots with a heel and a toe line. Hands are
  the next thing to improve (currently mittens with finger bones).
- **Posture = temperament** (`agent_anim.STYLE`): lean, hunch, shoulder protraction, chin and stance width
  per clan.

## The 12 principles in our clips

| Principle | Where it shows |
|---|---|
| Squash and stretch | subtle: chest breathing scale, the body compressing in the walk's down pose |
| Anticipation | gestures (offer, celebrate) wind up before the action; run start dips first |
| Staging | one clear action per clip, readable from the isometric camera |
| Straight ahead / pose to pose | keyed procedural poses, spring-simulated cloth baked straight ahead |
| Follow-through and overlapping action | chest, neck and head lag the pelvis; hands drag behind the forearm; cloak, scarf and hair chains are spring-simulated |
| Slow in / slow out | eased curves (`sm`, `env`) on every move |
| Arcs | hands and feet travel on arcs (Hermite foot paths, arm swing) |
| Secondary action | blinks, glances, finger curls, breathing in every idle |
| Timing | walk 0.8 s, run 0.67 s per cycle; heavier clans slower and lower |
| Exaggeration | stylized: clearer arm swing and lean than realistic |
| Solid drawing | volumes kept under the rig: no candy-wrapper wrists, knees and elbows keep volume |
| Appeal | asymmetry in poses, clear faces, a confident hero stance for Iris |

## Locomotion checklist

- Body lowest just **after** each contact (the down pose), highest at the passing pose.
- Pelvis rolls and yaws; chest counter-rotates; head stays stable but trails slightly.
- Feet planted with no sliding (`foot_slip` check), arms clear of the body and the cloak.
- Clip names stay: idle, walk, run, talk, think, gesture_offer, celebrate, defeat (the game blends them).

## QA before shipping

Close-up face sheets and animation contact sheets (`review_anim.py`), turntables
(`art/tools/pitch_turntable.py`), and a real-WebGL in-game look on a GPU. Budgets: 16k triangles,
KTX2 + meshopt, phone `_m` variants above 2048 textures.
