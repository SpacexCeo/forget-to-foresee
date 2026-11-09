// Iris's biography at the season's end (readiness audit 09.11, "final biography artifact"): what she remembered,
// what she sacrificed and where each memory went (buyer and price, or burned), the memory-shard NFT when one exists
// on testnet for this playthrough, the season id and outcome, and the season's NEAR record when it is committed;
// otherwise it says plainly that the season is local. Pure (no DOM): play/ui.js renders it, "Copy biography" copies
// biographyText(). Memory texts, ids, hashes and token ids are data and are never translated in the JSON.
import { parseFate, localizeMemoryText, localizeFate, AGENT_IDS } from '../ui/i18n/engine-adapter.js';
import { explorerLinks } from '../net/near.js';
import { NEAR_DEPLOYMENT } from '../net/near-deployment.js';

export const BIOGRAPHY_FORMAT = 'ftf-biography/1';

/** One sacrificed memory's fate from the room's English text: bought (buyer, price), burned, still at auction. */
export function fateOf(text) {
  const ev = parseFate(text || '');
  if (!ev) return { fate: 'unknown', buyer: null, price: null };
  const fate = ev.key.split('.')[1];
  const who = ev.args && ev.args.who && ev.args.who.$agent != null ? AGENT_IDS[ev.args.who.$agent] || null : null;
  return { fate, buyer: fate === 'bought' ? who : null, price: fate === 'bought' ? ev.args.amount ?? null : null };
}

/**
 * The season's NEAR record as the biography states it. Only `committed` (the contract's root equals this season's,
 * checked live) links a transaction as verified; while offline the deployment's recorded commit is labelled recorded.
 */
export function chainOf(status, seasonId, deployment = NEAR_DEPLOYMENT) {
  const st = status && status.seasonId === seasonId ? status.state : null;
  if (st === 'committed') return { state: 'committed', href: status.commitTxUrl || status.contractUrl || null, contractId: status.contractId || null, recordedHref: null };
  if (st === 'checking') return { state: 'checking', href: null, contractId: status.contractId || null, recordedHref: null };
  if (st === 'mismatch') return { state: 'mismatch', href: status.contractUrl || null, contractId: status.contractId || null, recordedHref: null };
  if (st === 'offline') {
    const rec = deployment && deployment.seasons ? deployment.seasons[seasonId] : null;
    return { state: 'offline', href: null, contractId: status.contractId || null, recordedHref: rec && rec.commitTx ? explorerLinks(deployment, { txHash: rec.commitTx }).tx : null };
  }
  return { state: 'local', href: null, contractId: null, recordedHref: null };
}

/**
 * @param {object} o
 * @param {object} o.obs           the controller's observation (season over)
 * @param {object} [o.nearStatus]  the NEAR watcher's status (net/near.js)
 * @param {{cards: Array<{shard: object, card: object}>}} [o.shards]  shard-card-model.js shardCards()
 * @param {object} [o.deployment]
 */
export function biographyModel({ obs, nearStatus = null, shards = null, deployment = NEAR_DEPLOYMENT }) {
  const s = obs.season;
  const iris = obs.iris || {};
  const shardList = ((shards && shards.cards) || [])
    .filter((c) => c.shard && c.shard.from === 'iris' && c.card && c.card.state === 'minted')
    .map(({ card }) => ({ tokenId: card.tokenId, contractId: card.contractId, owner: card.owner, buyer: card.winner || null, price: card.price ?? null, url: card.tokenHref }));
  return {
    format: BIOGRAPHY_FORMAT,
    game: 'Forget to Foresee',
    seasonId: s.seasonId || null,
    rules: s.rules || null,
    outcome: s.outcome || null,
    heir: s.heir ?? null,
    remembered: (obs.memories || []).map((m) => ({ text: m.text, kind: m.kind, weight: m.weight })),
    sacrificed: (iris.forgotten || []).map((f) => ({ text: f.text, ...fateOf(f.fate), fateText: f.fate })),
    shards: shardList,
    chain: { ...chainOf(nearStatus, s.seasonId, deployment), merkleRoot: s.merkleRoot || null },
    local: true, // the season itself ran in this browser tab
  };
}

const CHAIN_KEYS = { committed: 'bio.chain.committed', checking: 'bio.chain.checking', offline: 'bio.chain.offline', mismatch: 'bio.chain.mismatch', local: 'bio.chain.local' };
export const chainKey = (state) => CHAIN_KEYS[state] || CHAIN_KEYS.local;

/**
 * Display lines for the end panel and the copied text, in the player's language.
 * @param {object} b  biographyModel()
 * @param {(key: string, args?: object) => string} t  play renderer (renderMsg)
 * @param {object} i18n
 */
export function biographyLines(b, t, i18n) {
  return {
    season: t('bio.season', { id: b.seasonId || '—' }),
    outcome: t('goal.season_over', { outcome: b.outcome }),
    remembered: b.remembered.map((m) => localizeMemoryText(m.text, i18n)),
    sacrificed: b.sacrificed.map((m) => localizeMemoryText(m.text, i18n) + ' — ' + localizeFate(m.fateText, i18n)),
    shards: b.shards.map((x) => ({ text: t('bio.shard', { token: x.tokenId, owner: x.owner || '—' }), href: x.url })),
    chain: { text: t(chainKey(b.chain.state)), href: b.chain.href, recorded: b.chain.recordedHref ? { text: t('bio.chain.recorded'), href: b.chain.recordedHref } : null },
    note: t('season.local.note'),
  };
}

/** "Copy biography": a short shareable text (localized) with the season id and the links. */
export function biographyText(b, t, i18n) {
  const L = biographyLines(b, t, i18n);
  const out = [t('bio.heading'), L.season, L.outcome, '', t('bio.remembered') + ':'];
  out.push(...(L.remembered.length ? L.remembered.map((x) => '✓ ' + x) : ['— ' + t('bio.none')]));
  out.push('', t('bio.sacrificed') + ':');
  out.push(...(L.sacrificed.length ? L.sacrificed.map((x) => '✕ ' + x) : ['— ' + t('bio.none')]));
  if (L.shards.length) { out.push(''); for (const x of L.shards) out.push(x.text + (x.href ? ' ' + x.href : '')); }
  out.push('', L.chain.text + (L.chain.href ? ' ' + L.chain.href : ''));
  if (L.chain.recorded) out.push(L.chain.recorded.text + ' ' + L.chain.recorded.href);
  if (b.chain.merkleRoot) out.push(t('bio.root', { root: b.chain.merkleRoot }));
  out.push(L.note);
  return out.join('\n') + '\n';
}
