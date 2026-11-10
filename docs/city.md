# Evermind, the open city

Owner request, 10.11.2026: the game was "all tournament"; add an open city in the spirit of an MMO capital, one town
only, where Iris can eat, talk, make friends, take quests, trade on a market and see the prices of memecoins, of NFTs on
NEAR and of NEAR itself. A horizon and trees around it, but nobody leaves the town: the surroundings are scenery.

This file says what was built, what is real, and what is not there.

## What it is

- **One walled town**, built in code (`game/src/scenes/city.js`): a plaza with a fountain, the **Shell Gate** (north,
  the way into a season), a market street of four stalls (east), the tavern "The Mossy Kettle" (west), the **Exchange**
  hall with three price boards (south-east), a quest board (south-west), fifteen houses, a wall with eight towers and
  a shut south gate. Beyond the wall: 1,400 instanced trees (520 on phones), a road and 22 hills on the horizon.
- **Scenery only past the wall.** The collision ring is complete (both gates are solid), so the wall is the edge of the
  world. Tested: no tree stands closer than 5 m past the wall.
- **The same scene as the island**, 4 km away on +X (`CITY_ORIGIN`), with its own collision world, exactly like the
  Shell interior. The look-dev stack (sky, sun, fog, post), the camera rig and the character controller are reused.
  The camera starts low behind Iris (9 m, about 17° of pitch) so the wall, the forest and the horizon are in frame.
- **Cost:** 23 draw calls and about 141k triangles at the spawn view on the low tier (headless Chromium, SwiftShader;
  budget in `docs/spec.md` 10 is 120 / 500k). Nothing is downloaded for the town itself; Iris and the five envoys use
  the existing agent models and stream in over a stand-in.

## Where the game lands

| Link | Lands in |
|---|---|
| `/` through the lobby, or `/` on a phone | the city |
| `/?play=direct&start=city` | the city, no lobby |
| `/?demo=judge`, `/?seed=…`, `/?play=direct`, `/#play`, `/?cinematic=…` | the season, as before (the README judge path is unchanged) |
| any link with `&start=season` or `&start=city` | what it says |

While Iris is in the city the island's models are not requested at all; they stream when she walks through the Shell
Gate. The season's play layer starts at that moment, unchanged. The way back is a reload into the city
(`cityUrl`, `game/src/city/url.js`): the season lives in the browser tab and has no dispose path, so "Return to
Evermind" (Settings, or the pill at the season's end) asks first when the season is not over.

## What Iris can do

| Thing | Rule (all in `game/src/city/state.js` and `economy.js`, pure and node-tested) |
|---|---|
| Silk | starts at 30; the same closed in-game resource as in a season, never NEAR, never on-chain |
| Eat | three meals at the tavern (5 / 9 / 16 silk for +40 / +70 / +100 satiety); bread and tea can be eaten from the bag. Satiety falls from 100 to 0 over 30 minutes spent in the city. At 60 or more Iris is *well fed*: quest and welcome rewards pay 25% more. Under 20 she is *hungry* and cannot run in the city |
| Trade | six goods; the asking price is base × a smooth factor between 0.7 and 1.4 that depends only on the good and the city day (one day = 15 real minutes, from the wall clock, so every device sees the same market). The stall pays about 85% of the asking price and always less than it, so a same-day round trip loses and trading means reading the days. Bag: 12 items |
| Talk and friends | five clan envoys: Bryn (Moss, innkeeper), Oro (Amber, merchant), Hale (Frost, keeper of the Exchange), Mara (Salt, broker of rumours), Kael (Ash, warden of the gate). The first chat of a day gives +1 friendship, one gift a day +1, or +3 for the thing they love. Levels at 3 / 8 / 16 / 28 points. A friend (level 2) gives a perk: a free stew a day, 10% off at the market, tomorrow's price direction, true rumours, +10% tournament purse |
| Ask for advice | one line per envoy from live state: the cheapest meal, today's best buy, the live NEAR price (or "the boards are dark"), a market rumour (right about six times in ten for a stranger, always for a friend), how the purse works |
| Quests | a welcome chain of five steps in any order (talk, eat, read the boards, buy, the gate) and a board with three offers per city day, the same on every device: a delivery to an envoy, and two of greet / meal / sell / finish a season / report the live NEAR price to Hale (offered only while the feed is live). Three active at a time |
| The tournament | the Shell Gate starts a season. Nothing from the city is carried in: everyone starts a season equal (spec 4, no pay-to-win). A finished season pays the city once: a fifth of Iris's silk plus 10 for a good ending (gift, survived), 4 otherwise, 0 if the Shells left |

