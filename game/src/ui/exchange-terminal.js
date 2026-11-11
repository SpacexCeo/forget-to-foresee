// Foresight Exchange terminal (Judge Echo, docs/agent-market-plan.md Scope A): one glass panel over the game. It runs
// its own local room session and sends every action through the same command bus as the agent API (start_exchange,
// place_order, advance_exchange_bar), so the browser and an HTTP agent play by identical rules. Practice silk only;
// the disclaimer is always on screen. The season is never touched.
import { JUDGE_WINDOW, DEFAULT_WINDOW } from '../net/exchange-deployment.js';

export const EXCHANGE_STORAGE_KEY = 'ftf.exchange.v1';
/** Seconds of drill time per bar: the full drill (8 bars) and the short judge drill (4 bars). */
export const BAR_SECONDS = Object.freeze({ full: 11, short: 10 });

const CSS = `
.ftf-xch { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(6, 10, 12, .55); font: 15px/1.4 system-ui, sans-serif; color: #f3ead6; }
.ftf-xch-panel { width: min(720px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow: auto; box-sizing: border-box; padding: 18px 20px; border-radius: 14px;
  background: rgba(14, 20, 22, .94); border: 1px solid rgba(233, 180, 76, .45); box-shadow: 0 20px 60px rgba(0, 0, 0, .5); }
.ftf-xch h2 { margin: 0; font: 600 22px/1.2 Georgia, serif; }
.ftf-xch .ftf-xch-sub { margin: 2px 0 10px; color: #b9b2a2; font-size: 13px; }
.ftf-xch .ftf-xch-disc { margin: 8px 0; padding: 8px 10px; border-radius: 8px; background: rgba(233, 180, 76, .12); color: #ecd9ab; font-size: 13px; }
.ftf-xch .ftf-xch-top { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; margin: 10px 0; }
.ftf-xch .ftf-xch-timer { font: 600 26px/1 ui-monospace, Consolas, monospace; color: #e9b44c; }
.ftf-xch table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
.ftf-xch td, .ftf-xch th { padding: 6px 4px; border-bottom: 1px solid rgba(255, 255, 255, .08); text-align: left; vertical-align: middle; }
.ftf-xch th { font: 600 11px/1 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #9d968a; }
.ftf-xch .ftf-xch-series { display: block; color: #8d877b; font-size: 12px; }
.ftf-xch .ftf-xch-num { font-variant-numeric: tabular-nums; }
.ftf-xch button { min-height: 40px; min-width: 44px; padding: 4px 12px; border-radius: 8px; border: 1px solid rgba(233, 180, 76, .6); background: rgba(233, 180, 76, .14); color: #f3ead6; font: 500 14px system-ui, sans-serif; cursor: pointer; }
.ftf-xch button.ftf-xch-primary { background: rgba(233, 180, 76, .92); color: #1d1708; }
.ftf-xch button:disabled { opacity: .45; cursor: default; }
.ftf-xch button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.ftf-xch .ftf-xch-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ftf-xch .ftf-xch-board li { display: flex; justify-content: space-between; padding: 3px 0; }
.ftf-xch .ftf-xch-board ol { margin: 4px 0 10px; padding-left: 20px; }
.ftf-xch .ftf-xch-msg { min-height: 1.4em; color: #ecd9ab; font-size: 13px; }
.ftf-xch .ftf-xch-hash { font: 12px ui-monospace, Consolas, monospace; color: #9d968a; word-break: break-all; }
.ftf-xch svg { display: block; }
`;

const silk = (cents) => (cents / 100).toFixed(2);

/** A small line of the published mids (no future bar is ever drawn because none is ever received). */
function spark(doc, history) {
  const NS = 'http://www.w3.org/2000/svg', w = 90, h = 26;
  const svg = doc.createElementNS(NS, 'svg'); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('aria-hidden', 'true');
  if (history.length > 1) {
    const lo = Math.min(...history), hi = Math.max(...history), span = hi - lo || 1;
    const pts = history.map((v, i) => `${(i / (history.length - 1)) * (w - 4) + 2},${h - 3 - ((v - lo) / span) * (h - 6)}`).join(' ');
    const pl = doc.createElementNS(NS, 'polyline'); pl.setAttribute('points', pts); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#e9b44c'); pl.setAttribute('stroke-width', '1.6');
    svg.append(pl);
  }
  return svg;
}

