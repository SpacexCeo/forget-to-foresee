# Hackathon judging rubrics and what judges reward

Read on 2026-11-08 (UTC). Juror notes feeding `docs/jury/rubric.md`.

Method note: every URL below was fetched on 2026-11-08 unless marked "search snippet only" (page not
readable today: 403/404/redirect loop). Quotes are under 125 characters. "Inference" marks the juror's
own reading, not the source's words.

## Summary for the rubric
- No major platform publishes weights. Devpost scores each criterion 1-5; ETHGlobal and Devfolio use five
  unweighted categories (Technicality, Originality, Practicality, Usability, WOW); MLH uses stack ranking,
  not scores. Weights exist only in single-event rubrics and in judges' blogs.
- Where weights are published, "does it work / technical" and "idea / innovation" each take 20-40%, impact
  20-25%, presentation 10-20%, design 15-20%. Game-specific rubrics (Imagine Cup) put Fun Factor and
  Production Quality at 25% each and Innovation at 20%.
- Judges who write about their scoring say the rubric columns compress to mid-range and the real
  separator is whether the demo ran live, a one-sentence identity, scope that fits the time, and an
  honest answer to "what did you build during the event / what breaks first".
- Time per project is tiny: MLH plans 4 minutes per table (2 demo, 1 Q&A, 1 travel); ETHGlobal finalists
  get 7 minutes (4 demo, 3 Q&A); an MLH coach says about five minutes per Devpost project. The first
  thirty seconds and the README's first two paragraphs carry most of the score.
- Demo over slides is universal: ETHGlobal/Devfolio cap slides at 4 bullets, require 2-4 minute videos
  with no speed-up; Google scores "an actual working application (not a mockup)" as its own criterion.
- Honesty is scored explicitly in newer processes: NEAR's AI screening does "feature verification"; Devfolio's
  AI judge produces a `claims_mismatches` list; judges reward naming a known weakness.
- Red flags with real consequences: work before the event, one giant commit or no history, private repo,
  hard-coded output presented as live, claiming a technology not used, same project at another hackathon,
  track mismatch, "coming soon" features in the pitch.
- For a web3 game track the sponsor logic applies: NEAR says "Judged on the game loop, not the token" and
  gives a bonus "if players never notice the chain", yet partner-style judges still ask exactly how the
  chain was used. Both must be visible in one demo path.
- Proposed consolidated weights (inference, derived below): Runs and is verifiable 25, Game loop 20,
  Technical implementation 20, Originality 15, NEAR integration and track fit 10, Presentation 10.

