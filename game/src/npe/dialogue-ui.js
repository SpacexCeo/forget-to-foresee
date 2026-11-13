// The dialogue box and the subtitle bar of the intro (sprint 7.5). One box at the bottom: portrait with a ring in the
// speaker's colour, name plate, text typed at 40 characters per second (instant under reduced motion), an advance
// indicator, "E or click: next · Esc: skip all" and a "3 / 19" counter; a Skip button top right. Sizes follow the
// 1920 x 1080 reference through --u (falls back to px when the sprint tokens are absent). No game state here.
import { SPEAKERS, typedChars, typeMs } from './dialogue-script.js';

const CSS = `
.npe-dim { position: fixed; inset: 0; z-index: calc(var(--z-dialogue, 50) - 1); background: rgba(0, 0, 0, .25); }
.npe-box { --uu: var(--u, calc(min(100vw, 100vh * 1.7778) / 1920)); position: fixed; z-index: var(--z-dialogue, 50); left: 50%; bottom: max(16px, calc(40 * var(--uu)));
  transform: translateX(-50%); width: min(calc(100vw - 24px), max(340px, calc(1200 * var(--uu)))); min-height: max(150px, calc(220 * var(--uu))); box-sizing: border-box;
  display: grid; grid-template-columns: auto 1fr; gap: max(12px, calc(22 * var(--uu))); padding: max(14px, calc(24 * var(--uu)));
  background: rgba(14, 16, 24, .94); border: 1px solid #3a3f55; border-radius: 14px; color: #eef0f6; font: 400 max(15px, calc(22 * var(--uu)))/1.45 system-ui, sans-serif; cursor: pointer; }
.npe-portrait { width: max(64px, calc(144 * var(--uu))); height: max(64px, calc(144 * var(--uu))); border-radius: 50%; box-sizing: border-box; border: 2px solid var(--sc, #f6c860);
  background: #1a1e2b center / cover no-repeat; display: grid; place-items: center; font: 700 max(26px, calc(56 * var(--uu)))/1 Georgia, serif; color: var(--sc, #f6c860); }
.npe-name { font: 700 max(15px, calc(22 * var(--uu)))/1.2 system-ui, sans-serif; color: var(--sc, #f6c860); margin: 0 0 6px; }
.npe-text { margin: 0; min-height: 3em; white-space: pre-wrap; }
.npe-text.iris { font-style: italic; color: #f3e6c8; }
.npe-foot { display: flex; justify-content: space-between; gap: 10px; margin-top: 8px; font-size: max(12px, calc(14 * var(--uu))); color: #aab1c5; }
.npe-more { position: absolute; right: max(12px, calc(24 * var(--uu))); bottom: max(10px, calc(20 * var(--uu))); color: #f6c860; font-size: max(14px, calc(20 * var(--uu))); animation: npe-bob 1s ease-in-out infinite; }
.npe-more[hidden] { display: none; }
@keyframes npe-bob { 50% { transform: translateY(-4px); } }
.npe-skip { position: fixed; z-index: calc(var(--z-dialogue, 50) + 1); top: max(12px, calc(24 * var(--uu, 1px))); right: max(12px, calc(24 * var(--uu, 1px))); min-width: 96px; min-height: 40px;
  border-radius: 10px; border: 1px solid #3a3f55; background: rgba(255, 255, 255, .06); color: #eef0f6; font: 600 15px system-ui, sans-serif; cursor: pointer; }
.npe-skip:focus-visible, .npe-box:focus-visible { outline: 2px solid #f6c860; outline-offset: 2px; }
.npe-sub { position: fixed; z-index: calc(var(--z-dialogue, 50) - 2); left: 50%; bottom: max(70px, calc(120 * var(--u, 1px))); transform: translateX(-50%); max-width: min(calc(100vw - 24px), 1200px);
  padding: 12px 20px; border-radius: 10px; background: rgba(0, 0, 0, .72); color: #eef0f6; font: 500 max(15px, calc(20 * var(--u, 1px)))/1.35 system-ui, sans-serif; text-align: center; transition: opacity .12s; }
.npe-sub b { margin-right: .3em; }
.npe-sub[hidden] { display: none; }
@media (prefers-reduced-motion: reduce) { .npe-more { animation: none; } .npe-sub { transition: none; } }
html[data-motion="reduce"] .npe-more { animation: none; }
@media (max-width: 520px) { .npe-box { grid-template-columns: 1fr; } .npe-portrait { display: none; } }
`;

export function installCss(doc) {
  if (doc.getElementById && doc.getElementById('npe-style')) return;
  const s = doc.createElement('style'); s.id = 'npe-style'; s.textContent = CSS; (doc.head || doc.body).append(s);
}

