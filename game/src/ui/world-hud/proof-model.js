// "What does this prove?" (readiness audit 09.11): the pure model behind the proof panel on a revealed sign.
// It turns net/near.js verificationView() into a visible state line and two honest lists: what the proof shows
// and what it does not. No DOM here (proof-panel.js renders it); every text is a wh.proof.* key in all five
// locales. Hashes stay hex: they are never translated.
import { verificationView } from '../../net/near.js';

/** The state line shown on the card when the existing NEAR pill does not already say it. */
export const STATE_KEYS = Object.freeze({
  local: 'wh.proof.state.local',
  checking: 'wh.proof.state.checking',
  offline: 'wh.proof.state.offline',
  'not-committed': 'wh.proof.state.notCommitted',
  'season-mismatch': 'wh.proof.state.seasonMismatch',
  missing: 'wh.proof.state.missing',
  unavailable: 'wh.proof.state.unavailable',
});

/** `03dbd458…5075769a`: enough to compare with the explorer, short enough for a card. */
export const shortHash = (h) => (typeof h === 'string' && h.length > 20 ? `${h.slice(0, 8)}…${h.slice(-8)}` : h || '—');

const COMMITTED = new Set(['on-chain', 'dry-run', 'mismatch', 'missing', 'unavailable', 'checking', 'offline']);

/**
 * @param {object} v  a verificationView()
 * @returns {{state: string, tone: 'wait'|'good'|'bad'|'muted', line: {key: string, args: object}|null,
 *   recorded: {key: string, href: string}|null, proves: Array<{key: string, args?: object, tone?: string, href?: string, linkKey?: string}>,
 *   notProves: Array<{key: string}>, index: number}}
 */
export function proofPanelModel(v) {
  const local = v.local === 'ok' ? 'ok' : 'fail';
  const root = shortHash(v.merkleRoot);
  const committed = v.live && COMMITTED.has(v.state) && (v.commitTxUrl || v.commitBlock);
  const proves = [];
  if (committed) {
    proves.push({ key: 'wh.proof.yes.committed', args: { root, block: v.commitBlock || '—' }, href: v.commitTxUrl || v.contractUrl || null, linkKey: 'wh.proof.link.commit' });
  } else {
    proves.push({ key: 'wh.proof.yes.sealed', args: { root } });
  }
  proves.push(local === 'ok' ? { key: 'wh.proof.yes.leaf', tone: 'good' } : { key: 'wh.proof.fail.leaf', tone: 'bad' });
  if (v.state === 'on-chain') proves.push({ key: 'wh.proof.yes.onchain', tone: 'good', href: v.revealTxUrl || v.contractUrl || null, linkKey: 'wh.proof.link.reveal' });
  else if (v.state === 'dry-run') proves.push({ key: 'wh.proof.yes.dryrun', href: v.contractUrl || null, linkKey: 'wh.proof.link.contract' });
  else if (v.state === 'mismatch') proves.push({ key: 'wh.proof.fail.onchain', tone: 'bad', href: v.contractUrl || null, linkKey: 'wh.proof.link.contract' });
  const tone = v.state === 'checking' ? 'wait'
    : v.state === 'season-mismatch' || v.state === 'mismatch' || local === 'fail' ? 'bad'
      : v.state === 'on-chain' || v.state === 'dry-run' ? 'good' : 'muted';
  return {
    index: v.index,
    state: v.state,
    tone,
    line: v.pill ? null : { key: STATE_KEYS[v.state] || STATE_KEYS.local, args: { local } },
    // only while the network is down, and labelled as the deployment's record: never a live answer
    recorded: v.recordedTxUrl ? { key: 'wh.proof.recorded', href: v.recordedTxUrl } : null,
    proves,
    notProves: [{ key: 'wh.proof.no.rules' }, { key: 'wh.proof.no.state' }, { key: 'wh.proof.no.fair' }],
  };
}

/**
 * Adds `proofView` (verificationView) to every resolved sign card of a world-HUD model and refreshes its NEAR pill.
 * The model builder (from-obs.js) memoises the signs by observation version, so a NEAR answer that arrives between
 * observations would otherwise never reach the card; here the signs object is replaced only when a state changed.
 * @param {object} model  buildHudModel() output (mutated: `model.signs` may be replaced)
 * @param {{near?: object|null, merkleRoot?: string|null}} o
 */
export function attachProofViews(model, { near = null, merkleRoot = null } = {}) {
  const signs = model && model.signs;
  if (!signs || !Array.isArray(signs.items)) return model;
  const views = signs.items.map((s) => {
    if (!s.proof || (s.verified !== 'ok' && s.verified !== 'fail')) return null;
    const v = near && near.verification ? near.verification(s.proof.index, s.verified, merkleRoot)
      : verificationView(null, null, { index: s.proof.index, local: s.verified, merkleRoot });
    return { v, badge: near && near.leafBadge ? near.leafBadge(s.proof.index) : null };
  });
  const key = views.map((x) => (x ? [x.v.index, x.v.state, x.v.local, x.v.commitBlock || '', x.v.recordedTxUrl ? 'r' : '', x.badge ? x.badge.state : ''].join(':') : '-')).join(',');
  if (signs._proofKey === key) return model;
  const items = signs.items.map((s, i) => (views[i] ? { ...s, proofView: views[i].v, near: views[i].badge } : s));
  model.signs = Object.defineProperty({ ...signs, items }, '_proofKey', { value: key });
  return model;
}
