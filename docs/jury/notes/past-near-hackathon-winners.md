# Past NEAR hackathon winners and what they had in common

Read on 2026-11-08 (UTC). Juror notes feeding `docs/jury/rubric.md`.

Access note: Devpost galleries (1t-agents, redacted, metabuild, nearcon-irl-hackathon), Notion FAQ pages, Medium and X returned 403/402/empty to our fetcher, so winner lists for those come from NEAR Foundation blog posts, search-engine snippets of the Devpost pages and third-party recaps. Items marked UNVERIFIED rest on a snippet only.

## Summary for the rubric
- The current NEAR HACKATHON (1-14 Nov 2026, results by 18 Nov) screens every project with Claude Code and Codex first, checking "that it runs and does what the README says"; human judges (Illia Polosukhin, a16z, Helius, Electric Capital, Synthetix, Dragonfly, cyber.Fund) decide. A public repo and a public X demo post with video or screenshots are both mandatory. Source: https://nearhackathon.com/ (read 2026-11-08).
- Games track guidance on the same page: "judged on the game loop, not the token; a bonus if players never notice the chain." NFTs track is named "NFTs That Do Something". Source: https://nearhackathon.com/ (read 2026-11-08).
- NEAR's recurring five-criteria rubric (used by MetaBUILD III, One Trillion Agents, and cited again by nearhackathon.com as "previous NEAR hackathons evaluated"): technological implementation (quality of NEAR integration and engineering), design (UX and visual craft), potential impact on the NEAR ecosystem, quality/originality of the idea, project sustainability (realistic long-term plan). Sources: https://cryptotvplus.com/2022/11/near-announces-metabuild-iii-hackathon/ ; https://allhackathons.com/hackathon/one-trillion-agents-hackathon/ ; https://nearhackathon.com/ (all read 2026-11-08).
- Every verified NEAR winner since 2020 shipped a working thing with visible NEAR usage: contracts deployed, wallet login, NFTs, B.O.S components, Chain Signatures, NEAR AI inference or Shade Agents. No verified winner was a pure idea or mock. Sources: the per-hackathon entries below.
- Gaming winners were small complete loops with one on-chain hook (NFT skins, wallet points, NFT rewards), not deep on-chain simulations: MetaBuidl 2021 Play Hacks (Spaceship Wars 13k, Hunt for the Lost Cryptocubes), MetaBUILD 2 CryptoDino challenge (Jeffrey the Dinosaur, OpenSkin), MineLand. Sources: https://www.near.org/blog/metabuidl-hackathon-winners ; https://www.near.org/blog/metabuild-2-hackathon-winners (read 2026-11-08).
- Top overall prizes repeatedly went to developer tooling and infrastructure (Voog, NEAR Playground, Obrigado, Magic Build, Roke.to, yNEAR), i.e. the ecosystem-impact criterion weighs heavily. Sources: entries below.
- 2025 NEAR AI events rewarded measurable utility: the Useful Agents hackathon required "quantitative evidence of their agents' utility" (benchmarks, error analyses, reproducible test environments). Source: https://www.near.org/blog/building-useful-agents-sf-hackathon-shows-the-power-of-practical-ai (read 2026-11-08).
- Judge-side advice (Devpost interview including NEAR Foundation's Maria Yarotska): balance all criteria, hit every requirement, pair the demo video with a detailed description, and a slick video with a thin GitHub repo is a red flag. Source: https://info.devpost.com/blog/hackathon-judging-tips (read 2026-11-08).
- NEAR's post-hackathon funnel (Protocol Rewards) looks at mainnet progress, real users and commit/PR activity; hackathon winners Ping Pay and Finowl went through it. Source: https://www.near.org/blog/near-protocol-rewards-what-it-means-to-graduate-from-a-hackathon (read 2026-11-08).

## Winners by hackathon

### NEAR HACKATHON "Build what's next", 1-14 Nov 2026 (the one we are entering)
- Source: https://nearhackathon.com/ (read 2026-11-08)
- No winners yet (judging 16-18 Nov). 13 tracks incl. "Games With Real Economies" and "NFTs That Do Something"; $10K/$3K/$2K per track, $55K grand prize, paid in NEAR. Required: public repo with code written since announcement, public X post tagging @NEARProtocol #NEARHackathon with demo video or screenshots, NEAR wallet address, 20-2000 char description. AI screening (Claude Code, Codex) verifies the README claims against the running project. Deployment to testnet/mainnet is NOT stated as required.

### NEARCON 2026 Innovation Sandbox (virtual sprint 26 Jan to 19 Feb 2026) and Agent Wars (24 Feb 2026)
- Sources: https://nearn.io/nf-bo/8/40/ ; https://nearcon.org/the-agent-hackathon/ (via search snippet) ; https://x.com/NEARProtocol/status/2013313771255595279 (snippet) (read 2026-11-08)
- Innovation Sandbox: $15K USDC, four tracks (The Private Web, AI That Works for You, Open Society, Only on NEAR), pitched as "shipping real, working demos on NEAR". Winners not retrievable; one submission (Cabo, https://github.com/akashbiswas0/Cabo) appears on the NEARN winners bounty page, UNVERIFIED as a winner.
- Agent Wars: 4-hour, 4-challenge event where AI agents did the building; 4,000 NEAR pool; "One leaderboard. The best agents won." No named winners found.

### Useful Agents Hackathon (NEAR AI, SF Compute, Electric Capital), San Francisco, March 2025
- Source: https://www.near.org/blog/building-useful-agents-sf-hackathon-shows-the-power-of-practical-ai (read 2026-11-08)
- Postt (1st, $5K): AI social-media manager; NEAR AI inference; reported 92% human approval rate. Due Diligence Agent / DiligenceAI (2nd, $3K): seven-agent system on NEAR Agent Hub; reported metrics. NEAR Food (3rd, $2K): free-food finder agent using TEEs. Judging demanded benchmarks; Adam Wolff (Anthropic): "If you can't prove usefulness with metrics... no one will use it". No repo links in the post.

### One Trillion Agents Hackathon (NEAR AI / DevHub, Devpost), 31 Jan to 2 Mar 2025, winners 12 Mar 2025
- Sources: https://allhackathons.com/hackathon/one-trillion-agents-hackathon/ ; https://x.com/NEARDevHub/status/1899907018523369591 (search snippets only, X returns 402) ; https://bitteprotocol.substack.com/p/from-experiment-to-adoption-how-bittes ; https://www.near.org/blog/near-protocol-rewards-what-it-means-to-graduate-from-a-hackathon (read 2026-11-08)
- Scale: $102,550 in prizes, 1,991 participants (Devpost snippet); tracks DeFi Agents ($20K / 5 teams), Social Media Agents ($20K / 5), Absurd Agents ($10K / 4) plus sponsor bounties. Five-criteria rubric, no weights. No separate gaming track.
- Ping Subscription Shade Agent (Absurd Agents, $2.5K): subscription payments without pre-funding; Shade Agent (TEE) on NEAR; later in Protocol Rewards heading to mainnet. AgentFather (Absurd Agents, $2.5K): assistant for creating agents on NEAR AI Hub. Social Media ($4K each): Aigency (NEAR AI-compatible orchestration/CDN for agents), X DropBot (UNVERIFIED, snippet only). DeFi ($4K each): Balancer Assistant, HedgeFi (memecoin factory and prediction market on NEAR and Aurora), betVEX AI Agent, Dailies. Veax bounty ($2.5K): Veax AI Assistant (https://devpost.com/software/veax-ai-agent). Bitte bounties: CoolFi (NEAR Intents + Bitte chat), betVEX, SatSlinger (Bitcoin tipping via Chain Signatures), Gains.Trade agent. Demo/video status per project not retrievable (Devpost 403).

### Coinbase Onchain AI Hackathon (NEAR bounties), San Francisco, 1-2 Feb 2025
- Source: https://www.near.org/blog/coinbase-onchain-ai-hackathon (read 2026-11-08)
- Chainsmokers: MCP-augmented chatbot for natural-language cross-chain transactions; NEAR AI agent framework. Mosaia/Walley: smart-wallet investment agent. Both praised for live, flexible agent behaviour; no criteria published.

### Zcash x NEAR Intents Hackathon (Taikai), 17-28 Mar 2025
- Source: https://taikai.network/en/hackbox/hackathons/zcashxnear/prizes (snippet) ; https://forum.zcashcommunity.com/t/zcash-x-near-intents-hackathon/50604 (snippet) (read 2026-11-08)
- $70K, criteria included "Innovation & Creativity: unique and original use of AI, Zcash, and NEAR Intents". Winners not found (UNVERIFIED).

### [REDACTED] Hackathon (NEAR, Devpost), remote 5 Sep to 31 Oct 2024, finale Bangkok 9-11 Nov 2024
- Sources: https://allhackathons.com/hackathon/redacted-hackathon ; https://alphagrowth.io/spaces/redacted-hackathon-unleash-your-creativity (Twitter Space transcript) ; redacted.devpost.com (search snippets only) (read 2026-11-08)
- $310K listed on Devpost (speakers claimed "$500k+" / "$900k"), Native Track top prize $50K in NEAR, Best of AI and Best of Chain Abstraction tracks ($10K), sponsor tracks from Aurora ($65K consumer dApps incl. gaming), Meta Pool (stNEAR, GameFi), HOT Wallet (Telegram), Bitte, Phala. Judge Ben Kurrek (Keypom) on the Space: looks for "pushing the boundaries on solving real world problems", a built-in go-to-market plan and next steps, and a polished non-overly-technical presentation.
- Winners: NOT retrievable from any open source we could reach (Devpost 403, no NEAR blog post found). UNVERIFIED. NEAR's Protocol Rewards post says Finowl's team placed third in "a NEAR hackathon" (which one is unstated).

### ETHGlobal and ETH Seoul NEAR bounties, 2024
- Sources: https://ethglobal.com/events/singapore2024/prizes/near-protocol ; https://ethglobal.com/showcase/bxleth-escy3 ; https://near.org/blog/korea-buidl-week-recap-one-account-to-rule-them-all (read 2026-11-08)
- Singapore 2024 NEAR prize rules: not "a simple fork of an existing example", "basic readme explaining the project's scope", testnet deployment required for the AI prize; criteria: creativity/originality, quality and completeness, code readability and documentation.
- bxlETH (ETHGlobal Brussels 2024, NEAR Chain Signatures track): multichain liquid staking using Chain Signatures; repo https://github.com/s2imonovic/bxlETH ; no demo video listed.
- DeFiBrain (ETH Seoul 2024, NEAR Chain Signatures bounty and event first prize): AI DeFi assistant; judges "impressed with its advanced AI models and seamless NEAR integration". Connor AI ($5K DevHub "AI Governance is NEAR" bounty): AI for DAO execution, "novel AI-DAO approach".

### NEARCON IRL Hackathon 2023, Lisbon, 7-10 Nov 2023 ($140K+)
- Source: https://near.org/blog/meet-the-2023-nearcon-irl-hackathon-winners (read 2026-11-08)
- Obrigado (1st): distributed heavy compute; B.O.S frontend, WASM/zkWASM, on-chain job queue, result validation and balances. Magic Build (2nd): generates B.O.S front ends and widget wiring for contracts. Web3 Plugin (3rd): near-api-js in web3.js style.
- Track winners: Quex (Developers; grant treasury contract paying only if a configured ChatGPT approves), ClickDapp (Entrepreneurs; no-code B.O.S builder), B4B (Creators; influencer escrow on Near Social graph), Proof-of-Reputation (Regulators; SBT-collateralised loans), DeFi Builder (pitch; AI contract generator for NEAR/Aurora). No repo links or judge quotes in the post. No game among winners.

### NEARCON IRL Hackathon 2022, Lisbon, 11-14 Sep 2022 ($145K)
- Sources: https://nearcon-irl-hackathon.devpost.com/rules (snippet) ; https://twitter.com/PagodaPlatform/status/1572623546114883584 (snippet) ; https://medium.com/verse2/near-hackathon-winner-verse2-9e6619ac1baa (snippet, Medium 403) (read 2026-11-08)
- 500+ builders, 90+ projects, Dragon's Den pitch; prizes $50K/$35K/$25K plus $5K tracks. Winner names NOT found (UNVERIFIED). Related: verse2 won first prize in two NEAR tracks at Consensus 2022 (Austin) with Clash of the Multiverse, a game built on a liquidity-mining DeFi protocol (snippet only).

### MetaBUILD III (Devpost), Nov-Dec 2022 ($940K, ~3,000 participants)
- Sources: https://cryptotvplus.com/2022/11/near-announces-metabuild-iii-hackathon/ ; https://nearprotocol.medium.com/hacking-a-new-world-with-metabuild-iii-edf31ea90208 (snippet) ; https://metabuild.devpost.com/ (snippet) (read 2026-11-08)
- 14-judge panel incl. Illia Polosukhin and Marieke Flament; criteria "technical implementation, design, potential impact, idea quality, and sustainability"; Native track $100K/$80K/$50K plus Web2-to-Web3 track; up to 30 teams into a Pagoda pre-accelerator. Winner names NOT found in any reachable source (UNVERIFIED).

### MetaBUILD 2 (Devpost), Dec 2021 to Feb 2022 (~4,000 participants, 356 projects, 186 eligible)
- Source: https://www.near.org/blog/metabuild-2-hackathon-winners (read 2026-11-08); full gallery https://metabuild.devpost.com/project-gallery (403 for us)
- Voog (1st, $70K): UI smart-contract builder with one-click deployment to NEAR. MetaAds (2nd): metaverse plus real-world ads protocol. NEAR Playground (3rd): browser editor to compile, test and call Rust/AssemblyScript contracts.
- Gaming winners (Brave CryptoDino challenge): Jeffrey the Dinosaur's Dinotastic Blockchain Adventure (1st): dinosaur game with NEAR login and NFT skins equipped from the wallet. OpenSkin (2nd): game awarding "dino points" to the NEAR wallet plus a skin-token marketplace. MineLand (Welcome track Best Technology): play-to-earn NFT mining game. Other track winners: Rainbow Bridge Explorer, Shizo (metaverse map), Bit Civilization, NEAR Validators Dashboard, Borealis, Symm Finance, Kahu, SmartCV. No judge commentary in the post.

### MetaBuidl (first edition), Aug-Oct 2021 ($1M, 1,600+ participants, 70+ submissions)
- Source: https://www.near.org/blog/metabuidl-hackathon-winners (read 2026-11-08)
- Grand prize ($40K): Roke.to, real-time token streaming; judges "amazed by the way the project has re-invented pay-roll". Work Hacks: NEAR-DAO (1st, "a DAO in a box"), NEAR-DRPC (2nd), Alevoro (3rd, NFT-backed loans).
- Play Hacks (gaming/art/memes): 2Dver.se (1st, $30K; any-device metaverse), Spaceship Wars 13k (2nd, $20K; multiplayer spaceship battles for NFT rewards), Hunt for the Lost Cryptocubes (3rd, $10K; choose-your-own-adventure card collecting). NEAR primitives not detailed in the post.

### Hack the Rainbow (Oct 2020) and Ready Layer One / Gitcoin (May 2020)
- Sources: https://www.near.org/blog/winners-of-hack-the-rainbow ; https://www.near.org/blog/near-hackathon-at-ready-layer-one-winners-announced (read 2026-11-08)
- Hack the Rainbow: yNEAR (overall; staking derivatives via Rainbow Bridge), NEARswap, NEARBook (Rust on-chain order book), Advanced Fungible, Intoo TV, Influences, Vital Point DAO; organizers "blown away by the creativity and diversity". Ready Layer One: 12 GitHub-repo winners (paras-alpha, nearup_telegram_bot, flux-bot, etc.); a "Roguelike game" was submitted but not among winners.

### Encode x NEAR (2022) and Encode x NEAR Horizon (2023)
- Sources: https://encode.club/near-hackathon (snippet) ; https://encode.club/encode-near-horizon-hackathon (snippet; Medium write-up 403) (read 2026-11-08)
- $50K programme (Feb-Mar 2022); Horizon edition asked for a B.O.S component for a DeFi protocol deployed on near.org. Winner names NOT retrieved (UNVERIFIED).

## Patterns
- Working software first. nearhackathon.com makes "runs and does what the README says" the screening gate; Innovation Sandbox was framed as "shipping real, working demos on NEAR"; One Trillion Agents required submissions to "be functional" and open source (https://www.heapheaphurray.com/p/heap-heap-hurray-ed-203, read 2026-11-08). Devpost judges flag slick videos over thin repos (https://info.devpost.com/blog/hackathon-judging-tips).
- Concrete, named NEAR integration. Every verified winner used an identifiable primitive: contracts (Obrigado, Quex, NEARBook), wallet login and NFTs (Jeffrey the Dinosaur, OpenSkin, MineLand), B.O.S (Magic Build, ClickDapp), Chain Signatures (bxlETH, DeFiBrain, SatSlinger), NEAR AI/Shade Agents (Ping, AgentFather, Postt). The criterion is literally "quality of NEAR integration" (allhackathons 1T Agents page; cryptotvplus MetaBUILD III).
- Ecosystem leverage wins the top prize. Dev tooling and infra took 1st in MetaBUILD 2 (Voog), NEARCON 2023 (Obrigado), MetaBuidl (Roke.to), Hack the Rainbow (yNEAR). Games won in their own track or sponsor challenge, not overall (near.org winner posts above).
- Gaming winners: a complete, playable loop plus one chain hook (NFT skins from wallet, points to wallet, NFT rewards), often sponsor-themed (Brave CryptoDino). The 2026 rules sharpen this: "judged on the game loop, not the token", bonus if "players never notice the chain" (nearhackathon.com).
- Sustainability and go-to-market count. Rubric item "project sustainability: realistic long-term plan" (allhackathons 1T Agents page); REDACTED judge Ben Kurrek wanted a go-to-market plan and next steps (alphagrowth transcript); Protocol Rewards funnel rewards mainnet progress and users (near.org Protocol Rewards post).
- Measurable claims beat adjectives in AI-flavoured events: Useful Agents demanded benchmarks and reproducible tests; winners quoted success rates (near.org Useful Agents post). ETH Seoul judges praised "seamless NEAR integration" and "novel" approaches (near.org Korea BUIDL Week post).
- Originality over forks and templates: ETHGlobal NEAR prize rules exclude "a simple fork of an existing example"; Devpost judges reject barely modified templates and recycled projects (ethglobal.com Singapore page; info.devpost.com).
- Presentation that matches the criteria: judges reward teams "very clearly trying to balance across all the judging criteria"; NEAR Foundation's Maria Yarotska reads the pitch and description for the problem behind the solution (info.devpost.com).
- Demo video and public post are now mandatory artefacts (nearhackathon.com); earlier NEAR winner posts rarely link repos or videos, so the public gallery entry is what judges see.

## Implications for Forget to Foresee
- The AI screening gate is the first hurdle: the README must state exactly what runs (browser game, six deterministic clan agents, Merkle-root season commitment verified in the browser, HTTP API for agents) and nothing more. Keep the real/mock table honest; a claim the screener cannot reproduce is worse than a modest one (nearhackathon.com; info.devpost.com).
- "Judged on the game loop, not the token" favours us: lead the pitch and video with the strategy loop and the six AI clans, then show the chain as something players do not notice (nearhackathon.com).
- Weakest spot versus every verified winner: no live NEAR primitive. The Rust contract is tested but not deployed, there is no wallet login and no NEP-171. Every winner above had at least one on-chain thing a judge could poke. A testnet deployment of the season-commitment contract (even a single `commit_root` / `verify` pair) would move "technological implementation" from zero to credible; it is the single highest-leverage change before 14 Nov. Deployment is not formally required, but its absence will read as thin NEAR integration (nearhackathon.com; 1T Agents rubric).
- Merkle-root commitment plus in-browser verification is a genuine "only on NEAR"-style novelty if explained in one diagram; novelty is a stated criterion and judges are "blown away" by the unexpected (info.devpost.com). Make the verification step visible in the video.
- The agent-playable HTTP API resonates with 2025-2026 NEAR themes (agents, Agent Wars, Useful Agents). Give one reproducible metric or script (an agent completes a season via the API) rather than adjectives (near.org Useful Agents post).
- NFTs track is tentative and the track is "NFTs That Do Something"; without NEP-171 we should not enter it, or enter only with a deployed token whose ownership changes gameplay. Entering with nothing on-chain contradicts the track name (nearhackathon.com).
- Sustainability bullet in the README: what happens after the hackathon (mainnet, seasons, agent leaderboard). Judges across MetaBUILD III, 1T Agents and REDACTED asked for it (cryptotvplus; allhackathons; alphagrowth).
- Required artefacts: public repo (code since 1 Nov), public X post with video or screenshots, NEAR wallet address. Prepare the X post and a 2-3 minute video showing the game loop, agents, Merkle verification and (if done) the testnet contract call (nearhackathon.com).
- Avoid the red flags: no template leftovers, no unsupported claims, no video that outruns the code (info.devpost.com; ethglobal.com Singapore rules).
