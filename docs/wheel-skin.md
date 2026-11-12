# The wheel's grand prize: the Sheriffchenko NFT skin

The town's wheel of fortune (`game/src/game/wheel.js`) has a grand-prize sector, `skin_sheriffchenko`, weight 0.5 of
100 (1 in 200 spins). Winning it mints a Sheriffchenko skin NFT on NEAR testnet to the player's Day 1 guest account.
**Hard cap 100, one per account.** Spins are free (one a day plus spins earned by play); no purchase, no real money.

## How a claim is checked

The roll is deterministic and public, so the relayer re-checks it instead of trusting the browser
(`relayer/lib/wheel.js`, `POST /api/wheel/claim`):

1. the request `{account_id, public_key, wheel_id, seed, at, signature}` is signed (ed25519) by `public_key` over
   `ftf-wheel-claim|<account>|<wheel_id>|<seed>|<at>`, within 5 minutes, used once; the key must be an access key of
   that account (RPC `view_access_key`);
2. `wheel_id` must be `sha256('ftf-wheel:' + account_id)[0..8]` — a browser cannot choose an id that wins;
3. the seed is `<wheel_id>-<n>` and re-rolled with the game's own rule (mulberry32 from `sha256('ftf-town:wheel:' +
   seed)`, weighted pick); it must land on the grand prize (a test checks the relayer's copy against the game's
   `spinResult` on 5,000 seeds);
4. `n` must be at most the spins the account could have had: the days since the wheel's launch (11.11.2026) plus 20
   earned spins;
5. the contract `skins.ftf-coordinator.testnet` (`contracts/skin-nft`) mints `sheriffchenko-<k>` only from its minter
   key, refuses a second token for the same account and anything past 100, and records the winning seed in the token.

Answers: `200 {token_id, tx_hash}`; `400 invalid_spin` / `401 bad_signature`; `403 not_your_key`;
`409 already_owned` / `replayed`; `410 sold_out`; `429 rate_limited` (3 at once per IP, then one per 5 min);
and, while the minter key is not on the server yet, `202 {status: 'mint_pending', verified: true, recorded}`: every
check above has passed, the win is written to `relayer/data/wheel-claims.jsonl`, and the game keeps the prize as
"mint pending" (and retries). `node relayer/scripts/mint-pending.mjs` mints the recorded wins once the key exists.

## Honest limits

- The roll is public, so a player can compute which of their own allowed spin numbers would win and claim that one
  without having spun it. Step 4 bounds it to the days since launch + 20 per account, and guest accounts are capped by
  the guests contract (200 a day), but it is not a commit–reveal draw. A stronger version would draw the grand prize
  from a TEE-signed or block seed at claim time, like the loot chests (`docs/chests.md`).
- The art is a placeholder: the token's media URL is empty until the owner sets it (`set_media`, which also updates
  the tokens already minted).

## Deploy

`docs/handoff/relayer-tee-deploy.md` (the skin key on the server, then `contracts/scripts/skin-deploy.sh`).
