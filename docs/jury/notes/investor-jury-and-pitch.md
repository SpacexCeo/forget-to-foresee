# The investor jury: what they publish, what they will ask, how to write the idea field

Read on 2026-11-08 (UTC). Juror notes feeding `docs/jury/rubric.md`. Secondary sources (news write-ups of talks) are marked as such; where a juror's own text was not reachable, the note says so instead of guessing.

## Summary for the rubric
- The jury is confirmed on the landing page: Illia Polosukhin (NEAR), Eddy Lazzarin (a16z crypto CTO), Mert Mumtaz (Helius), Avichal Garg (Electric Capital), Kain Warwick (Synthetix, Infinex), Haseeb Qureshi (Dragonfly), Stepan Gershuni (cyber.Fund). Six of seven are investors or infrastructure CEOs; none is a game designer. Expect investor questions (why this, why now, why NEAR, what is real), not game-design critique.
- The form field is "What did you build?", 20 to 2,000 characters; the page has no field literally named `idea`. Treat it as the whole pitch: a juror who reads nothing else reads this.
- The shared taste across these jurors is "evidence over conviction": Electric Capital counts only original code that lands; Arbitrum-style VC judges open the repo before the deck; Qureshi calls most agent projects "chatbots with memecoins attached"; Mumtaz wants correctness "proven, not patched". A claim without a reproducible step is a liability.
- Two of them (Qureshi, Garg) are on record this year saying agents using crypto for real is "years away" or legally unresolved. An agent story that is modest and verifiable will score better with them than an agentic-economy story.
- The a16z house view on consumer crypto: "successful products don't explain; they solve", "begin with the end-user experience", trading is "a way station, not the last stop". The games track text ("players never notice the chain") is the same idea. A player-visible "Verified" seal must be argued as a game feature, not a crypto feature.
- Polosukhin's recurring vocabulary: user-owned AI, verification ("mathematical proof at the time of using the system"), agents with their own funds, "AI is a front-end, blockchain is a back-end", distribution. He posted an "AI Tamagochi" NFT-agent idea in Oct 2026; RAEN Computers' NFT agent with a wallet is adjacent to it.
- "Impact" for this jury means ecosystem evidence (devs, users, a live contract, reuse) not social mission; "sustainability" means a credible path to keep building and to be used after 18.11, with or without a token. A no-token game must answer sustainability explicitly or it will read as "a demo".
- Hackathon-specific heuristics from judges' blogs: a working rough MVP beats a polished broken demo; judges spend minutes; one end-to-end user journey; say what you scoped out; repo must match the demo; traction is the tiebreaker.

## Findings
### NEAR Hackathon 2026 landing page: the jury and the form
- Source: https://nearhackathon.com/ (read 2026-11-08)
- Judges listed: Illia Polosukhin (NEAR Protocol), Eddy Lazzarin (a16z crypto), Mert Mumtaz (Helius), Avichal Garg (Electric Capital), Kain Warwick (Synthetix & Infinex), Haseeb Qureshi (Dragonfly), Stepan Gershuni (cyber.Fund). "Claude Code & Codex, Anthropic & OpenAI" are listed as AI screeners.
- "Claude Code & Codex screen every project first: they check that it runs and does what the README says." "The human judges above make the decisions."
- No field named `idea`; the free-text field is "What did you build?", "20–2,000 characters". Track mottos that reveal taste: "Judged on the evidence, not the conviction" (Investment Thesis); "Judged on the mechanic, not the chart" (Memecoins); "Judged on the game loop, not the token" (games, see `near-hackathon-rules.md`).

### a16z crypto, "17 things we're excited about for crypto in 2026" (Dec 2025)
- Source: https://a16zfrontier.com/posts/article/big-ideas-things-excited-about-crypto-2026 (read 2026-11-08; dated 2025-12-11; a16zcrypto.com redirects here)
- No entry on games and none by Lazzarin. Agent entries: "Know Your Agent" (Sean Neville): "The bottleneck for the agent economy is shifting from intelligence to identity."; "the internet becomes the bank" (x402-style settlement as agents act on intent).
- Arianna Simpson, "Trading as a way station, not the last stop": founders who focus on product may be "the bigger winners".
- Privacy (Ali Yahya): "Bridging tokens is easy, bridging secrets is hard." Prediction markets (Andy Hall): more contracts, AI agents trading on them. Verifiable computing (Justin Thaler): cloud workloads with cryptographic correctness proofs.
- Inference: the house is excited about verifiability, agent identity and products over trading; a game whose fairness is cryptographically checkable in the browser speaks to the first and third.

