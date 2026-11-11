// Profile and inventory (docs/agent-rental-plan.md): Iris's portrait, level, XP bar, cosmetic title and stats, and an
// inventory in two sections. On-chain (NEAR testnet, read-only): only what a chain read confirms right now, the judge
// season's memory shards on ftf-shards.testnet, each with token id, owner and explorer link; nothing when the read
// fails. Off-chain (this browser): town silk, season silk, hired agents, memories, words, quest items, the title.
import { createShardNftClient } from '../net/shard-nft.js';
import { NEAR_DEPLOYMENT } from '../net/near-deployment.js';

const CSS = `
.ftf-prof { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; background: rgba(6, 10, 12, .6); font: 15px/1.45 system-ui, sans-serif; color: #f3ead6; }
.ftf-prof-panel { width: min(680px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow: auto; box-sizing: border-box; padding: 18px 20px; border-radius: 14px; background: rgba(14, 20, 22, .95); border: 1px solid rgba(233, 180, 76, .45); }
.ftf-prof-head { display: flex; gap: 16px; align-items: center; }
.ftf-prof-head img { width: 64px; height: 180px; object-fit: contain; }
.ftf-prof h2 { margin: 0; font: 600 22px/1.2 Georgia, serif; }
.ftf-prof h3 { margin: 14px 0 6px; font: 600 13px/1.2 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #e9b44c; }
.ftf-prof .ftf-prof-bar { height: 8px; border-radius: 4px; background: rgba(255, 255, 255, .1); overflow: hidden; margin: 6px 0; width: 260px; max-width: 100%; }
.ftf-prof .ftf-prof-bar i { display: block; height: 100%; background: #e9b44c; }
.ftf-prof dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 14px; margin: 0; }
.ftf-prof dt { color: #a8a194; } .ftf-prof dd { margin: 0; word-break: break-word; }
.ftf-prof .ftf-prof-note { color: #a8a194; font-size: 13px; margin: 4px 0; }
.ftf-prof a { color: #e9b44c; }
.ftf-prof button { min-height: 40px; padding: 4px 14px; border-radius: 8px; border: 1px solid rgba(233, 180, 76, .6); background: rgba(233, 180, 76, .9); color: #1d1708; font: 500 15px system-ui, sans-serif; cursor: pointer; margin-top: 12px; }
`;

/**
 * Reads the on-chain items: the judge season's shards that the contract confirms. Resolves {state, items}.
 * state: 'loaded' | 'offline' | 'disabled'. Never invents an item.
 */
export async function readOnChain({ deployment = NEAR_DEPLOYMENT, fetch = globalThis.fetch } = {}) {
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

/**
 * @param {{doc?: Document, t: Function, ledger: object, quest?: object|null, obs?: () => object|null, onChain?: Promise}} o
 */
export function openProfile({ doc = document, t, ledger, quest = null, obs = () => null, onChain = null }) {
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
  const img = el('img'); img.src = 'assets/ui/loading_iris.webp'; img.alt = '';
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

  // On-chain: confirmed by a read, or nothing
  panel.append(el('h3', null, t('inv.onchain')));
  const chainBox = el('div');
  chainBox.append(el('p', 'ftf-prof-note', t('inv.onchain.checking')));
  panel.append(chainBox);
  (onChain || readOnChain()).then((r) => {
    chainBox.replaceChildren();
    if (r.state !== 'loaded' || !r.items.length) { chainBox.append(el('p', 'ftf-prof-note', t(r.state === 'offline' ? 'inv.onchain.offline' : 'inv.onchain.none'))); return; }
    chainBox.append(el('p', 'ftf-prof-note', t('inv.onchain.note')));
    for (const it of r.items) {
      const p = el('p'); const a = el('a', null, it.tokenId); a.href = it.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      p.append(a, doc.createTextNode(' · ' + (it.label ? it.label + ' · ' : '') + t('inv.owner', { owner: it.owner || '—' })));
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
  panel.append(el('p', 'ftf-prof-note', t('hire.local')));
  const cb = el('button', null, t('quest.close')); cb.type = 'button'; cb.addEventListener('click', close); panel.append(cb);
  cb.focus();
  return { root, close };
}