Everything is saved on the device under `ftf.city.v1`; a damaged save falls back to a fresh city.

## Live prices (the Exchange)

`game/src/city/prices.js`. Plain `GET` requests from the browser, no key, no wallet, no credentials or referrer, once a
minute while Iris is in the city.

| Board | Source | Notes |
|---|---|---|
| NEAR/USD | CoinGecko `simple/price`; when it refuses (its keyless limit), the wNEAR/USDC pool on DexScreener | the panel names the source it actually used |
| NEAR memecoins | DexScreener `tokens/v1/near/…` for BLACKDRAGON, SHITZU, LONK, NEKO, GEAR, NEARVIDIA, DD | the deepest pool per token; price, 24h change, pool liquidity, a link to the pool. Unknown tokens in a response are ignored |
| NFTs on NEAR | `nft_tokens` view of `ftf-shards.testnet` (this game's memory shards) | what each shard sold for at its in-game auction, in silk, and its owner account |

**Mainnet NFT floor prices are not shown.** When this was built (10.11.2026) no open, keyless source was found: the
Paras API answered 502, Tradeport's indexer needs an API key and CoinGecko lists no NEAR NFT collections; the Mintbase
and Mitte APIs could not be reached from the build environment at all (not verified either way). Adding one is a new `load('…')` in the feed plus a parser; it needs a provider
(and probably a key kept off the client) chosen by the owner.

Honesty rules, tested: a board is `live` only with numbers that arrived in this session and are younger than five
minutes; after that `stale`; with no answer `no connection`. One dead source never blanks the others. Nothing is
cached across reloads and nothing is ever invented. None of it can be bought or sold in the game.

## What is not there

- **Other players.** The residents are scripted characters. Real chat, friends lists between players and trading
  between players need a game server (rooms, identity, moderation); the project has none hosted (the agent API in
  `server/` is a test server for one season). This is the owner's next decision, see `docs/decisions.md`.
- **Money.** No token, no payment, no trade against NEAR; the Exchange is a display.
- **A way back without a reload**, pathfinding for click-to-move around buildings (a click walks straight; the wall and
  houses stop Iris), residents that walk around, a day and night cycle, a city map panel.
- The lobby's last onboarding button still reads "Step onto the island" (it is part of the documented judge path).

## Files

| Path | What |
|---|---|
| `game/src/city/layout.js` | the town's plan in metres: places, stalls, envoys, solids, houses, forest, hills (pure) |
| `game/src/scenes/city.js` | the scene: merged faceted geometry, instanced trees, colliders, boards, lights |
| `game/src/city/economy.js`, `state.js` | prices, meals, friendship, quests, the saved city state (pure) |
| `game/src/city/prices.js` | the live price feed and its parsers |
| `game/src/city/city.js` | the city layer (zone switch, interaction, the gate, the season bridge) |
| `game/src/city/ui.js`, `city.css` | HUD, prompt, hotbar, panels |
| `game/src/city/actors.js` | Iris in the city, the five envoys, nameplates |
| `game/src/city/locales/` | strings in EN, RU, UA, IT, 中文 |
| `game/tests/client/city.test.mjs` | 23 tests; `tests/client/boot-smoke.mjs` has a `city` run on the production build |