## Findings
### Devpost help center and organizer FAQ
- Source: https://help.devpost.com/article/131-setting-up-judging (read 2026-11-08)
- Source: https://help.devpost.com/article/101-offline-judging-using-printed-score-sheets (read 2026-11-08)
- Source: https://info.devpost.com/faqs-organizers (read 2026-11-08)
- Online judging: "The criteria you set for online judging will be what's used to rate each project (on a 1-5 scale)".
- Offline sheets: "we recommend that each criterion be rated on a scale of 1-5".
- Criteria are organizer-set, "typically covering creativity, technical implementation, and potential impact".
- Judge comments can be enabled and exported; judging starts only after every submission is marked Judge / Don't Judge.
- The commonly cited Devpost default set (Technological Implementation, Design, Potential Impact, Quality of
  the Idea) could not be read from an official Devpost page today; two of the names appear in a search snippet
  of the earlier NEAR MetaBUILD listing (https://www.herox.com/NEARMetaBUILD, search snippet only). Treat
  the four-name list as unverified for this cycle.

### Okta hackathon on Devpost (example of Devpost-style criteria)
- Source: https://devforum.okta.com/t/what-are-the-judging-criteria-for-the-hackathon/15842 (read 2026-11-08)
- Stage one pass/fail: fits the theme and "reasonably applies the required APIs/SDKs".
- Stage two, "equally weighted criteria": Creativity and Originality of the Idea; Implementation of the Idea
  ("how many features of Okta were leveraged beyond user registration and login"); Potential Impact.

### ETHGlobal event details (Unite, ETHOnline 2023)
- Source: https://ethglobal.com/events/unite/info/details (read 2026-11-08)
- Source: https://ethglobal.com/events/ethonline2023/info/details (read 2026-11-08)
- Two rounds: async screening, then live. "Typically, only the top 20% of projects advance to the live judging session."
- Live format: "Each team has 7 minutes to present": 4 minutes demo, 3 minutes Q&A. Finalists must demo live.
- Five categories, no weights: Technicality, Originality, Practicality, Usability (UI/UX/DX), WOW Factor
  ("Does your project leave a lasting impression?").
- Partner prizes: up to 3 per project, judged asynchronously by the partner; you must explain how you used
  their tools. "It is the only way for partners to assess your project".
- Video 2-4 minutes, 720p+, no speed-up, no AI voiceover, backstory under 20 seconds, max 4 bullets per slide.
- Fresh-start rule: "all work on your project must begin after the hackathon officially starts."
- "Projects built before the event may still participate but won't qualify for partner prizes or the Finalist category."
- "Submissions with large single commits or missing histories may be disqualified."
- "Clearly distinguish between what's new and what's reused." AI use allowed if documented.

### Devfolio participant guide
- Source: https://guide.devfolio.co/docs/guide/participating-in-hackathons/judging-1 (read 2026-11-08)
- Same five criteria as ETHGlobal (Technicality, Originality, Practicality, Usability, Wow factor).
- Demo: show the product, not slides; avoid dead time "such as waiting on wallet prompts"; 2-4 minute video,
  "Speeding up your video might make it hard to understand."
- Modified pre-existing projects are not allowed; version control required throughout.

### Devfolio: AI judge design ("The Discerning Machine")
- Source: https://devfolio.co/blog/the-discerning-machine/ (read 2026-11-08)
- The agent reads the submission, walks the repo with read/grep/ls, and checks claims against code; output
  centres on a `claims_mismatches` section with `file:line` citations.
- "The aggregate score is computed deterministically in code"; humans keep the decision and can override.
- Red flags: READMEs describing components the repo lacks, a demo path that does not match the repo, a
  "custom" model that is a stock pretrained model, copied work, generated filler, trivial code dressed up.
- Relevant because NEAR 2026 uses the same shape of AI pre-screening (Q-017).

### MLH organizer guide (judging plan, judges, rules, cheating check)
- Source: https://guide.mlh.com/general-information/judging-and-submissions/judging-plan (read 2026-11-08)
- Source: https://guide.mlh.com/general-information/judging-and-submissions/judges-communication-and-recruiting (read 2026-11-08)
- Source: https://guide.mlh.com/general-information/judging-and-submissions/rules-for-your-hackathon (read 2026-11-08)
- Source: https://guide.mlh.com/general-information/judging-and-submissions/cheating-check (read 2026-11-08)
- Format: science-fair / expo; 4 minutes per project (2 demo, 1 questions and scoring, 1 travel); each project
  seen by 3 judges; no numeric scale, each judge picks a top 3 worth 3/2/1 points (stack ranking).
- Judges should have "a strong technical aptitude" and "not to focus on the business aspect of the hackathon."
- Rules: "You may not work on your project before the event. You must stop development when submissions are due";
  public frameworks allowed "but you need to list said frameworks in a readme"; code submitted "as a publicly available link".
- Cheating check on winners (none is automatic DQ): started before the event? "Is it one big commit at the
  beginning of the event?" pushes after close? README mentions another event? "Is a solo hacker making a really
  advanced project in a single weekend?" timestamps in the video outside the weekend? same project at other hackathons?

### lablab.ai rule book and submission guidelines
- Source: https://lablab.build/hackathon-rules (read 2026-11-08)
- Source: https://lablab.build/delivering-your-hackathon-solution (read 2026-11-08)
- Four criteria, each typically 1-5: Presentation, Business Value, Application of Technology, Originality
  (Originality scores 1 for "an exact copy of existing solutions without any novel approaches").
- Public GitHub repo "Required by default"; if judges cannot open it, "they can't fully review your work, which may lower your score."
- Video "under 5 minutes": problem, slides, then the project working. Application URL "Required for interactive evaluation."
- "Non-compliance may result in lower scores or disqualification." Plagiarism: "immediate disqualification".

### Microsoft Imagine Cup, Game Design rubric (2012) and current FAQ
- Source: https://learn.microsoft.com/en-us/archive/blogs/andrewparsons/game-design-scoring-rubric-2012 (read 2026-11-08)
- Source: https://imaginecup.microsoft.com/support/faq (read 2026-11-08)
- Game rubric, 100 points: Innovation 20, Theme 15, Fun Factor 25, Production Quality 25, Presentation 15;
  twenty 5-point sub-criteria. Rationale: "we want to see great quality games that are fun to play!"
- Fun Factor sub-items: player feedback, longevity ("Does the player want to keep playing?"), level design,
  excitement, storyline. Production Quality: audio, menus/pause, graphics, collision/tutorial, performance.
- Presentation: "Is the How to Play document clear and easy to understand?", screenshots, "Does the Game Video showcase gameplay?"
- 2027 Imagine Cup (startup format): application review on business profile, "product and technical approach",
  problem/market, team; expert review on "technical excellence, and customer value"; interviews "are not scored".

### Microsoft multi-school hackathon rubric (2014)
- Source: https://learn.microsoft.com/en-us/archive/blogs/mschray/multi-school-hackathon-judging-rubric (read 2026-11-08)
- Four equal criteria at 40 points: Problem Definition; Solution Design & Innovation; Idea Viability; Does it work.
- "Does it work" scale: "1: not functional, 20: fair functional, 30: very functional, 40 exceptionally functional".

### Google Solution Challenge (2024 participant guide)
- Source: https://www.slideshare.net/slideshow/2024-solution-challenge-participant-guidepptx/265566208 (read 2026-11-08)
- Source: https://developers.google.com/community/gdsc-solution-challenge/faq (search snippet only; URL now
  redirects to a generic community page) stating a 1-50 scale across Impact and Technology.
