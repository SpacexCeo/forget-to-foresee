# Night plan 11→12 Nov (owner: close the whole list by 06:00 Kyiv, stand firm before the jury)

Source list: `docs/audit/2026-11-11/01-audit/QUICK-WINS.md` (QW-1..12, risks ranked in AUDIT.md §4),
`docs/handoff/town-v2.md` (owner art defects 1–8), open plan items. Lead merges to `main` via PR after
`npm test` + built-page smoke, roughly every hour. Fable is out of limit: all work on Opus 5.5 medium.

## Already closed (11 Nov)
- QW-2 Day 1 free mint live on the hosted page (relayer URL in the deployment record, PR #52).
- QW-5 WebGL / no-GPU graceful path (#46). QW-9 built-page smoke in the Pages workflow (#46).
- Boot hang at 30% (#45, #46); agent ledger deployed and verified end to end (#49, #51); town stair + wall (#48).

## Owners tonight
| Worker | Branch | Items, in order |
|---|---|---|
| Jury readiness (new Opus session) | `claude/jury-ready` | QW-1 README for the AI screener (short, every claim runnable, numbers from one source = QW-12); QW-3 one-click on-chain shard moment; QW-4 link preview + favicon (`og:` tags, image); QW-6 one visible "NFT does something"; QW-7 pinned toolchains + `scripts/verify-all.sh` green on a clean checkout; QW-8 dev-only weight out of the deploy; QW-11 premise and title in the first 5 s; then a fresh judge simulation (JUDGE-SIM steps literally) on the live site and fixes |
| TZ code (Opus) | `claude/hackathon-tz` | walk-in shops + sign/lantern swing; trading board and wheel props in the town; features 4–10 from the TZ |
| Art queue (Opus) | `claude/art-queue` | town-v2 owner defects 1–5 (cart cargo, gate doors + emblem, washed-out gate walls, window-box plants, gate from above) and the town QA sweep; then townsfolk round 2 + seated elder check; clan agents |
| Elise v2 (Opus) | `claude/elise-v2` | leg-vs-gown poke-through fixed, new clips for the new skeleton, phone model ≤ 24k tris, in-game check, sheet + video |

Rules: no file overlap between workers (jury readiness owns README, docs/, index.html head, CI, scripts/;
TZ owns game/src play and UI; art owns art/ and models; Elise owns Elise files only). One heavy GPU job at a
time on the server. Nothing lives only on the server.

## Lead
Hourly: merge finished work, smoke the live page. 05:00 Kyiv: full verification (npm test, contract tests,
live judge path `?demo=judge`, Day 1 mint, README truth table), summary for the owner by 06:00.
Owner only (not doable by agents): QW-10 re-cut 60 s video, repo description/topics/homepage, X post, submission form.

## Extended queues (owner, 11.11 23:00 Kyiv: five agents, a long list each, TEE in; everything we claim must be a strength)
Work top to bottom; when a list is done, report and take the next item from "Spare" below.

**1. Jury readiness (`claude/jury-ready`)** — the items above, then: a 2-minute judge guide (`docs/judge-guide.md`) that matches
the live site step by step; cross-browser smoke (Chromium, Firefox, WebKit via Playwright) and the phone layout; load
time and fps on a throttled profile with the numbers in docs/STATS.md; accessibility pass (focus order, labels,
reduced motion); X post draft, 60 s video shot list and the submission-form values as notes for the owner; final
JUDGE-SIM on the live site at about 04:00 Kyiv.

**2. TZ code (`claude/hackathon-tz`)** — counter camera in the chandelier; trading board + wheel props in the town; features
4–10; then: the Day-1 flow end to end on the live relayer (fly-in → welcome → nickname → two free-mint cards → flip →
claim to inventory → skin hint → quest); Tournament exit logic checked; console clean (no warnings) on the judge path;
5 locales complete (no missing keys); phone fps on the low tier; dragon companions client per
`docs/companion-nft-plan.md` (contracts first, then the in-game follow + card).

**3. Art (`claude/art-queue`)** — town-v2 defects 1–5 + QA sweep; townsfolk round 2 + seated elder; clan agents; then: the
new Shell look (alien object, not identical elongated forms) in game; shop interiors polish at the game camera;
three original dragons (pearl wind, teal tide, amber ember, 40–70 cm) rigged with a follow/idle/fly clip set for the
companion client.

**4. Elise v2 (`claude/elise-v2`)** — poke-through fixed, new clips, phone model ≤ 24k, in-game check, sheet + video; then
Elise as a selectable skin in the game (after the Day-1 claim) and her NFT card render from the final model.

**5. TEE agents (`claude/tee-agents`, new)** — LLM agents inside a NEAR TEE (lead proposal in `docs/decisions.md`, owner
approved the direction 11.11): NEAR AI Cloud confidential inference (OpenAI-compatible API, responses signed inside
the TEE + Intel TDX / NVIDIA attestation). Server side in `relayer/` (the key only on the server): `/api/agent/say`
(townsfolk speech) and `/api/agent/decide` (hired trader buy/sell/hold), each returning the text/decision, the chat
id, the TEE signature and the attestation summary; rate limits and a daily cap like the mint. Verification:
signature → signing address → attestation (tools/verify-tee, Node, prints PASS/FAIL), and the decision hash +
signature recorded on the ledger (`ledger.ftf-coordinator.testnet`, new method or a field in the track record).
Client: townsfolk talk and hired traders use it when available, with a "Verified in TEE ✓" detail panel (model,
attestation, signature, explorer link) and the scripted fallback when not. Tests with recorded fixtures; README row
honest. Redeploying the relayer on the owner's server needs the owner's local executor: write the task as
`docs/handoff/relayer-tee-deploy.md` (git pull, the key into `.env`, restart, health check). Stretch: Shade Agent
(relayer in a TEE on Phala with an agent contract checking the codehash) — needs a Phala account from the owner.

**Spare (any agent that runs out):** bug hunt on the judge path; flaky-test check (run `npm test` 3×); docs/STATS.md
refresh; screenshots for the README at 1280×800 and phone.

## Loot chests from monsters (owner, 11.11 23:45 Kyiv: on tonight's list, after the item in hand)
Combat outside the castle walls stays and grows. Monsters killed outside the walls drop **chests**; opening one is a
high-quality "open case" moment. **Season 1 supply: 10,000 chests, of which 10% (1,000) give an NFT**; the rest give
in-game rewards (items, shards, mechanical parts, silk, XP, titles from `game/public/assets/items/manifest.json`). The
randomness is verifiable through the TEE. Lead design (workers may refine, never claim more than it proves):
- **Exact supply, not just odds:** a season deck of 10,000 outcomes with exactly 1,000 NFT slots, committed on chain
  as a Merkle root before the season (the `season-commit` pattern); each opened chest takes the next index and reveals
  its leaf + proof, so anyone can check the 10% and that no outcome was changed.
- **Who gets which slot:** the shuffle seed is fixed only after the commit, from a TEE-signed value (NEAR AI Cloud
  signature, verified as in `docs/tee.md`) mixed with the NEAR block random seed in the contract; the seed, signature
  and attestation are public, so the deck order is reproducible and nobody (including us) could pick it in advance.
- **On chain:** a chest contract (or an extension of an existing one) counts opened chests (cap 10,000) and NFTs minted
  (cap 1,000), mints the loot NFT to the player's Day-1 guest account, and records each opening (index, leaf, seed
  ref); off-chain rewards go to the inventory. Testnet only; deploy through the lead.

| Worker | Part |
|---|---|
| TZ code | monsters outside the walls drop a chest (loot table client, pickup, inventory), the open-case UI: reel/spin or lid burst with rarity reveal, sound + haptics, a clear "Verified" link; reduced motion static |
| TEE | seed from the TEE signature + block seed, the deck generator + Merkle commit script, the chest contract (caps, mint, records), relayer endpoint to open a chest for a guest, `tools/verify-chest` (PASS/FAIL for any opening), tests |
| Art | chest model (3 rarity variants) with open animation + glow, loot NFT card frames, monster drop VFX; compressed glb + _m |
| Jury | README row and judge-guide step once it runs live; numbers from STATS |
