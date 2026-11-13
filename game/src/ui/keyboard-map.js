// The controls diagram at the bottom of Settings -> Controls (owner 12.11: "draw the keyboard with the binds"): a
// stylised keyboard in the dark/gold style with every bound key lit and labelled from the player's CURRENT bindings
// (ui/keybinds.js, so a rebind shows at once), the number-key cast aliases, Esc for the menu, and the mouse beside it
// (left click: walk / talk, right drag: look, wheel: zoom; ui/input.js). On a touch device the touch layout instead
// (stick or tap to move, drag to look, pinch to zoom, the skill bar). Plain DOM, no play imports.
import { KEY_ACTIONS, FIXED_KEYS, keyLabel } from './keybinds.js';

/** Fixed extra keys: the number-key aliases of the casts, strike and dash (town-casting.js CAST_KEYS, mobs.js ACTIONS). */
export const KEY_ALIASES = Object.freeze({ Digit1: 'lance', Digit2: 'snare', Digit3: 'strike', Digit4: 'dash' });

/** Keyboard rows (ANSI, main block): [code, width in key units]. */
export const KEY_ROWS = Object.freeze([
  [['Escape', 1], ['F1', 1], ['F2', 1], ['F3', 1], ['F4', 1], ['F5', 1], ['F6', 1], ['F7', 1], ['F8', 1], ['F9', 1], ['F10', 1], ['F11', 1], ['F12', 1], ['Delete', 2]],
  [['Backquote', 1], ['Digit1', 1], ['Digit2', 1], ['Digit3', 1], ['Digit4', 1], ['Digit5', 1], ['Digit6', 1], ['Digit7', 1], ['Digit8', 1], ['Digit9', 1], ['Digit0', 1], ['Minus', 1], ['Equal', 1], ['Backspace', 2]],
  [['Tab', 1.5], ['KeyQ', 1], ['KeyW', 1], ['KeyE', 1], ['KeyR', 1], ['KeyT', 1], ['KeyY', 1], ['KeyU', 1], ['KeyI', 1], ['KeyO', 1], ['KeyP', 1], ['BracketLeft', 1], ['BracketRight', 1], ['Backslash', 1.5]],
  [['CapsLock', 1.75], ['KeyA', 1], ['KeyS', 1], ['KeyD', 1], ['KeyF', 1], ['KeyG', 1], ['KeyH', 1], ['KeyJ', 1], ['KeyK', 1], ['KeyL', 1], ['Semicolon', 1], ['Quote', 1], ['Enter', 2.25]],
  [['ShiftLeft', 2.25], ['KeyZ', 1], ['KeyX', 1], ['KeyC', 1], ['KeyV', 1], ['KeyB', 1], ['KeyN', 1], ['KeyM', 1], ['Comma', 1], ['Period', 1], ['Slash', 1], ['ShiftRight', 2.75]],
  [['ControlLeft', 1.5], ['AltLeft', 1.5], ['Space', 7], ['AltRight', 1.5], ['ControlRight', 1.5]],
]);

/**
 * Which action each key does, from the bindings: {code: [action ids]} (a key can carry two when bindings clash;
 * the number aliases and Esc are added unless the player rebound something onto them). Pure.
 */
export function keyActions(b) {
  const map = {};
  const add = (code, id) => { (map[code] ||= []).includes(id) || map[code].push(id); };
  for (const a of KEY_ACTIONS) if (b[a.id]) add(b[a.id], a.id);
  for (const [code, id] of Object.entries(KEY_ALIASES)) if (!map[code]) add(code, id);
  for (const [id, code] of Object.entries(FIXED_KEYS)) add(code, id);
  return map;
}

export const KBD_CSS = `
.ftf-kbd { margin: 14px 0 4px; padding: 12px; border: 1px solid rgba(233,180,76,.28); border-radius: 12px; background: linear-gradient(#0e1516, #0a1011); }
.ftf-kbd-wrap { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.ftf-kbd-keys { flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ftf-kbd-row { display: flex; gap: 4px; }
.ftf-kbd-k { flex: var(--w) 1 0; min-width: 0; height: 40px; border-radius: 6px; border: 1px solid #2a3536; background: #172122; box-shadow: 0 2px 0 #070b0b;
  display: flex; flex-direction: column; align-items: center; justify-content: center; color: #6f7b78; font: 600 11px/1.1 system-ui, sans-serif; overflow: hidden; }
.ftf-kbd-k b { font-size: 12px; }
.ftf-kbd-k small { font-size: 9px; font-weight: 500; max-width: 100%; padding: 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ftf-kbd-k[data-on="1"] { background: linear-gradient(#3a2d14, #2a210f); border-color: #e9b44c; color: #f3ead6; box-shadow: 0 2px 0 #4e3a12, 0 0 8px rgba(233,180,76,.25); }
.ftf-kbd-k[data-on="1"] small { color: #f1c76a; }
.ftf-kbd-k[data-clash="1"] { border-color: #e0714f; }
.ftf-kbd-mouse { flex: 0 0 auto; display: flex; gap: 10px; align-items: center; color: #d8cfbd; font-size: 13px; }
.ftf-kbd-mouse ul, .ftf-kbd-touch ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.ftf-kbd-mouse li b, .ftf-kbd-touch li b { color: #f1c76a; font-weight: 600; margin-right: 6px; }
.ftf-kbd-touch { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; color: #d8cfbd; font-size: 13px; }
.ftf-kbd svg { display: block; }
@media (max-width: 560px) { .ftf-kbd-k { height: 34px; } .ftf-kbd-k small { display: none; } }
`;

