// The board panel (story K2, docs/leaderboard.md): two tabs (Humans | Scripted NPC), the top ten of the latest
// snapshot, the player's own row recomputed from the local expedition log (game/board-score.js), the snapshot time and
// root, and the plain footer. Without a snapshot it shows the player alone, labelled "Local preview, not ranked".
// Every number shown comes from the snapshot or the local log. Pure DOM (no fetch); scenes/town-board.js drives it.

export const VERIFY_URL = 'https://github.com/SpacexCeo/forget-to-foresee/blob/main/docs/leaderboard.md';

/** The rows of a tab (pure): never a scripted row in the human tab, nor a human row in the scripted tab. */
export function tabRows(snapshot, tab, top = 10) {
  if (!snapshot || !Array.isArray(snapshot.rows)) return [];
  const actor = tab === 'scripted' ? 'scripted' : 'human';
  return snapshot.rows.filter((r) => r && r.actor === actor).sort((a, b) => a.rank - b.rank).slice(0, top);
}

/** The player's line (pure): rank among the snapshot's humans by the local score, or the local preview. */
export function youLine(snapshot, local, account = null) {
  const humans = tabRows(snapshot, 'human', Infinity);
  if (!local) return null;
  const mine = account ? humans.find((r) => r.account === account) : null;
  if (!snapshot || !humans.length) return { key: 'lb.youLocal', args: { score: local.score }, preview: true };
  const rank = mine ? mine.rank : 1 + humans.filter((r) => r.score > local.score).length;
  const n = humans.length + (mine ? 0 : 1);
  return { key: 'lb.you', args: { rank, n, score: local.score }, differs: mine && mine.score !== local.score ? { snap: mine.score, local: local.score } : null };
}

/** Root for display: the first eight hex characters. */
export const shortRoot = (root) => (typeof root === 'string' && root ? root.slice(0, 8) : '');

/**
 * @param {object} o
 * @param {Document} o.doc @param {object} o.i18n @param {object|null} o.snapshot @param {{score: number, parts: object}|null} o.local
 * @param {string} [o.account] @param {'human'|'scripted'} [o.tab] @param {() => void} o.onClose
 * @param {(text: string) => Promise|void} [o.copy] clipboard writer
 */
