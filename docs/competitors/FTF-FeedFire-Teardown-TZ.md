# FTF Teardown TZ: FEED FIRE (feedfirerh.com), and what Forget to Foresee takes from it

| | |
|---|---|
| **Version** | Rev 1, Thursday 12 Nov 2026, 19:40 Kyiv (UTC+2). English only (the readers are the owner's Opus agents). |
| **Owner source** | owner message `pt300u`: study https://feedfirerh.com/, how the game is built, which mechanics make its dynamics and vibe, what FTF can adopt. |
| **Scope** | Analysis plus a build plan. **No push, no deploy, no signing, no posting, no contact with the team or its partners.** Every build item below is branch-only, flag-off by default, no keys. |
| **Siblings** | `FTF-Competitive-TZ.md` (CTZ), `FTF-Story-Quests-Leaderboard-TZ.md` (STZ, rev 4), `FTF-City-Economy.md` (CE, rev 4), `FTF-Saboteur-Teardown-TZ.md`. This file follows the same conventions: **P0/P1/P2**, **OWNER-GATED**, `[VERIFY]`. |
| **Deadlines (Kyiv)** | now Thu 12 Nov ~19:40; contract cut line **Fri 13 Nov 14:00**; **feature freeze Fri 13 Nov 16:00** (about 20 h away); hard freeze 20:00; **deadline Sun 15 Nov 2026 01:59** (= Sat 14 Nov 23:59 UTC); judging from 16 Nov 00:00 UTC. |
| **Lore canon** | Iris is a doctor-linguist from another planet, year 2048. Clans, citizens and quest givers are scripted (the five clans have a labelled LLM strategy layer since 12 Nov). The FTF voice is quiet, misty, a little mysterious, **not** FEED FIRE's potato slapstick. |
| **Legal frame** | FTF is free, testnet, no promised value. Never "invest / APY / profit / dividend / returns". Nothing below involves selling anything. |

## How to read the evidence labels

- **[V] verified**: read directly from the live site, its public client code, its HTTP headers, or a quoted third-party page (the source is named).
- **[I] inferred**: a conclusion from [V] facts. The reasoning is given.
- **[N] not observed**: could not be seen from here. **I cannot play the game visually** and have no account on its server, so *feel* (frame timing, audio quality, real pacing, the server's rules, any number that lives only on the server) is [N] unless stated. Where the client code gives a constant, the constant is [V] and the feel it produces is [I].

---

## 0. Executive summary

**What FEED FIRE is.** [V] A free-to-open 3D browser game (Three.js, Rapier physics, multiplayer over WebSocket) on **Robinhood Chain** (EVM, chain id 4663), built by a small team or solo founder [I] (X: the game's account @FeedTheFireRH, joined Oct 2026, **~9.7K followers, 191 posts**, per a third-party X mirror at 12 Nov). Premise: *"They went digging for coal. They came back with a war. Nobody leaves. The dragon doesn't allow it."* Players are **potatoes** in a valley; the town's furnace ("the Fire") is hungry; you throw logs and coal into it. **The game is, in effect [I], the application form for a free NFT mint**: social tasks done inside the game with the wizard **Ashbeard** put your name in his book (Tier 1, Tier 2, a sealed Tier 3). Dozens of outside communities (45 raffles on one aggregator alone) then run giveaways that say "reach Tier 2 in the game, we will check every winner against Ashbeard's whitelist". On 12 Nov (today) the team shipped a second layer: a daily dragon fight (**the Watch**), a one-life arena (**the Coliseum**), classes, duels, fishing with a weekly cup, guild banners, a friends book, and a **paid season pass** (**FirePass: First Frost**, 21 days, 30 tiers).

**Why it feels the way it does (the vibe equation), in one line each:**

1. **A shared object that is hungry.** One furnace, one verb ("feed"), one sentence of premise. Every player action is addressed to the same visible thing, and it lights up. [V]
2. **A tiny physical verb with a value ladder.** Pick up, aim, throw. *"Logs burn. Bundles brighter. Coal brightest."* Three logs of one wood tie a bigger bundle. The player learns the whole economy from one sentence. [V]
3. **The world is the application form.** No form: a 3D recruitment office, a wizard whose dialogue card has a big face, Tier 1/2/3 that you can *see* in a book, a sealed third tier as a teaser. Other players are visible in the same valley with a name floating over them. [V]
4. **Time boxes that reset and are announced.** Daily Watch, weekly cup every Monday, 21-day chapter, quest swaps. Something is always ending soon. [V]
5. **Juice that is measured, not accidental.** Hit-stop 50-80 ms, camera kick, flash sprite, floating numbers with a 3.4x crit pop and a merge window, a tuning panel for "feel", reaction sounds (squeak, giggle, boo) and proximity audio beds (fire, river, falls, cart). [V constants, I feel]
6. **Jokes with a rule underneath.** *"Ashbeard's book has 3,333 pages left. No more."* (a scarcity line inside a loading tip), *"A burned Baby Spud buys the town a day of peace."* Copy is short, dry, in a character's mouth. [V]
7. **External distribution built into the product.** The game is the verification oracle for other people's raffles. Each partner raffle brings 20-200 people who must open the game. [V from Tessera pages; effect on retention [I]]

**What FTF should take first (details in sections 4 to 6).** In order of value per hour before the Fri 16:00 freeze:

| # | Take | Why | Prio | Est. |
|---|---|---|---|---|
| 1 | **A public "is this account on the Loom's list?" check** (tier + `gate_paid_of`), the verification oracle for partner raffles, plus a visible "pages left" counter | it is their growth engine and costs one read-only endpoint and one page; FTF's whitelist pass already has `gate_paid_of` | P0 | 3 h |
| 2 | **Floating numbers** for damage and for silk gained (pop 1.2x, crit 3.4x, merge window) | cheapest visible "game feel" gap in FTF (hit-stop and shake already exist in `mobs.js`/`mob-fx.js`; no floating numbers were found [VERIFY]) | P0 | 3 h |
| 3 | **One shared hungry object: the Gate-Loom**, a town-wide "silk burned today" meter that glows and flares when anyone pays the Gate or enters a tournament | gives every silk sink a visible, social consequence; no new economy | P0 (UI) / P1 (live feed) | 3 h + 2 h |
| 4 | **Loading and start screen as a ritual** (Play button that is the progress bar, a rotating tip line in Iris's voice with one scarcity line) | first 10 seconds; FTF's loader exists, this is copy and a small component | P0 | 2 h |
| 5 | **Names over heads and a "N in the valley" counter**, `?room=` and `?ref=` invite links | they praise "you can see other players live"; FTF has presence code to extend | P0 | 3 h |
| 6 | **Remote kill switch `features.json`** | they ship 28 flags this way; protects FTF's freeze night | P0 | 1 h |
| 7 | **Daily/weekly quest board with two free swaps** and a **free** season track "Chapter I: the Loom" | retention hooks; free only | P1 | 6 h |

**Do not copy:** real-money passes and tier skips, the donation beggar (up to $1,000 in ETH), draw tickets for a whitelist sold or earned through paid tiers, X follow/like as a gate (it makes the funnel brittle and it is brand-risk for a testnet demo), English-only chat rules as written. See section 3.12.

---

## 1. Method and evidence inventory

**What was done** (all read-only, from the box, 12 Nov 2026):

1. `WebFetch` and `curl` of `https://feedfirerh.com/` (HTTP 200, 88,977 bytes): HTML, inline CSS (two blocks, 36.5 KB), inline scripts (7), response headers (including the full Content-Security-Policy).
2. Downloaded **123 ES modules** listed in the page's `modulepreload` script under `/src-cabc6bf3/` (1.07 MB, unbundled and unminified except for short names), **plus 6 lazily imported modules** found by reading `main.js` (`arena`, `fish_net`, `fish_share`, `leap_mark`, `redcoat_quest`, `spud_fun`) and **31 more** named in `main.js`'s loader table (`audio`, `fx`, `music`, `multiplayer`, `recruit`, `fishboard`, `firepass`, `duel`, `dungeon`, `chat`, `night`, `fire`, `furnace`, `collab`, `fogofwar`, `brew`, `shark`, `emotes`, `mage`, `map`, `fishing`, `angler`, `gus_shop`, `inventory_panel`, `camp`, `wake`, `grove`, `sprout`, `archer`, `clan_hall`, `dragon`). Beautified locally for reading. **Nothing was copied into the FTF repo, and nothing should be: FTF builds its own implementation from the *observations* here (section 7 repeats this).**
3. `assets/features.json` (the live feature-flag file) and the two start-screen plates (`hearth_cold.webp`, `hearth_hot.webp`).
4. Web search and fetch of third-party pages that quote the game or its X posts: Tessera raffle pages (`tesserapp.org/project/feedthefirerh`, individual raffles), an X mirror (`teapawt.org/FeedTheFireRH`), Alphabot, a Chinese news digest of the guides (`web3.zkai.one`), AiCoin, and a scanner page for the NFT contract. **X itself returned 403 to `WebFetch`** (the mirror was used instead; mirror counts can lag).
5. `robots.txt` was read: it contains only a comment block about content signals, no `Disallow`, no `Content-Signal` lines. Only public pages and public client files were requested, once each.

**What could not be done** [N]: play the game; see a rendered frame (the hearth plates were viewed, the 3D world was not); listen to audio; read server code (WebSocket server at `wss://feedfirerh.com`, an `/api/x`, `/api/wallet`, `/api/ref` backend); read what the server accepts for `mine/throw/burn/offering`; see live player counts, leaderboards or the contract's source; measure real session length, retention or conversion. Anything about those is labelled [I] or [N].

**Key technical facts used below** (all [V]):

| Fact | Value | Source |
|---|---|---|
| Engine | Three.js **0.176.0** from jsDelivr, ES modules, `UnrealBloomPass`, `GTAOPass` (lazy), `GLTFLoader` + `DRACOLoader`, `KTX2Loader` + a Basis loader, `RoundedBoxGeometry`; **Rapier3D 0.14.0** (WASM, `@dimforge/rapier3d-compat`) | CSP and `modulepreload` in `index.html`; imports in `main.js` |
| Hosting | Cloudflare (server header, `cf-ray`), Pages (`feedfirerh-rc.pages.dev`, `dev.feedfirerh.com` in the CSP) | headers |
| Multiplayer | WebSocket to `wss://feedfirerh.com`; rooms (`?room=`, up to **999** server rooms, `Server N` names, invite links with an 8-character `ref`); `servermove` flag = server-side movement validation (`srvmove.js`); an `econ` channel (`mine`, `throw`, `burn`, `offering`, `state`) with counted refusals | CSP, `invite.js`, `econ_net.js`, `features.json` |
| Chain | **Robinhood Chain**, chain id 4663 (`0x1237`), RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `robinhoodchain.blockscout.com`; WalletConnect plus deep links for MetaMask, Phantom, Trust, Coinbase, OKX, Rainbow, Rabby | `wallet_rules.js`, `wallet.js`, CSP |
| Identity | optional X login (`/api/x`), optional wallet ("one free signature proves the wallet is yours; nothing is sent"), guest mode ("Play as a guest instead") | `index.html`, `start.js`, `xauth.js` |
| Delivery | content-hash folder `src-cabc6bf3/`, `?v=` hashes on assets, `Cache-Control: no-cache` on HTML, strict CSP (inline scripts by hash), `permissions-policy` denies camera/mic/geo, `x-frame-options: DENY` | headers |
| Live flags | `assets/features.json`, fetched with an 8 s timeout; 28 keys; `tune`, `eastBank` and `mobsDungeon` forced off in the build | `features.js`, live file |
| Live state of the flags (12 Nov 2026, as fetched) | **on:** fishing, inventory, fishboard, duels, mobs, dungeons, roll, servermove, fightWell (Coliseum), classes, econ, daynight, map, returnSpot, towerClimb, spudFun, spudGames, dragonFight, spudFun3, clanHall, friends, cassetteDrop, firepass, chat2. **off:** tune, eastBank, mobsDungeon | `features.json` |

---

## 2. Product timeline and growth facts (all from third-party pages quoted; [V] as quoted, counts approximate)

| Date (2026) | Event | Source |
|---|---|---|
| ~Oct | Account created ("Joined October 2026") | X mirror |
| Wed 29 Oct | Launch post: *"They went digging for coal / They came back with a war / Nobody leaves. The dragon doesn't allow it / The war is coming to @RobinhoodCrypto. The first to feed the fire stand at the front of it / Whitelist open. The FREE mint is coming"*. The mirror shows **~350K views, ~7.4K likes** (another snapshot earlier showed 111K views) | X mirror, Tessera |
| Mon 2 Nov | "Every war needs allies. Collabs are open. Mr. Business is waiting in the collab house at feedfirerh.com" (**the collab house is a building in the game**: 725 likes, 82K views) | X mirror |
| 4-6 Nov | Waves of partner giveaways (Puffins, Space Riders, OwlLfg, Mintopia, Akiro, Nefilims and others), a 35-spot GTD allocation to a guild, an Ethos-score tier (1600+) with ~300 spots; the founder is said to be a repeat NFT builder (previous free-mint collection) | X posts via mirrors |
| 5 Nov | Founder estimate: free mint "in ~3-4 weeks" | AiCoin digest |
| ~12 Nov | **Today's drop (post "33 minutes" old when read):** dragon taunts via Ashbeard; **three totems** (touch one and for a while you are a hero: *Sir Mash, who knighted himself with a spatula*; *Wedge, Watcher of the Ashwood, who swears she was never a chip*; *Spudwick, whose spells mostly work*); **the Watch** (parties up to 10, across servers, fastest kill tops the board), **the Coliseum** ("down the well, one life per hero, your streak burns over your head"), **the castle** (kneel to the King, raise your guild's banner), **Primo the scribe** (book of friends), **FirePass Chapter 1: First Frost** (30 tiers, skins, Ember Bait), **10 cassettes in golden chests** | X mirror |
| 12 Nov 00:42 UTC | A scanner page lists a **public mint stage at 0.001 ETH, 3 per wallet, open until 22 Nov**; "46 holders" at read time; the scanner marks the collection "not enough evidence yet" and notes the price was raised after the stage opened | third-party scanner |
| Tessera | **45 raffles (5 live, 40 ended)** for the project; typical entries 14-209 (e.g. 209, 157, 125, 81, 29) | Tessera project page |

**Reading it.** [I] The cadence is: one mood post, one "allies wanted" post, then a **wave of other people's posts** that all say the same sentence ("complete Tier 2 with Ashbeard, we will check every winner against Ashbeard's whitelist; use the same wallet"), then a content drop on the day the mint opens. The founder's own account posted only 191 times; the traffic is mostly *borrowed distribution paid in whitelist spots*. FTF cannot copy the mint, but it can copy the **verification handle** (section 4, M1).

---

## 3. Teardown by area

### 3.1 Core loop and session pacing

**[V] Verbs and objects (client code, `guide.js`, `logs.js`, `econ_net.js`, start-screen tips).** The guide screen shows three tiles: *Feed the Fire* ("logs and coal"), *Dig coal* ("at the mine"), *Saw logs* ("three, a bundle"). Tips on the start page, in order: "The Fire is hungry." / "Logs burn. Bundles brighter. Coal brightest." / "Pick up a log. Throw it in the Fire." / "Dig coal up the pass and feed it to the Fire." / "Three logs of one wood tie a bigger bundle." / "Ashbeard the wizard is writing names in his book." / "Ashbeard's book has 3,333 pages left. No more." / "Three logs and some coal. Ashbeard counts the logs." / "A burned Baby Spud buys the town a day of peace." / "Push the mine cart down to the bunker." / "Keep the Fire fed. It remembers who fed it." (the coal and mine-cart tips probably belong to the `eastBank` area, which is flag-off in the live build [I].) Controls: hold the left mouse button to aim, release to throw; Shift runs; hold Space to jump higher; right mouse to turn the camera; touch: left thumb walks, right thumb looks, **hold Throw to aim, let go to throw**. Throwing and mining are sent to the server (`econ` ops `mine`, `throw`, `burn`) and the server answers with `state`, `offering`, `refused` (with reasons), so **the economy is server-counted** [V]; the client also tracks `stats.counted`, `refused`.

**[I] The loop.** Seconds-level: walk, grab, aim, throw, flare. Minutes-level: carry load to the furnace, tie bundles, push the cart (mine flag permitting). Day-level (new today): the Watch, Coliseum runs, quests, fishing. The central unit is **a single object (the Fire) and a single action (feed)**; everything else (class kits, fishing, dragon) was added around it. The old text "burn, mine and earn" on the account bio tells us the first version was the feed loop alone.

**[V] The "bundle" mechanic** is a one-line value ladder: 1 log < bundle (three logs of one wood) < coal. Logs are typed by species (`speciesInfo(...)`): *"Bundle tied, mostly <species>"*, *"Bundle tied: mixed logs"*, *"Matched trio: <species>"*, *"Matched trio: a big flare"* (the fire flares more for a matching trio) [V from toast strings]. This is a **sort-and-match micro-skill** layered on a throw.

**[N]** Time to first burn, average session length, how many throws per minute are accepted, whether burning pays anything on chain (the account bio says "earn"; no payout code was found in the client).

### 3.2 First 60 seconds and onboarding

**[V] Start screen** (`index.html`, `start.js`, CSS): a full-screen **hearth plate** (cold image, hot image on top, an SVG three-layer flame, an ember, a glow and a "stone" element); a video of **spuds** loops over it (webm, mov on Apple), with a **heartbeat pulse** (`st-beat`) animated at video times 4.07 s and 8.52 s; the **PLAY button is the progress bar** (`--p` fills it; label shows "Loading the game engine" then the percentage and bytes with ETA; when ready it turns into **PLAY** with a burst of eight particles and a ring); reduced-motion and data-saver users get no video. At 0% the plate is cold ("The Fire went out"), and **the fire warms as the download completes** [I from `--p` driving `.st-hot` opacity; confirmed by the dual plates]. Under the button: a one-line **rotating tip** (11 lines, platform-specific control hints appended). Below it: **optional** "Connect X" (shows avatar and handle when in), **optional** "Connect wallet" (one free signature), and a link **"Play as a guest instead"**. The first line of the page promises the next step: *"Your @name floats over you in the valley."*

**[V] In-world start.** The game loads a tutorial overlay available on **Esc** ("Esc shows how to play"): `guide.js` is a hand-built paper-and-pins board with pictures per verb, the key caps, a mouse drawing, and a **"Finds" checklist**: *Find my desk (Ashbeard's, in the office)*, *Find Gus (up the river)*, *Find the druid (in his glade)*, *Find the dragon (west, from afar)*, shown as tiles with a tick and a counter ("Found n of 4") [V from `finds.js`]. Finding is by proximity (Gus 7 m, druid 8 m, dragon 30 m). **A first-help routine** teaches kneeling to help a "baked" (knocked-down) potato: six pumps of 0.5 s and a blow of 1 s [V `first_help_math.js`].

**[I] First 60 seconds.** Load (progress with a warming hearth, 10-40 s depending on connection; [N] actual time) → click PLAY (no mandatory login) → spawn in the valley with your potato and other players' names visible → a one-line prompt for the nearest object ("grab: pick up the log" style, from `prompt_keys.js`) → throw the first log and watch the furnace flare → toast. The recruitment office (Ashbeard's desk) is a **building you can find**, not a menu.

**[V] The whitelist tiers (via the guides quoted in AiCoin and the Chinese digest, and partner posts).** Tier 1 "The First Circle": follow, like, reply to the official post, connect the wallet; your name is added to the roster. Tier 2: quote the official post and write why you should be selected; the wizard "reads it". Tier 3 "is still blocked" (a sealed teaser). The recruitment office module polls a live endpoint for the quest post: `open`, `tweetUrl`, `closesAt`, `teamX`, `state`: **the open/closed state of the funnel is server-driven**. Reaching Tier 2 is described by partners as "takes literally a couple of minutes".

### 3.3 Feedback and juice (constants from the client)

| Layer | What the code does | Value | Label |
|---|---|---|---|
| **Hit-stop** | freeze both parties on impact; length scales with strength | **0.05 to 0.08 s** (`impact.js` `stop: [.05,.08]`), strength clamped 0-1.3 | [V] |
| **Squash and recoil** | victim squash on a hit | `squash: 3.2`, `out: .5` | [V] |
| **Camera kick** | a decaying camera impulse, direction from attacker to victim | taken `0.016`, landed `0.008`, rate 17, decay 21; scaled by a **reduced-motion multiplier** (`motion_pref.shakeScale`) | [V] |
| **Impact flash** | additive radial sprite pool at the contact point | 6 sprites, alpha 0.2→0.62, life **0.12 s**, cream `#fff3d6` | [V] |
| **Damage numbers** (`hit_numbers.js`) | DOM pool of 24; font Slackey 24 px; opacity/scale keyframes; **normal hit**: 1.2x pop-in, settles at 1.0, floats up ~33 px, **650 ms**; **crit**: 3.4x pop, jitter (±6 px) over ~0.3 s, gold `#ffd23a`, **46 px**, red "banner" tag, lives **1600 ms**; **merge window 250 ms** (hits in a burst merge into one growing number, grow 0.05 per merge, max 1.5x, end 320 ms, gap 600 ms); other players' numbers drawn smaller (16 px, crit 28 px); a pulse ring (84 px radial) on crits | see left | [V] |
| **Combo / streak** | the arena streak "burns over your head"; Warrior Forge Blade five-swing chain with a named finisher ("Swing 3 of 5: …"); "Land 5 in a row for a sweep, a shield bash, a cleave" | n/a | [V text] |
| **Fire flare** | on a burn the furnace light and the glass/coal emissive jump (`emissiveIntensity` scaled by a transient up to 7x), spill lights on the floor, embers fly to the flue; the **audio fire bed** rises by proximity | `fire.js`, `audio.js` `setFireProximity`, `burn` | [V] |
| **Sound** (`audio.js`, 32 KB) | Web Audio; procedural cues plus sample sets (`<set>_<n>.mp3`) with **"New / Classic" sound sets**; cues named `step, jump, land, rush, roll, pickup, drop, throwWhoosh, knock(material), splash, plop, reelClick, lineSnap, castWhir, fanfare, boop, archer, snore, spudYawn, sneeze, cheer, boo, magic, chime, coin, rattle, squeak, giggle, swim, scream, sharkThrob, chomp, bigSplash, boing, bubble, brewFlash, ability, shot, crit, leap, pluck, burn, pick, coal, tipClatter, creak, thunk, bonk, roar`; **proximity beds** for river, falls, fire, whirl, cart, wheel, saw; a mute, a master volume and a separate music volume | 60+ named cues | [V] |
| **Music** | **one** looping track `assets/music/day_valley.mp3` with a cross-fade; no per-state music found | 1 track | [V] |
| **Feel tuning** | a hidden "Feel tuning" panel (`#tune`, flag `tune`, off in the live build) to adjust constants live | n/a | [V] (the panel exists; its contents [N]) |
| **Graphics tiers** | auto quality, "tap the fps counter to change"; GTAO optional; context-lost recovery messages | n/a | [V] |

**[I] What this adds up to.** The impact stack is a **conventional, restrained** arcade recipe (short hit-stop, small kick, flash, numbers), made distinctive by **very large crit numbers and a merge window that makes bursts read as one growing number**, and by a **sound design that is mostly cartoon** (squeaks, boings, giggles). Those two choices make an otherwise stiff physics world feel funny and responsive. [N] I cannot say how loud or how late any of it is.

### 3.4 Social and competitive pressure

| Mechanic | Evidence | Label |
|---|---|---|
| **Other players visible** in one valley; **@name floats over each**; the name is clickable to change; a link copies the room; "Come play FEED FIRE with me" share text; invite link `?room=<id>&ref=<8 chars>` | `multiplayer.js`, `invite.js`, `referral.js`; praise: *"a web game where you can see other players live … I really like this experience"* | [V] |
| **Rooms** named "Server N" up to 999; "The world is full: trying again in a while"; "You joined your friend's room" | `multiplayer.js`, `invite.js` | [V] |
| **Chat** (`chat.js`, flag `chat2`): "Press Enter or click to chat"; filters: **no links or wallet addresses, English only, language filter, anti-repeat ("You just said that")** | strings | [V] |
| **Emotes / pins** over the head: "a face that pops over your head" (Happy Spud, Sleepy, Crying, Angry, Smug, Scared, Thumbs Up, Love, Baked) and fire-ring emotes (Shiver, Warm Hands, Business Dance, Peel Flex) as FirePass rewards | `firepass_rules.js` | [V] |
| **The Watch**: daily boss fight with **parties up to 10 across servers; fastest kill tops the board**; weekly quests such as "Fight the Watch on 4 days", "Top the Watch's daily board", "Deal 20,000 damage to the Fire dragon this week", "Help up 5 baked potatoes" | X post, quest list | [V] |
| **The Coliseum**: "one life per hero, your streak burns over your head"; weekly quest "Knock down 3 potatoes in the Coliseum" | X post, quest list | [V] |
| **Fish board** (`fishboard.js`): "Each angler's 10 best fish count · a new week every Monday"; **Gus's cup**, "one category a week, the best ten get Scales and a chest"; the river's all-time records; **requires X sign-in** ("Sign in with X to get on the board") | strings | [V] |
| **Guilds and friends**: castle with a King, raise your guild's banner; Primo the scribe keeps a friends book; flags `clanHall`, `friends` | X post, flags | [V] |
| **Share loops**: after a catch, a **trophy card** is uploaded (`fish_photo`) and an X intent opens with the text *"Just hauled a <size> <fish> out of Gus's river 🎣🔥 @FeedTheFireRH"*; a **bonus** for posts, and "Quote our fishing post on X first: then your trophy posts get the bonus"; an arena **streak share** and a "hero shot" module exist | `fish_share.js`, `arena.js` imports | [V] |
| **Live open/closed funnel** (recruitment) with a countdown (`closesAt`) | `recruit.js` | [V] |

**[I] Pressure sources.** (a) **Visibility** (others and their names), (b) **weekly resets with a prize for the top ten** (not for the top one), (c) **fastest-time boards for a daily boss** (everyone can try, the cost is low), (d) **streaks displayed publicly over your head** (loss aversion in view of others), (e) **partner raffles that only count you if you reached a tier** (an external deadline).

### 3.5 Economy, rewards, scarcity

**[V] Currencies and items.** *Scales* (soft currency; spent at Gus's shop; FirePass gives 100-300 per tier), *Bait* (typed: dough, spinner, fly, live), *Ember Bait* (a cast that "always brings up a sunk chest"; **FirePass holders only**), *Quest swaps* (reroll a daily quest you dislike), *Pins, Titles, Emotes, Rod looks, Skins* (class cosmetic, "legendary"), *a new class* (The Burrower, "mythic", tier 22 free track), *Draw ticket* ("one entry in the chapter's WL draw", **rare**), cassettes ("10 cassettes sleep in golden chests" (a cassette drop, flag `cassetteDrop`)). Rarity colour scale: Common `#d9cdb8`, Uncommon `#9fd28a`, Rare `#7fb8ff`, Epic `#c79bff`, Legendary `#ffcf4a`, Mythic `#ff7a59`.

**[V] FirePass (First Frost, chapter 1).** 21 days (11 Nov to 2 Dec 2026), **30 tiers**; tier cost = **200 XP + 30 per tier** (tier 1 = 200, tier 30 = 1,070; total to tier 30 = 19,050 XP by my arithmetic from `R(e)=200+30(min(e,30)-1)`), then a repeating **500-XP "sack"** after tier 30. XP sources in the rules file: daily **100**, "watch" **200**, weekly **500**, chapter **1,000**, sack **500**; quest slots appear to be **2 daily + 3 weekly for free players and 3 daily + 3 weekly with the pass** (constants in `firepass_rules.js`; reading of the constants [I]); "Quest swaps" are an item that rerolls a daily quest, how many per day [N]. Two reward tracks (free and pass), each with 30 slots: the free track is **scales, bait, pins, emotes, a title, a rod, a draw ticket at 30**; the pass track is **Ember Bait x3, class skins, more draw tickets (tiers 7, 14, 18, 20, 21, 24, 29), a rod, titles**. **Prices:** FirePass **$5**, Blaze **$10**, Blaze upgrade **$5**, tier skip **$0.50** (up to 10 tiers; Blaze gives 8 free tiers). Payment is an **on-chain transfer in ETH on Robinhood Chain to a fixed address**, priced from a quoted ETH/USD rate with a quote window, an under-payment tolerance and a late grace; `liveFrom 2026-11-12T00:00Z` (so **monetisation went live today**).

**[V] Donations.** A beggar NPC (a cup, a coin-toss mechanic, a board). A wallet may send up to **$1,000** in ETH to his address through a "Donate" press whose permit lasts 5 minutes; the wallet's RPC calls are filtered to exactly that one transfer. [I] A leaderboard of donors exists (`BOARD`); [N] its content.

**[V] Scarcity lines in the product.** *"Ashbeard's book has 3,333 pages left. No more."* [I] 3,333 is the whitelist capacity or the mint supply; [N] confirmation. Draw tickets are "rare". Ember Bait is pass-only. Chapter 1 ends in 21 days (a hard time box). The public mint ends 22 Nov (scanner).

**[I] The economy is a funnel, not a closed loop.** There is no token; the soft currency is cosmetic and for fishing gear. Value for the team comes from (1) the whitelist/mint, (2) FirePass and donations in ETH. Value for the player is status (names, titles, boards), cosmetic expression and a shot at the draw. **That is the opposite of FTF's design** (a testnet simulation with real mechanics but no value); the transferable parts are the *shape* (tiers, chapters, rarity colours, weekly boards), not the price list.

### 3.6 On-chain parts

| Part | Evidence | Label |
|---|---|---|
| Chain: Robinhood Chain (4663), EVM, native ETH | `wallet_rules.js` | [V] |
| Wallet proof: **one free signature** ("Nothing is sent") to link wallet to account; optionally "linked to your X account" | `start.js`, `wallet.js` | [V] |
| Payments: ETH transfer to one address for FirePass/Blaze/skips/donations; the client validates the exact method set (`eth_sendTransaction`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`), cap and recipient before it asks the wallet; the server verifies receipts (`CONFIRMATIONS`, `QUOTE_S`, `LATE_GRACE`) | `wallet_rules.js`, `firepass_pay_rules.js` | [V] |
| NFT: free mint (SeaDrop-style public stage per scanner: 0.001 ETH, 3 per wallet) | scanner page | [V from a third party], contract source [N] |
| No in-game token; no on-chain gameplay found. Gameplay state is server-side | grep of the client | [V] absence in client; server [N] |

**[I]** Chain use is **thin**: identity (signature), payments, and a mint. That is a deliberate design: the 3D game is fast and server-authoritative, the chain is only the cashier and the guest list. FTF is the opposite (more of the economy on chain, less polish), which is a strength **only if the chain moments are made visible in the game** (section 4, M3).

### 3.7 Art, audio and UI direction, and copy tone

- **Art** [V]: low-poly, toy-like, warm. The hearth plate is a riveted iron furnace on cobbles with a glowing arch, a coal pile and a log, dark vignette, **one orange light source** (`--accent #ffb04a`, sky `#a9d2ef`, panels `rgba(24,18,12,.68)`). Characters are **potatoes** (heads and faces on cardboard-like props; "cardboard" material in the physics sound table), class kits (sword, bow, staff, trowel) with shaped abilities (Forge Blade, Ashwood Arrow, Levitatus), a dragon with an eye you can stab. Post-processing: bloom (always), optional ambient occlusion. Day/night cycle behind a flag (on). [N] real frame look.
- **UI** [V]: **hand-made paper-and-pins** aesthetic for the guide and boards (tilted notes with a stroked name in Slackey, an ember pin), dialogue cards with **a large character face sticking out of the card** (Ashbeard red `#b8432e`, Gus blue `#2f7fa8`, Druid `#3d55c8`, Mr. Business green `#3f8f4e`), choice rows with a left-pointing triangle and gold highlight `#ffcf4a`, `kbd` key caps, all text in **Slackey (display), Knewave (accent), Gantari (body)**; a settings gear, a map button (M), a bag, a "coal / carry / brew" HUD strip; touch controls with a stick, an aim stick, Jump / Grab / big Throw buttons with cooldown rings.
- **Audio** [V]: cartoon cues (squeak, giggle, boing), proximity beds, one day music track. [N] loudness.
- **Copy** [V]: **very short, dry, in a character's mouth**, with a rule hidden in the joke. Examples: *"Ashbeard translates the dragon's latest demands: 'My dear slaves. Playing with you like a cat with a mouse was fun. Now it bores me. Entertain me.'"*, *"Gulp! The dragon swallows it, and the spud pops back home"*, *"Old Toothy spat your spud out. It paddles home, deeply offended"*, *"They bake. Stand back."*, *"A cast with it always brings up a sunk chest"*, *"It remembers who fed it."* Chat and system errors are plain ("The world is full: trying again in a while").

### 3.8 Retention hooks and live-ops

| Hook | How it works | Label |
|---|---|---|
| **Daily / weekly quest slots with swaps** (2-3 daily, 3 weekly [I]) | Each quest has an event, a count, a class gate and a feature gate; **class quests join the list when a class is chosen** ("Quests for your class joined your FirePass list.") | [V] |
| **Chapter** (21 days, 30 tiers, rarity-coloured rewards, repeating sack) | clear end date, visible next reward | [V] |
| **Daily Watch**, **weekly cup resets Monday**, **weekly quests** | the world has something that expires | [V] |
| **Unlock schedule inside a track** (`open: 1, 5, 9, 13, 17…` for chapter quests) | quests appear as the chapter ages | [V] |
| **Collection** (every fish, every mutation, the "whole river page", Gus pays 1,000 Scales for finishing a page; "Every mutation seen! The rainbow paint for your float") | completionism | [V] |
| **Loss and comeback** ("the whole school", "Old Toothy swallowed your spud") | small comic setbacks that resolve themselves | [V] |
| **Feature flags** | features arrive as a flag flip with an X post ("The gates open") | [V] |
| **Public weekly boards with prizes for the top ten** | not winner-take-all | [V] |

**Cadence [I]:** one mood post → two weeks of borrowed raffles → one big drop with 6-7 features and the pass on the day the mint opens. The content is shipped *before* it is announced (the flags are already `true`).

### 3.9 Tech stack and engineering practice (relevant to us)

[V] Static ES modules on Cloudflare Pages, no bundler step visible at runtime (hundreds of small cached files, content-hash folder), CDN Three.js, Rapier WASM; a **pure-rules / render split** (`*_rules.js`, `*_math.js` are pure and testable: `firepass_rules.js`, `wallet_rules.js`, `combat_rules.js`, `brawl_math.js`); **feature flags fetched at boot with a safe default**; **CSP with script hashes**; polyfills for old Chromium; start-page failure message instead of a frozen screen; `devFlag` query parameters gated by the `tune` flag (off in production); WebGL context-loss recovery; **LOD and culling** (`cull.js`, `rig_lod.js`, `blob_shadows.js`); a performance tier with an on-screen fps counter. [I] The "pure rules" files are the same pattern FTF already uses (`game/src/game/town-rules.js` plus a contract-side rules module with shared test vectors [VERIFY]), so nothing here changes FTF's architecture.

### 3.10 What is weak or risky about FEED FIRE (use it, do not copy it)

1. **The product is a whitelist funnel first.** [I] Retention after the mint is unproven; the 12 Nov drop is the team's answer. The X-follow/like/quote tasks are brittle (X 403s, rate limits) and brand-risky for a hackathon demo.
2. **Real-money monetisation**, a **$1,000 donation cap** and **tier skips**: pay-to-skip, regulated-adjacent. FTF's frame is free/testnet; copying any of it breaks our legal line.
3. **Draw tickets for a whitelist inside a paid pass** mixes chance and payment: explicitly avoid.
4. **The mint price was raised after the stage opened** (scanner note); trust risk.
5. **English-only chat and a link/wallet filter** are reasonable but exclusionary; FTF has uk/ru/zh/it locales and should keep them.
6. **Server-authoritative everything** (good for cheating) but the chain is not a source of truth for gameplay, so it cannot be audited by a judge. FTF's selling point (on-chain `trade`, `pay_gate`) is the opposite and is where we win if we make it visible.
7. [N] Real stability under load; the "world is full" strings suggest capacity limits.

---

## 4. The vibe equation and the FTF adoption map

### 4.1 The vibe equation (what to reproduce, not what to copy)

> **Vibe = (one shared hungry object) x (one tiny verb with a value ladder) x (other people visible) x (something always about to expire) x (measured juice) x (dry character copy) x (a handle other communities can verify against).**

FTF already has strong *world* (Iris, mobs, tournaments, on-chain silk, a mist-and-stone look). What FTF does **not** yet have, judged from the files listed in section 6 [VERIFY at `origin/main` `e04a5df7`], is items 1, 3 (partly), 5 (numbers) and 7. Items 4 and 6 are partly there (tournaments, narrator). So the adoption map below is mostly **UI and presentation on top of existing systems**, which is why it is safe for a 20-hour window.

### 4.2 Mechanics map (FEED FIRE → FTF)

Effort in focused agent hours (one Opus agent, with tests). "Legal" = risk to the free/testnet/no-value frame. All items flag-gated, default **off** until the owner flips them, except M10 (the kill switch itself).

| ID | FEED FIRE mechanic ([V]/[I]) | FTF translation (concrete) | Prio | Effort | Legal | Depends on |
|---|---|---|---|---|---|---|
| **M1** | Game as **verification oracle** for outside raffles: Tier list, "check every winner against Ashbeard's whitelist" [V] | **"Loom Register" check**: read-only endpoint `GET /api/v1/register/<account>` returning `{ account, gate_paid: bool, gate_paid_silk, tier: 0..2, tournament_entries, shell_rank?, updated_at }` from `gate_paid_of` (CE §2.13) and the existing indexer, plus a plain page `/register` (paste an account, see the badge) and a copy-link "Share my badge" (no wallet connect needed). Tier ladder (all free to reach): **Tier 1 "Enter the valley"** (any session), **Tier 2 "Pay the Gate"** (`pay_gate` done, 200 silk burned), **Tier 3 sealed "The Loom opens" (Season 3 teaser)**. Copy says: "a record of what you did in a free testnet game, no value". | **P0** | 4 h | LOW (do not call it a whitelist for value; call it a **Register**; name it a testnet pass) | CE §2.13 `pay_gate`; relayer read path `[VERIFY]` |
| **M2** | **Scarcity line inside a tip**: "3,333 pages left. No more." [V] | Only if true. A **real** counter: "Pages in the Loom's ledger: N sealed" = number of `gate_paid_of`-true accounts, shown on loading and in the town HUD. If the owner sets a cap, show "N of CAP"; if not, show just N. **Never invent a cap** (OWNER-GATED). | **P0** | 1 h (inside M1/M4) | LOW | M1 |
| **M3** | **The hungry shared Fire** [V]: one object, flares when fed, scarcity of time ("It remembers who fed it") | **The Gate-Loom meter**: a town object (the Loom or the Gate) with a **town-wide "silk burned today"** meter (sum of `pay_gate`, tournament entry fees, trade fees burned; use only values that exist on chain/indexer), glow level in 5 steps, a flare (light + particles + low chime) whenever a burn lands in the visible stream, and a **"remembers" board**: last 5 names who fed it today. Fallback: if the live feed is missing, show **"demo"** labelled data, never fake live. | **P0 UI / P1 live** | 3 h + 2 h | LOW (it is a burn, not a yield; no "rewards" wording) | CE §2.13, presence server `[VERIFY]` |
| **M4** | **Loading as ritual**: PLAY button = progress bar, the hearth warms as it loads, one tip at a time [V] | Start screen: **button fills as assets load**, the Loom/Gate image goes from "dormant" to "lit"; one rotating Iris-voice tip (bank in §9), a **real** Register counter (M2) and platform hint line. Reduced-motion and data-saver variants. | **P0** | 2 h | NONE | `game/src/ui/loading.js` `[VERIFY]` |
| **M5** | **Floating numbers** with pop, crit 3.4x, merge window 250 ms, ghost numbers for others smaller [V] | `game/src/ui/damage-numbers.js` (DOM pool 24, reduced-motion aware), used for: mob damage, crit/finisher, **silk gained** (cream/gold), **silk spent** (muted, minus sign), **XP**. Merge window 250 ms. Colours from the existing HUD tokens. `prefers-reduced-motion`: no pop, only fade. | **P0** | 3 h | NONE | `mobs.js`, `mob-fx.js` `[VERIFY]` |
| **M6** | **Impact stack**: hit-stop 0.05-0.08 s, squash, kick, flash sprite [V] | Add 2 knobs only: **hit-stop 60 ms** on heavy hit and **a camera kick scaled by `motionScale`**; FTF already shakes on heavy hits (`boot-world.js`, `mobs.js` `shake`), so add a **flash sprite** and a **tuning overlay** on `?tune=1` (dev only, off in production) so the owner can adjust live. | **P0 (small)** | 2 h | NONE | `boot-world.js`, `mobs.js` |
| **M7** | **Names over heads, "N in the valley", Server rooms, invite link `?room=&ref=`** [V] | Extend `nameplate.js`/`remote-players.js`: always show handle (or a short account id), a small **"N in the valley"** chip from presence, and a **Copy invite** button (`?room=<id>&ref=<id>`; the ref is only a label, **no reward**). Rooms fall back gracefully ("The valley is full, trying again"). | **P0** | 3 h | LOW (no referral payout) | presence server `[VERIFY]` |
| **M8** | **Remote feature flags** `features.json` with safe defaults, 8 s timeout [V] | `game/public/features.json` (served statically) + `game/src/features.js`: fetched at boot with a 3 s timeout, merged over built-in defaults, **cannot enable anything the build did not include**, shows a tiny "flags: remote/default" line in `?debug`. Lets the owner switch a broken feature off during freeze night **without a redeploy of code**. | **P0** | 1 h | NONE | none |
| **M9** | **Daily Watch**: boss, parties up to 10, **fastest kill board** [V] | **Daily Spider Watch**: one scripted spider event per UTC day, same arena for all, **fastest clear** and **fewest silk lost** boards, top 10 (not top 1) shown; chests only cosmetic/XP. Reuses mob and Shell code. | **P1** | 6 h | LOW | STZ P5/K, `mobs.js` |
| **M10** | **Quest slots + free swaps; class quests join the list** [V] | Extend STZ quest board: **3 daily + 3 weekly** (data already in STZ §6), **two free swaps a day**, a "Chapter" header with a progress bar. Quest givers speak in their own voices (existing scripted citizens). | **P1** | 5 h | NONE | STZ Q streams |
| **M11** | **Chapter pass with rarity colours, 30 tiers** [V] but **paid** | **Loom Pass: free only.** 12-15 tiers over the remaining hackathon days, tiers unlocked by *doing* things (first burn, first win, first quest, a streak), rewards are **cosmetics and titles** (pins, nameplate frames, Iris-voice emotes). Rarity colours reused. **No purchase, no skip, no draw ticket, no on-chain payment.** | **P1** | 6 h | LOW if free (do not add a price) | M10 |
| **M12** | **Streak over the head** (Coliseum) [V] | Tournament and Watch **streak chip** over the avatar (**N wins in a row**), visible to others; resets with a small gloomy line. | **P1** | 2 h | NONE | tournaments, M7 |
| **M13** | **Weekly cup with Monday reset, top ten** [V] | Shell leaderboard shows "this week / all time" tabs and a **"resets in 2d 14h"** chip. Season-3 distribution text stays "documentation only" (STZ §9). | **P1** | 3 h | LOW | STZ §8 |
| **M14** | **Share loop**: trophy card, prefilled intent [V] | **Share card** after a win, a first burn, a Gate passed: a 1200x630 PNG (canvas) and a prefilled intent text in Iris's voice with the explicit footer "free testnet game". **Posting is the player's action, never ours** (OWNER-GATED for any official post). | **P1** | 4 h | LOW | none |
| **M15** | **Proximity audio beds and reaction cues** [V] | Reuse `town-audio.js`: distance-based bed for the Loom (low hum, rises when fed), a **burn chime**, a "denied" cue, **UI blips** and 6 reaction cues (cheer, boo, thunk, creak, chime, whoosh). Mute and per-bus volumes already exist `[VERIFY]`. Synth-only if no samples can be sourced in time (no unlicensed audio). | **P1** | 4 h | NONE | `town-audio.js` |
| **M16** | **Finds checklist and Esc guide** [V] | A **"Finds" board** (Esc/G): e.g. *Find Iris's desk, Find the Gate, Find the Archivist, Find a spider's nest*, ticks by proximity (same radii pattern), "Found n of 4". Becomes the onboarding without text walls; each find is a Tier 1 tick. | **P1** | 3 h | NONE | `guide.js`, `objectives.js` |
| **M17** | **Public status: "the gates are open"** (flags flip with an announcement) [V] | A static **/status** page (or a HUD banner) driven by M8: "Chapter I: the Loom" with end time, today's Watch, resets. | **P1** | 1 h | NONE | M8 |
| **M18** | **Cadence: one mood post, collabs, one drop** [V] | A post plan only (§8). **OWNER-GATED: nothing is posted by the agents.** | **P1 (owner)** | 0 | LOW | owner |
| **M19** | Guild banners, castle, friends book, parties, classes, fishing, day/night, collections, duels [V] | **Not for this hackathon.** FTF already has clans, tournaments, agents, exchange. Listed only so nobody builds them by reflex. | **P2** | n/a | n/a | n/a |
| **M20** | **Paid pass, tier skips ($0.50), donation beggar ($1,000 cap), draw tickets, X-follow gate** [V] | **Do not build.** Breaks the free/testnet/no-value frame and adds support burden. | **NO** | n/a | HIGH | n/a |

### 4.3 What FTF has that FEED FIRE does not (lean on it)

1. **On-chain moments with a receipt**: `pay_gate`, `trade`, tournament entry and payout. FEED FIRE's chain is a cashier; FTF's chain is the game. **M3 and M1 make the receipt visible.**
2. **A real lore engine**: Iris the doctor-linguist narrates (translator persona, same shape as Ashbeard "translating the dragon"). *"Iris translates the Loom"* is a native announcement format.
3. **Autonomous characters**: five clans with a labelled LLM strategy layer, bots that can play quests through the agent API. FEED FIRE has no equivalent; "who fed the Loom today" can include clans (labelled as scripted/LLM).
4. **Free and honest by design**: a clean legal story judges can read.

### 4.4 Acceptance criteria that apply to every item

- Flag in `features.json` (M8) or a local constant; **default off** in `main`; one-line how-to-enable in the PR.
- English strings go through the existing i18n files; **uk/ru/zh/it keys added or fall back to English** `[VERIFY the locale files]`.
- No new network call blocks first paint; every fetch has a timeout and a silent fallback.
- `prefers-reduced-motion` honoured (no shake, no pop, no pulse).
- Mobile (touch) layout checked at 360x640.
- Unit tests for pure logic (formatting, merge window, tier derivation, flag merge).
- **Honest labels**: demo or fallback data says "demo"; nothing that is not read from chain or the indexer is called live.
- Copy rules: free, testnet, no promised value. Banned in player-facing copy: *invest, investment, APY, yield, profit, dividend, return(s), earn passive, guaranteed, airdrop of value, price will*, and any suggestion that silk or a pass has a market value.

---

## 5. Priorities against the deadline

**Today is Thursday 12 Nov, ~20:00 Kyiv. Feature freeze Fri 16:00 (20 h away). Hard freeze Fri 20:00. Deadline Sun 01:59.**

| Window (Kyiv) | Do | Who |
|---|---|---|
| Thu 20:00-23:30 | **P0 batch A**: F0 (M8 flags), F1 (M5 numbers), F2 (M4 loading ritual) in parallel; owner decides the 5 questions in §8 | 3 Opus agents + owner |
| Fri 08:00-12:00 | **P0 batch B**: F3 (M1/M2 register), F4 (M3 meter UI), F5 (M7 presence) | 3 agents |
| Fri 12:00-14:00 | Contract cut line: **no contract change is required by this TZ.** M1 reads `gate_paid_of`; if the contract is not live yet, M1 ships with a labelled **demo** backend | owner / contract stream |
| Fri 14:00-16:00 | Integration, flag review with the owner, F6 (M6 tune and flash) if time | 1 agent + owner |
| Fri 16:00 | **Feature freeze.** P1 items that are not in review are **cut**, not rushed | |
| Fri 16:00-20:00 | Only bug fixes, copy and docs; flags can be flipped by the owner | |
| Sat | Video and pitch: use M1, M3, M5 in the demo (they are visible in 10 seconds) | owner |

**Cut order if time slips:** F7 (M17 status) → F6 (tune overlay) → M3 live feed (keep UI with "demo" label) → M7 invite link (keep names and counter). **Never cut:** M8 (kill switch), M5 (numbers), M1 (Register).

**Total P0 effort:** about 18 agent-hours, parallelisable into 3 independent branches (F0/F1/F2) and 3 (F3/F4/F5); no shared files except `features.js` (F0 first, others read it).

---

## 6. FTF code touchpoints (read-only inspection of `origin/main` `e04a5df7`, Thu 12 Nov 19:24 Kyiv; every path is **[VERIFY]** before editing, the repo moves hourly)

| Area | Path | Note |
|---|---|---|
| Loading screen | `game/src/ui/loading.js`, `game/src/ui/premise.js`, `game/src/ui/onboarding.js` | M4 |
| Mob combat, hit-stop, shake | `game/src/play/mobs.js` (`shake`, `.ftf-hp`), `game/src/render/mob-fx.js`, `game/src/boot-world.js` (camera shake near line 1136) | M5, M6 |
| HUD tokens and panels | `game/src/ui/world-hud/*`, `game/src/ui/hud.js`, `game/src/ui/styles.css` | M3, M5 |
| Presence and other players | `game/src/net/presence.js`, `game/src/play/remote-players.js`, `game/src/play/nameplate.js`, `presence/server.js` | M7 |
| Chat | `game/src/ui/chat-panel.js` | optional |
| Guide, hints, objectives | `game/src/play/guide.js`, `hints.js`, `objectives.js` | M16 |
| Audio | `game/src/audio/town-audio.js` (cue list includes `ui_click`, `ui_confirm`, `ui_notify`, `ui_error`, `bid_tick`, `gift_chime`, `vision_whoosh`, `storm_crack`, `memory_dissolve`), `audio.js`, `mix.js`, `manifest.js` | M15 |
| Gate in the catalog | `game/src/net/catalog.js` (`pay_gate`: "Pay the Gate-Loom fee (10,000 silk)" **today**), `game/src/net/room.js` (`pay_gate` case at ~455 and ~683) | the **fee text must read the portal price from config** (CE: P = 200 silk) `[VERIFY the implemented value]`; M1/M3 must never hard-code 200 or 10,000 |
| Town contract | `contracts/town/src/lib.rs` (`pay_gate`, `gate_paid_of` per CE §2.13) `[VERIFY: may not be merged]` | M1 reads it |
| Whitelist pass | `contracts/whitelist-pass/`, `docs/whitelist-pass.md` | M1 Tier ladder wording |
| Relayer | `relayer/api/`, `relayer/lib/` | where a read-only `register` route could live `[VERIFY]` |
| Locales | `game/src/play/locales/`, `game/src/locales/`, `game/src/ui/i18n/` | add keys |
| Tests | `game/tests/client/` (e.g. `town-rules.test.mjs`), `server/tests/`, `presence/tests/` | node test runner `[VERIFY]` |

---

## 7. Opus-ready prompts

**Common preamble (paste at the top of every prompt):**

```
You are one of the agents working on SpacexCeo/forget-to-foresee (NEAR hackathon). Deadline Sun 15 Nov 2026 01:59 Kyiv; feature freeze Fri 13 Nov 16:00 Kyiv; hard freeze 20:00. Work on a branch named claude/<short-id>. Do NOT push to main, do not open or merge PRs, do not deploy, do not sign or send transactions, do not create accounts, do not touch keys; no secrets in any file. Read-only on contracts and on-chain; any code that can send defaults to dry-run. Everything new is behind a flag that is OFF by default (see F0), degrades silently, and has unit tests. English in code and comments; player-facing strings go through the i18n files with English fallback. Player copy rules: FTF is free, testnet, no promised value. Never write invest, investment, APY, yield, profit, dividend, return(s), guaranteed, airdrop value, or anything that implies silk or a pass has a market value. Iris is a doctor-linguist from another planet in the year 2048; clans, citizens and quest givers are scripted (the five clans have a labelled LLM strategy layer). Do not copy any code, text or art from feedfirerh.com: implement from the behavioural descriptions below. Mark anything you could not verify with [VERIFY] in the PR description. Before editing, `git fetch` and read the files you will touch; paths below are hints, not facts. Report: files changed, tests run (command and result), flag name, how to enable, screenshots if a headless browser is available.
```

### F0 (M8, P0, 1 h): remote feature flags

```
Task: add a tiny remote feature-flag layer so the owner can switch features off during freeze night without a code deploy.
Behaviour (observed in another browser game, implement your own): at boot fetch `/features.json` (static file next to the game build, e.g. game/public/features.json) with a 3 s timeout and `cache: 'no-store'`; merge the values over built-in defaults; a flag that is not in the built-in defaults is ignored (the file can only turn off or on things the build already contains); any failure uses defaults silently; expose `features.on(name)`, `features.all()`, and a `source` ('remote'|'default'). Flags to define now (all default false except `flags` itself): `damageNumbers`, `loadRitual`, `register`, `loomMeter`, `presenceChip`, `tuneOverlay`, `statusBanner`. Add game/tests/client/features.test.mjs (merge, timeout, bad JSON, unknown flag ignored, truthy strings are NOT accepted). Add a one-line `?debug` readout "flags: remote|default".
Acceptance: no extra blocking before first paint; works offline; documented in docs/ (5 lines).
```

### F1 (M5, P0, 3 h): floating numbers

```
Task: floating numbers for combat and silk. Flag `damageNumbers`.
Behaviour: a DOM overlay with a pool of 24 elements, projected from world to screen each frame. Normal number: pops in at 1.2x and settles to 1.0 in ~120 ms, floats up ~33 px, fades by ~650 ms. Crit/finisher: pops at ~3x, gold, 46 px, a small jitter of +-6 px for ~0.3 s, lives ~1600 ms, with a short ring pulse. Merge window 250 ms: hits on the same target within the window merge into one number that grows (+5% per merge up to 1.5x). Other players' numbers are smaller (16 px, crit 28 px). Silk gain numbers use the cream/gold token, silk spent use a muted minus sign, XP uses a cool token. Respect prefers-reduced-motion (no pop, no jitter, just fade). Use existing HUD tokens/fonts (game/src/ui/world-hud/tokens.css or equivalent [VERIFY]).
Wire-up: mob damage events from game/src/play/mobs.js; silk deltas from the town economy event stream [VERIFY the event name]; no new network calls.
Pure functions (merge, scale curve, pool) in a separate file with tests (node:test).
Acceptance: 60 fps with 24 numbers; no layout thrash (transform/opacity only); off by default; mobile 360x640 checked.
```

### F2 (M4, P0, 2 h): loading as a ritual

```
Task: rework the loading screen as a ritual. Flag `loadRitual`.
Behaviour: the PLAY button IS the progress bar (a CSS variable --p 0..1 fills it; label "Loading… 63%" with bytes if available; when ready it becomes "Enter" with a short particle burst and ring; reduced-motion: no burst). A backdrop image goes from dormant to lit as --p rises (use an existing FTF image or a CSS gradient and glow; no new art required). One rotating tip line every 4 s (see the tip bank below), with platform hints (touch vs keyboard). One REAL counter line fed by a read-only fetch (timeout 2 s, silent fallback to hidden): "Pages in the Loom's ledger: N sealed" using the count from the Register endpoint if it exists (see F3), otherwise hide the line (never invent a number). Keep existing loading logic; only restyle and add the tip rotator.
Tips (English; add i18n keys, fallback English): [paste the Iris-voice bank from section 9 of the TZ, lines T1-T10].
Acceptance: no extra requests that block loading; data-saver and reduced-motion variants; tests for the tip rotator and the progress mapping.
```

### F3 (M1, M2, P0, 4 h): Loom Register (the verification oracle)

```
Task: a public, read-only "Register" so outside communities and judges can check what an account did in the free testnet game. Flag `register`.
Backend (relayer, read-only, GET only; no keys; rate-limited; CORS allow *): `GET /api/v1/register/:account` -> { account, gate_paid: boolean, gate_paid_silk: string|null, tier: 0|1|2, entries: number, rank: number|null, updated_at: ISO } where tier 1 = the account has a session, tier 2 = `gate_paid_of(account) > 0` per ftf-town (CE §2.13) [VERIFY: if the contract call is not merged yet, return a clearly labelled `{ demo: true }` from a fixture]. Also `GET /api/v1/register/stats` -> { gate_paid_count, updated_at }. Tier 3 is a sealed teaser: the response never returns it; the page shows "Sealed: opens with Season 3".
Frontend: a static page /register (and a small in-game panel) with an input, a result badge, the tier ladder, a "Copy link" button, and the line: "A record of what you did in a free testnet game. No value." Never use the word whitelist in the UI; use Register/pass. Do not require wallet connect.
Safety: validate the account format; never echo user input unescaped; cache results 15 s; no private data.
Tests: tier derivation, demo labelling, bad input, rate limit.
Acceptance: works with the contract unavailable (demo label); response < 300 ms from cache; no secrets; dry-run only.
```

### F4 (M3, P0 UI + P1 live, 3 h + 2 h): the Gate-Loom meter

```
Task: a town object that visibly "eats" silk burned, to make sinks social. Flag `loomMeter`.
Behaviour: in the town scene, the Gate-Loom (use the existing Loom/Gate asset or a simple emissive mesh) has 5 glow levels from a "silk burned today" total; a flare (light intensity spike, a few particles, a low chime from town-audio.js `gift_chime` or `ui_confirm` [VERIFY]) when a burn event arrives; a small board with the last 5 names who fed it today ("It remembers"). Data: if the presence/indexer feed carries burn events, use them; if not, run in demo mode and label the board "demo" in small text. Never display a number that is not read from a real source, and never imply a reward. HUD chip: "Burned today: N silk". Reduced-motion: no particles, only a steady glow change.
Pure logic (level thresholds, daily rollover at 00:00 UTC, last-5 list) in its own file with tests.
Acceptance: off by default; demo label verified; no extra blocking calls.
```

### F5 (M7, P0, 3 h): names, "N in the valley", invite link

```
Task: make other players feel present. Flag `presenceChip`.
Behaviour: always show a short handle (or account id shortened) over remote avatars (extend game/src/play/nameplate.js and remote-players.js), a chip "N in the valley" from presence (hidden if presence is down), and a "Copy invite" button that copies `?room=<id>&ref=<label>`; joining via the link lands in the same room; ref is a label only, no reward, no tracking beyond a counter. Fail gracefully: "The valley is full, trying again".
Acceptance: no PII beyond the public account id; tests for URL parsing and chip hiding; reduced-motion safe.
```

### F6 (M6, P0 small, 2 h): feel tuning

```
Task: tiny polish plus a dev-only tuning overlay. Flag `tuneOverlay` (dev only).
Behaviour: on a heavy mob hit apply a 60 ms hit-stop (freeze animation time, not the camera), a small camera kick scaled by the existing motion/reduced-motion setting, and an additive flash sprite (cream, 120 ms) at the contact point (extend mob-fx.js). With `?tune=1` and the flag on, show a small panel with sliders for hit-stop ms, kick, flash alpha, number size; values in localStorage; no effect in production.
Acceptance: reduced-motion disables kick and hit-stop; tests for the clamp and scale functions.
```

### F7 (M17, P1, 1 h): status banner

```
Task: a HUD banner and a /status page driven by features.json: chapter name "Chapter I: the Loom", an end time, today's reset time, and which features are open. Flag `statusBanner`. All copy from i18n; times shown in the viewer's timezone with the zone label; no claims about value.
```

### F8 to F10 (P1, only if F0-F5 are in review by Fri 12:00)

```
F8 (M10): extend the STZ quest board with 3 daily + 3 weekly quests, two free swaps/day, a Chapter progress header; quest givers speak in their scripted voices; no value language; reuse STZ Q streams, do not fork them.
F9 (M14): share card — a canvas-generated 1200x630 PNG after a win/first burn/Gate passed, plus a prefilled share text (Iris voice) ending "free testnet game"; the player clicks to share; the app never posts.
F10 (M15): audio — a distance-based hum bed for the Loom that rises when fed, a burn chime, a denied cue, and 4 reaction cues; synth-only unless a licensed sample exists in the repo; per-bus volumes via the existing mixer.
```

---

## 8. OWNER-GATED decisions and the announcement plan (nothing here is done by an agent)

| # | Decision | Default if the owner is silent |
|---|---|---|
| 1 | **Flip the flags** (`features.json`) on Fri 14:00-16:00 after a 10-minute review of each | everything stays off, only code lands |
| 2 | Is there a **cap** on the Register ("pages")? | no cap shown; only a real count |
| 3 | Name for the ladder: Register / Pass / Loom list | "Register", never "whitelist" in player copy |
| 4 | **Collabs with other communities** (the engine of FEED FIRE's growth): the owner contacts people, if at all | none; the Register page is ready if they come |
| 5 | **Official X posts** (tone, timing) | none by agents; section 9 has a draft bank for the owner |
| 6 | Whether **Tier 3 sealed** is mentioned (Season 3 roadmap) | mention as "sealed, opens with Season 3", no promise |
| 7 | Keep the Gate price display bound to config (CE: 200 silk) | yes |

**Post cadence to mirror (owner's call):** one mood post (the premise in one line), one "allies wanted" post, one drop post when the flags flip. Drafts in Iris's voice, all marked free/testnet:

- *"Iris here. The Loom has a debt it cannot read. I am translating. Free testnet. Come and listen."*
- *"Gate-Loom fed N silk today. It remembers who. (Free testnet game, no value.)"* (use a real number only)
- *"Chapter I is open. Spiders at dusk. Fastest clear is on the board."*

---

## 9. Iris-voice copy bank (English; add uk/ru/zh/it later)

**Loading tips (T1-T10):**
T1 "The Loom is hungry."
T2 "Silk burns. The Gate remembers."
T3 "Pay the Gate once. The valley opens."
T4 "Iris is writing names in the Register."
T5 "Spiders keep time. Learn their count."
T6 "Three wins in a row, and the valley will say your name."
T7 "A quiet clan is not an empty clan."
T8 "Iris translates the Loom. Badly. She is a doctor, not a poet."
T9 "Free. Testnet. No promises. Only the Loom."
T10 "The Loom remembers who fed it."

**Toasts:** "Fed the Loom: -N silk." / "The Gate remembers." / "Spider down. +N silk." / "Streak: N." / "Daily reset in 3h 12m."
**Errors:** "The valley is full. Trying again." / "The Loom is quiet. Showing demo data." / "That account is not in the Register yet."
**Banned in all copy:** invest, investment, APY, yield, profit, dividend, return(s), guaranteed, airdrop value, "price will".

---

## 10. Not observed, risks and honest limits

**[N] Not observed:** real gameplay feel; frame rate; audio loudness and quality; the music mix; the 3D scene composition (only the hearth plates were viewed); the server rules for `mine/throw/burn`; real concurrency and room caps; the contents of the donation board and the `tune` panel; any retention or conversion number; the exact whitelist capacity (3,333 is a tip line only [I]); the mint contract source; whether burns pay anything on chain; the FirePass server rules beyond client constants; X analytics (X returned 403; counts come from a mirror and may lag).

**Risks:**
1. **Overfitting to a different product.** FEED FIRE is slapstick and mint-driven; FTF is mist, lore and chain-native. Copy mechanics, not jokes.
2. **Freeze-night regressions.** All items are flag-off by default; the kill switch ships first.
3. **Fake liveness.** The worst failure is a "live" meter that is not live. Demo data is always labelled.
4. **Legal drift.** A Register that sounds like a whitelist for value, a referral reward, a ticket, or a pass with a price all move FTF from "free testnet game" toward a promotion. Keep the Register wording neutral and no payouts.
5. **Copyright.** No code, text, art or audio from feedfirerh.com enters the repo; only observed behaviour is re-implemented.
6. **Parallel streams.** STZ Q0/P5 and CE §2.13 are on the critical path; M1/M3 depend on `gate_paid_of`; if the contract is not merged by Fri 14:00 they ship with a demo label.

**Verification checklist before merging each item:** flag off by default; `prefers-reduced-motion`; 360x640; i18n fallback; tests pass (`[VERIFY]` the command in `game/package.json`); no network call blocks paint; banned-word grep on the diff; no keys; no push to main.
