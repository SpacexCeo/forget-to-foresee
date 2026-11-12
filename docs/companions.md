# Dragon companions for every heroine

Every heroine gets dragons that are real NFTs on NEAR testnet, owned by her heroine NFT's own account
(`<token_id>.heroine.ftf-coordinator.testnet`), so they move with her when the heroine changes hands
(`docs/companion-nft-plan.md`).

| Reason | When | Kind | Token id |
|---|---|---|---|
| `welcome` | right after the Day 1 guest and heroine mint | nacre / rill / cinder, seeded by the guest account (`sha256("ftf-dragon|" + account)`) | `dragon-<sub>` |
| `boss` | once the stored expedition log shows the first boss down (a `kill_ticketed` crownrift, or `q_boss` ready / turned in), with a hash chain that verifies | one of the other two kinds, seeded too | `crown-dragon-<sub>` |

`<sub>` is the heroine token without `elise-` (`elise-ann-1a` → `dragon-ann-1a`). Two dragons at most per heroine.

## Flow

1. The game (`game/src/net/companion-claim.js`, called from `boot-world.js`) signs
   `ftf-companion|<account>|<at>|<reason>` with the guest's browser key and posts it to `POST /api/companion/claim`
   `{account_id, public_key, at, signature, reason}`. Welcome is asked whenever a heroine is known and not yet claimed;
   boss when the local log has the boss kill, after the log sync has flushed. A refused claim is retried after 30 s, up
   to 5 times a page.
2. The relayer (`relayer/lib/companion.js`) checks the signature, that the key is an access key of that account,
   and that `guests.guest_of(public_key)` maps it to that account with a minted heroine. The heroine token comes from
   the contract, never from the request. For `boss` it verifies the stored log (`FTF_EXPEDITION_DIR`).
3. If `nft_token(<dragon id>)` exists, it answers with it (`already: true`, no transaction). Otherwise it calls
   `nft_mint(token_id, receiver_id: <heroine token account>, metadata {title, description, extra {kind, reason,
   heroine}})` on the companions contract, signed by the contract account's function-call key. The contract refuses a
   duplicate token id, so a race mints once.
4. The game then reads the heroine account's dragons from the chain (`net/companions.js`) and flies them; nothing is
   shown before that read confirms them. A confirmed claim is remembered in `localStorage` (`ftf.companion.claims.v1`).

Answer: `{reason, kind, token_id, owner_id, heroine_token, contract, tx_hash, already}`. Refusals: 400 (shape, stale,
bad reason), 401 `bad_signature`, 403 `not_your_key`, 409 `no_heroine` / `boss_not_down`, 429, 502 `not_minter` /
`mint_failed`, 503 `companion_not_configured`. `GET /api/health` reports `companions: {configured, contract}`.

## Server setup (owner)

The companions contract already has `add_minter` (character-nft); no upgrade is needed. It was deployed with
`minters: []`.

1. On the server, in `relayer/`: `node scripts/chest-key.mjs FTF_COMPANION_KEY`. It appends the key to
   `relayer/.env` (once) and prints only the public key.
2. The lead adds it to the companions account as a function-call key for `nft_mint` only:
   ```
   near account add-key companions.ftf-coordinator.testnet grant-function-call-access --allowance '1 NEAR' --contract-account-id companions.ftf-coordinator.testnet --function-names 'nft_mint' use-manually-provided-public-key <PUBLIC_KEY> network-config testnet sign-with-legacy-keychain send
   ```
3. The owner makes the contract account a minter (it signs its own mints):
   ```
   near contract call-function as-transaction companions.ftf-coordinator.testnet add_minter json-args '{"account_id":"companions.ftf-coordinator.testnet"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as ftf-coordinator.testnet network-config testnet sign-with-legacy-keychain send
   ```
4. Restart the relayer; `GET /api/health` shows `companions.configured: true`. Storage of each dragon is paid by the
   companions contract (about 0.01 NEAR each), so keep its balance topped up.

Tests: `relayer/tests/companion.test.mjs` (5) and `game/tests/client/companions.test.mjs`.
