# The investor jury: what they publish, what they will ask, how to write the idea field

Read on 2026-11-08 (UTC). Juror notes feeding `docs/jury/rubric.md`. Work in progress: sections are filled as sources are read.

## Summary for the rubric
- (pending)

## Findings
### NEAR Hackathon 2026 landing page: the jury and the form
- Source: https://nearhackathon.com/ (read 2026-11-08)
- Judges listed: Illia Polosukhin (NEAR Protocol), Eddy Lazzarin (a16z crypto), Mert Mumtaz (Helius), Avichal Garg (Electric Capital), Kain Warwick (Synthetix & Infinex), Haseeb Qureshi (Dragonfly), Stepan Gershuni (cyber.Fund). "Claude Code & Codex, Anthropic & OpenAI" are listed as the AI screeners, not as people.
- Page text: "Claude Code & Codex screen every project first: they check that it runs and does what the README says." and "The human judges above make the decisions."
- The form has no field literally named `idea`. The free-text field is "What did you build?" with "20–2,000 characters". Other fields: project name, team lead, email, team size, tracks, NEAR wallet, repository link, demo post link. (This note uses `idea` as the working name for that field.)
- Track one-liners that reveal judging taste: Investment Thesis "Judged on the evidence, not the conviction"; Memecoins With Mechanics "Judged on the mechanic, not the chart"; games "Judged on the game loop, not the token" (see `near-hackathon-rules.md`).

### Electric Capital: About & Methodology (developerreport.com)
- Source: https://developerreport.com/about (read 2026-11-08)
- What Avichal Garg's firm measures is real, original code activity: "We count original code authors as developers"; "Only new code counts towards developer activity"; forks, copied code and bots are removed; only open-source repos count.
- Monthly developers are measured on a 28-day rolling window; "Full-Time" means committing on "10 or more days in a rolling 28 day period"; part-time and one-time segments over 84 days. They prefer precision over recall and call the result "directionally accurate".
- Inference: a juror trained on this data reads a repo the same way: commit cadence over the window, original code vs. templates, and whether anything is live. A single large commit or heavy template use reads as low signal.

### Kain Warwick in Cointelegraph Magazine (Nov 2024)
- Source: https://cointelegraph.com/magazine/crypto-four-years-grow-cant-be-shut-down-kain-warwick-infinex/ (read 2026-11-08; published 2024-11-20)
- Thesis: "It's the Uber model, right? Make it so useful that you can't shut it down." Goal: "bring everyone onchain" within four years.
- UX: passkeys should replace seed phrases; users sign in with familiar logins, not wallets first; non-custodial so "you can still go to the chain and get your assets back."
- Candour about his own mistakes ("The reality is we got it wrong" on Patron pricing). Inference: he rewards teams that name their own gaps.
- Note: the phrase "the chain should disappear" was not found verbatim in any source read today; the documented position is "chain abstraction, passkeys and an effortless UX" (secondary coverage, same search).

### Illia Polosukhin, The Cognitive Revolution podcast (Sep 2025)
- Source: https://www.cognitiverevolution.ai/user-owned-ai-on-chain-training-inference-and-agents-with-nears-illia-polosukhin/ (read 2026-11-08; episode 2025-09-13)
- "we have this concept of what we call user owned AI because you want AI to be yours, not theirs."
- Verification over trust: "you want to verify that what you're interacting with is correct."; "I want actually a mathematical proof at the time of using the system that it is correct."; "Blockchain, because it's a root of trust".
- Agents with funds: a launch agent given $10,000 that "We cannot stop it. We cannot take money back."; "Your bylaws are the prompt of the agent."
- Chain abstraction: NEAR is "abstracting out the blockchain itself from the user experience".
- To builders: "if you're a developer, there's a ton of stuff to contribute and build."; participation framed as "an opportunity to engage in something that's really yours."

### Illia Polosukhin, X post with app ideas for NEAR builders (Oct 2026)
- Source: https://crypto.news/near-co-founder-pitches-ai-pets-private-trading/ (read 2026-11-08; reports an X post of 2026-10-03)
- "Building itself got easier too, so it's really about what to build and how stand out to get distribution."
- His own game-adjacent idea: an "AI Tamagochi", a character represented by an NFT that holds a NEAR balance to pay for its own inference, prompts encoded on-chain, battle arenas later. Also: a private PR-review agent with verifiable execution; escrowed event registration; intents checkout widget.
- Suggested distribution channels: NEARLegion, cross-promotion with other communities, Product Hunt, X.
- Inference: an NFT agent with its own wallet (RAEN Computers' core product) sits directly on this list; Illia will ask whether the game's clans could be such NFTs.

### Illia Polosukhin at Digital Asset Summit, The Block (Oct 2026)
- Source: https://www.theblock.co/news/ecosystems/2026-10-07-nears-illia-polosukhin-sees-shrinking-need-for-centralized-exchanges-as-onchain-tools-expand-417912 (read 2026-11-08; published 2026-10-07)
- "AI is a front-end, blockchain is a back-end"; "agent is a front-end and markets is a back-end."
- Agent Market: tasks in natural language, funds in escrow until the work is verified; NEAR Intents moving to a confidential shard.
- Inference: his mental model for agents is front-end + market back-end + verification; a game whose agents trade in a market and whose outcomes are verified fits the vocabulary.

### Paradigm, "The Open Problems of Onchain Games" (Aug 2023)
- Source: https://www.paradigm.xyz/2023/08/the-open-problems-of-onchain-games (read 2026-11-08)
- Why onchain games at all: composable modding and permissionless open economies; "The model will only get explored by necessity".
- Hidden information is a core mechanic onchain games struggle with; Dark Forest's fog of war "devolves into a hardware mining race".
- Bots cannot be told from humans; composable systems are "inherently financializing"; some games avoid real-money markets because they "aren't fun".
- A pragmatic setpoint: offchain game, onchain assets controlling parts of it.
- Inference: investors who read this ask what the chain does that a server could not, how hidden information is kept fair, and whether the economy stays fun when financialised.

## Ten predicted jury questions
- (pending)

## The `idea` field: template and checklist
- (pending)

## Implications for Forget to Foresee
- (pending)
