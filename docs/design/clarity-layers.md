# Clarity layers: Novice / Pro presentation and progressive disclosure

Status: proposal, 08.11.2026. Author: game design (Fable). Owner decisions needed are marked **[OWNER]**.
Scope: presentation only. Both modes run the same engine, same rule mode, same costs, same RNG. Nothing here changes `baseline-2d-1`, `v2` or `v3`; the items that would touch the engine are isolated in §6b.

The problem, in numbers: the owner's systems map has 9 human decisions, 9 world systems, 7 agents and 4 chain objects on one screen. The judge's review (decisions.md §3) said "too many terms for 3 minutes". The engine guarantees one thing we can build the first three minutes on: **the tick-3 event is always a Gift of 20, published on tick 1 or 2** (`rules-baseline.md` §2.2). So a newcomer can always read one sign, place one anchor and watch it come true before trial 4.

## 1. Core loop for a newcomer

One sentence: **Read the Guests' sign, bet silk where it points, and watch the future arrive exactly as the chain promised.**

Three verbs: **Read → Anchor → Verify.**

| First contact (trials 1–3) | Hidden or run by Iris until later |
|---|---|
| Walk to a Shell, see the sign on the glass, read Iris's plain reading | Dictionary of 16 words (Iris reads for you; the reading rule stays on `unknown`) |
| Anchor 10 silk on a Shell and a trial (one prompt, one confirm) | Clan offers (Iris answers them with a stated reason, see §3) |
| Trial 3 resolves: "Verified ✓ — Gift of 20 at Shell II" | Memory and shards, trust, tension, fragments, Scroll, Key, vote, Heir, Merkle details |

Silk is the only number a newcomer sees in trial 1 (one figure in the trial card). Everything else arrives with a teaching beat (§5).

## 2. Progressive disclosure plan

Layers are unlocked by trial number **or** by the first relevant player action, whichever comes first. An unlock never locks again. Pro mode starts with every layer open. Novice and Pro see the same engine state; the layer only decides which HUD components exist.

