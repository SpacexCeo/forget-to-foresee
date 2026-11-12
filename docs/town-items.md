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

## Not built yet

- The relayer route that sells a resource to a player (the player pays silk on `ftf-town`, the stall mints the item
  here) and buys one back. The prices for both exist: `relayer/market/prices.js` `priceOf` / `buybackOf`.
- The game's inventory reading `mt_batch_balance_of`.
