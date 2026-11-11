// Profile and inventory (docs/agent-rental-plan.md): Iris's portrait, level, XP bar, cosmetic title and stats, and an
// inventory in two sections. On-chain (NEAR testnet, read-only): only what a chain read confirms right now, the judge
// season's memory shards on ftf-shards.testnet, each with token id, owner and explorer link; nothing when the read
// fails. Off-chain (this browser): town silk, season silk, hired agents, memories, words, quest items, the title.
import { createShardNftClient } from '../net/shard-nft.js';
import { NEAR_DEPLOYMENT } from '../net/near-deployment.js';
import { DAY1_DEPLOYMENT } from '../net/day1-deployment.js';
import { createTxClient } from '../net/near-tx.js';

const CSS = `
.ftf-prof { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; background: rgba(6, 10, 12, .6); font: 15px/1.45 system-ui, sans-serif; color: #f3ead6; }
.ftf-prof-panel { width: min(680px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow: auto; box-sizing: border-box; padding: 18px 20px; border-radius: 14px; background: rgba(14, 20, 22, .95); border: 1px solid rgba(233, 180, 76, .45); }
.ftf-prof-head { display: flex; gap: 16px; align-items: center; }
.ftf-prof-head img { width: 96px; height: 144px; object-fit: cover; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,.35); }
.ftf-prof-chain { display: flex; gap: 10px; align-items: center; margin: 6px 0; }
.ftf-prof-chain img { width: 40px; height: 60px; object-fit: cover; border-radius: 6px; }
.ftf-prof h2 { margin: 0; font: 600 22px/1.2 Georgia, serif; }
.ftf-prof h3 { margin: 14px 0 6px; font: 600 13px/1.2 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #e9b44c; }
.ftf-prof .ftf-prof-bar { height: 8px; border-radius: 4px; background: rgba(255, 255, 255, .1); overflow: hidden; margin: 6px 0; width: 260px; max-width: 100%; }
.ftf-prof .ftf-prof-bar i { display: block; height: 100%; background: #e9b44c; }
.ftf-prof dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 14px; margin: 0; }
.ftf-prof dt { color: #a8a194; } .ftf-prof dd { margin: 0; word-break: break-word; }
.ftf-prof .ftf-prof-note { color: #a8a194; font-size: 13px; margin: 4px 0; }
.ftf-prof a { color: #e9b44c; }
.ftf-prof select { min-height: 36px; margin: 4px 0; background: #1c2426; color: #f3ead6; border: 1px solid rgba(233, 180, 76, .5); border-radius: 6px; }
.ftf-prof button { min-height: 40px; padding: 4px 14px; border-radius: 8px; border: 1px solid rgba(233, 180, 76, .6); background: rgba(233, 180, 76, .9); color: #1d1708; font: 500 15px system-ui, sans-serif; cursor: pointer; margin-top: 12px; }
`;

/**
 * Reads the on-chain items: the judge season's shards that the contract confirms. Resolves {state, items}.
 * state: 'loaded' | 'offline' | 'disabled'. Never invents an item.
 */
export async function readOnChain({ deployment = NEAR_DEPLOYMENT, fetch = globalThis.fetch, owner = null, day1 = DAY1_DEPLOYMENT } = {}) {
  // Day 1: the player's own Elise, read from the heroine contract (only what it returns for the guest account)
  const mine = [];
  if (owner && day1 && day1.heroine && typeof fetch === 'function') {
    try {
      const list = await createTxClient({ rpcUrls: deployment.rpcUrls, fetch, timeoutMs: 8000 }).view(day1.heroine, 'nft_tokens_for_owner', { account_id: owner });
      const explorer = (deployment.explorer || 'https://testnet.nearblocks.io').replace(/\/$/, '');
      for (const t of list || []) mine.push({ kind: 'heroine', mine: true, tokenId: t.token_id, owner: t.owner_id, contractId: day1.heroine, href: `${explorer}/nft-token/${day1.heroine}/${t.token_id}`, label: (t.metadata && t.metadata.title) || 'Elise' });
    } catch { /* the shard read below still runs; nothing invented */ }
  }
  const shards = await readShards({ deployment, fetch });
  return { state: shards.state === 'loaded' || mine.length ? 'loaded' : shards.state, items: [...mine, ...shards.items] };
}

async function readShards({ deployment = NEAR_DEPLOYMENT, fetch = globalThis.fetch } = {}) {
  const seasons = Object.keys((deployment && deployment.shardMints) || {});
  if (!deployment || !deployment.shardContractId || !seasons.length || typeof fetch !== 'function') return { state: 'disabled', items: [] };
  try {
    const client = createShardNftClient({ contractId: deployment.shardContractId, rpcUrls: deployment.rpcUrls, fetch, timeoutMs: 8000 });
    const items = [];
    const explorer = (deployment.explorer || 'https://testnet.nearblocks.io').replace(/\/$/, '');
    for (const sid of seasons) for (const t of (await client.shardsOfSeason(sid)) || []) items.push({ kind: 'shard', tokenId: t.token_id, owner: t.owner_id || null, contractId: deployment.shardContractId, href: `${explorer}/nft-token/${deployment.shardContractId}/${t.token_id}`, label: t.data ? `${t.data.owner_clan} · ${t.data.kind}` : '' });
    return { state: 'loaded', items };
  } catch {
    return { state: 'offline', items: [] };
  }
}