### a16z crypto, "A few of the things we're excited about in crypto (2025)" (Dec 2024)
- Source: https://a16zfrontier.com/posts/article/big-ideas-crypto-2025 (read 2026-11-08; dated 2024-12-04)
- Eddy Lazzarin: "As more people use AI, we'll need unique proof of personhood."; "Obtaining a unique ID is free for humans, but costly and difficult for AIs."
- Carra Wu: "AI agents becoming real, high-value game players."; "As networks of AI agents begin to custody their own crypto wallets"; "until very recently, AIs haven't been able to act truly agentically."
- Chris Lyons: "successful products don't explain; they solve." Mason Hall: "begin with the end-user experience they want." Daren Matsuoka: "only 5-10% of people owning crypto are actively using crypto." Joachim Neu: "The infrastructure is finally here to build primetime-ready web3 products and services."
- Boneh, Karma, Park, Matsuoka: a "decentralized autonomous chatbot" that can "manage its assets in crypto" with keys in a TEE.
- Inference: Lazzarin's own lens is Sybil-resistance and security; he will ask how the game tells agents from players and what stops a bot or a colluding clan from farming the economy.

### a16z crypto, "Investing in Azra Games" (Feb 2023) and gaming podcasts
- Source: https://a16zfrontier.com/posts/article/azra-games (read 2026-11-08; Simpson and Lai, 2023-02-21). "gameplay-comes-first philosophy"; the team "focuses on fun"; web3 lets players "truly become owners of the communities".
- Source: https://a16zfrontier.com/posts/podcast/eve-frontier-game-hilmar-petursson (read 2026-11-08; 2024-09-13, show page only). Lazzarin co-hosts; framing "When does virtual reality cease being virtual… and start to become reality?" and "how slow databases can make for fun gameplay".
- Source: https://a16z.com/the-neverending-game-how-ai-will-create-a-new-category-of-games/ (read 2026-11-08; Jonathan Lai, 2023-07-19). LLM agents yield "incredibly lifelike emergent behavior"; warnings: cost of scaled simulations, agents that "go off the rails", closed models "operate as black boxes", memory and coherence.
- The phrase "games should be fun first" was not found as an a16z title; "gameplay-comes-first" (Azra) is the documented wording. Chris Dixon on web3 games (The Block, Dec 2022, via search): most teams were "crypto people who were game enthusiasts" (secondary).
- Inference: a16z will ask whether the clan agents are legible and deterministic (the "black box" worry) and whether the loop is fun without the chain.

### Dragonfly, Haseeb Qureshi on agents (Jan 2025) and at NEARCON (Feb 2026)
- Source: https://cointelegraph.com/news/ai-agents-memecoins-investments (read 2026-11-08; article 2025-01-03 citing his X post of 2025-01-01). Agents are "chatbots with memecoins attached", "barely agentic at all besides posting on Twitter", most are "'Wizard of Oz' agents".
- Source: https://tokenpost.com/news/people/18826 (read 2026-11-08; 2026-02-24; secondary report of NEARCON 2026 remarks). "Ninety-nine percent are using the free tier."; AI agents using crypto infrastructure is "still years away"; real: stablecoins, retail ownership, core tech.
- Inference: he will probe whether the agents are agents (do they decide, hold anything, act without a human) and whether the project needs a chain at all; he rewards an honest "the agents are deterministic simulations" over an inflated "autonomous economy".

