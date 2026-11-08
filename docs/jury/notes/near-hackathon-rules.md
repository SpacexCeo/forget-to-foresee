# NEAR Hackathon 2026: the live rules as a judging source

Read on 2026-11-08 (UTC), about 12:30 UTC. Juror notes feeding `docs/jury/rubric.md`. Primary source.

- Source: https://nearhackathon.com/HACKATHON.md (read 2026-11-08; HTTP 200, text/markdown, about 22 k characters,
  read in full). The page says to re-read it before submitting because dates and rules may change; the juror re-reads
  it every cycle and records differences here.
- The repository's own digest `docs/hackathon-rules.md` (compared 08.11) matches this reading on dates, fields and
  limits. No contradiction found.
- Re-read log (differences against the 12:30 UTC reading): 2026-11-08 17:50 UTC, no differences, 22,183 characters,
  no new judging section (headings: Start here, Facts, What the human decides, Never without the human's explicit
  confirmation, Rules, Procedure, Submission API, Tracks, Prizes, Ecosystem, Community).
  2026-11-08 23:48 UTC, no differences in length (22,183 characters, 22,199 bytes, sha256 903794f4…d381d9aed for
  future byte-level diffs); dates unchanged (development ends 2026-11-14T23:59:00Z, judging starts 2026-11-16T00:00:00Z).

## Summary for the rubric
- The only judging text on the page is the track descriptions plus Q-017. There is **no published numeric rubric and no
  weights**. A rubric for this hackathon must be inferred from (a) what the page says it screens for, (b) the track
  one-liners, and (c) general hackathon judging practice (see the other notes).
- Two layers of judging: an **AI screening** by Claude Code and Codex (reproducibility check, feature verification,
  structured report, preliminary score), then **humans decide**. A low AI score alone cannot reject (Q-017). So the
  preliminary score is an input to the human jury, and a strong one buys attention; a weak one costs it.
- The README is explicitly a judging object: it must work "for a machine reader as well as a human", say what the
  product is, the problem, and give "do X - see Y" steps. "No marketing." Any claim a screener cannot reproduce is a
  liability, not an asset.
- The demo post (X) must lead with the user problem, show one complete user action with a visible result, explain
  NEAR's role concretely (a vague "powered by NEAR" is discouraged) and give a next step. A video is required when the
  demo is local-only; screenshots alone are not enough (Q-012). A hosted demo is "a plus".
- The `games` track is "judged on the game loop, not the token", with a bonus "if players never notice the chain".
  Hints (wishes, not requirements): agent NPCs, social login, NEAR Intents, NEP-245.
- The `nfts` track is "ownership with behavior": NFTs as accounts that own money, earn royalties, hold inventory, carry
  credentials or access rights. Hints: dynamic NFTs, NEP-171, sub-accounts.
- Eligibility hygiene the screener will check: public repo + LICENSE, code inside the window (from the 19.10.2026
  announcement), baseline separated by tags `pre-hackathon` / `hackathon-submission` with a README section linking
  the diff (Q-003), libraries / templates / AI-generated code listed (Q-005), up to 2 projects per person each naming
  the other (Q-015). Testnet-only is eligible in every track (Q-010); no integration is mandatory and an own contract
  that fits the track is enough (Q-011).
- Prize structure: $250,000; one grand prize ($55,000) and 1st/2nd/3rd ($10,000 / $3,000 / $2,000) per track, 13
  tracks. So a project competes inside its track first; the grand prize is cross-track.

## Findings (condensed from the page)
### Dates (UTC)
- Start 2026-11-01 00:00; development ends and submission deadline 2026-11-14 23:59; repo public by then. Judging starts
  2026-11-16 00:00; results by 2026-11-18 23:59. Hosted demo should stay up to 18.11, ideally 25.11 (Q-012). Payout within
  30 days, no vesting (Q-016).

### Judging procedure
- Section 1 and Q-017: Claude Code and Codex screen every project before the human jury: reproducibility check, feature
  verification, structured report, preliminary score. Humans decide. "A low AI score alone cannot reject."
- No rubric, no weights, no named jurors on the page.

### README and demo-post guidance
- README: what the product is, the problem, how to try it as "do X - see Y" steps; written for a machine reader as well
  as a human; no marketing.
- Demo post: lead with the user problem; one complete user action with a visible result; NEAR's role stated concretely;
  a next step. Must say built at NEAR HACKATHON, tag @NEARProtocol and #NEARHackathon; video or screenshots (video when the
  demo is local-only). Posted by the human, never by the agent.

### Tracks relevant to this project
- `games` Games With Real Economies: NPCs with wallets, player-owned markets, economies that evolve without a dev patch.
  "Judged on the game loop, not the token"; bonus "if players never notice the chain". Hints: AGENT NPCS, SOCIAL LOGIN,
  NEAR INTENTS, NEP-245.
- `nfts` NFTs That Do Something: NFTs as accounts that own money, earn royalties, hold inventory, carry credentials,
  memberships or access rights. "Ownership with behavior." Hints: DYNAMIC NFTS, NEP-171, SUB-ACCOUNTS.
- `open` Open Innovation: ideas that fit no other category. Hints: EXPERIMENTAL, CHAIN ABSTRACTION, BUILD YOUR OWN.
- Example prompts per track: github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/ (01 to 13); see
  `near-hackathon-tracks.md`.

### Submission mechanics (for the red-flag list)
- One submission per repository; `website` field is a spam trap; changes only via the request-changes page; 409 on a
  reused repo or email. The juror never submits; this matters only as a "do not break eligibility" red flag.

## Implications for Forget to Foresee
- The README judge table ("do X, see Y") and the real/mock table are exactly the shape the page asks for. Their value
  depends on every row being true on the submitted commit: the screener will try them.
- "Judged on the game loop, not the token" favours this project (no token, closed silk economy, the economy is the loop)
  **if the loop is reachable and legible in minutes**. "Bonus if players never notice the chain" cuts both ways: the
  game's selling point is that the player *does* notice verification ("Verified ✓"). The rubric should reward
  verification that is integrated into play (the seal matters to the decision) over verification as a badge.
- The track hints (agent NPCs: yes, deterministic; social login: no; NEAR Intents: no; NEP-245: no) are wishes. The
  only NEAR artefact is an undeployed contract. Q-011 makes it eligible, but "concrete NEAR role" is a stated judging
  theme on the demo post and will be weighed by humans; an undeployed contract is the weakest form of "concrete".
- `nfts` as a tentative track: the page's definition is NFTs that *do* something on-chain. A simulated shard with no
  NEP-171 contract is a concept, not a deliverable; listing the track invites a low score in that track's ranking. This
  is a scoring note, not a decision (the owner decides).
- Eligibility items still open at the time of reading (from `docs/hackathon-rules.md`): tag `hackathon-submission`,
  the X post with video, the submission itself. Missing any of these at the deadline is a red flag that sinks the
  submission regardless of quality.
