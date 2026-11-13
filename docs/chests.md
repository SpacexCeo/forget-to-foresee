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

`POST /api/chest/open` with `count` (1–10) and `request_id` opens up to `count` chests, **one single-action
transaction per chest**, sent together. There is **no contract change**, and every opening still draws its own deck
position, so each one stays individually verifiable with `tools/verify-chest/verify.mjs`.

- **Why not one transaction (13.11, the "Open all" failure).** The first design sent one transaction with N
  `open_chest` actions. The opener key is a function-call access key, and NEAR lets such a key sign only a
  single-action transaction, so the network refused every batch before it was sent. The relayer answered `rpc`, the
  client had no message for that code, and players saw "The chest service failed". `/api/health` showed 0 batch
  transactions. Now `callEach` (`relayer/lib/near-tx.js`) sends each transaction after the one before is included in a
  block, so the nonces stay in order from one queue slot. It then reads every final outcome.
- **Signature**: the player signs `ftf-chest-open|<account>|<at>|<count>|<request id>`. A request without `count`
  works as before.
- **Limits**: the batch is cut to the account's daily allowance (30 a day, counted from `openings_of` for today), to
  what is left of the deck, and to 10. The answer says `cut: "daily_cap"` when it was cut.
- **Partial success**: each chest is its own transaction. If some fail, the answer lists exactly the ones that opened
  (`cut: "failed_some"`), and the client settles only those. If all fail, the answer is a plain code (`tx_failed`,
  `daily_cap`, `sold_out`).
- **Journal**: a request id that was answered is answered again from the journal, keyed by account and request id.
  The journal is checked before the replay guard, so a retry after a lost answer is never refused or re-sent.
- **Read-back**: the openings come from each transaction's `chest_opened` event, each with its own `tx_hash`,
  outcome, leaf and Merkle proof.
- **Honest count**: `/api/health` → `chests` reports `transactions`, `openings`, `batches` and `errors` by code (a
  batch of N is N transactions).
- **Gas**: 100 Tgas per transaction, the same as a single open; unused gas is refunded.
- **Rate limit**: 20 requests a minute per IP, and a batch is one request.
- **Errors**: every relayer code has its own plain message (`chest.err.<key>` in the five play locales;
  `net/chest-client.js` `chestErrorKey`). Only an unknown code shows the generic line, and the real code is logged.
- **Client** (`game/src/net/chest.js` `openChests`, `net/chest-client.js` `openMany`, `play/chest-batch.js`):
  - The bag shows "Open 5" and "Open all (≤ 10)" once two or more chests are sealed; "Open" on a card still opens
    one.
  - Each opening settles its own sealed chest the moment the answer arrives, so closing early loses nothing.
  - The cards flip one by one (0.4 s each, a tap skips; reduced motion goes straight to the summary). The summary
    grid is sorted by rarity, each card's "Verified ✓" links to the transaction, and "Claim all" closes.
  - Every opening is read back with `get_opening` and checked in the browser like a single one.
  - A relayer without batches is detected (an error, or a single-opening answer), and the chests are then opened
    one by one.
