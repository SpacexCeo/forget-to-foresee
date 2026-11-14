# Mainnet runbook

> **OWNER-GATED.** Agents wrote this page. They never create mainnet accounts, fund them, deploy or sign. Every step
> that spends real NEAR is marked **SPENDS**. The deploy scripts refuse mainnet unless `FTF_MAINNET_YES=1` is set.
> The whitelist pass has its own runbook: [`../mainnet-pass-runbook.md`](../mainnet-pass-runbook.md).

## What is already done

The code is ready for mainnet. Moving over means creating and funding the accounts, deploying the same contracts,
and setting one switch in three places. No code changes are needed.

| piece | switch | where the per-network values live |
|---|---|---|
| game (GitHub Pages build) | repository variable `FTF_NEAR_NETWORK=mainnet` → `VITE_FTF_NEAR_NETWORK` (`.github/workflows/pages.yml`) | `game/src/net/network.js` (RPC, explorer, wallet, label, account ids); records `game/src/net/{near,day1}-deployment.{testnet,mainnet}.js` |
| relayer | `FTF_NEAR_NETWORK=mainnet` in `/opt/ftf/relayer/.env` | `relayer/lib/network.js`; the specific `FTF_*_CONTRACT` / `FTF_RPC_URLS` overrides still win |
| deploy scripts | `FTF_NEAR_NETWORK=mainnet FTF_MAINNET_YES=1` | `contracts/scripts/day1-lib.sh` (suffix, RPC, `network-config`) |
| presence | nothing | it never talks to NEAR |

Testnet is the default everywhere: unset, or any value but `mainnet`, means testnet. Two tests fail on a
hard-coded testnet account, host or label in the code: `game/tests/client/day1-mint.test.mjs` and
`relayer/tests/core.test.mjs`.

**NEAR Intents.** The game calls no Intents contract and settles nothing through Intents. Account login only accepts
the same key kinds (NEAR NEP-413, EVM personal_sign); see [`../account-login.md`](../account-login.md). There is
nothing to deploy for it.

**Testnet check, 14.11 ~19:45 UTC, all PASS.**
- Relayer and presence units are active, with no errors in the journal.
- `/api/health` shows 69 guests (13 today, cap 200), and CORS answers for the Pages origin.
- `create-guest` made a real guest with a full-access key and 0.05 NEAR.
- Every route answers: the NEP-413 nonce, town gate and market stats (20 traders, 4 failures in ~21,000 actions),
  p2p stats, pass status, and the chest, wheel and act validation.
- The presence websocket sends welcome, history and mobs.
- Contract views answer on guests, chests, skins, items, seasons and companions.
- The data dir `/var/lib/ftf-relayer` is written live (town-state, town-log).
- Email login is **not configured** on the live relayer (no `RESEND_API_KEY`, `FTF_EMAIL_FROM` or
  `FTF_EMAIL_KEY_SECRET`), and the pass runs dry (no `FTF_PASS_KEY`).

## 1. Accounts to create and fund (SPENDS)

All of these names were free on mainnet on 14.11 (checked with a `view_account` read). The amounts come from the
testnet deploy defaults and the storage the testnet contracts use now (1 NEAR locks 100 KB). Each amount has some
margin.

| account | created by | role | storage now (testnet) | fund |
|---|---|---|---|---|
| `ftf-coordinator.near` | you (wallet or `near account create-account fund-myself ftf-coordinator.near …`) | signer of every deploy, owner of the contracts | – | **45 NEAR**: it pays for the sub-accounts below, plus ~2 NEAR of gas |
| `heroine.ftf-coordinator.near` | `day1-deploy.sh` (`HEROINE_FUND`, default 6) | heroine NFT; each token is an account it funds (`account_fund` 0.3 NEAR) | 435 KB = 4.35 | 6, plus the guest budget (§4) |
| `companions.ftf-coordinator.near` | `day1-deploy.sh` (5) | dragon NFTs | 273 KB | 5 |
| `guests.ftf-coordinator.near` | `day1-deploy.sh` (6) | creates a guest account per player and funds it (`fund` 0.05 NEAR) | 184 KB | 6, plus the guest budget (§4) |
| `ledger.ftf-coordinator.near` | `ledger-deploy.sh` (3) | agent track records | 166 KB | 3 |
| `chests.ftf-coordinator.near` | `chest-deploy.sh` (15) | loot chests; the opener key's allowance is 3 | 297 KB | 15 |
| `skins.ftf-coordinator.near` | `skin-deploy.sh` (3) | wheel grand prize (cap 100) | 218 KB | 3 |
| `agents.ftf-coordinator.near` | `contracts/agent-card/scripts/mint-judge-card.sh` (5) | agent cards (optional) | 314 KB | 5 |
| `ftf-town.near` | you, or `town-deploy.sh` when `TOWN` is a sub-account of the signer | town economy; pays for its 26 wallets | 416 KB | **13** (4.2 storage + 26 × 0.3 wallets + 1) |
| `trader-01…20.ftf-town.near`, `clan-*.ftf-town.near` (26) | `town-deploy.sh` (`WALLET_FUND` 0.3 each) | market agents' wallets | – | from the town |
| `items.ftf-town.near` | `items-deploy.sh` (`ITEMS_FUND` 3, signed by the town) | NEP-245 town items | 201 KB | 3 (from the town) |
| `ftf-seasons.near`, `ftf-shards.near` | season-commit / memory-shard scripts | judge-season proofs (optional; the mainnet build shows "not committed" without them) | 203 / 289 KB | 3 + 3 |

