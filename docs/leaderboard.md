# The board (Board Season 1)

Status: **testnet, no money, no prizes.** The scoring library and the snapshot tools run; publishing a snapshot and
committing its root on NEAR testnet are owner steps (spec: `docs/plans/story/FTF-Story-Quests-Leaderboard-TZ.md` §8).

A *board season* is not an engine season. The board ranks accounts by a score computed from each account's
**expedition log** (`ftf-expedition-log/1`, `game/src/game/expedition-log.js`): a hash-chained list of rule-minted
events (quests turned in, kills ticketed, bounties, the Gate-Loom fee). No term reads a balance, a transfer or a trade
proceed, so moving silk between accounts adds nothing. There is one currency, silk (owner, 12.11); no term uses wool.

## The score (`game/src/game/board-score.js`)

| Part | Rule |
|---|---|
| Q (quests) | one-time points for a quest turned in at trust T2: welcome 40, spiders 100, spare part 80, crown 300; 30 per bounty, 3 after the third bounty of a UTC day |
| Sk (hunting) | 1 point per 10 silk of kill income; T2 (scripted hunt) at full value, T1 (a real-time kill) at 0.25 and at most 200 points per UTC day |
| V (receipts) | 10 per distinct on-chain quest receipt, at most 50 |
| P (portal) | 200 once for paying the full Gate-Loom fee (200 silk) (a `?portalFee=` demo fee never scores) |
| M (variety) | 0.6 + 0.1 per class with at least one scored event among quest, hunt, trade, verify |

`score = round(M × (Q + Sk + V + P))`. Ties go to the account that reached its final score first, then by
account id. Entries with any trust other than T1/T2 never score. Humans and scripted accounts are ranked in separate
lists; a scripted account never appears in the human list.

### Worked example

| Account | Events | Q | Sk | V | P | M | Score |
|---|---|---|---|---|---|---|---|
| ann | welcome, spiders, crown; 600 silk of T1 kills; portal; 1 receipt | 440 | 15 | 10 | 200 | 0.9 | 599 |
| bo | welcome, spiders; 2 bounties | 200 | 0 | 0 | 0 | 0.7 | 140 |
| cy | welcome; 200 silk of T1 kills | 40 | 5 | 0 | 0 | 0.8 | 36 |

These are the golden fixtures of `game/tests/client/board-score.test.mjs` (with two scripted accounts and one cheater
whose edited log is rejected by the hash chain).

### What splitting accounts buys

Every cap is per account. Splitting one account's events over several never raises the total while no cap binds; a
split can at most recover what a cap cut (parallelism, bounded by the caps). The test checks exactly this. Free testnet
accounts are not scarce, so Board Season 1 carries no money and no promise.

## Snapshots and verification (`tools/leaderboard/`)

Input: a directory of `<name>.json` files `{account, log, extra?}` (`extra`: `receipts`, `trades`,
`onChain`, read from chain) and an optional `registry.json` `{scripted: [...]}`. Logs that fail the hash chain are
rejected.

```
node tools/leaderboard/score.mjs <logs>                          # ranked rows
node tools/leaderboard/snapshot.mjs <logs> <out> --season=1 --epoch=0   # snapshot.json, proofs.json, rows.csv
node tools/leaderboard/verify.mjs <out>/snapshot.json <logs>     # exit 1 on an edited row, a wrong root or other rules
node tools/leaderboard/flags.mjs <logs>                          # fixed-interval, identical sequences, one class
```

`snapshot.rules` is the sha256 of `board-score.js`, `expedition-config.js` and `quests-data.js`. The leaf of a row is
`sha256('ftf-lb-1|season|epoch|rank|account|score|logHead')`; parent = `sha256(left || right)`, an odd last node moves
up (the rule of `relayer/lib/chest-deck.js`). No tool uses the network or a key.
