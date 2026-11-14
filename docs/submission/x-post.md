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

## Post 1 (attach the jury video: `docs/submission/video-shot-list.md`)

> A hill town on NEAR testnet: 20 traders, each with its own account and key, trade on chain all day. Over 21,000 trades on 13 Nov, every price with a readable reason.
>
> Play as a guest, no wallet popups.
>
> Built at NEAR HACKATHON by @Lambada_eth
> @NEARProtocol #NEARHackathon

(271 characters as X counts them. Lead with the live economy. "Over 21,000 trades on 13 Nov": the public-indexer recount for the whole UTC day is
21,233 market trades (`docs/proof/tx-2026-11-13.md`). Credit @Lambada_eth.)

## Post 2 (reply)

> Watch it live: https://159-195-130-113.sslip.io/api/market/stats
>
> The Town Ledger in the game shows every trader's account, each trade, its reason and its tx. A model on NEAR AI Cloud sets the clans' strategy once an hour; rules make every trade. Items are NEP-245 tokens.

(246 characters as X counts them. The stats link is the relayer's public JSON (`today`, `recent[].hash`, `strategy`). The strategy wording follows
`docs/ai-use.md`: the model sets bounded strategy numbers, the rules engine makes every trade. NEP-245: the item
contract is deployed; do not say items were minted until `items.ftf-town.testnet` shows supply.)

## Post 3 (reply)

> Iris, a doctor-linguist from another planet (2048), pays for prophecy with her memories. Every season is sealed before play (the judge season on NEAR); forgotten memories become NEP-171 shards.
>
> A market week in a minute: https://spacexceo.github.io/forget-to-foresee/economy-lab.html
> Play: https://spacexceo.github.io/forget-to-foresee/

(275 characters as X counts them. Iris canon (README top, loading tip): a doctor-linguist from another planet, year 2048, who came through the glass.
The seal holds for every season (local commitment); the judge season is also committed on `ftf-seasons.testnet`.)

## Post 4 (reply)

> Honest scope: NEAR testnet, free to play, no money value; the traders are scripted NPCs, not players. Sign in as a guest, with a wallet or a passkey.
>
> Code and tests: https://github.com/SpacexCeo/forget-to-foresee
>
> What would you forget to see the future?
> @NearLegion @NearBuilders

(258 characters as X counts them. Honesty line: testnet, free, no money value, scripted traders. Never "invest", "APY", "profit" or "returns".)

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
