// The season replay screen (`?replay=r1.…`, net/replay.js): replays the linked commands in a fresh local room and
// shows where the season ended, its Merkle root and the NEAR check. The root is compared with the recorded commitment
// at once (the published judge season only) and then re-read live from ftf-seasons.testnet when the RPC answers.
// Any other season was never committed: the screen says so instead of showing a check.
import { decodeReplay, runReplay, rootCheck } from '../net/replay.js';
import { createNearClient } from '../net/near.js';
import { NEAR_DEPLOYMENT } from '../net/near-deployment.js';

const CSS = `
.ftf-replay { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; background: rgba(6, 10, 12, .7); font: 15px/1.45 system-ui, sans-serif; color: #f3ead6; }
.ftf-replay-panel { width: min(640px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow: auto; box-sizing: border-box; padding: 18px 20px; border-radius: 14px; background: rgba(14, 20, 22, .95); border: 1px solid rgba(233, 180, 76, .45); }
.ftf-replay h2 { margin: 0 0 6px; font: 600 22px/1.2 Georgia, serif; }
.ftf-replay dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 10px 0; }
.ftf-replay dt { color: #9d968a; }
.ftf-replay dd { margin: 0; word-break: break-all; }
.ftf-replay .ftf-replay-mono { font: 13px ui-monospace, Consolas, monospace; }
.ftf-replay .ftf-replay-check { padding: 8px 10px; border-radius: 8px; background: rgba(233, 180, 76, .12); }
.ftf-replay .ftf-replay-check[data-state="match"] { background: rgba(110, 190, 120, .18); }
.ftf-replay .ftf-replay-check[data-state="mismatch"] { background: rgba(220, 90, 80, .2); }
.ftf-replay a { color: #e9b44c; }
.ftf-replay button { min-height: 40px; padding: 4px 14px; border-radius: 8px; border: 1px solid rgba(233, 180, 76, .6); background: rgba(233, 180, 76, .9); color: #1d1708; font: 500 15px system-ui, sans-serif; cursor: pointer; margin-top: 8px; }
`;

/**
 * @param {{param: string, i18n: {t: Function}, doc?: Document, fetch?: Function, deployment?: object}} o
 * @returns {{root: HTMLElement, result: object|null, live: Promise<string>}}
 */
export function openReplayView({ param, i18n, doc = document, fetch = globalThis.fetch, deployment = NEAR_DEPLOYMENT }) {
  if (!doc.getElementById('ftf-replay-style')) { const st = doc.createElement('style'); st.id = 'ftf-replay-style'; st.textContent = CSS; doc.head.append(st); }
  const t = (k, a) => i18n.t(k, a);
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('div', 'ftf-replay'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('replay.title'));
  const panel = el('div', 'ftf-replay-panel'); root.append(panel);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  const close = () => root.remove();
  root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  doc.body.append(root);

  const data = decodeReplay(param);
  const result = data ? runReplay(data, { deployment }) : null;
  const closeBtn = el('button', null, t('replay.close')); closeBtn.type = 'button'; closeBtn.addEventListener('click', close);
  if (!result || !result.season) {
    panel.append(el('h2', null, t('replay.title')), el('p', null, t('replay.invalid')), closeBtn);
    closeBtn.focus();
    return { root, result: null, live: Promise.resolve('invalid') };
  }
  const s = result.season;
  const state = rootCheck(result);
  const check = el('p', 'ftf-replay-check'); check.dataset.state = state;
  check.textContent = t('replay.check.' + state);
  const dl = el('dl');
  const row = (k, v, mono = false) => { dl.append(el('dt', null, t(k)), el('dd', mono ? 'ftf-replay-mono' : null, v)); };
  row('replay.commands', t('replay.applied', { n: result.applied, total: data.commands.length }));
  row('replay.where', s.outcome ? t('replay.ended', { tick: s.tick, outcome: s.outcome }) : t('replay.atTrial', { tick: s.tick }));
  if (s.silk != null) row('replay.silk', String(s.silk));
  row('replay.season', s.seasonId, true);
  row('replay.root', s.merkleRoot, true);
  row('replay.seed', data.seedHex, true);
  panel.append(el('h2', null, t('replay.title')), el('p', null, t('replay.intro')), dl, check);
  if (result.committed) {
    const a = el('a', null, t('replay.commitTx')); a.href = `${result.committed.explorer.replace(/\/$/, '')}/txns/${result.committed.commitTx}`; a.target = '_blank'; a.rel = 'noopener noreferrer';
    const p = el('p'); p.append(a); panel.append(p);
  }
  const liveLine = el('p', 'ftf-replay-live'); panel.append(liveLine, closeBtn);
  closeBtn.focus();

  // the live re-read: only for a committed season, never claimed before the chain answers
  let live = Promise.resolve('skipped');
  if (result.committed && deployment.contractId && typeof fetch === 'function') {
    liveLine.textContent = t('replay.live.checking');
    live = createNearClient({ contractId: deployment.contractId, rpcUrls: deployment.rpcUrls, fetch, timeoutMs: 8000 }).getSeason(s.seasonId)
      .then((v) => { const ok = v && v.schedule_root === s.merkleRoot; liveLine.textContent = t(ok ? 'replay.live.match' : 'replay.live.mismatch'); return ok ? 'match' : 'mismatch'; })
      .catch(() => { liveLine.textContent = t('replay.live.offline'); return 'offline'; });
  }
  return { root, result, live };
}
