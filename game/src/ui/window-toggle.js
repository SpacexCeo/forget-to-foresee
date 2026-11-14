// One game window at a time (owner 13.11: "I, then C, and a second menu opens on top"). The windows live in different
// modules (the game menu, the character sheet, the skill tree, the journal, the market), so each registers a small
// handle here and asks before it opens; the asker's rivals close. Pure apart from the handles it is given: no DOM.

/**
 * What a hotkey or a tray button does to the tabbed game menu. Pure.
 * @param {{open: boolean, tab?: string|null}} menu the menu now
 * @param {string} tab the tab the key asks for
 * @param {boolean} [toggle] true for a hotkey / tray press (the same key closes); false for a plain "show me this tab"
 * @returns {'open'|'close'|'switch'|'stay'}
 */
export function menuKeyAction(menu, tab, toggle = true) {
  if (!menu || !menu.open) return 'open';
  if (menu.tab === tab) return toggle ? 'close' : 'stay';
  return 'switch';
}

const handles = new Map(); // id -> {isOpen(): boolean, close(): void}

/** Registers window `id`; returns the function that removes it. A later registration under the same id replaces the first. */
export function registerWindow(id, handle) {
  handles.set(id, handle);
  return () => { if (handles.get(id) === handle) handles.delete(id); };
}

const openOf = (h) => { try { return !!h.isOpen(); } catch { return false; } };

/** The ids of the registered windows that are open now. */
export const openWindows = () => [...handles].filter(([, h]) => openOf(h)).map(([id]) => id);

/** Window `id` is about to open: every other open window closes. Returns the ids that were closed. */
export function claimWindow(id) {
  const closed = [];
  for (const [k, h] of [...handles]) {
    if (k === id || !openOf(h)) continue;
    try { h.close(); closed.push(k); } catch { /* a window that cannot close stays; the new one still opens */ }
  }
  return closed;
}

/** Whether window `id` is registered and open. */
export const isWindowOpen = (id) => { const h = handles.get(id); return !!h && openOf(h); };

/**
 * A hotkey or a tray button for window `id`: an open one closes (false: there is nothing to open), else its rivals
 * close (true: the caller opens it).
 */
export function pressWindow(id) {
  const h = handles.get(id);
  if (h && openOf(h)) { try { h.close(); } catch { /* */ } return false; }
  claimWindow(id);
  return true;
}

/** Tests: forget every handle. */
export function resetWindows() { handles.clear(); }
