# Jury rubric for Forget to Foresee (NEAR Hackathon 2026)

Version 0.2, 2026-11-08 (research cycle 2). Owner: the juror agent (Task R, `docs/handoff/worker-tasks.md`).
This rubric is **inferred**: the hackathon publishes no numeric rubric (`notes/near-hackathon-rules.md`,
`notes/near-hackathon-tracks.md`). Every weight names the notes it rests on; `log.md` records each change.

How the scorecards use it: each criterion is scored 0 to 10 with evidence (a URL, a command and its output, a
screenshot, a file and line). The weighted total is out of 100. A red flag (section 3) is a gate, not a deduction:
an open flag is reported to the lead at once, and the score is marked provisional until it closes.

## 1. How this hackathon judges (the model)

1. **AI screening first** (Claude Code and Codex): reproducibility check, feature verification, structured report,
   preliminary score. Humans decide; a low AI score alone cannot reject (HACKATHON.md Q-017). The closest published
   pipeline walks the repo with read/grep/ls, checks the pitch claim by claim and emits a `claims_mismatches` list
   with file and line; scores fall for the gap between README and code, rarely for modest honest claims
   (`notes/ai-screening-and-reproducibility.md`). The screener very likely runs offline or sandboxed and cannot see
   WebGL, so tests, CLI paths, CI runs and the video carry the browser claims.
2. **Human jury per track.** The listed jurors are mostly crypto investors plus the NEAR founder, so expect "why does
   this need NEAR", "what is the sustainable economy" and "what did you build in the window", not game-design depth
   (`notes/near-hackathon-tracks.md`). Minutes per project, not hours: MLH plans 4, ETHGlobal finalists get 7; the first
   thirty seconds and the README's first two paragraphs carry most of the score (`notes/hackathon-judging-rubrics.md`).
3. **Track text.** `games`: "Judged on the game loop, not the token", bonus "if players never notice the chain". The
   organizers' own `games` exemplar wants the loop designed at three time scales (every 30 seconds, every 5 minutes,
   every session), agent NPCs with their own wallets and inventories, the agents' reasoning exposed in a tooltip, the
   price rules in one readable file, and a fast-forward mode so judges can watch the economy move in about a minute.
   `nfts`: "ownership with behavior", exemplar = a running NEP-171 contract bound to a sub-account with transfer tests.
4. **The field.** On 2026-11-08 the public directory listed 302 submissions: 25 in `games`, 21 in `nfts`, 49 in `open`,
   154 in `security`, 147 in `agents`. Three prizes per track; most rivals claim several tracks
   (`notes/near-hackathon-tracks.md`).
5. **What previous NEAR hackathons scored** (MetaBUILD III 2022, One Trillion Agents 2025, cited again by the 2026
   FAQ): technological implementation ("quality of NEAR integration"), design, ecosystem impact, originality,
   sustainability ("realistic long-term plan"). "Impact" and "sustainability" are therefore live questions for the
   human round even though the 2026 page does not list them.
6. **What past winners had in common** (`notes/past-near-hackathon-winners.md`): working software with one
   identifiable, live NEAR primitive (a deployed contract, wallet login and NFTs, Chain Signatures, NEAR AI); top
   overall prizes went to tooling and infrastructure; gaming winners were complete small loops with one chain hook and
   won in their track, not overall; judges asked for go-to-market and next steps; a NEAR Foundation judge named "a
   slick video over a thin repo" as a red flag and read the pitch for the problem behind the solution.

## 2. Criteria, weights and what a 10 looks like

| # | Criterion | Weight | Resting on |
|---|---|---|---|
| C1 | Runs and is verifiable: reproducibility and honesty | 25 | Q-017 and README guidance; `ai-screening-and-reproducibility`; `hackathon-judging-rubrics` (Google "working application, not a mockup", Microsoft "does it work" 25 %) |
| C2 | Game loop and fun in the first ten minutes | 20 | `games` track text and exemplar; `game-jam-and-festival-judging`; Imagine Cup Fun Factor 25 % |
| C3 | Technical depth and quality | 13 | ETHGlobal Technicality, Devpost "technical implementation"; `hackathon-judging-rubrics` |
| C4 | NEAR integration and track fit: concrete, in the loop, honest | 12 | Demo-post guidance, Q-010/Q-011; `near-hackathon-tracks`; `onchain-game-design`; `past-near-hackathon-winners` |
| C5 | Originality, story and impact | 12 | IGF/Nuovo innovation; Imagine Cup Innovation 20 %; previous NEAR criteria (originality, impact, sustainability) |
| C6 | Presentation: demo video, X post, README top | 10 | Q-012 and demo-post guidance; `demo-video-and-trailer`; judges' "first two paragraphs" |
| C7 | Polish, UX and accessibility | 8 | `accessibility`; `game-jam-and-festival-judging` |

