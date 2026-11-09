# i18n: engine text migration plan

Status: **step 5 done (09.11).** `prototype-2d/` and `engine.js` write English prose (identical bytes in both,
fixtures regenerated), the adapter parses the English text, and the English locale reproduces it exactly. Only
Ash's phrases stay in their original form: they are hash preimages committed on NEAR testnet for the judge
season. Steps 1-4 and 6 (structured events instead of parsing) remain open. The sections below describe the
state before step 5.

## Where we are

- `game/src/game/engine.js` is frozen for parity with `prototype-2d/` and owned by
  its owner. It writes Russian text into:
  - `S.feed[].text`: the chronicle (about 60 templates);
  - `S.mem[].text` and `S.forgot[].text`: memory texts;
  - `S.shards[].title`, `S.shards[].result`, `S.forgot[].fate`;
  - `S.pins[*].src` (Guests, Frost, shard);
  - `offerText()` / `effectText()` (Russian HTML helpers, not stored in state).
- `game/src/ui/i18n/engine-adapter.js` holds a verbatim copy of each template with
  typed placeholders (`{who:agent}`, `{shell:shell}`, `{title:title}`...). It parses
  an engine string into a **semantic event** `{key, args}` whose args are IDs:
  `{$agent: 2}`, `{$shell: 1}`, `{$form: 0}`, `{$slot: 3}`, `{$meaning: [1, 0]}`,
  `{$agents: [1, 4]}`, nested `{$msg: event}`, plain numbers, verbatim strings
  (hashes and secret phrases are never translated, spec §9).
- `renderEvent(event, i18n)` resolves the IDs in the active locale and formats the
  ICU message. Offers and memory effects are rendered from structured fields
  (`offerEvent`, `effectEvent`); `S.fx` entries become agent lines (`fxToLine`).
- `game/tests/ui-i18n.test.mjs` plays 120 scripted seasons (both rule sets) and
  checks that every chronicle line, memory, shard title, result, fate and pin source
  maps to a key, that English output has no Cyrillic except verbatim phrases, and
  that the Russian locale reproduces the engine text exactly (three keys are
  deliberate improvements: list formatting and plural agreement).

If an engine string changes or a new one appears, the adapter test fails and the
UI shows `log.unknown` instead of raw Russian or a raw key.

## Why parity constrains the migration

`tests/lib/normalize.mjs` drops `feed`, `fx`, `ui`, `version`, `rulesVersion` and
hashes **everything else**. So:

| Field | In the parity hash? | Consequence |
|---|---|---|
| `S.feed` | no | free to change in any rule set |
| `S.fx` | no | free to change |
| `S.mem[].text`, `S.forgot[].text/fate` | **yes** | changing the text breaks all 60 fixtures |
| `S.shards[].title/result` | **yes** | same |
| `S.pins[*].src` | **yes** | same |
| `S.pepelKey.phrase`, `S.pKey.phrase` | **yes** | and the phrase is a hash preimage: never translate |

## Plan (the engine.js owner executes it; one commit per step)

1. **Add, do not replace.** In every rule set, `log(text, cls)` gains an optional
   third argument `ev = {key, args}` and stores it as `S.feed[i].ev`. Args use the
   same tagged-ID format as the adapter. The feed is outside the hash, so parity
   holds. The client prefers `entry.ev` and falls back to `parseLogText(entry.text)`.
2. **Structured twins for hashed text.** Memories, shards, forgot entries and pins
   get a sibling field `msg = {key, args}` (`titleMsg`, `resultMsg`, `fateMsg`,
   `srcId`). Add these names to `DROP` in `tests/lib/normalize.mjs` (presentation
   only) or strip them in `canon()`. The Russian text fields stay untouched under
   `baseline-2d-1`, so the 60 recorded fixtures stay valid without regeneration.
3. **v2 stops writing prose.** Under `v2`/`v2-crypto` the Russian `text`/`title`
   fields may become the English base string or go away; `tests/v2.test.mjs`
   compares gameplay views, which already ignore salts; extend its `gameplay()`
   to ignore presentation fields too. `baseline-2d-1` keeps the prototype bytes.
4. **Secret phrases.** Ash's phrases and the default owner phrase are hash
   preimages. Translating them would break commitments. For v2 add an English
   phrase list of the same length behind the same RNG draw, so the RNG sequence
   stays identical; the client always shows the phrase verbatim.
5. **Prototype translation (optional, last).** If `prototype-2d/` is translated
   to English, regenerate fixtures with `npm run fixtures` in the same commit and
   update the adapter templates; parity tests prove nothing else moved.
6. **Retire the parser.** When every rule set emits `ev`/`msg`, drop the template
   tables from `engine-adapter.js`; `renderEvent`, `fxToLine` and the locale files
   stay as they are. The adapter test then asserts that every `ev.key` exists in
   both locales.

## Keys

Engine keys live under `log.*`, `mem.*`, `shardTitle.*`, `shardResult.*`, `fate.*`,
`pinSource.*`, `offer.*`, `effect.*`, `line.*`, `reason.*` (action rejection reasons
returned as `{ok:false, reason}`), `outcome.*`. World vocabulary: `agent.*`,
`shell.*`, `slot.*`, `form.*`, `meaning.<slot>.<value>`.
