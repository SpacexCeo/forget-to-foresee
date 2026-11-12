# Owner's manual steps (lead, 12 Nov 2026, updated through the evening)

Everything below needs the owner's hands, keys or accounts. The lead and the workers cannot do these. Tick each one when done.
Times are Kyiv. Feature freeze Fri 13 Nov 16:00, hard freeze 20:00, deadline Sat 15 Nov 01:59.

## A. Testnet NEAR and AI credits (unblocks the economy and the AI clans)

1. **Send the message to Elliot** asking for 500 testnet NEAR to `ftf-coordinator.testnet` (text given in chat).
2. **Faucet top-ups** (10 NEAR per new account; rate limited, best from different networks or days). On your PC with near-cli:
   `near account create-account sponsor-by-faucet-service ftf-fund-5.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create`
   then send the balance to `ftf-coordinator.testnet` (keep 0.1 NEAR on the fund account).
3. **NEAR AI Cloud credits**: the account answers 402 "No spending limit configured". Set a spending limit / add credits in the NEAR AI Cloud dashboard. Until then the TEE agents and the AI clan strategy stay off (the game says so).

## B. Relayer server (one redeploy unblocks agents, chests, wheel prize, market)

The deployed relayer at `159-195-130-113.sslip.io` is an old build (agents, chests, wheel claim, presence answer 404).
Follow `docs/handoff/relayer-tee-deploy.md` step by step on your server:
1. Pull `main`, rebuild and restart the relayer container (with the `ftf-relayer-data` volume).
2. Generate the minter keys on the server (they never leave it): `node relayer/scripts/chest-key.mjs FTF_SKIN_KEY` (prints the public key). Send the lead the **public** key only; the lead adds it to `skins.ftf-coordinator.testnet`.
3. After the key is added: `node relayer/scripts/mint-pending.mjs` mints any recorded Sheriffchenko wins.
4. When the town economy is deployed (section C), the trader keys are generated the same way on the server (the worker's runbook will name the script) and `FTF_TOWN=1` turns the trader loop on.

## C. Town economy (`ftf-town` contract): your yes is needed

The contract is built and tested (36 tests). Before the lead deploys it, answer:
- [ ] Scope P0 and the cut line Fri 14:00 approved?
- [ ] AMM (wool/silk pool) in P0, or rewards from fees at a fixed rate first?
- [ ] Words in the game: "pledge / reward share" (recommended) or "stake"?
- [ ] Wool moves between players only as whole deeds (recommended), or as a free token?
- [ ] Deploy `ftf-town` on testnet and fund 20 trader accounts (about 6 to 7 testnet NEAR per day): yes / no.

## D. Story, quests, endgame pass (spec rev 2)

Answer the two open questions from the spec:
- [ ] The leaderboard as a Shell monument on the square: OK?
- [ ] What exactly the whitelist pass gives its holder (needed for the in-game text and the legal note).

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
