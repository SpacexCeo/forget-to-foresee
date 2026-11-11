// "Verified in TEE" detail panel (docs/tee.md): what produced a townsperson's line or a trader's decision, the
// signature this browser re-checked, and the relayer's attestation summary. Plain DOM, no play imports (a ui -> play
// static import is a boot cycle): the caller passes `t` (i18n) and the proof.
const REPO_DOC = 'https://github.com/SpacexCeo/forget-to-foresee/blob/main/docs/tee.md';
const CSS = `.ftf-tee { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(8,12,14,.55); }
.ftf-tee > section { width: min(560px, calc(100% - 32px)); max-height: calc(100% - 48px); overflow: auto; padding: 16px 18px; border-radius: 12px;
  background: #141b1d; color: #f3ead6; border: 1px solid rgba(233,180,76,.5); font: 15px/1.45 system-ui, sans-serif; box-shadow: 0 12px 40px rgba(0,0,0,.5); }
.ftf-tee h3 { margin: 0 0 6px; font: 600 13px/1.3 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #e9b44c; }
.ftf-tee p { margin: 0 0 10px; }
.ftf-tee dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; margin: 0 0 12px; font-size: 14px; }
.ftf-tee dt { color: #b9b2a2; } .ftf-tee dd { margin: 0; overflow-wrap: anywhere; }
.ftf-tee code { font: 12px ui-monospace, monospace; }
.ftf-tee .ftf-tee-row { display: flex; flex-wrap: wrap; gap: 8px; }
.ftf-tee button, .ftf-tee a.ftf-tee-btn { min-height: 36px; padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(233,180,76,.6); background: rgba(233,180,76,.14);
  color: #f3ead6; font: 14px system-ui, sans-serif; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
.ftf-tee .ok { color: #9fd49a; } .ftf-tee .bad { color: #f0a08a; }`;

const short = (s, n = 10) => (s && s.length > 2 * n + 1 ? s.slice(0, n) + '…' + s.slice(-6) : s || '—');

/**
 * Opens the panel. Returns {close}.
 * @param {{doc?: Document, t: (k: string, a?: object) => string, tee: object, check: object, extra?: Node[], onClose?: Function}} o
 */
export function openTeePanel({ doc = globalThis.document, t, tee, check, extra = [], onClose = null }) {
  if (!doc.getElementById('ftf-tee-css')) { const s = doc.createElement('style'); s.id = 'ftf-tee-css'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const mark = (ok) => el('span', ok ? 'ok' : 'bad', ok ? '✓' : '✗');
  const root = el('div', 'ftf-tee'); const box = el('section');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('tee.panel.title'));
  const a = (tee && tee.attestation) || {}, sum = a.summary || {}, ch = a.checks || {};
  const dl = el('dl');
  const row = (k, v) => { const dd = el('dd'); for (const x of [].concat(v)) dd.append(typeof x === 'string' ? doc.createTextNode(x) : x); dl.append(el('dt', null, t(k)), dd); };
  const code = (s) => el('code', null, s);
  row('tee.panel.model', tee.model || '—');
  row('tee.panel.provider', tee.provider || 'NEAR AI Cloud');
  row('tee.panel.chat', code(short(tee.chat_id, 14)));
  row('tee.panel.signer', code(short(tee.signing_address, 8)));
  row('tee.panel.signature', [mark(!!(check && check.ok)), ' ', t(check && check.ok ? 'tee.panel.sigOk' : 'tee.panel.sigBad')]);
  row('tee.panel.quote', [mark(ch.tdx_quote === true && ch.report_data_binds_address === true), ' ', t('tee.panel.quoteLine')]);
  row('tee.panel.gpu', [mark(ch.gpu_nonce !== false && ch.gpu_verdict !== false), ' ', t('tee.panel.gpuLine', { arch: sum.gpu_arch || '—' })]);
  row('tee.panel.compose', [mark(ch.compose_hash_measured === true), ' ', code(short(sum.compose_hash, 8))]);
  if (a.checked_at) row('tee.panel.checked', new Date(a.checked_at).toLocaleString());
  const btns = el('div', 'ftf-tee-row');
  const copy = el('button', null, t('tee.panel.copy')); copy.type = 'button';
  copy.addEventListener('click', () => {
    const text = JSON.stringify({ tee }, null, 2);
    try { (globalThis.navigator && navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => { copy.textContent = t('tee.panel.copied'); }, () => { if (globalThis.prompt) globalThis.prompt('', text); }); } catch { /* no clipboard */ }
  });
  const how = el('a', 'ftf-tee-btn', t('tee.panel.how')); how.href = REPO_DOC; how.target = '_blank'; how.rel = 'noopener noreferrer';
  const close = el('button', null, t('tee.panel.close')); close.type = 'button';
  btns.append(copy, how, close);
  box.append(el('h3', null, t('tee.panel.title')), el('p', null, t('tee.panel.explain', { model: tee.model || '—' })), dl, ...extra, el('p', null, t('tee.panel.verifyCmd')), btns);
  root.append(box);
  let done = false;
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(); } };
  function finish() { if (done) return; done = true; root.remove(); doc.removeEventListener('keydown', onKey, true); if (onClose) onClose(); }
  close.addEventListener('click', finish);
  root.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === root) finish(); });
  root.addEventListener('keydown', (e) => e.stopPropagation());
  doc.addEventListener('keydown', onKey, true);
  doc.body.append(root);
  if (close.focus) close.focus();
  return { close: finish, root };
}