/**
 * Plays a list of lines and resolves when the last is done or when the player skips everything.
 * @param {{doc: Document, lines: Array<{speaker: string, text: string, award?: boolean}>, name: (sp: string) => string, hint: string,
 *   count: (n: number, of: number) => string, skipLabel: string, reduced: () => boolean, onLine?: (i: number, line: object) => void,
 *   onDone?: (i: number, line: object) => void, portrait?: (sp: string) => string|null, now?: () => number, raf?: Function}} o
 * @returns {{done: Promise<'finished'|'skipped'>, skip(): void, advance(): void, readonly index: number, readonly typing: boolean}}
 */
export function playDialogue({ doc, lines, name, hint, count, skipLabel, reduced, onLine = () => {}, onDone = () => {}, portrait = () => null, now = () => Date.now(), raf = (f) => setTimeout(f, 16) }) {
  installCss(doc);
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const dim = el('div', 'npe-dim');
  const box = el('div', 'npe-box'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-live', 'polite'); box.tabIndex = 0;
  const pic = el('div', 'npe-portrait'); pic.setAttribute('aria-hidden', 'true');
  const right = el('div'); const nm = el('p', 'npe-name'); const tx = el('p', 'npe-text');
  const foot = el('div', 'npe-foot'); const h = el('span', null, hint); const c = el('span', null, ''); foot.append(h, c);
  const more = el('span', 'npe-more', '▼'); more.setAttribute('aria-hidden', 'true');
  right.append(nm, tx, foot); box.append(pic, right, more);
  const skipBtn = el('button', 'npe-skip', skipLabel); skipBtn.type = 'button'; skipBtn.hidden = true;
  doc.body.append(dim, box, skipBtn);
  const showSkip = setTimeout(() => { skipBtn.hidden = false; }, 500);

  let i = -1, t0 = 0, typing = false, finished = false, resolve;
  const done = new Promise((r) => { resolve = r; });
  function show(k) {
    i = k; const l = lines[k]; const sp = SPEAKERS[l.speaker] || {};
    box.style.setProperty('--sc', sp.color || '#f6c860');
    nm.textContent = name(l.speaker);
    tx.className = 'npe-text' + (sp.italic ? ' iris' : '');
    const img = portrait(l.speaker);
    pic.style.backgroundImage = img ? `url("${img}")` : ''; pic.textContent = img ? '' : (nm.textContent || '?').slice(0, 1);
    c.textContent = count(k + 1, lines.length);
    t0 = now(); typing = !reduced() && typeMs(l.text) > 0; more.hidden = typing;
    tx.textContent = typing ? '' : l.text;
    onLine(k, l);
    if (typing) tick();
  }
  function tick() {
    if (!typing || finished) return;
    const l = lines[i]; const n = typedChars(l.text, now() - t0, reduced());
    tx.textContent = l.text.slice(0, n);
    if (n >= l.text.length) { typing = false; more.hidden = false; return; }
    raf(tick);
  }
  function advance() {
    if (finished) return;
    if (typing) { typing = false; tx.textContent = lines[i].text; more.hidden = false; return; } // a click completes the line
    onDone(i, lines[i]);
    if (i + 1 >= lines.length) end('finished'); else show(i + 1);
  }
  function end(how) {
    if (finished) return; finished = true; clearTimeout(showSkip);
    for (const e of [dim, box, skipBtn]) e.remove();
    if (doc.removeEventListener) doc.removeEventListener('keydown', onKey, true);
    resolve(how);
  }
  function skip() { end('skipped'); }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); skip(); }
    else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); advance(); }
  };
  box.addEventListener('click', advance);
  skipBtn.addEventListener('click', (e) => { if (e && e.stopPropagation) e.stopPropagation(); skip(); });
  if (doc.addEventListener) doc.addEventListener('keydown', onKey, true);
  show(0);
  try { box.focus(); } catch { /* */ }
  return { done, skip, advance, get index() { return i; }, get typing() { return typing; } };
}

/**
 * The subtitle bar: show(text, speaker?, durMs?) shows one cue (max two lines), hide() clears it. Hidden while a
 * dialogue box is open (the caller decides). Subtitles are always on during the intro.
 */
export function createSubtitles({ doc }) {
  installCss(doc);
  const bar = doc.createElement('div'); bar.className = 'npe-sub'; bar.hidden = true; bar.setAttribute('aria-live', 'polite'); doc.body.append(bar);
  let timer = null;
  return {
    show(text, speaker = null, durMs = 0) {
      clearTimeout(timer); bar.replaceChildren();
      if (speaker) { const b = doc.createElement('b'); b.textContent = speaker + ':'; const sp = SPEAKERS[String(speaker).toLowerCase()]; if (sp) b.style.color = sp.color; bar.append(b); }
      bar.append(doc.createTextNode(String(text))); bar.hidden = false;
      if (durMs > 0) timer = setTimeout(() => { bar.hidden = true; }, durMs);
    },
    hide() { clearTimeout(timer); bar.hidden = true; },
    get text() { return bar.hidden ? '' : bar.textContent; },
    dispose() { clearTimeout(timer); bar.remove(); },
  };
}
