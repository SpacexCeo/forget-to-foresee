# On-chain game design: economy in the loop vs chain as decoration

Read on 2026-11-08 (UTC). Juror notes feeding `docs/jury/rubric.md`.

Method note: every source below was read (or, where marked "snippet", seen only through search-result excerpts because the page blocked fetching) on 2026-11-08. Quotes are verbatim and under 125 characters. Where a claim is one author's opinion rather than documented fact, it is labelled as such.

## Summary for the rubric
- The literature splits web3 games into two families: games that treat the chain as a database for assets ("web2.5", "soft form") and games whose rules, state and randomness live in verifiable form. Only the second family survives the critiques. (BITKRAFT, gubsheep, ludens)
- "Degraded blockchain" (Doucet) is the central critique of decoration: a trustless token given meaning by a trusted, mutable server inherits the server's guarantees, not the chain's.
- The strongest positive test is gubsheep's: if the developer's client disappeared tomorrow, would the game still be playable? Secondary tests: can third parties extend it without permission (Paradigm, BITKRAFT); can nobody unplug it (ludens).
- Dark Forest is the canonical "the chain was needed" case: hidden information plus verifiable moves on a public ledger is impossible without commitments and zk proofs. Hidden-information design remains an open problem (Paradigm).
- Play-to-earn post-mortems converge on one test: if the main token sinks increase earning power, the economy is a transfer from new entrants to old ones (Eliason, Butler, Baschez, Low, Naavik). A game must be fun with the token at zero.
- Verifiable is not trustless: every settled outcome can pass verification while the operator chose which outcomes settle, or chose which seed to commit. Commit-reveal proves the seed was fixed, not that it was fair or that the sequence is unsteerable (0xsoftboi, rishiw, Numex, Zealynx audit).
- Verification that only the operator's tools can run is theatre; the offline third-party test ("no API, no permissions, documented algorithm") is the bar (rishiw; Stacker News "provably fair theatre" on truncated hashes).
- Randomness-free, deterministic, asynchronous designs (Food Chain Magnate pattern) avoid the oracle problem entirely; roguelikes and arcades with immutable scores are the other proven fit (Robinson, Loot Survivor).
- LLM NPCs: critics agree the failure mode is "characters as chatbots" with no weight to their words; what works is constrained, systemic behaviour whose consequences players can read. Agent-with-wallet pitches have not yet produced "new, fun, innovative gameplay" (Dizon, Jan 2026).
- Autonomy has a cost: an immutable ruleset means the dev cannot patch the metagame (Paradigm "metagame stagnation"; Loothero on balancing), so "economy evolves without a dev patch" must be shown, not asserted.

## Findings

### Lars Doucet, "Degraded Blockchains" (thread)
- Source: https://threadreaderapp.com/thread/1427783988739981318.html (read 2026-11-08; thread dated 18 Aug, year not shown on page, context is 2021)
- The chain promises trustlessness, immutability, decentralization; "most services "degrade" these promises in building their service".
- An NFT is immutable, "But all that is given meaning by some app." The app is centralized and mutable, so the token's meaning is not protected.
- "so many solutions to crypto problems seem to always involve skipping over or ignoring the blockchain in some way."
- Juror use: ask what gives the on-chain object its meaning and whether that layer is itself verifiable.

### gubsheep (Brian Gu), "The Strongest Crypto Gaming Thesis"
- Source: https://gubsheep.substack.com/p/the-strongest-crypto-gaming-thesis (read 2026-11-08; published 2021-07-27)
- "Crypto is not an incremental innovation." The case for crypto games is mechanics impossible elsewhere, not ownership or P2E.
- A crypto-native game: "The source of truth for game data is the blockchain." and it is "a transparent data store that is permissionlessly interoperable".
- The test: "if the core-developer-provided client disappeared tomorrow, would the game still be playable?"
- Games that only add a wallet, or are "essentially pure speculation on NFTs", are excluded from the category.

### ludens (Lattice), "The Case for Autonomous Worlds"
- Source: https://aw.network/posts/the-case-for-autonomous-worlds (read 2026-11-08; dated 2023-08-09 on page, first written Aug 2022)
- Autonomous World = "hard diegetic boundaries, formalized introduction rules, and no need for privileged individuals".
- "Worlds with a blockchain substrate are maximally autonomous": the "digital physics are open and transparent" and changeable only by collective agreement.
- "the introduction rule remains objective as well as transparent": anyone can run the rule that adds entities; no admin needed.
- "Nobody can unplug Autonomous Worlds."
- Juror use: who can introduce new canon (events, items, agents) and can a player check that rule?

