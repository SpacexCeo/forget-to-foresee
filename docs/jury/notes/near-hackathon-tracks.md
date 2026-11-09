# NEAR Hackathon 2026: tracks, example prompts and what organizers reward

Read on 2026-11-08 (UTC). Juror notes feeding `docs/jury/rubric.md`.

Companion to `docs/jury/notes/near-hackathon-rules.md` (the live HACKATHON.md). This note covers the organizers'
own example prompts for the `games`, `nfts` and `open` tracks, the public project directory, and what the web says
about judging beyond HACKATHON.md.

## Summary for the rubric
- The organizers published **no numeric rubric and no weights**. Everything below is inference from (a) the track
  one-liners, (b) the example prompts in `nearai/near-hackathon-prompt-examples`, (c) the FAQ sentence that previous
  NEAR hackathons scored "technical implementation, design, impact, originality and sustainability", and (d) the AI
  screening description ("runs and does what the README says").
- For `games` the scoring object is the **game loop**: the example prompt demands a paper design of "what the player
  does every 30 seconds, every 5 minutes and every session" before any code. A rubric should score the loop at
  those three time scales, not the presence of a token or a chain.
- "Bonus if players never notice the chain" means **invisible infrastructure**: social/email login, "no seed phrases,
  no wallet popups, no gas prompts in the normal game loop". A project with no wallet UX at all is not penalised by
  this wording; a project that interrupts play with wallet popups is.
- The exemplary `games` project has **agent NPCs with their own wallets and inventories**, price rules "in one
  readable file", a **tooltip exposing each merchant's reasoning**, and a **fast-forward mode** so "judges can watch
  the economy move" in about a minute. Legibility of the economy to a judge is a first-class requirement.
- The exemplary `nfts` project is "ownership with behavior": an NEP-171 token bound to a **sub-account** that holds
  funds, with transfer-of-control semantics, a threat model, a gated holder page, a per-NFT history view and tests
  for the transfer path. An in-engine "simulated NFT" does not meet this bar; the rubric should score `nfts`
  claims strictly on a running NEP-171 contract and real transfer semantics.
- NEAR primitives are **hints ("Lean on"), not requirements**; HACKATHON.md Q-011 says an own contract that fits the
  track is enough and Q-010 says testnet-only is eligible. But a contract that is written and tested yet **not
  deployed** gives the screener nothing to reproduce on chain; the rubric should treat deployment status as a
  visible step on the "real/mock" axis.
- The AI screeners (Claude Code and Codex) check **reproducibility and feature verification** against the README and
  produce a preliminary score; humans decide, and a low AI score alone cannot reject. The rubric's "README truth"
  axis therefore matters twice: once for screening, once for human attention.
- The human jury is dominated by crypto investors (a16z crypto, Dragonfly, Electric Capital, Helius, Synthetix/Infinex,
  cyber•Fund) plus Illia Polosukhin. Expect "impact / sustainability / why NEAR" questions, not game-design depth.
- Competition size (public directory, 2026-11-08 15:00 UTC, 302 submissions): **25 in `games`, 21 in `nfts`, 49 in
  `open`**, versus 154 in `security` and 147 in `agents`. The games and nfts tracks are among the five smallest, so
  three prizes each are contested by roughly two dozen projects; most of those also claim two to five other tracks.

## Findings

### nearai/near-hackathon-prompt-examples, README
- Source: https://raw.githubusercontent.com/nearai/near-hackathon-prompt-examples/main/README.md (read 2026-11-08)
- Purpose: "copy-paste prompts" for the hackathon, one file per track; each prompt scopes a two-week build, lists
  docs to read first and contains a checkpoint where the coding agent pauses for review.
- Usage: run the setup prompt once (agent reads HACKATHON.md and installs NEAR agent skills), paste the track prompt,
  fill the bracketed placeholders; "swap in your own idea, but keep the requirements and checkpoint"; work through
  SUBMITTING.md before submitting.
- 13 tracks with ids: defi, thesis, privacy, business, swarms, security, agents, realworld, games, nfts, memecoins,
  social, open. Dates: start 2026-11-01, close 2026-11-14 23:59 UTC, judging 2026-11-16 to 18.
- Judging note: AI judges (Claude Code and Codex) are part of the jury, so READMEs must be readable by machines as
  well as people, with clear "do X, see Y" steps.
- `SETUP.md` at the raw URL returned HTTP 404 on 2026-11-08; the setup prompt could not be read.

### Track 09, Games With Real Economies (`games`)
- Source: https://raw.githubusercontent.com/nearai/near-hackathon-prompt-examples/main/tracks/09-games.md and the
  blob page https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/09-games.md (read 2026-11-08)
