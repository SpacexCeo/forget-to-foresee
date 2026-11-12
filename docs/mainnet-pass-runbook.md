# Whitelist pass: owner runbook (testnet rehearsal, then mainnet)

> **OWNER-GATED.** Agents wrote this document and print commands; they never run them, create accounts, fund,
> deploy, sign or delete keys. Every command below is marked **READ-ONLY** or **SIGNS (key)**. Rehearse everything on
> testnet first with the same code. Story TZ §11.5 to §11.7. Contract: [`contracts/whitelist-pass`](../contracts/whitelist-pass);
> plain-language page and threat model: [`whitelist-pass.md`](whitelist-pass.md); claim API: [`pass-claim-api.md`](pass-claim-api.md).

The exact commands for your account names are printed by (READ-ONLY, prints only):

```bash
node contracts/whitelist-pass/scripts/deploy-args.mjs --network testnet --contract pass.<you>.testnet --owner <you>.testnet --minter minter.<you>.testnet --cap 1000 --daily 100 --allowance "1 NEAR"
```

## 1. Decide and record (before anything is deployed; final once the keys are deleted)

| decision | default | note |
|---|---|---|
| contract account | `pass.<owner>.near` (a subaccount of your account) | [VERIFY availability] |
| `owner_id` | your cold account | can only pause/unpause minting, rotate the minter, set the image URL |
| minter account | `minter.<owner>.near` | holds one function-call key for `mint_pass` |
| `cap`, `daily_cap` | 1000, 100 | bound the total cost (§3 below) |
| approvals (NEP-178) | **off** | marketplaces cannot list it; adding them later is impossible once keys are deleted |
| royalties | none | |
| utility text | **a free NFT mint at the official launch, for the current holder** (owner decision) | no monetary value promised |
| launch snapshot rule | holders at a block you announce in advance; one free mint per wallet | |
| image URL | `set_media` after deploy | |

## 2. Testnet rehearsal (throwaway accounts)

1. **READ-ONLY (local):** `bash contracts/whitelist-pass/scripts/build.sh` — needs cargo-near for the deployable wasm;
   record the size, the SHA-256 (hex) and the base58 `code_hash`.
2. **SIGNS (contract account's key):** deploy and `new` (the `cargo near deploy ...` line printed by deploy-args).
3. **SIGNS (minter account's key):** add the function-call key (receiver = the contract, method `mint_pass`, an
   allowance). Put the printed private key only into `FTF_PASS_KEY` on the relayer host.
4. Relayer in testnet mode: `FTF_PASS_NETWORK=testnet FTF_PASS_CONTRACT=... FTF_PASS_MINTER=... FTF_PASS_KEY=...
   FTF_PASS_ENABLED=1`, and set `game/src/net/pass-deployment.js` `contract` to the testnet contract.
5. Mint two test passes through the game (`?story=1`) to two throwaway testnet wallets; check the modal shows the real
   hash and the **TESTNET REHEARSAL** banner; check every failure row of the status table by hand
   ([`pass-claim-api.md`](pass-claim-api.md)): wrong id, missing account, a second claim, `FTF_PASS_ENABLED=0`, a
   `STOP` file, `pause`.
6. **READ-ONLY:** measure from the rehearsal transactions: `storage_usage` change per mint (the unit tests measured
   **990 bytes**; a transfer **0 bytes** net) and `gas_burnt` per mint (on the NearBlocks receipt).

## 3. Cost: method, not a quote

`cost per mint ≈ bytes_added × 1e19 yoctoNEAR + gas_burnt × gas_price` ([VERIFY] the storage price, 1e19 yoctoNEAR
per byte, and the gas price on the day). Fixed part: the wasm's locked storage (size in bytes × 1e19; the local build
is 275,053 bytes ≈ 2.75 NEAR, [VERIFY] with the cargo-near build) plus the three accounts' minimum balances and the
0.05 NEAR reserve. Budget = `fixed + cap × per_mint`, plus 25 %. *Illustrative only:* at 990 bytes ≈ 0.0099 NEAR of
storage plus about 0.001 to 0.003 NEAR of gas, 1,000 passes are about 11 to 13 NEAR plus the fixed part. Locked
storage is not returned (this contract cannot delete tokens): treat it as spent. Convert to fiat only on the day.

## 4. Mainnet, in order

1. **SIGNS (your wallet):** create the contract and minter accounts as subaccounts of your account.
2. **SIGNS (your wallet):** fund the contract account (fixed + `cap × per_mint` from the rehearsal, + 25 %) and the
   minter account (at least the allowance).
3. **SIGNS (contract account's key):** deploy and call `new` (deploy-args with `--network mainnet`).
4. **SIGNS (minter account's key):** add the function-call key: receiver = the contract, method `mint_pass`, a hard
   allowance. Private key only into `FTF_PASS_KEY` on the relayer host.
5. Relayer: `FTF_PASS_NETWORK=mainnet`, contract, minter, key, `FTF_PASS_ENABLED=1`; game:
   `pass-deployment.js` `network: 'mainnet'`, `contract`, `explorerBase: 'https://nearblocks.io/txns/'` ([VERIFY] the
   mainnet URL format).
6. Mint one pass to **your own** wallet through the game (the real end-to-end test); see it in the wallet and on
   NearBlocks.
7. **SIGNS (contract account's key), IRREVERSIBLE:** delete every access key of the contract account (the
   `delete-keys` line printed by deploy-args). The code can never change after this.

## 5. Post-deploy checks (all READ-ONLY; paste into the PR and the README `Proof:`)

- `view_account` of the contract: `code_hash` equals build.sh's base58 hash.
- `near account list-keys <contract>`: **empty**.
- `near account list-keys <minter>`: exactly one function-call key, `receiver_id` = the contract, `method_names` =
  `["mint_pass"]`, the intended allowance.
- `pass_info`: the intended caps, `paused: false`; `nft_total_supply` = 1; `is_whitelisted(<your wallet>)` = true.
- The export list (build.sh / `wasm-info.mjs`): no approval, burn or royalty method; `nft_transfer` present.
- Relayer `/api/health`: `pass: {network: 'mainnet', contract, configured: true, enabled: true}`, never the key.
- `node tools/pass/watch.mjs --network mainnet --contract <contract> --minter <minter> --minter-key <PUBLIC key> --once`.

## 6. Key custody and the day

- `FTF_PASS_KEY` only in the relayer host's environment: never in the repo, CI, chat or screenshots. Your owner key
  stays offline.
- Rotation: `set_minter` to a new account (SIGNS, owner key), then delete the old key. Compromise: `pause` (SIGNS,
  owner key), delete the key, keep the caps.
- Stop controls: `FTF_PASS_ENABLED=0`, a `STOP` file in `FTF_PASS_DIR` (halts sending within 10 s; claims keep
  queueing), contract `pause`, the caps.
- Watch (READ-ONLY): `node tools/pass/watch.mjs ... --every 60` (allowance, available balance, pass_info, contract
  keys, relayer health).

## 7. What may be said, and when

Only after §5 passes and you confirm: "Real on mainnet: a free whitelist pass minted to your wallet by the game, from
an immutable contract, with every cap on chain." Never that it is valuable or tradable for value. Before that: "Built,
dormant" (`network: null`) or "Real on testnet" (rehearsal with the banner). **If funding and deployment are not done
by Fri 20:00 Kyiv:** ship `network: null` or `testnet` with the rehearsal banner. Never present a rehearsal as mainnet.
