# Demo video: shot list (75 s, the README judge path from its own URL, 08.11)

The video is not recorded by hand: `tools/capture/shots/demo.mjs` renders it frame by frame from the game on the fixed
judge season, in real time (no speed ramps, no time-lapse; plain cuts only), so every beat below happens exactly as a
judge will repeat it (`docs/submission/trailer.md` explains the pipeline; `node tools/capture/capture.mjs demo --draft`
renders it). Cut to the juror's notes (`docs/jury`, 08.11) and the owner's "make the videos interesting": the strongest image first (the Guest drawing the sign, 4 s), the payoff next, the judge
table recorded from `?demo=judge&mode=walk`, the Shell hub as a labelled second segment, and the wording "the season was
fixed before trial 1 and checked against that seal" (never "proven honest" or "provably fair"; never "on-chain"). Audio is
the game's own music and sounds mixed to picture; captions carry the pitch (SRT plus a burned-in version); no third-party
music, no voice-over. The 10 s teaser (`docs/video/forget-to-foresee-teaser-10s.mp4`) is not used.

| # | Time | Shot | On screen | Caption |
|---|---|---|---|---|
| 1 | 0–4 s | The strongest image first: inside Shell I the Guest comes forward through the mist and draws the ring sign on the glass, Iris small in front; a slow push from behind her | No UI but the label *The Shell hub · …/?demo=judge* | "Behind the glass, a Guest draws a round sign of what is coming." |
| 2 | 4–8 s | Cold open on the payoff: trial 4 of the judge path, Iris at Shell I's pad, Signs & Visions on **Resolved** | **Sign #1 · Revealed · Verified ✓ · Came true: Gift of 20 at Shell II, trial 3**; HUD Trial 4 of 17, Silk 72; label *The judge path · …/?demo=judge&mode=walk* | "Trial 3 came true, exactly as the seal said: Verified ✓" |
| 3 | 8–10 s | The archipelago from the cloud sea, no UI, a short orbit toward the plaza (2 s: no wide fog shot over 2 s) | Six camps, four levitating Shells, the floating glyph | "Forget to Foresee: the whole season is fixed before trial 1, and every reveal is checked against that seal." |
| 4 | 10–19 s | The judge path from its first frame (`?demo=judge&mode=walk`): Iris on the balcony, HUD Trial 1 of 17, Silk 63, quest *Stake 10 silk at Shell I's pad*; **Shift** held, **G**: Iris runs over the bridge (cut mid-bridge) | The HUD, the quest banner, the log *Owner's Key committed: 0x…*; the segment label | "Your agent Iris. Six clans of AI agents with wallets and memory. Four Shells." / "The Guests draw round signs. Iris reads one: a Gift, two trials out." |
| 5 | 19–53 s | One continuous take at the pad: the last steps of the run, the context menu (**E · Anchor here for trial 3** · 2 … · 3 …), **E** at 23.6 s: silk 53, log *Anchor: Shell I, tick 3*, quest *End trial 1*; **T T** at 27–28 s → Trial 2 (56); **T T** → Trial 3; **T T** at 35–36 s → Trial 4: silk **72**, log ***Tick 3 · Shell II: Gift, power 20. Leaf #0 checked against the root ✓***, hint *It came true, and the seal matches*; **V** at 40 s, **Resolved** at 41 s: **Verified ✓** (held 5 s); Esc; **M** at 47 s; **Forget it for a vision** on *The Shells' Call* at 49.4 s: the vision effect, log *Vision: Iris sees 2 future signs before anyone else.* and *Shard "…" is up for auction.*, Signs & Visions with two *vision* cards | The context menu, the log, the Resolved tab, the Memories panel | "At Shell I's pad: stake 10 silk on trial 3." / "Silk 63 to 53. Now end the trials; T ends one." / "Trials 1 and 2 pass. The clans trade, lend and place their fragments." / "Trial 3 comes true: a Gift of 20 on Shell II. The stake returns, and the leaf is checked against the seal." / "Signs & Visions, Resolved: Verified ✓. The season was fixed before trial 1 and checked against that seal." / "The Price of Memory: Iris forgets a memory forever to see the next signs early. The memory becomes a shard at auction." |
| 6 | 53–67 s | The Shell hub (`?demo=judge`), labelled: the dock on the balcony, the gold **Shell I** clicked at 54.2 s (fade, flight), inside: the Guest draws the sign on the glass while the reading card shows Iris's guess per slot (Delay pre-read to trial 3), **F** at 63.4 s stakes 10 silk | The dock, the reading card, the notice *10 silk staked on Shell I, trial 3* | "The same season in the Shell hub: fly in, and the Guest draws on the glass." / "Iris pre-reads each slot. Change any you doubt, then stake." / "It all runs in your browser. The NEAR contract for the same check is tested, not yet deployed." |
| 7 | 67–75 s | Shell IV with its mist, the camera drifting toward the glyph; the end card at 69.4 s: FORGET / TO FORESEE · The future costs a memory · RAEN Computers · built at NEAR HACKATHON · spacexceo.github.io/forget-to-foresee · github.com/SpacexCeo/forget-to-foresee; fade to black | End card in the game's typography | "What would you forget to see the future?" / "Play it in the browser. Built at NEAR HACKATHON by RAEN Computers." |

Rules kept
- Real time only: the run and the trials happen at the game's speed; the walk is shortened by a cut, never a ramp.
- The proof line and "Verified ✓" stay on screen for more than 3 s each; the wording is the game's own ("checked against
  the root") and the juror's ("fixed before trial 1 and checked against that seal"); never "on-chain", because the contract
  is not deployed; the hub segment says so.
- Each segment shows the URL a judge opens to see the same thing; nothing the README calls mock is shown as real.
- Export: H.264 High, 1080p60 (720p60 for the CPU drafts), ≤ 90 MB, ≤ 2 min, captions as a separate SRT and a burned-in
  version; a 4K master when rendered on the GPU server.
