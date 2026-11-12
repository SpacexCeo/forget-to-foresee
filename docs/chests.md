# Loot chests: exact supply, TEE-seeded draws, verifiable openings

Monsters outside the town walls drop chests. Season 1 has **10,000 chests, of which exactly 1,000 (10%) give a loot
NFT**; the rest give in-game rewards (silk, XP, shards and mechanical parts from
`game/public/assets/items/manifest.json`). Testnet only, no real money.

## What is on chain

`chests.ftf-coordinator.testnet` (contract `contracts/loot-chest`):

| Step | Who | What the contract checks / stores |
|---|---|---|
| `commit_deck(root, deck_sha256)` | owner, once | the Merkle root of the canonical deck and the sha256 of its lines; block height of the commit |
| `fix_seed(request_body, signed_text, signature, signing_address)` | owner, once, after the commit | the TEE request names the committed root; sha256(request_body) is the request hash in `signed_text`; the ECDSA signature recovers to `signing_address` (`env::ecrecover`); seed = sha256("ftf-chest-seed-1" ‖ sha256(signature) ‖ this block's random seed) |
| `open_chest(account_id)` | the relayer's open_chest-only key | caps (10,000 openings; 30 per account per UTC day); draw j = u64LE(sha256(seed ‖ index u32 LE ‖ this block's random seed)[0..8]) mod remaining; position = slot j of a sparse Fisher–Yates over the positions not drawn yet; positions 0..999 mint a NEP-171 loot NFT (`s1-<index>`) to the player; records account, position, block random seed, block |

Views: `season_info`, `get_opening`, `list_openings`, `openings_of`, `nft_token`, `nft_tokens_for_owner`.

## The deck

Canonical and public (`relayer/lib/chest-deck.js`, `node tools/chest/deck.mjs` prints it):

- positions 0–59 NFT legendary, 60–299 NFT rare, 300–999 NFT uncommon (items cycle through that rarity);
- 1000–9999: silk ×5 (2,000), ×10 (1,200), ×25 (400); XP ×10 (1,500), ×25 (500); common items 6 × 300; uncommon
  5 × 200; rare 4 × 150.
- leaf = sha256(`ftf-chest-1|<season>|<position>|<kind>|<tier>|<item>|<amount>`); parent = sha256(left ‖ right), an odd
  last node moves up unchanged. Season s1 root `18b54f9d37b2c3b0ed458f7ec90d8dd01e62d2fa468e1fea28ffc5a19620058e`.

Because the NFT slots are fixed positions in a committed deck and every position is drawn exactly once, the season
holds exactly 1,000 NFTs — a unit test opens all 10,000 and counts them.

## Why nobody can pick an outcome

- The deck is committed before any seed exists.
- The seed needs a NEAR AI Cloud TEE signature over a request that names the root (so it is made after the commit;
  the model's signing key is attested to live in an Intel TDX + GPU enclave, `docs/tee.md`), mixed with the random
  seed of the block that executes `fix_seed` — unknown when the transaction is sent.
- Each opening mixes in the random seed of its own block, so the *next* outcome is unknown even to us and to the
  player; there is no known upcoming NFT slot to wait for.

Honest limits: a NEAR block producer influences its block's random seed (testnet); the relayer could refuse to open a
chest (it cannot choose the outcome); "the monster dropped a chest" is gameplay in the browser, not checked on chain —
the per-account daily cap and the relayer's per-IP limit bound abuse.

## Verify

```bash
node tools/verify-chest/verify.mjs                    # the whole season so far: deck, seed chain, every draw, counters
node tools/verify-chest/verify.mjs --index 42 --attest # one opening's outcome + Merkle proof + NFT owner, and the TEE signer's attestation
node tools/chest/deck.mjs                             # the deck and its root
```

The game re-checks each opening in the browser (`game/src/net/chest.js`): the outcome's leaf and Merkle proof lead to
the on-chain root, and the draw's random value follows from the on-chain seed. The full replay of every draw is the
CLI's job.

## Status (2026-11-12)

- Contract deployed and the deck committed (`season_info`: root as above, opened 0).
- The seed is not fixed yet: `node tools/chest/seed.mjs` needs NEAR AI Cloud credits (chat answers 402 until then).
- The relayer's opener key and the `/api/chest/open` route go live with the relayer redeploy
  (`docs/handoff/relayer-tee-deploy.md`).

## Batch opening (owner, 12.11; relayer side built)

`POST /api/chest/open` with `count` (1–10) and `request_id` opens up to `count` chests in **one transaction**: `count`
`open_chest` FunctionCall actions to the chest contract, signed by the opener's function-call key. There is **no
contract change**, and every opening still draws its own deck position, so each stays individually verifiable with
`tools/verify-chest/verify.mjs`.

- **Signature**: the player signs `ftf-chest-open|<account>|<at>|<count>|<request id>`. A request without `count`
  works as before.
- **Limits**: the batch is cut to the account's daily allowance (30 a day, counted from `openings_of` for today), to
  what is left of the deck, and to 10. The answer says `cut: "daily_cap"` when it was cut.
- **All or nothing**: the actions run in one receipt, so if the transaction fails nothing has landed. It is retried
  once with the same count.
- **Journal**: a request id that was answered is answered again from the journal and never re-sent.
- **Read-back**: the openings come from the chain's `chest_opened` events (only the last action has a return
  value), each with its outcome, leaf and Merkle proof.
- **Honest count**: `/api/health` → `chests` reports `transactions`, `openings` and `batches` separately (one batch
  is one transaction with N openings).
- **Gas**: 28 Tgas per action (10 × 28 = 280 of the 300 Tgas limit). The real use must be measured with the test
  below.
- **Verify on testnet first.** Run on the relayer server with the opener key:
  `node relayer/scripts/chest-batch-test.mjs <guest account> 2 --send`. It sends one transaction with 2 `open_chest`
  actions and prints the hash, the gas burnt and both openings. If the network refuses a multi-action
  function-call-key transaction, the batch falls back to N single transactions: one line in `openChests`.
- **Client** (`game/src/net/chest.js` `openChests`, `net/chest-client.js` `openMany`, `play/chest-batch.js`):
  - The bag shows "Open 5" and "Open all (≤ 10)" once two or more chests are sealed; "Open" on a card still opens
    one.
  - Each opening settles its own sealed chest the moment the answer arrives, so closing early loses nothing.
  - The cards flip one by one (0.4 s each, a tap skips; reduced motion goes straight to the summary). The summary
    grid is sorted by rarity, each card's "Verified ✓" links to the transaction, and "Claim all" closes.
  - Every opening is read back with `get_opening` and checked in the browser like a single one.
  - A relayer without batches is detected (an error, or a single-opening answer), and the chests are then opened
    one by one.
