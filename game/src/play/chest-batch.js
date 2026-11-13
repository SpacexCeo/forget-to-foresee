// Batch chest opening (owner, 12.11; docs/chests.md "Batch opening"): "Open 5" / "Open all (≤ 10)" in the bag sends
// one request; the relayer opens them on NEAR testnet, one transaction per chest sent together. Here the cards flip one by one (0.4 s each,
// a tap skips to the end), then a summary grid sorted by rarity with each card's "Verified ✓" linking to its
// transaction, and "Claim all". The rewards are settled the moment the answer arrives (onSettled per opening), so
// closing early never loses one. No answer, no outcome: the chests stay sealed and the panel says why.
import { outcomeView } from './chest-open.js';
import { cue } from '../audio/town-audio.js';
// the plain message keys (net/chest-client.js CHEST_ERRORS; kept here so this panel loads without the net code)
const ERR_KEYS = ['off', 'soon', 'rate', 'daily', 'sold_out', 'no_guest', 'no_key', 'network', 'tx_failed', 'no_opening', 'stale', 'replayed', 'deck_mismatch', 'request'];

export const FLIP_S = 0.4;
const RANK = Object.freeze({ nft: 0, legendary: 1, epic: 2, rare: 3, uncommon: 4, common: 5 });
const GLOW = Object.freeze({ common: '#cfc6ad', uncommon: '#2fc4b2', rare: '#5fb6ff', epic: '#c77dff', legendary: '#ffc46b', nft: '#ffe7a8' });
const TX = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const CSS = `
.cb { position: fixed; inset: 0; z-index: 45; display: flex; overflow-y: auto; padding: 16px 0; background: radial-gradient(ellipse at 50% 45%, rgba(20, 30, 28, .92), rgba(3, 6, 6, .96)); color: #e9e6dc; font: 15px/1.45 system-ui, sans-serif; }
.cb-box { margin: auto; width: min(820px, calc(100vw - 24px)); display: grid; gap: 14px; justify-items: center; text-align: center; }
.cb-title { font: 600 13px/1.2 system-ui; letter-spacing: .18em; text-transform: uppercase; color: #d9b26a; }
.cb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; width: 100%; }
.cb-card { position: relative; min-height: 170px; border-radius: 12px; padding: 12px 8px 10px; display: grid; gap: 4px; align-content: start; justify-items: center;
  background: linear-gradient(160deg, #18211f, #101716); box-shadow: inset 0 0 0 1px var(--g), inset 0 -24px 36px -24px var(--g); transition: transform .4s ease, opacity .4s ease; }
.cb-card.cb-back { transform: rotateY(90deg); opacity: .2; }
.cb-card img { width: 64px; height: 64px; object-fit: contain; }
.cb-card b.cb-glyph { font: 600 38px/1.1 "Cormorant Garamond", Georgia, serif; color: var(--g); }
.cb-name { font: 600 16px/1.15 "Cormorant Garamond", Georgia, serif; }
.cb-rar { font: 600 10px/1.2 system-ui; letter-spacing: .14em; text-transform: uppercase; color: var(--g); }
.cb-ver { font-size: 12px; } .cb-ver a { color: #7fd18b; } .cb-ver.cb-no { color: #ff8a7a; }
.cb-note { color: rgba(233, 230, 220, .62); font-size: 13px; max-width: 560px; }
.cb-btns { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.cb-btn { min-height: 44px; padding: 10px 22px; border-radius: 10px; border: 0; cursor: pointer; font: 700 15px/1 system-ui; color: #14201c; background: linear-gradient(135deg, #e6c27e, #c99a48); }
.cb-btn.cb-ghost { color: #e9e6dc; background: transparent; border: 1px solid rgba(214, 226, 214, .22); }
@media (prefers-reduced-motion: reduce) { .cb-card { transition: none; } }
html[data-motion="reduce"] .cb-card { transition: none; }
`;

/** Openings sorted for the summary: rarest first (NFT, legendary … common), then by slot. Pure. */
export function byRarity(openings) {
  const r = (o) => (o.outcome && o.outcome.kind === 'nft' ? RANK.nft : RANK[(o.outcome && o.outcome.rarity) || 'common'] ?? 5);
  return [...openings].sort((a, b) => r(a) - r(b) || (a.index ?? 0) - (b.index ?? 0));
}

/**
 * Opens `count` chests at once. `chests` are the sealed chests (bag order) the openings settle, one each.
 * @returns {{result: Promise<object>, close(): void, skip(): void}}
 */
