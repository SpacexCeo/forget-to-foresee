# NEAR Saboteur: competitor teardown and implementation TZ for Forget to Foresee (FTF)

Prepared Thu 12 Nov 2026, evening (Europe/Kyiv, UTC+2), read-only research. Audience: the owner's Opus agents. Language: English. Owner request: a separate, very detailed teardown of NEAR Saboteur that can be used as a TZ.

Deadlines used throughout (Europe/Kyiv): **code freeze Fri 13 Nov 16:00**; **hackathon development ends Sun 15 Nov 01:59** (= Sat 14 Nov 23:59 UTC; earlier FTF documents wrote "Sun 15 Nov", but 15 Nov 2026 is a Sunday); judging starts 16 Nov 00:00 UTC (16 Nov 02:00 Kyiv).

## How to read this file

| Part | What it is | Who uses it |
|---|---|---|
| 0 | Summary, labels, standing rules, corrections to earlier FTF documents | everyone |
| A | The teardown of Saboteur: facts, each tagged **V** (verified by me) or **C** (claimed by them, not independently verified) | lead, reviewers |
| B | Side-by-side table: they have / we have / gap / priority | lead |
| C | One implementation TZ per item we adopt or beat, each with a copy-paste Opus prompt | build agents |
| D | How we beat Saboteur (our unique angles) | lead, pitch writer |
| E | Owner checklist, [VERIFY] list, reproduction commands | owner, reviewers |

**Labels.** **V** = I checked it myself this session (repo file, public RPC, nearblocks v3, live backend JSON, X read). **C** = their own statement (README, post, page) that I did not or could not check. **Inferred** = my reasoning from V facts. **[VERIFY]** = unknown, must be checked before anyone relies on it. **SAFE** = no key, no money, no irreversible step. **CONDITIONAL** = safe only behind a flag / after a named check. **OWNER-GATED** = funding, key custody, signing, mainnet, deploy, posting, form submission, repo settings; agents prepare and stop.

**Priorities** are against the freeze (Fri 13 Nov 16:00 Kyiv) and the deadline (Sun 15 Nov 01:59 Kyiv). P0 = must be merged before the freeze; P1 = should be merged before the freeze, may land as docs-only after it; P2 = only if P0/P1 are green, otherwise written down as roadmap.

## 0. Summary

### 0.1 What Saboteur is, in one paragraph

