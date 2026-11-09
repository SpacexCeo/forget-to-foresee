# Demo post on X (draft)

Rules (HACKATHON.md, "The demo post"): the post says the project was **built at NEAR HACKATHON**, tags
**@NEARProtocol** and **#NEARHackathon** (optionally @NearLegion and @NearBuilders), and has the **demo video**
attached (screenshots alone are not enough while the hosted demo is new). Lead with the user problem, show one
complete moment, say concretely what NEAR enables, give a next step. The owner posts it and pastes the URL into
`docs/submission/apply-form.md` → `demoUrl`.

An earlier, longer thread draft ("DAY ONE OR ONE DAY") lives in `docs/submission.md`; the version below is tightened
to the rules and to what runs on 08.11. Use either, but keep the three required elements in the **first** post.

## Post 1 (attach the video: `trailer.mp4`, or `clip-verified.mp4` for the Verified moment)

> In most AI games the AI quietly decides the ending.
>
> In Forget to Foresee the future is sealed on NEAR before you move, and your agent pays for every prophecy with one of its own memories.
>
> Built at NEAR HACKATHON by RAEN Computers
> @NEARProtocol #NEARHackathon

(260 characters as X counts them; fits a standard post.)

## Post 2 (reply)

> Why NEAR: the whole season is generated before trial 1 and committed as one Merkle root to our contract on NEAR testnet.
>
> Each event is then revealed and checked on-chain against that root, byte for byte. Nobody, us included, can rewrite the ending.
>
> https://testnet.nearblocks.io/address/ftf-seasons.testnet

(274 characters. Updated 09.11 after `ftf-seasons.testnet` was deployed and the judge season committed and revealed.)

## Post 3 (reply)

> Play in the browser, phone included (5-minute judge path): https://spacexceo.github.io/forget-to-foresee/?demo=judge
>
> Open source, 600+ tests, AI agents play the same room over HTTP: https://github.com/SpacexCeo/forget-to-foresee
>
> What memory would you give up to see the future?
> @NearLegion @NearBuilders

(248 characters. "600+ tests" = 497 game + 28 API + 56 season-commit + 21 memory-shard; recount before posting.)

## Checklist before posting (owner)
- [ ] The video is attached to post 1 (not only a link).
- [ ] "built at NEAR HACKATHON", @NEARProtocol and #NEARHackathon are in post 1.
- [ ] The live link opens and reaches "Verified ✓" (re-run the README judge path once on the day).
- [ ] Open the explorer link in post 2 in a browser once (the bot check blocks scripted fetches).
- [ ] Paste the post URL into `apply-form.md` → `demoUrl`.
