# Demo post on X (draft)

Part of the single current submission package (`docs/submission/`; order of steps: `owner-steps.md`).

Rules (HACKATHON.md, "The demo post"): the post says the project was **built at NEAR HACKATHON**, tags
**@NEARProtocol** and **#NEARHackathon** (optionally @NearLegion and @NearBuilders), and has the **demo video**
attached (screenshots alone are not enough while the hosted demo is new). Lead with the user problem, show one
complete moment, say concretely what NEAR enables, give a next step. The owner posts it and pastes the URL into
`docs/submission/apply-form.md` → `demoUrl`.

Every claim must match the README (shipped scope, the real/mock table, "What is proven, and what is not"). Keep out of
the post: the weekly tournament (a UI simulation), any "player-owned" or "live-minted" NFT, any claim that the
commitment makes the game impossible to modify (the rules run in the browser; the commitment fixes the Guests'
events, not silk or outcomes).

## Post 1 (attach the 60 s jury video: `docs/submission/jury-video.md`)

> In most AI games the AI quietly decides the ending.
>
> In Forget to Foresee the future is sealed before you move, rival clans scheme around you, and each prophecy costs a memory: a shard the clans bid for.
>
> Built at NEAR HACKATHON by @Lambada_eth
> @NEARProtocol #NEARHackathon

(270 characters as X counts them. Credit @Lambada_eth; the agents and the memory shards up front. "The future is sealed
before you move" holds for every season: the schedule of the Guests' events is committed to a Merkle root before
trial 1, locally for live seasons and also on testnet for the judge season.)

## Post 2 (reply)

> Why NEAR: our testnet contract holds the judge season's Merkle root, and all 15 of its events were revealed and checked on-chain against it.
>
> Three of its forgotten memories were minted as NEP-171 NFT shards bound to that sealed season.
>
> https://testnet.nearblocks.io/address/ftf-shards.testnet

(261 characters. Only the judge season is on-chain, and the post says so. The reveals and the mints were sent by the
coordinator script, not during a player's session; the post does not claim otherwise. The link opens the NFT
contract.)

## Post 3 (reply)

> Five scripted rival clans trade silk, keep or break pacts and vote. Your own AI agent can play a whole season via our HTTP API.
>
> Play: https://spacexceo.github.io/forget-to-foresee/
> Code, 1,000+ tests: https://github.com/SpacexCeo/forget-to-foresee
>
> What would you forget to see the future?
> @NearLegion @NearBuilders

(278 characters. The browser plays its own local room; the HTTP API (`server/`, run locally) runs the same room module
for agents. "1,000+ tests" = the sum of docs/STATS.md (1,025 on 12.11: game, API, relayer and eight contracts); regenerate with
`node scripts/stats.mjs --write` and recount before posting.)

Character counts: X counts each URL as 23 characters; recount after any edit.

## Optional teaser

`docs/video/forget-to-foresee-teaser-10s.mp4`: 10 s, 1080p30, 2.9 MB: aerial island in fog → a sign glowing on
the Shell glass → close-up of the logogram → "DAY ONE OR ONE DAY." / "FORGET TO FORESEE". Cut from the owner's
gameplay recordings of 08.11 (HUD cropped out, cool grade, light grain); audio from the game's own sounds
(`amb_shell_inside`, `guest_phrase_1`, `guest_call`). Known flaw: the mouse cursor is visible in two shots. It carries
no claims, so it can go in a later reply; it does not replace the jury video in post 1.

## Checklist before posting (owner)
- [ ] The video is attached to post 1 (not only a link), and its captions match the README (`owner-steps.md` §3).
- [ ] "built at NEAR HACKATHON", @NEARProtocol and #NEARHackathon are in post 1.
- [ ] The live link opens and reaches "Verified ✓" (walk the README "How to see it" table once on the day).
- [ ] Open the explorer link in post 2 in a browser once (the bot check blocks scripted fetches).
- [ ] Paste the post URL into `apply-form.md` → `demoUrl`.