/** Rolling mean of the last 10 values (an agent's learning curve). */
const rolling = (xs) => xs.map((_, i) => { const w = xs.slice(Math.max(0, i - 9), i + 1); return w.reduce((s, x) => s + x, 0) / w.length; });
/** A small line chart. */
function spark(doc, values, w, h) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg'); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('aria-hidden', 'true'); svg.style.verticalAlign = 'middle';
  if (values.length > 1) {
    const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    const pl = doc.createElementNS(NS, 'polyline');
    pl.setAttribute('points', values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 2 - ((v - lo) / span) * (h - 4)}`).join(' '));
    pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#e9b44c'); pl.setAttribute('stroke-width', '1.6'); svg.append(pl);
  }
  return svg;
}

/**
 * @param {{doc?: Document, t: Function, ledger: object, quest?: object|null, obs?: () => object|null, onChain?: Promise}} o
 */
export function openProfile({ doc = document, t, ledger, quest = null, obs = () => null, onChain = null, owner = null, exportKey = null }) {
  if (!doc.getElementById('ftf-prof-style')) { const st = doc.createElement('style'); st.id = 'ftf-prof-style'; st.textContent = CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('div', 'ftf-prof'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('profile.title'));
  const panel = el('div', 'ftf-prof-panel'); root.append(panel);
  const close = () => { root.remove(); };
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  doc.body.append(root);
  const lv = ledger.level, st = ledger.stats, o = obs();
  const dl = (rows) => { const d = el('dl'); for (const [k, v] of rows) d.append(el('dt', null, k), el('dd', null, v)); return d; };

  const head = el('div', 'ftf-prof-head');
  const img = el('img'); img.src = 'assets/cards/iris.webp'; img.alt = '';
  const info = el('div');
  const bar = el('div', 'ftf-prof-bar'); const fill = el('i'); fill.style.width = Math.round((lv.into / lv.need) * 100) + '%'; bar.append(fill);
  info.append(el('h2', null, t('profile.heading', { level: lv.level, title: t('profile.title.' + lv.title) })), bar, el('p', 'ftf-prof-note', t('profile.xp', { into: lv.into, need: lv.need })), el('p', 'ftf-prof-note', t('profile.titlesNote')));
  head.append(img, info);
  panel.append(head);

  panel.append(el('h3', null, t('profile.stats')), dl([
    [t('profile.stat.signsRead'), String(st.signsRead)], [t('profile.stat.trialsVerified'), String(st.trialsVerified)],
    [t('profile.stat.memoriesForgotten'), String(st.memoriesForgotten)], [t('profile.stat.agentsHired'), String(st.agentsHired)],
    [t('profile.stat.net'), (st.net >= 0 ? '+' : '') + (st.net / 100).toFixed(2)],
  ]));

  // Player stats from the town ledger: rounds, win rate, best agent, return per agent, the equity curve
  const best = ledger.bestAgent();
  panel.append(dl([
    [t('profile.stat.rounds'), String(st.rounds || 0)],
    [t('profile.stat.winRate'), st.rounds ? Math.round((100 * st.wins) / st.rounds) + ' %' : '—'],
    [t('profile.stat.bestAgent'), best ? t('profile.agentLine', { name: t('folk.name.' + best.npc), pct: (best.measured * 100).toFixed(1), exp: best.experience }) : '—'],
  ]));
  panel.append(el('p', 'ftf-prof-note', t('profile.equity')), spark(doc, ledger.equity, 260, 40));
  const known = ledger.agentsKnown();
  if (known.length) {
    panel.append(el('h3', null, t('profile.agents')));
    for (const npc of known) {
      const a = ledger.agent(npc);
      const row = el('p'); row.append(doc.createTextNode(t('profile.agentLine', { name: t('folk.name.' + npc), pct: a.measured == null ? '—' : (a.measured * 100).toFixed(1), exp: a.experience }) + ' '), spark(doc, rolling(a.recent), 120, 20));
      panel.append(row);
    }
  }
  // Open trades (active hires, rounds revealed so far) and the ones closed in this session
  panel.append(el('h3', null, t('open.heading')));
  const open = ledger.hires();
  if (!open.length) panel.append(el('p', 'ftf-prof-note', t('open.none')));
  for (const h of open) panel.append(el('p', null, t('open.line', { name: t('folk.name.' + h.npc), done: h.done, total: h.rounds, u: (h.unrealised / 100).toFixed(2) })));
  for (const c of ledger.closed) panel.append(el('p', 'ftf-prof-note', t('closed.line', { name: t('folk.name.' + c.npc), net: (c.net >= 0 ? '+' : '') + (c.net / 100).toFixed(2), n: c.rounds })));
  // The trade log, filterable by agent
  panel.append(el('h3', null, t('log.heading')));
  const sel = el('select'); sel.setAttribute('aria-label', t('log.filter'));
  sel.append(new (doc.defaultView || globalThis).Option(t('log.all'), ''));
  for (const npc of known) sel.append(new (doc.defaultView || globalThis).Option(t('folk.name.' + npc), npc));
  const logBox = el('div');
  const drawLog = () => {
    logBox.replaceChildren();
    const lines = ledger.log(sel.value || null).slice(0, 40);
    if (!lines.length) logBox.append(el('p', 'ftf-prof-note', t('open.none')));
    for (const l of lines) logBox.append(el('p', 'ftf-prof-note', t('log.line', { time: new Date(l.at).toLocaleTimeString(), name: t('folk.name.' + l.npc), echo: t('exch.echo.' + l.echo), side: t('log.side.' + l.side), size: l.size, entry: (l.entry / 100).toFixed(2), exit: (l.exit / 100).toFixed(2), result: (l.result >= 0 ? '+' : '') + (l.result / 100).toFixed(2), reason: t('log.reason.' + l.reason) })));
  };
  sel.addEventListener('change', drawLog); drawLog();
  panel.append(sel, logBox);

  // On-chain: confirmed by a read, or nothing
  panel.append(el('h3', null, t('inv.onchain')));
  const chainBox = el('div');
  chainBox.append(el('p', 'ftf-prof-note', t('inv.onchain.checking')));
  panel.append(chainBox);
  (onChain || readOnChain({ owner })).then((r) => {
    chainBox.replaceChildren();
    if (r.state !== 'loaded' || !r.items.length) { chainBox.append(el('p', 'ftf-prof-note', t(r.state === 'offline' ? 'inv.onchain.offline' : 'inv.onchain.none'))); return; }
    chainBox.append(el('p', 'ftf-prof-note', t('inv.onchain.note')));
    for (const it of r.items) {
      const p = el('p', it.kind === 'heroine' ? 'ftf-prof-chain' : null); const a = el('a', null, it.tokenId);
      if (it.kind === 'heroine') { const th = el('img'); th.src = 'assets/cards/elise.webp'; th.alt = ''; p.append(th); } a.href = it.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      p.append(a, doc.createTextNode(' · ' + (it.mine ? t('inv.elise') + ' · ' : it.label ? it.label + ' · ' : '') + t('inv.owner', { owner: it.owner || '—' })));
      chainBox.append(p);
    }
  });

  // Off-chain: this browser
  const hires = ledger.hires();
  const mem = o && o.memories ? o.memories.length : null, forgotten = o && o.iris && o.iris.forgotten ? o.iris.forgotten.length : null;
  const words = o && o.dictionary && Array.isArray(o.dictionary.cells) ? o.dictionary.cells.filter((c) => c && c.known != null).length : null;
  panel.append(el('h3', null, t('inv.offchain')), el('p', 'ftf-prof-note', t('inv.offchain.note')), dl([
    [t('inv.townSilk'), (ledger.silk / 100).toFixed(2)],
    [t('inv.seasonSilk'), o && o.iris ? String(o.iris.silk) : t('inv.noSeason')],
    [t('inv.hires'), hires.length ? hires.map((h) => t('folk.name.' + h.npc) + (h.ready ? ' ✓' : '…')).join(', ') : t('inv.none')],
    [t('inv.memories'), mem == null ? t('inv.noSeason') : t('inv.memoriesLine', { kept: mem, forgotten: forgotten ?? 0 })],
    [t('inv.words'), words == null ? t('inv.noSeason') : String(words)],
    [t('inv.questItems'), quest && quest.items && quest.items.length ? quest.items.map((i) => t('inv.item.' + i)).join(', ') : t('inv.none')],
    [t('inv.cosmetics'), t('profile.title.' + lv.title)],
  ]));
  if (exportKey) {
    // Day 1: the player's testnet key lives in this browser; a copy keeps the guest account if the browser data goes
    const kb = el('button', null, t('profile.exportKey')); kb.type = 'button'; kb.style.marginRight = '8px';
    kb.addEventListener('click', async () => { try { await navigator.clipboard.writeText(exportKey()); kb.textContent = t('profile.exportKey.done'); } catch { kb.textContent = t('profile.exportKey.failed'); } });
    panel.append(el('p', 'ftf-prof-note', t('profile.exportKey.note')), kb);
  }
  panel.append(el('p', 'ftf-prof-note', t('hire.local')));
  const cb = el('button', null, t('quest.close')); cb.type = 'button'; cb.addEventListener('click', close); panel.append(cb);
  cb.focus();
  return { root, close };
}
