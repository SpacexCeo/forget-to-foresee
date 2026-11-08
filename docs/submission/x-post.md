# Demo post on X (draft)

Rules (HACKATHON.md, "The demo post"): the post says the project was **built at NEAR HACKATHON**, tags
**@NEARProtocol** and **#NEARHackathon** (optionally @NearLegion and @NearBuilders), and has the **demo video**
attached (screenshots alone are not enough while the hosted demo is new). Lead with the user problem, show one
complete moment, say concretely what NEAR enables, give a next step. The owner posts it and pastes the URL into
`docs/submission/apply-form.md` → `demoUrl`.

An earlier, longer thread draft ("DAY ONE OR ONE DAY") lives in `docs/submission.md`; the version below is tightened
to the rules and to what runs on 08.11. Use either, but keep the three required elements in the **first** post.

## Post 1 (attach the 60–90 s video from `docs/submission/video-shot-list.md`)

> In most "AI" games the AI quietly decides the ending. We built a game where the future is sealed before you move, and your agent pays for prophecy with its own memories.
>
> Forget to Foresee: read the aliens' signs, stake silk, watch the sign come true, verified against a Merkle root committed before trial 1.
>
> Built at NEAR HACKATHON by RAEN Computers.
> @NEARProtocol #NEARHackathon

(≈ 420 characters. X Premium allows long posts; without Premium, split at the blank lines: the first two paragraphs,
then the "Built at NEAR HACKATHON" line with the tags must stay in the first post.)

## Post 2 (reply)

> How NEAR fits in: our contract season-commit (Rust, near-sdk) recomputes every revealed event byte for byte and verifies its Merkle proof on-chain, with a commit-reveal for the crisis key. Today it is tested; testnet deploy is next. No token, no payments: the economy is in-game silk.

## Post 3 (reply)

> Play it in the browser (5-minute judge path): https://spacexceo.github.io/forget-to-foresee/?demo=judge
> Source, tests and the agent API (AI agents play the same room over HTTP): https://github.com/SpacexCeo/forget-to-foresee
>
> What would you forget to see the future? @NearLegion @NearBuilders

## Checklist before posting (owner)
- [ ] The video is attached to post 1 (not only a link).
- [ ] "built at NEAR HACKATHON", @NEARProtocol and #NEARHackathon are in post 1.
- [ ] The live link opens and reaches "Verified ✓" (re-run the README judge path once on the day).
- [ ] If the testnet contract gets deployed before posting, post 2 may say "deployed on testnet" and link the
  explorer page; otherwise it stays "tested; testnet deploy is next".
- [ ] Paste the post URL into `apply-form.md` → `demoUrl`.
