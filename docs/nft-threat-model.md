# NFT threat model

Scope: every token the game puts on NEAR testnet. They are game items with no value outside the game, but each must
behave like a real NFT: only the intended party mints it, only its holder moves it, and a request cannot be replayed
or forged into a second mint. Each claim below names the code behind it and the test that checks it.

Common to all NEP-171 contracts here (`character-nft`, `skin-nft`, `loot-chest`, `memory-shard`): core and enumeration
come from `near-contract-standards`, and the **approval extension is off** (the approval storage key is `None`). So
`nft_approve` does not exist, nobody can be made an operator, and a non-owner `nft_transfer` panics with "Approval
extension is disabled". Transfers need exactly 1 yoctoNEAR (a full-access key or a wallet confirmation, never a
function-call key). Self-transfers panic. Token ids are unique ("token_id must be unique").

## Kinds

| Kind | Contract (testnet) | Standard | Who mints | Transfer | Holder can | Holder cannot |
| --- | --- | --- | --- | --- | --- | --- |
| Heroine (Elise) | `heroine.ftf-coordinator.testnet` (`character-nft`, `token_accounts: true`) | NEP-171 | minters only: the guests contract, in `create_guest` | `nft_transfer` / `_call` by the owner | act through the token's own account (`act_as_token`), e.g. move its dragons | mint, act through someone else's token |
| Companions (dragons) | `companions.ftf-coordinator.testnet` (`character-nft`, no token accounts) | NEP-171 | minters only: the relayer's `nft_mint`-only key | owned by the heroine's token account, so they move with Elise; that account can `nft_transfer` them | — | mint |
| Skins (Sheriffchenko) | `skins.ftf-coordinator.testnet` (`skin-nft`) | NEP-171 | minters only: the relayer, after it re-derives the wheel roll | `nft_transfer` by the owner | give or sell the skin | get a second mint to the same account, even after giving the first away |
| Chest loot | `chests.ftf-coordinator.testnet` (`loot-chest`) | NEP-171, minted inside `open_chest` | openers only (the relayer), at a draw the contract makes itself | `nft_transfer` by the owner | move it; the opening record keeps the provenance | choose or predict the draw |
| Memory shards | `ftf-shards` (`memory-shard`) | NEP-171 | coordinators only, deposit pays storage | `nft_transfer` by the owner | move it | mint |
| Town items (resources) | `items.ftf-town.testnet` (`town-items`) | NEP-245 multi-token | minters (relayer stall key) or owner | `mt_transfer`, `mt_batch_transfer`, `_call` variants (1 yocto) by the holder; `coordinator_transfer` by a minter for a player-market sale | move, batch move, burn its own | overdraw, move to itself, use approvals, burn someone else's |

## Risks and mitigations

**Unauthorized mint.** Every mint method starts with a minter/opener/coordinator check (`nft_mint` ERR_NOT_MINTER,
`mint_skin` ERR_NOT_MINTER, `open_chest` ERR_NOT_OPENER, `mint_shard` ERR_NOT_COORDINATOR, items `mint`
ERR_NOT_MINTER). Each relayer key is a function-call key limited to one method on one contract, so a leaked key can
mint only that kind, within that contract's caps (skins: cap and one per account; chests: 10,000 openings, 1,000 NFTs,
30 per account per day). Tests: `strangers_cannot_mint` (character-nft, town-items), `minters_only` (skin-nft),
`only_openers` (loot-chest), `a_stranger_cannot_mint` (memory-shard).

**Double mint / replay.**
- Heroine: one guest per public key (`ERR_EXISTS`) and `ERR_PENDING` while one is in flight. A retry of a failed
  mint reuses the same record. Daily cap 200.
- Dragons: the token id is fixed per heroine and reason (`relayer/lib/companion.js`), so a replayed claim returns the
  existing token and cannot mint a second one. The id is unique on chain anyway.
- Skins: `owners` records the winner, so `mint_skin` to the same account fails with ERR_OWNED even after the skin is
  given away (test `giving_the_skin_away_does_not_unlock_a_second_mint`). Note: `skin_of` reports who won the mint,
  not the current holder; read `nft_token` for the holder.
- Chest loot: the draw is a sparse Fisher-Yates over the committed deck, so each position comes out once and the
  NFT count is exact (`a_full_season_is_exact_10000_and_1000_nft`).
- Market sales: `coordinator_transfer` records its `request_hash` once (`a_market_request_moves_items_once`). Off
  chain, each signed request is used once per relayer process with a 5-minute skew (`relayer/api/market/p2p.js`).

**Forged receipts / forged claims.** The relayer never trusts the browser's word. Companion claims, wheel prizes,
market orders and town moves are ed25519-signed by the guest's own key over a fixed message. The relayer checks the
signature, checks with `view_access_key` that the key belongs to the named account, and for dragons reads the
heroine from the guests contract, never from the request. The wheel prize is re-derived from the account and
re-rolled on the server (`relayer/lib/wheel.js`). The chest seed is fixed once from a NEAR AI Cloud TEE answer whose
signature the contract recovers (`seed_signature_must_recover`, `seed_request_must_name_the_root`).

**Theft by a stranger.** No approvals, owner-only `nft_transfer`, 1 yocto (tests `a_stranger_cannot_transfer_a_heroine`,
`a_stranger_cannot_take_a_skin`, `a_stranger_cannot_take_chest_loot`, `a_stranger_cannot_transfer_someone_elses_shard`).
NEP-245: the holder is the predecessor, with no approvals (`approvals_are_not_supported`), no overdraft (`no_overdraft`,
`a_batch_cannot_spend_the_same_items_twice`), and burn only from one's own balance
(`a_holder_cannot_burn_someone_elses_items`).

**The heroine's token account changes hands.** `act_as_token` checks the token's *current* owner on every call.
After a transfer the new owner controls the account and its dragons, and the previous owner is refused
(`a_transfer_hands_the_token_account_to_the_new_owner`, `the_previous_owner_loses_the_token_account`).

**Guest key in the client.** The hosted page holds no key: `create_guest` is signed by the relayer. A dev build may
carry the `create_guest`-only key. That key can only create guests, within the daily cap, and spend the guests
contract's fund. It cannot move NEAR or tokens. When the fund is empty the game says so (`docs/guest-capacity.md`).

## Residual risks (accepted, documented)

1. **`coordinator_transfer` trusts the market key.** Items v2 lets a minter move items between any two accounts given
   an unused 64-hex request hash. The seller's and buyer's signatures are verified by the relayer, not by the
   contract. A leaked `FTF_ITEMS_KEY` could move any player's resources. Mitigation: the key is a function-call key on
   the server only, and the owner can `set_minters([])` at once. A contract-side ed25519 check of the buyer's signed
   request would remove this risk, but it was left out to keep the deployed interface stable before the deadline.
2. **Off-chain replay set lives in memory.** After a relayer restart, a market or town request signed less than 5
   minutes earlier could be submitted again. Buys and town moves are still protected on chain by their request hash
   (`request_used`, `ERR_ACT_REQUEST`). A duplicate *listing* only re-lists items the seller still has to own at sale.
3. **Owner powers.** Contract owners can add minters, change the skin media and change the funds. This is testnet,
   and each owner is the team's coordinator account.
4. **`skin_of` is mint provenance, not holdership** (see above). Holder perks read holdership from
   `nft_tokens_for_owner` (`game/src/net/holder.js`). The wheel uses `skin_of` only to show that the account won the prize.

## Running the tests

```bash
for c in character-nft skin-nft loot-chest town-items memory-shard; do (cd contracts/$c && cargo test); done
```