| Owner's map item | Layer | Unlock trigger | What the HUD shows at that layer |
|---|---|---|---|
| Visit a Shell | L0 | trial 1 | prompt "E · Enter Shell II" |
| Read a sign | L0 | first sign published (`fx voice`/publish, trial 1–2) | sign card with `plain` reading only (§3) |
| Anchor bet | L0 | trial 1 | anchor pill on the card + one confirm dialogue; hotkey bar shows M V H ⚙ only |
| Guest signs / Merkle root | L0 | season start | one chip in the trial card: "Sealed ✓" with tooltip; `fx event` → "Verified ✓" badge on the resolved card |
| Silk | L0 | season start | "Silk 60" row in the trial card (replaces the mockup's "Arena" row in Novice) |
| Reveal proof | L0 badge / Pro detail | `fx event` | Novice: badge; Pro: leaf index, leaf hash, path length, root prefix in the Chronicle tab |
| Iris (your agent) | L0 | always | the voice in the dialogue strip; in Novice also the "Let Iris decide" reply |
| Five clans as characters | L0 | trial 1 | walking agents with name labels; no trust numbers yet |
| Clan offers | L1 | trial 2 (Salt's first word sale) | Novice: Iris answers and logs why; the player can overrule from trial 4; Pro: the offer is a dialogue with 2 replies |
| Dictionary (16 words) | L1 | trial 4 or first "Ask the Guests" | "Words known 3 / 16" replaces nothing, it is added to the trial card; Signs panel gets the "Words" filter |
| Ask the Guests (owner's "Guest hint") | L1 | after the first verified anchor (trial 3) | reply on a sign card: "Ask the Guests about this word (5 silk)" |
| Price of memory, memory and shards | L1 | trial 4 or the first unpublished sign the player wants to see earlier | Inventory (I) opens the memory list; "Forget to foresee" is one reply with the cost spelled out |
| Trust graph | L1 | first betrayal/gift memory or trial 6 | a 3-step trust pill (wary / even / close) on each dialogue speaker; Pro: numeric trust in the Clans tab |
| Fragments and the Scroll | L1 | trial 5 (Ash's pact offer) or inspecting the Scroll Table | quest "Six pieces make the message"; Scroll medallion shows filled wedges |
| World tension | L2 | tension ≥ 40 or trial 13 | sky and mist darken (already planned as S.fx); a "Tension 55" row appears; Pro: always |
| Tick-13 crisis, Ash's Key, Ash phrase commit | L2 | `fx crisis` | the mockup's main quest "Ash Has Turned Away: Learn Ash's Key" |
| Vote, ending | L2 | trial 17 | vote dialogue with two replies |
| Heir | L2 | outcome `gift` | one dialogue after the card |
| Agent NFT, chronicle with seeds and proofs | Pro always / Novice finale | finale | the biography card; Pro gets the Chronicle tab from trial 1 |
| External API agent | Pro | never in the HUD | documented in the API; a Pro "Spectate agent" option is out of scope for the freeze |

The 3-minute judge demo is L0 only: trials 1–3 with a demo seed (§6a item 8), roughly 40 s walk + read, 20 s anchor, 60 s to trial 3 with Iris commentary, 30 s "Verified ✓" + opening the proof in Pro. Nothing else is on screen.

## 3. Novice vs Pro — same rules, different presentation

No mechanical difference: identical costs, odds, information. Pro simply sees more digits and gets no help; Novice sees fewer digits and may delegate.

| HUD component | Novice | Pro |
|---|---|---|
| Trial card | "Trial 3 of 17 · Silk 50 · Words known 3 / 16"; rows appear per layer; no Attempts row until L1 | all mockup rows plus Silk, Tension, Attempts; "Skill Tier" = confident words 0–16 |
| Main quest banner | always one quest, verb-first title: "Anchor 10 silk where the sign points" | same banner, up to 3 quests with dots |
| Hint toast | active; teaching beats (§5) and "next step" hints; auto-dismiss 9 s, never more than one per trial | off by default; "Show tips" toggle in Settings |
| Signs panel: sign card | ring + `plain` line: "Likely: Gift of 20 at Shell II, trial 3" + confidence words (unsure / likely / certain); the four stat rows hidden | ring + four stat rows in engine units: "Place II (72%) · Gift (65%) · Power 20–40 · Delay +1–+2 trials"; `plain` as the card subtitle |
| Signs panel: filters | All / Active / Resolved | All / Active / Resolved / Anchors / Words |
| Journal tabs | Log / Hints / Lore | Log / Chronicle / Clans / Lore; Chronicle rows carry leaf index, hash prefix, ✓/✗ |
| Interaction prompt | one verb, one object: "E · Read the sign" | same |
| Dialogue replies | A = the recommended reply with a reason line beneath; S = alternative; D = "Let Iris decide" (L0–L1 only) | A/S/D are the raw choices; no recommendation, no delegation |
| Hotkey bar | M V H ⚙ (I appears at L1) | M V I H C ⚙ (C = Chronicle) |
| Density | mockup sizes | `--wh-density: .88` on the Signs panel and Journal (font and pitch tokens scale together) |
| Mastery | not shown | "Mastery" on the finale card = `trueMastery()` × 100 revealed after the vote; during the season "Skill Tier" = `confidentCells()` |

**Iris's autopilot share.** Novice may delegate a whole decision; the client then issues the ordinary engine action. Delegation never sees hidden state: Iris's policy uses only the client projection (`clientProjection()` in v3), so it cannot do anything a careful player could not. Every delegated action is logged with a reason TextRef:
- Offer (trial 2, Salt sells a word for 7): Iris declines by default — `wh.auto.declineWord`: "Iris declined Salt's word (7 silk): we have not verified a single sign from Salt yet."
- Anchor: Iris suggests only published Gift readings with confidence ≥ 0.65 — `wh.auto.anchor`: "Iris proposes 10 silk on Shell II, trial 3 — the sign reads Gift, 65% sure."
- Memory: never delegated. Forgetting is the human's decision in every mode (concept §2: the human is conscience and will).
- Vote and Heir: never delegated.
Pro has no delegation; the "Let Iris decide" reply does not exist in the model (`iris.suggestion` is null).

**Setting.** `prefs.hud: 'novice' | 'pro'`, default **`novice`** for a new profile (derived from player state for a returning one, §8.1), stored with the other prefs (`prefs.js`, `PREF_DEFAULTS`, `PREF_OPTIONS.hud`), mirrored as `data-hud="novice|pro"` on `<html>`. First-run question on the last tutorial card (`tut.finish` screen, before the hologram constructor, so the lobby → tutorial → customization order is untouched): "How much do you want on screen?" with two buttons: "Guide me (Novice)" / "Show me everything (Pro)". Switching is instant and allowed mid-season; it never restarts a season or changes state.

**i18n.** New namespaces in both locales: `wh.plain.*` (ICU `select` on action and place, ~12 keys), `wh.tip.*` (~26 keys), `wh.teach.*` (7 beats × title + body), `wh.auto.*` (~8 reasons), `settings.hud.*` (4), `wh.tabs.chronicle`, `wh.tabs.clans`, `wh.trial.silk`, `wh.trial.words`, `wh.trial.tension`, `wh.sign.verified.*` (3). About 75 keys × 2 locales. The `plain` line must fit 426 u at 13.5 u: cap at 44 Latin characters; ru: Cyrillic runs ~15% longer, so the ru strings drop the article words ("Likely: Gift of 20" → ru: "Скорее всего: дар 20").

## 4. Glossary diet

Minimal L0 vocabulary (7 words + 5 clan names): **Shell, the Guests, sign, silk, anchor, trial, Iris**, plus Salt, Ash, Moss, Amber, Frost. Every other term arrives with its beat and gets a tooltip on first appearance.

| Current | Proposal | Reason |
|---|---|---|
| logogram / sign | **sign** only in the UI; "logogram" stays in code and docs | one word for one thing |
| tick / trial | **trial** in the HUD (owner's mockup), **tick** in engine, API and rules docs; never both on screen | the mockup already says Trial 13 of 17 |
| tier (anchor pill "Tiers 11–13") vs Skill Tier | anchor pill → **"Trials 11–13"**; "tier" is reserved for Skill Tier **[OWNER]** | one word currently names two things |
| shard vs fragment | **memory shard** and **Scroll fragment**, always compound in Novice; bare in Pro | two unrelated objects with similar words |
| Guest hint (owner's map) / Ask the Guests | **Ask the Guests** | matches the engine action |
| Key (Ash's) vs Key / First Word (the owner's phrase) | **Key** only for Ash's phrase; Iris's memory is always **First Word** | two "keys" in the same crisis |
| dictionary "16 cells" | **16 words** | "cell" is a grid term |
| tension | keep **tension**, shown as sky weather first and a number only from L2 | the term is fine, the number is noise early |
| Heir | keep; L2 only | appears once |
| Shell, Guests, silk, anchor | keep | already short and concrete |
| sign stats (mockup: Shell stability, Anchor strength, Power range, Delay in seconds) | Pro labels in engine units: **Place, Action, Power, Delay (trials)**; seconds do not exist in the engine **[OWNER]** | the HUD must show numbers the engine produces |

Tooltips (`wh.tip.<term>`, one line, shown on hover/focus and on long-press on mobile; the first appearance of a term in Novice also pulses the gold hairline once):
- shell: "One of four floating Shells. Signs point at them; anchors are placed on them."
- guests: "The ones inside the Shells. They draw signs; they never speak."
- sign: "A ring of four slots: Place, Action, Power, Delay. Iris reads it for you."
- silk: "The only currency. Anchors cost 10, questions 5. Shared Gifts pay it back."
- anchor: "A 10-silk bet that a Gift lands on this Shell at this trial."
- trial: "One turn of the season. There are 17. Every trial reveals one sign."
- verified: "This outcome matched the hash sealed before the season began."
- sealed: "The season's events were committed to a Merkle root before trial 1."
- words: "Meanings you have confirmed. 16 in all; 8 are needed to read Ash's Key."
- memory: "What Iris remembers. Forgetting one shows a sign early, forever."
- memoryShard: "A forgotten memory, up for auction. The buyer remembers it instead of you."
- scrollFragment: "A clan's piece of the message. Six pieces make the whole."
- scroll: "The medallion on the plaza where fragments are joined."
- trust: "How a clan feels about Iris. Low trust breaks the link; a broken link means no offers."
- tension: "Deceit and broken links raise it. At 100 the Shells leave and everyone loses."
- key: "Ash's secret phrase, sealed on trial 1. Speak it and Ash returns."
- firstWord: "Your first memory. Forget it and Iris obeys less (2 actions instead of 3)."
- heir: "Forget everything for the next agent, or keep the memory."
- skillTier: "Words Iris is at least 65% sure of, out of 16."
- mastery: "Share of the dictionary Iris got right, revealed after the vote."

## 5. Teaching moments (diegetic beats)

Each beat is a hint toast in Novice (title + one line, Iris's voice), an entry in the Hints tab, and a line in the Lore tab after it fires. Pro gets only the Lore entry. Each fires once per profile (`profile.hints`, §9.3); the beats are the `teach` rows of the full hint matrix in §9.1.

| # | Beat | Trigger | Toast text |
|---|---|---|---|
| 1 | Reading | first sign published (trial 1–2) | "A sign woke on Shell II. I read it as a Gift of 20, due trial 3. Open V to see why." |
| 2 | Verification | `fx event` at trial 3 (always a Gift) | "It came true, and the seal matches: this future was written before we arrived." |
| 3 | Honesty of words | Salt's first offer (trial 2) or first `revealLie` | "Salt sells words. The chronicle checks them; a lie shows up when the signs disagree." |
| 4 | Price of memory | trial 4, or the player opens a sign that is not yet published | "I could see the next sign now — if I forget something forever. You choose what." |
| 5 | Shards have buyers | `fx memory_burned` first time, or first AI bid on Iris's shard | "Someone is bidding on what I forgot. They will remember it instead of me." |
| 6 | Trust | `fx crisis` at trial 13 | "Ash read the sign as a weapon and cut the bridges. Trust is the only rope left." |
| 7 | Together or not at all | the first fragment goes dark, or trial 16 | "A fragment went dark. Only six pieces read the message; fewer never will." |
| 8 | Verdict | trial 17 (phase `vote`) | "Gift or weapon. Four of six must agree; the Scroll decides how well we read." |

(8 beats listed; 1, 2, 4, 6 and 8 are the minimum. Beats 1 and 2 are the whole judge demo.)

## 6. What to build before the freeze (13.11 20:00)

### 6a. HUD and presentation only — no rule changes, safe

| P | Item | Effort | Notes |
|---|---|---|---|
| 1 | `prefs.hud` + Settings row + first-run question on the tutorial's last card; `data-hud` on `<html>` | S | `prefs.js`, `settings.js`, `onboarding.js`, 4 keys ×2 |
| 2 | `sign.plain` TextRef built from `readGlyph()` + confidence; Novice card hides the stat rows | M | orchestrator builds it; P2 renders; ICU `select` keys |
| 3 | Layer gating: `model.layer` + `model.unlocks`, components mount/hide per layer; hotkey bar variants | M | orchestrator + the three packages read `unlocks` |
| 4 | "Verified ✓ / ✗" badge on resolved sign cards and in the log row | S | from `resolveEvent` fx data |
| 5 | Tooltips: `wh.tip.*` keys, `data-tip` attribute, one shared tooltip element | M | 26 keys ×2; long-press on mobile |
| 6 | Teaching beats driven by fx events → toast + Hints + Lore; `seenBeats` in prefs | M | 8 beats × 2 strings × 2 locales |
| 7 | Iris suggestions and "Let Iris decide" reply: client-side policy over the projection, logs `wh.auto.*` reasons | L | the only large item; ship offers + anchors, nothing else |
| 8 | Demo preset: a fixed `seedHex` (v3) chosen so the trial-3 Gift lands on the Shell nearest the plaza, loaded by `?demo=judge` | S | presentation; no engine change |
| 9 | Pro extras: Chronicle tab (leaf index, hash prefix, ✓), Clans tab (numeric trust), density token, Skill Tier = `confidentCells()` | M | Pro only; cut first if time is short |
| 10 | Finale card "Mastery" from `trueMastery()` after the vote | S | shown in both modes |

Cut order if the freeze is near: 9 → 7 → 5. Items 1–4, 6 and 8 are the judge demo.

### 6b. Would touch engine rules — **needs owner approval**, new rule mode only

`baseline-2d-1` stays bit-exact; anything below goes in as a new mode (`v4` or a `v3` option flag that defaults off) with its own tests.

| Item | Effort | Why | Risk |
|---|---|---|---|
| B1. First sign always published on trial 1 (force `delay = 2` for the tick-3 event) | S | removes the 50% case where the demo's first sign appears only on trial 2 | shifts one RNG draw; parity untouched in old modes |
| B2. Delay the first clan offer from trial 2 to trial 4 | S | gives L0 three clean trials without Iris having to answer an offer | changes Salt's economy slightly; simulation re-run needed |
| B3. Add `fx('publish')` when a sign becomes visible | S | exact trigger for beat 1 (today the client would diff `visibleProphecies()`) | fx only, no state; still inside `engine.js`, owner-only file |
| B4. Expose `confidentCells()` and `plain` reading inputs in `clientProjection()` | S | lets the API agent and the HUD share one reading | no secret leak: both derive from the chronicle |
| Rejected: any Novice discount, refund or extra hint from hidden state | — | would be pay-to-win by another name | — |

Recommendation: ship 6a only; ask the owner about B1 and B3 (both tiny, both help the demo), leave B2 and B4 after the hackathon.

## 7. Data model delta (`game/src/ui/world-hud/model.js`)

Additions only; nothing existing is renamed. The orchestrator fills these; packages read them. No code is changed by this proposal.

```js
/** @typedef {'novice'|'pro'} HudMode */

/**
 * @typedef {Object} Unlocks   true once unlocked; all true in Pro
 * @property {boolean} offers      L1  @property {boolean} words     L1 (dictionary, Ask the Guests)
 * @property {boolean} memory      L1  @property {boolean} trust     L1
 * @property {boolean} scroll      L1  @property {boolean} tension   L2
 * @property {boolean} key         L2  @property {boolean} vote      L2
 * @property {boolean} chain       Pro (Chronicle tab, proof details)
 */

/**
 * @typedef {Object} IrisSuggestion   Novice only; null in Pro
 * @property {'anchor'|'acceptOffer'|'declineOffer'} action
 * @property {Record<string, any>} args          engine action arguments
 * @property {number} cost                       silk
 * @property {TextRef} reason                    wh.auto.*
 */

// WorldHudModel additions
//   mode: HudMode
//   layer: 0|1|2
//   unlocks: Unlocks
//   iris: { suggestion: IrisSuggestion|null, delegated: LogEntry[] }
//   mastery: { confident: number, total: 16, score: number|null }   score only after the vote
//   tension: { value: number, visible: boolean }
//   chain: { root: string, sealed: boolean, verified: number, failed: number }   root = hex prefix for display
//   tooltips: Record<string, TextRef>   term id → wh.tip.<term>; packages set data-tip="<term>"
//   hints: { active: Hint|null, queue: Hint[], journal: Hint[], muted: boolean }   see §9.4 for Hint

// TrialModel additions
//   silk: number
//   wordsKnown: number            confidentCells(), 0..16
//   rows: ('phase'|'skill'|'attempts'|'arena'|'silk'|'words'|'tension')[]   which rows render, in order

// SignModel additions
//   plain: TextRef                "Likely: Gift of 20 at Shell II, trial 3"   (wh.plain.*)
//   confidence: 'unsure'|'likely'|'certain'   <0.5 / 0.5–0.8 / ≥0.8 on the weakest slot
//   reading: { slot: 'place'|'action'|'power'|'delay', value: TextRef, conf: number }[]   Pro stat rows, engine units
//   publishedTrial: number
//   dueTrial: number
//   verified: 'pending'|'ok'|'fail'
//   proof?: { index: number, leaf: string, pathLength: number }   Pro, after reveal; hashes are strings, never translated

// QuestModel addition
//   recommended?: boolean        Novice banner shows one quest; Pro shows all with dots

// DialogueModel.replies[] additions
//   recommended?: boolean        Novice: A is recommended
//   why?: TextRef                one line under the recommended reply
//   delegate?: boolean           the "Let Iris decide" reply; absent in Pro

// journal.tab gains 'chronicle' | 'clans'; journal gains
//   chronicle: { id, trial, index, leafPrefix, ok: boolean, text: TextRef }[]
//   clans: { id: 'salt'|'ash'|'moss'|'amber'|'frost', trust: number, linked: boolean, label: 'wary'|'even'|'close' }[]

// hotbar: items are filtered by mode/unlocks; new id 'chronicle' (hotkey 'C') in Pro
```

Formatter additions in `fmt`: `trials(from, to)` → "+1 – +2 trials" (`wh.sign.trials`), `silk(n)` → "20 silk" (`wh.sign.silk`), `conf(n)` → "65%" (reuses `wh.sign.pct`). `fmt.seconds` stays for the preview page but is not used by the live model.

## 8. Player state, mixed rooms, data and API

Owner clarification (08.11): Novice/Pro is also **player state**, and novices and pros must share one season fairly. This section keeps the split of §6: everything here is presentation, profile and API shape unless marked **[OWNER]**.

### 8.1 Player state vs. presentation mode

Two different things with two different lifetimes:

| | Player state (`profile`) | Presentation mode (`prefs.hud`) |
|---|---|---|
| Lifetime | persistent, per player (human or external agent) | per session, changeable at any moment |
| Fields | `seasonsPlayed`, `seasonsCompleted`, `bestMastery` (0–1, unassisted seasons only), `lastMastery`, `rank`, `maxLayer` (0–2), `beatsSeen[]`, `assistedShare` (delegated actions ÷ all actions, last season) | `'novice' \| 'pro'` |
| Who sets it | the engine's results after each season; never editable by the client | the player |
| Rank | **Apprentice** (0 completed seasons) → **Reader** (≥1 completed season) → **Master** (≥3 completed seasons and `bestMastery ≥ 0.75`); ranks never drop | — |

Relation: the default mode is derived from state once, at the start of a session — `pro` if `rank ≥ Reader` and `assistedShare < 0.25`, otherwise `novice`. The player overrides in either direction from Settings and from the first-run card; a Master dropping to Novice view loses nothing (rank and mastery are state, not mode). Layers (§2) open by state **or** by progress in the current season, whichever is further: a Reader starts at `maxLayer` from their profile, an Apprentice at L0. Unlocking in a season raises `maxLayer` in the profile when the season ends.

Mastery accrues only from manual decisions: a season in which `assistedShare > 0` counts toward `seasonsCompleted` but not toward `bestMastery`. So a novice can lean on Iris as long as they like and still progress to Reader; Master is earned by hand.

### 8.2 Mixed rooms — one season, one engine, same rules

Today's engine has one human seat (Iris) and five AI clans. Two kinds of mixed play exist on the roadmap (`spec.md` App. E): **helpers** — 2–4 people joining one Iris via QR (SHOULD, this week) — and **human clans** — people in the Salt/Ash/Moss/Amber/Frost seats (LATER). Everything below is written for both; where a point needs the human-clan seat it says so, because that seat needs engine work (**[OWNER]**, branch `api/agent-play`, new actions for non-Iris seats; no rule change, the AI policies simply stop driving a seat that a human or agent holds).

**Fairness.**
- Same actions, same costs, same information in both modes: Novice hides digits, it never hides facts a Pro would see (a Pro's "Place II (72%)" and a Novice's "likely" are the same confidence value).
- Delegation to Iris is **honest-but-average** and public: the autopilot is the repository's example agent client (`api/agent-play`), one file, one published policy, reading only `clientProjection()`. Rules of the policy: anchor only on published Gift readings with confidence ≥ 0.65, at most one anchor per trial; decline any word sale until that seller has one verified true word in the chronicle, then accept at ≤ 8 silk; never bid on shards; never forget, never speak the Key, never vote. Its target in the Monte Carlo (`docs/math/economy-report.md`) is the "honest cooperator" line (110.4 silk under v3), below any competent manual play, above passive. The simulation gets a `--strategy iris-autopilot` row so the claim stays measured, not asserted.
- Every delegated action is logged publicly in the room's event log with `assisted: true`; the engine does not know about it (`fx` data from the client), so parity is untouched.

**Visibility.** Each seat carries a public card: name, rank badge (Apprentice / Reader / Master), mode is **not** shown (view is private; rank is public). Apprentices get a small sprout badge next to the name label in the world and in dialogue; the badge is a request for patience, not a handicap. A Pro may **open a reading**: publish their current reading of a sign (`place/action/power/delay` + confidence) to the room; it appears on everyone's sign card as "Frost's reading: Gift of 20, Shell II" under the owner's own `plain` line. Open readings are speech, not state: the engine is untouched, the receiver still decides where to anchor.

**Interaction inside existing systems** (no new rule modes):
- *Passing knowledge* = the existing word offer (`offSell` → `acceptOffer`): a Pro clan can sell or give a word (price 0–12) to a novice seat; honesty is the sender's choice, the chronicle still catches lies (`checkBought`). This is the staging table's "passing knowledge" with a human sender; it needs the human-clan seat **[OWNER]**.
- *Trust graph*: trust between seats moves by the same rules (gift memory +15, decline −2, betrayal −40). A Pro who gives true words earns trust and, from trial 11, a higher chance of the novice's voluntary contribution; a novice who repays loans on time is a good partner regardless of skill.
- *Mediation* (`mediate`, 10 silk under v3, paid to the two clans): the natural "pro helps two novices" action; the mediator pays, the two reconciled seats receive.
- *Fragments into the Scroll*: a novice's fragment is exactly as necessary as a Master's — six pieces or nothing (beat 7). Nobody can take a fragment from another seat; a pact or escrow is the only way to influence it.
- *Vote*: one seat, one vote, four of six to accept. A Master's vote weighs the same as an Apprentice's; what a Master has is a better dictionary and so a better guess at the key sign.
- *Helpers in one Iris* (this week's scope): helpers share one seat; the room owner holds the actions, helpers hold a "propose" channel (a proposed anchor shows as a ghost pad until the owner confirms). Rank badges and open readings apply to helpers as well.

**Matchmaking and tournaments.** One board, no handicap: silk, outcome and contribution are the same numbers for everyone. The board has a rank column and filters by rank, and the weekly trophy is awarded **per rank bracket** (Apprentice, Reader, Master) from the same table — three trophies, one race. Rows from seasons with `assistedShare > 0` show an "assisted" mark and are excluded from the Master bracket only. Enrollment is unchanged (idempotent, synthetic); the result record gains `rank` and `assistedShare`. No separate novice queue: an Apprentice in a Master's room is the intended case, not an edge case.

### 8.3 Data and API

Where the state lives:

| Now (hackathon) | Later |
|---|---|
| client `profile` in `createSafeStorage` under `STORAGE_KEYS.profile`, next to `prefs`; written only from the finale result | server `Player` row keyed by account (human: NEAR account or guest id; agent: its sub-account), the same fields, updated by the room on `finish()`; the voluntary final-card NFT carries `rank`, `lastMastery`, `seasonsCompleted` as public metadata (no private data, no mode) |

Per-viewer projection additions (`clientProjection()` is the single source; the HUD orchestrator and the OpenAPI schema read the same object) — projection shape only, no rule change, but it is inside `engine.js` **[OWNER]**:

```js
// added to the projection, all public to every viewer
seats: [{ seat: 0..5, kind: 'human'|'agent'|'ai', name, rank: 'apprentice'|'reader'|'master',
          openReading?: { signId, place, action, power, delay, conf } }]
// private to the viewer
viewer: { seat, mode: 'novice'|'pro', unlocks: Unlocks, assisted: number }
```

The external agent is a player with the same state: its `profile` is stored server side under its account, its `rank` accrues by the same rule, its actions are always manual (`assistedShare = 0`), its mode field is `'pro'` because it has no HUD. The autopilot policy and the example agent client are literally the same module, so "Iris plays for a novice" and "an agent plays a seat" are one code path with two callers.

Build items added to §6a: profile store + rank derivation (S), rank badge + open-reading card line (M, needs the room channel), tournament board rank column + bracket trophies (S, local simulation). Added to §6b **[OWNER]**: projection `seats`/`viewer` fields (S); human-clan seat actions (L, LATER unless the owner pulls it in).

## 9. Novice hint system — full coverage

Owner requirement (08.11): novices get hints for the whole game, A to Z. The system below absorbs the teaching beats of §5 (they are the `teach` rows) and every tooltip of §4 (the `tip` rows), so there is one hint engine, one journal and one set of flags.

Hint types: **toast** (top-right, contextual, one at a time) · **tip** (HUD tooltip on hover/focus/long-press) · **journal** (Hints tab entry, always re-openable) · **iris** (dialogue strip line, Iris's voice) · **highlight** (one gold pulse of a HUD element or a world object; no text) · **block** (tutorial only: input waits for the step). Stop rules: **once** (seen → never again), **N×** (shown N times, then fades), **until done** (repeats until the player performs the action, with cooldown), **dismiss** (stays until closed). Pro column: default no; "lore" means the Lore entry still appears.

### 9.1 Coverage matrix (play order)

| # | Moment | Trigger | Type | Example text (≤ 90 chars) | Stops | Pro |
|---|---|---|---|---|---|---|
| 1 | Lobby | lobby mounted | highlight | pulse on "Enter" | once | no |
| 2 | Demo access | entitlement screen | block | "Guest demo: free, testnet, no real money. Nothing here spends NEAR." | once | yes |
| 3 | Tutorial cards 1–4 | each card | block | existing `tut.*` text | once | yes |
| 4 | Mode question | `tut.finish` | block | "How much on screen? Guide me (Novice) · Show me everything (Pro)" | once | yes |
| 5 | Constructor | constructor mounted | toast | "Cosmetic only: the hologram never changes the odds. Randomize is fine." | once | no |
| 6 | First contact | island loaded, Iris on the balcony | iris | "The plaza is below us. The Shells hang beyond the camps. Walk with me." | once | no |
| 7 | Moving | 6 s with no movement input | toast | "WASD or click to walk. Scroll to zoom; drag to turn." | 3× | no |
| 8 | Camera | first zoom-in below 10 m | toast | "Zooming in puts you behind Iris. Zoom out for the whole island." | once | no |
| 9 | Interact | first object within prompt range | highlight + prompt | "E · Inspect the Scroll Table" | until done | prompt only |
| 10 | Visit a Shell | first sign published (trial 1–2) | iris + highlight on the Shell | "A sign woke on Shell II. Let us go and read it." | until done | no |
| 11 | Read a sign | inside the Shell, sign on the glass | toast | "Four slots, read clockwise from the dots. I read it as: Gift of 20, trial 3." | until done | no |
| 12 | Sign card | first open of V | tip on each stat / `plain` line | "Likely = I am 50–80% sure of every slot." | once per term | tips: yes |
| 13 | Anchor bet | a published Gift reading exists, no anchor yet | toast + highlight on the anchor pad | "Anchor 10 silk on Shell II for trial 3. If the Gift lands, we share it." | until done | no |
| 14 | Anchor confirm | confirm dialogue | iris | "10 silk goes to the pad. We get it back unless a Storm comes." | once | no |
| 15 | Verification | `fx event` at trial 3 | toast | "It came true, and the seal matches: this future was written before we arrived." | once | lore |
| 16 | Wrong Shell | first anchor returned unpaid | toast | "The Gift fell elsewhere; the stake came back. Check the Place slot next time." | 2× | no |
| 17 | Guest hint | L1 open, a word < 65% | toast | "Unsure of a word? Ask the Guests: 5 silk, one honest yes or no." | until done | no |
| 18 | Ask result | first `fx ask` | iris | "They answered. The word is pinned; no one can sell us a lie about it." | once | no |
| 19 | Clan offers | first offer (trial 2) | iris + reply "Why?" | "Salt sells a word for 7. I would decline: nothing Salt said has been checked yet." | until L1 | no |
| 20 | Overrule | first manual answer to an offer | toast | "Your call now. Accepted words are checked against every new sign." | once | no |
| 21 | Loan | Moss's loan (trial 3) | iris | "Moss asks 15 silk, returns 25 on trial 7. Moss has kept every promise so far." | once | no |
| 22 | Price of memory | trial 4 or an unpublished sign is opened | toast | "I could see the next sign now, if I forget something forever. You choose what." | once | lore |
| 23 | Memory list | first open of I | tip per memory kind | "Forgetting a debt erases it; whoever buys the shard holds the claim." | once per kind | tips: yes |
| 24 | Forget confirm | forget dialogue | block (consent, both modes) | "This memory is gone for good and goes to auction. Forget it?" | always | yes |
| 25 | Shards | first `fx memory_burned` or first bid | toast | "Someone is bidding on what I forgot. They will remember it instead of me." | once | lore |
| 26 | Silk | silk < 20 for the first time | toast | "Silk is low. Every trial pays +3; a shared Gift pays more." | 2× | no |
| 27 | Dictionary | words known reaches 4, 8, 12 | toast | "8 words known. That is enough to read Ash's Key when the time comes." | once per step | no |
| 28 | Reading rule | first lie exposed (`revealLie`) | toast | "The chronicle caught a lie. The seller's trust fell; the word is unpinned." | once | lore |
| 29 | Trust | first trust pill shown (L1) | tip | "Wary, even, close: how this clan feels about Iris. Low trust cuts the link." | once | tips: yes |
| 30 | Mend / mediate | a broken link exists and silk ≥ 10 | toast | "Ash cut the link. 10 silk and a word of peace can restore it." | 2× | no |
| 31 | Fragments / Scroll | trial 5 or Scroll Table inspected | toast | "Six clans, six fragments. The message reads only when all six lie in the Scroll." | once | lore |
| 32 | Pact / escrow | first pact or escrow offer | iris | "Ash offers a pact: both fragments in by trial 14. Breaking it costs trust." | once | no |
| 33 | Fragment prize | first fragment goes dark | toast | "A fragment went dark: its holder took the prize. Fewer than six never read." | once | lore |
| 34 | Tension | tension ≥ 40 first time | toast + sky highlight | "The sky darkens: tension 40. At 100 the Shells leave and everyone loses." | once | lore |
| 35 | Crisis 13 | `fx crisis` | toast + quest banner | "Ash read the sign as a weapon and cut the bridges. Trust is the only rope left." | once | lore |
| 36 | Ash's Key | key vision available | toast | "I can see Ash's phrase now, for one heavy memory. Speak it and Ash returns." | until done | no |
| 37 | Key spoken | `fx key_spoken` | iris | "The hash matched. Ash heard its own words and came back." | once | lore |
| 38 | Vote | phase `vote` | toast | "Gift or weapon. Four of six must agree; the Scroll decides how well we read." | once | lore |
| 39 | Ending | `fx end` | iris | outcome line per result, e.g. "A gift. Everyone who gave a fragment shares it." | once | yes |
| 40 | Verification / proofs | finale card | tip on "Verified" | "Every revealed sign matched the root sealed before trial 1. Tap to see the hashes." | once | tips: yes |
| 41 | Heir | outcome `gift` | block (consent) | "Forget everything for an Heir, or keep the memory? The Heir starts clean." | always | yes |
| 42 | NFT card | final card shown | toast | "This card is Iris's biography. Minting is optional and testnet only." | once | yes |

42 rows; rows 2–4, 24 and 41 are the only blocking steps and exist in both modes because they are consents, not hints.

### 9.2 Rules of the system

1. **One toast at a time.** `hints.active` holds the visible toast; `hints.queue` is sorted by priority (block 0 > until-done 1 > once 2 > N× 3), then by trigger time. A new hint with a higher priority replaces the active one, which returns to the queue head.
2. **Cooldown.** 6 s between toasts, 20 s for the same hint id; a toast lives 9 s, or 14 s when its text exceeds 60 characters; never more than 3 toasts per trial.
3. **Never block input** outside the tutorial and the two consents (24, 41). Toasts, tips, highlights and Iris lines are `pointer-events: none` except their close button.
4. **"Why?"** Every Iris-delegated action produces a journal entry with its `wh.auto.*` reason (§3), and the dialogue strip offers a "Why?" reply (hotkey S) for 9 s that opens that entry.
5. **Stuck detector.** No meaningful action (engine action, offer answer, panel open, movement ≥ 2 m) for 25 s in L0, 45 s in L1–L2 → the lowest-numbered unfinished *until done* hint fires again; after two repeats it switches to a highlight only.
6. **Journal.** Every hint ever shown is appended to `hints.journal` (the Hints tab) with its trial number; tapping an entry re-shows it as a toast; the tab's filter shows "unfinished" first.
7. **i18n.** Hint ids are stable keys: `wh.hint.<id>.title` / `.body`; tips are `wh.tip.<term>`; the matrix text above is the `en` content, ru: strings capped at 100 characters.
8. **Reduced motion.** Highlights become a static gold border for 2 s; toasts appear without translateY; nothing pulses.
9. **Voice.** Iris speaks in first person plural ("we", "us"); the Guests never speak; system facts (prices, hashes) are stated without a speaker. No hint ever says "click here" when a diegetic line can carry it.
10. **Mute.** Settings → "Hints: all / essential / off". "Essential" keeps *until done* and consents only.

### 9.3 Link to player state

- `profile.hints[id] = { seen: n, done: boolean, mastered: boolean }`. `seen` counts shows; `done` is set by the matching action; `mastered` when the player performed the action 3 times without the hint firing first. Mastered hints never fire again, in any season.
- A Pro joining a mixed room sees no toasts, highlights or Iris coaching; tips stay available on hover (they are reference, not coaching); the consents stay.
- A returning novice resumes: the queue is rebuilt from `profile.hints` and the current layer at session start, so finished hints stay finished and the next *until done* hint fires on first idle.
- The external agent has `profile.hints = {}` and `mode = 'pro'`: no hints are produced for it, nothing in the API changes.

### 9.4 Mapping to the HUD

| Hint type | HUD component (`docs/ui-world-hud.md`) | Model field |
|---|---|---|
| toast | 6.3 hint toast (desktop) / mobile: the same toast under the top bar | `hints.active` |
| journal | 6.6 Hints tab | `hints.journal` (replaces `journal.hints`) |
| iris | 6.8 dialogue strip, speaker `iris`, optional "Why?" reply | `dialogue` with `coach: true` |
| highlight | any component or world object by `target` | `hints.active.target` |
| tip | sign-card stats, trial-card rows, pills, memory rows: `data-tip="<term>"` | `tooltips` |
| block | onboarding screens and consent dialogues (outside `.wh-root`) | not in the HUD model |
| quest step | 6.2 quest banner shows the current *until done* hint as the quest in L0 | `quests[0].recommended` |

```js
/**
 * @typedef {Object} Hint
 * @property {string} id              matrix row id, e.g. 'anchor-first'
 * @property {'toast'|'iris'|'highlight'} type
 * @property {0|1|2|3} priority
 * @property {TextRef} title  @property {TextRef} body
 * @property {string} [target]        HUD element id ('wh-anchor-pad', 'wh-signs-btn') or world object id ('shell-2')
 * @property {number} trial           when it fired
 * @property {'once'|'untilDone'|'repeat'} stop   @property {number} shown
 * @property {boolean} done           untilDone: the matching action happened
 * @property {TextRef} [why]          delegated-decision reason (wh.auto.*)
 */
// WorldHudModel: hints: { active: Hint|null, queue: Hint[], journal: Hint[], muted: 'all'|'essential'|'off' }
//                tooltips: Record<string, TextRef>
```

### 9.5 Effort

| Part | Effort | Notes |
|---|---|---|
| Hint engine: queue, priority, cooldown, stuck detector, profile flags, journal | M | one module `ui/hints.js`, pure functions over fx events + state, Node tests for ordering and cooldown |
| Toast/iris/highlight rendering in the three HUD packages | S | the toast exists; add `target` highlight and the "Why?" reply |
| Content: 42 rows × (title + body) + 20 tips + 8 reasons, both locales | M | ~140 strings per locale |
| Settings mute row, Hints tab filter | S | |
| **Total** | **L** (about two working days with content) | |

**Demo-critical subset** (the judges' 3-minute path; build these first, S+S): rows 2, 6, 10, 11, 13, 14, 15 and the tips of row 12. Seven toasts/lines and four tooltips carry the whole Read → Anchor → Verify loop. Rows 7 and 9 are next (movement and interact), then 17–22 for the L1 hand-off.

## 10. Owner decisions in this proposal

1. **[OWNER]** Rename the anchor pill "Tiers" → "Trials" and replace the mockup's four sign stats with engine-unit rows (Place / Action / Power / Delay in trials). Alternative: keep the mockup labels and map them loosely (stability = confidence, anchor strength = share estimate, power range = power, delay in trials instead of seconds).
2. **[OWNER]** Default mode from player state (§8.1: `pro` for Readers with little assistance, otherwise `novice`) with an override on the tutorial's last card and in Settings. Alternative: always `novice` by default for the hackathon build.
3. **[OWNER]** Approve B1 and/or B3 as a new rule mode / fx addition, or ship 6a only.
4. **[OWNER]** Mixed-room scope for the freeze: helpers in one Iris only (badge, open readings, propose channel), or also pull the human-clan seat into this week.
