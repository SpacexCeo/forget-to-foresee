# Handoff: world HUD and clarity layers (session of 08.11.2026)

Branch: `claude/jolly-gates-lhgcaw`, merged on 08.11 into `claude/happy-clarke-139pi1` together with `integration/slice-frkc4d` and `codex/premium-ui` (see `docs/decisions.md`).
Read first, as always: `CLAUDE.md`, `docs/decisions.md` (rows dated 08.11), `docs/spec.md`.

## 1. What this session delivered

| Piece | Where | State |
|---|---|---|
| World HUD design spec (tokens sampled from the owner's two mockups, per-component boxes, fonts, mount contract, parity procedure) | `docs/ui-world-hud.md` | done |
| Design tokens and primitives (`--wh-*`, `.wh-panel`, `.wh-pill`, `.wh-chip`, `.wh-kbd`, …) | `game/src/ui/world-hud/tokens.css` | done |
| Fonts: Libre Caslon Text (Latin serif), Old Standard TT (Cyrillic only, size-adjusted to Caslon's box), Source Sans 3 (body copy) — all OFL via `@fontsource`, no CDN | `world-hud/fonts.js` (bundled URLs) + `tokens.css` (dev `@font-face`) — keep both in sync | done |
| Icons, ring sigil, key art (inline SVG) | `world-hud/icons.js` | done |
| View model + `DEMO_MODEL` (mockup text word for word, EN + RU via `wh.*` / `wh.demo.*` keys) | `world-hud/model.js`, `src/locales/en.js`, `ru.js` | done |
| P1 Status & Quest: trial card, quest banner, hint toast, mobile top bar, quest card with dots, mobile trial card | `world-hud/status.js/.css`, `tests/wh-status.test.mjs` | done, 2 rounds |
| P2 Signs & Visions: desktop panel, mobile bottom sheet, filter chips, sign cards, anchor pill, V/Esc, focus return, Tab trap | `world-hud/signs.js/.css`, `tests/wh-signs.test.mjs` | done, 2 rounds |
| P3 Log/Hints/Lore tabs, interaction prompt, dialogue + reply, hotkey bar, mobile tiles, mobile prompt pill, mobile dialogue bar | `world-hud/log.*`, `actions.*`, `tests/wh-log.test.mjs`, `tests/wh-actions.test.mjs`, `tests/lib/mini-dom.mjs` | done, 2 rounds |
| Composition: `mountWorldHud(root, {model, ctx, onAction, layout?})`, layout from `matchMedia('(max-width: 700px)')` | `world-hud/index.js` | done |
| Dev preview page | `game/hud-preview.html` (`?layout=desktop|mobile&lang=en|ru&sheet=1&tab=hints&ref=1&dim=.5`) | done |
| Parity script (renders at the mockup's pixel size, writes ref/hud/overlay/diff/side PNGs, prints boxes + meanDiff) | `game/scripts/wh-compare.mjs`, `npm run wh:compare -- --layout desktop` | done |
| Design proposal: clarity layers, Novice/Pro, player state, mixed rooms, A-to-Z novice hints | `docs/design/clarity-layers.md` | proposal; owner decisions recorded |
| QA review with the impeccable playbooks | `docs/ui-world-hud-qa.md` | see §4 — may be partial |

`npm test` in `game/`: **198 / 198 green** (162 before + 36 HUD tests).

## 2. How to run and check

```bash
cd game
npm install
npm run dev            # then open http://localhost:5173/hud-preview.html
npm test
```

Parity check against the mockups (dev only):

1. Put the owner's mockups at `game/.scratch/ref/desktop.png` (1811×868) and `game/.scratch/ref/mobile.png` (1219×1290, two phones). `.scratch/` is git-ignored — **the mockups are never committed**.
2. `node scripts/wh-compare.mjs --layout desktop` · `--layout mobile` · `--layout mobile --sheet` · add `--lang ru`.
3. Look at `game/.scratch/cmp/side-*.png` (mockup | HUD) and `overlay-*.png`. meanDiff is inflated where the mockup has bright sky behind translucent panels (top bar, toast); compare visually.

Scale rule: 1 u = 1 px at 1811 wide, `--wh-px: clamp(0.6px, 100vw/1811, 1.35px)`; compact range 701–1086 px (toast hidden, Signs panel starts closed, banner narrows); mobile ≤ 700 px uses CSS px at 390 wide.

## 3. Last measured parity (meanDiff, 0–255, lower is closer)

| Component | Desktop | Mobile |
|---|---|---|
| Trial card | 19.8 | 18.2 |
| Quest banner / card | 20.2 | 23.5 |
| Hint toast | 31.9 (sky) | — |
| Top bar | — | 45.2 (sky) |
| Signs panel / sheet | 18.6 | 20.7 |
| Log | 23.3 | — |
| Prompt | 33.5 | 23.7 |
| Dialogue | 26.2 | 19.1 |
| Hotkey bar | 19.2 | — |
| Tiles | — | 14.3 |

Known visible differences: "MAIN QUEST" tag ~6 u wider; "Trial 13 of 17" ~5 u wider; key art angle approximate; the braided left edge of the Signs panel is missing (shared corner flourish used instead); mobile type pill ~6 px wide (`--wh-fs-tab` mobile wants ~11 px); log rows miss by −10…+6 u (the mockup itself is inconsistent); "Anchor strength:" / "Power range:" labels up to 8 px narrow.

Deliberate deviations from the spec, because measurement of the mockup said otherwise (implementers documented each in their files): smaller prompt (246×44), 8-cell mobile progress bar, 6 px notification dot, pale parchment pill/kbd borders, almost invisible inner hairlines, several body roles in sans instead of serif, dialogue moves up one row when it would hit the hotbar (RU, narrow widths).

## 4. Open work, in priority order

1. **Apply the QA fix list** from `docs/ui-world-hud-qa.md` (top-15, each item tagged P1/P2/P3/shared). If the file is missing or marked partial, re-run the review (brief: compare with the mockups, impeccable `critique`/`audit`/`polish` playbooks, "the brief wins").
2. **Fold local pieces into shared files**: icons defined locally (`st-info-i`, `st-menu` in `status.js`; `signRing()`, `CHEVRON` in `signs.js`; `wh-a-connector`, `wh-a-bubble` in `actions.js`) → `icons.js`; decide whether `--wh-fs-subtitle` becomes a sans role at 13.5 or is dropped (P2 uses body sans); mobile `--wh-fs-tab` ≈ 11 px.
3. **Sign cards with engine data** (owner decision 08.11): keep the mockup look, rows become Place / Action / Power / Delay in trials, anchor pill "Trials" instead of "Tiers". `DEMO_MODEL` keeps the mockup text for the preview. Needs new `wh.sign.*` keys in both locales and a builder from engine state.
4. **Wire the HUD into the 3D client**: `game/src/main.js` / `index.html` still show the greybox overlay (`#objective`, `#help`, `#prompt`). Build the view model from engine state (`createEngineStore` in `src/ui/hud.js` is the pattern), forward `onAction`, drain `S.fx` once (see `docs/ui.md`). The old `src/ui/hud.js` and `styles.css` were not touched.
5. **Novice mode + A-to-Z hints**, interface only (owner decisions: default is always Novice for the hackathon; no engine rule changes before the freeze; mixed play = helpers around one Iris). Build order from `docs/design/clarity-layers.md` §6a: items 1–4, 6 and 8 are the judge demo (prefs.hud + first-run question, `sign.plain` readings, layer gating, Verified ✓ badge, teaching beats, `?demo=judge` seed); cut order 9 → 7 → 5. View-model delta in §7, hint matrix in §9.
6. README: add the world HUD to the real/mock table only once it runs in the game page, not just in the preview.

Deferred by the owner: engine changes B1 (first sign on trial 1) and B3 (`fx('publish')`), human clan seats in mixed rooms.

## 5. Rules that keep biting

- Everything in the repo is English, including comments, notes, TODOs and test names; Russian only in `ru.js` and in tests that check the RU locale.
- Package ownership: `tokens.css`, `icons.js`, `model.js`, locales are shared; each package edits only its own files. New `wh.*` keys must exist in **both** locales — `tests/ui-i18n.test.mjs` scans `wh.*` literals in `src/ui/**`.
- Every length in package CSS is `calc(N * var(--wh-px))`; font sizes come from `--wh-fs-*` tokens; sans roles use `.wh-body`, serif titles `.wh-heavy` / `.wh-heavy-sm`.
- Hotkey letters live in `hotkey` fields, never `key` (`key` is a TextRef). Keys match `event.code`, so a Russian keyboard layout works. `V` belongs to P2; P3 forwards it.
- The impeccable skill is installed only as markdown playbooks in `~/.claude/skills/impeccable` (outside the repo; Apache-2.0). Its CLI (`npx impeccable`) was blocked by the session's safety policy, so the deterministic slop detector did not run.
