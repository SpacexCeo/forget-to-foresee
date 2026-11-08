# Task B report: full UA, IT and 中文 translation

Branch `claude/i18n-uk-it-zh` (based on the worker-tasks branch, `cc6d9e2`). Commits: one per language, one for the
test, one for docs and phrasing fixes. No pull request; the lead merges.

## Done

- **Three full locales** for the game strings (`game/src/locales/uk.js`, `it.js`, `zh.js`: 620 keys each) and
  for the play layer (`game/src/play/locales/uk.js`, `it.js`, `zh.js`: 180 keys each, new files). Every English key
  is an own property; the `...en` spread stays only as a safety fallback for keys added to English later.
- **Placeholders and ICU**: every message parses with the project's ICU subset and uses exactly the English
  placeholder set. Plural categories: uk `one/few/many/other` (checked: 1 учасник, 2 учасники, 5 учасників,
  21 учасник), it `one/other`, zh `other` only, with exact `=0`/`=1` branches where English distinguishes `one`
  (`wh.sign.tiers`, `insp.glass`). `Intl.PluralRules` in Node 22 and Chromium returns these categories.
- **Terminology** (one rendering per language, recorded in `docs/decisions.md`):
  UA Ірис, Сіль, Попіл, Мох, Бурштин, Іній; Гості; Мушля; шовк; тик; випробування (HUD trial); Сувій.
  IT Iris, Sale, Cenere, Muschio, Ambra, Brina; gli Ospiti; Conchiglia; seta; tick; prova; la Pergamena.
  ZH 伊里斯, 盐, 灰, 苔, 琥珀, 霜; 来客; 贝壳; 丝; 回合; 试炼; 卷轴.
  Hashes, proof bytes, secret phrases and the title "Forget to Foresee" stay verbatim (spec §9).
- **HUD widths**: `wh.*` labels are as short as English or shorter (UA "Завершити" for "End trial", "Випроб. 3",
  "В1" journal tags; ZH two to four characters per label). Sign lines follow the Russian comma-list pattern
  ("{action}, сила {power}, {place}") so inserted names never need a grammatical case.
- **Test** `game/tests/ui-i18n-locales.test.mjs` (9 tests, listed in the `test` script): keys, placeholders,
  parse, no English copies (allow list of words spelled the same: Demo, Clan, Auto, Tutorial, Palette, Menu…),
  plural rendering, verbatim placeholders, and every key rendering through the play context with no missing hit.
- **Docs**: HANDOFF Languages row, a `docs/decisions.md` row (end of the §4 table), request 3 in
  `docs/collab-requests.md` (CJK font fallback for Codex).

## Files outside the strict Task B list (minimal, necessary)

- `game/src/play/i18n.js`: three import lines and the `PLAY_MESSAGES` map now include uk/it/zh (the play context
  loads per-locale files; without this the play strings would stay English). One comment updated.
- `game/tests/ui-i18n.test.mjs` (Codex-owned): one assertion asserted that uk/it/zh *fall back to English* for
  `settings.note`; it now asserts the key renders. The stronger check lives in the new test.
- `game/src/locales/index.js`: one stale comment ("cover the lobby and core labels") updated.
- `game/package.json`: the new test added to the `test` script (allowed by the task).

## Not done / open

- **CJK font fallback** in `--wh-font`, `--wh-font-body` (`world-hud/tokens.css`) and `--ftf-font` (`styles.css`):
  Codex-owned, requested in `docs/collab-requests.md` 3. Today Chinese glyphs in the HUD and panels render in the
  browser's default CJK font (readable, visible in the screenshots below; only the lobby has a CJK stack).
- **Native-speaker proofreading** of the three languages. Machine-free but single-author translations; the Russian
  file was the tone reference. Known compromise shared with Russian: chronicle lines use a masculine past tense
  with the clan name inserted (Сіль is feminine in Ukrainian).
- `game/src/main.js` line 7 still documents `?lang=en|ru`; all five codes work. Task A owns that file.

## How it was checked

- `cd game && npm test`: 269/269 (260 before the new test file; 236/236 with 4 files failing only because
  `node_modules` was absent in the container before `npm ci`). `npm run build`: green.
- Headless Chromium (Playwright) at 1280×800 and 390×844 (touch) for uk, it, zh: lobby, settings dialog,
  onboarding (access card), `/?play=direct&demo=judge` world HUD, Signs and Visions panel (V), Memories (M),
  Help (H), `hud-preview.html?live=1&ticks=4&mode=pro` desktop and mobile. 45 screenshots reviewed; no console
  errors, no `[i18n] missing` warnings. The only elements wider than their box are `sr-only` labels (by design)
  and the collapsed mobile dialogue strip, which is a single-line ellipsis in English too.
- Ukrainian letters і ї є ґ render in the HUD serif (the `WH Cyrillic` unicode-range covers U+0400–045F and
  U+0490–0491) and in Source Sans 3 body copy.
