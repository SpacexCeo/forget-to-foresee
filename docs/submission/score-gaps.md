# Score gaps against the strongest entries (13 Nov 2026, evening)

What the highest-scored Games and NFTs entries get credit for, as patterns, and where this repository stood against
each one. Scored on the published criteria: technical implementation, design, impact, originality, sustainability.
"Before" is the state at `684a97af`; "After" is this branch. Owner-only items are marked **owner**.

## Patterns that earn points

| Pattern | Why judges credit it |
| --- | --- |
| An autonomous economy that is visibly running: tens of thousands of transactions, each NPC an account with its own key | Proves the chain is the game's ledger, not decoration; anyone can open an explorer page and see it move |
| CI on every push, with a badge | A screener can trust the test counts without running them |
| A short "what uses AI and what does not" section that matches the code | Screeners check AI claims first; one wrong label costs more than the feature earns |
| `AGENTS.md` that tells a reviewing agent how to verify the repo | The first judging layer is coding agents |
| One judge URL and a ten-minute table: step, where, what you see, the on-chain proof | Judges stop at the first step that fails or is unclear |
| Pages that show the economy live (a pulse page, a week fast-forwarded) | Makes the volume legible without an explorer |
| Independently replayable or countable activity | Numbers that a stranger can recount score higher than numbers a team reports |
| A mainnet contract with its keys deleted, plus a security review file | Shows the design survives without trusting the team |
| A no-wallet first session | Judges play longer when nothing asks for a signature |

## Gaps by criterion

| Criterion | Pattern | Before | After (this branch) |
| --- | --- | --- | --- |
| Technical | Visible running economy | 20 trader accounts with their own keys and ~18,000 trades a day, but the README top did not show it; the economy row quoted the 22,000/day target, not a measurement | README top: a live-numbers block with a link per trader account and to the independent count (`docs/proof/`) |
| Technical | CI on every push | `pages` (game tests, `main` only, `game/**` paths) and `contracts` (path-filtered); relayer, server, presence and the count tool had no CI; no badge | `tests` workflow on every push and PR: game, server, relayer, presence, count tool, on Node 20 and 22; badges in the README |
| Technical | Independent recount | `tools/count/count.mjs` existed, but on Windows it exited 0 and printed nothing (the main-module check compared a `file://` URL with a Windows path); same for `runway.mjs`, `verify-tee`, `stats.mjs` and the replay-link script | Fixed; the README's verify block lists the recount command next to the proof verifiers |
| Technical | Tests that pass anywhere | Two relayer CLI tests failed on Windows (tool path from `URL.pathname`) | Fixed (relayer suite green on Windows and Linux) |
| Impact | Honest AI section | README table correct; `docs/ai-use.md` still said the clan strategy layer was "built, not live" (live since 13 Nov, 21 of 21 decisions today from the model) | `docs/ai-use.md` matches the live relayer and links the live `strategy` field |
| Impact / Technical | README claims match what runs | Sign-in row said the flag was off and the routes undeployed (both live); the loop section said the market was "built, not deployed" (the player market is live); the track-hint row said no login of any kind | Rows rewritten from the live relayer, `features.json` and the RPC |
| Technical / Sustainability | Security review file | `docs/nft-threat-model.md` and `docs/security-town.md` existed, but nothing at the root and no single page on keys, caps and the relayer | `SECURITY.md`: keys and their scopes, caps and kill switch, what an attacker can and cannot do, known limits, how to report |
| Technical | `AGENTS.md` for reviewing agents | Only the English-only rule | A reviewer section: what to run, what each command prints, where the claims live |
| Sustainability | After-the-hackathon plan | Mainnet existed only as the whitelist-pass runbook; costs measured but not summarized | README "After the hackathon": what is mainnet-ready, what is not, running costs, single points of failure |
| Sustainability | Mainnet contract with keys deleted | Nothing on mainnet | Unchanged: **owner** (agents never sign mainnet). The whitelist-pass runbook is the path |
| Design | Judge path | 7-step judge path with a proof column and `?judge=1` in-game panel | Unchanged (already at the pattern) |
| Design / Impact | Video in the repo, X post, catalog entry | Trailer drafts in `docs/submission/`; no posted demo, no catalog registration | Unchanged: **owner** |
| Originality | — | Commit-reveal seasons, memory-shard NFTs, NFT-as-account, NPC-wallet economy | No change needed |
| Track fit (Games) | Social / e-mail login | Wallet sign-in live (NEAR, EVM, Solana); no e-mail or Google | Unchanged; the README states it exactly |
| Track fit (Games) | NEP-245 items in use | Contract deployed, supply 0 on 13 Nov | Unchanged; stated as such |

## What only the owner can do

- Post the X demo with the video, register in the catalog, send the form (one attempt).
- Set the GitHub About text, website and topics (suggested text below).
- Top up the trader wallets so the economy keeps trading through 14 Nov (see the handoff).
- After 00:00 UTC 15 Nov: run the final count and commit it (`node tools/count/count.mjs --window 2026-11-14 --write`).
- Any mainnet deployment.

Suggested GitHub About: "3D strategy game on NEAR testnet: prophecies sealed on chain before play, memory-shard NFTs,
and a town of 20 NPC traders with their own keys trading on chain all day. Play in the browser, no wallet."
Website: `https://spacexceo.github.io/forget-to-foresee/`. Topics: `near`, `near-protocol`, `nep-171`, `nep-245`,
`web3-game`, `threejs`, `commit-reveal`, `tee`, `nearhackathon`.
