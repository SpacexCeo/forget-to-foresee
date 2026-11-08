# Owner steps to submission (exact commands, nothing here is done by an agent)

Order matters: freeze → tag → (optional) deploy → video → X post → form. Dates: freeze 13.11 20:00 Kyiv,
deadline 15.11 01:59 Kyiv (14.11 23:59 UTC).

## 1. Freeze and tag the submitted commit
```bash
git fetch origin main
git checkout main && git pull --ff-only origin main
cd game && npm ci && npm test && npm run build && cd ..      # must be green
cd server && npm test && cd ..
git tag -a hackathon-submission -m "NEAR Hackathon submission" main
git push origin hackathon-submission
```
Check: https://github.com/SpacexCeo/forget-to-foresee/compare/pre-hackathon...hackathon-submission opens and shows
the whole work. The README already links this URL. Re-tag only if something must change afterwards
(`git tag -d hackathon-submission && git push origin :refs/tags/hackathon-submission`, then tag again).

## 2. Check the published build
The Pages workflow runs on every push to `main` (Settings → Pages → Source: GitHub Actions is already on).
Open https://spacexceo.github.io/forget-to-foresee/?demo=judge and walk the README table once; it must reach
"Verified ✓" at trial 3. Keep the site up until at least 18.11, ideally 25.11.

## 3. Optional: deploy the contract to testnet
Only if there is time before the freeze; the submission is eligible without it (Q-010, Q-011). Commands and the
account requirements: `contracts/season-commit/README.md` → "Deploy to testnet (owner)". If deployed, add the
account id and an explorer link to the README real/mock row "Season commitment" and change "not deployed" to
"deployed on testnet (root commit only / reveals wired)" according to what was actually done.

## 4. Record the video
`docs/submission/video-shot-list.md`. 60–90 s, 1080p.

## 5. Post on X
`docs/submission/x-post.md`. Post 1 must contain the video, "built at NEAR HACKATHON", @NEARProtocol and
#NEARHackathon. Copy the post URL.

## 6. Submit (once)
`docs/submission/apply-form.md`: fill the TODO(owner) values, generate the `requestId`, read the consent sentence,
send via the form or `curl`. Keep the payload out of the repository. On 201, record the date in
`docs/decisions.md` §4. Fixes afterwards: https://nearhackathon.com/request-changes, never a second submission.

## 7. After submitting
- Do not force-push `main` or delete the tag during judging (16.11–18.11).
- Keep the repository public.
- If a second project is submitted, add the mutual "Related projects" links to both READMEs first.
