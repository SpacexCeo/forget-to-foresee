# Silk sources: which silk counts

Silk is the game's one currency (testnet, no value). The game shows **one** silk number everywhere: the silk
**recorded on NEAR** (`ftf-town` `balance_of`). That is what the Gate-Loom can take. Model:
`game/src/net/silk-balance.js` and `silk-core.js` (sprint 6.2).

| Part | Meaning | Where it lives |
|---|---|---|
| **On NEAR** (`onChainC`, the headline) | recorded on `ftf-town.testnet` | the chain |
| **Waiting to be recorded** (`pendingC`) | earned and checked (the verified expedition log), not yet recorded | the relayer's ledger of what it credited (`relayer/data/town-credits/`) |
| **Play silk** (`playC`) | saved in this browser only; it can never open the Gate-Loom | the town ledger in `localStorage` |
| **All silk** (`totalC`) | on NEAR + waiting + play | |

`pendingC = creditable − credited`. `creditable` is what the verified log allows: `creditableMicro` in
`relayer/lib/town-gate.js`. `credited` is what the relayer has recorded so far. `playC = local total − on NEAR −
waiting`.

**Sync** flushes the expedition log, then calls `POST /api/town/gate {credit_only}`. The relayer then calls
`register` and `credit_silk`. It runs by itself at most once a minute while something is waiting, and right before the
portal pays.

## Why the HUD said 128.64 while the portal said 38 (live bug, 13.11)

- The HUD chip showed the town ledger kept in this browser: every silk gain from every source, with two decimals.
- The portal showed the on-chain balance, floored to a whole number (`town-quests.js` `balanceC`, read through
  `GET /api/town/gate`).
- The chain only holds silk the relayer credited from the **verified** log. Kill silk logged at T1 counts only up to
  100 silk. The relayer credits at most 300 silk a guest a day. Wheel and chest silk never enter the log.

So 38 was on NEAR and the remaining 90.64 was waiting or play silk. Now the chip, the tracker and the portal all show
the on-NEAR number with `formatSilkC`. The chip's second line says what is waiting ("+22 waiting") or "Offline". Its
tooltip gives the full breakdown. A failed read keeps the last good number, marked stale, and never shows 0.

## Sources (from `game/src/game/quest-rules.js`, `expedition.js`, `expedition-ledger.js`, `relayer/lib/town-gate.js`)

| Source | Enters the log as | Creditable |
|---|---|---|
| Kill on a scripted hunt | `kill_ticketed`, T2 | **yes** |
| Other kills | `kill_ticketed`, T1 | **capped**: 100 silk in total (`EXPEDITION.killVerifyCapC`) |
| Quest reward | `quest_turned_in`, T2 | **yes** |
| Daily bounty | `bounty_resolved` | **yes** |
| Arrival stipend (10 silk) | `stipend_granted` | **yes** |
| Portal paid | `portal_paid` (negative) | burns on chain (`pay_gate_for`) |
| Chest silk | not in the log (`game-menu.js` grants the town ledger only) | **no**: play silk. The chest contract records the outcome, not a silk credit |
| Wheel silk | not in the log (`game/wheel.js`) | **no**: play silk |
| Dice (planned) | not in the log | **no**: play silk |
| Resource sold to a stall (`POST /api/market/resource`) | not in the log | already **on NEAR**: the stall pays with `trade` on `ftf-town` |
| Player moves (pledge, stall, tournament; `/api/town/act`) | not in the log | spend or earn on NEAR directly |

The relayer also caps credits at 300 silk a guest a day (`FTF_GUEST_CREDIT_DAY`). Silk above that waits for the next
day.