Change from v0.1: C1 up 20 to 25 (two independent sources say raise "works and is verifiable" above the generic
15 to 20 because this hackathon screens reproducibility explicitly); presentation down 15 to 10 (the first reader is a
machine; the video still matters as the only browser evidence a sandboxed screener and a hurried judge will see);
NEAR integration 15 to 12 (Q-011: an own fitting contract is enough, hints are wishes); technical depth 10 to 13 and
originality 10 to 12 to match the consolidated table; polish 10 to 8.

### C1. Runs and is verifiable (25)
- **10/10**: a screener with Node 20+ and Rust reproduces every README command on a clean clone in under 30 minutes
  with the stated output (test counts, server banner, agent summary); every row of the judge table is true on the
  submitted commit; the real/mock table matches the code and uses grep-able words ("not deployed", "simulated");
  tags `pre-hackathon` and `hackathon-submission` exist and the compare link resolves; libraries and AI-generated code
  are listed; LICENSE present; no secrets; CI green on the submitted commit and linked from the README; a
  claim-by-claim table (claim, status, file or test) is already in the README so an incomplete exploration cannot mark
  a working feature unverified.
- **7/10**: all of the above except that a browser-only claim has no headless evidence (no screenshots, no video, no
  test naming the step).
- **5/10**: commands work but expected output drifts (test counts, labels), or one judge-table row is stale, or a
  claimed feature is reachable only with a dev flag.
- **0/10**: install fails, tests fail, or a headline claim ("verified on-chain", "NFT") does not exist in code.
- Checklist: the twenty screener checks in `notes/ai-screening-and-reproducibility.md` (tags, toolchain pinned,
  `npm ci`, three test suites with matching counts, agent API path, OpenAPI reachable, contract build, deployment
  claim vs chain, claims grep-able, real/mock consistent, CI green, live URL responds, headless evidence for the
  browser path, third-party disclosure, git history inside the window, no secrets needed, every README link resolves).

### C2. Game loop and fun in the first ten minutes (20)
- **10/10**: a first-time player states the goal within 30 seconds, makes a decision that visibly changes the outcome
  within 2 minutes, reaches the signature mechanic (forget a memory to foresee) by minute 5, reads cause and effect
  (stake, reveal, payout) without the README, never waits more than 30 seconds with nothing to decide, understands
  the first loss, and at minute 10 can say what happens next and wants to continue. The loop is visible at the three
  time scales the organizers name (30 seconds, 5 minutes, a session) and a judge can fast-forward a season and watch
  the economy move.
- **7/10**: all of that with one stall that a hint rescues, or one stretch of dead time (a long walk, an unskippable
  animation).
- **5/10**: the loop is complete but needs the README table or hotkey list; the first decision is a guess; payout
  feedback is text in a log; the signature mechanic is reached only by following instructions.
- **0/10**: the player cannot find the first action, or the season cannot be finished.
- Checklist: the fifteen-item ten-minute session in `notes/game-jam-and-festival-judging.md` (goal in 30 s, eye drawn
  to the first action, decision by 2:00, every action answered, signature mechanic by 5:00, short legible text, one
  mechanic at a time, first failure explained and cheap, no 30-second dead stretches, state and odds visible at each
  decision, hint after a 10-second stall, loads in a browser in under a minute without an account, hook at 10:00,
  one-sentence novelty, theme explains the rules). The juror plays silently first, then with the README.

### C3. Technical depth and quality (13)
- **10/10**: engine, client, server and contract are each real and tested; tests cover rules, parity and tampering;
  the architecture fits on a page; the contract's test vectors come from the same engine; performance is inside the
  stated budgets; agents are deterministic and their rules live in one readable place; no dead code is presented as a
  feature; the team can say what breaks first.
- **7/10**: depth everywhere but one layer is scaffolding (for example the server is exercised only by its tests).
- **5/10**: depth in one layer, the rest is a front-end wrapper.
- **0/10**: generated boilerplate with a thin game on top.

