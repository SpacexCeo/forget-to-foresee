# Demo post on X (draft)

Rules (HACKATHON.md, "The demo post"): the post says the project was **built at NEAR HACKATHON**, tags
**@NEARProtocol** and **#NEARHackathon** (optionally @NearLegion and @NearBuilders), and has the **demo video**
attached (screenshots alone are not enough while the hosted demo is new). Lead with the user problem, show one
complete moment, say concretely what NEAR enables, give a next step. The owner posts it and pastes the URL into
`docs/submission/apply-form.md` → `demoUrl`.

An earlier, longer thread draft ("DAY ONE OR ONE DAY") lives in `docs/submission.md`; the version below is tightened
to the rules and to what runs on 08.11. Use either, but keep the three required elements in the **first** post.

## Post 1 (attach the 60 s jury video: `docs/submission/jury-video.md`)

> In most AI games the AI quietly decides the ending.
>
> In Forget to Foresee the future is sealed before you move, six AI clans scheme around you, and your agent pays for every prophecy with one of its memories.
>
> Built at NEAR HACKATHON by @Lambada_eth
> @NEARProtocol #NEARHackathon

(278 characters as X counts them. Owner 09.11: credit "@Lambada_eth"; lead with the two pillars, the AI clans
(agents) and the memory shards (NFTs). "Sealed before you move" is true for every season: live seasons seal the root
locally, the judge season also on testnet.)

## Post 2 (reply)

> Why NEAR: the judge season is sealed as one Merkle root in our testnet contract before trial 1; every event is then checked on-chain. No one, us included, can rewrite it.
>
> Its forgotten memories are NEP-171 NFT shards bound to that root.
>
> https://testnet.nearblocks.io/address/ftf-seasons.testnet

(262 characters. Only the judge season is on-chain; the post says so.)

## Post 3 (reply)

> Six AI clans with silk, memory and temper trade, keep or break pacts, and vote. Your AI agent can play a whole season via our HTTP API.
>
> Play: https://spacexceo.github.io/forget-to-foresee/?demo=judge
> Code, 600+ tests: https://github.com/SpacexCeo/forget-to-foresee
>
> What would you forget to see the future?
> @NearLegion @NearBuilders

(276 characters. The browser plays its own local room; the HTTP API runs the same room module for agents, so the post
says an agent can play a season via the API, not that it joins the human's session. "600+ tests" = 497 game + 28 API
+ 56 season-commit + 21 memory-shard; recount before posting.)

## Checklist before posting (owner)
- [ ] The video is attached to post 1 (not only a link).
- [ ] "built at NEAR HACKATHON", @NEARProtocol and #NEARHackathon are in post 1.
- [ ] The live link opens and reaches "Verified ✓" (re-run the README judge path once on the day).
- [ ] Open the explorer link in post 2 in a browser once (the bot check blocks scripted fetches).
- [ ] Paste the post URL into `apply-form.md` → `demoUrl`.
