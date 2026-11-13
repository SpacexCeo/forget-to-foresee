// The market module for the sprint registry (game/src/sprint/registry.js): mount(ctx) -> {dispose, open}. It opens on
// window 'ftf:market-open' {tab?}; the key binding (B) and the HUD button belong to the HUD and the seam.
import { createMarketUi } from './market-ui.js';
import { createMarketClient } from './market-client.js';
import { createDice } from './dice.js';
import { silkView } from '../net/silk-core.js';

export function mount(ctx) {
  const win = ctx.win || globalThis;
  // Loom Dice plays with play silk only (silk on this device that can never be recorded on NEAR)
  let wheelId = null; try { wheelId = ctx.storage.getItem('ftf.dice.id'); if (!wheelId) { wheelId = 'd' + Math.random().toString(36).slice(2, 12); ctx.storage.setItem('ftf.dice.id', wheelId); } } catch { wheelId = 'session'; }
  const dice = ctx.ledger ? createDice({ storage: ctx.storage, ledger: ctx.ledger, play: () => silkView().playC, wheelId }) : null;
  const ui = createMarketUi({ t: ctx.t, client: createMarketClient({ storage: ctx.storage }), dice, storage: ctx.storage, doc: ctx.doc || globalThis.document });
  const onOpen = (e) => ui.open((e && e.detail && e.detail.tab) || 'buy');
  win.addEventListener('ftf:market-open', onOpen);
  return { open: (tab) => ui.open(tab), dispose() { win.removeEventListener('ftf:market-open', onOpen); ui.close(); } };
}