- Impact 25 (5 each): clear problem statement; SDG choice and why; user feedback, testing and iteration;
  solution addresses the problem with metrics or cause and effect; evidence of next steps.
- Technology 25 (5 each): architecture and components; all technical components implemented; code testing
  and iteration incl. "Did the team include guidance on running their code?"; "Does the video demonstration
  show an actual working application (not a mockup)"; scalability with minor changes.

### PennApps and HackMIT
- PennApps criteria (search snippet only, 2022 event site): "creativity, technical difficulty, polish, and usefulness".
  The 2012 rules said judges would not judge code quality or style. Current site has no criteria (read 2026-11-08,
  https://pennapps.com/).
- HackMIT: no published rubric found; honor code and 2014 disqualifications below.

### JetBrains AI blog, "How to win a hackathon: notes from the judging table" (June 2026)
- Source: https://blog.jetbrains.com/ai/2026/06/how-to-win-a-hackathon-notes-from-the-judging-table/ (read 2026-11-08)
- Rubric columns (difficulty, originality, design, impact, sponsor API) compress; live software beat slide-only
  projects "almost every time".
- Questions asked: who is this for; "What part did you build during the event?"; what breaks first at scale.
  Naming a known weakness raised scores.
- Red flags: unclear split of new vs existing work; claiming nothing breaks; overbuilt scope; elaborate UI that
  raises doubt about the backend; slide decks that "fill time".
- Advice: one end-to-end path by the halfway mark; rehearse the first thirty seconds, "That is where the score
  is set."; keep a 60-second screen capture because "Wifi fails at most events I judged."

### dev.to, "What judges actually score: notes from a year of hackathon judging"
- Source: https://dev.to/kurbaitaev/what-judges-actually-score-notes-from-a-year-of-hackathon-judging-3p4l
  (read 2026-11-08 via the dev.to API; HTML returned 403)
- "a live demo removes doubt" is called the largest score differentiator; narrow scope built well reads as judgment.
- Judges need a one-line identity to recall the project when the panel reconvenes.
- Red flags: blurring what was built during the event (read as hiding), claiming nothing breaks, slide-heavy decks.

### Matt Harrington (Microsoft), "Tips for winning hackathons" (organizer of many hackathons)
- Source: https://learn.microsoft.com/en-us/archive/blogs/matt-harrington/tips-for-winning-hackathons (read 2026-11-08)
- "Devote attention to all judging criteria, not just one criterion in particular."
- "Don't begin with a long PowerPoint presentation. Dive right in and show your app."
- "Make sure judges can summarize your app in one sentence."
- Category prizes: "make sure you explicitly state how you use their API."
- "Don't make JPEGs and pretend it's a real app." "Don't lie and say you used a particular technology when you didn't."
- "Be prepared to answer any questions about the technologies you used."

### John Kim, "How To Win Hackathons" (self-reported 7-8 wins incl. TechCrunch Disrupt)
- Source: https://getpushtoprod.substack.com/p/how-to-win-hackathons (read 2026-11-08)
- "The team with the best code almost never wins. The team with the best demo does."
- One polished happy path; everything else "can be mocked, static, held together with duct tape", but
  "the one wow moment has to be real." Pre-recorded video as fallback. "The sponsors are the judges."

### Jacklyn Biggin (MLH coach, ~20 online hackathons judged), Devpost submissions
- Source: https://dev.to/jacklynbiggin/how-to-make-your-devpost-submissions-not-suck-37i0 (read 2026-11-08)
- Judges have "around five minutes to judge each project"; missing key info means they move on.
- Lead with sponsor tools used and why; tailor the write-up to the published criteria; keep Devpost headings.

### DoraHacks, "What does a good hackathon submission look like"
- Source: https://dev.to/dorahacks/what-does-a-good-hackathon-submission-look-like-5398 (read 2026-11-08)
- "If a judge only reads your first two paragraphs, they should already understand what makes your project worth attention."
- "Substance beats buzzwords every time." Checklist: repo public, demo loads, video viewable, "test every link".

### Chainlink, "Blockchain hackathon tips"
- Source: https://chain.link/blog/blockchain-hackathon-tips (read 2026-11-08)
- README is "the first thing judges and other developers will see"; include overview, video link, live demo,
  architecture, build/run steps. Video 3-5 minutes: "It proves that the project is real, and that it works."
- Live demo lets judges "browse through the user interface"; clean repo, secrets in env vars; submit even if incomplete.

### BlockEden, "Web3 hackathons done right" (2025)
- Source: https://blockeden.xyz/blog/2025/07/07/web3-hackathons-done-right/ (read 2026-11-08)
- Technicality asks "Is the problem non-trivial?" beyond "a simple front-end wrapper on one contract".
- Rewards: one complete working user journey; "a demo that narrates scope honestly".
- Red flags: breaking start-fresh rules; multi-chain before one chain works; track mismatch ("a complex DeFi
  protocol pitched on a gaming track"); chasing too many bounties; "You can't win a prize you didn't register for."

### AgentRel community "Web3 Hackathon Winning Guide" (pattern analysis of 226 projects, unofficial)
- Source: https://agentrel.vercel.app/skills/hackathon/how-to-win (read 2026-11-08)
- Claimed pattern weights: technical innovation 30, working demo 25, impact 20, code quality 15, presentation 10.
- "Judges do not fund roadmaps. Only demo what works." "Sponsor booth judges care about their SDK; main track judges care about users."

### Other published single-event weightings (secondary, for the range)
- Global Travel Hackathon: "Technical aspects 40%, Design 20%, Idea 30 %, Wow factor 10%"
  (https://github.com/Global-Travel-Hackathon/Evaluation-Criteria, read 2026-11-08).
- Builderbase guide example: Innovation 25, Technical 25, Impact 20, Presentation 15, Design 15; "Scope
  discipline impresses more than scope ambition." (https://intercom.help/builderbase/en/articles/14836129-builder-s-guide-ch-15-how-judging-works, read 2026-11-08)
- Reskilll 2026 breakdown: Innovation 20-25, Technical 20-25, Impact 20-25, Demo 15-20, Completeness 10-15;
  "Judges don't score your code."; red flags incl. "Hardcoded data that only works with preloaded inputs"
  (https://blogs.reskilll.com/what-hackathon-judges-look-for-complete-judging-criteria-breakdown-2026/, read 2026-11-08).
- Department of Decentralization (ETHBerlin): 5 criteria scored 1-3, each team judged twice by different
  groups; judging as a feedback session (https://dod.ngo/blog/2019/learnings-on-judging, read 2026-11-08).
- freeCodeCamp checklist: impact "up to 25% of your total score"; "I would pick core functionality 9/10 times."
  (https://www.freecodecamp.org/news/a-simple-checklist-to-help-you-win-or-have-fun-at-hackathons-98030be1a6c8/, read 2026-11-08)
- Hackathon.guide (Tauberer) has no judging section at all: "don't make winners and losers. Just don't."
  (https://hackathon.guide/, read 2026-11-08). Useful only as a reminder that judging norms are organizer-made.

### NEAR Hackathon 2026 (the jury that matters here; detail in `near-hackathon-rules.md`)
- Source: https://nearhackathon.com/HACKATHON.md (read 2026-11-08)
- No numeric rubric. Games track: "Judged on the game loop, not the token — bonus if players never notice the chain."
- AI screening: "Screening, not deciding: reproducibility check, feature verification, structured report, preliminary score."
- "Humans decide; low AI score alone cannot reject." Public repo: "Judges cannot open a private one."
- "Old project as-is: no." README with "do X - see Y" steps; video required when the demo is local-only.

## Consolidated criteria and weights
Proposed for a web3 game jury (NEAR `games` track). The split is the juror's inference; each row names
the sources it rests on.

| Criterion | Weight | Resting on |
|---|---|---|
| Runs and is verifiable: one complete path works live or in video, README steps reproduce, claims match code, honest real/mock boundary | 25% | Google "working application (not a mockup)" + "guidance on running" (10/50); Microsoft "Does it work" (25%); AgentRel working demo 25%; JetBrains/dev.to "live demo removes doubt"; NEAR AI reproducibility screening. Inference: raised above the 15-20% "completeness" of generic rubrics because NEAR screens reproducibility explicitly. |
| Game loop and fun: a loop a player wants to repeat, readable state, feedback, pacing | 20% | Imagine Cup Fun Factor 25% + Production Quality 25%; ETHGlobal/Devfolio Practicality + Usability; NEAR "Judged on the game loop, not the token". Inference: merged and trimmed to 20 because production polish is partly covered by the row above. |
| Technical implementation: non-trivial engineering, deterministic agents, commit/verify scheme, architecture, tests | 20% | ETHGlobal Technicality; Devpost "technical implementation"; Global Travel 40%; Reskilll/Builderbase 20-25%; BlockEden "beyond a front-end wrapper on one contract". |
| Originality and quality of the idea | 15% | Imagine Cup Innovation 20%; Okta/Devpost equal-thirds; Reskilll 20-25%. Inference: lowered because judges report this column compresses to mid-range. |
| NEAR integration and track fit: concrete, named chain role; fits "real economies"; no track mismatch | 10% | ETHGlobal partner-prize logic ("explain how you used the partner's tools"); Okta "features leveraged beyond login"; Harrington tip 13; BlockEden track mismatch flag; NEAR Q-011 (own fitting contract is enough). |
| Presentation: README first two paragraphs, 2-4 minute video, one-sentence identity, Q&A answers | 10% | Imagine Cup Presentation 15%; Builderbase 15%; Reskilll 15-20%; lablab Presentation 1/4; Biggin "five minutes per project"; DoraHacks "first two paragraphs". Inference: 10 rather than 15 because NEAR's first pass is a machine reader. |

## Red flags judges name
- Work started before the event; single giant commit or missing history. ETHGlobal: "Submissions with large
  single commits or missing histories may be disqualified." (https://ethglobal.com/events/ethonline2023/info/details,
  read 2026-11-08); MLH cheating check (https://guide.mlh.com/general-information/judging-and-submissions/cheating-check, read 2026-11-08);
  NEAR "Old project as-is: no." (https://nearhackathon.com/HACKATHON.md, read 2026-11-08).
- Same project shown at another hackathon: HackMIT 2014 removed two of eight finalists, one "used a project that
  was presented at another hackathon a week before" (https://www.thetech.com/2014/11/07/hackmit-v134-n53, read 2026-11-08).
- Presenting someone else's output as your own: HackMIT's Seamless team demoed Microsoft Research videos as its
  algorithm's output and stepped down (same source).
- Hard-coded results in the demo: ConUHacks winners "hard-code" data "for simplicity's sake"; MLH verified the
  model and timestamps, no DQ, but a public investigation followed (https://theconcordian.com/?p=74542, read 2026-11-08).
  Reskilll lists "Hardcoded data that only works with preloaded inputs" as a red flag (read 2026-11-08).
- Claims the code does not support: Devfolio AI judge `claims_mismatches`; READMEs describing components the repo
  lacks (https://devfolio.co/blog/the-discerning-machine/, read 2026-11-08). Harrington: "Don't lie and say you used
  a particular technology when you didn't." (read 2026-11-08).
- Fake UI: "Don't make JPEGs and pretend it's a real app." (Harrington, read 2026-11-08); JetBrains judge: elaborate UI
  raises doubt about the backend (read 2026-11-08).
- Team cannot answer basic technical questions: "When questioned about the simplest details, they could not answer."
  (Harrington, read 2026-11-08).
- Blurring what was built during the event: read as hiding (dev.to kurbaitaev; JetBrains, both read 2026-11-08).
- Private repo or broken links: lablab "may lower your score"; NEAR "Judges cannot open a private one."; DoraHacks
  "test every link" (all read 2026-11-08). Missing LICENSE fails NEAR's required-file check (Q-014, read 2026-11-08).
- "Coming soon" features and roadmaps in the pitch: "Judges do not fund roadmaps." (AgentRel, read 2026-11-08);
  Harrington: "Don't spend time explaining what you couldn't accomplish."
- Track mismatch and bounty spraying: BlockEden (read 2026-11-08); ETHGlobal "You can't win a prize you didn't register for."
- Undisclosed AI or library use: MLH "If you do not credit your AI usage, you will be disqualified"; ETHGlobal
  requires documenting AI-assisted files; NEAR Q-005 lists libraries, templates, AI-generated code (all read 2026-11-08).
- Plagiarism / vote gaming: lablab "immediate disqualification" (read 2026-11-08).

## Implications for Forget to Foresee
- The jury's first reader is a machine (Claude Code / Codex reproducibility check). The README's "do X, see Y"
  table and the real/mock table are exactly what Devfolio's and NEAR's screeners verify; every row must still
  reproduce on 14.11 from a clean clone with the exact commands. Inference: a mismatch here costs more than any
  missing feature because it hits the 25% "runs and is verifiable" row and the honesty red flag at once.
- State the contract status in one plain sentence everywhere it appears (README, X post, video): "Rust NEAR
  contract `season-commit` is tested (N tests) and not deployed; verification runs in the browser against the
  committed Merkle root." Testnet-only is eligible (Q-010) and an own fitting contract is enough (Q-011), but
  judges ask "what part is on chain" (JetBrains, dev.to); an honest, specific answer scores, a blurred one is a red flag.
- No wallet login and no NFT token fit the games track's own words ("bonus if players never notice the chain"),
  so present them as a design decision, not a gap (Kim: present choices as intentional). Do not submit to the
  `nfts` track unless the NFT-agent biography actually runs; BlockEden's track-mismatch flag applies.
- The demo video is still missing and is required for a local-only demo (Q-012); even with the hosted demo, every
  source treats the video as proof "that the project is real". Follow ETHGlobal/Devfolio constraints: 2-4 minutes,
  720p, narration, no speed-up, backstory under 20 seconds, one complete user action with a visible result
  (a season move, the AI clans reacting, the Merkle verification turning green), NEAR's role named concretely.
- Open the README, the video and any live pitch with the one-sentence identity (Harrington: judges "summarize your
  app in one sentence"); the six deterministic clans and the committed season are the memorable centre, the chain
  is supporting detail.
- 349 tests do not move human judges (PennApps 2012; Reskilll "Judges don't score your code"), but they do move the
  AI screener and answer the "does it actually run" question; cite the count once in the README with the command
  that reproduces it, not as a headline.
- The agent-playable HTTP API matches the track hint "AGENT NPCS" and gives the machine screener a path to play
  a season itself; make that a "do X, see Y" row (one curl, one expected JSON) so the screener can verify a
  feature rather than read about it. Inference.
- Keep the repo public with LICENSE through 18.11, the hosted demo up to 25.11, no pushes after the deadline
  except the fixes NEAR's request-changes flow allows; keep `pre-hackathon` / `hackathon-submission` tags and the
  diff link so "what did you build during the event" has a one-click answer (MLH cheating check, ETHGlobal
  new-vs-reused rule, NEAR Q-003).
- Prepare the "what breaks first" answer (unbalanced economy at long seasons? agent determinism across browsers?
  contract not deployed?) for the human round; naming a weakness raised scores for two judges writing in 2026.
- Scope discipline until the freeze: one polished path (start season -> play a turn -> see clans react -> verify
  root) beats new features; every source that ranks demos says a narrow working path wins over breadth.