export function openChestBatch({ doc = document, t, client, chests, count, items = [], base = (import.meta.env && import.meta.env.BASE_URL) || '/', onSettled = () => {}, explorer = 'https://testnet.nearblocks.io', timers = globalThis }) {
  if (!(doc.getElementById && doc.getElementById('cb-style'))) { const st = doc.createElement('style'); st.id = 'cb-style'; st.textContent = CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const reduced = (() => { try { return doc.documentElement.dataset.motion === 'reduce' || !!(doc.defaultView && doc.defaultView.matchMedia && doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } })();
  const n = Math.max(1, Math.min(10, count, chests.length));
  const root = el('div', 'cb'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('chest.batch.title', { n }));
  const box = el('div', 'cb-box');
  const title = el('div', 'cb-title', t('chest.batch.title', { n }));
  const info = el('div'); info.setAttribute('aria-live', 'polite');
  const grid = el('div', 'cb-grid');
  const btns = el('div', 'cb-btns');
  box.append(title, info, grid, btns); root.append(box);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  doc.body.append(root);
  let resolveP, outcome = { ok: false, error: 'closed' }, flipping = [], skipped = false;
  const result = new Promise((r) => { resolveP = r; });
  const close = () => { for (const h of flipping) timers.clearTimeout(h); root.remove(); resolveP(outcome); };
  root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  const button = (label, fn, ghost = false) => { const b = el('button', 'cb-btn' + (ghost ? ' cb-ghost' : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; };

  const card = (op) => {
    const v = outcomeView(op.outcome, { t, items, base });
    const rar = op.outcome.kind === 'nft' ? 'nft' : (op.outcome.rarity || 'common');
    const c = el('div', 'cb-card'); c.style.setProperty('--g', GLOW[rar] || GLOW.common);
    if (v.icon) { const i = el('img'); i.src = v.icon; i.alt = ''; c.append(i); } else c.append(el('b', 'cb-glyph', v.glyph));
    c.append(el('div', 'cb-name', v.label), el('div', 'cb-rar', op.outcome.kind === 'nft' ? t('chest.rar.nft') : rar));
    const ver = el('div', 'cb-ver' + (op.verification && op.verification.verified ? '' : ' cb-no'));
    if (op.verification && op.verification.verified && TX.test(String(op.tx || ''))) {
      const a = el('a', null, t('chest.verified')); a.href = `${explorer}/txns/${op.tx}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = t('chest.viewTx'); ver.append(a);
    } else ver.textContent = op.verification && op.verification.verified ? t('chest.verified') : t('chest.unverified');
    c.append(ver);
    return c;
  };
  function summary(r) {
    grid.replaceChildren(...byRarity(r.openings).map(card));
    const notes = [el('p', 'cb-note', t('chest.batch.summary', { n: r.openings.length }))];
    if (r.openings.length < n) notes.push(el('p', 'cb-note', t(r.cut === 'daily_cap' ? 'chest.batch.cut' : 'chest.batch.cutSome', { n: r.openings.length })));
    info.replaceChildren(...notes);
    const claim = button(t('chest.batch.claim'), close); btns.replaceChildren(claim); claim.focus && claim.focus();
  }

  info.replaceChildren(el('p', 'cb-note', t('chest.asking')));
  btns.replaceChildren(button(t('chest.close'), close, true));
  client.openMany(n).then((r) => {
    if (!r.ok) {
      outcome = { ok: false, error: r.error }; cue('ui_error');
      info.replaceChildren(el('p', null, t('chest.err.' + (ERR_KEYS.includes(r.error) ? r.error : 'bad'))), el('p', 'cb-note', t('chest.stillSealed')));
      return;
    }
    // settle every opening at once against its own sealed chest: the rewards are safe whatever happens next
    r.openings.forEach((op, i) => { if (chests[i]) onSettled(chests[i], op); });
    outcome = { ok: true, openings: r.openings, cut: r.cut, batch: r.batch };
    cue('gift_chime');
    if (reduced) { summary(r); return; }
    // the reveal: cards face down, flipped one by one; a tap anywhere skips to the summary
    const cards = r.openings.map((op) => { const c = card(op); c.classList.add('cb-back'); return c; });
    grid.replaceChildren(...cards);
    info.replaceChildren(el('p', 'cb-note', t('chest.batch.skip')));
    const skip = () => { if (skipped) return; skipped = true; for (const h of flipping) timers.clearTimeout(h); summary(r); };
    root.addEventListener('click', (e) => { if (!(e.target && e.target.closest && e.target.closest('a,button'))) skip(); });
    btns.replaceChildren(button(t('chest.batch.skipBtn'), skip, true));
    cards.forEach((c, i) => flipping.push(timers.setTimeout(() => { c.classList.remove('cb-back'); }, (i + 1) * FLIP_S * 1000)));
    flipping.push(timers.setTimeout(skip, (cards.length + 1) * FLIP_S * 1000 + 300));
  }).catch(() => { outcome = { ok: false, error: 'network' }; info.replaceChildren(el('p', null, t('chest.err.network')), el('p', 'cb-note', t('chest.stillSealed'))); });
  return { result, close, skip: () => root.click && root.click() };
}
