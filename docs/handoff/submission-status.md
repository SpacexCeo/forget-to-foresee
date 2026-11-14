# Submission status (audit 12.11.2026, 12:00 Kyiv)

**Superseded (14.11):** presence and the TEE path are live, the tests have grown; the current state is the README live block, `docs/STATS.md` and `docs/submission/self-review.md`. Kept as the 12.11 record.

Checked against `docs/hackathon-rules.md` (rules from https://nearhackathon.com/HACKATHON.md, last compared 08.11 —
re-read it before submitting), current `main` (`86bb5b0`) and the live sites. Deadline: **14.11 23:59 UTC = 15.11
01:59 Kyiv**; the 13.11 20:00 freeze was dropped (the owner sets a stop-merging time on 14.11). Every step marked **owner** needs the owner's account, wallet or
confirmation; agents never post, submit, tag or sign for the owner.

## What is true today (checked live)

| Item | State | How it was checked |
|---|---|---|
| Hosted demo | **Up**: `https://spacexceo.github.io/forget-to-foresee/` and `?demo=judge` answer 200; last deploy 12.11 09:44 UTC | `curl -sI` |
| Public repo + MIT licence | **Done** | GitHub |
| Tests | **Green**: `bash scripts/verify-all.sh --skip-rust` → game 876, server 31, relayer 32, fail 0 | run on `86bb5b0` |
| Relayer (owner's server) | **Up, old version**: `/api/health` answers (guests 15, today 9 of 200) and the free mint works; `/api/agent/*`, `/api/chest/open`, `/api/wheel/claim` answer **404** (not redeployed yet) | `curl` |
| Presence (shared town) | **Not deployed**: `/presence/health` 404; no `presence` URL in `game/src/net/day1-deployment.js`, so the hosted town is single-player | `curl`, source |
| NEAR AI Cloud | **No credits**: chat answers 402 `no_limit_configured`; the attestation check passes | `curl`, `tools/verify-tee` |
| Contracts on testnet | season-commit, memory-shard, agent-card, guests, heroine / companions, `ledger.` (track records + TEE decisions), `chests.` (deck committed, **seed not fixed**), `skins.` (Sheriffchenko, cap 100, **0 minted, minter key not set**) | RPC views |
| README real/mock table | **Updated** in this audit: TEE row (not live, why), wheel skin row (new), shared town row (built, dormant), "multiplayer" removed from "Not built", repository map | this branch |
| Tag `pre-hackathon` | **Exists** | `git ls-remote --tags` |
| Tag `hackathon-submission` | **Missing** (created at freeze) | `git ls-remote --tags` |
| Repo description | Set; **topics empty, website empty** | GitHub search API |
| X post | **Not posted** (`docs/submission/x-post.md` is a draft; `apply-form.md` still has `demoUrl: TODO(owner)`) | files |
| Submission form | **Not sent** | `docs/submission/apply-form.md` |
| Video | Cuts exist in `docs/submission/` (`trailer_v3.mp4` 12 MB, `trailer_vertical_15s.mp4`); the 60 s jury cut is specified in `jury-video.md` | files |

## What the owner still has to do, in order

1. **Make the live features live (optional but they are in the README as "built, not live").**
   - Add credits / a spending limit in the NEAR AI Cloud account (otherwise the TEE agents and the chest seed stay
     offline; the game falls back to scripted lines and sealed chests).
   - Give `docs/handoff/relayer-tee-deploy.md` to the local executor: relayer redeploy with the TEE, chest and wheel
     routes, the opener and minter keys made on the server, the presence container, the proxy route, health checks.
   - The lead then runs step 9 of that runbook (add the two keys, write the presence URL, fix the chest seed, verify).
   - If any of this is not done by the freeze, the README already says so; nothing else needs to change.
2. **Freeze and tag** (`docs/submission/owner-steps.md` §1): on `main`, `bash scripts/verify-all.sh --write`, commit
   the numbers, then
   ```bash
   git tag -a hackathon-submission -m "NEAR Hackathon submission" main && git push origin hackathon-submission
   ```
3. **Repository page** (GitHub → the repo → ⚙ next to About):
   - Website: `https://spacexceo.github.io/forget-to-foresee/?demo=judge`
   - Topics: `near`, `near-protocol`, `nearhackathon`, `threejs`, `webgl`, `game`, `nft`, `tee`, `ai-agents`,
     `merkle-tree`
   - The description names the company ("RAEN Computers"); keep or remove as you prefer (the README's "Related
     projects" section says RAEN is your company).
4. **Video**: render or pick the 60 s jury cut (`docs/submission/jury-video.md`) and check every caption against the
   README's real/mock table (no "not deployed", no "player-owned agent NFT", no "minted in every season", no live
   TEE/chests/multiplayer unless step 1 is done).
5. **X post** (`docs/submission/x-post.md`): must say "built at NEAR HACKATHON", tag **@NEARProtocol** and
   **#NEARHackathon**, attach the video. Paste its URL into `docs/submission/apply-form.md` → `demoUrl`.
6. **Submission form** (`docs/submission/apply-form.md`): one attempt per repository. Fill the owner-only fields
   (name, email, mainnet `nearAddress` — a mainnet account for the payout, not testnet, consent), generate the
   `requestId` once, review the printed payload, then send. Corrections go through
   https://nearhackathon.com/request-changes, never a second submission.
7. **Keep the demo up** until at least 18.11 (ideally 25.11), and the relayer too if step 1 was done.

## Found in this audit, for the team (not owner actions)

- `scripts/stats.mjs` (and so `verify-all.sh`) does not run `contracts/skin-nft` or `presence/` tests; add
  `'skin-nft'` to `CONTRACTS` and a `presence` row (owner of `scripts/`: the jury worker).
- The README's attestation command was marked "no key"; it could not be checked without a key from our container
  (the network proxy adds one), so the line now says to set `NEARAI_API_KEY` if the endpoint asks for one.
- `docs/hackathon-rules.md` still says "State below: 09.11"; its checklist items are current except the NEAR-role
  item, which can also list `ledger.`, `chests.` and `skins.` once they are live.
