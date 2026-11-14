// Routes window 'ftf:open-window' {id} (sent by the rpg HUD keys and buttons) to the real windows. The journal belongs
// to scenes/town-quests.js (it listens for 'ftf:journal-toggle'), the market to market/index.js ('ftf:market-open'), the
// bag to the game menu's Inventory tab ('ftf:menu-open' {tab}),
// help to the settings' controls tab. Anything else has no window yet: bus 'window.missing' {id}, nothing breaks.
import { emit } from './bus.js';

export const ROUTES = Object.freeze({
  journal: { event: 'ftf:journal-toggle' },
  quests: { event: 'ftf:journal-toggle' },
  market: { event: 'ftf:market-open' },
  bag: { event: 'ftf:menu-open', tab: 'inventory' }, // the game menu's Inventory tab (boot-world.js listens)
  map: { event: 'ftf:town-map' }, // the painted town map (play/town-map-ui.js; boot-world.js listens)
});

/** Opens window `id`; returns true when something real handled it. */
export function routeWindow(id, { win = globalThis, openSettings = null } = {}) {
  const r = ROUTES[id];
  if (r && win && win.dispatchEvent && typeof CustomEvent === 'function') { win.dispatchEvent(new CustomEvent(r.event, { detail: r.tab ? { id, tab: r.tab } : { id } })); emit('window.opened', { id }); return true; }
  if ((id === 'help' || id === 'settings') && typeof openSettings === 'function') { openSettings(id === 'help' ? 'controls' : undefined); emit('window.opened', { id }); return true; }
  emit('window.missing', { id });
  return false;
}

/** Listens on `win` for 'ftf:open-window'; returns the detach function. */
export function installWindowRouter({ win = globalThis, openSettings = null } = {}) {
  if (!win || !win.addEventListener) return () => {};
  const on = (e) => { const id = e && e.detail && e.detail.id; if (id) routeWindow(id, { win, openSettings }); };
  win.addEventListener('ftf:open-window', on);
  return () => win.removeEventListener('ftf:open-window', on);
}
