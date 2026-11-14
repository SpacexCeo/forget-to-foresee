// The market module for the sprint registry (game/src/sprint/registry.js): mount(ctx) -> {dispose, open}. It opens on
// window 'ftf:market-open' {tab?}; the key binding (B) and the HUD button belong to the HUD and the seam.
import { createMarketUi } from './market-ui.js';
import { createMarketClient } from './market-client.js';
import { createDice } from './dice.js';
import { silkView } from '../net/silk-core.js';
import { registerWindow, claimWindow } from '../ui/window-toggle.js';

// One market window per page (playtest 14.11): with the `marketplace` flag on, the sprint registry mounts this module
// and boot-world's lazy 'ftf:market-open' loader mounted it a second time, so two identical windows stacked on every
// open. The close button removed only the top one, B and Esc talked to the registered (already closed) one, and the
// market looked impossible to close. A second mount now shares the first; the last dispose tears it down.
let shared = null, mounts = 0;

export function mount(ctx) {
  if (!shared) { shared = mountOnce(ctx); mounts = 0; }
  const api = shared; mounts++;
  let done = false;
  return { open: api.open, dispose() { if (done) return; done = true; if (--mounts === 0 && shared === api) { shared = null; api.dispose(); } } };
}

function mountOnce(ctx) {
  const win = ctx.win || globalThis;
  // Loom Dice plays with play silk only (silk on this device that can never be recorded on NEAR)
  let wheelId = null; try { wheelId = ctx.storage.getItem('ftf.dice.id'); if (!wheelId) { wheelId = 'd' + Math.random().toString(36).slice(2, 12); ctx.storage.setItem('ftf.dice.id', wheelId); } } catch { wheelId = 'session'; }
  const dice = ctx.ledger ? createDice({ storage: ctx.storage, ledger: ctx.ledger, play: () => silkView().playC, wheelId }) : null;
  const ui = createMarketUi({ t: ctx.t, client: createMarketClient({ storage: ctx.storage }), dice, storage: ctx.storage, doc: ctx.doc || globalThis.document });
  const onOpen = (e) => { claimWindow('market'); ui.open((e && e.detail && e.detail.tab) || 'buy'); };
  const offWindow = registerWindow('market', { isOpen: () => ui.isOpen, close: () => ui.close() }); // one window at a time
  win.addEventListener('ftf:market-open', onOpen);
  return { open: (tab) => ui.open(tab), dispose() { win.removeEventListener('ftf:market-open', onOpen); offWindow(); ui.close(); } };
}