- Tagline: "The economy is the gameplay". Premise: NPCs with wallets, player-owned markets, economies that evolve
  without a dev patch.
- Judging sentence in the file: "Judges score the game loop, with a bonus if players never notice the chain." (The
  site's wording is "Judged on the game loop, not the token"; the file does not contain that exact phrase.)
- "Lean on: Agent NPCs, social login, NEAR Intents, NEP-245". Resources: NEP-245 spec
  (github.com/near/NEPs/blob/master/neps/nep-0245.md), the `near-dapp` agent skill
  (github.com/near/agent-skills/tree/main/skills/near-dapp), NEAR Intents intro (docs.near-intents.org).
- Example prompt: a market-town game. Players gather materials and trade with NPC merchants; each merchant is an
  agent with its own wallet and inventory that sets prices from stock and recent demand (flooding a good makes it
  cheaper); a broke merchant closes until someone invests in it.
- Requirements (bulleted in the file):
  - "Items are NEP-245 multi tokens, so one contract holds every item type."
  - "Players sign in with a social or email login. No seed phrases, no wallet popups, no gas prompts in the normal
    game loop."
  - "Merchant pricing rules live in one readable file. Show a merchant's reasoning in a tooltip."
  - "A fast-forward mode that simulates a week of trading in a minute, so judges can watch the economy move."
- Checkpoint: "Design the game loop on paper first: what the player does every 30 seconds, every 5 minutes and every
  session." followed by "Show me that before any code."
- Not in the file: NEP-171, sub-accounts, any scoring weights.

### Track 10, NFTs That Do Something (`nfts`)
- Source: https://raw.githubusercontent.com/nearai/near-hackathon-prompt-examples/main/tracks/10-nfts.md and the
  blob page https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/10-nfts.md (read 2026-11-08)
- Tagline: "What comes after the JPEG". Description: "Build NFTs as accounts: assets that own money, earn royalties,
  hold inventory, and carry credentials", memberships or access rights.
- "Lean on: Dynamic NFTs, NEP-171, sub-accounts". Resources: NEP-171 spec, NEAR access-key docs, the
  `near-smart-contracts` agent skill, Top Level Accounts contracts (github.com/houseofstake/tla-contracts) and its
  draft "sharded NFT items" spec. Note in the file: a rented TLA name is an NFT that is also a working NEAR account;
  no SDK yet, builders work against the live audited mainnet contracts.
- Example prompt: a membership NFT that owns its own wallet; each token maps to a sub-account holding a share of a
  club treasury and a cut of ticket sales; whoever holds the token controls the sub-account, so a sale transfers
  wallet, balance and access together.
- Requirements (bulleted):
  - "An NEP-171 contract plus the logic that ties each token to its sub-account."
  - README that explains "exactly how control passes on transfer and what stops the old owner from keeping access."
  - "A gated page that only current holders can open."
  - "A history view per NFT: what it earned, what it paid out, who held it."
  - "Tests for the transfer path, including a sale in the middle of a payout."
- Checkpoint: "Before coding, write down the threat model for the transfer: every way a seller could try to keep the
  money." then wait for approval.
- The file makes no statement about judging.

### Track 13, Open Innovation (`open`)
- Source: https://raw.githubusercontent.com/nearai/near-hackathon-prompt-examples/main/tracks/13-open.md (read
  2026-11-08)
- Tagline: "Something we haven't seen". For projects that fit no category: "new ways for money, intelligence, and
  ownership to work together"; can be entered alongside other tracks. Hints: experimental, chain abstraction, build
  your own. Resources: Chain Signatures guide, NEAR docs, HACKATHON.md.
- Example prompt: an inheritance account controlling BTC and ETH addresses through Chain Signatures; 90 missed
  check-ins let guardians release funds to heirs after a cancellable waiting period. Requirements: public readable
  release rules in a contract, owner cancellation, a testnet demo with shortened timers, a README section on failure
  cases. Checkpoint: argue against the idea in one paragraph first, then wait.
- No judging statements; the only named primitive is Chain Signatures.

### nearai/near-hackathon-prompt-examples, SUBMITTING.md
- Source: https://raw.githubusercontent.com/nearai/near-hackathon-prompt-examples/main/SUBMITTING.md (read 2026-11-08)
- One submission per team, not editable after sending; an agent that submits must show the full payload and wait.
- Checklist: public repo; README with step-by-step "do X, see Y" instructions an AI judge can follow; live demo post
  on X stating the project was built at NEAR HACKATHON with video or screenshots; mainnet payout account; "selected
  every track your project fits"; no keys or secrets in repository history.
