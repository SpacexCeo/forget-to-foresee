// The market module for the sprint registry (game/src/sprint/registry.js): mount(ctx) -> {dispose, open}. It opens on
// window 'ftf:market-open' {tab?}; the key binding (B) and the HUD button belong to the HUD and the seam.
import { createMarketUi } from './market-ui.js';
import { createMarketClient } from './market-client.js';

export function mount(ctx) {
  const win = ctx.win || globalThis;
  const ui = createMarketUi({ t: ctx.t, client: createMarketClient({ storage: ctx.storage }), doc: ctx.doc || globalThis.document });
  const onOpen = (e) => ui.open((e && e.detail && e.detail.tab) || 'buy');
  win.addEventListener('ftf:market-open', onOpen);
  return { open: (tab) => ui.open(tab), dispose() { win.removeEventListener('ftf:market-open', onOpen); ui.close(); } };
}
