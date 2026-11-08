# Demo video: shot list (72 s, follows the README judge table for the Shell hub, 08.11)

The video is not recorded by hand: `tools/capture/shots/demo.mjs` renders it frame by frame from the game on the
fixed judge season (`/?demo=judge`, Shell hub, Novice), so every beat below happens exactly as a judge will repeat it
(`docs/submission/trailer.md` explains the pipeline, `node tools/capture/capture.mjs demo --draft` renders it). Audio is
the game's own music and sounds mixed to picture; captions carry the pitch (SRT plus a burned-in version); no
third-party music, no voice-over. The 10 s teaser (`docs/video/forget-to-foresee-teaser-10s.mp4`) is not used.

| # | Time | Shot | On screen | Caption |
|---|---|---|---|---|
| 1 | 0–5 s | Lobby: the owner's art, drifting mist, FORGET / TO FORESEE, THE FUTURE COSTS A MEMORY; **ENTER THE WORLD** is pressed at 4.1 s | Language pills EN UA RU IT 中文, Guest demo | "Most games with "AI agents" let the AI decide the ending." |
| 2 | 5–13 s | Beauty, no UI: a slow orbit from the cloud sea settling toward the plaza (camera from 98 m to 78 m out, 40 → 30 m up) | The archipelago, six camps, four levitating Shells, the floating glyph | "Here the whole season is sealed in a Merkle root before you make a move." / "A floating archipelago. Six clans of AI agents. Four Shells." |
| 3 | 13–37 s | Gameplay, one continuous take with the game's own camera: Iris on the balcony with the HUD and the Shell dock; at 16 s the gold **Shell I** is clicked (fade, flight); inside, the Guest draws the sign on the glass while the reading card shows Iris's guess per slot; at 23.6 s **Delay ›** (the card reads "Gift at Shell I, trial 3"); at 25.6 s **F** stakes 10 silk (silk 63 → 53, notice "10 silk staked on Shell I, trial 3"); at 28.8 s **T** leaves (fade): Trial 2 of 17, "A new sign glows in Shell I"; at 33.4 s **T** lets trial 2 pass: Trial 3, Moss's loan card opens (cut) | HUD: Trial 1 of 17, Silk 63, quest *Fly into Shell I*; the reading card; the dock | "Your agent Iris. The Guests inside the Shells draw signs on the glass." / "A sign is a ring of four slots: Place, Action, Power, Delay." / "Iris guesses. You set Delay so the stake lands on trial 3." / "Stake 10 silk on your reading." / "Leaving the Shell ends the trial. A new sign glows." / "Trials pass on their own and stop when a clan wants something." |
| 4 | 37–63 s | Continuous: Moss's card "Lend me 15 silk, I'll return 25 at tick 7" → **Decline** at 38.8 s; trial 3 ends on its own: log *The gift went to Frost.* and ***Tick 3 · Shell II: Gift, power 20. Leaf #0 checked against the root ✓***, silk 72; the clock stops on trial 4's new signs; at 44.4 s **V** opens Signs & Visions, at 45.4 s the **Resolved** tab: **Sign #1 · Revealed · Verified ✓ · Came true: Gift of 20 at Shell II, trial 3** (held 5.6 s); Esc at 51 s; **M** at 52.4 s; at 55.2 s **Forget it for a vision** on *The Shells' Call*: the vision effect, log *Vision: Iris sees 2 future signs before anyone else.* and *Shard "…" is up for auction.*, Signs & Visions with two *vision* cards | The decision card, the log, the Resolved tab, the Memories panel | "Moss asks for a loan. The clans lend, trade words, keep or break trust." / "Trial 3 comes true: a Gift of 20 on Shell II. Your stake returns." / "Every reveal is checked against the root committed before trial 1: Verified ✓" / "To see further, Iris forgets a memory forever. It goes to auction as a shard." / "Two future signs appear: a vision only she sees." |
| 5 | 63–72 s | Beauty: Shell IV up close with its mist, the camera drifting toward the glyph; the end card fades in at 66 s: FORGET / TO FORESEE · The future costs a memory · RAEN Computers · built at NEAR HACKATHON · spacexceo.github.io/forget-to-foresee · github.com/SpacexCeo/forget-to-foresee; fade to black | End card in the game's typography | "What would you forget to see the future?" / "Play it in the browser. Built at NEAR HACKATHON by RAEN Computers." |

Rules kept
- The proof line and "Verified ✓" stay on screen for more than 3 s each (shot 4); the wording is the game's own
  ("checked against the root"), never "on-chain", because the contract is not deployed.
- Nothing the README calls mock is shown as real; the agent API and the contract tests are not in the video (the
  README and the X thread carry them).
- Export: H.264 High, 1080p60 (720p60 for the CPU drafts), ≤ 90 MB, ≤ 2 min, captions as a separate SRT and a burned-in
  version; a 4K master when rendered on the GPU server.