/**
 * Opens the terminal. Resolves the transport lazily (the room stack lives in the play chunk).
 * @param {{doc?: Document, i18n: {t: Function}, storage?: object, short?: boolean, onClose?: () => void, transport?: object}} o
 */
export async function openExchangeTerminal({ doc = document, i18n, storage = null, short = false, onClose = null, transport = null, ledger = null } = {}) {
  if (!doc.getElementById('ftf-xch-style')) { const st = doc.createElement('style'); st.id = 'ftf-xch-style'; st.textContent = CSS; doc.head.append(st); }
  const t = (k, a) => i18n.t(k, a);
  // The player's learning townsfolk agents (game/town-economy.js) join the board, scored locally on the same window by
  // the drill's rules from published bars only; the room's own board (the HTTP-equivalent one) is unchanged.
  const econ = ledger ? await import('../game/town-economy.js') : null;
  const rules = econ ? await import('../game/exchange.js') : null;
  const townRows = (x) => {
    if (!econ || !ledger || !x || x.phase === 'idle') return [];
    const agents = ledger.agentsKnown().map((npc) => ({ npc, a: ledger.agent(npc) })).sort((p, q) => q.a.experience - p.a.experience).slice(0, 3);
    const upto = x.phase === 'settled' ? x.barCount : x.bar; // only bars already published
    return agents.map(({ npc }) => ({ id: 'town:' + npc, kind: 'town', name: i18n.t('folk.name.' + npc), mark: econ.echoDrillScore(ledger.agentState ? ledger.agentState(npc) : null, { startIndex: x.startIndex, barCount: upto }, rules) }));
  };
  const tr = transport || (await import('../play/transport-local.js')).createLocalTransport({ rules: 'v3' });
  let n = 0, timer = 0, left = 0, mode = short ? 'short' : 'full', msg = '', closed = false;
  const obs = () => tr.observe().body.observation;
  const send = (type, args = {}) => tr.command({ actionId: `xch-ui-${Date.now().toString(36)}-${++n}`, expectedVersion: obs().version, type, args });

  const root = doc.createElement('div'); root.className = 'ftf-xch'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('exch.title'));
  const panel = doc.createElement('div'); panel.className = 'ftf-xch-panel'; root.append(panel);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  doc.body.append(root);

  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, onClick, cls = '') => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', onClick); return b; };

  function close() {
    if (closed) return; closed = true;
    clearInterval(timer); root.remove();
    if (onClose) onClose();
  }
  function saveResult(x) {
    if (!storage) return;
    try {
      const prev = (storage.getJSON ? storage.getJSON(EXCHANGE_STORAGE_KEY, []) : []) || [];
      const res = { spec: x.spec, simulation: true, snapshotId: x.snapshotId, startIndex: x.startIndex, barCount: x.barCount, hash: x.hash, scores: x.board.map((b) => ({ id: b.id, kind: b.kind, name: b.name, practiceSilk: b.mark / 100 })), at: new Date().toISOString() };
      storage.setJSON(EXCHANGE_STORAGE_KEY, [res, ...prev].slice(0, 5));
      return res;
    } catch { return null; }
  }
  function start() {
    const w = mode === 'short' ? JUDGE_WINDOW : DEFAULT_WINDOW;
    const r = send('start_exchange', { startIndex: w.startIndex, barCount: w.barCount });
    if (r.status !== 200) { msg = t('exch.err.generic'); render(); return; }
    left = BAR_SECONDS[mode];
    clearInterval(timer);
    timer = setInterval(tick, 1000);
    render();
  }
  function tick() {
    if (closed) return;
    left--;
    if (left <= 0) {
      send('advance_exchange_bar');
      const x = obs().exchange;
      if (x.phase !== 'open') { clearInterval(timer); saveResult(x); }
      left = BAR_SECONDS[mode];
    }
    render();
  }
  function order(echo, side, qty) {
    const r = send('place_order', { echo, side, qty });
    if (r.status === 200) { const f = r.body.result.fill; msg = t(side === 'buy' ? 'exch.bought' : 'exch.sold', { qty: f.qty, echo: t('exch.echo.' + echo), price: silk(f.price), fee: silk(f.fee) }); }
    else msg = t('exch.err.' + ((r.body.error && r.body.error.reason) || 'generic'));
    render();
  }

  function render() {
    const x = obs().exchange;
    const kids = [el('h2', null, t('exch.title')), el('p', 'ftf-xch-sub', t('exch.sub')), el('p', 'ftf-xch-disc', t('exch.disclaimer'))];
    if (x.phase === 'idle') {
      kids.push(el('p', null, t('exch.invite')), el('p', 'ftf-xch-sub', t('exch.echoNote')));
      const row = el('div', 'ftf-xch-row');
      row.append(btn(t('exch.startShort'), () => { mode = 'short'; start(); }, mode === 'short' ? 'ftf-xch-primary' : ''), btn(t('exch.startFull'), () => { mode = 'full'; start(); }, mode === 'full' ? 'ftf-xch-primary' : ''), btn(t('exch.close'), close));
      kids.push(row);
    } else {
      const top = el('div', 'ftf-xch-top');
      top.append(el('span', null, t('exch.bar', { n: x.bar, total: x.barCount, date: x.date })), el('span', 'ftf-xch-timer', x.phase === 'open' ? `${left}s` : t('exch.settled')), el('span', 'ftf-xch-num', t('exch.purse', { n: silk(x.you.practiceSilk) })));
      kids.push(top);
      const table = el('table');
      const head = el('tr'); for (const k of ['exch.col.echo', 'exch.col.trend', 'exch.col.quote', 'exch.col.held', '']) head.append(el('th', null, k ? t(k) : '')); table.append(head);
      for (const e of x.echoes) {
        const tr_ = el('tr');
        const name = el('td'); name.append(el('span', null, t('exch.echo.' + e.id)), el('span', 'ftf-xch-series', e.series));
        const tc = el('td'); tc.append(spark(doc, e.history));
        const act = el('td'); const row = el('div', 'ftf-xch-row');
        const held = x.you.positions[e.id];
        const can = x.phase === 'open' && x.you.ordersLeft > 0;
        row.append(btn(t('exch.buy'), () => order(e.id, 'buy', 1)), btn(t('exch.sell'), () => order(e.id, 'sell', held)));
        row.children[0].disabled = !can; row.children[1].disabled = !can || held === 0;
        act.append(row);
        tr_.append(name, tc, el('td', 'ftf-xch-num', `${silk(e.bid)} / ${silk(e.ask)}`), el('td', 'ftf-xch-num', String(held)), act);
        table.append(tr_);
      }
      kids.push(table, el('p', 'ftf-xch-msg', msg));
      const b = el('div', 'ftf-xch-board'); b.append(el('strong', null, t('exch.board')));
      const ol = el('ol');
      for (const r of [...x.board, ...townRows(x)].sort((p, q) => q.mark - p.mark)) { const li = el('li'); li.append(el('span', null, r.kind === 'human' ? t('exch.you') : r.kind === 'town' ? r.name + ' · ' + t('exch.townAgent') : r.name + ' · ' + t('exch.agent')), el('span', 'ftf-xch-num', silk(r.mark))); ol.append(li); }
      b.append(ol); kids.push(b);
      const row = el('div', 'ftf-xch-row');
      if (x.phase === 'settled') {
        kids.push(el('p', null, t('exch.result', { id: x.snapshotId, short: x.hash.slice(0, 12) })), el('p', 'ftf-xch-hash', 'sha256 ' + x.hash));
        const copyBtn = btn(t('exch.copy'), async () => {
          const res = { spec: x.spec, simulation: true, disclaimer: x.disclaimer, snapshotId: x.snapshotId, startIndex: x.startIndex, barCount: x.barCount, hash: x.hash, scores: x.board.map((r) => ({ id: r.id, kind: r.kind, practiceSilk: r.mark / 100 })) };
          try { await navigator.clipboard.writeText(JSON.stringify(res, null, 2)); copyBtn.textContent = t('exch.copied'); } catch { copyBtn.textContent = t('exch.copyFailed'); }
        }, 'ftf-xch-primary');
        row.append(copyBtn);
      } else {
        row.append(btn(t('exch.next'), () => { left = 1; tick(); }));
      }
      row.append(btn(t('exch.close'), close));
      kids.push(row);
    }
    panel.replaceChildren(...kids);
  }
  render();
  const first = panel.querySelector('button'); if (first) first.focus();
  return { close, get open() { return !closed; }, root };
}
