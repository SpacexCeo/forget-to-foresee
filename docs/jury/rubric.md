# Jury rubric for Forget to Foresee (NEAR Hackathon 2026)

Version 0.1, 2026-11-08 (research cycle 1). Owner: the juror agent (Task R, `docs/handoff/worker-tasks.md`).
This rubric is **inferred**: the hackathon publishes no numeric rubric (see `notes/near-hackathon-rules.md`). Every
weight below names the notes it rests on; weights change as the notes grow, and `log.md` records each change.

How the scorecards use it: each criterion is scored 0 to 10 with evidence (a URL, a command and its output, a
screenshot, a file and line). The weighted total is out of 100. A red flag (section 3) is not a deduction; it is a
gate that the submission must pass before the score means anything.

## 1. How this hackathon judges (the model)

1. **AI screening first** (Claude Code and Codex): can the project be reproduced from the README, do the claimed features
   exist, structured report, preliminary score. Humans decide; a low AI score alone cannot reject (HACKATHON.md Q-017).
2. **Human jury per track**: `games` is judged "on the game loop, not the token", bonus "if players never notice the
   chain"; `nfts` is "ownership with behavior". Prizes are per track (1st/2nd/3rd) plus one cross-track grand prize.
3. **What the page itself tells judges to look at**: a README for a machine and a human ("do X - see Y", no marketing),
   a demo post that leads with the user problem, shows one complete user action with a visible result and states NEAR's
   role concretely, a public repo with a LICENSE, baseline tags and disclosure of libraries and AI-generated code.

So the two audiences are (a) a screener that runs commands and greps for claims, and (b) a tired human judge who opens
the demo post, watches two minutes of video, opens the live link, and reads the README top. The rubric scores both.

## 2. Criteria, weights and what a 10 looks like

