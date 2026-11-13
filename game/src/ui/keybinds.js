// Key bindings (settings popup, Controls tab). The game reads keys by their DEFAULT code (input.hit('KeyE')); this
// module maps the physical key the player pressed to that default code, so every existing check keeps working and a
// rebinding needs no change elsewhere. Stored on this device ('ftf.keys.v1'). Pure apart from the storage it is given.

/** Rebindable actions: id, default code, i18n label key. Esc (menu) is fixed so the player can always get back. */
export const KEY_ACTIONS = Object.freeze([
  ['forward', 'KeyW', 'move'], ['back', 'KeyS', 'move'], ['left', 'KeyA', 'move'], ['right', 'KeyD', 'move'], ['run', 'ShiftLeft', 'move'],
  ['interact', 'KeyE', 'misc'], ['strike', 'KeyF', 'combat'], ['dash', 'Space', 'combat'], ['lance', 'KeyQ', 'combat'], ['snare', 'KeyV', 'combat'],
  ['photo', 'KeyP', 'misc'], ['skin', 'KeyK', 'misc'], ['chat', 'Enter', 'misc'], ['camera', 'KeyR', 'misc'], ['panel', 'KeyO', 'misc'],
  // sprint plan 3.5: the hotbar (slot 1 Strike, 2 Lance, 3 Snare, 4 Dash; learned skills fill 5 to 9), the windows, targeting, help
  ...Array.from({ length: 9 }, (_, i) => ['hotbar' + (i + 1), 'Digit' + (i + 1), 'skills']),
  ['journal', 'KeyJ', 'windows'], ['map', 'KeyM', 'windows'], ['skills', 'KeyN', 'windows'], ['character', 'KeyC', 'windows'], ['bag', 'KeyI', 'windows'],
  ['market', 'KeyB', 'windows'], ['track', 'KeyT', 'windows'], ['target', 'KeyX', 'combat'], ['help', 'F1', 'misc'],
].map(([id, code, group]) => Object.freeze({ id, code, group, label: 'set.key.' + id })));
/** Groups of the rebind table, in order (sprint plan 5.11). */
export const KEY_GROUPS = Object.freeze(['move', 'combat', 'skills', 'windows', 'misc']);
/** Fixed alternates that are not rebindable: L opens the journal too, Tab cycles the target (plan 3.5). */
export const FIXED_ALIASES = Object.freeze({ KeyL: 'journal', Tab: 'target' });
export const FIXED_KEYS = Object.freeze({ menu: 'Escape' });
export const KEYS_STORAGE = 'ftf.keys.v1';
const DEFAULTS = Object.freeze(Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.code])));
/** Keys that can never be bound (browser, system and the fixed menu key). */
const RESERVED = new Set(['Escape', 'Tab', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu']);

export const defaultBindings = () => ({ ...DEFAULTS });

/** A bindings object with every action, unknown or reserved codes replaced by the default. */
export function cleanBindings(b) {
  const out = defaultBindings();
  if (b && typeof b === 'object') for (const a of KEY_ACTIONS) if (typeof b[a.id] === 'string' && /^[A-Za-z0-9]{1,20}$/.test(b[a.id]) && !RESERVED.has(b[a.id])) out[a.id] = b[a.id];
  return out;
}

export function loadBindings(storage) { try { return cleanBindings(JSON.parse((storage && storage.getItem(KEYS_STORAGE)) || 'null')); } catch { return defaultBindings(); } }
export function saveBindings(storage, b) { try { storage && storage.setItem(KEYS_STORAGE, JSON.stringify(cleanBindings(b))); } catch { /* private mode */ } }
export const isReserved = (code) => RESERVED.has(code);

/** Codes bound to more than one action: {code: [action ids]}. */
export function conflicts(b) {
  const by = {};
  for (const a of KEY_ACTIONS) (by[b[a.id]] ||= []).push(a.id);
  return Object.fromEntries(Object.entries(by).filter(([, ids]) => ids.length > 1));
}

/**
 * The physical-code -> game-code table for a bindings object. A physical key bound to an action reports that action's
 * default code; a default code whose action moved elsewhere reports nothing (null), so the old key stops working;
 * every other key passes through unchanged (arrows, digits, the right Shift with run, F3…).
 */
export function remapTable(b) {
  const t = new Map();
  for (const a of KEY_ACTIONS) if (b[a.id] !== a.code && !t.has(a.code)) t.set(a.code, null);
  if (b.run !== 'ShiftLeft' && !t.has('ShiftRight')) t.set('ShiftRight', null); // the right Shift runs only while run is on Shift
  for (const a of KEY_ACTIONS) if (!t.has(b[a.id]) || t.get(b[a.id]) === null) t.set(b[a.id], a.code);
  return t;
}

let table = new Map(), current = defaultBindings();
const subs = new Set();
/** The live bindings (all modules share them). */
export const bindings = () => current;
export function setBindings(b, storage = null) {
  current = cleanBindings(b); table = remapTable(current);
  if (storage) saveBindings(storage, current);
  for (const fn of subs) { try { fn(current); } catch { /* a listener's error stays there */ } }
}
export const onBindings = (fn) => { subs.add(fn); return () => subs.delete(fn); };
/** What the game should see for a physical key code (null: ignore it). */
export const remapKey = (code) => (table.has(code) ? table.get(code) : code);
/** Whether a physical key is the one bound to `action`. */
export const isAction = (code, action) => current[action] === code;

/** The action a key is bound to now (null when none): used by the rebind swap question. */
export const actionOf = (code, b = current) => { const a = KEY_ACTIONS.find((x) => b[x.id] === code); return a ? a.id : null; };

/**
 * Rebind `action` to `code` (sprint plan 3.5 / 5.11): {ok, bindings, swapWith?, reason?}. A reserved key is refused
 * ('reserved'); a key used by another action needs `swap: true`, then the other action takes this action's old key.
 */
export function rebind(b, action, code, { swap = false } = {}) {
  if (!KEY_ACTIONS.some((a) => a.id === action)) return { ok: false, reason: 'action', bindings: b };
  if (RESERVED.has(code) || code in FIXED_ALIASES) return { ok: false, reason: 'reserved', bindings: b };
  const other = actionOf(code, b);
  if (other === action) return { ok: true, bindings: b };
  if (other && !swap) return { ok: false, reason: 'taken', swapWith: other, bindings: b };
  const next = { ...b, [action]: code };
  if (other) next[other] = b[action];
  return { ok: true, bindings: next, swapped: other || null };
}

/** Short label for a key code: KeyE -> E, Digit1 -> 1, ShiftLeft -> Shift, ArrowUp -> ↑. */
export function keyLabel(code) {
  if (!code) return '—';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6);
  const names = { ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', Space: 'Space', Enter: 'Enter',
    Backquote: '`', Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', CapsLock: 'Caps', Backspace: '⌫' };
  return names[code] || code;
}
/** The live label of an action's key (prompts and hints read this). */
export const actionKey = (action) => keyLabel(current[action] || FIXED_KEYS[action]);