- Evaluation: "AI judges will follow the README", so it must be clear enough to reproduce the project. No other
  criteria listed.

### nearhackathon.com main page (incl. FAQ "Frequent Queries")
- Source: https://nearhackathon.com/ (read 2026-11-08)
- Theme "Build what's next": programmable money, autonomous payments, intelligent agents. Prizes: $55K grand prize,
  per track $10K / $3K / $2K, 13 tracks, about $250K total, paid in NEAR.
- Track one-liners with judging wording: "Judged on the evidence, not the conviction" (thesis), "Judged on the game
  loop, not the token" (games), "Judged on the mechanic, not the chart" (memecoins). `nfts`: "Ownership with
  behavior."
- FAQ "How will projects be judged?": "Claude Code & Codex screen every project first: they check that it runs and
  does what the README says." "The human judges above make the decisions." Previous NEAR hackathons evaluated
  "technical implementation, design, impact, originality and sustainability", offered as a preparation guide, not
  confirmed as this event's criteria.
- Multi-track: select every fitting track; still one submission. Up to 2 independent projects per person if each
  README names the other.
- Jury listed: Illia Polosukhin (NEAR), Eddy Lazzarin (a16z crypto), Mert Mumtaz (Helius), Avichal Garg (Electric
  Capital), Kain Warwick (Synthetix, Infinex), Haseeb Qureshi (Dragonfly), Stepan Gershuni (cyber•Fund), plus
  "Claude Code & Codex (Anthropic & OpenAI)" for initial screening.
- Project directory ("Build Log / Project Directory"): "Explore the projects taking shape on NEAR. Open the code.
  See the demo." Rendered client-side; the static fetch showed only "Loading the build log..." and a dash for
  "SUBMITTED PROJECTS". Search by name and a TRACK filter (all 13 tracks) exist.
- https://nearhackathon.com/projects and https://nearhackathon.com/catalog returned HTTP 404 (2026-11-08). No
  separate /judging or /rules page exists; judging text lives in the FAQ and HACKATHON.md.
- https://nearhackathon.com/request-changes (read 2026-11-08): a form to correct a submitted entry (identified by
  email, wallet and repo link); organizers review by hand; "Your submission stays as it is until an organizer applies
  the changes."

### nearhackathon.com public project API (what the directory loads)
- Source: https://nearhackathon.com/api/projects?page=N (pages 1 to 38 read 2026-11-08, about 15:00 UTC)
- JSON with `projects` (8 per page), `total`, `page`, `pageSize`, `preview`. Each entry: `id`, `project_name`,
  `tracks` (array of ids), `demo_url` (X post). Repository links are not exposed here.
- **302 submissions** at read time, six days before the deadline. Track counts (a project counts once per track it
  claims): security 154, agents 147, realworld 61, defi 52, business 52, privacy 50, open 49, **games 25**, swarms 25,
  thesis 24, **nfts 21**, social 18, memecoins 16.
- Tracks per project: 98 projects claim one track, 89 two, 66 three, 49 four or more (two projects claim nine).
- 39 projects claim `games` or `nfts`; 7 claim both (e.g. "Afterlight", "DeepSea Hunter", "NEARlyHuman - AI NPC NFT",
  "SCOGÉ Universe", "VillageBill", "Bazaar Sovereign", "Meridian"). Single-track `games` entries include "Grind
  District", "Nearverse", "Pump Rider", "Q-day", "TokenGo", "TreasureHunt". Several games entries pair with
  `agents`/`swarms` ("Lantern Caravan", "Agent Undercover", "DiveMarket", "Overclock"), i.e. agent-NPC games are a
  visible cluster. Names only; no content was reviewed.

### Secondary web coverage (nothing beyond HACKATHON.md)
- https://econotimes.com/NEAR-Protocol-Adds-Claude-Code-and-Codex-to-Hackathon-Review-Panel-1762429 (2026-10-24,
  read 2026-11-08): short news item, "Claude Code and Codex will take part in judging projects"; no criteria.
- https://coinfomania.com/near-protocol-enhances-community-engagement-with-ai-judges/ (2026-10-23, read 2026-11-08):
  "AI models will share the judging panel"; no screening detail, no criteria.
- https://www.aiposthub.com/near-hackathon-ai-judges-2026/ (2026-10-20, Chinese, read 2026-11-08): cites HACKATHON.md;
  frames the core test as whether a judge can rerun the demo from the repo; recommends listing accounts, test data
  and costs before startup; notes the site "does not disclose model settings or every scoring detail".