export function renderBoardPanel({ doc, i18n, snapshot, local, account = null, tab = 'human', onClose, copy = null }) {
  const t = (k, a) => i18n.t(k, a);
  const el = (tag, css, text) => { const e = doc.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
  const panel = el('div', 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;width:min(460px,calc(100vw - 32px));max-height:min(78vh,640px);overflow:auto;'
    + 'padding:16px 18px;border-radius:14px;background:rgba(10,14,16,.95);border:1px solid rgba(143,226,214,.45);color:#f3ead8;font:14px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5)');
  panel.className = 'ftf-board-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', t('lb.title'));
  const head = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px');
  head.append(el('h3', 'margin:0;font:600 17px/1.2 system-ui;color:#8fe2d6', t('lb.title')));
  const x = el('button', 'min-width:44px;min-height:44px;border-radius:10px;border:1px solid rgba(243,234,216,.3);background:transparent;color:inherit;font:600 16px system-ui;cursor:pointer', '×');
  x.type = 'button'; x.className = 'ftf-board-close'; x.setAttribute('aria-label', t('lb.close')); x.addEventListener('click', (e) => { e.stopPropagation(); onClose(); });
  head.append(x); panel.append(head);

  const tabs = el('div', 'display:flex;gap:6px;margin-bottom:8px'); tabs.setAttribute('role', 'tablist');
  const body = el('div'); body.className = 'ftf-board-body';
  const draw = (which) => {
    tab = which;
    for (const b of tabs.children) { const on = b.dataset.tab === which; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.style.background = on ? 'rgba(143,226,214,.22)' : 'transparent'; }
    body.replaceChildren();
    if (which === 'scripted') body.append(el('p', 'margin:0 0 8px;color:#b9c7c4;font-size:12px', t('lb.scriptedNote')));
    const rows = tabRows(snapshot, which);
    if (!rows.length && (snapshot || !local || which === 'scripted')) body.append(el('p', 'margin:6px 0;color:#b9c7c4', t(snapshot ? 'lb.empty' : 'lb.preview'))); // the local preview is labelled once, in her row
    else {
      const list = el('ol', 'list-style:none;margin:0;padding:0'); list.className = 'ftf-board-rows';
      for (const r of rows) {
        const li = el('li', 'display:flex;gap:10px;align-items:baseline;padding:5px 0;border-bottom:1px solid rgba(243,234,216,.08)');
        li.dataset.actor = r.actor;
        li.append(el('span', 'width:2.2em;text-align:right;color:#8fe2d6;font-weight:600', String(r.rank)), el('span', 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', r.account),
          el('span', 'font-variant-numeric:tabular-nums;font-weight:600', String(r.score)));
        if (r.flags && r.flags.length) li.append(el('span', 'font-size:11px;color:#ffc861', t('lb.flagged')));
        list.append(li);
      }
      body.append(list);
    }
    if (which === 'human') {
      const y = youLine(snapshot, local, account);
      if (y) {
        const you = el('div', 'margin-top:10px;padding:8px 10px;border-radius:10px;background:rgba(217,178,106,.12)'); you.className = 'ftf-board-you';
        you.append(el('b', 'display:block', t(y.key, y.args)));
        if (y.preview) you.append(el('span', 'display:block;font-size:12px;color:#d9b26a', t('lb.preview')));
        const p = local.parts; you.append(el('span', 'display:block;font-size:12px;color:#b9c7c4', t('lb.parts', { Q: p.Q, Sk: p.Sk, Wl: p.Wl, V: p.V, P: p.P, M: p.M })));
        if (y.differs) you.append(el('span', 'display:block;font-size:12px;color:#ffc861', t('lb.differs', { snap: y.differs.snap, local: y.differs.local })));
        body.append(you);
      }
    }
  };
  for (const [id, key] of [['human', 'lb.tab.human'], ['scripted', 'lb.tab.scripted']]) {
    const b = el('button', 'min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid rgba(143,226,214,.35);color:inherit;font:600 14px system-ui;cursor:pointer', t(key));
    b.type = 'button'; b.dataset.tab = id; b.setAttribute('role', 'tab'); b.addEventListener('click', (e) => { e.stopPropagation(); draw(id); });
    tabs.append(b);
  }
  panel.append(tabs, body);

  const meta = el('div', 'margin-top:12px;font-size:12px;color:#b9c7c4;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center'); meta.className = 'ftf-board-meta';
  if (snapshot) {
    meta.append(el('span', '', t('lb.snapshot', { time: new Date(snapshot.createdAt || 0).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' })));
    const root = el('span', 'font-family:ui-monospace,monospace', t('lb.root', { root: shortRoot(snapshot.root) })); root.className = 'ftf-board-root'; meta.append(root);
    const c = el('button', 'min-height:32px;padding:4px 10px;border-radius:8px;border:1px solid rgba(243,234,216,.3);background:transparent;color:inherit;font:600 12px system-ui;cursor:pointer', t('lb.copy'));
    c.type = 'button'; c.addEventListener('click', (e) => { e.stopPropagation(); try { if (copy) copy(snapshot.root); c.textContent = t('lb.copied'); } catch { /* no clipboard */ } });
    meta.append(c);
  }
  const v = el('a', 'color:#8fe2d6', t('lb.verify')); v.href = VERIFY_URL; v.target = '_blank'; v.rel = 'noopener'; meta.append(v);
  panel.append(meta, el('p', 'margin:10px 0 0;font-size:12px;color:#8a9894', t('lb.footer')));
  draw(tab);
  return { panel, get tab() { return tab; }, select: draw };
}