### Dark Forest team, "Announcing Dark Forest"
- Source: https://blog.zkga.me/announcing-darkforest (read 2026-11-08; published 2020-08-02)
- Problem: "the data layers of most decentralized systems are, by design, completely open and transparent", so hidden information is impossible by default.
- Solution: "With zkSNARKs, players can keep private state while publicly submitting verifiably-valid actions." Players "submit commitments to their planet locations (by hashing the planet coordinates)".
- "This construction introduces a fog of war that can only be uncovered by computation."
- Why the chain was needed: no trusted party to hold the hidden map; the commitment plus proof replaces the referee. Paradigm later notes the drawback: it "devolves into a hardware mining race" (see below).

### Paradigm (Noyes, Feagin), "The Open Problems of Onchain Games"
- Source: https://www.paradigm.xyz/writing/the-open-problems-of-onchain-games (read 2026-11-08; 2023-08-14)
- Why onchain at all: "Players can add mods to onchain games without asking for permission or fragmenting their state." and "sovereign player custody of game assets obviates compliance overhead."
- Hidden information is "a crucial mechanic in many games" and "Existing solutions have unacceptable drawbacks".
- "Bots can't be distinguished from real players, and players can't be guaranteed unique." MEV-style incentives are inescapable in permissionless systems.
- Metagame stagnation: with autonomy the developer cannot steer the meta; "ticking" (tick loops vs async transactions) is another mismatch.

### Will Robinson (Alliance), "Unblocking On-Chain Games, Part Four: Food Chain Magnate"
- Source: https://alliance.xyz/essays/unblocking-on-chain-games-part-four-food-chain-magnate (read 2026-11-08; 2023-03-29)
- "Building on-chain games remains extremely hard." The open problem is finding design patterns that fit the medium.
- Pattern: Food Chain Magnate randomizes only setup; "there is no random chance during gameplay." Therefore "Without the need for fairly generated randomness, the game does not need to pay for outside oracles".
- Async scaling: commit moves simultaneously so "players can move in parallel."
- Juror use: a game that confines randomness to a pre-committed setup and plays deterministically afterwards is following a recognized on-chain pattern.

### BITKRAFT (Vereecke), "The Rise of Fully Onchain Games"
- Source: https://bitkraft.vc/insights/fully-onchain-games-thesis (read 2026-11-08; 2024-06-05)
- Asset-only web3 games are the "soft form": "there is decentralization of ownership, but no decentralization of utility." The dev still decides what the token does.
- FOCGs: "the entire game logic and state 'live' on the blockchain"; "FOCGs live forever and are solely governed by their onchain rulesets."
- Composability in plain terms: "Everyone is able to extend the same game world."

### 1kx (Peter Pan), "Blockchains as Worlds for Fun and Play"
- Source: https://1kx.capital/writing/blockchains-as-worlds-for-fun-and-play (read 2026-11-08; Sept 2024)
- Skeptical of "Games that are incrementally better when using the blockchain as a database."
- The alternative: the chain's physics (contracts, protocol rules) define the world and are permissionlessly moddable; "the experience of participation in the blockchain is the product in itself."
- Opinion piece by a VC; useful for the vocabulary "physics" vs "database".

### Raphael Proust, "Games and blockchains" (critique of Extra Credits 2018)
- Source: https://raphael-proust.github.io/games/games-and-blockchains.html (read 2026-11-08; undated)
- Extra Credits' "Can Blockchain Technology be a Game Mechanic?" (2018) proposed recording MMO feats on-chain. Proust: the idea is good but "it should be implemented, but on a plain, run of the mill, good ol', buzzword-free database."
- "Blockchains are just a terrible match for MMORPGs." because a central server already decides what happened: "This centralised architecture is diametrically opposed to the core principle of blockchains."
- Proposed test: latency tolerant, no central authority over state, players themselves mutate shared state, scarcity-based. "let's instead look at the specific features of blockchains and see what kind of game matches these features."

### Paul Butler, "'Play-to-earn' and Bullshit Jobs"
- Source: https://paulbutler.org/2021/play-to-earn-and-bullshit-jobs/ (read 2026-11-08; 2021-12-28)
- Axie earnings "are essentially a wealth transfer from new players to established ones."; "it appears to just be redistributing the same wealth between Filipinos".
- On grinding by design: "Floors don't have to be swept in the metaverse unless they're designed to need sweeping."
- He finds almost no reviews of Axie as a game rather than as an income stream.

