// "Town market · N trades today" ticker (docs/town-economy.md): a small pill in the town; a tap opens the last trades, each
// linking to its transaction on the NEAR testnet explorer, under the honest label "Scripted townsfolk · automated trades on
// NEAR testnet". Hidden when there is no market to show. Plain DOM, no play imports; the caller passes `t` (i18n),
// the poll function (net/market.js fetchMarket), `line` (net/market.js tradeLine) and `onTrade` for trades it has not seen yet (the stall scene).

const CSS = `.ftf-mk { position: fixed; left: calc(12px + env(safe-area-inset-left, 0px)); bottom: calc(64px + env(safe-area-inset-bottom, 0px)); z-index: 11;
  max-width: min(360px, calc(100% - 24px)); font: 13px/1.35 system-ui, sans-serif; color: #f3ead6; }
.ftf-mk[hidden] { display: none; }
.ftf-mk > button { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 5px 12px; border-radius: 16px; border: 1px solid rgba(233,180,76,.45);
  background: rgba(16,22,24,.82); color: inherit; font: inherit; cursor: pointer; }
.ftf-mk .dot { width: 7px; height: 7px; border-radius: 50%; background: #9fd49a; box-shadow: 0 0 6px #9fd49a; }
.ftf-mk .dot.off { background: #8a8577; box-shadow: none; }
.ftf-mk .box { margin-top: 6px; padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(233,180,76,.45); background: rgba(16,22,24,.88); }
.ftf-mk .box[hidden] { display: none; }
.ftf-mk .lbl { margin: 0 0 6px; color: #b9b2a2; font-size: 12px; }
.ftf-mk ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ftf-mk a { color: #f3ead6; text-decoration: underline; text-decoration-color: rgba(233,180,76,.6); text-underline-offset: 2px; }
.ftf-mk .new { animation: ftf-mk-in .5s ease-out; }
@keyframes ftf-mk-in { from { opacity: 0; transform: translateY(4px); } }
@media (prefers-reduced-motion: reduce) { .ftf-mk .new { animation: none; } }`;

/**
 * @param {{doc?: Document, t: Function, line: (r: object) => string, poll: () => Promise<object|null>, onTrade?: Function, pollMs?: number, timers?: object}} o
 * @returns {{show(on: boolean): void, refresh(): Promise<void>, destroy(): void, el: HTMLElement, state(): object}}
 */
export function createMarketTicker({ doc = globalThis.document, t, line, poll, onTrade = null, pollMs = 20_000, timers = globalThis }) {
  if (!doc.getElementById('ftf-mk-css')) { const s = doc.createElement('style'); s.id = 'ftf-mk-css'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('div', 'ftf-mk'); root.hidden = true;
  const pill = el('button'); pill.type = 'button'; pill.setAttribute('aria-expanded', 'false');
  const dot = el('span', 'dot'), text = el('span');
  pill.append(dot, text);
  const box = el('div', 'box'); box.hidden = true;
  const lbl = el('p', 'lbl', t('mk.label')), list = el('ul');
  box.append(lbl, list); root.append(pill, box);
  doc.body.append(root);
  let shown = false, data = null, timer = null;
  const seen = new Set();

  pill.addEventListener('click', () => { box.hidden = !box.hidden; pill.setAttribute('aria-expanded', String(!box.hidden)); });

  function render(fresh) {
    if (!data || data.today == null) { root.hidden = true; return; }
    root.hidden = !shown;
    dot.className = 'dot' + (data.live ? '' : ' off');
    text.textContent = `${t('mk.title')} · ${t('mk.today', { n: data.today })}`;
    list.replaceChildren(...data.recent.slice(0, 5).map((r) => {
      const li = el('li', fresh.has(r.hash) ? 'new' : '');
      if (r.url) { const a = el('a', '', line(r)); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.title = t('mk.tx'); li.append(a); } else li.textContent = line(r);
      return li;
    }));
  }

  async function refresh() {
    const j = await poll();
    if (!j) { render(new Set()); return; }
    const first = data === null;
    data = j;
    const fresh = new Set();
    for (const r of [...j.recent].reverse()) if (r.hash && !seen.has(r.hash)) { seen.add(r.hash); if (!first) { fresh.add(r.hash); if (onTrade) { try { onTrade(r); } catch { /* the scene's problem */ } } } }
    render(fresh);
  }
  const visible = () => !doc.visibilityState || doc.visibilityState === 'visible';
  const tick = () => { timer = timers.setTimeout(async () => { if (shown && visible()) await refresh(); if (shown) tick(); }, pollMs); };

  return {
    el: root,
    refresh,
    show(on) {
      if (on === shown) return;
      shown = !!on;
      if (shown) { refresh().catch(() => {}); tick(); } else { if (timer) timers.clearTimeout(timer); timer = null; root.hidden = true; }
      if (data && data.today != null) root.hidden = !shown;
    },
    destroy() { if (timer) timers.clearTimeout(timer); root.remove(); },
    state: () => ({ shown, data }),
  };
}
