# Score boost: ten moves, highest impact for the effort first (15 Nov 2026)

Read as a NEAR hackathon judge against the published criteria (technical implementation, design, impact,
originality, sustainability; first layer: AI screening of reproducibility and claims). "Done" items are on
`wip/jury-fixes` or `wip/p0-opus`; **owner** items need the owner's accounts.

| # | Move | Criterion | Effort | State |
|---|---|---|---|---|
| 1 | Send the form, post the X demo with the 60 s jury cut (@NEARProtocol, #NEARHackathon), push the `hackathon-submission` tag: without them the entry is not judged at all | eligibility | 15 min | **owner** (`docs/submission/owner-steps.md`) |
| 2 | No game of chance with stakes in the live build: the market's Loom Dice tab (roll-under, 4 % house edge, on play silk) is off; README and the judge docs no longer mention play-money games | selection risk | 10 min | done, `64866b74` |
| 3 | Nothing that reads as derived from a film: the first chapter was titled "Arrival" (降临 in Chinese, the film's release title) and the README cited the film; now "Landfall", no film reference. The wheel item is no longer named after a TV show | originality, selection risk | 10 min | done, `64866b74` |
| 4 | Credits that match the files: the README said every model is procedural, but the shipped Iris and Elise, the Wayfarer, the dragon and the Shoal crystals start from the owner's Tripo generations; README and `docs/art/manifest.md` now say so | technical (claims), screening | 10 min | done, `5a358e98` |
| 5 | Merge `wip/p0-opus` before the tag: on a mid laptop (CPU x4) the boss fight drew the town 700 m away (1390 draw calls a frame, now 470; p50 42 to 31 ms), the town's first walk froze for 1.2 s (now 0.1 s); the serpent's stagger now plays, E opens the chest and flies home, the reward is the real legendary chest | design, technical | lead merge + CI | **lead** (`24b36983`) |
| 6 | GitHub About, website and topics (suggested text in `score-gaps.md`): screening agents and judges start from the repo card | impact | 2 min | **owner** |
| 7 | Regenerate `docs/STATS.md` on Linux (`node scripts/stats.mjs --write`) so the counts in `AGENTS.md` match the suites a screener runs | technical (reproducibility) | 10 min | **lead** |
| 8 | Keep the relayer and the traders funded and running through 18.11 (judging): the live market numbers are the strongest Games-track proof (22,696 trades on 14 Nov by 23:00 UTC, 20 trader accounts) | technical, impact | check daily | **owner** |
| 9 | A 10-second clip of the town's opening drone shot and the serpent fight at the top of the README (both recorded on a real GPU, 60 fps, in `docs/media/`) so a reader sees the game before the tables | design, impact | 30 min | open |
| 10 | A mainnet deployment of one contract with its full-access keys deleted (the whitelist-pass runbook) | sustainability | 1–2 h | **owner** (agents never sign mainnet) |

## Checked in this pass, nothing to fix

- No secrets in the repository: only public keys (`ed25519:7w8h…` in `docs/near.md`, the guest key's public half).
- The README's external links answer (the live site, `?judge=1`, `?shoal=arena`, `cheat.html`, `pulse.html`,
  `economy-lab.html`, the relayer's `/api/health` and `/api/market/stats`); NearBlocks answers 403 to scripts only
  (a browser opens them); the compare link waits for the `hackathon-submission` tag, as the README says.
- Every relative link in the README points at a file that exists.
- The live claims hold on 14 Nov 23:00 UTC: the market relayer is trading (`/api/market/stats`: 20 traders, 22,696
  trades today), the TEE agents answer (`/api/health`: `tee.configured: true`), the chests and the guests contracts
  are configured.
- `cheat.html` ("Try to Cheat") is the security page with six attacks on the guards, not a cheat tool: kept.
- Multiplayer on the live presence: two fresh guests see each other by name where they stand, share the hillside
  spiders, and only the killer gets the loot (one fix on `wip/p0-opus`: name tags near the camera).
