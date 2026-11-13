// "Town market · N trades today" ticker (docs/town-economy.md): a small pill in the town; a tap opens the last trades, each
// linking to its transaction on the NEAR testnet explorer, under the honest label "Scripted townsfolk · automated trades on
// NEAR testnet". Hidden when there is no market to show. Plain DOM, no play imports; the caller passes `t` (i18n),
// the poll function (net/market.js fetchMarket), `line` (net/market.js tradeLine) and `onTrade` for trades it has not seen yet (the stall scene).

const CSS = `.ftf-mk { position: fixed; left: calc(12px + env(safe-area-inset-left, 0px)); bottom: calc(64px + env(safe-area-inset-bottom, 0px)); z-index: 11;
  max-width: min(360px, calc(100% - 24px)); font: 13px/1.35 var(--font-ui, system-ui, sans-serif); color: var(--ftf-text, #eef0ea); }
.ftf-mk[hidden] { display: none; }
.ftf-mk > button { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 5px 12px; border-radius: 16px; border: 1px solid var(--ftf-line, rgba(197,164,105,.4));
  background: var(--ftf-panel, rgba(14,20,18,.92)); color: inherit; font: inherit; cursor: pointer; }
.ftf-mk .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ftf-accent, #b9c9c5); box-shadow: 0 0 6px var(--ftf-accent, #b9c9c5); }
.ftf-mk .dot.off { background: #8a8577; box-shadow: none; }
.ftf-mk .box { margin-top: 6px; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); background: var(--ftf-panel-solid, #101f1a); }
.ftf-mk .box[hidden] { display: none; }
.ftf-mk .lbl { margin: 0 0 6px; color: var(--ftf-muted, #aab6b0); font-size: 12px; }
.ftf-mk ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ftf-mk a { color: var(--ftf-text, #eef0ea); text-decoration: underline; text-decoration-color: var(--ftf-line, rgba(197,164,105,.4)); text-underline-offset: 2px; }
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
    text.textContent = `${t('mk.title')} · ${t('mk.today', { n: data.today })}`; text.className = 'mk-text'; text.setAttribute('data-n', t('mk.today', { n: data.today }));   // the phone bar shows the count alone (data-n)
    list.replaceChildren(...data.recent.slice(0, 5).map((r) => {
      const li = el('li', fresh.has(r.hash) ? 'new' : '');
      if (r.url) { const a = el('a', '', line(r)); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.title = r.reason ? `${r.reason} · ${t('mk.tx')}` : t('mk.tx'); li.append(a); } else { li.textContent = line(r); if (r.reason) li.title = r.reason; }
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