### Nathan Baschez (Every), "Is Axie Infinity a Ponzi Scheme?"
- Source: https://every.to/divinations/is-axie-infinity-a-ponzi-scheme (read 2026-11-08; 2021-12-17)
- "The key is to attract enough inflows from new investors to cover payouts to old investors."
- "In reality, Axie is not a nation. It does not have a functioning economy."; "The day the boss stops handing out paychecks is the day workers stop showing up."
- Test: are players spending to have fun or extracting to pay bills?

### Nat Eliason, "Crypto Gaming is Broken. How Do We Fix It?"
- Source: https://www.nateliason.com/blog/fix-crypto-gaming (read 2026-11-08; 2022-05-13)
- "If all of the main sinks increase people's ability to earn, then the game is unsustainable."
- "it needs to be an actually fun game first."; "If no one wants to play your game when they aren't making money from it, they'll run for the exits".
- Failure pattern: "the internal economy of the game doesn't work without external token activity influencing it"; fix: "The two economies should operate independently."

### Shannon Low, "How to assess sustainable web3 game economies"
- Source: https://shannonlow.substack.com/p/how-to-assess-sustainable-web3-game (read 2026-11-08; 2022-10-07)
- Checklist questions: "Does the game have well-balanced faucets and sinks?"; "Are there enough sinks for players to spend tokens for fun/vanity/progression (not to increase earning potential)?"
- "Is the economy sustained only by new user growth (typical ponzinomics)?"; "Is the token/asset speculation (buy to flip) incentive too strong?"
- Also: is the game fun without earnings, is there a retention plan.

### Naavik, Axie Infinity breakdown and "The Smoke Test" (snippet only)
- Source: https://naavik.co/business-breakdowns/axie-infinity and https://naavik.co/deep-dives/the-smoke-test/ (read 2026-11-08 via search snippets; pages blocked direct fetch)
- Naavik's 2021 conclusion: Axie could grow for a while but "its current economic policies are fundamentally unstable"; Sky Mavis itself wrote "By design the Axie economy will be dependent on new entrants."
- "The Smoke Test": can the economy survive a major drop in growth, "the hallmark of a failing Ponzi-based economy".
- Secondary data (Blockworks, Forkast, snippets): Axie floor fell from about $340 to $6; SLP from about $0.40 to $0.004; scholar earnings below Philippine minimum wage.

### Cornell (Ali, Vidan), "Playing, Earning, Crashing, and Grinding"
- Source: https://bowers.cornell.edu/news-stories/what-crash-play-earn-game-reveals-about-future-web3 (read 2026-11-08; news 2025-09-09; paper in Big Data & Society)
- Scholars and managers formed informal lending hierarchies; after the 2022 crash and $620M hack most players left; remaining players "were aware that the game was a financially risky proposition".
- User base down about 90% from peak; "It's still in operation today, albeit in a far different form."

### Dan Olson, "Line Goes Up" (game-design part, secondary only)
- Source: https://www.nasdaq.com/articles/what-line-goes-up-gets-wrong-and-right-about-nfts and https://gamesbeat.com/this-should-be-the-death-of-nfts/ (read 2026-11-08 via search snippets; video itself not fetched)
- The second half treats Axie and P2E as exploitation: the "game" is a wage-labour front for token inflows. No direct quote verified; use only as a pointer to the primary video.

### 0xsoftboi, "Verifiable isn't trustless: onchain randomness"
- Source: https://0xsoftboi.github.io/blog/verifiable-isnt-trustless-onchain-randomness/ (read 2026-11-08; 2026-06-08)
- "Verifiable means you can check that the rule was followed. Trustless means no party had a lever to pull."
- House-signed deterministic randomness: "every settled game is provably fair, and the set of games that got settled is quietly hand-picked."; "It can't change a game's result — but it never has to settle a game it's going to lose."
- Fix: unpredictable randomness no single party controls, and "anyone can settle, which deletes the selective-participation lever entirely."

### rishiw, "Commit-Reveal Isn't Enough"
- Source: https://dev.to/rishiw/commit-reveal-isnt-enough-designing-provably-fair-systems-that-actually-survive-verification-40nl (read 2026-11-08; Feb 2026)
- "A single-sided commitment only prevents post-hoc manipulation." Attacks it misses: abort-and-retry, selective round publication, precompute-and-discard, who-moves-last.
- Rule: "No party should be able to influence continuation after observing partial entropy."; "The round must commit to a future entropy source before the entropy is published."
- Offline verification test: "Can a third party verify an outcome offline, years later, using only:" published commitments, revealed seeds, documented algorithm. "If verification requires trust, it isn't provably fair."

