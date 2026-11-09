// The proof block of a revealed sign card: the visible NEAR state line (waiting, offline, local, mismatch…), a
// "recorded" link while the network is down, and the expandable "What does this prove?" panel with "Copy proof".
// Model: proof-model.js. The block lives inside the card (role=button), so clicks and keys stop here and never open
// the sign; the panel's open state survives the list re-rendering on every observation.
import { h, tx, applyI18n } from '../dom.js';
import { proofPanelModel } from './proof-model.js';

const openPanels = new Set(); // sign ids whose panel is open
const copiedAt = new Map();   // sign id → time of the last successful copy (the label says "Copied ✓" for 2 s)
const COPIED_MS = 2000;

const ensureCss = (doc) => {
  if (!doc || doc.querySelector('link[data-wh-css="proof"]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./proof.css', import.meta.url).href;
  link.dataset.whCss = 'proof';
  doc.head.appendChild(link);
};

const stop = (e) => e.stopPropagation();

function link(i18n, href, key, cls) {
  if (!href) return null;
  return h('a', { class: cls, i18n: key, attrs: { href, target: '_blank', rel: 'noopener' } });
}

function item(i18n, it) {
  return h('li', { class: 'wh-proof__item' + (it.tone ? ' wh-proof__item--' + it.tone : '') },
    tx(h('span', {}), i18n, it.key, it.args || {}),
    it.href ? ' ' : null,
    link(i18n, it.href, it.linkKey, 'wh-proof__link'));
}

/**
 * @param {object} i18n
 * @param {object} s  a sign card model with `proofView` (proof-model.js attachProofViews)
 * @param {(action: string, ...args: any[]) => void} onAction  'copyProof', index, done(ok)
 * @returns {HTMLElement|null}
 */
export function proofBlock(i18n, s, onAction) {
  if (!s || !s.proofView) return null;
  ensureCss(typeof document !== 'undefined' ? document : null);
  const m = proofPanelModel(s.proofView);
  const id = String(s.id);
  const copyLabel = () => (Date.now() - (copiedAt.get(id) || 0) < COPIED_MS ? 'wh.sign.proof.copied' : 'wh.sign.proof.copy');
  const copy = h('button', {
    class: 'wh-chip wh-proof__copy', i18n: copyLabel(), i18nAttrs: { title: 'wh.sign.proof.tip' },
    attrs: { type: 'button' }, dataset: { whKey: 'proofcopy-' + id },
    on: { click: () => {
      copy.disabled = true;
      onAction('copyProof', m.index, (ok) => {
        copy.disabled = false;
        if (ok) copiedAt.set(id, Date.now());
        tx(copy, i18n, ok ? 'wh.sign.proof.copied' : 'wh.sign.proof.failed');
        setTimeout(() => { if (copy.isConnected) tx(copy, i18n, 'wh.sign.proof.copy'); }, COPIED_MS);
      });
    } },
  });
  const details = h('details', { class: 'wh-proof__details', attrs: { open: openPanels.has(id) } },
    h('summary', { class: 'wh-proof__summary', i18n: 'wh.proof.what', dataset: { whKey: 'proof-' + id } }),
    h('p', { class: 'wh-proof__h', i18n: 'wh.proof.proves' }),
    h('ul', { class: 'wh-proof__list' }, m.proves.map((it) => item(i18n, it))),
    h('p', { class: 'wh-proof__h', i18n: 'wh.proof.notProves' }),
    h('ul', { class: 'wh-proof__list wh-proof__list--no' }, m.notProves.map((it) => item(i18n, it))),
    h('div', { class: 'wh-proof__row' }, copy));
  details.addEventListener('toggle', () => { if (details.open) openPanels.add(id); else openPanels.delete(id); });
  const line = m.line ? h('p', { class: 'wh-proof__state wh-proof__state--' + m.tone, attrs: { role: 'status' }, dataset: { state: m.state } }) : null;
  if (line) tx(line, i18n, m.line.key, m.line.args);
  const block = h('div', { class: 'wh-proof', dataset: { state: m.state } },
    line,
    m.recorded ? link(i18n, m.recorded.href, m.recorded.key, 'wh-proof__recorded') : null,
    details);
  // the card opens on click and on Enter / Space: those stop here; every other key (Escape, V…) still reaches the HUD
  applyI18n(block, i18n); // rendered now as well: the host may append it before its own applyI18n pass
  block.addEventListener('click', stop);
  block.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') stop(e); });
  return block;
}

/** Test hook: forget the remembered open panels and copy times. */
export function resetProofPanels() { openPanels.clear(); copiedAt.clear(); }
