# Juror log

One entry per cycle (30-minute wake-ups). Phase 1 (research) until 2026-11-09 15:00 UTC, then phase 2 (scorecards).

## Cycle 1: 2026-11-08 ~12:20 UTC
- Studied: `CLAUDE.md`, `docs/hackathon-rules.md`, `README.md`, `docs/decisions.md`, `docs/spec.md`, Task R; the live
  https://nearhackathon.com/HACKATHON.md (full read, matches the repo digest).
- Started seven research threads: track example prompts, past NEAR winners, hackathon rubrics, game-jam and festival
  judging, on-chain game design criticism, accessibility, demo video, AI screening and reproducibility.
- Wrote `notes/near-hackathon-rules.md` (primary source) and `rubric.md` v0.1 (seven criteria, provisional weights,
  nine red-flag gates, a working model of the AI screener).
- Rubric change: initial version.
- Result at 16:30 UTC (after a container restart): six notes written (`near-hackathon-rules`, `near-hackathon-tracks`,
  `hackathon-judging-rubrics`, `game-jam-and-festival-judging`, `accessibility`, `ai-screening-and-reproducibility`).
  Three threads did not finish: past NEAR winners, on-chain game design criticism, demo video and trailer. They are
  the weakest-covered topics and go first in the next cycle. The rubric is still v0.1; folding the six notes into
  weights and checklists is the other job of the next cycle. Paused on the lead's order (usage limit); the schedule
  resumes when the lead restarts it.

## Cycle 2: 2026-11-08 17:09 UTC (resumed on the lead's order)
- Restarted the three missing research threads (past NEAR winners, on-chain game design, demo video and trailer).
- Folded the six notes into `rubric.md` v0.2: weights C1 25 / C2 20 / C3 13 / C4 12 / C5 12 / C6 10 / C7 8
  (reproducibility up, presentation and NEAR integration down, reasons in the rubric); added the judging model
  (screener behaviour, jury profile, track exemplar at three time scales, field size: 25 `games`, 21 `nfts`, 49
  `open` of 302 on 2026-11-08), two more gates (hard-coded results, track mismatch), and pointers to the three
  checklists (20 screener checks, 15-item ten-minute play session, 15-item accessibility pass).
- 17:15 UTC: `notes/demo-video-and-trailer.md` done (32 sources); its ten-item checklist is now the C6 checklist.
  Findings for the scorecard, not red flags: the repo shot list (`docs/submission/video-shot-list.md`) opens with
  about 12 s of lobby title and tutorial setup, which the sources and HACKATHON.md ("skip setup") argue against; it
  records from `?demo=judge` while the README's verified table uses `?demo=judge&mode=walk`, and says "Continue as
  guest" where the README says "Play as guest"; its editor notes allow speed ramps (ETHGlobal forbids sped-up
  footage) and a 60 to 90 s cut (below the 2-minute floor hackathon judges expect; the X free tier caps at 140 s).
- 17:16 UTC: `notes/past-near-hackathon-winners.md` done (23 sources; REDACTED 2024, MetaBUILD III, NEARCON 2022
  and Encode winner lists were not retrievable and are marked unverified). Rubric: section 1 gains the five
  recurring NEAR criteria with their source and the winners' common traits; C4 gets a calibration note (an undeployed
  contract caps C4 at 5); C5 names the go-to-market question.
- 17:17 UTC: `notes/onchain-game-design.md` done (29 first-hand sources, blocked pages marked). Rubric C4 gains the
  eight diagnostic questions that bite here and a calibration: generator, committer and verifier are the same browser
  code today, which the literature calls the theatre case; named mitigations (uncontrolled entropy before the root,
  root registered on the deployed contract before trial 1, out-of-band verifier). Reported to the lead as an early
  pitch risk, not a gate. All nine planned notes now exist; the rubric is v0.2 with every checklist filled.

## Cycle 3: 2026-11-08 17:45 UTC
- Weakest coverage chosen: the competitor field in `games` and `nfts` (public directory), judging an agent economy
  (legibility, memory and consequence, "evolves without a dev patch"), and the investor jury (what they publish, the
  questions to expect, the 2000-character `idea` field). Routine re-check of the live HACKATHON.md for changes.