### Commit-reveal and Merkle-root caveats (vendor docs, audit, forum; snippets)
- Sources: https://numex-greenfield.gitbook.io/numex-docs/technology/reveal-fairness ; https://www.zealynx.io/audits/fair-casino/core-pentest-q1-2026/findings/F-2026-0004 ; https://socket.dev/npm/package/@fairseal/game ; https://stacker.news/items/872037 (read 2026-11-08 via search snippets)
- Numex: a commitment proves the seed was fixed before reveal, not that it was generated with enough randomness; the verifier must trust that the Merkle root "represents the actual pool".
- Zealynx F-2026-0004: server picked seed after seeing client seed; "Verification still passes mathematically, but the provably-fair model is no longer cryptographically binding."
- fairseal: verification "proves internal hash consistency only — it does NOT prove the operator couldn't have chosen a favorable seed."
- Stacker News users called truncated 7-char hashes "provably fair theatre"; another commenter noted a rigged pre-generated sequence can pass every per-round hash check.

### Chainlink VRF case studies (vendor)
- Source: https://chain.link/case-studies/aavegotchi and https://chain.link/case-studies/pooltogether (read 2026-11-08 via search snippets; vendor marketing)
- Motive stated by projects: without provably fair randomness "a developer could potentially "snipe" the rarest NFTs for themselves"; PoolTogether adopted VRF so the team could not influence results.
- Caveat present even in vendor text: provably fair randomness is not favorable odds; the game can still carry a house edge.

### Loot Survivor / Realms, "the emergence of onchain arcades"
- Source: https://thelootherald.substack.com/p/loot-survivor-and-the-emergence-of (read 2026-11-08; 2023-10-20; fan newsletter interviewing the developer)
- Coin-op model: "Mimics traditional arcades: insert a few tokens, and you're in."; 25 LORDS per run, half to top scorers.
- What the chain adds: "scores are immutable and tamper-proof."; others can add leaderboards or filters without touching the core contract; QR "Arcade Accounts" hide wallets from new players.
- Search snippets (Starknet blog) note the developer found that immutability makes post-launch balancing hard; docs show a deterministic mode and an optional VRF mode, so "VRF-backed" should be verified per deployment.

### wighawag / Ronan Sandford, "Infinite Games" (Conquest.eth) (snippet)
- Source: https://medium.com/@wighawag/infinite-games-1aa679e07834 and https://mirror.xyz/ronan.eth/RJCBRt0X8lN3LPU8UQF7rCiZ47oxBFqaFVHJ6Fi00C8 (read 2026-11-08 via search snippets; pages blocked)
- Conquest.eth is pitched as a running "infinite game" anyone can join and build on; the mechanism tolerates many accounts per player rather than pretending to prevent it (compare Paradigm on bots).

### Topology, "What happened to Isaac?"
- Source: https://topology.substack.com/p/what-happened-to-isaac (read 2026-11-08; 2022-12-13)
- Fully on-chain "physics" world had about 13 active alpha players; both rounds ended identically; "Linearity is predictable, and predictability is not engaging."
- Lessons: "Effective iteration = number of iterations x progress made between iterations"; "It is important to hit ground-zero and dogfood/playtest the core game loop with real players as soon as possible."
- Block times broke the planning flow. Juror use: on-chain physics does not rescue a loop that is not fun; immutability slows iteration.

### Paris Buttfield-Addison, "Constraints are the Point"
- Source: https://hey.paris/posts/constraints-are-the-point/ (read 2026-11-08; 2025-03-21)
- "Characters Are Not Chatbots."; "LLM-powered NPCs are boring."
- "the limitations of traditional character dialogue aren't bugs – they're features."; "There's no weight to their words because there are always more words coming."
- Better tools: storylets, saliency systems, constrained reactive behaviour.

### Engadget (Hardawar), "NVIDIA's AI NPCs are a nightmare"
- Source: https://www.engadget.com/gaming/pc/nvidias-ai-npcs-are-a-nightmare-140313701.html (read 2026-11-08; 2025-01-15)
- "Buck sounds like a stilted robot with a slight country accent."; "There's simply nothing compelling about it."; ACE characters read as "cutting corners in the worst way possible".
- The PUBG AI Ally failed basic tasks: "Its responses were akin to what you'd hear from a pre-recorded phone tree."