| # | Criterion | Weight | Resting on |
|---|---|---|---|
| C1 | Reproducibility and honesty (the screener's view) | 20 | `notes/near-hackathon-rules.md` (Q-017, README guidance); `notes/ai-screening-and-reproducibility.md` |
| C2 | Game loop and fun in the first ten minutes | 20 | `games` track text; `notes/game-jam-and-festival-judging.md` |
| C3 | NEAR integration: concrete, in the loop, verifiable | 15 | HACKATHON.md demo-post guidance, Q-011; `notes/onchain-game-design.md` |
| C4 | Innovation and story | 10 | `notes/hackathon-judging-rubrics.md`, `notes/past-near-hackathon-winners.md` |
| C5 | Technical depth and quality | 10 | `notes/hackathon-judging-rubrics.md` |
| C6 | Presentation: demo video, X post, README top | 15 | Q-012 and demo-post guidance; `notes/demo-video-and-trailer.md` |
| C7 | Completeness, polish, UX and accessibility | 10 | `notes/accessibility.md`, `notes/game-jam-and-festival-judging.md` |

Weights are provisional (cycle 1). The initial split puts 35 points on "it runs and shows well" (C1, C6) because both
judging layers start there, 35 on the game and its chain role (C2, C3) because that is what the track text names, and
30 on the rest.

### C1. Reproducibility and honesty (20)
- **10/10**: a screener with Node 20+ and Rust reproduces every README command on a clean clone in under 30 minutes
  with the stated output (test counts, server banner, agent summary); every row of the judge table is true on the
  submitted commit; the real/mock table matches the code; no claim without a path to verify it; tags `pre-hackathon`
  and `hackathon-submission` exist and the README links the diff; libraries and AI-generated code are listed; LICENSE
  present; no secrets; CI green on the submitted commit.
- **5/10**: commands work but expected output drifts (test counts, labels), or one judge-table row is stale, or a
  claimed feature is only reachable with a dev flag.
- **0/10**: install fails, tests fail, or a headline claim ("verified on-chain", "NFT") does not exist in code.

### C2. Game loop and fun in the first ten minutes (20)
- **10/10**: a first-time player knows the goal within 30 seconds, makes a meaningful decision within 2 minutes, sees
  cause and effect (stake, reveal, payout) with clear feedback, reaches the signature mechanic (forget a memory to
  foresee) inside the session, and wants another season. The economy (silk, trust, fragments, tension) is legible
  without reading docs. Failure states are understandable. The loop works without the walkthrough table.
- **5/10**: the loop is complete but needs the README table or hotkey list to be followed; the first decision is a
  guess; payout feedback is text in a log.
- **0/10**: the player cannot find the first action, or the season cannot be finished.

### C3. NEAR integration: concrete, in the loop, verifiable (15)
- **10/10**: the chain does something the game would be worse without (here: the season commitment that prevents the
  AI or the devs from bending the outcome), the player sees it at the right moment, the contract is deployed (testnet
  is eligible, Q-010) with an address the judge can open in an explorer, the README states exactly what is and is not
  on-chain, and the integration was built in the window.
- **5/10**: the mechanism is real but local (browser verification), the contract is tested but not deployed, and the
  README says so honestly.
- **0/10**: "powered by NEAR" with no contract, or claims of on-chain verification that the code does not perform.

### C4. Innovation and story (10)
- **10/10**: a mechanic judges have not seen (the price of memory, provable prophecy), a one-sentence pitch that
  survives the demo post, and a theme that the UI and art carry consistently. Distinct from the field (see the
  competitor snapshot in `docs/decisions.md` §1).
- **5/10**: a fresh theme over a familiar loop, or a fresh mechanic that the demo never reaches.

### C5. Technical depth and quality (10)
- **10/10**: engine, client, server and contract are each real and tested; tests cover rules and tampering; the
  architecture is explained in a page; the contract's test vectors come from the same engine; performance is within
  stated budgets; no dead code presented as features.
- **5/10**: depth in one layer, scaffolding in others.

### C6. Presentation: demo video, X post, README top (15)
- **10/10**: a 2 to 3 minute video that shows gameplay in the first 5 seconds, states the problem in 10 seconds, shows
  one complete user action with a visible result, shows the verification moment and the NEAR role concretely, has
  captions, no slide intro; the X post follows the page's four-part structure and the tags; the README top answers
  "what, why, how to try" above the fold.
- **5/10**: a screen recording with narration but no structure, or a post that says "powered by NEAR".
- **0/10**: no video for a browser game, or the post is missing.

### C7. Completeness, polish, UX and accessibility (10)
- **10/10**: no greybox or placeholder in the judge path, text readable at 1080p, colour-independent state cues,
  remappable or at least listed keys, reduced motion honoured, no time pressure that punishes a reader, mobile does
  not break, five languages do not leak keys, audio has volume controls.
- **5/10**: the judge path is clean but off-path scenes show placeholders; or accessibility is tests-only.

## 3. Red flags that sink a submission (gates, not deductions)

Each of these is checked before scoring. Any open flag is reported to the lead immediately.
1. Repository private, missing LICENSE, or `hackathon-submission` tag absent at the deadline (HACKATHON.md Q-003,
   Q-014).
2. A claim in the README, the post or the video that the code does not do (for example "verified on-chain" while the
   contract is undeployed; "NFT" while no NEP-171 exists). The screener is told to verify features (Q-017).
3. Commands in the README that fail on a clean clone, or test counts that do not match.
4. Secrets or personal data committed (the submission payload, keys).
5. Code or assets from before 19.10.2026 presented as hackathon work, or undisclosed templates and AI code (Q-001,
   Q-005).
6. Demo post without video for a game that judges may not be able to run (Q-012), or without the required tags.
7. A `website` value or a second submission for the same repo (breaks the submission itself).
8. A second project by the same person without mutual README links (Q-015).
9. The live site down during judging (16.11 to 18.11; keep it up to 25.11).

## 4. How the AI screener checks "it runs and the claims exist" (working model)

To be refined by `notes/ai-screening-and-reproducibility.md`. Working assumptions for cycle 1:
- It clones the repo at the submitted commit, reads the README, runs the exact commands, compares output to the
  stated "see" text, and greps the code for each headline claim (contract name, Merkle verification, tests).
- It cannot see WebGL. The browser path is therefore verified through the tests, the agent API path and the CI
  workflow, plus whatever the video shows. A no-browser path that exercises the whole loop is worth a lot here.
- It checks hygiene: LICENSE, tags, lockfiles, Node and Rust versions, CI status, secrets, and whether the demo URL
  responds.
- It writes a claims table (verified / partial / unverified) and a preliminary score; humans read that table first.

## 5. Judging procedure the juror follows (phase 2)

1. Re-read HACKATHON.md and note changes.
2. Clean clone of the integration branch; run every README command; record output verbatim.
3. Open the live site as a first-time player, no README: ten-minute session, timed notes (goal clear at?, first
   decision at?, signature mechanic reached at?).
4. Then follow the README judge table step by step and mark each row true or false.
5. Read the contract and its tests; check deployment state.
6. Watch the video draft with the C6 checklist; read the X post draft.
7. Score each criterion with evidence; list the top 5 changes ranked by points per hour; compute the delta since the
   previous scorecard; message the lead.
