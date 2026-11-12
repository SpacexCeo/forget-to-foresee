# Owner's manual steps (lead, 12 Nov 2026, updated through the evening)

Everything below needs the owner's hands, keys or accounts. The lead and the workers cannot do these. Tick each one when done.
Times are Kyiv. Feature freeze Fri 13 Nov 16:00, hard freeze 20:00, deadline Sat 15 Nov 01:59.

## A. Testnet NEAR and AI credits (unblocks the economy and the AI clans)

1. **Send the message to Elliot** asking for 500 testnet NEAR to `ftf-coordinator.testnet` (text given in chat).
2. **Faucet top-ups** (10 NEAR per new account; rate limited, best from different networks or days). On your PC with near-cli:
   `near account create-account sponsor-by-faucet-service ftf-fund-5.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create`
   then send the balance to `ftf-coordinator.testnet` (keep 0.1 NEAR on the fund account).
3. [x] **NEAR AI Cloud**: the key on the server works (TEE agents answer `verified: true`, verifier PASS).
4. **Gas for the traders**: the coordinator holds about 2.5 NEAR and `ftf-town.testnet` about 8 free; the 26 wallets have 0.3 each (about one day at full pace). Elliot's 500 NEAR, or manual top-ups on near-faucet.io per wallet, keep them running.

## B. Relayer server: done (12 Nov, your local session + the lead)

- [x] Relayer redeployed (systemd + nginx), TEE agents, chests (seed fixed, verifier PASS), skin minter key, presence (the game joins the shared town).
- [x] `ftf-town.testnet` deployed: 26 wallets with game-only keys, genesis 1,000 silk each. `items.ftf-town.testnet` (NEP-245) deployed with the five monster resources.
- [ ] **Start the traders**: on the server add `FTF_TOWN=1` to `.env`, restart, send the lead the start line (`market 20 traders`), `/api/market/stats` and the first journal lines (dry run). Then `FTF_TOWN_SEND=1` only after the lead's OK.
- [ ] **Sheriffchenko wins**: on the server `node scripts/mint-pending.mjs --dry-run`, then without `--dry-run`.
- [ ] **Batch chest check**: on the server `cd relayer && node scripts/chest-batch-test.mjs <guest with chests left today> 2` (prints), then with `--send` (one tx, two openings); send the lead the output.
- [ ] **Item minting**: make a minter key for `items.ftf-town.testnet` on the server (same pattern as the chest key), set `FTF_ITEMS_MINTER` + `FTF_ITEMS_KEY` in `.env`, send the lead the public key; the lead adds it as a minter.

## C. Town economy (`ftf-town` contract): your yes is needed

The contract is built and tested (36 tests). Before the lead deploys it, answer:
- [x] Scope P0 approved; the contract is deployed (12 Nov).
- [x] One currency, silk (owner): no wool, no wool/silk pool; rewards are a share of the silk fees.
- [ ] Words in the game: "pledge / reward share" (recommended) or "stake"?
- [x] (no wool) silk pledges move only as whole deeds.
- [x] `ftf-town` deployed with 26 wallets (12 Nov).

## D. Story, quests, endgame pass (spec rev 2)

Answer the two open questions from the spec:
- [ ] The leaderboard as a Shell monument on the square (built, opposite the portal): OK?
- [x] What the whitelist pass gives: a free NFT mint at the official launch (owner, 12 Nov).

Mainnet (only you, real NEAR):
- [ ] Decide by Fri 12:00 whether the endgame pass goes to mainnet. If yes: create/fund the mainnet account, run the testnet rehearsal first, then deploy `contracts/whitelist-pass` with the commands in `docs/launch/` (the art worker writes the exact runbook). If not ready by Fri 20:00, the game ships in testnet-pass mode with a clear label.

## E. Submission (only you)

Details and order: `docs/handoff/submission-status.md`.
1. GitHub repository About text, website (the Pages link) and topics. Do not mention any company name in it.
2. Watch the jury video against `docs/submission/video-check.md`; re-render lines if the texts changed.
3. Fri 20:00: hard freeze. Tag `hackathon-submission` on the final `main` commit (the lead prepares "Numbers at the freeze" first).
4. Fri 20:00 to 23:00: post on X with the video (@NEARProtocol, #NEARHackathon, "built at NEAR HACKATHON"), then submit the form **once** at nearhackathon.com with the post URL as `demoUrl`. Mainnet payout account, lead name, email, team size are yours.
5. Keep GitHub Pages and the relayer up until at least 18 Nov (ideally 25 Nov). Do not push to `main` or move the tag during judging (16 to 18 Nov).

## F. GPU server

Clore order 2432278 (RTX 5090) runs out around 13 Nov midday; balance about $3. Top up only if Fable still needs it after tonight; otherwise let it expire (backup zip was downloaded earlier).