### C4. NEAR integration and track fit (12)
- **10/10**: the chain does something the game would be worse without (here: the season commitment that stops the
  AI or the devs from bending the outcome), the player meets it at the moment it matters, the contract is deployed
  (testnet is eligible, Q-010) with an address a judge can open, the README states exactly what is and is not
  on-chain, the integration was built in the window, the track claims are honest (no `nfts` without a running NEP-171
  path), and the "why NEAR" paragraph exists for the investor jury.
- **7/10**: deployed on testnet, but the game never shows the player the on-chain step, or the "why NEAR" answer is
  only in the docs.
- **5/10**: the mechanism is real but local (browser verification), the contract is tested but not deployed, and the
  README says so in plain words.
- **2/10**: a contract exists but no sentence connects it to play; or a second track is claimed on a simulation.
- **0/10**: "powered by NEAR" with no contract, or claims of on-chain verification the code does not perform.
- Calibration: no verified past NEAR winner shipped without a live primitive (`notes/past-near-hackathon-winners.md`),
  so an undeployed contract caps this criterion at 5 whatever the design quality; a testnet deployment of the existing
  contract is the cheapest move from 5 to 7 or more.
- Diagnostic questions (the 24-item checklist in `notes/onchain-game-design.md`; the ones that bite here):
  1. Name the mechanic that would be impossible without the chain; if the answer is "ownership" or "a database", a
     database would do.
  2. Who chose the seed, did they see player input before committing, and could they have generated many candidate
     seasons and committed the favourable one? A commitment proves the sequence was fixed, not that it was chosen
     fairly.
  3. Can a third party verify an outcome offline, later, with only the root, the reveals and a documented algorithm,
     without the game's own client? Is the "Verified" label produced by the same code that could lie?
  4. Are hashes shown in full, is the hashing recipe published, is there a way to check outside the UI?
  5. Is the token the game or is the game the game (would anyone play with the token at zero)? Do sinks exist for
     fun and progression rather than accumulation?
  6. Can the economy evolve without a dev patch, and is there a replay or log that shows it?
  7. For the agents: can the player read why an agent acted, and does memory have visible consequence?
  8. Does any claim name something not deployed or not running without the label "simulated" or "not deployed"?
- Calibration for this project's pitch: today the browser generates the season, commits the root and verifies the
  reveals with the same code, so the player trusts the client in all three roles. The literature calls a verification
  badge produced by code that could lie the theatre case. For C4 that caps "provable prophecy" at the 5 band until one
  of the named mitigations lands: entropy the developer does not control before the root is formed (a player
  commitment first, a public beacon, or a NEAR block hash after the player's commitment), the root registered on the
  deployed contract before trial 1, and an out-of-band verifier (copyable root, leaf, proof and recipe, or a one-file
  standalone check). Honest wording ("the client proves the season did not change after it began") keeps C1 intact
  even where C4 stays at 5.

### C5. Originality, story and impact (12)
- **10/10**: a mechanic judges have not seen (the price of memory; provable prophecy), a one-sentence identity that
  survives the demo post ("stake on alien signs, verify the reveal against a sealed root, pay with memory to see the
  future"), a theme that explains the rules and a mood recognisable by minute three, distinct from the field (the
  competitor snapshot in `docs/decisions.md` §1), and a credible answer to "who plays this after the hackathon and why
  does the economy sustain itself".
- **7/10**: novel mechanic and theme, no impact or sustainability answer (past NEAR juries asked for a go-to-market
  plan and next steps; the Protocol Rewards funnel rewards mainnet progress and users).
- **5/10**: a fresh theme over a familiar loop, or a fresh mechanic the demo never reaches.
- **0/10**: a clone with a token.

### C6. Presentation: demo video, X post, README top (10)
- **10/10**: a 2 to 3 minute video with gameplay in the first 5 seconds, the problem in 10 seconds, one complete
  user action with a visible result, the verification moment, NEAR's role in concrete words, captions, no slide
  intro, no sped-up footage; the X post follows the page's four parts (problem, action with result, NEAR's role, next
  step) and carries the tags; the README's first two paragraphs answer what, why and how to try.