### RPS roundtable on chatbot NPCs (snippet)
- Source: https://www.rockpapershotgun.com/horrible-boring-and-cheap-experts-pan-new-chatbot-npcs-but-some-leave-room-for-optimism (read 2026-11-08 via search snippets; page blocked)
- Meghna Jayanth on the Nvidia demo: "It's boring". Max Kreminski doubts LLM chatbots make good NPCs; Emily Short notes freedom to talk about anything can be off-putting. Hybrids (LLM sets priorities, conventional logic runs behaviour) are the recurring constructive suggestion.

### BlockchainGamer.biz "Mavens": AI agents in blockchain games, 2026
- Source: https://www.blockchaingamer.biz/?p=41385 (read 2026-11-08; updated 2026-01-19)
- Bull case (Liao, Saga): "2026 is the year agents gain memory, consequence, and economic agency."
- Bear case (Dizon, YGG): "We still haven't seen a good example of new, fun, innovative gameplay using AI agents."; (Barberie, Sequence): "agentic payments aren't ready for primetime."
- Juror use: an agent economy earns credit only when players can see agents' memory and consequence in play, not from the wallet alone.

### Parallel Colony and Virtuals (promotional, snippet)
- Sources: https://www.bankless.com/parallel-colony.md ; https://forkast.news/virtuals-ecosystem-tokenized-agent-revenue-market-dynamics/ (read 2026-11-08 via search snippets)
- Colony: each avatar is an AI agent with its own ERC-6551 wallet transacting in an on-chain economy; coverage is largely sponsored and the game was still "in active development" in the sources found.
- Virtuals: critics compare agent tokens to meme coins; over 21,000 agent tokens launched in one month; revenue questioned as launchpad fees rather than agent work. No independent critique of player legibility was found.

### Raph Koster via Massively OP, "who really owns all the stuff inside your video games" (snippet)
- Source: https://massivelyop.com/2021/10/22/playable-worlds-raph-koster-on-who-really-owns-all-the-stuff-inside-your-video-games/ (read 2026-11-08 via search snippet; page blocked)
- Koster's point as reported: attempts at decentralized ownership turn non-rival digital goods back into rival (Veblen) goods; the NFT is a container pointing at a copy in someone else's database. Koster's sponsored Game Developer piece "Crypto's UX Challenge" (2022) argues designers should hide wallet friction. Rami Ismail's cited thread (PC Gamer) argues even dice cannot carry between games without content work.