const SVGNS = 'http://www.w3.org/2000/svg';
function svg(doc, w, h, parts) {
  const s = doc.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('width', String(w)); s.setAttribute('height', String(h)); s.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of parts) { const e = doc.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); s.append(e); }
  return s;
}
const GOLD = '#e9b44c', DIM = '#2a3536', FILL = '#172122';

/**
 * The diagram element. `b` the current bindings, `t` the translator, `touch` true on a touch device.
 * @returns {HTMLElement}
 */
export function controlsDiagram({ doc = globalThis.document, b, t, touch = false }) {
  if (!doc.getElementById('ftf-kbd-css')) { const s = doc.createElement('style'); s.id = 'ftf-kbd-css'; s.textContent = KBD_CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const box = el('figure', 'ftf-kbd'); box.style.margin = '14px 0 4px';
  const item = (k, v) => { const li = el('li'); li.append(el('b', null, k), doc.createTextNode(v)); return li; };
  if (touch) {
    box.setAttribute('aria-label', t('set.kbd.touchTitle'));
    const wrap = el('div', 'ftf-kbd-touch');
    wrap.append(svg(doc, 200, 110, [
      ['rect', { x: 2, y: 2, width: 196, height: 106, rx: 16, fill: FILL, stroke: GOLD, 'stroke-width': 1.5 }],
      ['circle', { cx: 40, cy: 72, r: 22, fill: 'none', stroke: GOLD, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }],
      ['circle', { cx: 40, cy: 72, r: 9, fill: GOLD }],
      ['path', { d: 'M110 40 q20 -14 40 0', fill: 'none', stroke: GOLD, 'stroke-width': 1.5 }],
      ['circle', { cx: 130, cy: 88, r: 8, fill: 'none', stroke: GOLD }], ['circle', { cx: 150, cy: 80, r: 8, fill: 'none', stroke: GOLD }],
      ['circle', { cx: 170, cy: 88, r: 8, fill: 'none', stroke: GOLD }], ['circle', { cx: 186, cy: 70, r: 7, fill: 'none', stroke: GOLD }],
      ['rect', { x: 172, y: 10, width: 16, height: 12, rx: 3, fill: 'none', stroke: GOLD }],
    ]));
    const ul = el('ul');
    ul.append(item(t('set.kbd.t.stick'), t('set.kbd.move')), item(t('set.kbd.t.drag'), t('set.kbd.look')), item(t('set.kbd.t.pinch'), t('set.kbd.zoom')),
      item(t('set.kbd.t.tap'), t('set.kbd.walkTalk')), item(t('set.kbd.t.bar'), t('set.kbd.skills')), item('☰', t('set.kbd.menu')));
    wrap.append(ul); box.append(wrap);
    return box;
  }
  box.setAttribute('aria-label', t('set.kbd.title'));
  const acts = keyActions(b);
  const wrap = el('div', 'ftf-kbd-wrap'), keys = el('div', 'ftf-kbd-keys');
  for (const row of KEY_ROWS) {
    const r = el('div', 'ftf-kbd-row');
    for (const [code, w] of row) {
      const k = el('div', 'ftf-kbd-k'); k.style.setProperty('--w', String(w));
      const ids = acts[code] || [];
      k.dataset.on = ids.length ? '1' : '0'; k.dataset.clash = ids.length > 1 ? '1' : '0'; k.dataset.code = code;
      k.append(el('b', null, keyLabel(code)));
      if (ids.length) { const lab = ids.map((id) => t('set.kbd.' + id)).join(' · '); k.append(el('small', null, lab)); k.title = keyLabel(code) + ': ' + ids.map((id) => t('set.key.' + id)).join(', '); }
      r.append(k);
    }
    keys.append(r);
  }
  const mouse = el('div', 'ftf-kbd-mouse');
  mouse.append(svg(doc, 56, 84, [
    ['rect', { x: 3, y: 3, width: 50, height: 78, rx: 24, fill: FILL, stroke: DIM, 'stroke-width': 2 }],
    ['path', { d: 'M28 4 V36 H4 V27 A24 24 0 0 1 28 4 Z', fill: 'rgba(233,180,76,.35)', stroke: GOLD, 'stroke-width': 1.5 }],
    ['path', { d: 'M28 4 V36 H52 V27 A24 24 0 0 0 28 4 Z', fill: 'rgba(233,180,76,.18)', stroke: GOLD, 'stroke-width': 1.5 }],
    ['rect', { x: 24, y: 12, width: 8, height: 16, rx: 4, fill: GOLD }],
  ]));
  const ul = el('ul');
  ul.append(item(t('set.kbd.m.left'), t('set.kbd.walkTalk')), item(t('set.kbd.m.right'), t('set.kbd.look')), item(t('set.kbd.m.wheel'), t('set.kbd.zoom')));
  mouse.append(ul);
  wrap.append(keys, mouse); box.append(wrap);
  return box;
}
