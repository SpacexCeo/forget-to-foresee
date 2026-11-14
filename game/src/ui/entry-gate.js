// The entry gate (owner 14.11, minimalism): when everything is loaded the loading screen shows ONE button, "Enter the
// world". Pressing it opens the language choice and then the account panel (play/account-panel.js: Play as guest, or
// sign in / create an account) over the same screen, nothing in between; only then the screen lifts and the town starts
// (premise, the intro flight, Day 1). A returning player (language and account chosen once on this device) goes
// straight in from the button. The press is also the page's first user gesture (sound, pointer lock).
// URL: ?entry=1 forces the whole gate, ?entry=0 skips it; automated browsers and the capture / jury / replay links
// skip it so their scripts keep entering on their own. Flag: `entryGate` (game/public/features.json).
// Plain DOM in the light chunk (no three.js, no play/ imports): main.js loads it with import().

export const ENTRY_KEY = 'ftf.entry.v1';
export const ENTRY_LOCALES = Object.freeze([['en', 'English'], ['ru', 'Русский'], ['uk', 'Українська'], ['it', 'Italiano'], ['zh', '中文']]);

/**
 * Whether this load shows the gate, and whether the language and account steps come with it. Pure.
 * @param {{entry?: string|null, webdriver?: boolean, skipLink?: boolean, flag?: boolean, seen?: boolean}} o
 * @returns {{gate: boolean, steps: boolean}}
 */
export function entryPlan({ entry = null, webdriver = false, skipLink = false, flag = true, seen = false } = {}) {
  if (entry === '1') return { gate: true, steps: true };
  if (entry === '0' || !flag || webdriver || skipLink) return { gate: false, steps: false };
  return { gate: true, steps: !seen };
}

/** The links that run on their own (capture, the jury path, replays, films, dev deep links): no gate. Pure. */
export function isSkipLink(params) {
  const g = (k) => (params && typeof params.get === 'function' ? params.get(k) : null);
  return g('demo') === 'judge' || g('capture') != null || g('cinematic') != null || g('film') != null || g('replay') != null || g('shoal') != null || g('view') != null;
}

/** The locale to preselect: the saved one, else the browser's if the game speaks it, else English. Pure. */
export function preferredLocale(saved, navLangs = []) {
  const codes = ENTRY_LOCALES.map(([c]) => c);
  if (codes.includes(saved)) return saved;
  for (const l of navLangs || []) { const c = String(l || '').toLowerCase().slice(0, 2); if (codes.includes(c)) return c; }
  return 'en';
}

export function readEntry(storage) { try { return JSON.parse((storage && storage.getItem(ENTRY_KEY)) || 'null'); } catch { return null; } }
export function saveEntry(storage, rec) { try { if (storage) storage.setItem(ENTRY_KEY, JSON.stringify(rec)); } catch { /* private mode: asked again next time */ } }

const CSS = `
#boot .entry-gate { position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center; gap: 14px; margin-top: 6px; }
#boot .entry-btn { min-height: 52px; min-width: min(240px, calc(100vw - 32px)); padding: 12px 34px; border-radius: 26px; border: 1px solid #5fd3c6; background: rgba(95, 211, 198, .16); color: #f2fbf9; font: 600 18px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: .02em; cursor: pointer; box-shadow: 0 0 24px rgba(95, 211, 198, .22); }
#boot .entry-btn:hover, #boot .entry-btn:focus-visible { background: rgba(95, 211, 198, .3); outline: none; box-shadow: 0 0 0 2px rgba(95, 211, 198, .55), 0 0 28px rgba(95, 211, 198, .35); }
#boot .entry-hint { margin: -4px 0 0; font: 500 13px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; color: rgba(207, 231, 228, .72); letter-spacing: .02em; }
#boot .entry-title { margin: 0; font: 600 15px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #cfe7e4; letter-spacing: .03em; }
#boot .entry-langs { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 640px; }
#boot .entry-lang { min-height: 46px; min-width: 120px; padding: 10px 18px; border-radius: 23px; border: 1px solid rgba(95, 211, 198, .55); background: rgba(8, 20, 20, .55); color: #eef0ea; font: 500 16px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; cursor: pointer; }
#boot .entry-lang[aria-checked="true"] { border-color: #5fd3c6; background: rgba(95, 211, 198, .22); }
#boot .entry-lang:hover, #boot .entry-lang:focus-visible { background: rgba(95, 211, 198, .3); outline: none; }
#boot.entry-ready .boot-word, #boot.entry-ready .boot-bar, #boot.entry-ready .boot-label, #boot.entry-ready .boot-log, #boot.entry-ready .boot-tip { display: none; }
`;

function el(doc, tag, cls, text) { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

/**
 * Runs the gate on the loading screen (#boot). Resolves when the player has entered (the caller then lifts the screen).
 * @param {object} o
 * @param {Document} [o.doc]
 * @param {(k: string) => string} o.t the game's translator (follows the locale once it is set)
 * @param {boolean} o.steps language + account after the button
 * @param {string} o.locale the locale to preselect
 * @param {(code: string) => void} o.setLocale
 * @param {null | (() => Promise<unknown>)} [o.signIn] opens the account panel; resolves when it closes (null: no panel)
 * @returns {Promise<{locale: string|null, account: unknown}>}
 */
export async function runEntryGate({ doc = globalThis.document, t, steps, locale, setLocale, signIn = null }) {
  const root = doc.getElementById('boot');
  if (!root) return { locale: null, account: null };
  if (!doc.getElementById('entry-gate-css')) { const st = el(doc, 'style'); st.id = 'entry-gate-css'; st.textContent = CSS; doc.head.append(st); }
  const host = root.querySelector('.boot-bottom') || root;
  const box = el(doc, 'div', 'entry-gate');
  host.append(box);
  root.classList.add('entry-ready');
  root.setAttribute('aria-label', t('entry.ready'));

  // 1. the one button
  await new Promise((resolve) => {
    const b = el(doc, 'button', 'entry-btn', t('entry.enter')); b.type = 'button';
    // Enter works even when the button lost focus (a click elsewhere, a fullscreen switch): the hint says so (owner 14.11)
    const on = typeof doc.addEventListener === 'function', off = () => { if (on) doc.removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Enter' && !e.repeat) { off(); resolve(); } };
    b.addEventListener('click', () => { off(); resolve(); }, { once: true });
    if (on) doc.addEventListener('keydown', key, true);
    box.append(b, el(doc, 'p', 'entry-hint', t('entry.enterHint')));
    try { b.focus({ preventScroll: true }); } catch { /* */ }
  });
  box.textContent = '';
  if (!steps) { box.remove(); return { locale: null, account: null }; }

  // 2. the language, at once
  const chosen = await new Promise((resolve) => {
    box.append(el(doc, 'p', 'entry-title', t('entry.lang')));
    const row = el(doc, 'div', 'entry-langs'); row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', t('entry.lang'));
    let first = null;
    for (const [code, name] of ENTRY_LOCALES) {
      const b = el(doc, 'button', 'entry-lang', name); b.type = 'button'; b.lang = code;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(code === locale));
      b.addEventListener('click', () => resolve(code), { once: true });
      row.append(b);
      if (code === locale) first = b;
    }
    box.append(row);
    try { (first || row.firstChild).focus({ preventScroll: true }); } catch { /* */ }
  });
  setLocale(chosen);
  box.remove();

  // 3. the account panel (Play as guest is its first button), in the language just chosen
  let account = null;
  if (signIn) { try { account = await signIn(); } catch { account = { status: 'guest' }; } }
  return { locale: chosen, account };
}
