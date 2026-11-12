# Live market roadmap (owner, 12 Nov 2026)

Owner's list against the Games track text, recorded as the order of work. Built gradually by the existing workers; no new agent
sessions for it. "Wool" in the source notes reads as **silk**: silk is the one in-game currency (decision of 12 Nov).

## Now: the "live market" bundle (also what carries the ~20k testnet transactions a day)

1. **Trader agents with their own wallet and inventory.** Every trader and clan is its own testnet subaccount under
   `ftf-town.testnet` (`trader-01..20`, `clan-*`), with a function-call key limited to the game contracts, a per-wallet budget cap
   and one global kill switch, and now also an inventory of town items.
2. **Prices from stock and demand.** Flood the market with iron and iron gets cheaper; scarce goods get dearer.
3. **Bankruptcy and investing in a trader.** A trader who runs out of silk closes its stall until someone invests in it. A player
   pledges silk into a closed stall and receives a share of that stall's fees (the pledge/deed layer of `ftf-town`).
6. **The price rules in one readable file**, and a tooltip with the trader's reasoning, e.g. "dear: only 3 iron left and demand
   rose".
7. **Fast mode: a week of trading in a minute**, so the jury can watch the economy move (the city model already does this).
9. **The game loop on paper:** what the player does every 30 seconds, every 5 minutes and per session; one page in the README.

## Next

4. **Items as NEP-245 multi-token**, one contract for every kind of town item (the track asks for it). Memory shards stay NEP-171.

## Only if time remains (gradually)

5. **Social or e-mail login** with no seed phrase, wallet pop-up or gas prompt (guest play without gas exists; social/e-mail login
   does not). Best case: the player never notices the chain.
8. **NEAR Intents.** The word "intents" in the code today means agent intentions in the simulation, not NEAR Intents.

## Who

- 1, 2, 3, 6, 7: the economy worker (TEE/relayer session), after the per-wallet subaccounts.
- 9: the story worker, after the leaderboard.
- 4: the economy worker after the bundle.
- 5, 8: later, owner's call.

## Owner addition (12 Nov evening): quests, monster resources, the resource market, crafting

- **Quests pay silk** for every completed quest (town silk, the one currency).
- **Monsters drop resources** besides chests (e.g. spider silk thread, chitin, ash dust, frost shard); quests ask for them.
- **A resource market**: a player who cannot farm a resource buys it from the town's stalls (the scripted traders stock and sell
  resources at stock/demand prices) or from other players later.
- **Crafting** (later) uses the same resources.
- Who: combat worker = the resource drop table per creature (generalising `game/game/salvage.js`); story worker = quests that ask for
  resources and pay silk; economy worker = resources in the town market (stalls buy and sell them; on chain as NEP-245 items, item 4).

## Batch chest opening (owner, 12 Nov evening): design

- **Player side:** the bag shows "Open 1 / Open 5 / Open all (≤ 10)". One request, then a reveal sequence: the cards flip one by one
  (0.4 s each, tap to skip to the end), then a summary grid sorted by rarity, with "Claim all".
- **Chain side, no contract change:** the deployed `loot-chest` contract keeps `open_chest`; the relayer sends **one transaction with
  up to 10 `open_chest` FunctionCall actions** to `chests.ftf-coordinator.testnet`, signed by the opener key (a function-call key may
  carry several FunctionCall actions to its receiver with zero deposit [VERIFY on testnet with 2 actions first]). Each action draws the
  next deck position, so every opening stays individually verifiable (`tools/verify-chest/verify.mjs`).
- **Limits:** the contract's daily cap (30 per day) and the relayer's per-guest bucket still apply; a batch that would cross the cap is
  cut to what is left and says so.
- **Failure:** if one action fails, the transaction reverts as a whole; the relayer retries once with the remaining count, never
  re-sends a confirmed one (journal by request id), and the client shows only openings read back from the chain.
- **Honest count:** one batch = one transaction with N receipts; Town Pulse and the stats count openings and transactions separately.
- **Who:** the economy/relayer worker (it owns the chest relayer path), after the resource market.