NEAR Saboteur (https://nearsaboteur.com) is an Among-Us-style social deduction game (4 to 10 players on a space station; crew do missions, hidden saboteurs kill, meetings and votes) with a web client (React/Vite), a Node/Socket.IO/MongoDB backend, AI bots with their own testnet NEAR accounts (NEAR AI Cloud for meeting chat, with rule-based fallbacks), email login with a server-made in-game wallet, a pool-prize escrow contract on testnet (v4), a mainnet "Play Pass" paid in real NEAR, a NEP-141 token `$SABOTEUR` v2 whose rules live in the contract ("catch = burn", 7-day timelock, 0 access keys), and a **Weekly Rewards Agent** that pays the weekly top 3 in real mainnet NEAR through the NEAR Intents Agent API under an owner-signed policy. It enters **three tracks**: Games With Real Economies (main), Memecoins With Mechanics, Agent Economy (C: their README). It is a **pre-existing product** (first commit 27 Jun 2026); the NEAR-specific work was built 5 to 12 Nov.

### 0.2 Verified facts that matter most (all V unless marked)

| # | Fact | Evidence |
|---|---|---|
| 1 | Both repos are old: first commit **2026-06-27**; **77.6 %** of frontend commits (333 of 429) and **84.1 %** of backend commits (403 of 479) predate 1 Nov. | full clones, `git log` (section A3) |
| 2 | They disclose it well: tags `pre-hackathon` (FE `ec86165`, BE `25b6b99`, both 6 Oct 2026), tag `hackathon-submission`, compare links, a "Prior work" list. No commits between 6 Oct and 5 Nov; every commit after the baseline is inside the 19 Oct to 14 Nov window. | repo tags, README "Hackathon diff" |
| 3 | Diff since baseline: frontend 147 files, +10,339 / −4,874 lines; backend 54 files, +20,245 / −2,815. | `git diff --shortstat` |
| 4 | Token `sabo.saboteur.testnet` has **0 access keys** (DeleteKey tx `BKngCdhS…775i`, 2026-11-12 11:43:08 UTC = 13:43 Kyiv); the contract account was created the same morning (about 07:05 UTC, nearblocks v3 `created`). Rules view shows `pending: null`, 7-day timelock. | RPC `view_access_key_list`, `EXPERIMENTAL_tx_status`, `get_rules`, nearblocks v3 |
| 5 | Token live stats: total supply 999,999,870; ritual pool 49,999,870; minted by play 600.75; migrated 36,573.01; **burned 130; caught 5; play passes 0; matches rewarded 11**. | RPC `get_stats` |
| 6 | Pool contract `near_saboteur_contract.testnet` reports v4.0.0 and still has **2 full-access keys** (not locked). 28 `#[test]` in `contract/src/lib.rs`; token has 20; backend has one JS test file (8 tests); frontend has no tests. | RPC, grep |
| 7 | "Try to cheat" page lists 4 failed testnet transactions with exact panic texts; I re-fetched all four via `EXPERIMENTAL_tx_status` and the errors match. The signers are their own test and service accounts (`rewards.saboteur.testnet`, `saboteur.testnet`, `p-e2etest01.saboteur.testnet`), so they are **staged attempts**, not outside attackers (Inferred). | RPC |
| 8 | Mainnet `saboteur.near` is a plain account (no contract, 1 full-access key, about 0.49 NEAR, 28 txns), receives 1 to 5 NEAR Play Pass payments and made a `store_wallet_policy` delegate call to `outlayer.near` on 2026-11-10 07:08 UTC. | RPC, nearblocks v1 |
| 9 | The Weekly Rewards Agent has **not paid anyone yet**: `/weekly-rewards` live shows prize $10 (split 50/30/20), `lastWeek: null`, first reset 2026-11-13T18:30Z (= Fri 13 Nov 20:30 Kyiv). The agent wallet could not be inspected on chain (account not found as a regular account). | live backend GET, RPC |
| 10 | Real usage is tiny: 11 rewarded matches, 5 catches, 10 players on the weekly board (top score 233), Wall of Shame contains only bots; Watch Live is **disabled** on the live backend (`/watch/config` → `{"enabled":false}`); Telegram posting is paused unless `TELEGRAM_PAUSED=0` is set (cannot verify the setting). | live GETs, `index.js` |
| 11 | Demo post (posted 2026-11-12 12:54 UTC = 14:54 Kyiv): 204 impressions, 8 likes, 4 reposts, 4 replies, 1 quote at read time; video 324.5 s with 89 views; the account has 14 followers (created 2026-07-02). I did **not** watch the video. | X read |
| 12 | Nothing in either repo uses NEP-245; no merchant NPCs, no player markets, no fast-forward mode. These are the Games prompt's own requirements. | `grep` over both repos |

### 0.3 Verdict in four lines

1. As a **game loop** they are simpler and more social than FTF; as a **track answer** to "NPCs with wallets, player-owned markets, evolving economy" they are weak (their economy sits around the game, not in it).
2. Their real edge is **presentation of evidence**: a "do X, see Y" judge table, a live token page, real failed transactions, a locked contract, an owner-signed payout agent with a cancel window, and honest legal wording. All of it is cheap to match; most of it we can beat with chain data we already have.
3. Their real weakness is **Q-004 risk plus thin proof**: an old codebase, three tracks at once, a payout agent that has not paid, 11 rewarded matches, a pool contract with live keys, an open `ft_transfer`, and trusted-server pages presented as "live from the contract".
4. Estimated Games track-adjusted score **6.20** (Medium threat) against FTF **6.65** (reference, same method); details in section A15. This is my estimate under the scorecard method, not an official score.

### 0.4 Standing rules (every agent, every item)

- Repo is read-only for this document's author; agents building items work on their own branches and **never push, merge, deploy, fund, sign, delete keys or post**. Merge captain: the Claude lead.
- Any code that can send a transaction, money, a message or a post **defaults to dry-run** and refuses to send without an explicit owner-controlled flag plus an owner-provided key file path that is never committed.
- No keys, tokens or secrets in the repo, logs, prompts or screenshots.
- Do not copy Saboteur code, copy, art or text. Their repos are MIT-licensed (V: `LICENSE` in both), which would allow reuse with attribution, but we **reimplement** because the stack differs and because copied text would hurt the "built in the window" story. Link to their public pages only as references. Never contact them.
- Lore canon: Iris is a doctor-linguist from another planet, year 2048; clans, citizens and quest givers are scripted (and since 12 Nov the five clans get a **labelled** LLM strategy layer, see C11).
- Legal framing: free to play, no purchase required, no promised value, testnet framing, real-value distribution only after legal and security review, no investment or securities language.
- Never invent counts, prices, hashes or dates. Numbers in docs come from `docs/STATS.md` (generated) or from a command output pasted next to the claim.

### 0.5 Corrections to earlier FTF documents (found while researching)

1. **Hackathon window.** The organizers' live `HACKATHON.md` (fetched 12 Nov) says in **Q-001**: code before 1 Nov is allowed "from the announcement on 2026-10-19 … The window runs from then to 2026-11-14. Earlier commits are baseline." The facts table, however, says "Hackathon starts 2026-11-01" and submissions are accepted 1 to 14 Nov. **Q-002** reads: "Existing product on another chain? Allowed. Only the NEAR integration built in the window is judged. Disclose in README." **Q-004**: "Old project as-is: no. New feature in the window: yes, if separated per Q-003." **Q-003**: dedicated branch, or tags `pre-hackathon` and `hackathon-submission`, plus a README section linking the diff. FTF's earlier documents say "1 to 14 Nov"; the safe reading for FTF is both, and it passes both (next point). Saboteur's README itself uses 19 Oct to 14 Nov.
2. **FTF's own history.** In a fresh `origin/main` (`6ddd312e`, merged 12 Nov 18:29 Kyiv) `git rev-list --count` gives **1,629 commits, all dated 7 to 12 Nov 2026**, **0 before 1 Nov**; the first commit is "Baseline: empty repository before work began" (7 Nov 13:14 Kyiv) and the tag `pre-hackathon` already points to that empty root commit. The scorecard sentence "most of that work predates 1 Nov" and the "largest history" worry do **not** match this git history. [VERIFY] with the owner whether older private history existed elsewhere; if not, FTF has the **cleanest Q-004 position in the field** and should say so (item C12). Saboteur is the opposite case.
3. **LLM policy.** `docs/decisions.md` (12 Nov) now records an owner decision: clans get an LLM strategy layer through NEAR AI Cloud (TEE path), rules engine executes every move, decisions journalled and labelled "LLM-chosen strategy" vs "scripted"; fallback to scripted when the endpoint does not answer (402 today). The NPC economy run stays labelled "scripted NPC activity, owner-run, testnet, public seeds (never AI)". Item C11 follows this.
4. **Scoring caveat.** Saboteur is not in `FTF-Competitor-Scorecard.md/.csv` (I grepped both). I could not tell whether it was missing from the 683-entry catalog snapshot or filtered out [VERIFY].

---

# PART A. TEARDOWN

## A1. What it is and how a judge meets it

- **Pitch (C, README):** "A social deduction game with a real economy on NEAR." Tracks: Games With Real Economies (main), Memecoins With Mechanics ($SABOTEUR v2), Agent Economy (Weekly Rewards Agent).
- **Judge entry point (V, README "Try it in 5 minutes"):** five steps, each ending in "You'll see …": (1) play a match as a guest against AI bots; (2) open `/token` and see live numbers from `sabo.saboteur.testnet`; (3) open "Try to cheat $SABOTEUR" and a failed tx on the explorer; (4) sign in by email → Ranks → Weekly to see the prize, top 3 and the DEV-excluded founder; (5) run the tests (`npm test`, `cargo test` 28, `cargo test` 20).
- **Track-hint table (V, README):** maps each organizer hint to a feature (Agent NPCs → bots with own accounts; Social login → email login with made-for-you wallet; Intents → Weekly Rewards Agent; Mechanic in contract → token v2 with 0 keys).
- **Pages (V):** `/` (SPA game, could not render it headless; Design is inferred), `/how-to-play` (static page with screenshots), `/token` (static HTML that polls the backend's `/saboteur/live`).
- **Hosting (V):** backend on Render (cold start up to about a minute when idle); the frontend host is not confirmed [VERIFY]. A judge's first load can stall; the how-to-play page and README do not warn about it [VERIFY whether the site shows a "waking up" message].

## A2. Evidence method (so the labels can be trusted)

- Frontend: `https://github.com/Om7eth/near-saboteur-frontend`, backend and contracts: `https://github.com/Om7eth/near-saboteur-backend`. Full clones read at 12 Nov 2026 (last commits: FE 2026-11-12 18:25 IST, BE 2026-11-12 17:15 IST).
- Chain: `fastnear` public mainnet and testnet RPC (`query view_account`, `view_access_key_list`, `call_function`, `EXPERIMENTAL_tx_status`), nearblocks mainnet v1 and testnet v3 (testnet v1/v2 is retired; their notice says "use /v3", and v1/v2 end on 22 Nov 2026).
- Live pages: `nearsaboteur.com/token`, `/how-to-play` and public backend GETs (`/saboteur/live`, `/weekly-rewards`, `/watch/config`). The main game page is a client-rendered SPA and returned only a loading text; I did not play it.
- X: public read of status `2120862694026940559`. I did not watch the video.
- Not independently verifiable (C only): their "22 of 22 testnet e2e checks", the video content, the encrypted wallet policy numbers on chain, the Telegram bot's behaviour, the `TELEGRAM_PAUSED` setting, anything behind sign-in.

## A3. Commit history and the window rules (V)

| Measure | Frontend | Backend |
|---|---|---|
| Commits | 429 | 479 |
| First commit | 2026-06-27 | 2026-06-27 |
| Last commit (when read) | 2026-11-12 18:25 IST | 2026-11-12 17:15 IST |
| Before 1 Nov | 333 (77.6 %) | 403 (84.1 %) |
| 1 to 14 Nov | 96 | 76 |
| Gap | none between 6 Oct and 5 Nov | none between 6 Oct and 5 Nov |
| Baseline tag `pre-hackathon` | `ec86165` (6 Oct, "Add files via upload") | `25b6b99` (6 Oct, "Add files via upload") |
| Submission tag | `hackathon-submission` exists | exists |
| Diff since baseline | 147 files, +10,339 / −4,874 | 54 files, +20,245 / −2,815 |
| Compare links in README | `compare/ec86165...main` | `compare/25b6b99...main` |
| Licence | MIT | MIT |

Reading under the organizers' rules:
- **Q-001 reading (window starts 19 Oct):** their baseline is 6 Oct and the first post-baseline commit is 5 Nov, so the split between "old" and "window" is **clean and honest**. The old part: base game, accounts and email login, Free Play, Ranks, Inbox, first pool contract (v3) (C, their disclosure; consistent with history).
- **Scorecard reading (more than 40 % of commits predate 1 Nov → dock Technical):** both repos are over the line (77.6 %, 84.1 %). I docked Technical by 0.6 in section A15.
- **Q-004 risk:** "Old project as-is: no." Their defence is a separated diff, which is exactly what Q-003 asks for. Risk that remains: a judge may treat the playable game (the part a screener sees first) as baseline and judge only the economy layer; the economy layer is thin in usage (A14).
- **Q-015 note:** one person may submit at most 2 different projects, each README naming the other. They list three **tracks** for one project (allowed: "every track the project fits"), not three projects.
- Their README says "built with Claude (Claude Code)" (V, "Libraries and AI tools"); Q-017 says screening by Claude Code and Codex is not deciding.

Pattern for FTF to copy (and beat): tags + compare link + a "Prior work" list. FTF's position is stronger (empty baseline, all commits in the window); see C12.

## A4. Feature inventory with file paths

Paths are relative to each repo (FE = `near-saboteur-frontend`, BE = `near-saboteur-backend`). "Window" = built after the 6 Oct baseline per their own "Prior work" list (C) and consistent with history (V where stated).

| # | Feature | Where it lives | Status / evidence | Window |
|---|---|---|---|---|
| 1 | Core game: rooms, roles, movement, missions, sabotage, meetings, chat, votes | FE `src/game.jsx` (25,571 lines, one file); BE `index.js` (13,787 lines, one file), Socket.IO | V sizes; gameplay not played | before |
| 2 | Email signup, OTP, login, password reset | BE `index.js` routes `/auth/signup`, `/auth/verify-otp`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`; bcrypt; email sent through Resend (`resend` in `package.json`) | V code | before (C) |
| 3 | In-game wallet "made for you" | BE `/wallet/create-named-account` creates `<username>.<oracle account>` as a sub-account funded by the server's oracle account and gifts testnet NEAR; FE `src/game.jsx` (`near-seed-phrase`, PBKDF2 150,000 iterations + AES-GCM keystore encrypted with the account password) | V code. "No gas, no seed phrase" is true for the player because **the server pays**; it is not a meta-transaction design | before / mixed |
| 4 | External wallet sign-in (HOT, Meteor, Intear) | FE `package.json` (`@near-wallet-selector/*`, "latest" unpinned); BE `/auth/wallet-challenge`, `/auth/wallet-verify` (signed message) | V code | before / mixed |
| 5 | Guest play | FE game flow ("jump in as a guest"); rewards need an account (`noRewardForGuests`) | V `economy/rules.js` | before |
| 6 | AI bots as players | BE `bots/botManager.js` (851 lines), `brain.js`, `pathfinding.js`, `mapData.js`, `lessons.js`, `fallbackChat.js` | V code | mixed |
| 7 | Bot meeting chat and voting via NEAR AI Cloud | BE `bots/meetingBrain.js` (791 lines): `NEAR_AI_API_KEY`, default model `Qwen/Qwen3.6-35B-A3B-FP8`, `NEAR_AI_DAILY_BUDGET_USD` default 1 (UTC day) then rule-based lines; a bot backs a vote only with evidence from its memory; saboteur bots bluff with probability 0.4 | V code; tests `tests/bots.test.js` | window |
| 8 | NEAR AI mission (asks players questions, offline fallbacks) | BE `nearAiMission.js` | V code | window |
| 9 | Bot wallets | 13 accounts `bot-<name>.saboteur.testnet` created by `scripts/setup-saboteur-token.mjs`; bots earn by rank; past 50,000 they send to a Bot Treasury (`bots.<parent>`) | V accounts exist; `economy/rules.js` | window |
| 10 | Free play / pool / paid game modes | BE `index.js` `getRoomGameMode` (`free`, `pool`, `paid`); FE `src/poolScreen.jsx` | V code | pool v3 before, v4 window |
| 11 | Pool escrow contract v4 | BE `contract/src/lib.rs` (830 lines), `contract/README.md`; CI `.github/workflows/deploy-contract.yml` (runs `cargo test` before deploy; manual `workflow_dispatch`, testnet or mainnet input) | V v4.0.0 on chain, 28 tests | window |
| 12 | Real-NEAR pools on mainnet: host pays winners from own wallet, every payment checked on chain | BE `index.js` (host payout routes), FE `src/poolScreen.jsx` | C (not exercised by me) | window |
| 13 | Play Pass in mainnet NEAR (skins, 2x rewards) and custom characters in mainnet NEAR | BE `index.js` (`PLAY_PASS_MAINNET_RECEIVER` default `saboteur.near`, verifies the transfer receipt, signed message proves the payer wallet) | V code; V inbound 1 to 5 NEAR transfers to `saboteur.near` | window |
| 14 | `$SABOTEUR` v2 token (NEP-141, near-sdk 5.26.1) | BE `token-v2/src/lib.rs` (821 lines), `token-v2/README.md`, `token-v2/simulate.py`; backend client `economy/saboteurToken.js` (290 lines) | V on chain | window |
| 15 | Rewards rules in one readable file | BE `economy/rules.js` ("the ONE readable place for every number") | V | window |
| 16 | Weekly Rewards Agent (NEAR Intents Agent API, OutLayer) | BE `economy/weeklyAgent.js` (805 lines); admin page `admin-dashboard.html`; route `/weekly-rewards` | V code; **no payout yet** | window |
| 17 | `/token` live page, Wall of Shame, "Try to cheat" | FE `token/index.html`; BE `/saboteur/live`, `/saboteur/wall`, `/saboteur/bots` | V live | window |
| 18 | How-to-play page with screenshots | FE `how-to-play/index.html` | V | window |
| 19 | Referrals | BE `index.js` (`REFERRAL = { matches: 3, minHumans: 2, tokens: 1000, points: 30, weeklyCap: 5 }`); route `/referrals` | V code | window |
| 20 | Watch Live (silent spectator for public Free and Pool rooms) and host watch seats | BE `index.js` (`watchLiveEnabled`, `/watch/config`, `/watch/rooms`, admin toggle) | V code; **disabled on the live backend** | window |
| 21 | Telegram bot (room cards that update, `/play /rooms /live /ranks /help /subscribe`) | BE `index.js` (Telegram block, `/telegram-webhook`), art `public/tg/*.jpg` | V code; off unless `TELEGRAM_PAUSED=0` | window |
| 22 | Inbox, News, Ranks, weekly prize banner | BE `index.js`, FE `src/homeConsole.jsx` | V code | before / window |
| 23 | Station map v2, match moments, HUD kit, music | FE `src/stationMap.jsx`, `src/matchMoments.jsx`, `src/hudKit.jsx`, `src/bgm.js` | V files exist | window |
| 24 | Light NEAR client | FE `src/nearLite.js` | V file exists | mixed |
| 25 | Admin dashboard (rewards agent, watch toggle, logs) | BE `admin-dashboard.html`, `logAdminAction` | V code | window |
| 26 | Tests | BE `tests/bots.test.js` (one file, 8 tests); Rust 28 + 20 `#[test]`; FE: none | V counts | window |
| 27 | Deploy / security scripts | BE `scripts/deploy-saboteur-v2.mjs`, `scripts/secure-saboteur-wallets.mjs`, `scripts/setup-saboteur-token.mjs` | V files exist | window |

## A5. Architecture

### A5.1 Stack and runtime

- **Frontend:** React 18, Vite 5, Socket.IO client, `tweetnacl`, `bs58`, `near-seed-phrase`, Wallet Selector modules (HOT, Meteor, Intear). Several dependencies are pinned to `"latest"` (V `package.json`): a rebuild can pull different versions. No tests, no linter config seen.
- **Backend:** Node, Express 4, Socket.IO 4, Mongoose 8 (MongoDB), `bcryptjs`, `resend`, `near-api-js` 7. `npm test` runs `node --test tests/bots.test.js`.
- **Shape:** two giant single files (`game.jsx` 25,571 lines, `index.js` 13,787 lines). This makes the system fast to ship and hard to audit; it is a Technical-score and reviewability weakness, and it is a reason a judge's AI screener may struggle to map claims to code.
- **Hosting:** Render for the backend (V: token page is fed by `/saboteur/live` and cold starts take up to a minute).

### A5.2 Realtime and multiplayer

- Socket.IO rooms hold authoritative game state on the server (positions, roles, meetings). `getRoomGameMode` selects `free`, `pool` (host-funded) or `paid` (entry fees). Watch Live attaches a read-only socket to public Free/Pool rooms and never to Paid rooms (V code: `watchLiveEnabled && room.isPublic && !room.devMode && mode !== "paid"`).
- Bots are server-side actors in rooms (no browser): path-finding on `mapData.js`, role logic in `brain.js`, meeting talk in `meetingBrain.js`.

### A5.3 Bots and NEAR AI usage (honest reading)

- LLM use is limited to **meeting chat and vote hints** and the **NEAR AI mission**, with a USD-per-day budget (default 1) and a rule-based fallback path (V `meetingBrain.js` header comments). The README says what is AI and what is not, but the live UI label of "this line is from a model" was not verified [VERIFY].
- The default model name `Qwen/Qwen3.6-35B-A3B-FP8` is described in code as a verifiable/TEE-capable NEAR AI Cloud model (V comment). The repo does not publish TEE attestations for the bot lines (unlike FTF's `tools/verify-tee` path). 
- Each bot has its own NEAR account and receives token rewards by rank; that is a thin but real "NPCs with wallets" answer for the Games prompt (V accounts). The wallets do not trade, price or invest: they are **earners**, not **merchants**.

### A5.4 Email login and automatic wallet: what "gasless" really is

1. Email + password signup, OTP by email (Resend), bcrypt hash, session token (V routes).
2. After login the client makes a seed phrase with `near-seed-phrase`, encrypts it with PBKDF2 (150,000 iterations, SHA-256) + AES-GCM keyed by the **account password** and stores the encrypted blob via `/wallet/keystore` (V code comments in `game.jsx` around line 11069 and route `/wallet/keystore`).
3. `/wallet/create-named-account` makes `<name>.<oracle>` on testnet from the server's oracle account (`createAccount`), refuses below a reserve balance (`TESTNET_FUNDER_RESERVE_NEAR`) and gifts testnet NEAR (V).
4. Result: the player never sees gas or a seed phrase because **the server funds and the server stores the encrypted keystore**. This is custody by the operator with client-side encryption; not NEP-366 meta-transactions, not a relayer-per-call. Anyone judging "social login" strictly may call it custodial (Inferred).
5. Passwords and reset: a password reset on a client-encrypted keystore is the classic problem; they have `/wallet/request-reset` and `/wallet/reset`, which implies the reset **wipes** the wallet binding rather than recovering it [VERIFY by reading `index.js` lines near 2806 to 2858].

## A6. Intents Weekly Rewards Agent (V code, `economy/weeklyAgent.js`)

**Purpose.** Pay the weekly top 3 in real NEAR on mainnet through the NEAR Intents Agent API; the game server never holds the owner's key.

**Actors and rules (V, file header and constants).**
- `saboteur.near` is the OWNER (env `WEEKLY_AGENT_OWNER`). It signs the agent's **policy** and the server's **grant** once. Observed on chain: a `store_wallet_policy` delegate action sent to `outlayer.near` on 2026-11-10 07:08 UTC (policy encrypted; policy hash `2dd5d219…cf960`; valid until about 17 Nov).
- The server holds only the **grant token** (encrypted in MongoDB) and a partner API key (env `NEAR_INTENTS_AGENT_API_KEY`). Base URL default `https://api.demo.agentsonintents.com` (a **demo** API), constant `RISK_NOTICE`: "an experimental, mainnet-only beta. You may lose all assets you put in this wallet… Keep amounts small."
- Policy built by the code: withdraw-only, `nep141:wrap.near` (wNEAR) only, **weekly USD cap = max(15, ceil(1.5 x prize USD))** (so $15 for a $10 prize), a per-payment cap in NEAR, `timelock_ms: 0` (**the agent policy itself has no timelock**).
- Prize: default `prizeUsd` 10, split `[50, 30, 20]` percent.

**Weekly flow (V).**
1. At weekly reset the top 3 are queued as **one batch with one 30-minute timer** stored in the database (`COUNTDOWN_MS = 30 * 60 * 1000`), so it survives restarts.
2. Admin can "Send now" or "Cancel this week". At 0:00 of the timer all three are sent together.
3. Every payment saves its **Idempotency-Key before sending**, so a crash or lost response cannot pay twice (a retry replays the same key). Terminal states: `SUCCESS`, `FAILED`, `REFUNDED`, `NEEDS_REVIEW`.
4. A week that ended more than 3 days ago is **never queued** (`LATE_WINDOW_MS`).
5. `stopAfterWeekEnd` ("pay this week, then stop") and `enabled` switch; `mode` `payout` or `withdraw_to_owner`.
6. **DEV exclusion:** `WEEKLY_EXCLUDE` default `om7eth` (the founder); excluded accounts never win and are shown with a DEV tag on Ranks (`staff` in the `/weekly-rewards` payload).
7. Terms: the owner must accept partner and OutLayer terms (`termsAcceptedAt`, `termsAcceptedBy`) before enabling.

**What I could and could not verify.**
- V: the code, the live `/weekly-rewards` JSON (prize $10, split 5/3/2 dollars, `lastWeek` null, first reset 2026-11-13T18:30Z), the owner's policy-store transaction.
- Not V: the agent wallet's balance or the policy's cap numbers (the agent account id in the payload is a 64-hex implicit-style id that returned UNKNOWN_ACCOUNT on RPC, and the policy is encrypted). **Treat "pays real NEAR" as C until the first payout appears on chain.** The first payout is due Fri 13 Nov 20:30 Kyiv, i.e. after our freeze: we can look at it before the deadline and note the result in the pitch, but cannot plan around it.

**Why it is good design (to borrow).** Owner-signed policy; server never holds the key; idempotency written before send; cancel window; late-week guard; self-excluded founder; terms acceptance; explicit beta notice.

**Where it is thin.** One payment per week to three people; prize $10; a demo API endpoint; the agent policy has no timelock; payouts depend on the Render-hosted server; the top 3 is computed by the same operator's database (no sealed list, no public commit of the winners before payout).

## A7. Pool escrow v4 (V code and chain, `contract/src/lib.rs`)

- **On chain:** `near_saboteur_contract.testnet`, version 4.0.0, created 2026-07-05 (nearblocks v3 `created`), **2 full-access keys** (not locked). nearblocks v3 lists 445 transactions for the account at read time (338 succeeded, 107 failed; the list includes inbound calls and failed attempts, so read it as indicative) [counts are nearblocks list sizes, not a verified activity metric].
- **Design:** host funds a prize or players pay entry fees; the **oracle account** (the backend) reports match points; after 1 to 5 matches the top 3 by total points are paid by the contract. Paid mode: the pot minus a **5 % platform fee** goes to the top 3 (V code: `PLATFORM_FEE_BPS = 500`; the source header says 5 % of every paid-out pool goes to the platform owner). A platform fee on prize pools is a legal-exposure point for them, not for us.
- **v4 changes (C README, consistent with code size and tests):** ties supported (basis-points split), failed transfers can be **claimed back** (private callback records unpaid amounts), "no funds get stuck", 28 unit tests, a testnet end-to-end run (their claim 22 of 22 checks is C).
- **Trust model:** the oracle decides who wins. The contract enforces **payout arithmetic**, not **who won**. A judge asking "who stops the oracle from lying?" gets no answer in the repo (Inferred). FTF's season-commit is the opposite model (the schedule is committed before play).
- **CI:** a manual GitHub Action builds with a pinned Rust (1.93.0), runs `cargo test`, then deploys to the chosen network. Good hygiene (V); the workflow comments say it was made to be run from a phone.

## A8. Token v2 `$SABOTEUR` (V, `token-v2/src/lib.rs`, chain `sabo.saboteur.testnet`)

**Standard and supply.** NEP-141 / NEP-148, 18 decimals, near-sdk 5.26.1. Max supply 1,000,000,000; **ritual pool 50,000,000**; migration cap 2,000,000 (v1 balances migrated; 36,573.01 migrated so far). Rules held in the contract, changeable only through `propose_rules` with a **7-day public timelock** (`RULES_TIMELOCK_NS`) and **hard bounds** checked in `validate()` (a share cannot exceed 100 %; match reward at most 10,000 tokens; multiplier 1 to 3; Play Pass price 1 to 1,000,000; weekly base budget at most 10,000,000; referral reward at most 10,000; catch burn at most 10,000).

**Launch rules (V `Rules::launch()`).**

| Rule | Value |
|---|---|
| Rank rewards 1st / 2nd / 3rd | 1,000 / 600 / 400 |
| Everyone else who finished | 100 |
| Share by real players in the match | 4 or more: 100 %; 2 to 3: 10 %; 1: 1 % |
| First N matches a day paid in full | 5; after that 25 % |
| Play Pass multiplier | 2 |
| **Catch burn** (saboteur caught) | 1,000 burned from the ritual pool (times the tier) |
| **Play Pass price** (burned from the buyer) | 15,000 |
| Weekly mint budget | base 150,000 + last week's burns x 50 % (`burn_to_budget_bps` 5,000) |
| Referral reward | 1,000 per finished referral |

**Mechanics that make it a "memecoin with mechanics".** The game server only **reports a match** (account ids and ranks); the contract computes every reward, applies tier and daily rules, dedupes by **match id**, burns on a catch, and caps issuance by a weekly budget that **grows with burns**. `reserve` and `ritual_pool` are tracked separately from the genesis supply held by the contract.

**Access model (V).** `get_config`: owner `treasury.saboteur.testnet`, game `rewards.saboteur.testnet`. The **contract account has 0 access keys** (DeleteKey tx `BKngCdhS…775i`, 2026-11-12 11:43:08 UTC), so the code cannot change; rule changes follow the timelock; the game account can only report matches.

**Limits and honest gaps (V).**
- `ft_transfer` is **not blocked by the contract**; "players cannot transfer" in `economy/rules.js` (`playerTransfers: false`) holds only because the **custodial game wallets** do not expose a transfer feature. An external wallet holder could transfer. The README says "Tokens only arrive as match rewards" (C).
- The page `/token` says "live from the contract", but the numbers come through the backend (`/saboteur/live`), so a judge trusts the server's reading unless they check the contract themselves (Inferred; the data themselves matched my direct RPC reads).
- Real activity is small: burned 130, caught 5, matches rewarded 11, Play Passes by burn 0 (V `get_stats`). nearblocks v3 lists 32 transactions on the token account (26 succeeded, 6 failed, which includes the staged "Try to cheat" calls) [list size at read time].
- The repo's `token/index.html` has DEMO fallback data that is **not** the live numbers (V); do not quote repo demo numbers as live.
- `simulate.py` models issuance versus burns (C: I did not run it).

## A9. The "Try to cheat" page and the Wall of Shame (V)

**Format.** On `/token`, a section "Proof: Try to cheat $SABOTEUR" shows four cards, each with a verb ("BLOCKED"), the attack in plain words, the exact contract error, and a "Failed tx on explorer" link. The intro says "Real attempts on NEAR testnet. The contract refused every one, and the error names the rule."

I re-fetched all four with `EXPERIMENTAL_tx_status` (testnet, final):

| Card | Method on `sabo.saboteur.testnet` | Signer (V) | Panic text (V) | Tx hash |
|---|---|---|---|---|
| Pay a match twice | `reward_match` (match id `e2e-dup-m2`) | `rewards.saboteur.testnet` (the game account, legitimately allowed to report; the duplicate id is refused) | `Smart contract panicked: Already recorded` | `DgHkB93F8cu77qgfnAH6kDLw1Yyiiy61p4d4vYjDiyd8` |
| Fake a match report | `reward_match` (match id `cheat-1794473659431`) | `saboteur.testnet` (not the game account) | `Smart contract panicked: Only the game account can report matches` | `D5y5Kh8CRUzb3BReei7pUKUBZKEXagqY2XDmvnfKDpoL` |
| Rewrite the rules | `propose_rules` | `rewards.saboteur.testnet` (game, not owner) | `Smart contract panicked: Only the owner` | `97Pp28rUe4v9AoE51LgqwFVh8vW8CfqZknxinGRhnMJh` |
| Play Pass for free | `buy_play_pass` | `p-e2etest01.saboteur.testnet` (a test player) | `Smart contract panicked: Not enough $SABOTEUR for Play Pass` | `CqGYgWg9z3TukWhYxZxmtrDUbN4hj27JmYPDg4ztoZMw` |

Why it works: a judge sees **negative proof** (the chain refused) with the exact rule name, and it costs the team four transactions. Why it is limited: the attempts come from the team's own accounts, and the signer of the "fake report" is simply a different account; there is no adversarial third party and no value at stake.

**Wall of Shame (V).** `/saboteur/wall` lists caught saboteurs from the token's burn events. At read time it contained only bots. Pitch value is high, real data is thin.

## A10. Judge walkthrough format and README structure (V)

README order: title and one-sentence pitch; tracks; five links (play, demo video with timestamps, how-to-play, token page, backend); **Try it in 5 minutes (for judges)** with "You'll see" lines; **Track hints → how we use them** (a four-row table); **What uses NEAR** (feature, how it works, network - with the network column honest: testnet vs mainnet vs NEAR AI Cloud); **Vision** and a **Roadmap** with "Now / Next" blocks; **Code map (where to look)**; **Stack**; **Run locally**; **Hackathon diff (what to judge)** with the two compare links; **Prior work (disclosure)** split "before" and "during"; **Libraries and AI tools (disclosure)**; **License**; **Team**.

What they got right for a machine reader (Q-017 screening): every judge step names an expected observation; a network column; a diff table; a disclosure list. The demo post text carries one timestamp line ("0:00 What NEAR Saboteur is"); the 5:24 video is long against the organizers' guidance to "show one complete moment" (C: HACKATHON.md demo-post advice; I did not watch the video).

## A11. Growth and community features

- **Referrals (V code):** invite link `?ref=<username>`; the friend must finish **3 matches** with at least **2 real humans** in the room; the inviter then gets **1,000 `$SABOTEUR`** (testnet) + **30 ranking points**, but only the first **5 friends per week** add ranking points (the token is paid regardless of the cap, V: `economy.payReferral` is called either way). Anti-farm: `referralRewardedAt` is claimed with an atomic `updateOne` so a reward unlocks once; a self-referral check; bots do not count as humans. Gaps: no device or IP check seen in this code; one person can still create several email accounts [VERIFY].
- **Watch Live (V):** silent spectator for public Free and Pool rooms; never for Paid rooms; an admin toggle. **Disabled on the live backend** when I looked, so a judge following the README to "Watch Live" would find it off.
- **Telegram (V code, C behaviour):** one self-updating card per public room (lobby → live → result) with a game-art banner, buttons are plain links, every card has "Join the group", commands `/play /rooms /live /ranks /help /subscribe`, weekly-prize announcements. Posting is off unless `TELEGRAM_PAUSED=0` is set in the host environment; I cannot see that setting.
- **Inbox and News** posts (V code) used for payout and referral notices.

## A12. Legal and risk wording (V, README and rules)

- Token: "Testnet tokens only, no cash value and no promise about the future" (V comment in `economy/rules.js` and README roadmap).
- Vision: "No pay-to-win, legal first: money buys looks and prizes, never an edge, and real-money features grow only as the law allows."
- Agent: the code carries a risk notice string and a terms-acceptance gate (V).
- Weak points: real-NEAR pools and paid games with a 5 % platform fee, a Play Pass sold for mainnet NEAR and "custom characters" for NEAR are real-money flows; the README does not show a jurisdiction or legal review statement [VERIFY]. A cautious judge may read the combination "paid games + prizes + token rewards" as gambling-adjacent. FTF's no-purchase testnet framing is safer; keep it.

## A13. On-chain verification table (what I checked, with the result)

| Claim | Result | Label |
|---|---|---|
| "Token contract has 0 access keys" | 0 keys; DeleteKey tx `BKngCdhS…775i`, signer = receiver = `sabo.saboteur.testnet`, success, 2026-11-12 11:43:08 UTC | **V** |
| "Rules live in the contract with a 7-day timelock" | `get_rules` returns rules, `pending: null`, `timelock_days: 7`; code `RULES_TIMELOCK_NS` | **V** |
| "Catch = burn" | `get_stats` burned 130 over 5 catches (per-catch burn scales with the real-player tier, so 130 is plausible; I did not re-derive it); code burns `catch_burn` from the ritual pool | V (stats, code); arithmetic [VERIFY] |
| "Pool contract v4" | `version` 4.0.0 on chain; 2 full-access keys | **V** |
| "Pool contract locked" | Not claimed; not true | V |
| "Weekly agent pays real NEAR on mainnet" | policy stored on chain (owner call to `outlayer.near`, 2026-11-10 07:08 UTC); **no payout yet** (`lastWeek` null; first reset Fri 13 Nov 20:30 Kyiv) | policy **V**, payout **C** |
| "`saboteur.near` is the owner" | EOA, 1 full-access key, about 0.49 NEAR, 28 txns, created 2026-10-04 | **V** |
| "Play Pass paid in mainnet NEAR" | Inbound transfers of 1 to 5 NEAR to `saboteur.near` observed; refunds/outflows to `.tg` accounts of unknown purpose | V transfers; purpose [VERIFY] |
| "Bots have their own NEAR accounts" | `bot-<name>.saboteur.testnet`, 13 accounts | **V** |
| "22 of 22 testnet e2e checks" | Not checked (test accounts like `p-e2etest01` exist) | **C** |
| "Players can't transfer $SABOTEUR" | Contract does **not** block `ft_transfer`; only the custodial wallets do | V (contradiction) |
| Transaction counts (nearblocks v3 list sizes at read time) | pool 445 (338 ok / 107 failed), token 32 (26 ok / 6 failed), mainnet `saboteur.near` 28 | list sizes; V as sizes only |

## A14. Real usage at read time (V live JSON)

11 rewarded matches; 5 catches; 600.75 tokens minted by play; 10 players on the weekly board with a top score of 233 (the founder at rank 2, tagged DEV); Wall of Shame only bots; Play Pass by burn: 0; weekly prize $10; no payout yet. X: 14 followers, 204 impressions on the demo post. This is a **very small live footprint**; their strength is clarity, not volume.

## A15. Scores (same method as `FTF-Competitor-Scorecard.md`)

Method: five criteria 0 to 10; caps Technical 8.2, Design 7.5, Impact 8.5, Sustainability 7.5; mean; track-adjusted = 0.75 x mean + 0.25 x track-fit x 10; Technical docked where more than 40 % of commits predate 1 Nov; threat High if within 0.15 of FTF's adjusted or above, Medium within 1.0, else Low. FTF reference: T 8, D 7, I 5.5, O 8, S 5, mean 6.7, fit Games 0.65, NFTs 0.55, adjusted Games 6.65, NFTs 6.40.

| Criterion | Score | Reasoning (V unless marked) |
|---|---|---|
| Technical | **7.0** (7.6 before the pre-existing-code dock of 0.6) | Real stack: two Rust contracts with 48 tests, an Intents agent with idempotency and a cancel window, NEAR AI with budget and fallback, CI deploy gate, locked token. Minus: two 14k to 25k line files, one JS test file, no FE tests, `latest` dependency pins, trusted oracle, `ft_transfer` open, pool keys live, agent has not paid. |
| Design | **7.0** (Inferred, +/-1) | Game UI not rendered by me. Evidence of polish: how-to-play page with screenshots, game-art Telegram cards, HUD kit, station map v2, music, token page layout. |
| Impact | **6.0** | A product that has existed since June with mainnet touchpoints, but 11 rewarded matches, 10 weekly players, 14 followers, 204 impressions; a payout not yet made. |
| Originality | **6.5** | "Catch = burn" and a budget growing with burns is a clean mechanic; the base is an Among Us clone and bots-fill-lobbies is common. |
| Sustainability | **6.5** | A live product with roadmap, legal-first wording, owner-signed policy and timelock; offset by Render dependence, operator custody of wallets and a thin economy. |
| **Mean** | **6.6** | (7.0 + 7.0 + 6.0 + 6.5 + 6.5) / 5 |

| Track | Fit (0-1) | Why | Adjusted |
|---|---|---|---|
| Games | **0.50** | Strong "players never notice the chain" and email login; bots with accounts. Missing: merchant NPCs, player-owned markets, NEP-245 items, evolving prices, fast-forward mode, the game's economy is **rewards around** a social game. | **6.20** |
| Memecoins (not an FTF track) | 0.80 | Mechanic is in the contract, timelock, locked. Small usage. | 6.95 |
| Agent Economy (not an FTF track) | 0.50 | An agent that pays under a policy, but it does not earn, negotiate, hire or pay for APIs. | 6.20 |
| NFTs (FTF track) | 0.15 | Legion SBT badge and custom characters only. | 5.33 |

Placement against the scorecard's 54 scored Games entries (FTF excluded): Saboteur at 6.20 would rank about **19th**, FTF (6.65) is 8th. Threat to FTF: **Medium** on Games (gap 0.45), Low on NFTs. Without the dock (Technical 7.6, mean 6.7) the adjusted Games score would be 6.28 (about 15th), still Medium. These are my estimates; Design carries +/-1; the main uncertainty is a possible large Impact bump if the weekly agent pays on Fri 13 Nov and the founder posts a clean payout proof.

## A16. Strengths, weaknesses, judge-risk items

**Strengths to learn from.**
1. A **judge table with "You'll see" lines** that maps one-to-one to evidence. 
2. **Contract-enforced rules**: the game only reports; the contract computes; hard bounds; 7-day timelock; **0 access keys** on the token.
3. **Negative proof**: four real failed transactions with exact panic texts, linked from the page.
4. **Owner-signed agent policy**, server never holds the owner key, **idempotency saved before send**, **30-minute cancellable queue**, late-week guard, founder excluded.
5. **Honest disclosure** of prior work and AI coding, with tags and compare links; a network column; a risk notice.
6. **Growth plumbing**: Telegram room cards, referrals with weekly cap, Watch Live, Inbox/News.
7. **Bots with their own wallets** and a daily USD budget for the model with a rule-based fallback.
8. Documentation and tests on the contracts (48 Rust tests) and a deploy gate that runs them.

**Weaknesses.**
1. Not a market or merchant economy; the Games prompt's central asks (merchant NPCs with wallets, player-owned markets, NEP-245, fast-forward, readable pricing file with tooltips) are absent.
2. Custodial wallet: server-funded, operator-stored (client-encrypted) keystore; "gasless" = the server pays.
3. Single points of trust: the oracle reports winners (pool) and matches (token); the weekly top 3 comes from a private database.
4. Tiny real activity; staged adversarial proof; pages claiming "live from the contract" read through the backend.
5. Giant single files; unpinned dependencies; frontend has no tests.
6. Real-money surfaces (paid games with platform fee, Play Pass in mainnet NEAR) bring legal exposure.
7. Features advertised in the README may be off live (Watch Live disabled; Telegram gated by an environment switch).

**Judge-risk items (ones a judge or the Claude/Codex screener can use against them).**
- Pre-existing codebase: first commit 27 Jun; 77.6 % and 84.1 % of commits predate 1 Nov. Mitigated by tags and a clean diff, but Q-004 says "old project as-is: no".
- Three tracks for one product: spread claims; the Agent Economy fit is partial.
- Weekly agent has not paid by our freeze; mainnet value flow so far is inflows (Play Pass) and a policy store.
- Pool contract keys live; a "contract refuses cheating" story sits next to a contract whose owner can redeploy.
- `ft_transfer` open despite the "can't transfer" rule text.
- Trusted reporter for token and pool.
- Cold starts on Render at first contact.
- A demo Agent API URL and a beta risk notice in the code path that moves mainnet money.
- Tiny usage (11 matches, 5 catches).

## A17. Not verified (so nobody quotes it)

The main game's look and feel; whether the bot chat is labelled as model-generated in the UI; the content of the 5:24 video; the encrypted policy's numbers; the agent wallet balance; Telegram behaviour; Play Pass refund flow and its outflows to `.tg` accounts; nearblocks tx counts as true activity totals; whether `saboteur.near` or the Intents partner API is rate-limited; the live status of Render at 14 Nov; whether they appear in the hackathon catalog.

---

# PART B. SIDE-BY-SIDE: SABOTEUR vs FTF

## B0. What "FTF today" means here

Read from a fresh `origin/main` of `SpacexCeo/forget-to-foresee`, commit `6ddd312e` (merge of PR #130, 12 Nov 2026 18:29 Kyiv), files read through `git show`, plus our documents `FTF-Competitive-TZ.md`, `FTF-City-Economy.md`, `FTF-Story-Quests-Leaderboard-TZ.md`, `FTF-Competitor-Scorecard.md`. Test counts are from `docs/STATS.md` (generated at `19f5ca0`): game 824, server 31, relayer 28; Rust: season-commit 56, memory-shard 21, agent-card 21, guests 9, character-nft 9, token-account 2, agent-ledger 12, loot-chest 12 (142 Rust in that table, `contracts/town` has more, see below). Production build `game/dist` 414 MB.

**Currency: resolved (owner, final, 12 Nov).** **One currency: silk.** It is the town's only fungible resource (`docs/town-economy.md` on main, `ftf-town.testnet`): trades, tournament entry and payouts, pledges to the four town works, deed NFTs, leaderboard points, the Season 3 distribution and the portal are all silk; there is no second token and no pool. The portal is **paid on chain**: `pay_gate` on `ftf-town` burns the gate price (recommended **200 silk**, lowered from the owner's first 10,000; CE §2.13), and the relayer reads `gate_paid_of` for the whitelist pass. `FTF-City-Economy.md` (rev 4) and `FTF-Story-Quests-Leaderboard-TZ.md` (rev 4) are aligned. Two rules matter for Part C: story credits reach `ftf-town` only through the relayer's replay-verified `credit_silk` within `story_day_cap` and the per-account caps (CE §2.13.4), and a coordinator-driven loop (as in Saboteur's single hot key) must never credit beyond them.

## B1. Feature-by-feature table

Priority is the priority of closing (or defending) the row against the freeze Fri 13 Nov 16:00 Kyiv. "C#" points to the item in Part C. "Adv" = we are ahead; keep it visible.

| # | Capability | Saboteur has (label) | FTF has (main `6ddd312e` + docs) | Gap / who leads | Priority and item |
|---|---|---|---|---|---|
| 1 | One-click judge path | README "5 minutes" with "You'll see"; guest play vs bots (V) | `?demo=judge` link opens straight in the town; "Judge in 5 minutes" table with Do / See in `docs/status.md`; README has "Verify in 60 seconds" | README top no longer carries the Do/See table (moved to status.md on 11 Nov); Move 4 page planned. **Slight gap in presentation, FTF ahead in depth** | **P0** C1 |
| 2 | No wallet, no gas in the loop | Email login + server-made `<name>.<oracle>` wallet, server pays (V) | Day 1 guest: browser-made key becomes the full-access key of a relayer-funded guest sub-account owning the Elise NFT (`POST /api/create-guest`, `contracts/guests`, `contracts/character-nft`, `contracts/token-account`) | They have email/password identity, we have none (README: "Wallet sign-in … not built"). Both are server-funded | **P1 slice, P2 full** C4 |
| 3 | Social / email login | Email + OTP (Resend) + bcrypt (V); HOT/Meteor/Intear wallets (V) | None (audit: "no social login") | **Gap; Games hint** | P1 slice / P2 full, C4 |
| 4 | NPCs with wallets | 13 bot accounts `bot-<name>.saboteur.testnet`, they only **earn** tokens (V) | 20 trader accounts + 6 clan accounts specified under `ftf-town.testnet`; NPC economy spec for ~20,000 tx/day; **contract and accounts not deployed** (README) | We are ahead on design and tests (43 unit tests in `contracts/town/src/tests.rs`), **behind on live fact until deployed** | **P0** (Move 2, owner-gated) |
| 5 | Merchant economy, evolving prices | None (V grep) | `relayer/market/prices.js`: one readable price file (stock, demand moving average, price band half to twice base, **bankrupt stalls close and reopen when an investor's pledge arrives**), reasons as tooltips; `relayer/lib/town-traders.js`; `tools/town/sim.mjs` | **Adv: this is the Games prompt, nearly verbatim.** Not live until `ftf-town` deploys | P0 (Move 2) + D1 |
| 6 | NEP-245 items | None | None (NEP-171 shards, skins, chests) | Both lack; Games hint | P2 (see D6) |
| 7 | Rules readable in one file | `economy/rules.js` ("the ONE readable place for every number") (V) | `relayer/market/prices.js`, `contracts/town/src/rules.rs` ↔ `game/src/game/town-rules.js` with shared vectors (`contracts/town/tests/vectors.json`) | **Adv** (the same numbers tested on both sides) | keep |
| 8 | Contract-enforced rules | Token computes every reward, dedupe by match id, hard bounds (V) | `ftf-town` silk conservation, caps, rate ceiling, season mint ceiling, negative wash-trading EV tests (README); `season-commit` verifies Merkle proofs on chain | Comparable; ours not deployed (town) | P0 (deploy gated) |
| 9 | Timelock on rule changes | 7-day public timelock + hard bounds (V) | `contracts/town` `set_params` is owner-only and **immediate** (`lib.rs` line 399) | **Gap** | **P1** C6 |
| 10 | Locked contract (0 keys) | Token only, since 12 Nov 11:43 UTC; pool has 2 keys (V) | Testnet keys live ("Nothing was deleted", `docs/near.md`); mainnet runbook `docs/mainnet-pass-runbook.md` has a delete-keys step (OWNER) | **Gap, but irreversible → owner** | P1 plan, P2 act, C7 |
| 11 | Negative proof (failed tx) | 4 staged failed txs with panic names (V) | `docs/near.md` shows a read-only `check_leaf` returning `ERR_ROOT_MISMATCH` for a changed salt; unit tests; no page of real failed txs | **Gap in presentation** | **P1** C2 |
| 12 | Standalone verifier for off-chain claims | None | `tools/verify/verify.mjs|py`, `tools/verify-tee`, `tools/verify-chest`, `replay-season.mjs` | **Adv (unique)** | feature it, C1/C3 |
| 13 | Live chain page | `/token` (backend-fed) (V) | `game/public/pulse.html` (reads `pulse()` from `ftf-town`; says "not deployed yet" until then); planned Move 5 stats page | **Gap until deployed; ours would read the chain directly** | **P1** C3 |
| 14 | Payout agent (NEAR Intents) | Policy stored; **no payout yet**; $10 weekly (V) | None; Story TZ §9 Season 3 is roadmap (docs only) | **Gap; mainnet = owner/legal** | P1 dry-run, P2 mainnet, C5 |
| 15 | Weekly leaderboard with prize | Weekly Ranks, DEV excluded (V) | Weekly tournament card is a labelled **UI simulation**; Story TZ §8 specifies a leaderboard "formed by the Shell" | **Gap in product, ahead in spec** | P1 (Story stream) + C5 |
| 16 | Referrals with caps | `REFERRAL` {3 matches, 2 humans, 1,000 tokens, 30 pts, 5 per week} (V) | None | Gap, low value for a judge | **P2** C8 |
| 17 | Spectator / Watch Live | Built, **disabled live** (V) | Replay view (`game/src/ui/replay-view.js`), agent HTTP API with time-scaled sessions, shared town via `presence/` (dormant: hosted game not pointed at it), `?bots=N` walkers | Different shape; our "watch" should be the **economy** | **P2** C9 |
| 18 | Telegram / X bot | Telegram room cards (code present, gated) (V) | None | Gap; audience play for the owner | **P2** C10 |
| 19 | AI NPCs, honestly labelled | NEAR AI bots in meetings, USD/day budget, rule fallback; UI label not verified (V/C) | Decision 12.11: clans choose strategy params through NEAR AI Cloud inside the TEE path, rules engine executes, every decision journalled with prompt hash and attestation id, labelled "LLM-chosen" vs "scripted"; `relayer/lib/clan-strategy.js`, `tee*.js`, `tools/verify-tee` ; today the endpoint answers 402 so decisions are scripted | **Adv (attestation and journal), but must not claim an LLM that is not running** | **P1** C11 |
| 20 | Tests and CI | 28 + 20 Rust, 8 JS in 1 file, no FE tests, deploy workflow (V) | 824 + 31 + 28 JS, 142 Rust (table) + town, `.github/workflows/contracts.yml`, `pages.yml`, `scripts/verify-all.sh` | **Adv** | keep; fix `verify-all.sh` first-command risk (Move 7) |
| 21 | Build window position | 77.6 % / 84.1 % of commits before 1 Nov; clean tags and diff (V) | 1,629 commits, all 7 to 12 Nov; `pre-hackathon` tag = empty root; `hackathon-submission` pending (owner) | **Adv; must be shown** | **P0** C12 |
| 22 | Disclosure of AI use | Yes (V) | Yes ("Baseline, third-party code and AI disclosure" in README) | Parity | keep |
| 23 | Legal wording | Testnet tokens, "legal first", but real-NEAR paid modes and 5 % fee (V) | Free, no purchase, testnet, "silk has no value outside the game" | **Adv (safer)** | C12 |
| 24 | Mainnet presence | Play Pass inflows, owner policy, token on testnet (V) | None; whitelist pass contract + relayer claim route + runbook exist (`contracts/whitelist-pass`, `relayer/lib/pass-service.js`, `docs/mainnet-pass-runbook.md`) | **Gap by choice**; the finale item is the differentiator | P2 owner decision, D4 |
| 25 | Hosting resilience | Render cold start up to about a minute (V) | Static GitHub Pages build, **414 MB** `dist`, desktop WebGL 2 only | Both have a first-contact risk; ours is load size, theirs is wake-up | P1 (Move 4 page shows progress; no code here) |
| 26 | Demo post and video | 5:24 video, 204 impressions, 14 followers (V) | Owner posts; Move 9 script ≤ 90 s | Reach is the owner's advantage | P1 Move 9 |
| 27 | Season sealed before play, verifiable | None | `season-commit`, Merkle proofs, 15 of 15 reveals, standalone verifier | **Adv (unique)** | D3 |
| 28 | Mobile reach | Telegram Mini App origin; mobile layout (C) | Desktop WebGL 2 only (README); `docs/mobile.md` exists | Gap, not closable by freeze | out of scope |

**Reading the table.** Closable before the freeze at low risk: rows 1, 11, 13 (page), 21, 23, 19 (labels), 9 (contract change, only if the CE cut line holds). Needs owner action: 4, 5 (go-live), 10, 14, 24. Skip: 6, 16, 18, 28 unless everything else is green.

---

# PART C. TZ PER ITEM (adopt or beat)

## C0. Index, order and shared preamble

| Item | What | Criterion moved | Label | Priority | Est. (agent hours) |
|---|---|---|---|---|---|
| C12 | Window disclosure + legal wording block ("clean baseline") | Technical credibility, Sustainability, risk | SAFE | **P0** | 3 |
| C1 | Judge "Do X, See Y" block and the 90-second page (extends CM4) | Technical, Design, screener score | SAFE / CONDITIONAL | **P0** | 6 |
| C11 | Honest AI labels (clans' LLM layer, scripted NPCs) | Technical credibility, Originality | SAFE | **P1** | 4 |
| C2 | "Try to cheat FTF": real rejected transactions | Technical, Originality | SAFE to prepare / OWNER-GATED to run | **P1** | 6 |
| C3 | Live economy page read straight from chain (extends CM5b and Town Pulse) | Impact, Technical | SAFE | **P1** | 6 |
| C6 | 7-day (demo-length) timelock on rule changes | Technical, Sustainability | CONDITIONAL | **P1** | 8 |
| C7 | Locked contracts plan and script | Sustainability, Technical | SAFE (plan) / OWNER-GATED (act) | P1 plan, P2 act | 3 |
| C5 | Leaderboard rewards agent via NEAR Intents: caps, idempotency, 30-min cancel window | Impact, Sustainability, Agent track hints | SAFE dry-run / OWNER-GATED mainnet | P1 dry-run, P2 mainnet | 12 |
| C4 | Email / social login with auto wallet, gasless | Games hint "social login" | CONDITIONAL | P1 slice (labels + design), P2 build | 2 + 20 |
| C10 | Telegram / X bot for the owner's audience | Impact | SAFE (drafts) / OWNER-GATED (run) | P2 | 6 |
| C9 | Spectator mode for the town economy | Impact, Design | SAFE | P2 | 8 |
| C8 | Referrals with caps | Impact (weak) | CONDITIONAL | P2 | 8 |

**Order.** Start C12, C1, C11 immediately (docs and static pages, no dependencies). C2 and C3 follow as soon as the chain targets exist (existing contracts for C2's slice A; `ftf-town` deployment for slice B and for C3's economy numbers). C6 only if the `contracts/town` cut line holds (Fri 13 Nov 14:00 Kyiv per the City Economy plan); otherwise it becomes a documented roadmap row. Do not start C4 build, C8, C9, C10 before C12, C1, C11, C2, C3 are merged and green.

**Shared preamble (paste first into every agent session).**
```
You are an Opus build agent on Forget to Foresee (FTF), repo SpacexCeo/forget-to-foresee, NEAR HACKATHON. Freeze: Fri 13 Nov 16:00 Europe/Kyiv. Deadline: Sun 15 Nov 01:59 Europe/Kyiv. Work on your own branch; never push, merge, deploy, fund, sign, delete keys, post or submit anything. Any code that can send a transaction, money, a message or a post defaults to DRY-RUN and refuses to send without an explicit owner flag plus an owner-provided key file path that is never committed. No keys, tokens or secrets in the repo, logs or output. Mark unknowns [VERIFY]; owner-gated steps are OWNER-GATED: prepare and stop. Never invent counts, prices, hashes or dates: every number comes from docs/STATS.md, a command output pasted beside the claim, or an RPC call shown next to it. Lore canon: Iris is a doctor-linguist from another planet, year 2048; clans, citizens and quest givers are scripted (the five clans get a labelled LLM strategy layer, see docs/decisions.md 12.11). Legal framing: free, no purchase, no promised value, testnet, real-value distribution only after legal and security review, no investment or securities language. A competitor (NEAR Saboteur) is studied in docs/competitors/ (or FTF-Saboteur-Teardown-TZ.md): reimplement ideas, never copy its code, text or assets. Read AGENTS.md and CLAUDE.md first. English only for deliverables. Finish with: files changed, tests run (exact commands and results), what you did NOT do, and open [VERIFY] items.
```

**Currency note for all items.** Where an item touches the town currency, it is **silk** (resolved, B0). New strings may say "silk"; keep the label in one config constant only if it is cheap, not as a hedge. Player-facing words: pledge, reward share, rate (variable, can be zero), town works; never invest, APY, profit, dividend, returns.

---

## C12. Window disclosure and legal wording block · P0 · SAFE · 3 agent hours

**Goal.** Turn FTF's cleanest-in-the-field Q-004 position into visible evidence, and match Saboteur's honest "Prior work / Libraries and AI tools" pattern with stronger facts. **Criteria:** Technical credibility, Sustainability; neutralises the Q-004 argument that Saboteur must defend.

**Facts to put in (each with its command):** `git rev-list --count origin/main` and the date range of commits; `git log --before=2026-11-01 --oneline | wc -l` (0 at `6ddd312e`); the tag `pre-hackathon` points to the empty root commit; the compare link `compare/pre-hackathon...hackathon-submission` becomes live only when the owner pushes the `hackathon-submission` tag (OWNER-GATED). Third-party material: CMU motion-capture clips (review build), music by Scott Buckley and Kevin MacLeod (CC-BY 4.0) per `docs/art/manifest.md`. AI use: already disclosed in README.

**Steps.**
1. Extend (do not rewrite) README section "Baseline, third-party code and AI disclosure": add a table "Before the window / Inside the window" with the exact commands above and their outputs, generated by a new script, not typed.
2. Add `scripts/window-facts.mjs` that prints the numbers (commit count, first and last commit dates, commits before 1 Nov and before 19 Oct, diff stat between `pre-hackathon` and `HEAD`) and writes `docs/window.md`. Read-only on git.
3. State both readings of the window in one sentence: "organizers' Q-001 counts from 19 Oct; the hackathon facts table says 1 Nov; FTF's first commit is 7 Nov, so both readings give the same answer".
4. Legal block (3 lines, near "Money" row): free, no purchase, no promised value, testnet, silk (or the owner's currency) has no value outside the game, any later real-value distribution only after legal and security review. Do not add the words "invest", "returns", "yield", "token sale".
5. Cross-check: `docs/status.md`, README, `docs/hackathon-rules.md` use the same window sentence (grep test).

**Files.** `README.md` (one section), `docs/window.md` (new, generated), `scripts/window-facts.mjs` (new), `docs/hackathon-rules.md` (one line, [VERIFY] it exists in the same form). **Interfaces.** `node scripts/window-facts.mjs [--write]` prints a table; exit 1 if `git` is not available.
**Tests.** `node --test tools/window/tests/*.test.mjs` with a fixture repo created in a temp dir (3 commits, a tag) → expected counts; a grep test that no forbidden words appear in README/docs/window.md.
**Acceptance.** A judge can run one command and see 0 commits before 1 Nov; README shows the same numbers as the script (checked by test); no new unverified claim; forbidden-words test passes.
**Risks / DO-NOT.** Do not claim the `hackathon-submission` tag exists before the owner pushes it; do not say "all work built in the window" unless the script output supports it for the shown range; do not alter history; do not mention Saboteur in README.
**Label.** SAFE (owner creates and pushes the tag).

**Prompt (C12).**
```
Item C12. Own scripts/window-facts.mjs, tools/window/, docs/window.md and the README section "Baseline, third-party code and AI disclosure" (extend only). Print, from git alone, the commit count, first/last commit date, commits before 2026-11-01 and before 2026-10-19, and the diff stat of pre-hackathon..HEAD; write docs/window.md from it; show both readings of the window (Q-001 starts 19 Oct, facts table starts 1 Nov) in one sentence. Add a 3-line legal block (free, no purchase, no promised value, testnet, no value outside the game, real-value distribution only after legal and security review). Tests: fixture repo in a temp dir; forbidden-word test (invest, returns, yield, token sale). Do not claim the hackathon-submission tag before the owner pushes it. Report files, test commands and results.
```

---

## C1. Judge "Do X, See Y" block and the 90-second page · P0 · SAFE (README), CONDITIONAL (page) · 6 agent hours

**Goal.** Match Saboteur's best habit (every judge step ends with an observable) and beat it: ours ends with a **machine-checkable** observable. Extends Competitive-TZ Move 4 (`game/public/judge/`); do not duplicate its page, add the deltas below. **Criteria:** Technical, Design (first contact), screener result (Q-017: Claude Code and Codex read the README first).

**Deltas to Move 4 / README.**
1. **README top block "Try it in 5 minutes"** (the Do/See table now lives in `docs/status.md` since 11 Nov; put a 5-row version back at the top of the README, linking to the long one). Each row: **Do** (one command or click), **You'll see** (exact text or exit code), **How to check it yourself** (a command).
   1. Open the judge link → town opens with no wallet, no gas prompt → see silk 50 → 53 after the first stake (as in `docs/status.md`).
   2. `bash scripts/verify-all.sh --skip-rust` → table, exit 0, counts equal `docs/STATS.md`.
   3. Read the sealed season on chain (the `curl` already in README) → `leaf_count` 15, `revealed_count` 15.
   4. `node tools/verify/verify.mjs proof.json` → every line ✓; change one digit → ✗, exit 1.
   5. Open `game/public/judge/` (when merged) → 15 of 15 table.
2. **A network column** in the "How NEAR is used" section: testnet / mainnet (none) / NEAR AI Cloud / local, per row, as in their README.
3. **A track-hint table** (Games: social login = Day 1 guest account (state exactly what it is), Agent NPCs = clans and traders (scripted, plus the labelled LLM layer), Intents = [none / dry-run only], NEP-245 = not used). Say "not used" where true.
4. **Cold-start line**: the build is 414 MB (STATS) and streams in; say "first load can take [measure] on a normal connection" with a measured number from `docs/qa`, never a guess [VERIFY measurement].
5. **Demo-post pairing**: the X post text (owner posts, Move 9) lists timestamps that match these five rows; the video is ≤ 90 s (organizers: "show one complete moment"). Do not copy Saboteur's 5:24 length.

**Files.** `README.md` (top block + two tables), `docs/judge-path.md` (Move 4), `game/public/judge/index.html` + `judge.js` (Move 4), `tools/judge-check/` (Move 4), `tools/judge-check/tests/readme-steps.test.mjs` (new, below). **Interfaces.** The README block is parsed by the test: each row has the three cells.
**Tests.** (a) The README test extracts each "You'll see" claim that names a number and compares it with `docs/STATS.md` or a fixture command output; (b) every command in the block exists in the repo (path check); (c) the `verify.mjs` flipped-digit example still fails with exit 1; (d) Move 4's own tests.
**Acceptance.** A screener reading only the README can execute all 5 rows without the game window; every number in the block equals generated output.
**Risks / DO-NOT.** Do not add timing claims ("90 seconds") that were not measured on a clean browser; do not claim "no wallet" without the Day 1 caveat (a guest account exists only if the player takes the free mint); do not hide that Intents and NEP-245 are not used.
**Label.** SAFE for README; page is CONDITIONAL per Move 4.

**Prompt (C1).**
```
Item C1 (extends CM4). Own README.md top block "Try it in 5 minutes", the network column and the track-hint table, plus tools/judge-check/tests/readme-steps.test.mjs. Five rows, each: Do / You'll see / How to check it yourself (a command). Rows: judge link opens in town with no wallet; scripts/verify-all.sh --skip-rust prints a table with counts equal to docs/STATS.md; the curl in README returns leaf_count 15 and revealed_count 15; tools/verify/verify.mjs passes and a flipped digit fails with exit 1; game/public/judge/ (only if CM4 is merged). Add a track-hint table that says "not used" for Intents and NEP-245 where true. Test: parse the block, check every command path exists and every number equals generated output. Do not add unmeasured timings. Report files, tests, results.
```

---

## C11. Honest AI labels · P1 · SAFE · 4 agent hours

**Goal.** Saboteur separates AI from rules in README but its UI label is unverified; FTF can make the label **checkable** (journal, prompt hash, attestation id) without ever overstating. Follows owner decision 12.11 (LLM strategy layer for the five clans via NEAR AI Cloud, fallback scripted). **Criteria:** Technical credibility, Originality.

**Steps.**
1. One table in README ("What is AI, what is scripted"): townsfolk and traders = scripted rules, no model; citizens, quest givers and the Guests' language = scripted (per lore canon); five clans = strategy parameters chosen by a model **when the NEAR AI endpoint answers**, otherwise scripted; Iris = the player's guide, not an LLM unless a decision says otherwise **[OWNER CONFIRM]**.
2. A single runtime label function: `labelFor(decision)` → `"LLM-chosen strategy (TEE, attestation <id>)"` or `"Scripted (model unavailable: <reason>)"`; used by the clan decision card, the journal and any export. Never show "AI" for scripted actions.
3. Show today's truth: when the endpoint answers 402 (README: "today NEAR AI answers 402"), all decisions say scripted. A test enforces that no code path labels a scripted decision as LLM.
4. Keep the Saboteur idea of a **daily USD budget**: `relayer/lib/tee.js` budget cap with the fallback path; document the default and where it is set [VERIFY file contents].
5. In the arena (NPC economy), the strings stay "scripted NPC activity, owner-run, testnet, public seeds".

**Files.** `README.md`, `docs/ai-use.md` (new), `relayer/lib/clan-strategy.js` and `relayer/lib/tee.js` (read; touch only to add `labelFor` if missing, [VERIFY]), `game/src/net/tee-agent.js` and `game/src/ui/tee-panel.js` (label use only), tests in `relayer/tests/`. **Interfaces.** `labelFor({ source: 'llm'|'scripted', attestationId?, reason? })` returns a string; `source: 'llm'` requires a non-empty `attestationId`.
**Tests.** `cd relayer && npm test`: (a) llm without attestation id throws; (b) fallback path yields the scripted label with the reason; (c) no string "AI" appears in labels of scripted actions (regex over the label catalog).
**Acceptance.** Every decision card, README row and arena counter caption agrees with `docs/ai-use.md`; with the endpoint down, nothing says LLM.
**Risks / DO-NOT.** Do not claim a model ran if it did not; do not claim "verifiable AI" without an attestation id the verifier tool accepts (`tools/verify-tee`); do not put model output into the sealed schedule (the Guests' language is deterministic, `docs/decisions.md`).
**Label.** SAFE.

**Prompt (C11).**
```
Item C11. Own docs/ai-use.md and the README table "What is AI, what is scripted"; touch relayer/lib/clan-strategy.js, relayer/lib/tee.js and the game's decision card only to route every decision through one labelFor() function. Rules: llm label requires an attestation id; fallback gives "Scripted (model unavailable: <reason>)"; scripted actions never say AI; the arena stays "scripted NPC activity, owner-run, testnet, public seeds". Tests in relayer/tests: llm without attestation id throws; fallback label; regex check that scripted labels contain no "AI". Read docs/decisions.md 12.11 first. No keys, no network in tests. Report files, tests, results, [VERIFY] items.
```

---

## C2. "Try to cheat FTF": real rejected transactions · P1 · SAFE to prepare, OWNER-GATED to run · 6 agent hours

**Goal.** Match Saboteur's negative proof ("the contract refused every one, and the error names the rule") with our own contracts, and beat it by (a) using **third-party-style** callers, (b) adding **read-only refusals** anyone can repeat without a key, (c) pairing each refusal with the unit test that guards it. **Criteria:** Technical, Originality (security story for the NFT track prompt).

**Attack list (all names from real constants in `contracts/*/src/lib.rs`; [VERIFY] the exact method gating in `FTF-Competitive-TZ.md` section 4.2 before use).**

| Card | Contract and call | Expected refusal text (from source) |
|---|---|---|
| Reveal the same sign twice | `ftf-seasons.testnet` `reveal_leaf` for an already revealed index | `ERR_ALREADY_REVEALED: this leaf is already recorded` |
| Change the future after the seal | `check_leaf` view with one salt digit changed (read-only, no key) | `ERR_ROOT_MISMATCH: the proof does not lead to the committed schedule root` (already in `docs/near.md`) |
| Mint a shard you do not own | `ftf-shards.testnet` `mint_shard` from a non-coordinator | `ERR_NOT_COORDINATOR: only an authorized coordinator can mint` |
| Mint the same shard twice | `mint_shard` for an existing token id | `ERR_TOKEN_EXISTS: this shard is already minted` |
| Take a second free guest | `guests` `create_guest` for a key that already has one (through the relayer) | `ERR_EXISTS: this key already has a guest with Elise` |
| Drain the daily free mints | `guests` after the daily cap | `ERR_CAP: today's free mints are used up; try again tomorrow` |
| Claim a whitelist pass twice (when deployed) | `whitelist-pass` `mint_pass` same `claim_id` | `ERR_CLAIM_USED: this claim was already minted` |
| Mint the pass as a stranger (when deployed) | `mint_pass` from a non-minter | `ERR_NOT_MINTER: only the minter can mint` |

**Slice A (existing contracts, P1):** the first four rows. **Slice B (town/pass, after deployment):** pledge cap, credit ceiling, deed rules, pass rows.

**Steps.**
1. `tools/cheat/attacks.json`: the table as data (contract, method, args builder, expected error substring).
2. `tools/cheat/run.mjs`: **dry-run by default** (prints the plan and each unsigned call); `--send` requires `--key-file` pointing outside the repo; uses throw-away testnet accounts created by the owner for this run (never the coordinator key); captures `EXPERIMENTAL_tx_status` for every transaction after finality; fails the run if an attack **succeeds**.
3. `tools/cheat/verify.mjs`: **no key**; takes the recorded hashes from `docs/cheat/results.json`, fetches each transaction by RPC, and asserts the failure text equals the expected substring (so anyone can re-verify).
4. `game/public/cheat/index.html` (static, no third-party scripts, no cookies; same RPC hosts and fallthrough as Move 4): shows each card with the attack in words, the exact panic text, a nearblocks link and the guarding unit test name. Read-only rows run live in the browser.
5. `docs/cheat.md`: how to repeat each row; what these attempts do **not** prove (they come from the team's own throw-away accounts; no external attacker; the contract rules, not the client rules).

**Files.** `tools/cheat/**`, `docs/cheat.md`, `docs/cheat/results.json` (hashes only), `game/public/cheat/**`. **Interfaces.** `results.json`: `[{ id, contract, method, signer, txHash, expectedError, observedError, finalizedAt }]`.
**Tests.** `node --test tools/cheat/tests/*.test.mjs` with recorded RPC fixtures: success of an attack → exit 1; failure text mismatch → exit 1; dry-run prints no network call; `--send` without `--key-file` refuses.
**Acceptance.** Slice A: four failed testnet transactions whose recorded error text equals the source constant; the page shows them; `verify.mjs` passes from a clean clone with no key. Each card names its guarding unit test (grep check).
**Risks / DO-NOT.** Do not use the coordinator, owner or relayer key; do not spam (a handful of transactions); do not describe the attacker as external; do not run on mainnet; do not publish the throw-away keys.
**Label.** SAFE to prepare; running `--send` signs testnet transactions: **OWNER-GATED**.

**Prompt (C2).**
```
Item C2. Own tools/cheat/**, docs/cheat.md, docs/cheat/results.json and game/public/cheat/. Build the "Try to cheat FTF" proof: attacks.json (reveal an already revealed leaf, check_leaf with a changed salt (read-only), mint_shard from a non-coordinator, mint the same shard twice; then guests duplicate and daily cap; pass rows only when deployed), run.mjs (DRY-RUN by default; --send needs --key-file outside the repo and throw-away testnet accounts; capture EXPERIMENTAL_tx_status; exit 1 if any attack succeeds), verify.mjs (no key; re-fetch recorded hashes and assert the panic text), and a static page with live read-only rows. Expected texts come from the ERR_* constants in contracts/*/src/lib.rs; confirm method gating in docs before use ([VERIFY]). Never use coordinator/owner/relayer keys; never mainnet; label the attempts as team-run, not external. Tests with recorded fixtures. Report files, tests, results.
```

---

## C3. Live economy page, read from chain · P1 · SAFE · 6 agent hours

**Goal.** Saboteur's `/token` is "live from the contract" but fed by its backend. Ours reads RPC **in the browser** and shows the call beside every number. Extends CM5b (`game/public/stats/`) and the existing Town Pulse page (`game/public/pulse.html`, reads `pulse()` from `ftf-town`, says "not deployed yet" until then). **Criteria:** Impact, Technical.

**Steps (deltas).**
1. A "Rules in force" panel reading `get_params` (or the nearest view; [VERIFY] name in `contracts/town/src/lib.rs`) with the pending change and its apply time once C6 exists.
2. A "Latest events" list from the contract's NEP-297 events or the indexer already planned (CM5b), each with an explorer link; never from a backend.
3. A "Merchants" panel from `relayer/market` statistics endpoint **only if** it is cross-checked against chain balances on the same page (show both numbers; mismatch → visible warning). Bankrupt stalls and the investors' pledges appear here (feeds D1).
4. A "What this does not show" footer (accounts are not humans; arena activity is scripted, owner-run, public-seed).
5. Mirror their Wall of Shame idea as a **Hall of Pledges** (investors who revived a stall), data from events.

**Files.** `game/public/pulse.html` (extend), `game/public/stats/**` (CM5b), `docs/stats-page.md`. **Interfaces.** Same RPC host list and 6 s fallthrough as Move 4; cache 60 s in `sessionStorage`; "unavailable" with last good read time on failure.
**Tests.** Fixtures: numbers equal fixture; unavailable on failure; mismatch warning when the relayer and chain disagree; no third-party scripts; no cookies.
**Acceptance.** Every number equals the matching `curl` in `docs/stats-page.md`; no number appears when the call fails.
**Risks / DO-NOT.** No hand-typed numbers; no analytics; no polling faster than 60 s per visitor; do not publish arena numbers before Move 2's first stage passes; do not label accounts as players.
**Label.** SAFE (it says "not deployed yet" until `ftf-town` is live: that honesty is a feature).

**Prompt (C3).**
```
Item C3 (extends CM5b and Town Pulse). Own game/public/pulse.html and game/public/stats/** deltas: Rules in force (view call shown), Latest events with explorer links, Merchants (relayer stats cross-checked against chain balances on the same page; mismatch warning), Hall of Pledges, and the footer "what this does not show". Same RPC hosts and 6 s fallthrough as the game; cache 60 s; "unavailable" never a stale number; no third-party scripts, cookies or analytics. Tests with recorded fixtures. Do not edit game/src. Report files, tests, results.
```

---

## C6. Timelock on rule changes · P1 · CONDITIONAL · 8 agent hours

**Goal.** Saboteur's token has `propose_rules` with a 7-day public timelock and hard bounds. FTF's `contracts/town` `set_params` is owner-only and **immediate** (`lib.rs` line 399). Replace with propose/apply/cancel, a visible pending change, and hard bounds. **Criteria:** Technical, Sustainability ("economies that evolve without a dev patch" needs a story for the dev's own hand).

**Design.**
- `propose_params(params)` (owner): validates hard bounds, stores `pending = (params, apply_at_ns)`, emits a NEP-297 event; `apply_at = now + timelock_ns`.
- `apply_params()` (anyone, after `apply_at`): moves pending into effect, emits event. `cancel_params()` (owner): clears pending.
- `timelock_ns` set at `new()`; **testnet demo** value configurable (e.g. minutes) so judges can watch a change apply; production default 7 days to match Saboteur's story. A deployment constant, not a runtime setter.
- Hard bounds in `validate()`: every share ≤ 100 %, caps non-zero, season mint ceiling ≤ a stated maximum, fee bounds [VERIFY exact params in `contracts/town/src/lib.rs`].
- `get_params()` returns `{ params, pending, pending_applies_at_ns, timelock_ns }` (same shape idea as their `RulesView`).
- Keep `set_paused` immediate (an emergency brake must not wait), documented, with the pause only able to stop, never to change rules.

**Files.** `contracts/town/src/lib.rs` (replace `set_params`), `contracts/town/src/tests.rs` (+ tests), `contracts/town/src/rules.rs` (bounds), `docs/town-economy.md` and `docs/security-town.md` (threat row), `game/public/pulse.html` (shows pending). **Hot spot:** `ftf-town` is **not deployed**, so no migration and no key issue; but it is under the CE contract cut line **Fri 13 Nov 14:00 Kyiv**: past it, do not touch the contract; document as roadmap.
**Tests.** `cd contracts/town && cargo test --lib`: propose by non-owner panics; propose out of bounds panics; apply before `apply_at` panics; apply after succeeds and emits event; cancel clears; second propose replaces; pause still immediate; the shared vectors (`tests/vectors.json`) still pass on both sides (`node tools/town/vectors.mjs`).
**Acceptance.** Old `set_params` removed or renamed; all prior tests pass; new tests pass; Pulse shows a pending change with a countdown.
**Risks / DO-NOT.** Do not change the shared integer rules (`rules.rs` ↔ `game/src/game/town-rules.js`) without the vectors; do not deploy; do not claim the timelock protects deployments with live keys (it limits rule changes, not redeploys: that is C7).
**Label.** CONDITIONAL (time-boxed by the cut line).

**Prompt (C6).**
```
Item C6. Own contracts/town/src/{lib.rs,tests.rs,rules.rs} changes ONLY for: propose_params/apply_params/cancel_params with timelock_ns fixed at init, hard-bound validate(), get_params() returning {params, pending, pending_applies_at_ns, timelock_ns}; remove the immediate set_params; keep set_paused immediate. Add cargo tests for every branch; run `cd contracts/town && cargo test --lib` and `node tools/town/vectors.mjs`. Update docs/town-economy.md and docs/security-town.md. Do not deploy, do not touch other contracts. If it is past Fri 13 Nov 14:00 Kyiv, stop and write the roadmap row instead. Report files, tests, results.
```

---

## C7. Locked contracts · P1 plan, P2 act · SAFE plan / OWNER-GATED action · 3 agent hours

**Goal.** Saboteur deleted the token contract's last key on 12 Nov (0 keys, `get_rules.pending` null), while its pool contract kept two. FTF's testnet keys all still work (`docs/near.md`). Write the **lock runbook and a read-only check script**, and decide which accounts are lockable without breaking the plan. **Criteria:** Sustainability, Technical.

**Steps.**
1. `tools/lock/check.mjs` (read-only): for each account in `contracts/deployments/*.json`, print code hash and the list of access keys; mark `LOCKED` (0 keys) / `OPEN`.
2. `docs/lock-runbook.md`: per account, what is lost when locked (e.g. no more `commit_season` from the coordinator if the account is the coordinator; the arena instances can be locked after the run, the judge contracts `ftf-seasons.testnet` and `ftf-shards.testnet` should only be locked **after** all reveals and mints are final **[OWNER DECISION]**), the exact command marked **SIGNS (key), IRREVERSIBLE**, and a rehearsal on a throw-away account first. Reuse the wording of `docs/mainnet-pass-runbook.md` step 7.
3. Add the check's output as a row in C3's page ("Keys on this contract: N").
**Files.** `tools/lock/check.mjs`, `tools/lock/tests/`, `docs/lock-runbook.md`. **Tests.** Fixture RPC: 0 keys → LOCKED, 2 keys → OPEN, missing account → error.
**Acceptance.** Running the check on today's accounts prints OPEN with their key counts (a truthful baseline); runbook marks every signing step.
**Risks / DO-NOT.** Agents never run `delete-key`; do not lock an account that still needs `reveal_leaf` or `mint_shard`; remember Saboteur's token was locked within hours of creation with 11 rewarded matches: locking early limits fixes.
**Label.** SAFE plan; OWNER-GATED action.

**Prompt (C7).**
```
Item C7. Own tools/lock/ (check.mjs read-only: list code hash and access keys for every account in contracts/deployments/*.json, print LOCKED/OPEN) and docs/lock-runbook.md (per-account consequences, rehearsal on a throw-away account, every signing step marked "SIGNS (key), IRREVERSIBLE"; reuse docs/mainnet-pass-runbook.md wording). Tests with RPC fixtures. NEVER run delete-key or any signing command. Report files, tests, results.
```

---

## C5. Leaderboard rewards agent via NEAR Intents · P1 dry-run, P2 mainnet · SAFE dry-run / OWNER-GATED mainnet · 12 agent hours

**Goal.** Reimplement the safe-by-construction pattern of Saboteur's Weekly Rewards Agent for FTF's leaderboard (Story TZ section 8, "the Shell forms the leaderboard") and the Season 3 roadmap (Story TZ section 9), but with **sealed winner lists** and a **dry-run default**. Their agent has not paid yet and the mainnet part is beta; so we ship the **audited pipeline** in dry-run and state plainly that nothing moves money until the owner and legal say so. **Criteria:** Impact, Sustainability; Intents hint; (no new track claims).

**Design (take their safeguards, add ours).**
1. **Roles.** Owner account signs the agent policy; the server never holds the owner key. A grant token (if the Agent API is used) is stored encrypted and only inside the owner-signed limits. **[VERIFY] the current NEAR Intents Agent API terms and endpoint (their code uses a demo URL and a beta notice); the organizers note there is no testnet for Intents (Q-007): mainnet with tiny amounts and `dry: true` quotes.**
2. **Policy.** Withdraw-only, one asset, a **weekly cap**, a **per-payment cap**, and, unlike theirs, a **non-zero timelock** on policy changes (their `timelock_ms: 0`).
3. **Winner list sealed first.** At the leaderboard's close the list (account ids, ranks, amounts) is hashed and the hash is committed on testnet (a `record_track`-style call on `agent-ledger` or a season-commit leaf; [VERIFY] which) **before** any payment is queued; the payout record references that hash. Their top 3 comes from a private database; ours is committed first.
4. **Eligibility filters** (from Story TZ section 9 mitigations): minimum activity, one rank per wallet, scripted accounts excluded (the FTF equivalent of their DEV exclusion), cap on ranked accounts.
5. **Queue.** One batch, one **30-minute cancellable** countdown stored durably (file or DB), "send now" and "cancel this week" admin commands, a **late-week guard** (never queue a batch for a week closed more than 3 days ago).
6. **Idempotency.** Each payment's Idempotency-Key is **persisted before** the API call; a crash replays the same key; terminal states `SUCCESS`, `FAILED`, `REFUNDED`, `NEEDS_REVIEW`.
7. **Modes.** `dry-run` (default: builds the batch, prints it, writes `data/payouts/<week>.json`, sends nothing), `testnet-ledger` (records "would pay X" on the testnet ledger, no value), `live` (mainnet; requires owner flag, owner key file path, `FTF_PAYOUT_LIVE=1`, and the legal checklist file `docs/legal-review.md` with an owner sign-off line that the code reads and refuses to proceed without).
8. **Legal.** Roadmap framing only: no promised prize, no purchase; copy says "if and when the owner decides, after legal and security review".

**Files (new).** `relayer/payout/{queue.js,policy.js,agent-client.js,seal.js,cli.js}`, `relayer/tests/payout-*.test.js`, `docs/payout-agent.md`, `docs/legal-review.md` (template, unsigned), hooks into the leaderboard module from Story TZ (path [VERIFY]). **Interfaces.**
```
batch = { week, sealHash, items: [{ rank, account, amount, idempotencyKey, status }], state: 'queued'|'sent'|'cancelled', sendAt }
cli: node relayer/payout/cli.js plan --week W [--dry-run (default)] | cancel --week W | send-now --week W --confirm
```
**Tests.** `cd relayer && npm test`: idempotency key persisted before send (kill between persist and send → replay uses the same key); cancel before `sendAt` blocks all items; late-week guard; caps exceeded → blocked; scripted accounts never ranked; `live` refuses without every gate; dry-run performs no network call (fetch stub throws).
**Acceptance.** Dry-run on a fixture leaderboard prints the batch and the seal hash; `docs/payout-agent.md` lists each safeguard with its test name; nothing in the repo can send without the gates.
**Risks / DO-NOT.** No keys, no real API URL with a key; do not name a prize amount in marketing; do not enable `live`; do not call the Agent API from tests; do not implement on mainnet inside the hackathon window unless the owner and legal say so (the first Saboteur payout is not due until Fri 13 Nov 20:30 Kyiv: watch it, do not copy its claims).
**Label.** SAFE for dry-run; **OWNER-GATED** for mainnet (funding, key custody, legal review).

**Prompt (C5).**
```
Item C5. Own relayer/payout/**, relayer/tests/payout-*.test.js, docs/payout-agent.md, docs/legal-review.md (unsigned template). Build a dry-run-first leaderboard payout pipeline: sealed winner list (hash first), eligibility filters (min activity, one rank per wallet, scripted accounts excluded, ranked-account cap), one batch with a 30-minute cancellable countdown stored durably, late-week guard (3 days), Idempotency-Key persisted BEFORE the API call, terminal states SUCCESS/FAILED/REFUNDED/NEEDS_REVIEW, caps (weekly, per payment), modes dry-run (default) / testnet-ledger / live (live refuses unless an owner flag, an owner key file path outside the repo, FTF_PAYOUT_LIVE=1 and a signed docs/legal-review.md line all exist). Tests as in the TZ (kill-between-persist-and-send replays the same key; dry-run makes no network call). No keys, no real endpoints in tests. Never enable live. Legal framing: no promised prize, no purchase. Report files, tests, results, [VERIFY] items.
```

---

## C4. Email / social login with auto wallet, gasless · P1 slice, P2 build · CONDITIONAL · 2 + 20 agent hours

**Goal.** The Games prompt lists social login (and Saboteur has email login). FTF has none (audit: "no social login"); it has a **Day 1 guest account**: a browser-made key becomes the full-access key of a relayer-funded sub-account that owns the Elise NFT (`POST /api/create-guest`). Decide how far to go before the freeze. **Criteria:** Games fit (hint), Design (invisible chain).

**P1 slice (2 h, SAFE).** Say precisely in README and the judge block what exists: "No seed phrase, no wallet popup, no gas prompt: a guest account is created from a key made in your browser, funded by the relayer (daily cap, `ERR_CAP`)". Add the track-hint row. Do **not** call it "social login".

**P2 build (only if all P0/P1 are green and the owner wants it).** Two designs; ours must avoid their custody pattern.
- **Design 1 (recommended): passkey / email-link recovery on top of the guest key.** The browser key stays client-side; an email magic link (or WebAuthn passkey) is an **optional recovery binding**; the relayer never stores the key. Funding stays relayer-paid. Tell the player what is stored where.
- **Design 2: NEP-366 delegated actions** so the relayer pays gas per call while the user's key signs; the existing `relayer/lib/near-tx.js` pattern plus a delegate-action builder [VERIFY]. More work; strongest "gasless" story.
- **Not recommended:** a server-side keystore encrypted with the account password (Saboteur's approach): operator custody, password-reset wipes, and a larger threat surface for a four-day build.

**Steps for Design 1.** (1) Account model: guest key → optional `recovery` record `{ account_id, email_hash, created_at }` in relayer storage; (2) endpoint `POST /api/recovery/start` sends a one-time link (provider via owner-provided env var; dry-run prints the link to the log, never sends); `POST /api/recovery/finish` rebinds a new browser key through the guest contract's owner-gated path [VERIFY: `contracts/guests` has no add-key method today; likely needs a contract change → P2 only]; (3) UI: a settings row "Back up this guest account"; (4) rate limits and OTP lifetime as in `presence/` style (per-IP salted hash).
**Files.** `relayer/api/recovery/*.js` (new), `relayer/lib/recovery.js`, `game/src/ui/settings-popup.js` (one row), `docs/login.md`. **Tests.** Link single-use; expiry; rate limits; dry-run sends nothing; no key material in storage (static check).
**Acceptance (slice).** README/judge text matches the code and `docs/status.md`; (build) a guest can bind and recover on a second browser in a local run with a dry-run mailer.
**Risks / DO-NOT.** No passwords stored; no custody of private keys; no mail sending without the owner's env; no claim of "social login" until a real provider flow works end to end; do not change the guest contract or deploy inside the freeze window without the owner.
**Label.** Slice SAFE; build CONDITIONAL (contract change = gated).

**Prompt (C4 slice).**
```
Item C4 (slice only). Own README and docs/status.md wording plus the track-hint row. Describe exactly the Day 1 guest account (browser-made key, relayer-funded sub-account owning the Elise NFT, daily cap ERR_CAP) as "no seed phrase, no wallet popup, no gas prompt"; do NOT call it social login or email login; add a row stating social login = not built (README: "Wallet sign-in … not built") with the recovery design as roadmap. Cross-check every statement against docs/guests-stage.md and relayer/README.md. No code. Report the exact strings changed.
```

---

## C10. Telegram / X bot for the owner's audience · P2 · SAFE drafts / OWNER-GATED run · 6 agent hours

**Goal.** Saboteur has a Telegram bot that posts self-updating room cards (and, as read, is gated by an env switch). The owner's audience is FTF's real advantage (Move 3). Build a **read-only status poster** that turns chain facts into **drafts**; the owner posts. **Criteria:** Impact (reach with measurable results).

**Design.** `tools/announce/` reads the same sources as C3 (RPC, `docs/STATS.md`), renders **text drafts** (EN, short; later RU by owner request) into `docs/announce/drafts/*.md`: "Day N: X accounts touched the town contract (accounts, not humans), Y trades today, latest verified season: 15/15", each line with its call. A Telegram sender exists but **is a stub**: `--send` refuses without `FTF_TG_TOKEN` and `FTF_TG_CHAT` from the owner's environment and prints "dry-run" otherwise; X posting is **not implemented** (drafts only; the owner posts).
**Files.** `tools/announce/{render.mjs,telegram.mjs}`, `tools/announce/tests/`, `docs/announce.md`. **Tests.** Draft numbers equal fixture; forbidden-word test (no invest, yield, returns, "guaranteed"); sender refuses without env; no network in tests.
**Acceptance.** `node tools/announce/render.mjs --dry-run` writes drafts; every number carries its call; no draft names a prize.
**Risks / DO-NOT.** Never post; never store tokens; do not promise rewards; do not call accounts players; do not scrape anyone.
**Label.** SAFE (drafts); OWNER-GATED (sending).

**Prompt (C10).**
```
Item C10. Own tools/announce/** and docs/announce.md. Render short English draft posts from chain reads and docs/STATS.md (each number with its call), write them to docs/announce/drafts/. Include a Telegram sender that refuses without FTF_TG_TOKEN and FTF_TG_CHAT and prints "dry-run" otherwise. No X posting code at all (drafts only). Forbidden words test: invest, yield, returns, guaranteed, airdrop-for-value. Tests with fixtures, no network. Never post or store tokens. Report files, tests, results.
```

---

## C9. Spectator mode for the town economy · P2 · SAFE · 8 agent hours

**Goal.** Saboteur's Watch Live (silent spectators for public rooms) is built but disabled live. FTF's best spectating target is the **economy and the sealed season**, not a lobby: a read-only "Watch the town" page with a time scale, using what exists: `game/src/ui/replay-view.js` (instant replay), the agent API's time-scaled sessions (`node examples/agent.mjs --time-scale 1000`) and `tools/town/sim.mjs`. **Criteria:** Design, Impact, the Games prompt's "fast-forward mode that simulates a week of trading in a minute" (an in-game control for it was not found on main [VERIFY]).

**Steps.** (1) A static page `game/public/watch/index.html` with three modes: **Live** (C3 events), **Replay** (a recorded week from `tools/town/sim.mjs` output with a speed slider 1x to 1000x, labelled "simulation, not chain"), **Season** (replay-view of the judge season). (2) Every frame states its source: chain / simulation / recorded. (3) Spectators have no input path to the relayer (no keys, no POST). 
**Files.** `game/public/watch/**`, `tools/town/export-week.mjs` (new, writes a JSON week from the existing simulation, deterministic by seed), `docs/watch.md`. **Tests.** Same JSON for same seed; the page loads fixtures and shows the source label; static test that the page contains no `fetch(..., { method: 'POST' })`.
**Acceptance.** A one-minute run shows a week of prices moving, bankrupt stalls closing and reopening; labelled simulation.
**Risks / DO-NOT.** Never present simulation as chain; do not add accounts or chat; keep static.
**Label.** SAFE.

**Prompt (C9).**
```
Item C9. Own game/public/watch/**, tools/town/export-week.mjs and docs/watch.md. Build a read-only spectator page with three labelled modes: Live (chain events via the same RPC code as C3), Replay (a deterministic week exported from tools/town/sim.mjs, speed slider 1x-1000x, labelled "simulation, not chain"), Season (existing replay-view). No POST, no keys, no third-party scripts. Tests: deterministic export by seed, source labels present, no POST in the page. Report files, tests, results.
```

---

## C8. Referrals with caps · P2 · CONDITIONAL · 8 agent hours

**Goal.** Reimplement Saboteur's pattern (`REFERRAL = { matches 3, humans 2, weeklyCap 5 }`) for FTF **without** token rewards: the reward is an in-game, no-value item. **Criteria:** Impact (weak). Low priority: judges rarely test it and it adds abuse surface.

**Design.** Invite link `?ref=<guest nickname>`; friend must finish a full season (not three quick matches), proven by a sealed-season completion record; reward is cosmetic (a banner or title) capped at 5 per inviter; one reward per friend atomically; self-referral and duplicate-device checks are best effort and documented as such (no identity system exists); counted in C3 as "accounts, not humans".
**Files.** `relayer/lib/referral.js` (new, [VERIFY] storage), `game/src/ui/lobby.js` (one link row), `docs/referrals.md`. **Tests.** Atomic claim (two parallel finishes → one reward); cap enforced; self-referral blocked; replayed completion id rejected.
**Acceptance.** Local run: invite → friend finishes → inviter gets one cosmetic; sixth friend gives none.
**Risks / DO-NOT.** No token, no value, no payout; do not describe as growth proof; no tracking beyond the salted hash approach used in `presence/`.
**Label.** CONDITIONAL.

**Prompt (C8).**
```
Item C8 (P2, only if P0/P1 are green). Own relayer/lib/referral.js, docs/referrals.md and one link row in game/src/ui/lobby.js. Cosmetic-only reward, 5 per inviter, one reward per friend (atomic), friend must finish a sealed-season completion, self-referral blocked, replayed completion id rejected. No tokens, no value. Tests for atomic claim, cap, self-referral, replay. Report files, tests, results.
```

---

# PART D. HOW WE BEAT SABOTEUR (unique angles)

The Games prompt (organizers' example prompt `09-games.md`, fetched 12 Nov) asks for: merchants as agents **with their own wallet and inventory**, prices from stock and recent demand, a merchant that goes broke closes **until someone invests**, items as NEP-245, social/email login with no wallet popups, **merchant pricing rules in one readable file with a reasoning tooltip**, a **fast-forward mode** (a week of trading in a minute), and a game loop designed on paper first. "Judged on the game loop, not the token", bonus if players never notice the chain. Saboteur answers the login and "no token pitch" parts; it does not answer the merchant economy at all. FTF's strongest, already-built answers:

**D1. A living merchant economy with a wallet per NPC (the prompt, almost verbatim).**
- Already on main: `relayer/market/prices.js` (one readable file: stock, demand moving average with a 45-minute half life, price band half to twice base, "the trader's reason in words" for the tooltip), `relayer/lib/town-traders.js`, `relayer/market/catalog.js` (13 townsfolk + 7 clan traders), `contracts/town` (silk conservation, caps, rate ceiling, season mint ceiling, wash-trading EV tests), `docs/town-economy.md`, `docs/security-town.md`, `tools/town/sim.mjs`.
- Not yet true until the owner acts: **`ftf-town` and the 20 trader accounts are not deployed**, so the README says "built, not live". Everything in D1 becomes a fact only after the owner-gated Move 2 stages; before that the pitch must say "built and tested, deploying" and nothing more.
- Beat them with: each NPC is its own account (named wallets such as `trader-01.ftf-town.testnet`), each trade a function call that is the on-chain record of a real engine event (Move 2 genuine-action rule), a tooltip that shows the price reason, a Town Pulse page (C3) that reads the chain directly, and the **honest label** "scripted NPC activity, owner-run, testnet, public seeds" (C11).

**D2. Investment into bankrupt shops.** The prompt's "closes its shop until someone invests" is in the price file: a trader whose purse falls under `BANKRUPT_SILK` stops buying and making goods and sells off its shelf until the purse is back above `REOPEN_SILK` from sales, wages or an investor's pledge. Show it: a **Hall of Pledges** on C3, a quest ("revive the closed stall", Story TZ citizen quests) and a replay in C9 where a stall closes and reopens. **Currency is settled: silk.** The contract's `invest_stall(trader, silk)` is a pledge of silk into a stall's working capital: the investor earns half the stall's fee (`stall_fee_bps` 5,000) and collects it with `claim_stall`; **the silk itself is not returned**. In CE's simulation a stall pledge returns a median −78% of the silk pledged within 30 days, so present it as a quest and pride mechanic ("back a stall"), never as income; player-facing copy says *pledge*, never *invest*.

**D3. A sealed, verifiable season.** Saboteur's reward and pool outcomes rest on an oracle the player must trust. FTF commits the schedule root on chain before play, reveals each event with a Merkle proof, and ships standalone verifiers (`tools/verify/verify.mjs`, `verify.py`, `tools/verify-tee`, `replay-season.mjs`). The one-line pitch: **"Their game reports; ours commits first."** Show the failed-flip test (C1 row 4) and the 15 of 15 table. This also answers "economies that evolve without a dev patch": the season cannot be changed mid-play, and with C6 the town's rules cannot be changed without notice.

**D4. Mainnet NFT finale (the differentiator they cannot cheaply copy).** Story TZ section 11: an endgame cliffhanger and a **mainnet whitelist pass** NFT, free, no purchase, claimable once per player and per wallet, transferable (owner decision), minted by the relayer under caps. Existing pieces on main: `contracts/whitelist-pass` (caps `0 < daily_cap <= cap <= 10000`, `ERR_CLAIM_USED`, `ERR_NOT_MINTER`, `ERR_DAILY_CAP`), `relayer/lib/pass-service.js`, `relayer/api/pass/*`, `docs/mainnet-pass-runbook.md`, `docs/pass-claim-api.md`. Saboteur's mainnet footprint is Play Pass sales and a policy store; ours would be a **free, capped, verifiable** mainnet artifact with keys deleted after the last mint. **OWNER-GATED** end to end (funding, key custody, deploy, mainnet, legal wording). Mainnet is not required (Q-010); it is a differentiator against testnet-only entries and against entries whose mainnet part is a payment.

**D5. The NFT track.** Saboteur has no real NFT story (an SBT badge and custom-character requests). FTF's memory shards are NEP-171 tokens whose metadata carries the season id, memory kind and weight, the trial, the auction result and the **Merkle leaf** of the sign they opened; the on-chain ink-ring SVG is byte-identical to the game's. Move 6 (threat model and transfer tests) is the lever; add the Hall of Pledges deeds from the City Economy plan only if they land before the freeze.

**D6. Honest "not used" rows.** Neither project uses NEP-245. Say so in the track-hint table (C1). A judge or screener rewards a "not used, because …" more than a vague claim; Saboteur's own README does this for some rows.

**D7. A clean window.** 0 commits before 1 Nov, an empty `pre-hackathon` baseline, a one-command proof (C12). Saboteur needs a defence for Q-004; FTF needs none.

**D8. Negative proof with a verifier anyone can run (C2).** Their four failed transactions are screenshots plus links; ours are re-checked by `tools/cheat/verify.mjs` with no key.

**Where Saboteur is still ahead (do not pretend otherwise).**
- A multiplayer social loop with real players and a Telegram presence; FTF's shared town is dormant and the hosted game is single-player (README).
- Email login and a custodial wallet today; FTF has none.
- A token whose rules are timelocked and keyless **on chain today** (0 keys since 12 Nov 11:43 UTC); FTF's town contract is not deployed.
- A live mainnet payout design that may pay on Fri 13 Nov 20:30 Kyiv; if that payout appears, their Impact and Sustainability rise in a judge's eyes.
- Mobile-first reach; FTF needs desktop WebGL 2.

**What not to do.** Do not name Saboteur in the README, post or video; do not call their work fake (their contracts and tests are real); compare only on facts a judge can verify; never contact them; do not copy their text, names ("Wall of Shame", "Try to cheat") verbatim in marketing, use FTF's own words ("Refusals", "Sealed and checked").

---

# PART E. OWNER CHECKLIST, [VERIFY] LIST, REPRODUCTION

## E1. Timeline (Europe/Kyiv)

| When | What |
|---|---|
| Thu 12 Nov, evening | Start C12, C1, C11 (docs and static pages). Decide the currency conflict (B0). Decide whether C6 is in. |
| Fri 13 Nov, morning | C2 slice A scripts ready (dry-run), C3 skeleton; C7 check script; owner decides lock plan. |
| Fri 13 Nov 14:00 | Contract cut line for `contracts/town` (C6 only before this). |
| Fri 13 Nov 16:00 | **Freeze.** Merge captain merges green branches only. |
| Fri 13 Nov 20:30 | Saboteur's first scheduled weekly reset (2026-11-13T18:30Z): check whether a payout appears; record it in the pitch notes **without** quoting it unless verified on chain. |
| Sun 15 Nov 01:59 | **Hackathon development ends** (14 Nov 23:59 UTC). Repo public, tag, X post, submission done by then. |
| Mon 16 Nov 02:00 | Judging starts (16 Nov 00:00 UTC). |

## E2. Owner checklist (agents prepare, owner decides or performs)

1. ~~Currency conflict (B0)~~ **Resolved by the owner (12 Nov): one currency, silk.** No action.
2. **`ftf-town` deployment and 20 trader accounts** (Move 2): funding, key custody, deploy script `contracts/scripts/town-deploy.sh`: OWNER-GATED.
3. **Run the "Try to cheat" `--send`** (C2): signs testnet transactions with throw-away accounts: OWNER-GATED.
4. **Lock keys** (C7): irreversible; decide per account and when.
5. **Payout agent** (C5): any mainnet step, Agent API account and terms, funding, legal review sign-off: OWNER-GATED; keep dry-run for the hackathon unless legal says otherwise.
6. **Tags and repo visibility**: push `hackathon-submission` at the freeze commit; make the repo public before 14 Nov 23:59 UTC (Sun 15 Nov 01:59 Kyiv).
7. **X post and submission**: owner posts and submits; agents only draft (C10, Move 9).
8. **Telegram bot token, mail provider, any env secrets** (C10, C4): owner-provided, never in the repo.
9. **Catalog registration** (Move 1) and whether Saboteur is listed (A15): owner or scorecard owner checks.
10. **Window wording**: confirm with the organizers if there is any doubt between Q-001 (19 Oct) and the facts table (1 Nov); FTF passes both.

## E3. [VERIFY] list

- Currency final answer (B0).
- Whether `docs/hackathon-rules.md` repeats the "1 to 14 Nov" window; update to the two-reading sentence.
- Whether the scorecard sentence "most of that work predates 1 Nov" was based on history outside this repository.
- Method names and gating in `contracts/town/src/lib.rs` (`get_params`, pledge/stake methods) and in `docs/` before wiring C3, C6, C7.
- Exact gating of `mint_shard` / `reveal_leaf` in `FTF-Competitive-TZ.md` section 4.2 before using the C2 attack table.
- Whether the in-game UI has a fast-forward control for the town market (only time-scaled sessions and replay were found).
- NEAR Intents Agent API current terms, endpoint and whether a testnet exists (organizers say none, Q-007).
- Measured first-load time of the 414 MB build on a clean browser.
- Saboteur: UI labels for model-generated bot lines; the `.tg` outflows from `saboteur.near`; the weekly payout on Fri 13 Nov; Telegram live status; whether they are in the catalog; whether the founder's second project (Q-015) is disclosed.
- Saboteur's `reset` wallet semantics (A5.4 point 5).

## E4. Reproduction commands (read-only, no keys)

```bash
# Saboteur token: stats, rules, config, keys
RPC=https://rpc.testnet.fastnear.com
q() { curl -s $RPC -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"sabo.saboteur.testnet\",\"method_name\":\"$1\",\"args_base64\":\"e30=\"}}" | python3 -c 'import sys,json;print(bytes(json.load(sys.stdin)["result"]["result"]).decode())'; }
q get_stats; q get_rules; q get_config
curl -s $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"sabo.saboteur.testnet"}}'
# the four failed transactions (sender is only used to locate the shard)
for h in DgHkB93F8cu77qgfnAH6kDLw1Yyiiy61p4d4vYjDiyd8 D5y5Kh8CRUzb3BReei7pUKUBZKEXagqY2XDmvnfKDpoL 97Pp28rUe4v9AoE51LgqwFVh8vW8CfqZknxinGRhnMJh CqGYgWg9z3TukWhYxZxmtrDUbN4hj27JmYPDg4ztoZMw; do
  curl -s $RPC -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"EXPERIMENTAL_tx_status\",\"params\":{\"tx_hash\":\"$h\",\"sender_account_id\":\"sabo.saboteur.testnet\",\"wait_until\":\"FINAL\"}}" | python3 -c 'import sys,json;d=json.load(sys.stdin)["result"];print(d["transaction"]["signer_id"],d["status"].get("Failure"))'; done
# pool contract version and keys (2 full-access keys at read time)
# (same call pattern with account_id near_saboteur_contract.testnet and the view method for the version)
# mainnet owner account
curl -s https://rpc.mainnet.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"saboteur.near"}}'
# weekly agent and watch flag (public GETs on their backend; the host is in their README)
#   /weekly-rewards   /watch/config   /saboteur/live
# history windows (clone both repos in full)
git log --before=2026-11-01 --oneline | wc -l;  git rev-list --count HEAD
git diff --shortstat ec86165 HEAD   # frontend baseline; backend baseline is 25b6b99
# FTF window facts from a fresh clone
git rev-list --count origin/main; git log --before=2026-11-01 --oneline origin/main | wc -l
```

## E5. Sources

- Saboteur: https://github.com/Om7eth/near-saboteur-frontend, https://github.com/Om7eth/near-saboteur-backend, https://nearsaboteur.com, `/token`, `/how-to-play`, demo post https://x.com/NearSaboteur/status/2120862694026940559, NEAR Catalog page https://nearcatalog.xyz/project/near-saboteur (describes an older version: "10-to-100 players", wallet starting at 100 NEAR, "Live on NEAR mainnet"; the catalog text is not the current README and is evidence the product predates the hackathon).
- Organizers: https://nearhackathon.com/HACKATHON.md (Q-000 to Q-017, facts table, prizes), https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/09-games.md.
- FTF: `SpacexCeo/forget-to-foresee` `origin/main` `6ddd312e`; `docs/STATS.md`, `docs/status.md`, `docs/town-economy.md`, `docs/decisions.md`, `README.md`; our `FTF-Competitive-TZ.md`, `FTF-City-Economy.md`, `FTF-Story-Quests-Leaderboard-TZ.md`, `FTF-Competitor-Scorecard.md`.

## E6. What I did not do

No push, PR, deploy, funding, key operation, signing or posting; no contact with the Saboteur team; I did not play their game, render their SPA or watch their video; I did not read anything behind a login; I did not run their tests or simulation; all numbers marked V can be re-created with section E4.