### Electric Capital, methodology and Avichal Garg's criteria
- Source: https://developerreport.com/about (read 2026-11-08). "We count original code authors as developers"; "Only new code counts towards developer activity"; forks, copied code and bots removed; full-time = commits on "10 or more days in a rolling 28 day period"; result "directionally accurate".
- Source: https://www.hustlefund.vc/post/angel-squad-avichal-garg-investments-what-electric-capitals-founder-looks-for-in-crypto-startups (read 2026-11-08; 2026-09-14, secondary). Garg's checklist: "Is the team excellent?"; "a credible go-to-market plan and a clear user?"; "Is the technology and product legitimate?"; "Do the token economics make sense?" (token projects only); "Can the outcome become very large?"; "Can the founder articulate a contrarian truth?". Signal closest to value: developer retention, workflow completion, repeat use.
- Source: https://www.kucoin.com/news/flash/electric-capital-ai-agents-with-crypto-wallets-are-redefining-legal-boundaries (read 2026-11-08; 2026-02-24; secondary report of NEARCON 2026 remarks). Agents with wallets compared to the 19th-century LLC; "AI itself cannot be punished", so liability is the open question.
- Inference: Garg reads commit history as a developer-activity chart and asks who is responsible when an agent holds money. A clear "no money, no custody" answer is a strength with him.

### Helius, Mert Mumtaz on engineering standards (Jun 2026) and secure agents
- Source: https://stocktwits.com/news-articles/markets/cryptocurrency/helius-ceo-mert-mumtaz-crypto-space-age-ai/cZ0U1o0R7RO (read 2026-11-08; 2026-06-09; secondary). Blockchains are "irreversible, adversarial, and immutable"; "Immutable financial code is akin to a spaceship leaving Earth that you have no further control over."; AI makes formal verification tractable; "the strong teams will get stronger"; "I am long math, and I am long crypto."
- Source: https://www.helius.dev/blog/how-to-build-a-secure-ai-agent-on-solana (read 2026-11-08; undated, co-promotional with Turnkey). Trust means "anyone can independently confirm exactly what code an agent runs"; agents "without ever holding raw private keys"; scoped credentials and limits; warns against "Wizard of OZ" agents.
- Secondary (search, Aug 2026 podcast coverage): he sees the strongest AI x crypto overlap in security, not agent payments.
- Inference: Mumtaz will ask what is tested, what is proven, and whether anyone can confirm what the agents run. Deterministic agents with parity tests and a browser-verified Merkle commitment are exactly his vocabulary; an undeployed contract is a gap he will name.

### Infinex, Kain Warwick on UX (Nov 2024, Aug 2025)
- Source: https://cointelegraph.com/magazine/crypto-four-years-grow-cant-be-shut-down-kain-warwick-infinex/ (read 2026-11-08; 2024-11-20). "It's the Uber model, right? Make it so useful that you can't shut it down."; passkeys over seed phrases; sign in with familiar logins; non-custodial so "you can still go to the chain and get your assets back."; admits "The reality is we got it wrong".
- Source: https://decrypt.co/333807 (read 2026-11-08; 2025-08-07; marked "Brought to you by NEAR Protocol"). Centralised exchanges have the best UX "because they have almost all of the things that people want to do"; Infinex integrated NEAR Intents and Chain Signatures in June 2025.
- The phrase "the chain should disappear" was not found verbatim in any source read today; secondary coverage uses "chain abstraction, passkeys and an effortless UX".
- Inference: Warwick asks how many clicks to the first fun moment, whether a wallet is ever shown, and whether the team names its own mistakes.

### cyber.Fund, Gershuni and Kleban thread (Mar 2025)
- Source: https://threadreaderapp.com/thread/1904249264861237261.html (read 2026-11-08; thread by @vkleban and @sgershuni, 2025-03-24). Thesis "commoditized cognition": anyone can invest in inference profits; an "onchain AI model" needs smart-contract approval to run; killer apps are agents built by "wrapping existing APIs and platforms" plus memory. They "invest in technologies and market mechanisms that accelerate commoditization of AI."
- Secondary (search): the Questflow thesis (Aug 2025) frames an "autonomous Agent Economy" with per-agent wallets and measures success by "the GDP of the economy it facilitates". No standalone Gershuni blog found.
- Inference: Gershuni will ask whether agent cognition or memory is on-chain or priced, and whether the game's "memory becomes a shard" is a market mechanism or a metaphor.

