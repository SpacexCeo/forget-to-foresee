# Judging an agent economy: legibility, memory and consequence, evolving without a patch

Read on 2026-11-08 (UTC). Juror notes feeding `docs/jury/rubric.md`.

## Summary for the rubric
- Legibility is a presentation property: "If the AI didn't say it, it didn't happen" (Orkin). Every agent decision must surface as a bark, tooltip or log line, or the judge cannot score it.
- The Halo test for an agent: an "untrained observer" can guess its internal state from what is visible (Isla). State plus stated intent plus visible consequence plus cited memory is the four-part readability contract.
- Emergence from few rules is the norm (F.E.A.R. flanking was a side effect of cover search); the judge's question is not "is it emergent" but "can I trace the causal chain" (Smith and Smith's "network of causal events").
- "Evolves without a dev patch" is evidenced the way CCP evidences EVE: time series of supply, velocity, sinks and faucets, price indices, with changes attributed to in-world events, not to balance edits.
- The ABM convention is the right evidence standard: many seeds, trajectory bands, a readable model description (ODD, or the exemplar's "price rules in one file"). Same curve every seed means scripted.
- Inequality (Gini, Lorenz) over the season is the one-number signal of a market that redistributes; a flat Gini means no real trade (Sugarscape).
- Memory counts only when it is cited back (Nemesis scars and taunts); reputation counts when it is spendable (Qud's water ritual, secrets as "social currency").
- LLM agents score on believability but not reproducibility (Generative Agents critique, Project Sid "preliminary"); deterministic heuristics with personalities lose surface richness but gain seed replay and auditability, which this track rewards.
- Token-first agent economies have been exposed as "chatbots with a meme coin bolted on"; this track's "judged on the game loop, not the token" means in-game trade data beats any price chart.
- Pacing matters for legibility: a collapse should be slow enough to read (Sylvester "drag it out"); a fast-forward that compresses a season into a minute must still let the judge see the inflection.

## Findings
### NEAR hackathon exemplar prompt, tracks/09-games.md
- Source: https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/09-games.md (read 2026-11-08)
- Merchants are agents, each with its own wallet and inventory; prices come from stock and recent demand, so flooding a good drives its price down; a merchant out of funds closes until someone invests.
- Asks that a merchant's reasoning appear in a tooltip, that all pricing logic sit in a single readable file, and for a fast-forward mode that compresses a week of trading into about a minute "so judges can watch the economy change".
- "Judges score the game loop"; bonus if players never notice the blockchain; the economy should keep evolving without a developer patch; the designer must first map player actions at 30 s, 5 min and per-session timescales.

### Damian Isla, "Handling Complexity in the Halo 2 AI" (GDC 2005)
- Source: https://www.gamedeveloper.com/programming/gdc-2005-proceeding-handling-complexity-in-the-i-halo-2-i-ai (read 2026-11-08)
- Transparency criterion: "it must be possible for the untrained observer to make reasonable guesses as to the AI's internal state."
- Coherence: AI must "start, stop and change actions at appropriate times"; avoid "dithering". Badly handled complexity reads as "random" rather than "intentionally" acting.
- Purpose of AI is to "facilitate the on-going narrative that is taking place in our player's head"; the player should be able to "respond to and predict that creature's actions".
- Judge reading: an agent whose next move a newcomer can guess from visible state is legible; one that flips without cause reads as noise, even if it is "smart".

### Bungie, "The Illusion of Intelligence" (GDC 2002, Butcher and Griesemer)
- Source: https://www.jmeiners.com/shamans/papers/ai/the_illusion_of_intelligence.pdf (read 2026-11-08, via search summary)
- Lists "communication of intent" as a technical goal next to an individual knowledge model and unpredictability; the talk is about how design ideas translate into what the player experiences.
- Isla, "Abandoning subtlety" (https://www.gamedeveloper.com/programming/abandoning-subtlety-to-create-immersive-ai-encounters, read 2026-11-08): "subtlety flies straight over the player's head"; to make a hierarchy readable mid-fight you "really have to crank it to 11"; Grunts fleeing worked because "the fleeing animation is way over-the-top".
- Judge reading: a legible agent exaggerates its state changes (colour, icon, line of dialogue) rather than hiding them in a number.

### Jeff Orkin, F.E.A.R. AI: planning plus "If the AI didn't say it, it didn't happen"
- Source: https://gdcvault.com/play/1013394/Three-States-and-a-Plan and https://www.oreilly.com/library/view/game-ai-pro/9781482254792/K23980_C002.xhtml (read 2026-11-08)
- GDC 2006 paper (https://pages.cs.wisc.edu/~dyer/cs540/handouts/gdc2006_orkin_jeff_fear.pdf, read 2026-11-08): "we actually did not have any complex squad behaviors at all in F.E.A.R."; flanking "is just a side effect of moving to the only available valid cover".
- Squad behaviours are pointless "if in the end the coordination of the A.I. is not apparent to the player."
- "Having A.I. speak to each other allows us to cue the player in to the fact that the coordination is intentional."
- Game AI Pro chapter: "If the AI didn't say it, it didn't happen." Orkin elsewhere: "We wanted the AI to constantly communicate what it was thinking".
- Judge reading: emergence from simple rules is normal and good; what separates it from noise is the agent announcing its intent. A decision that is not surfaced in a bark, tooltip or log does not exist for the judge.

### Chris Hoge, "Helping Players Hate (or Love) Their Nemesis" (GDC 2018)
- Source: https://www.gdcvault.com/play/1025150/Helping-Players-Hate-or-Love (read 2026-11-08)
- Nemesis design goal: "Orcs that you loved to hate and Orcs you hated to love"; "maximizing players' positive and negative emotions" via "powerful long-term relationships".
- Focus areas: Orcs that are personal and persistent across sessions, exceptional stand-out moments, and sustaining the relationship over the whole game.
- Coverage of Shadow of War: Monolith expanded "the amount of A.I. and history and memories and stories that they're tracking" (https://gameinformer.com/games/middle-earth_shadow_of_war/b/playstation4/archive/2017/03/12/six-big-takeaways-from-seeing-middle-earth-shadow-of-war-in-action, read 2026-11-08).
- Judge reading: memory is only legible when the agent cites the remembered event back at the player (scars, taunts). A memory field in state that never surfaces is invisible.

### Tynan Sylvester on RimWorld as a story generator
- Source: https://www.gamedeveloper.com/design/how-i-rimworld-i-fleshes-out-the-i-dwarf-fortress-i-formula (read 2026-11-08)
- "The real engine of story is the gameplay systems themselves"; conflicts between game and story generator are resolved for the story generator.
- On readability: Dwarf Fortress "leaves the player's mind to imagine the story from scratch"; RimWorld "shows enough that it constrains the imagination a little bit."
- Storyteller pacing is dramatic, not fair: "The storyteller eases off when the colony population drops." and "The process of losing is very dramatic, and I want to drag it out".
- Judge reading: show just enough state for the player to build a story, and pace a season so that collapse is slow enough to be read.

### Clint Hocking on emergent narrative and intentionality (GDC 2005, 2006, 2009)
- Source: https://laundrysessions.blogspot.com/2005/03/gdc-2005-clint-hocking-on-narrative.html and https://clicknothing.com/2006/04/01/intentionality_ (read 2026-11-08)
- Four narrative types: emergent, embedded, strong procedural, weak procedural. "Emergent narrative comes from the difference in what a player tells himself will happen and what actually happens."
- Intentionality (GDC 2006, 2009 "Fault Tolerance") is the player's capacity to set goals and plan toward them inside the systems.
- Judge reading: a living economy must let the judge form an expectation (from visible rules) and then surprise them within those rules; a scripted one either never surprises or surprises without a traceable cause.

### Warren Spector, "Go Emergent: Game Design Is Not All About You"
- Source: https://www.gamedeveloper.com/design/spector-go-emergent---game-design-is-not-all-about-you (read 2026-11-08)
- Spector's favourite definition of emergence: "engines of perpetual novelty"; designers "bound the player experience" but "you don't determine the player experience"; "Plans must be devised by the player".
- Randy Smith: "less pre-scripted agenda", "anything can happen", players share authorship. Harvey and Randy Smith's 2004 diagram shows emergent systems as "a network of causal events" (https://gangles.ca/?p=465, read 2026-11-08).
- Judge reading: ask for the causal chain, not the outcome. If the team can point to rule A causing state B causing agent action C, it is systemic.

### Caves of Qud: factions, reputation as currency, generated history
- Source: https://pcgworkshop.com/archive/grinblat2017subverting.pdf and https://rpgcodex.net/content.php?id=12491 (read 2026-11-08)
- Reputation is tradeable: the water ritual lets the player spend faction standing "like currency" to buy information, skills or allies; killing a bonded creature costs standing with all factions.
- Grinblat, Narrascope 2020 (https://2021.narrascope.org/morefiles/CavesOfQud-ADecadeOfWorldbuilding-JasonGrinblat-Narrascope2020.pdf, read 2026-11-08): generated worlds yield "a catalog of in-game secrets" that "cannot be looked up in a wiki"; "We realized we could expose these secrets to players and turn them into a form of social currency."
- Grinblat and Bucklew (2017) describe Qud as a hybrid of handcrafted and procedural systems that does not try to "explicitly simulate historical logic".
- Judge reading: a reputation ledger that moves on the player's acts and is spendable is a legible social economy; a fixed opinion number that only gates dialogue is not.

### EVE Online Monthly Economic Report (CCP), September and October 2025
- Source: https://www.eveonline.com/news/view/monthly-economic-report-october-2025 and https://www.eveonline.com/news/view/monthly-economic-report-september-2025 (read 2026-11-08)
- Standard plots: money supply, money velocity, sinks and faucets, top sinks/faucets history, price indices (consumer, mineral, producer), production/destruction/mining by region, plus a zip of all raw CSV data.
- Trend language a judge can copy: "Money supply has stopped falling. However ISK velocity continues its downward trend over the last ~6 months." and "MPI continues to fall."
- CCP flags its own data problems ("there's a discrepancy between 9_sinks_and_faucets and 9b_money_supply.png"); a third-party blog found the end-of-month supply figure stale for three months (https://nosygamer.blogspot.com/2025/12/eve-onlines-november-2025-monthly.html, read 2026-11-08).
- Judge reading: an evolving economy is evidenced by time series that move for in-world reasons (an event, a war) and by the publisher admitting anomalies, not by a hand-edited balance table.

### Lehdonvirta and Castronova, Virtual Economies: Design and Analysis (MIT Press 2014)
- Source: https://www.antoinebuteau.com/virtual-economies-book-summary/ (reading notes, read 2026-11-08); catalogue https://libcat.library.tamu.edu/Record/in00004602830/Description
- Faucets "generate assets", sinks "remove assets from the economy to enforce repeat purchases and maintain scarcity"; "When faucet inflow exceeds sink outflow, inflation occurs."
- "The main goal is price stability"; evaluate sinks on efficacy, adjustability and user acceptance; the most effective sinks are often the least accepted.
- Data to collect: money supply per capita, faucet and sink flows, supply/demand response, activity rates, unused capacity, and disinvestment as "a leading indicator of churn".
- Judge reading: a season log that can be reduced to faucet total, sink total, supply and a price index is auditable; one that only shows wallet balances is not.

### Epstein and Axtell, Sugarscape wealth distribution (NetLogo replication)
- Source: https://ccl.northwestern.edu/netlogo/models/Sugarscape3WealthDistribution (read 2026-11-08)
- Simple local rules produce a skewed distribution: "there are many more agents with low wealth than agents with high wealth"; shown with a Lorenz curve and a Gini index plotted over time.
- A review of the book notes the imbalance emerges "even without direct competition for the resource, such as war or trade" (https://people.duke.edu/~ng46/cv-pubs/97compma.htm, read 2026-11-08).
- Judge reading: Gini over time is the standard one-number summary of whether an agent economy concentrates or spreads wealth; a flat Gini across a season suggests scripting or no real trade.

### Schelling segregation and ABM replication practice
- Source: https://jasss.org/15/1/6.html and https://forum.comses.net/t/the-informational-assumptions-of-schelling-segregation-an-agent-based-decomposition-of-cue-inference-cultural-schemas-and-residential-sorting/10991 (read 2026-11-08)
- Schelling shows "how individual incentives and individual perceptions of difference can lead collectively to segregation": macro pattern from micro rules none of which encode the pattern.
- Convention for evidence: Monte Carlo replications "under widely varying assumptions"; a recent sweep reports "14,400 runs, 7-parameter grid, 20 replicates per cell" with paired seeds.
- Counter-intuitive results are the signature of emergence: "Intolerance does not Necessarily Lead to Segregation" (https://ifmas.csc.liv.ac.uk/Proceedings/aamas2018/pdfs/p1889.pdf, read 2026-11-08).
- Judge reading: ask for outcome spread across seeds. A scripted economy yields the same trajectory every seed; a living one yields a band with a clear central tendency.

### ODD protocol and ABM reporting standards
- Source: https://www.usgs.gov/publications/odd-protocol-describing-agent-based-and-other-simulation-models-a-second-update and https://econpapers.repec.org/RePEc:jas:jasssj:2019-147-2 (read 2026-11-08)
- ODD (Overview, Design concepts, Details) is the standard model description, built so that others can reimplement the model; the 2020 update targets missing details that "hinder reimplementation".
- Because ABMs are stochastic, each parameter setting is run repeatedly with different seeds; STRESS gives a 20-item reporting checklist for ABMs.
- Judge reading: "price rules in one readable file" is the game-sized ODD. If the file plus seed reproduces the log, the economy is auditable.

### Park et al., Generative Agents (2023) and its critique
- Source: https://arxiv.org/abs/2304.03442 and https://prereview.org/reviews/17993733 (read 2026-11-08)
- Architecture: observation memory, reflection, planning; ablations show each component raises rated believability; agents "sometimes failed to retrieve the right instances" but rarely fabricated.
- Evaluation was interviews ranked by humans; the PREreview calls it "largely qualitative and subjective" with limited quantitative believability or robustness measures.
- Judge reading: LLM agents score on believability, but believability is not reproducibility. For a hackathon judge, a replayable seed beats a convincing paragraph.

### Altera, Project Sid (2024)
- Source: https://arxiv.org/abs/2411.00114 (read 2026-11-08)
- Reports 10 to 1000+ agents in Minecraft "autonomously developing specialized roles, adhering to and changing collective rules" and "cultural and religious transmission"; results described as "preliminary".
- Press coverage adds a 30-agent village with emeralds as currency and a taxation system (https://www.tomshardware.com/tech-industry/artificial-intelligence/ai-created-a-minecraft-ai-village-with-up-to-1-000-inhabitants-project-sid-sees-ai-bots-implement-a-taxation-system-and-spread-pastafarianism-religion, read 2026-11-08). No independent replication found.
- Judge reading: headline emergence claims without seeds, run counts or logs cannot be distinguished from prompt-induced behaviour; treat as unverified.

### a16z AI Town
- Source: https://stack.convex.dev/ai-town-v2 and https://www.cognitiverevolution.ai/why-a16z-built-a-town-for-ai-people/ (read 2026-11-08)
- Open-source generative-agent town on Convex, "drawing inspiration from research on generative agents"; a single shared runtime handles LLM calls.
- No source found evaluating whether agent behaviour is varied or canned; the project is a platform, not an evaluated economy.

### NEAR Shade Agents
- Source: https://docs.near.org/ai/introduction (read 2026-11-08)
- "verifiable agents that can control accounts across multiple blockchains" using Chain Signatures and TEEs; "any instance of the agent with the same code can access the same accounts".
- Judge reading: "NPCs with wallets" on NEAR has a concrete meaning (an account the agent signs for); a judge can ask whether the NPC wallet is a real account, a testnet account, or a label in game state.

### Castronova, "Virtual Worlds: A First-Hand Account of Market and Society on the Cyberian Frontier" (2001) and Synthetic Worlds (2005)
- Source: https://www.cesifo.org/DocDL/cesifo_wp752.pdf and https://spectrum.ieee.org/virtual-economies-and-the-real-things (read 2026-11-08)
- Treated EverQuest's Norrath as a national economy with statistics on "production, labor supply, income, inflation, foreign trade, and currency exchange"; GNP per capita placed between Russia and Bulgaria; "extreme inequality, yet life there is quite attractive".
- Judge reading: the moment an economy can be reported in national-accounts terms (output, money, prices, inequality) it is an economy a judge can audit; the exemplar's "fast-forward week" is a request for exactly that report.

### Ramin Shokrizade on supremacy goods and economy balance
- Source: https://www.gamedeveloper.com/business/next-generation-monetization-supremacy-goods and https://www.gamedeveloper.com/business/the-top-f2p-monetization-tricks (read 2026-11-08)
- "Supremacy goods" are items "which confer unassailable advantages on certain players"; his F2P pieces catalogue the methods used "to trick consumers into spending".
- Judge reading: for a games-track entry, check that no asset (or memory shard) is a supremacy good that ends price discovery; a healthy market keeps every good contestable.

### Chris Crawford, "Process Intensity" (1987) and Interactive Storytelling
- Source: https://www.erasmatazz.com/library/the-journal-of-computer/jcgd-volume-1/process-intensity.html and https://erasmatazz.com/library/my-books/chris-crawford-on-interacti.html (read 2026-11-08)
- Defines the "crunch per bit ratio": operations per datum; games "boast the highest crunch per bit ratios in the computing world"; of a scripted laserdisc game, "its crunch per bit ratio stank."
- His storytelling method centres on verbs, "inclination formulae" and personality models that let characters react; the design question is "What does the user DO?"
- Judge reading: a scripted economy is data-intensive (tables of outcomes); a living one is process-intensive (few rules, many states). Ask to see the rules file and count rules versus hand-authored outcomes.

### LLM NPCs versus deterministic heuristics: nondeterminism and evaluation
- Source: https://arxiv.org/html/2510.25820v1 and https://eudl.eu/pdf/10.4108/eai.22-5-2026.2365234 (read 2026-11-08)
- Scripted NPCs "may feel limited, but they are stable"; LLM NPCs bring "character inconsistency, narrative drift, and less control". A 2025 study found structured prompts "improved interviewer consistency but reduced the two suspects' believability".
- Serious-games paper: "there are not defined standardized methods for evaluating complex language behavior"; evaluation relies on LLM-as-judge plus human checks.
- Judge reading: deterministic heuristics with personality parameters give seed-reproducible logs and a readable rules file, which the exemplar prompt explicitly asks for; LLM agents trade that for surface richness.

### Crypto agent economies: Virtuals Protocol and Parallel Colony
- Source: https://cointelegraph.com/news/ai-agents-memecoins-investments, https://decrypt.co/309495/virtuals-protocol-revenue-crashes-as-ai-agent-demand-sinks and https://decrypt.co/221992/parallel-creator-colony-ai-game-solana-prime-all-time-high-price (read 2026-11-08)
- Investor critique: "It's 90% chatbots with a meme coin bolted on"; many are "Wizard of Oz" agents with humans behind them; Virtuals daily income fell at least 96% from its January peak amid "thin liquidity, unproven utility, oversupply of tokens".
- Parallel Colony: agents "may not always obey user suggestions" (developer claim); players pay LLM fees; no independent hands-on critique found; Bankless frames it as a "deflationary sink for the PRIME token".
- Judge reading: token-first agent projects are judged by their token charts, not their loops. The NEAR track's "judged on the game loop, not the token" is a direct response; the evidence that counts is in-game trade data, not price.

### Crusader Kings 3: traits, stress and opinion as readable AI reasons
- Source: https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-58-stre-ss-tching-the-traits.1472092 and https://steamcommunity.com/app/1158310/discussions/0/4348747794020593941 (read 2026-11-08)
- Dev diary: "One of the many pleasures of Crusader Kings is to personify a plethora of characters" through trait combinations; players report the AI "is willing to risk stress to go against its traits" when the target is valuable, using the same stress rule the player has.
- Judge reading: symmetric rules (the AI pays the same costs the player pays) plus visible traits make deviations from personality explainable rather than arbitrary.

## Twelve-question checklist for a living, legible agent economy
1. Can I state each agent's current goal without opening the code, from what the screen shows? (Isla, "untrained observer" criterion, https://www.gamedeveloper.com/programming/gdc-2005-proceeding-handling-complexity-in-the-i-halo-2-i-ai)
2. When an agent acts, does it say why, in one line, at the moment of acting? (Orkin, "If the AI didn't say it, it didn't happen", https://www.oreilly.com/library/view/game-ai-pro/9781482254792/K23980_C002.xhtml)
3. Is the "why" grounded in visible state (stock, demand, trust, tension) that I can check, rather than flavour text? (exemplar prompt: prices from stock and recent demand, tooltip reasoning, https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/09-games.md)
4. Does an agent cite a specific past event back at me (a broken promise, a cheat) when it changes behaviour toward me? (Nemesis memory, https://www.gdcvault.com/play/1025150/Helping-Players-Hate-or-Love)
5. Can I form an expectation from the rules and then be surprised within those rules, with a traceable cause? (Hocking's emergent-narrative gap, https://laundrysessions.blogspot.com/2005/03/gdc-2005-clint-hocking-on-narrative.html)
6. Are all price and decision rules in one readable file, and is the file short relative to the variety of outcomes (process-intensive, not table-driven)? (exemplar prompt; Crawford "crunch per bit", https://www.erasmatazz.com/library/the-journal-of-computer/jcgd-volume-1/process-intensity.html)
7. Does the same seed reproduce the same season log, and do different seeds produce a visibly different but bounded band of outcomes? (ABM replication convention, https://jasss.org/15/1/6.html; ODD, https://www.usgs.gov/publications/odd-protocol-describing-agent-based-and-other-simulation-models-a-second-update)
8. Can I read faucet totals, sink totals, money supply and a price index from the log, and do they move for in-world reasons? (Lehdonvirta and Castronova, https://www.antoinebuteau.com/virtual-economies-book-summary/; CCP MER, https://www.eveonline.com/news/view/monthly-economic-report-october-2025)
9. Does wealth concentration (Gini or a Lorenz curve) change over the season, and does it differ across seeds? (Sugarscape, https://ccl.northwestern.edu/netlogo/models/Sugarscape3WealthDistribution)
10. Are agent wallets real accounts (or at least ledger entries with full history), and do agents pay the same costs the player pays? (NEAR Shade Agents, https://docs.near.org/ai/introduction; CK3 symmetric stress, https://steamcommunity.com/app/1158310/discussions/0/4348747794020593941)
11. Is any social quantity (reputation, trust, memory) itself tradeable or spendable, so that social behaviour has a price? (Qud water ritual and secrets as "social currency", https://2021.narrascope.org/morefiles/CavesOfQud-ADecadeOfWorldbuilding-JasonGrinblat-Narrascope2020.pdf)
12. In fast-forward, can I spot the inflection (crisis, collapse, recovery) and name its cause without pausing, because state changes are exaggerated, not subtle? (Isla "crank it to 11", https://www.gamedeveloper.com/programming/abandoning-subtlety-to-create-immersive-ai-encounters; Sylvester "drag it out", https://www.gamedeveloper.com/design/how-i-rimworld-i-fleshes-out-the-i-dwarf-fortress-i-formula)

Scoring hint: 10 to 12 yes answers is a living, legible economy; 6 to 9 is systemic but under-presented; under 6 is scripted or opaque. Questions 7 to 9 are the "could this have been scripted?" test: a scripted economy fails all three at once.

## Evidence artefacts that convince in two minutes
- A one-screen reasoning tooltip on an agent's move: inputs (stock, demand, trust, tension), the rule that fired, the memory cited. Mirrors the exemplar prompt and Orkin's dialogue principle.
- A season log with one line per agent move in the form "who did what to whom, why, and what changed", exportable as CSV (CCP ships raw CSV with every MER).
- A seed-band plot: 100 to 1000 Monte Carlo seasons, median and 10th to 90th percentile of tension, price index and Gini per trial, with one highlighted seed that matches the live demo. Different seeds, different paths, same rules (Schelling and Sugarscape convention).
- A faucets-and-sinks bar per season and a money-supply or velocity line, with annotations at in-world events (the crisis trial), copying the MER layout a judge may already know.
- A Lorenz curve or Gini line over the season showing wealth concentration moving.
- A replay: same seed, same log, byte-identical, run live in front of the judge (ODD reimplementability made visible).
- The single rules file open in an editor next to the running game, with a change to one coefficient and a rerun showing a different but explainable season ("evolves without a dev patch" means the rules did not change, only the state did; the judge should see that the rules file was not touched during the demo).
- One memory-and-consequence moment: an agent refusing or pricing up because of something the player did earlier, with the earlier log line linked (Nemesis).

## Implications for Forget to Foresee
- The six clans are deterministic heuristics with personalities: this is a strength under this track, not a weakness. Lead with "same seed, same season; 1000 seeds, 1000 seasons" and show the band from `npm run sim` (questions 6, 7).
- The log tab should carry the Orkin line for every clan move: actor, verb, target, the rule or personality trait that fired, and the memory or promise it cites. If a clan move has no stated reason, it fails question 2 regardless of how good the heuristic is.
- Add or surface a per-clan tooltip with the inputs that drove the last decision (stock of words, silk, promises held, trust toward the player, world tension). This is the exemplar's tooltip requirement (question 3).
- Tension is already a legible macro meter. Make the trial-13 Ash crisis visibly caused: the log should show the broken links as Ash's moves with reasons, and the tension jump should be attributable to them (questions 5, 12).
- Memory shards at auction are the game's strongest answer to question 11 (a social quantity with a price). Show the shard's provenance (which memory, forgotten when) and the clearing price history in the economy report.
- The economy report in `docs/math` should present MER-style series per trial: faucet (words created, signs), sink (forgotten memories, broken promises), money supply per clan, a price index for silk and words, and Gini across clans, with a seed band from `sim-results.json` (questions 8, 9).
- Memory and consequence must be cited back: when a clan refuses a trade because the player broke a promise, the refusal text should name the trial and promise. If the clans' memory exists only as state, surface it (question 4).
- Clan wallets: state plainly in the README whether clan balances are NEAR accounts, testnet accounts or ledger entries; the real/mock table must say which (question 10).
- The HTTP API at time-scale 1000 is the fast-forward mode the exemplar asks for; pair it with the seed-band plot so a judge sees one season replayed and the distribution it came from in under a minute.
- "Evolves without a dev patch" claim: the evidence is that the rules file is untouched between seasons while the season trajectories differ by seed and by player choices; say exactly this in the README and never claim evolution from a balance edit.
- Pacing for legibility: in fast-forward, mark the inflection trials (13 and the tension approach to 100) with an exaggerated visual so the judge can see the Shells leaving as a consequence, not as a timer.
