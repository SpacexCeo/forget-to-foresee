# Demo video: 60–90 s shot list (follows the README judge path)

Goal: one complete moment, from a real action to a visible, verified result, in the order a judge will repeat it.
Record at 1920×1080, 30 or 60 fps, English UI, Novice mode, from
`https://spacexceo.github.io/forget-to-foresee/?demo=judge` (or `npm run dev` + `/?demo=judge`; the season is
fixed, so the trial-3 Gift always lands on Shell II with power 20). Hide the mouse cursor in the recorder; keep the
HUD visible (it carries the proof text). Audio: the game's own sounds (unlock with the first click) plus a quiet
voice-over or captions; no third-party music. The 10 s teaser (`docs/video/forget-to-foresee-teaser-10s.mp4`) can
open or close the cut.

| # | Time | Shot | On screen | Caption / voice-over |
|---|---|---|---|---|
| 1 | 0–6 s | Lobby: title, mist, "THE FUTURE COSTS A MEMORY"; click **ENTER THE WORLD** | FORGET / TO FORESEE, language pills EN UA RU IT 中文 | "Most AI games decide the ending for you. Here the future is sealed before you move." |
| 2 | 6–12 s | Skip quickly through Continue as guest → tutorial (hold on the page "How the Guests speak", the 4-slot ring) → Guide me (Novice) → Begin first contact → Step onto the island | The sign ring: Place, Action, Power, Delay | "The Guests speak in round signs of four slots." |
| 3 | 12–22 s | The island from the balcony; press **G**; cut the walk to ~6 s (speed ramp) | HUD: Trial 1 of 17, Silk 63, the quest banner; log line *Owner's Key committed: 0x…* | "Your agent Iris. Six clans. Four Shells. The season's events are already committed to a Merkle root." |
| 4 | 22–30 s | At the Scroll press **E**: *Give your fragment to the Scroll*; then **M**, click **Forget it for a vision** on the First Word | Memories panel; the quest changes to The Price of Memory; Signs & Visions opens with four *vision* cards | "To see the future, Iris forgets a memory forever. The memory goes to auction as a shard." |
| 5 | 30–40 s | Press **V**: the sign cards; hover one card; optional: open Settings → Pro to show the four slots with confidence, back to Novice | *Unsure: Gift of 10 at Shell I, trial 2* (Novice) / the slot rows (Pro) | "She reads the signs. Early on she is guessing." |
| 6 | 40–50 s | Walk to the anchor zone (G), press **E**, choose *Anchor here for tick …*; silk drops by 10 | Log: *Anchor: Shell I, tick N* | "You stake silk on where the Gift will land." |
| 7 | 50–58 s | Optional 8 s: from the anchor zone **E → Enter Shell I**; the Guest draws the sign on the glass; **E → Ask the Guests** | The glass, the logogram, the ask panel | "Inside the Shell the Guests draw the sign stroke by stroke." (Cut this shot if the interior is not fixed by the freeze.) |
| 8 | 58–72 s | Press **T, T** three times; hold on the trial-3 log line; then **V → Resolved** | ***Tick 3 · Shell II: Gift, power 20. Leaf #0 checked against the root ✓*** and **Sign #1 · Revealed · Verified ✓ · Came true: Gift of 20 at Shell II, trial 3** | "Trial 3. The sign comes true, and the reveal is checked against the root committed before you arrived." |
| 9 | 72–82 s | Cut to a terminal: `cargo test --lib` in `contracts/season-commit` (or the GitHub Actions green run) and `node examples/agent.mjs` printing `firstProofVerified: true` | `test result: ok. 56 passed`; the agent's JSON summary | "The same proof is verified by our NEAR contract, and AI agents play the same room over an open API." |
| 10 | 82–90 s | End card | Forget to Foresee · RAEN Computers · Built at NEAR HACKATHON · spacexceo.github.io/forget-to-foresee · github.com/SpacexCeo/forget-to-foresee | "What would you forget to see the future?" |

Notes for the editor
- Keep the proof line (shot 8) on screen for at least 3 s; it is the one claim a judge will verify.
- Do not show anything the README calls mock as if it were real: no "on-chain" wording until the contract is deployed
  and the game calls it; the game text says "checked against the root", keep that wording in captions.
- Shots 3 and 6 contain real-time walking (~30 s each at walking speed); speed-ramp them or hold Shift to run.
- If the recording machine shows greybox stand-ins while models stream, wait ~1 min after entering the world before
  recording shot 3 (the full model set is about 290 MB; the judge path streams ~140 MB in the first minute).
- Export: H.264, ≤ 2 min, ≤ 512 MB (X limits for most accounts); keep a 1080p master.