**Total to start: ~75 NEAR** (coordinator 45, town 13, the optional season and shard contracts 6, a guest budget for
the first days 10). This does not count the market's gas (§4).

Use **new keys for every mainnet account**. Never copy a testnet key.

## 2. Deploy (SPENDS)

You need near CLI ≥ 0.11 and cargo-near, with the keys in `~/.near-credentials` (legacy keychain). Run from the repo
root in Git Bash:

```bash
export FTF_NEAR_NETWORK=mainnet FTF_MAINNET_YES=1
bash contracts/scripts/day1-deploy.sh      # heroine, companions, guests (+ minter wiring); writes game/src/net/day1-deployment.mainnet.js
bash contracts/scripts/day1-guest-key.sh   # create_guest key on guests.*: PUBLIC part to the record, PRIVATE part to game/.env.local (move it to the relayer, below)
bash contracts/scripts/ledger-deploy.sh
bash contracts/scripts/chest-deploy.sh     # deck commit + opener key
bash contracts/scripts/skin-deploy.sh      # minter key
TOWN=ftf-town.near bash contracts/scripts/town-deploy.sh    # town + 26 wallets (TOWN_TOPUP=<n> to fund the wallets from the signer)
TOWN=ftf-town.near bash contracts/scripts/items-deploy.sh
bash contracts/agent-card/scripts/mint-judge-card.sh       # optional: agent cards
```

The scripts are idempotent: every step checks whether it is already done, so a re-run after a failure is safe. Each
one writes the public ids into `game/src/net/day1-deployment.mainnet.js`. Commit that file, and check it shows
`"network": "mainnet"` and only `.near` ids; `day1-write.mjs` refuses to mix networks. The season contracts are
written by `node contracts/season-commit/scripts/write-deployment.mjs --network mainnet` (only if you deploy them).

The relayer URL in the mainnet record is the live server (`https://159-195-130-113.sslip.io`). Change `relayer` and
`presence` in `day1-deployment.mainnet.js` if mainnet gets its own host.

## 3. Relayer env for mainnet

The relayer serves one network per process. Back up `/opt/ftf/relayer/.env` (`cp .env env.bak-<date>`), then set:

| var | value |
|---|---|
| `FTF_NEAR_NETWORK` | `mainnet` |
| `FTF_DATA_DIR` | a **new** dir, e.g. `/var/lib/ftf-relayer-mainnet` (the testnet state must not leak into mainnet) |
| `FTF_EXPEDITION_DIR`, `FTF_PASS_DIR` | new dirs next to it |
| `FTF_GUEST_KEY` | the mainnet `create_guest` key from `day1-guest-key.sh` |
| `FTF_CHEST_KEY` | the mainnet `open_chest` key (`chest-deploy.sh`) |
| `FTF_SKIN_KEY` | the mainnet `mint_skin` key (`skin-deploy.sh`) |
| `FTF_COMPANION_KEY` | an `nft_mint` key on `companions.ftf-coordinator.near` |
| `FTF_ITEMS_MINTER`, `FTF_ITEMS_KEY` | the items minter account and its key |
| `FTF_TOWN_COORD`, `FTF_TOWN_COORD_KEY` (or `node relayer/scripts/coord-key.mjs` → `data/coord-key.json`) | the town coordinator key |
| `FTF_MARKET_KEYS` (or `node relayer/scripts/market-keys.mjs ftf-town.near` → `data/market-keys.json`) | trader wallet keys |
| `FTF_TOWN=1`, `FTF_TOWN_SEND=0` | the market **dry run** first (§4) |
| `FTF_MARKET_RPC`, `FTF_RPC_URLS` | drop the testnet values (the live file sets `FTF_MARKET_RPC`). Unset means the table's mainnet RPC; a paid RPC is advised (below) |
| `RESEND_API_KEY`, `FTF_EMAIL_FROM`, `FTF_EMAIL_KEY_SECRET` | only if email login should work (it does not on testnet today) |
| `NEARAI_API_KEY`, `FTF_ALLOWED_ORIGINS`, `ALLOWED_ORIGIN`, `TRUST_PROXY`, `PORT`, `HOST` | unchanged |