- https://www.kucoin.com/news/community/NEAR/6ad6c3dd40361e00070b9258 (2026-10-20, read 2026-11-08): repost of an X
  thread; "NFTs that actually do something"; names judges "@ilblackdragon, @mert, @hosseeb"; nothing on criteria.
- https://github.com/MFrancis-dev/stack/issues/1 (2026-11-04) and https://github.com/JannetEkka/DSProjects/issues/85
  (2026-11-08), both read 2026-11-08: participants' own compliance checklists citing HACKATHON.md Q-ids; consistent
  with our reading (Q-010 testnet eligible, Q-011 no mandatory integration, Q-012 video for local-only demos, Q-017
  humans decide). One notes the panel "is mostly crypto investors". Third-party, not official.
- https://x.com/NEARProtocol/status/2112257967818997891 could not be read (HTTP 402 from the fetcher).
- Web searches on 2026-11-08 ("NEAR Hackathon 2026 judging criteria", "Claude Code Codex screening HACKATHON.md",
  "near.org blog announcement") found **no published rubric, weights or screening prompt** and no near.org post
  beyond the site itself. The only criteria language anywhere is the FAQ's list from previous hackathons.

## Implications for Forget to Foresee
- **Game loop first.** The project should be scored, and should present itself, at the three time scales the
  organizers name: what a player does every 30 seconds (a move, a trade, a reveal), every 5 minutes (a season turn,
  a clan negotiation) and every session (a whole season against the committed Merkle root). If the README and demo
  do not make those three loops obvious, the strongest part of the submission is invisible to the screener.
- **Agent NPCs are on-brief.** Six deterministic clan agents trading silk and memories map directly onto "each
  merchant is an agent with its own wallet and inventory" and "economies that evolve without a dev patch". The
  example prompt wants agent reasoning **exposed in a tooltip** and rules **in one readable file**; a juror should
  check whether the clans' heuristics are inspectable in play and where the rule file lives. Deterministic
  heuristics (not LLM) are a plus for reproducibility, and should be stated plainly, since "agent" in this hackathon
  often means LLM.
- **Fast-forward / judge mode is explicitly rewarded.** "A fast-forward mode ... so judges can watch the economy
  move" is a stated requirement in the organizers' own exemplar. The `?demo=judge` entry and the agent-playable HTTP
  API are the closest analogues; the rubric should give credit if a judge can run a whole season quickly and see the
  economy change, and withhold it if that takes manual play.
- **"Never notice the chain" cuts both ways.** The project has no wallet login, so no wallet popups interrupt play,
  which satisfies the letter of the bonus. But the bonus presumes a chain is present and hidden. With `season-commit`
  not deployed, the chain is absent rather than invisible; a juror should score the commit-reveal design (SHA-256
  Merkle root before play, browser-side proof verification) as the game's trust mechanic, and record deployment as
  the missing step that would turn "hidden chain" from a claim into a fact. HACKATHON.md Q-010/Q-011 make the
  undeployed contract eligible; the example prompts make deployment the expected level.
- **NEP-245 / social login / Intents are hints, not gates.** Their absence costs no eligibility, but the exemplar uses
  them to make the economy "real" (one contract holds every item). The rubric should score "real economy" on whether
  silk and memories have persistent, verifiable state, not on token standards per se, and note NEP-245 as the
  obvious next step.
- **The `nfts` claim is weak against the exemplar.** The track wants an NEP-171 contract, sub-account control that
  transfers with the token, a threat model, a gated holder page, a history view and transfer tests. Simulated
  in-engine NFTs meet none of these. Unless the `nfts` box is backed by at least a running NEP-171 contract, the
  rubric should expect a low `nfts` score; claiming it only adds a "does what the README says" check the screener
  will fail unless the README states the simulation clearly. `open` (49 entries) is a more honest second track for a
  commit-reveal game design, consistent with the fallback already noted in `docs/hackathon-rules.md`.
- **Competition.** 25 `games` and 21 `nfts` entries at 2026-11-08 (vs 154 in `security`). Three prizes per track
  means roughly the top 12 percent place; a focused, reproducible game with a legible agent economy is competitive,
  and several rivals already pair `games` with `agents`/`swarms` or `nfts`.
- **Screening hygiene.** The screeners verify "runs and does what the README says". Every claim in the README
  (contract tests, parity tests, API, Merkle verification) must have a "do X, see Y" step with expected output, and
  the real/mock table must say "not deployed" and "NFTs simulated" in those words.
- **Jury profile.** Investors plus the NEAR founder will ask "why does this need NEAR" and "what is the sustainable
  economy". The commit-reveal fairness story and the agent economy answer both if stated in one paragraph each.
