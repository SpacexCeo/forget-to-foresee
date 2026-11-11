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