- **5/10**: a screen recording with narration but no structure, or a post that says "powered by NEAR".
- **0/10**: no video for a browser game, or the post is missing.
- Checklist (`notes/demo-video-and-trailer.md`): gameplay on screen within 5 seconds, no logo card; the user problem in
  one sentence inside 15 seconds; one complete action (stake, trials pass, reveal) uncut in logic with the result held
  3 seconds or more; NEAR's role concrete and honest (tested, not deployed: say so); product shown running (browser,
  terminal, tests), no architecture slides, no "coming soon"; narration carries the explanation, no text-plus-music
  substitute, no TTS voice; burned-in captions; 2:00 to 2:20 for the X cut (free tier 140 s), never sped-up footage;
  1080p30 or better, HUD on; the post ends with a next step and carries "built at NEAR HACKATHON", @NEARProtocol and
  #NEARHackathon in the first post with the video attached.

### C7. Polish, UX and accessibility (8)
- **10/10**: no greybox or placeholder on the judge path; body text at least 18 px at 1080p; contrast 4.5:1 (text) and
  3:1 (large text, controls); colour-coded state also carries a word or icon; hotkeys remappable or at least
  disable-able; reduced motion honoured; no timed UI outside the turn; subtitles for the Guest's voice and separate
  volume sliders; 24 px touch targets; `lang` set per UI language; settings persist; an accessibility statement in
  the README and in-game.
- **7/10**: baseline present (contrast, colour-independent tells, reduced motion, volume sliders) but no remapping, no
  text-size option, no statement.
- **5/10**: the judge path is clean but off-path scenes show placeholders, or accessibility exists only as tests.
- Checklist: the fifteen items in `notes/accessibility.md`.

## 3. Red flags that sink a submission (gates, not deductions)

Checked before scoring; any open flag goes to the lead immediately. Sources: HACKATHON.md, `hackathon-judging-rubrics`.
1. Repository private, LICENSE missing, or tag `hackathon-submission` absent at the deadline (Q-003, Q-014); the
   compare link in the README is dead until the tag exists.
2. A claim in the README, post or video that the code does not do ("verified on-chain" while undeployed; "NFT"
   while no NEP-171 exists; a feature "coming soon" described as present). Screeners list claim mismatches by file
   and line.
3. README commands that fail on a clean clone, or test counts that do not match the output.
4. Secrets or personal data committed (the submission payload, keys).
5. Code or assets from before 19.10.2026 presented as hackathon work; one giant import commit; undisclosed
   templates or AI-generated code (Q-001, Q-005; ETHGlobal and MLH disqualify for this).
6. Demo post without video for a game judges may not be able to run (Q-012), or without the required tags.
7. Hard-coded results shown as live, or a "JPEG pretending to be an app".
8. A `website` value, or a second submission for the same repo (breaks the submission itself).
9. A second project by the same person without mutual README links (Q-015).
10. The live site down during judging (16.11 to 18.11; keep it up to 25.11).
11. Track mismatch: a track box ticked that the project cannot demonstrate (bounty spraying is a named red flag).

## 4. How the AI screener checks "it runs and the claims exist" (working model)

From `notes/ai-screening-and-reproducibility.md`:
- It clones the repo at the submitted commit, reads the README, runs the exact commands, compares output with the
  "see" text, and greps the code for each headline claim (contract name, Merkle verification, tests, events).
- It treats the project's self-assessment as untrusted and writes a claims table (verified / partial / unverified)
  plus a preliminary 0 to 10 per criterion; a human accepts or overrides.
- It is probably offline and headless: it cannot fetch 60 MB of models or open WebGL. The browser path is verified
  through tests that name the steps, the agent API path, CI runs, screenshots and the video.
- The dominant agent failure in large reproduction runs is a missing artefact, not a wrong one. Every referenced
  file, flag, route and URL must exist.
- Hygiene it checks: LICENSE, tags and compare link, lockfiles and pinned toolchain, CI status, secrets, whether the
  demo URL responds, git history inside the window.
- The single strongest predictor of a usable repo is a results table next to the exact commands that produce it.

## 5. Judging procedure the juror follows (phase 2)

1. Re-read HACKATHON.md and note changes; re-check the directory counts per track.
2. Clean clone of the integration branch; run every README command; record output verbatim; run the twenty checks.
3. Open the live site as a first-time player with no README: a silent ten-minute session with timed notes against
   the fifteen-item checklist.
4. Then follow the README judge table step by step and mark each row true or false on that commit.
5. Read the contract and its tests; check deployment state on the explorer.
6. Watch the video draft against the C6 checklist; read the X post draft against the four-part structure.
7. Apply the gates; score each criterion with evidence; list the top 5 changes ranked by points per hour; compute the
   delta since the previous scorecard; message the lead.
