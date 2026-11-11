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
