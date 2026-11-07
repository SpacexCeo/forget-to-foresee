# UI shell: lobby, onboarding, HUD, localization

Owner folders: `game/src/ui/` and `game/src/locales/`. The 3D scene
(`game/src/render/`, `game/src/scenes/`, `game/index.html`, `game/src/main.js`)
belongs to the scene owner; this document lists the few lines it needs.

## Run it standalone

```bash
cd game
npm install
npm run dev
```

Open `http://localhost:5173/ui-preview.html` (Vite prints the port).

| URL | What you see |
|---|---|
| `/ui-preview.html` | Lobby → ENTER THE WORLD → demo access → tutorial → hologram constructor → first contact → HUD over a local headless season |
| `/ui-preview.html?view=world` | HUD only: press "Auto-play one tick" / "End tick" and switch EN/RU mid-season |
| `/ui-preview.html?view=constructor` | Hologram constructor only |
| `/ui-preview.html?view=tournament` | Weekly tournament card only |

The preview uses the real engine (`src/game/engine.js`, read only) in the
browser and is labeled "local demo". There is no 3D scene on this page.

The lobby background (`src/ui/background.js`) evokes the owner's target concept: a
cloud sea drifting below, four nacre ammonite Shells hovering (IV cracked open), a
faint archipelago with a gold-ringed plaza, soft breathing light. It is canvas 2D,
uses no image assets, and is replaced by the 3D scene later.

## Mount API (`game/src/ui/index.js`)

| Function | Purpose |
|---|---|
| `mountShell(root, {onFirstContact})` | Lobby + onboarding in the required order. Calls `onFirstContact({guestId, entitlement, recipe, recipeHash, locale})`. |
| `mountLobby(root, {onEnter})` | Lobby only. |
| `mountOnboarding(root, {onFirstContact, onExit})` | Onboarding only (entitlement → tutorial → customization → first contact). |
| `mountHud(root, store)` | HUD overlay. `store = {getState: () => S, subscribe?(fn)}`. Returns `{update(), pushFx(fx), say(line), showRejection(reason), destroy()}`. |
| `createEngineStore(E)` | Minimal store over the engine module: `getState`, `subscribe`, `notify`, `act(name, ...args)`, `takeFx`. |
| `mountConstructor(root)`, `mountTournamentCard(root, ctx)` | Individual panels. |
| `getUiContext()` | Shared `{storage, prefs, i18n, guestId, tournament}`; pass `{ctx}` to share it between mounts. |

All mounts add `src/ui/styles.css` themselves (`ensureStyles()`), create no
globals, and return `destroy()`.

## Integrating into main.js (scene owner)

```html
<!-- index.html: an overlay above the canvas -->
<div id="ui" style="position:fixed;inset:0;z-index:10"></div>
```

```js
// main.js
import * as E from './game/engine.js';
import { mountShell, mountHud, createEngineStore } from './ui/index.js';

const uiRoot = document.getElementById('ui');
const shell = mountShell(uiRoot, {
  onFirstContact({ recipe }) {
    shell.destroy();                       // lobby/onboarding leave the screen
    uiRoot.style.pointerEvents = 'none';   // the HUD re-enables input on its panels only
    startWorld({ hologram: recipe });      // cosmetic only; never pass it to the engine
    E.newSeason(seed, { rules: 'v2' });
    E.startGame('');
    const store = createEngineStore(E);
    const hud = mountHud(uiRoot, store, { ctx: shell.ctx });
    // After every engine action / end of tick: drain S.fx once and fan it out.
    onEngineStep(() => { const fx = E.takeFx(); scenes.consume(fx); hud.pushFx(fx); store.notify(); });
  },
});
```

Rules for the integration:
- `S.fx` is drained **once** by main.js (`E.takeFx()`) and given to both the
  3D layer and `hud.pushFx`. The HUD never calls `takeFx` itself.
- Engine action results `{ok: false, reason}` can be shown with
  `hud.showRejection(reason)` (localized via `reason.*`).
- Quality tier and reduced motion are presentation only: `shell.ctx.prefs.tier()`
  and `shell.ctx.prefs.reducedMotion()`; `prefs.subscribe(fn)` notifies changes.
  `<html data-motion data-tier>` mirror them for CSS.
- The language can change at any time (`ctx.i18n.setLocale('ru')`); subscribe with
  `ctx.i18n.subscribe(fn)` to re-render 3D labels. It never starts a new season.

## Localization

- `src/ui/i18n/icu.js`: dependency-free ICU MessageFormat subset (`{x}`,
  `number`, `plural` with `=n`/`#`, `select`, `selectordinal`, ICU apostrophes).
  Plural categories and numbers come from `Intl`.
- `src/locales/en.js` (base) and `src/locales/ru.js`. Keys mirror each other
  exactly (tested). A missing key renders `…` and is reported, never the raw key.
- `src/ui/i18n/engine-adapter.js`: maps every Russian engine string to
  `{key, args}` with ID arguments and renders it in the active locale; also
  agent lines from `S.fx` (speaker + key + args) for subtitles. Hashes and secret
  phrases are shown verbatim. Migration plan: `docs/i18n-migration.md`.
- In the DOM, translatable nodes carry `data-i18n` (+ args) and re-render in place
  on a locale change, so a switch keeps all state, including mid-season.

## Hologram recipe

`{v, shape, components[], particles{count,size,drift}, layers[], palette{primary,secondary,accent}, noise{amount,scale}, light{intensity,warmth}, trails{length,fade}, gesture}`

- Enums are whitelisted; components/layers are kept unique, in whitelist
  order, capped (4 components, 3 layers); numbers are clamped and quantized;
  colours are `#rrggbb`.
- `recipeHash = sha256("ftf:recipe:v1|" + canonicalJson(recipe))` with keys
  sorted at every level.
- The low tier is `renderProfile(recipe, 'low')`: fewer particles, no bloom,
  chromatic shift, grain or trails at draw time. The recipe and its hash never
  change. Saved recipes are re-hashed on load and rejected on mismatch.

## Weekly tournament (simulation)

Synthetic schedule per ISO week (UTC): enrollment Monday 00:00 → Saturday 18:00,
one accelerated season until Saturday 20:00, then results. Enrollment is
idempotent per (week, guest), survives a reload ("coordinator restart"), and is
stored on the device only. Results stay `null` before the results barrier and
contain only rank, a label and an outcome. No money, no prizes, no entry fee.

## Accessibility

- Contrast: every text/background token pair ≥ 4.5:1 (`tests/ui-a11y.test.mjs`).
- Keyboard: native buttons in DOM order, arrow keys inside the main menu, a skip
  link, modal dialogs with Esc and focus return, visible 3px amber focus ring.
- Reduced motion: follows the system or the setting; canvases draw a single still
  frame and schedule nothing; CSS transitions are off.
- Subtitles for agent lines (`aria-live="polite"`), three sizes, can be hidden.
- Colour-independent tells: glyph + screen-reader label for every chronicle class;
  tension has a number, a level word, a glyph and a pattern.

## Known gaps

- No 3D integration yet (needs the lines above in main.js).
- The tournament has no server, coordinator or fixture season; the card and
  enrollment are local UI state labeled "simulation".
- CLAN and MEMORIES open "not in this build" panels.
- The hologram preview is canvas 2D; the in-world hologram is up to the scene owner.
- Russian agent names are not declined (same as the prototype).