- 17:50 UTC: live HACKATHON.md re-read, no differences against the 12:30 reading (logged in `notes/near-hackathon-rules.md`).
- 18:00 UTC: `notes/agent-economy-legibility.md` done (33 sources: Orkin, Isla, Nemesis, Caves of Qud, Hocking,
  Crawford, Lehdonvirta and Castronova, EVE monthly economic reports, Schelling and Sugarscape conventions,
  Generative Agents and Project Sid critiques, the organizers' games exemplar read directly). Rubric C2 gains the
  economy half: the twelve-question legibility test with caps (under six yes answers caps C2 at 5) and the
  two-minute evidence artefacts.
- 18:10 UTC: `notes/investor-jury-and-pitch.md` done (25 sources; the seven jurors confirmed on nearhackathon.com;
  some 2026 juror statements come from secondary reports and are marked). Rubric section 1 now names the jury and the
  ten predicted questions; C5 gains the neighbour calibration (Clan World: Ælder) and the `idea` field checklist.
  Note for the submission worker: the form labels the 20 to 2000 character field "What did you build?"; the API key
  is `idea`.
- 18:20 UTC: `notes/competitor-field.md` done (directory read through its JSON endpoint at 17:47 UTC: 311 entries,
  27 `games`, 21 `nfts`; 18 of 27 and 11 of 21 traced to repos; eight repos spot-checked; X-only demo links were not
  readable). Rubric v0.3: section 1 carries the field snapshot (at least 15 traceable `games` rivals deployed on
  testnet; six-plus "agents with NEAR accounts trading" entries; nobody pre-commits a season to a Merkle root; no
  memory-shard mechanic elsewhere) and C4's calibration now reads "below the field's median while undeployed".
  Cycle 3 closed: four notes added (twelve in total), rubric v0.2 to v0.3.

## Cycle 4: 2026-11-08 22:03 UTC
- Weakest coverage chosen: C3 (technical depth), the only criterion without a note or checklist.
- 22:10 UTC: `notes/technical-depth.md` done (11 sources, snippets read; one unverified claim marked). Rubric v0.4:
  C3 gains a ten-item checklist (architecture page, green tests, parity hashes, tamper test, contract integration
  tests, NEAR security checklist items, shared test vectors, agent rules in one module, no mock as feature, a
  performance figure) and a cap of 6 when the first three are not findable within five minutes. No red flags.

## Cycle 5: 2026-11-08 22:16 UTC
- Weakest coverage chosen: the live site's cold load and behaviour on phones (no note covered it; judges often open
  X links on a phone).
- 22:25 UTC: `notes/live-site-load-and-devices.md` done (8 sources, snippets read; evidence on judge abandonment is
  anecdotal only, poor-band Core Web Vitals values from one secondary source). Rubric v0.5: C1 gains the live-site
  checks and treats a blank screen over 10 s as drift; C7 gains three one-point deductions (slow load without
  progress, silent mobile failure, main-action feedback over 200 ms). No red flags.

## Cycle 6: 2026-11-08 22:46 UTC
- Weakest coverage chosen: how a judge actually checks the NEAR claim and meets the wallet (C4 had calibrations but
  no "what to open" procedure).
- 22:55 UTC: `notes/wallet-onboarding-and-chain-proof.md` done (9 sources, snippets read; drop-off percentages are
  vendor-only and flagged; no NEAR-specific guest-flow source found). Rubric v0.6: C4 gains the two-minute proof
  check (guest first, NearBlocks testnet link, commit transaction root equals in-game root, no-wallet view call,
  verified source or build hash); without link, transaction and view call C4 stays at most 5. No red flags.

## Cycle 7: 2026-11-08 23:16 UTC
- Weakest coverage chosen: the impact and sustainability half of C5 (the 7/10 band names it, no source or checklist
  backed it).
- 23:25 UTC: `notes/impact-and-sustainability.md` done (8 sources, snippets read; the under-5% follow-through figure
  and a retention-collapse figure are single-source and not used; NEAR grant area from a secondary guide, portal not
  read). Rubric v0.7: C5 gains the five-item impact checklist that decides 7 versus 8 to 10, and the note that "no
  token" helps only if the pitch says it. No red flags.

## Cycle 8: 2026-11-08 23:46 UTC
- Routine re-check of the live HACKATHON.md: no differences (22,183 characters, same dates); sha256 recorded in
  `notes/near-hackathon-rules.md` for byte-level diffs from now on.
- Weakest coverage chosen: how much time a juror gives one project (every checklist assumed a long look).
- 23:55 UTC: `notes/judge-time-budget.md` done (4 sources; organizers plan 3 to 5 minutes per project; no measured
  figure for asynchronous online judging). Rubric v0.8: section 5 gains step 0, a five-minute first pass (X post,
  README top, live link, no clone) scored beside the full score; a gap over 15 points is a presentation risk. No red
  flags.

## Cycle 9: 2026-11-09 00:16 UTC
- Weakest coverage chosen: the README's first screen (C6 named it in one clause, no checklist).
- 00:25 UTC: `notes/readme-top.md` done (5 sources, organizer and vendor guides only). Rubric v0.9: C6 gains a
  five-item README first-screen checklist (half a point per missing item). Added `scorecard-template.md` so phase 2
  passes start from a fixed shape (gates, five-minute first pass, weighted table, top 5 by points per hour, delta).
  No red flags.
