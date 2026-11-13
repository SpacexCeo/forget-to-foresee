# Transaction counter

`node tools/count/count.mjs` counts the testnet transactions of the game's contracts from the public NearBlocks v3
indexer. It needs no keys and signs nothing. Accounts: `ftf-town.testnet` (its `trader-NN` and `clan-*` sub-accounts
show up as signers), `items.ftf-town.testnet`, `gate.ftf-town.testnet` and the `*.ftf-coordinator.testnet` contracts.

```bash
node tools/count/count.mjs --day 2026-11-14          # one UTC day
node tools/count/count.mjs --hours 24                # the last 24 hours
node tools/count/count.mjs --from 2026-11-14T00:00Z --to 2026-11-14T06:00Z --json
node tools/count/count.mjs --hours 1 --accounts items.ftf-town.testnet
```

It prints successful and failed transactions by receiver, by `receiver:method`, by signer, and lists each failure
with its explorer link. A transaction seen from two watched accounts is counted once (by hash). Status is the
transaction's final outcome as the indexer records it. A full day at the current pace (~1,500 transactions an hour)
takes about 15 minutes of paging.

Test: `node --test tools/count/count.test.mjs` (recorded pages in `fixtures/`, no network); it also runs in
`cd game && npm test`.

## Proof doc and gas runway

```bash
node tools/count/count.mjs --window 2026-11-14 --write   # writes docs/proof/tx-2026-11-14.md and docs/proof/tx-24h.md
node tools/count/runway.mjs [--hours 6]                  # balances and days left at the current burn (read only)
```

`--write` overwrites the same files, so rerun it after 00:00 UTC for the final count of a day. The doc says
"Partial" while the window is open. It includes the runway table: liquid NEAR (balance minus the storage lock) of
ftf-town, the 20 traders, the 6 clans, guests and heroine, and their burn. Burn is the fees each account signed in
the last hour, plus 0.05 + ~0.032 NEAR per new guest for guests / heroine.