The contract ids default from the table (`guests.ftf-coordinator.near`, …). Set `FTF_GUESTS_CONTRACT`,
`FTF_CHESTS_CONTRACT`, `FTF_SKINS_CONTRACT`, `FTF_COMPANIONS_CONTRACT`, `FTF_HEROINE_CONTRACT`,
`FTF_TOWN_CONTRACT` or `FTF_ITEMS_CONTRACT` only if you chose other names.

**RPC.** The public mainnet RPCs (`free.rpc.fastnear.com`, `rpc.mainnet.near.org`) are rate-limited. Check their
current limits before launch, and put a paid endpoint first in `FTF_RPC_URLS`.

## 4. Running costs and limits (decide before launch)

- **Guests.** Each new player costs the guests contract its `fund` (0.05) and the heroine contract its token account
  (`account_fund` 0.3), plus storage and gas: **≈ 0.36 NEAR per player**. At today's `daily_cap` of 200 that is up to
  **~72 NEAR a day**. Lower it once deployed:
  - `guests.set_daily_cap` (or deploy with `DAILY_CAP=50`)
  - `guests.set_fund` (e.g. 0.02 NEAR)
  - `heroine.set_account_fund` (e.g. 0.1 NEAR)
- **Market.** On testnet the 20 traders make ~21,000 actions a day. On mainnet that gas comes out of the wallets
  (0.3 NEAR each) and drains them within hours. Launch with `FTF_TOWN_SEND=0` (dry run) and turn it on only with a
  per-wallet daily cap (`FTF_WALLET_DAY_NEAR`) and a rate (`FTF_MARKET_MAX_PER_MIN`) you are willing to pay for.
- **Key allowances.** These cap what a leaked key can burn: guest key 2 NEAR, chest opener 3, skin minter 1, trader
  wallets 2 each. Keep them low and top them up by hand.

## 5. Switch over

1. On the server: write the env from §3, then restart the relayer (`systemctl restart ftf-relayer`). Ask the lead
   first; the restart takes the testnet game offline for a few seconds.
2. GitHub, Settings → Variables: set `FTF_NEAR_NETWORK=mainnet`, then re-run the Pages workflow. **Do not** add the
   guest key to the Pages build; only the relayer signs.
3. **Read the player-facing copy.** A mainnet build swaps the network name, the `.testnet` suffix and the hosts in
   every UI string, in all five locales (`forNetwork` in `game/src/net/network.js`). Some testnet lines also promise
   "nothing here has real-world value". The NEP-413 login text already drops that clause on mainnet. Read the
   account panel, the chest and wheel cards and the Town Works panel, and adjust the English source where a line no
   longer holds.

## 6. Verify (read-only)

```bash
curl -s https://159-195-130-113.sslip.io/api/health          # contract: guests.ftf-coordinator.near, pass network mainnet
journalctl -u ftf-relayer -n 5                                # the startup line says "NEAR mainnet"
```

- Open the game, make a guest, then open the account on `https://nearblocks.io/address/<name>.guests.ftf-coordinator.near`.
- Open a chest. The link goes to `nearblocks.io` (no `testnet.`), and the proof re-check passes.
- Spin the wheel and check that a grand-prize claim shows `skins.ftf-coordinator.near`.
- `GET /api/town/gate?account_id=…` reports `contract: ftf-town.near`.
- `GET /api/market/stats` reports `dry_run: true` until you enable sending.

## 7. Rollback

Rolling back costs nothing on chain: the testnet contracts and data are untouched.

1. Server: `cp env.bak-<date> .env && systemctl restart ftf-relayer`. The testnet data dir was never touched.
2. GitHub: delete the `FTF_NEAR_NETWORK` variable (or set it to `testnet`) and re-run Pages.
3. Mainnet contracts keep their state. To stop spending:
   - delete or let lapse the function-call keys (`near account delete-keys …`);
   - set `guests.set_daily_cap 0`;
   - pause the market with `FTF_TOWN_KILL=1`.