## Diagnostic checklist for a web3 game
1. If the developer's client and servers vanished tomorrow, could someone still play with the on-chain state alone? (gubsheep)
2. What gives the on-chain object its meaning, and is that layer verifiable or a trusted mutable server? Where does the guarantee "degrade"? (Doucet)
3. Is game logic on-chain or only asset ownership? Who can change what an asset does? "Decentralization of utility" or only of ownership? (BITKRAFT)
4. Who can introduce new canon (events, items, agents) and is that rule objective, transparent and runnable by anyone? (ludens)
5. Name the mechanic that would be impossible without the chain. If the answer is "ownership" or "a database", a database would do. (gubsheep, Proust, 1kx)
6. Is the game latency tolerant, free of a central authority over state, and mutated by players themselves? (Proust)
7. Where is randomness drawn? Is it confined to pre-committed setup with deterministic play after, or needed mid-game via an oracle? (Robinson, Food Chain Magnate pattern)
8. For committed randomness: who chose the seed, did they see any player input before committing, and could they have generated many candidates and committed the favourable one? (rishiw, Numex, Zealynx, fairseal)
9. Can the operator select which rounds settle or abort after seeing partial entropy? Can anyone trigger settlement? (0xsoftboi)
10. Can a third party verify an outcome offline, years later, with only commitments, reveals and a documented algorithm, with no operator API or client code? (rishiw)
11. Is the verification display honest in form: full hashes, not truncated prefixes; algorithm published; a way to check outside the game's own UI? (Stacker News, rishiw)
12. If verification is advertised, does anyone look? Is there an independent verifier, or is the "Verified" label produced by the same code that could lie? (rishiw, Zealynx)
13. Does the player ever touch the chain unknowingly: hidden gas, hidden wallet, hidden custody? Is friction hidden by design (Arcade Accounts) or by omission? (Loot Survivor, Koster UX)
14. Is the token the game or is the game the game: would anyone play with the token at zero? (Eliason, Baschez)
15. Do the main sinks increase earning power, or do players spend for fun, vanity, progression? (Eliason, Low)
16. Does the economy survive a sharp drop in new entrants, or is value only recycled from newcomers? (Naavik smoke test, Butler, Baschez)
17. Can the game's economy evolve without a developer patch, and what does immutability cost in balancing and metagame freshness? (Paradigm, Loothero, Topology)
18. Does the design pretend to prevent bots and sybils, or does it tolerate them by construction? (Paradigm, Conquest.eth)
19. Can third parties extend the world without permission and without fragmenting state (plugins, alternative clients, leaderboards)? (Paradigm, BITKRAFT, Loot Survivor)
20. For hidden information: how is it kept secret on a public ledger, and what does the solution cost (zk, mining race)? (Dark Forest, Paradigm)
21. For AI NPCs or agents: do they have constraints, memory and consequence the player can observe, or are they chatbots in a costume? (Buttfield-Addison, Engadget, Dizon)
22. For agent economies: can a player read why an agent acted, and does the economy change in ways a player can predict and exploit? (Liao vs Dizon, Mavens 2026)
23. Was the core loop playtested with real players before the chain layer was built, and is the loop fun with the chain switched off? (Topology, Eliason)
24. Does the README or pitch claim anything that is not deployed or running? Do "simulated" and "real" components carry honest labels? (Doucet's degradation applied to claims)

## Implications for Forget to Foresee
- Strongest claim available: pre-generated, Merkle-committed randomness with deterministic play afterwards is the Food Chain Magnate pattern (Robinson) plus a commit-reveal setup. The pitch "the AI cannot secretly decide the outcome" is exactly the Doucet / gubsheep question: who decides meaning. State it as that, not as "on-chain".
- The literature's hardest objection applies directly: a commitment proves the 17-trial sequence was fixed before play, not that it was chosen fairly (Numex, rishiw, fairseal). A juror will ask whether the generator could have sampled many sequences and committed the one it liked. Mitigations the literature names: publish the generator algorithm and seed derivation; derive the seed from entropy the developer does not control (player input committed first, a public beacon such as drand, or NEAR block hashes after the player's commitment); or let the player contribute a seed before the root is formed (double commitment).
- "Verified ✓" rendered by the same browser code that could lie is the theatre case (rishiw, Zealynx). Offer an out-of-band check: the root, the leaf, the proof and the hashing recipe in copyable plain text, plus a one-file standalone verifier or a documented `sha256` command. Show full hashes, never truncated ones (Stacker News).
- The NEAR contract that is not deployed must be labelled as such everywhere (CLAUDE.md real/mock table); undeployed verification is a claim, and the literature treats unverifiable claims as degradation (Doucet). Even deployed, 0xsoftboi's question applies: who can trigger verification and settlement, and can anyone?
- No token and no real money removes the entire play-to-earn failure class (Eliason, Butler, Baschez, Low, Naavik). Say so explicitly: the game passes "is the token the game?" by construction. But the sink/faucet test still applies to silk: are there sinks for fun and progression rather than only accumulation?
- Six deterministic clans trading words, silk, trust and memories are a systemic economy, which is the kind critics prefer over LLM chatbots (Buttfield-Addison, Engadget). Make the determinism legible: show the rule an agent followed, its memory state and the consequence, so a player can predict and exploit the economy (Dizon's "memory, consequence" bar via Liao).
- "Economy evolves without a dev patch" must be shown by evidence: a replay or log where clan behaviour changes across trials from trades alone. Topology and Paradigm warn that deterministic systems become predictable; the forgetting mechanic is the lever that should make trajectories diverge.
- The forgetting-to-foresee mechanic (memory becomes a simulated shard "NFT") is the design novelty; the literature says novelty earns credit only if the chain is needed for it (gubsheep). Be honest that a shard is a game object, not a token, and explain what the commitment adds: the future sign the player sees is provably the one fixed before play.
- Does the player touch the chain unknowingly? Currently no chain is touched at all, which is honest; if the NEAR contract ships, keep wallet friction out of the loop (Loot Survivor Arcade Accounts, Koster UX) and never hide a transaction.
- Fun with the chain switched off: the game is played entirely off-chain today, so the juror can test the loop directly (Topology, Eliason). The commitment layer should be presented as integrity, not as the reason to play.
