# Agent rental, level, profile and inventory (owner, 11.11)

**Goal.** In the town the player can hire townsfolk as agents for in-game currency. A hired agent plays on its own (it reads signs and places stakes with the same rules a player has) and brings back a profit or a loss. Expected return is 98% of the stake over many rounds (a 2% town fee is the currency sink). Plus a player level, a profile and an inventory split into On-chain and Off-chain.

## Hard rules
1. In-game currency only, on a **separate town ledger** ("town silk", local, `localStorage`), never `S.silk` in `engine.js`; season parity tests untouched in meaning. No real money, no purchase of currency, no cash-out, no wallet.
2. No casino wording in the UI: no "RTP", "bet", "jackpot", "gamble". Say "hire", "expected return 98% (2% guild fee)", "result". The 98% is shown honestly on the hire card.
3. Outcomes are deterministic from a seed shown on the result card (same seed → same result), drawn from a documented distribution with mean 0.98 × stake; unit-tested over 100 000 rounds (mean within ±0.5%).
4. Every screen: "Local — in-game currency only, no real money."

## Player flow
- Talk to a townsperson (the existing 13): a dialogue option **"Hire me as your agent"** shows their card: name, temperament (cautious / steady / bold → variance, not mean), hire price, rounds, expected return 98%.
- Hire → the agent "works" for N rounds (seconds of real time, or instantly with a short animation); a result card shows rounds, gains/losses, net, seed. One agent per townsperson at a time; up to 3 hired at once.
- Hired agents walk with a small badge; the agent's dialogue changes ("Back with your silk").

## Level and profile
- Level from XP earned by play actions (reading a sign, a verified trial, a forget, a quest step, a finished hire) — local; a level bar in the profile; levels unlock cosmetic titles only (no power, no pay).
- Profile panel: Iris's portrait, level, XP bar, title, stats (signs read, trials verified, memories forgotten, agents hired, net town silk).

## Inventory — two sections
- **On-chain (NEAR testnet, read-only):** items that really exist on testnet — the judge-season memory shards (`ftf-shards.testnet`) and the agent card if minted — each with its token id, owner and explorer link. Nothing is shown here unless the chain read confirms it.
- **Off-chain (this browser):** town silk, season silk, hired-agent contracts, memories, dictionary words, quest items, cosmetics. Clearly labeled local.

## Tests
Ledger never touches engine state; distribution mean/variance; seed reproducibility; one agent per person, max 3; UI strings present in all five locales; On-chain section empty when the RPC check fails.
