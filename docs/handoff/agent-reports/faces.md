# faces: report (20:26 UTC)

## Shipped
- Faces for all six clan agents (iris, sol, pepel, moh, yantar, iney). Each face is built from faceted parts (`agent_geometry.build_face`, positions in `FACE`): eyeballs with a dark iris tinted by the clan accent, upper and lower lid shells, angled brow ridges, cheekbone facets, a wedge nose, a mouth cavity, an upper lip, and a lower lip + chin plate.
- 13 new bones (53 joints in total): `jaw`, `lid_up_L/R`, `lid_lo_L/R`, `brow_L/R` (lid and brow parts skinned rigidly; the jaw also drives the lower front of the head mesh), and `thumb/index/fingers_L/R` (the hand weights are passed onto the fingers past the palm).
- `agent_anim.face_hands` layers motion on top of the clips: blinks in idle (2), talk and think; jaw breathing in idle; ~13 syllables of jaw plus brow beats in talk; finger curls in idle, walk/run (following the arm swing), talk (right hand) and gesture_offer (the hand opens and the thumb spreads); the hand holding a prop grips it. Clip names are unchanged (8 clips verified in every glb).
- glbs (KTX2 + meshopt, from the build's export) are in game/public/assets/models/agent_<clan>.glb. Runtime tris: iris 12652, sol 12660, pepel 10154, moh 11586, yantar 10186, iney 11470 (all <=16k; faces add ~490 tris).
- Review renders (EEVEE, `art/agents/review_anim.py`) in docs/art/qa/agents/<clan>/anim/: `<clan>_anim_sheet.jpg` (8 walk + 8 idle + 4 talk), `<clan>_face.jpg` (rest / blink / talk jaw open), `<clan>_walk_turntable.mp4` (2.5 s). 1.3 MB in total.
- Polish pass: the first review showed cheek slabs hiding the eyes and eyes sunk too deep. Fixed (eyes moved forward and enlarged, cheeks smaller, wider lid opening, stronger blink), then rebuilt and re-rendered all six to confirm.

## Not done
- No body or limb key polish (foot planting, arm swing, cloth overlap). The sheets showed no obvious breakage.
- agent_suit was not rebuilt (it is not built by build_agents.py).
- docs/art/qa/agents/build-stats.json was not refreshed: parallel per-agent builds race on it.
- Fingers deform the existing mitten hand mesh; no separate finger geometry.
