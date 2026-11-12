# whitelist-pass

The Forget to Foresee whitelist pass: a free, **transferable** NEP-171 token (with NEP-177 metadata and NEP-181
enumeration) that the game's relayer mints to a player's NEAR wallet after it has verified, from the replayed
expedition log, that the player paid **10,000 town silk at the Gate-Loom**. **The pass gives its holder a free NFT
mint at the official launch**; the right follows whoever holds the pass then. Plain-language description, the utility,
and the threat model: [`docs/whitelist-pass.md`](../../docs/whitelist-pass.md). Owner runbook (deploy, keys,
checks): [`docs/mainnet-pass-runbook.md`](../../docs/mainnet-pass-runbook.md). **Status: built, not deployed.**

| | |
|---|---|
| Mint | `mint_pass(receiver_id, claim_id)`, minter only, zero deposit (the contract pays storage, so the minter can be a function-call key limited to this one method) |
| Limits on chain | total `cap` (default 1000), UTC-day `daily_cap` (default 100), one mint per wallet ever (`minted_to` is never pruned, also after a transfer), `claim_id` (64 lowercase hex) used once, mint and transfer refused if the contract would keep less than 0.05 NEAR available |
| Transfers | standard `nft_transfer` / `nft_transfer_call` by the holder, 1 yoctoNEAR; work while minting is paused |
| Absent | approvals (NEP-178: an `approval_id` panics `ERR_NO_APPROVALS`), royalties, burn, upgrade, any owner override of a token |
| Owner | `set_minter`, `pause` / `unpause` (minting only), `set_media` (one shared image URL); cannot mint, move funds, freeze or seize |
| Views | `pass_info`, `has_minted`, `is_whitelisted` (holds at least one pass), `is_claimed`, `minter`, `owner`, `paused`, NEP-171/177/181 views |

```bash
cargo test --lib                       # 28 tests: caps, daily cap across midnight, one mint per wallet (also after a transfer),
                                       # claim idempotency, transfers and transfer_call (token returned / kept), no approvals,
                                       # pause, low-balance guard, storage deltas printed (cargo test --lib -- --nocapture)
bash scripts/build.sh                  # wasm size, SHA-256 (hex and base58 code_hash), export list check
node scripts/deploy-args.mjs --network testnet --contract pass.you.testnet --owner you.testnet --minter minter.you.testnet
                                       # PRINTS the owner's commands; signs and sends nothing
```

Measured in the unit tests (mocked VM): one `mint_pass` adds **990 bytes** of storage (about 0.0099 NEAR at 1e19
yoctoNEAR per byte); a transfer changes storage by **0 bytes** net. To be measured again on the testnet rehearsal
(story TZ §11.5).
