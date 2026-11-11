// Holder access section of the game menu's NFTs tab (audit QW-6). Read-only: an account id in, what it holds on the
// game's NFT contracts out (explorer links), and the cosmetic perks that holding unlocks in this browser.
import { checkHolder, loadHolder, saveHolder, JUDGE_ACCOUNT } from '../net/holder.js';

/**
 * @param {{doc: Document, t: Function, storage?: object, owner?: string|null, check?: Function, onChange?: Function}} o
 * @returns {HTMLElement}
 */
export function holderSection({ doc = document, t, storage = null, owner = null, check = checkHolder, onChange = () => {} }) {
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const box = el('section', 'gm-holder');
  box.append(el('h3', null, t('holder.heading')), el('p', 'gm-note', t('holder.note')));
  const row = el('div', 'gm-row');
  const input = el('input'); input.type = 'text'; input.placeholder = 'name.testnet'; input.setAttribute('aria-label', t('holder.account'));
  input.autocomplete = 'off'; input.spellcheck = false; input.value = (loadHolder(storage) || {}).account || owner || '';
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') run(input.value); });
  const mk = (text, fn, cls = 'gm-btn') => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const checkBtn = mk(t('holder.check'), () => run(input.value));
  const judgeBtn = mk(t('holder.tryJudge'), () => { input.value = JUDGE_ACCOUNT; run(JUDGE_ACCOUNT); }, 'gm-btn gm-btn-alt');
  judgeBtn.dataset.judge = '1';
  row.append(input, checkBtn, judgeBtn);
  const out = el('div', 'gm-holder-out'); out.setAttribute('aria-live', 'polite');
  box.append(row, out);
  const stored = loadHolder(storage);
  if (stored) out.append(el('p', 'gm-note', t('holder.active', { account: stored.account, title: t('holder.title.' + stored.title) })));

  let seq = 0;
  async function run(account) {
    const my = ++seq;
    out.replaceChildren(el('p', 'gm-note', t('inv.onchain.checking')));
    const r = await check(account).catch(() => ({ state: 'offline', tokens: [], perks: [], title: null }));
    if (my !== seq) return;
    out.replaceChildren();
    if (r.state === 'invalid') { out.append(el('p', 'gm-note', t('holder.invalid'))); return; }
    if (r.state === 'offline') { out.append(el('p', 'gm-note', t('inv.onchain.offline'))); return; } // keep any earlier perk
    saveHolder(storage, r);
    if (r.state === 'none') { out.append(el('p', 'gm-note', t('holder.none', { account: r.account }))); onChange(null); return; }
    out.append(el('p', null, t('holder.unlocked', { account: r.account, title: t('holder.title.' + r.title) })));
    const ul = el('ul', 'gm-holder-list');
    for (const tok of r.tokens) {
      const li = el('li'); const a = el('a', null, tok.title); a.href = tok.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      li.append(a, doc.createTextNode(' · ' + tok.contractId)); ul.append(li);
    }
    out.append(ul, el('p', 'gm-note', t('holder.perks')));
    onChange(loadHolder(storage));
  }
  return box;
}
