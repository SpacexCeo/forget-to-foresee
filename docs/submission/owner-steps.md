# Owner steps to submission (exact commands, nothing here is done by an agent)

`docs/submission/` is the single current submission package: this file (the order), `x-post.md` (the demo post),
`apply-form.md` (the form values and payload), `jury-video.md` (the video for the post) and the video pipeline notes
(`trailer.md`, `video-shot-list.md`). Dates: freeze 13.11 20:00 Kyiv, deadline 15.11 01:59 Kyiv (14.11 23:59 UTC).

## 0. Day 1 contracts and the agent card (testnet, signed by ftf-coordinator.testnet)

All three scripts are idempotent (safe to re-run) and sign with the keys in `~/.near-credentials` (`SIGNER`, default
`ftf-coordinator.testnet`). They need the near CLI and cargo-near.

```bash
bash contracts/scripts/day1-deploy.sh        # heroine, companions, guests contracts + settings
bash contracts/scripts/day1-guest-key.sh     # the client's create_guest-only key (private part -> game/.env.local)
bash contracts/agent-card/scripts/mint-judge-card.sh   # agents.ftf-coordinator.testnet + the judge Iris card
```

They write only public account ids and the guest key's public part to `game/src/net/day1-deployment.js`. The guest
key's private part never goes into the page: it is the `FTF_GUEST_KEY` environment variable of the relayer
(`relayer/README.md`). Then set the repository variable `FTF_RELAYER_URL` (Settings → Secrets and variables → Actions →
Variables) to the relayer's URL; the Pages build passes it as `VITE_FTF_RELAYER_URL`.

## Already done (no action)

- **NEAR testnet deployment (09.11, owner permission).** `ftf-seasons.testnet` (season-commit): the judge season
  `793f6c05e89839f2` committed, all 15 leaves revealed and verified on-chain, Ash's key committed (not revealed: it is
  the trial-13 secret). `ftf-shards.testnet` (memory-shard, NEP-171): the judge season's three shards minted by the
  coordinator script and transferred to `lambada_eth.testnet`, which is also a coordinator on both contracts. Every
  account id and transaction hash: `docs/near.md`. Nothing is left to deploy for the submission.
- Public repository, MIT licence, tag `pre-hackathon`, the Pages workflow deploying `main`.

## Remaining, in this order

### 1. Freeze and tag the submitted commit
```bash
git fetch origin main
git checkout main && git pull --ff-only origin main
(cd game && npm ci && npm run build)                          # the production build (its size goes into docs/STATS.md)
bash scripts/verify-all.sh --write                           # every suite must be ok (fail 0); refreshes docs/STATS.md
git add docs/STATS.md docs/stats.json && git commit -m "Numbers at the freeze" && git push origin main
git tag -a hackathon-submission -m "NEAR Hackathon submission" main
git push origin hackathon-submission
```
Check: https://github.com/SpacexCeo/forget-to-foresee/compare/pre-hackathon...hackathon-submission opens and shows
the whole work. The README already links this URL. Re-tag only if something must change afterwards
(`git tag -d hackathon-submission && git push origin :refs/tags/hackathon-submission`, then tag again).

### 2. Check the published build
The Pages workflow runs on every push to `main` (Settings → Pages → Source: GitHub Actions is already on).
Open https://spacexceo.github.io/forget-to-foresee/ (one entry: the whole game) once, then walk the README table "How to see it": the town with the
objective line, the Gate-Loom and the Shell monument, then the altar and "Verified ✓" in Signs & Visions. Check that
the page opens in English (add `&lang=en` if your browser is set to another language). Keep the site up until at least
18.11, ideally 25.11.

### 3. The video
The post uses the 60 s jury video (`docs/submission/jury-video.md`). Check every caption against the README before
posting: nothing may say the contract is "not yet deployed", that the clans have "wallets" in a NEAR sense, or that
shards are minted in every season. The older 75 s demo cut (`video-shot-list.md`) carries a stale caption; do not post
it without re-rendering.

### 3b. Repository settings (GitHub → the repo → About ⚙, 2 minutes; audit QW-4)
- **Description:** `Strategy game where an AI clan agent pays for prophecy with her own memories. Seasons are sealed on NEAR testnet before play; forgotten memories become NEP-171 shards. Built at NEAR HACKATHON.`
  (the current one says "NFT agents", which the README contradicts: Iris is game state, not a token).
- **Website:** `https://spacexceo.github.io/forget-to-foresee/`
- **Topics:** `near`, `near-protocol`, `nft`, `nep-171`, `game`, `threejs`, `ai-agents`, `merkle-tree`, `nearhackathon`
- Check the link preview after the next Pages deploy: the page already has `og:` / `twitter:` tags and `og.jpg`.

### 4. Post on X
`docs/submission/x-post.md`. Post 1 must contain the video, "built at NEAR HACKATHON", @NEARProtocol and
#NEARHackathon. Copy the post URL.

### 5. Related project
Settled 09.11: none. One submission only.

### 6. Submit (once)
`docs/submission/apply-form.md`: fill the TODO(owner) values, generate the `requestId`, read the consent sentence,
send via the form or `curl`. Keep the payload out of the repository. On 201, record the date in
`docs/decisions.md` §4. Fixes afterwards: https://nearhackathon.com/request-changes, never a second submission.

### 7. After submitting
- Do not force-push `main` or delete the tag during judging (16.11–18.11).
- Keep the repository public.