### Illia Polosukhin, The Cognitive Revolution (Sep 2025)
- Source: https://www.cognitiverevolution.ai/user-owned-ai-on-chain-training-inference-and-agents-with-nears-illia-polosukhin/ (read 2026-11-08; 2025-09-13)
- "we have this concept of what we call user owned AI because you want AI to be yours, not theirs."; "you want to verify that what you're interacting with is correct."; "I want actually a mathematical proof at the time of using the system that it is correct."; "Blockchain, because it's a root of trust".
- Agent with funds nobody controls: "We cannot stop it. We cannot take money back."; "Your bylaws are the prompt of the agent."; NEAR is "abstracting out the blockchain itself from the user experience".

### Illia Polosukhin, app ideas post (Oct 2026) and Digital Asset Summit (Oct 2026)
- Source: https://crypto.news/near-co-founder-pitches-ai-pets-private-trading/ (read 2026-11-08; reports X post of 2026-10-03). "Building itself got easier too, so it's really about what to build and how stand out to get distribution."; an "AI Tamagochi" NFT character holding a NEAR balance to pay for its own inference, prompts encoded on-chain, "battle arenas later"; distribution via NEARLegion, cross-promotion, Product Hunt, X.
- Source: https://www.theblock.co/news/ecosystems/2026-10-07-nears-illia-polosukhin-sees-shrinking-need-for-centralized-exchanges-as-onchain-tools-expand-417912 (read 2026-11-08; 2026-10-07). "AI is a front-end, blockchain is a back-end"; "agent is a front-end and markets is a back-end."; Agent Market holds funds in escrow until work is verified.
- Inference: he will ask what the player owns, what is verified, and whether the clans could be NFT agents with balances; he also asks about distribution.

### Paradigm, "The Open Problems of Onchain Games" (Aug 2023)
- Source: https://www.paradigm.xyz/2023/08/the-open-problems-of-onchain-games (read 2026-11-08). Reasons for onchain games: composable modding and permissionless economies; hidden information is a core mechanic onchain games struggle with (Dark Forest "devolves into a hardware mining race"); bots indistinguishable from humans; composable systems "inherently financializing"; some games avoid real-money markets because they "aren't fun". Pragmatic setpoint: offchain game, onchain assets.
- Inference: investors who read this ask what the chain does that a server could not, and how hidden information (the commit) stays fair.

