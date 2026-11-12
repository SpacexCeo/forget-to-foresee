# Town items (NEP-245)

`contracts/town-items` holds every kind of town item as a NEP-245 multi-token, in one contract (roadmap item 4).
It is a **separate contract** next to `ftf-town`, so the deployed town contract needs no upgrade. The first token ids
are the five monster resources the town's stalls sell (`relayer/market/catalog.js` `RESOURCES`):

| Token id | From | Base price at the stalls (fifths of a silk) |
|---|---|---|
| `spider_silk_thread` | skitter (spider) | 15 |
| `chitin_plate` | skitter | 25 |
| `veil_dust` | veilbell | 75 |
| `ash_ore` | hulker | 200 |
| `crown_shard` | crownrift | 1,000 |

Memory shards stay NEP-171 (`ftf-shards`). Items are testnet game things with no value outside the game.

## Surface

- **NEP-245 core**: `mt_transfer`, `mt_batch_transfer`, `mt_transfer_call`, `mt_batch_transfer_call` (the receiver's
  `mt_on_transfer` returns the unused amounts and `mt_resolve_transfer` gives them back), `mt_token`,
  `mt_balance_of`, `mt_batch_balance_of`, `mt_supply`, `mt_batch_supply`. Transfers need 1 yoctoNEAR.
- **Metadata**: `mt_metadata_contract` (spec `mt-1.0.0`) and `mt_metadata_token_all`. The extra field holds the kind
  and the base price.
- **Events**: NEP-245 `mt_mint`, `mt_transfer`, `mt_burn` (standard `nep245`, version `1.0.0`).
- **Not supported**: approvals. Every `approval` must be null, the same rule as the shards and the deeds (no approval
  phishing).
- **Admin**: the owner registers token kinds (`add_token`) and sets the minters.
- **Minting**: only authorised minters can mint (the trader wallets and the coordinator).
- **Burning**: any holder can `burn` its own items (crafting, quests that use them up).
- **Views**: `tokens`, `minters`.
- **Tests**: 8 unit tests covering mint, transfer and batch, the event format, overdraft, approvals, 1 yocto, and
  transfer_call refunds, including a failed receiver.

## Deploy (lead, after the owner's yes)

`bash contracts/scripts/items-deploy.sh` does the following:

1. Creates `items.ftf-town.testnet`, signed by the town account.
2. Deploys with owner `ftf-coordinator.testnet` and the 20 trader wallets plus the coordinator as minters.
3. Registers the five resources.
4. Writes `items` into `game/src/net/day1-deployment.js`.

The traders' current keys can call only `ftf-town`. Before a stall can mint a resource it sells to a player, either
give each trader wallet a second function-call key for `items.ftf-town.testnet` (method `mint`) or let the
coordinator mint.

## Buying and selling resources (relayer desk, dry run by default)

`relayer/lib/resource-desk.js` and `/api/market/resource`. The relayer never holds a player's key:

1. **Quote.** `GET /api/market/resource?side=buy|sell&item=<id>&qty=<n>` answers:
   - the price in silk (the town's price rules on the stall's current shelf, `priceOf` / `buybackOf`),
   - the trader's reason,
   - the stall's wallet,
   - for a buy, the exact `reference` the payment must carry.
2. **Buy.**
   - The player calls `ftf-town` `trade({counterparty: <stall>, silk, reference: "buy:<item>:<qty>"})` with its own
     key.
   - It then POSTs `{side: "buy", item, qty, account_id, tx_hash}`.
   - The desk fetches that transaction from the chain and checks it: final and successful, one call, signed by
     `account_id`, sent to `ftf-town`, method `trade`, the right stall and reference, at least the quote minus 10 %.
   - The minter then mints the items to the player here.
3. **Sell.**
   - The player calls `mt_transfer({receiver_id: <stall>, token_id: <item>, amount})` on this contract.
   - It then POSTs `{side: "sell", …}`.
   - After the same checks, the stall pays the buy-back price with its own trade key (`trade` with reference
     `sell:<item>`).
4. **Journal.** Every transaction hash settles once. Replays answer 409, and a payment that failed to settle frees
   its hash for a retry. Requests are logged to `relayer/data/resource-desk.jsonl`. The stall's shelf in the
   daemon's state follows each deal.
5. **Dry run** unless `FTF_TOWN_SEND=1`: the desk verifies and answers the plan, and nothing is minted or paid.
   Minting needs `FTF_ITEMS_MINTER` / `FTF_ITEMS_KEY` (an account the owner has made a minter) on the server.

Tests: `relayer/tests/resource-desk.test.mjs` (5) cover quotes, a dry-run buy with the shelf update and the replay
refused, every refusal reason, a sell paid by the stall's key with a retry after a failure, and the quote route.

## Not built yet

- The game's buy/sell buttons and inventory (`mt_batch_balance_of`) for the desk: game UI, other workers.
