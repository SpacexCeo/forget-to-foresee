# Security

Forget to Foresee runs on **NEAR testnet only**. Nothing in it has real-world value, nothing is sold, and there is no
mainnet deployment. This page is the short version of the threat model: which keys exist, what each can do, what
bounds them, and what an attacker can and cannot do. Each claim names the code or test behind it.

Detailed models: [docs/nft-threat-model.md](docs/nft-threat-model.md) (every NFT and the NEP-245 items),
[docs/security-town.md](docs/security-town.md) (the town contract, 13 threats with their tests),
[docs/verify.md](docs/verify.md) (what the season commitment proves and what it does not).
Try the guards yourself: [cheat.html](https://spacexceo.github.io/forget-to-foresee/cheat.html) (six attacks, the guard,
the error and the test for each).

## Keys

No key is in this repository or in the hosted page. Server keys live in the relayer's environment on the owner's
server; the repository has only `.env.example`-style placeholders. Every server key is a **function-call key** on one
contract and a short method list, so a leaked key is bounded by what those methods allow.

| Key (holder) | Can call | Bounded by |
| --- | --- | --- |
| The player's guest key (made in the browser, kept in the browser) | Anything for the player's own guest account (it is that account's full-access key) | Only that account; the relayer never sees the private part |
| Guest creator (relayer) | `guests.ftf-coordinator.testnet` `create_guest` only | Contract daily cap 200, 0.05 testnet NEAR each, one guest per public key (`ERR_EXISTS`), per-IP rate limit |
| 20 trader keys, 6 clan keys (relayer) | `ftf-town.testnet` `trade` (traders); the game methods (clans) | Allowance per key (default 2 NEAR), daily spend cap per wallet (`wallet_day_near`, 0.5), one kill switch (`FTF_TOWN_KILL` or `data/KILL`), ~0.3 NEAR held per wallet |
| Town coordinator (relayer) | `*_for` methods (`pay_gate_for`, `pledge_for`, `claim_for`, `invest_stall_for`, `enter_tournament_for`, `trade_for`) | Each request is signed by the player's own key, checked with `view_access_key`; the contract records the request hash once; 40 moves a player a day, 20,000 in total |
| Dragon minter (relayer) | `companions.ftf-coordinator.testnet` `nft_mint` only | Token id fixed per heroine and reason, so a replayed claim cannot mint twice |
| Chest opener (relayer) | `chests.ftf-coordinator.testnet` `open_chest` | Deck of 10,000 with exactly 1,000 NFTs committed on chain; 30 openings per account a day; the contract draws, the opener cannot choose |
| Skin minter (relayer) | `skins.ftf-coordinator.testnet` `mint_skin` | Cap 100, one per account for ever (even after giving it away); the server re-derives the wheel roll |
| Items market key (relayer) | `items.ftf-town.testnet` `coordinator_transfer` | Unused 64-hex request hash per move; buyer and seller signatures checked by the relayer (see residual risk 1) |
| NEAR AI Cloud API key (relayer) | Inference only | Daily cap (`FTF_TEE_DAILY_CAP`, default 1,500), at most 8 answers in flight |
| Wallet sign-in (NEAR, EVM, Solana) | — | No key on our server: the wallet signs a one-time 10-minute nonce, the relayer checks the signature and links the wallet to the guest account (`relayer/lib/auth.js`, `relayer/tests/auth.test.mjs`) |

## What an attacker can and cannot do

| Attacker | Can | Cannot |
| --- | --- | --- |
| Anyone with a browser | Modify their own client: change local silk, local outcomes, local quest state (the rules run in the browser tab) | Change a sealed season (the Merkle root is on chain before trial 1); mint any NFT directly; move anyone's tokens |
| A player with a guest account | Act for their own account; trade, list and buy within the daily limits | Replay a signed request (request hash recorded on chain; off chain once per process with a 5-minute skew); get a second free mint, a second skin or a second dragon for the same reason; choose a chest draw |
| A stranger holding someone's token id | Read it | Transfer it: approvals are off on every NFT contract, `nft_transfer` is owner-only and needs 1 yoctoNEAR (a full-access key or a wallet confirmation) |
| Someone who steals one relayer key | Call that key's methods within its allowance and the contract's caps | Move NEAR out, deploy code, or call any other contract or method |
| The relayer operator (us) | Pause the town, rotate keys, add minters on testnet contracts | Rewrite a committed season root or a revealed leaf; re-roll a recorded chest opening (anyone can recheck with `node tools/verify-chest/verify.mjs`) |

## Known limits (accepted for testnet, documented)

1. **The browser runs the rules.** A modified client can change silk and outcomes in its own tab. The commitment
   proves what the Guests said, not what the player did ([docs/verify.md](docs/verify.md)).
2. **`coordinator_transfer` trusts the market key.** A leaked items key could move players' resources. The owner can
   empty the minter list at once; a contract-side signature check is the planned fix.
3. **The off-chain replay set lives in memory.** After a relayer restart a request signed less than 5 minutes earlier
   could be sent again; buys and town moves are still refused on chain by their request hash.
4. **One server.** The relayer and presence run on one VPS behind an `sslip.io` host name. If it is down, townsfolk
   fall back to their scripted lines and the game plays without a new account; contracts and recorded proofs on chain
   stay readable without it.
5. **Owner powers on testnet contracts.** Owners can add minters and change media. A mainnet deployment would delete
   the full-access keys after setup (see the whitelist-pass runbook, [docs/mainnet-pass-runbook.md](docs/mainnet-pass-runbook.md)).
6. **The wheel roll is public**, so a player can pick a winning spin within the allowed count ([docs/wheel-skin.md](docs/wheel-skin.md)).

## Checking it

```bash
cd relayer && npm test                       # signing, replay, caps, auth, TEE checks (offline fixtures)
for c in character-nft skin-nft loot-chest town-items memory-shard town; do (cd contracts/$c && cargo test --lib); done
```

## Reporting

Open a GitHub issue that says a security problem exists, without the exploit, and the owner (`SpacexCeo`) will reply
with a private channel. Testnet only: there are no funds at risk, so there is no bounty.