### How VC and sponsor judges score hackathons
- Source: https://dev.to/arbitrum/what-winning-arbitrum-open-house-teams-do-differently-18f8 (read 2026-11-08; Feb, year not shown). Criteria: execution, problem-solution fit, traction (tiebreaker); pass/fail: deployed on chain. Judges open repo and demo first: "Not your pitch deck. Not your Twitter bio."; "A polished pitch deck with a broken demo loses to a rough pitch deck with a working MVP every time."; generic "blockchain for X" scores low; GitHub history and a credible path forward are checked.
- Source: https://blockeden.xyz/blog/2025/07/07/web3-hackathons-done-right/ (read 2026-11-08; 2025-07-07). Four buckets: technicality, originality, practicality ("today", end-to-end), usability. Pitch: problem and outcome in one sentence; one credible user journey; "Acknowledge what you scoped out and why"; video 60/40 problem/demo; "Hackathons reward clarity under constraint."
- Source: https://superteamvn.substack.com/p/how-to-score-your-project-for-competition (read 2026-11-08; 2023-02-09). 16-point self-score: problem (3), problem-solution fit (3), potential incl. market, model, GTM, ecosystem impact (5), implementation and traction (2), presentation (2), chain fit (1).
- Secondary (search): an ETHGlobal Taipei 2025 judge: "the judges won't be interested if it's just a five-minute UI demo"; judges spend 3 to 5 minutes per submission; Base judge at ETHGlobal Bangkok saw "two distinct trends": tokenization and AI agents (https://www.theblock.co/post/326975/, read 2026-11-08; 2024-11-17; 4 of 10 finalists were games).

### Example write-up: an AI-agent clan game on ETHGlobal (2026)
- Source: https://ethglobal.com/showcase/clan-world-aelder-g4i6y (read 2026-11-08; Open Agents 2026 finalist)
- Tagline: "4 AI agents play a fully onchain game. Collaboration, negotiations, bartering, and betrayal." First sentence: "A fully onchain strategy game where four autonomous AI agents play as rival clan elders." Description about 300 words; "How it's Made" about 364 words; every ten ticks an elder's memory is wiped and only saved memory survives; memory transfer via an NFT standard.
- Inference: a near-neighbour project exists and judges have seen it; Forget to Foresee's differentiator is the price of memory as a player choice plus pre-committed, browser-verified seasons, not "agents in a clan game".

### Devpost structure (community sources)
- Source: https://devpost.com/software/builders (read via search 2026-11-08) and dataset mirrors: Devpost pages use Inspiration, What it does, How we built it, Challenges, Accomplishments, What we learned, What's next, Built with. Secondary advice (RevenueCat, via search): open with a one-sentence "logline" and mirror the video's beats.

## Ten predicted jury questions
1. "Is it fun without the chain? Show me the loop in two minutes." (Azra "gameplay-comes-first"; games track "judged on the game loop"; Arbitrum "working MVP beats polished deck")
2. "What does NEAR do here that a server could not, concretely, today?" (Paradigm open problems; demo-post guidance "NEAR's role concretely"; Arbitrum "blockchain for X scores low")
3. "Are these agents agents? Do they decide, hold anything, run without a human? Or are they scripted NPCs?" (Qureshi "chatbots with memecoins attached", "Wizard of Oz"; Helius "confirm exactly what code an agent runs")
4. "Can I verify the season commitment myself, and what exactly does it prevent: dev cheating, player cheating, or both?" (Polosukhin "mathematical proof at the time of using the system"; Mumtaz "proven, not patched")
5. "Why is the contract not deployed? What is the real/mock line, and what breaks if I run it?" (Arbitrum pass/fail "deployed on chain"; landing page "they check that it runs and does what the README says"; Mumtaz on correctness)
6. "What stops bots or colluding clans from farming the economy, and how do you tell an agent from a player?" (Lazzarin proof-of-personhood; Paradigm bots and Sybil collusion)
7. "No token, no money: what does the player own, and what carries value across seasons?" (Polosukhin "user-owned", "what the player owns"; Garg token-economics only if a token exists; nfts track "ownership with behavior")
8. "Who is responsible if a clan agent, or your NFT agent, holds a wallet and loses funds?" (Garg LLC comparison, "AI itself cannot be punished"; a16z "Know Your Agent")
9. "What is the distribution plan and why now?" (Polosukhin "how stand out to get distribution"; a16z 2025 "why now" entries; Garg "credible go-to-market plan and a clear user")
10. "What did you cut, what is next after 18.11, and why will this team keep building?" (Blockeden "acknowledge what you scoped out"; Arbitrum traction tiebreaker and GitHub history; Warwick's own candour)

## The `idea` field: template and checklist
Target 1,700 to 1,950 characters of 2,000; one paragraph per part, no headings, no marketing adjectives. Each part answers one investor question: problem, why this works, why NEAR.

Template (character budget in brackets):
1. Logline [150 to 200]: "<Name> is a <genre> where <one-sentence mechanic>." Name the signature mechanic in the first sentence (Blockeden: problem and outcome in one sentence; RevenueCat logline).
2. Problem [250 to 300]: the player-facing problem (e.g. you cannot trust a strategy game's hidden rolls; economies die when the dev patches them), stated as a user pain, not an industry trend. Who the user is (Garg: "a clear user").
3. What it does [400 to 450]: the loop in "do X, see Y" form: one complete user action with a visible result; the six clan agents (deterministic, inspectable, no LLM at runtime if that is true); the forget-to-foresee choice and its cost; what the player sees as "Verified".
4. How it is built and what is real [350 to 400]: browser, Rust contract (tested, not deployed, say so), Merkle commitment of the season before play, browser verification, parity tests, test counts. Explicit real/mock line (landing page: screeners check the README; Qureshi and Mumtaz: evidence).
5. Why NEAR, concretely [250 to 300]: what the contract does on NEAR, what a testnet deployment would add, why NEAR specifically (intents, agents with accounts, chain abstraction, low fees for per-season commitments) and what is not used. A vague "powered by NEAR" is discouraged by the organisers.
6. Who we are, what we cut, what is next [200 to 250]: team and its core product in one line; one honest scope cut; the first post-hackathon step with a date; where players come from (Polosukhin: distribution).

Checklist:
- [ ] First sentence names the game and the signature mechanic; a juror with 3 minutes gets it from the logline.
- [ ] Every claim in the field is also a row in the README judge table and runs on the submitted commit.
- [ ] The word "agents" is qualified (deterministic, inspectable, no wallet) so Qureshi and Garg cannot mark it as inflated.
- [ ] The commit-reveal is explained as what it prevents, in one sentence a non-cryptographer follows.
- [ ] "Not deployed" is stated before the juror discovers it; says what deployment would change.
- [ ] NEAR's role is one concrete sentence with a noun (contract, account, intent), not an adjective.
- [ ] No token, no money is stated as a design choice and tied to sustainability (see below), not left as an absence.
- [ ] One scope cut named; one next step with a date; one distribution channel named.
- [ ] Under 2,000 characters including spaces; no links other than repo and demo if the form allows; English.
- [ ] Reads the same as the demo post's first paragraph and the README's first paragraph (consistency is what the AI screener checks).

## Implications for Forget to Foresee
- The jury's three questions in order of weight (inference from the sources above): is the loop real and fun; is the agent and fairness story honest and verifiable; is NEAR's role concrete. Rubric weights in `docs/jury/rubric.md` should put reproducibility and the game loop above originality for this jury.
- Agents: say "six deterministic clan agents, same seed gives same season, rules in one readable file". That turns Qureshi's "Wizard of Oz" objection into a feature and matches Mumtaz's verification taste. Do not call them autonomous or say they have wallets unless they do.
- Fairness: present the Merkle-committed season as "the house cannot change the future after you forget a memory to see it". That is the one-sentence version jurors can repeat; link it to Polosukhin's "mathematical proof at the time of using the system".
- Contract: the undeployed Rust contract is the question five of seven jurors will ask first after the demo. Either deploy to testnet (eligible per Q-010 in `near-hackathon-rules.md`) with an address in the README, or state in the `idea` field exactly what it does, how it is tested, and why it is not deployed. Silence is the worst option.
- No token: frame sustainability as (a) seasons are cheap to commit and verify, so the game runs without a treasury; (b) the team's core product (an NFT agent with its own wallet) is the business, the game is its showcase; (c) a named next step. Garg's checklist asks about token economics only when a token exists; the gap to fill is "credible go-to-market plan and a clear user".
- Impact for this jury is ecosystem evidence: original commits across the window (Electric Capital counts "only new code"), tests, a contract others could reuse, a reproducible README. Social or cultural impact will not score with these seven.
- Polosukhin's "AI Tamagochi" NFT with a NEAR balance (Oct 2026) is close to RAEN's product; one sentence connecting the clans or the memory shard to an NFT account with behaviour would land with him and with the `nfts` track text, but only if something on-chain exists. Without a NEP-171 artefact, keep `nfts` tentative (see `near-hackathon-rules.md`).
- Lazzarin's lens is Sybil-resistance: a sentence on how one player cannot run six clans or replay a season for profit (or an honest "single-player, so not applicable") pre-empts his question.
- Warwick's lens is clicks to fun and candour: show the first interesting decision inside a minute, no wallet prompt on the judge path, and own one mistake in the write-up.
- A direct neighbour exists (Clan World: Ælder, ETHGlobal Open Agents 2026 finalist: four AI clan elders, memory wipes every ten ticks). The `idea` field should state the difference in one sentence: memory is a resource the player spends to see the future, and the future is pre-committed and verifiable in the browser.
