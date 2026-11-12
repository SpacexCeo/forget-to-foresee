# Backlog audit (lead, 12 Nov 2026, late evening)

Everything asked for, promised or started across the sessions that is not finished, not verified, or done badly and not redone.
Grouped by who has to act. "In progress" = a worker has it right now.

## 1. In progress (workers, tonight)

1. Settings → Controls tab: keyboard diagram + bindings list; touch diagram on phones (combat worker). Owner bug: the tab was empty.
2. Batch chest opening, client side: Open 1 / 5 / all, reveal sequence, summary grid (economy worker). Server side merged (PR #136).
3. Guest expedition logs stored by the relayer (Q4), so the endgame pass can check "10,000 silk paid at the portal" end to end (story worker).
4. Stall window: buy / sell monster resources with the guest key (art worker).
5. Final in-game animation pass of both heroines, one film (Fable).

## 2. Started but not finished / not verified

6. Inside-Shell panel fold on phones: merged (PR #112) but never checked on a real phone or in a browser on the archipelago.
7. Monster resource icons and the bag "Resources" filter: built by the combat worker, reverted to avoid a second drop roller; to re-add under the shared ids (spider_silk_thread, chitin_plate, veil_dust, ash_ore, crown_shard).
8. Town market ticker in the game: still behind `?town=1`; the lead promised to make it default once real trades run.
9. Tournament: entry fee and silk purse exist in `ftf-town`, but the game's tournament card still says "no prizes" and nothing calls `enter_tournament` / `settle_season` from the game; settling is a dry-run tool only.
10. Invest in a stall: on chain (`invest_stall` / `claim_stall`), no game UI.
11. Leaderboard: the Shell board reads `board/latest.json` or `/api/board/latest`; neither is published, so it shows "local preview".
12. Bots cannot win the boss quest (`hunt` math: crown unwinnable); owner decision needed.
13. Clan LLM strategy: built; the relayer on the server runs an older commit, so it is not running there yet (see 3.1).
14. Pass eligibility: wired, but nobody is eligible until item 3 lands and the relayer is updated.
15. README real/mock table: rows for the town economy and items still say "Built, not live" although `ftf-town` and `items` are deployed (traders not sending yet). To correct.
16. Lore canon (Iris is a doctor-linguist from another planet, 2048; clans are scripted unless the LLM layer runs): README line 3, `docs/submission/x-post.md`, `jury-video.md`, `game/cine/jury.js` captions still call Iris or the clans "AI". The lead offered to fix after the owner's confirmation; not done.
17. `scripts/stats.mjs` on Node 23+ (parses only `# pass`, not `ℹ pass`) and the stale `docs/STATS.md`: reported in the competitive spec, not verified fixed.

## 3. Owner's hands (server, accounts, decisions)

1. **Relayer update to current `main`** (resource desk, batch chests, pass eligibility, clan strategy, town traders): pull + restart on the server.
2. Start the traders: `FTF_TOWN=1` (dry run) → report → `FTF_TOWN_SEND=1` after the lead's OK.
3. `node scripts/mint-pending.mjs` for recorded Sheriffchenko wins.
4. Batch chest multi-action check: `node scripts/chest-batch-test.mjs <guest> 2` then `--send`.
5. Items minter key on the server (`FTF_ITEMS_MINTER`, `FTF_ITEMS_KEY`), public key to the lead.
6. Testnet NEAR: Elliot's 500, or manual near-faucet.io top-ups (the 26 wallets hold 0.3 each, about a day).
7. Guests fund (`guests.ftf-coordinator.testnet`, about 4.7 NEAR, 0.05 per guest) before any audience push.
8. Mainnet whitelist pass: decide by Fri 12:00 (runbook `docs/mainnet-pass-runbook.md`).
9. Open questions never answered: "pledge / reward share" or "stake" in the game; the Shell monument as the leaderboard OK?; new skill definitions; consent / likeness for the Sheriffchenko photo; which "magic" repository was cloned (license check).
10. Sounds: the synth SFX are placeholders the owner approved "for now"; a licensed sound base was asked for and never chosen (picks from SFX demo v2/v3 pending).
11. GPT image handoffs never received: HUD-001/002 (icon set), WHEEL-001 (wheel frames, 3D wheel), SKIN-001 (Sheriffchenko skin + NFT card); `skins` media is empty.
12. Clore GPU server (order 2432278) ends around Fri midday.
13. Submission: repo About/website/topics, video check/re-render (texts changed: no judge path, silk only), freeze numbers + `hackathon-submission` tag, X post, form (once).

## 4. Planned, not started

18. Crafting as an NFT merge (forge contract): design in `docs/plans/live-market-roadmap.md`; after the freeze.
19. Social / e-mail login; NEAR Intents (roadmap "if time").
20. Competitive spec items not done: registration kit + payload checker (Move 1), chain counter `tools/stats/count.mjs` and stats page (Move 5), shard NFT threat model + transfer tests (Move 6), "NEAR work 1–14 Nov" doc (Move 8), video script + X post draft refresh (Move 9).
21. Story spec P2: prologue laboratory scene, eight-leg spider model, hourly on-chain leaderboard snapshot (K3–K5).
22. HUD settings gear inside the tray; the HUD worker was stopped by the owner.
