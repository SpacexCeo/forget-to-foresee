// The endgame cliffhanger and the whitelist pass modal (story TZ §11.1, §11.4). At the story's peak, for a player the
// relayer says is eligible (10,000 silk paid at the Gate-Loom), the screen cuts to black, holds, and a modal offers a
// free whitelist pass to a NEAR wallet: one text field, no wallet connection, no signature request, no seed phrase.
//
// States: idle -> validating (inline syntax check while typing) -> submitting -> minted | queued | error. The minted
// view shows a transaction hash only when the relayer's answer was `minted` with a hash (net/pass-client.js viewModel);
// a queued claim is remembered and polled every 15 s. The demo path (?story=1&passDemo=1) shows the whole sequence with
// a labelled simulation, calls nothing and shows no hash. `network: null` (net/pass-deployment.js) creates nothing.
// The modal never blocks the game: closing it returns to play with "To be continued."
import { checkWallet, viewModel } from '../net/pass-client.js';

export const PASS_KEY = 'ftf.pass.v1';
export const HOLD_MS = 1200;
export const POLL_MS = 15000;

/**
 * The modal's state machine (pure). Events: {type: 'input', value, network} | {type: 'submit'} | {type: 'answer', ans,
 * explorerBase} | {type: 'reset'}. A `minted` state is reachable only through an answer, so its hash is the server's.
 */
export function reduce(s, e) {
  switch (e.type) {
    case 'input': {
      const v = String(e.value || '');
      if (!v) return { ...s, state: 'idle', wallet: '', inline: null };
      return { ...s, state: 'validating', wallet: v, inline: checkWallet(v, { network: e.network }).ok ? null : 'pass.err.invalid' };
    }
    case 'submit':
      if (s.state !== 'validating' || s.inline || !s.wallet) return { ...s, inline: s.wallet ? s.inline : 'pass.err.invalid' };
      return { ...s, state: 'submitting' };
    case 'answer': {
      const vm = viewModel(e.ans, { explorerBase: e.explorerBase });
      return { ...s, state: vm.state, vm, claimId: vm.claimId || s.claimId };
    }
    case 'reset': return { state: 'idle', wallet: '', inline: null, vm: null, claimId: s.claimId || null };
    default: return s;
  }
}
export const initial = (claimId = null) => ({ state: 'idle', wallet: '', inline: null, vm: null, claimId });

const CSS = `
.ep-cut { position: fixed; inset: 0; z-index: 9990; background: #000; opacity: 0; transition: opacity .35s ease; pointer-events: auto; }
.ep-cut.on { opacity: 1; }
.ep-wrap { position: fixed; inset: 0; z-index: 9991; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .55); }
.ep { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: #12161d; color: #f3ead8; border: 1px solid rgba(216, 180, 106, .45);
  border-radius: 14px; padding: 22px 22px 18px; box-shadow: 0 18px 48px rgba(0, 0, 0, .55); font: 15px/1.45 system-ui, sans-serif; }
.ep h2 { margin: 0 0 8px; font: 700 22px/1.25 Georgia, serif; color: #f6d892; }
.ep p { margin: 0 0 10px; }
.ep .ep-banner { margin: -6px 0 12px; padding: 6px 10px; border-radius: 8px; font: 700 12px/1.3 system-ui, sans-serif; letter-spacing: .04em; background: #4a3410; color: #ffd98a; }
.ep .ep-banner.demo { background: #203246; color: #bfe0ff; }
.ep label { display: block; font-size: 13px; color: #c9bfae; margin: 6px 0 4px; }
.ep input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 9px; border: 1px solid #5b5240; background: #0b0e13; color: #fff; font: 15px/1.2 ui-monospace, monospace; }
.ep input[aria-invalid="true"] { border-color: #c96a4a; }
.ep .ep-inline { min-height: 18px; font-size: 13px; color: #f0a07e; margin: 4px 0 6px; }
.ep .ep-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.ep button { padding: 10px 16px; border-radius: 9px; border: 1px solid #8c6a2a; background: #d6a64c; color: #1b1406; font: 700 14px/1 system-ui, sans-serif; cursor: pointer; }
.ep button.ghost { background: transparent; color: #f3ead8; border-color: #5b5240; }
.ep button[disabled] { opacity: .55; cursor: default; }
.ep .ep-safe { font-size: 12px; color: #a99f8e; margin-top: 12px; font-style: italic; }
.ep .ep-hash { display: flex; gap: 8px; align-items: center; margin: 8px 0; }
.ep code { flex: 1; min-width: 0; overflow-wrap: anywhere; padding: 8px; border-radius: 8px; background: #0b0e13; font: 13px/1.3 ui-monospace, monospace; }
.ep .ep-spin { display: inline-block; width: 14px; height: 14px; margin-right: 8px; vertical-align: -2px; border: 2px solid #f6d892; border-right-color: transparent; border-radius: 50%; animation: ep-spin .9s linear infinite; }
@keyframes ep-spin { to { transform: rotate(360deg); } }
.ep-continued { position: fixed; left: 50%; bottom: 18%; transform: translateX(-50%); z-index: 9989; color: #f6d892; font: italic 600 20px/1 Georgia, serif; text-shadow: 0 2px 8px #000; opacity: 0; transition: opacity .6s; pointer-events: none; }
.ep-continued.on { opacity: 1; }
@media (max-width: 420px) { .ep { padding: 18px 14px 14px; font-size: 14px; } .ep h2 { font-size: 19px; } }
@media (prefers-reduced-motion: reduce) { .ep-cut { transition: none; } .ep .ep-spin { animation: none; } .ep-continued { transition: none; } }
`;

/**
 * @param {object} o
 * @param {(k: string, a?: object) => string} o.t @param {object} o.client net/pass-client.js createPassClient (or a fake)
 * @param {{network: string|null, explorerBase: string, contract?: string|null}} o.deployment
 * @param {object} [o.storage] {getItem, setItem} @param {boolean} [o.demo] @param {() => boolean} [o.reducedMotion]
 * @param {Document} [o.doc] @param {(name: string) => void} [o.sound] a low sting at the cut
 */
export function createEndgamePass({ t, client, deployment, storage = null, demo = false, reducedMotion = () => false, doc = globalThis.document, sound = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (!deployment || !deployment.network || !doc) return null;   // dormant: nothing exists
  const network = deployment.network;
  const read = () => { try { return JSON.parse((storage && storage.getItem(PASS_KEY)) || 'null') || {}; } catch { return {}; } };
  const write = (v) => { try { if (storage) storage.setItem(PASS_KEY, JSON.stringify({ ...read(), ...v })); } catch { /* memory only */ } };
  let s = initial(read().claimId || null);
  let root = null, poll = 0, lastFocus = null;
  if (!doc.getElementById('ep-style')) { const st = doc.createElement('style'); st.id = 'ep-style'; st.textContent = CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const tt = (k, a) => t(k + (k === 'pass.lead' || k === 'pass.loading' || k === 'pass.placeholder' ? '.' + network : ''), a);

  function dispatch(e) { s = reduce(s, e); render(); }

  function render() {
    if (!root) return;
    const box = root.querySelector('.ep');
    box.textContent = '';
    box.append(el('h2', null, t('pass.title')));
    if (network !== 'mainnet') box.append(el('div', 'ep-banner', t('pass.rehearsal')));
    if (demo) box.append(el('div', 'ep-banner demo', t('pass.demo')));
    const row = el('div', 'ep-row');
    const closeBtn = el('button', 'ghost', t('pass.close')); closeBtn.type = 'button'; closeBtn.addEventListener('click', () => close());
    if (s.state === 'idle' || s.state === 'validating') {
      box.append(el('p', null, t('pass.utility')), el('p', null, tt('pass.lead')));
      const lab = el('label', null, t('pass.label')); lab.htmlFor = 'ep-wallet';
      const inp = el('input'); inp.id = 'ep-wallet'; inp.type = 'text'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('autocapitalize', 'none');
      inp.placeholder = tt('pass.placeholder'); inp.value = s.wallet; inp.setAttribute('aria-invalid', s.inline ? 'true' : 'false'); inp.setAttribute('aria-describedby', 'ep-inline');
      const inline = el('div', 'ep-inline', s.inline ? t(s.inline) : ''); inline.id = 'ep-inline'; inline.setAttribute('aria-live', 'polite');
      inp.addEventListener('input', () => { const pos = inp.selectionStart; s = reduce(s, { type: 'input', value: inp.value, network }); inline.textContent = s.inline ? t(s.inline) : ''; inp.setAttribute('aria-invalid', s.inline ? 'true' : 'false'); submit.disabled = !!s.inline || !s.wallet; try { inp.setSelectionRange(pos, pos); } catch { /* */ } });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      const submit = el('button', null, t('pass.submit')); submit.type = 'button'; submit.disabled = !!s.inline || !s.wallet; submit.addEventListener('click', () => go());
      row.append(submit, closeBtn);
      box.append(lab, inp, inline, row);
      setTimer(() => { try { inp.focus(); } catch { /* */ } }, 0);
    } else if (s.state === 'submitting') {
      const p = el('p'); p.append(el('span', 'ep-spin'), doc.createTextNode(tt('pass.loading'))); p.setAttribute('role', 'status');
      box.append(p);
    } else if (s.state === 'minted') {
      const vm = s.vm;
      box.append(el('p', null, t('pass.minted')));
      if (vm.status === 'already_claimed') box.append(el('p', null, t('pass.already')));
      if (vm.tokenId) box.append(el('p', null, t('pass.token', { id: vm.tokenId })));
      if (vm.hash) {
        const h = el('div', 'ep-hash'); const code = el('code', null, vm.hash); const copy = el('button', 'ghost', t('pass.copy')); copy.type = 'button';
        copy.addEventListener('click', () => { try { globalThis.navigator.clipboard.writeText(vm.hash); copy.textContent = t('pass.copied'); } catch { /* */ } });
        h.append(code, copy); box.append(el('label', null, t('pass.hash')), h);
        const a = el('a', null, t('pass.view')); a.href = vm.explorer; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = '#f6d892';
        box.append(a);
      }
      box.append(el('p', null, t('pass.utility')), el('p', null, t('pass.keep')));
      row.append(closeBtn); box.append(row);
    } else if (s.state === 'queued') {
      box.append(el('p', null, t(s.vm.key, s.vm.args)));
      row.append(closeBtn); box.append(row);
    } else {
      box.append(el('p', null, t(s.vm.key, s.vm.args)));
      const again = el('button', null, t('pass.again')); again.type = 'button'; again.addEventListener('click', () => dispatch({ type: 'reset' }));
      row.append(again, closeBtn); box.append(row);
    }
    box.append(el('p', 'ep-safe', t('pass.safety')));
    setTimer(() => { const f = box.querySelector('input, button'); if (f && doc.activeElement && !box.contains(doc.activeElement)) try { f.focus(); } catch { /* */ } }, 0);
  }

  async function go() {
    s = reduce(s, { type: 'input', value: s.wallet || (root && root.querySelector('input') ? root.querySelector('input').value : ''), network });
    dispatch({ type: 'submit' });
    if (s.state !== 'submitting') return;
    if (demo) { setTimer(() => dispatch({ type: 'answer', ans: { status: 'minted', token_id: 'demo' }, explorerBase: deployment.explorerBase }), 1500); return; }  // a simulation: no hash, no call
    const ans = await client.claim(s.wallet);
    dispatch({ type: 'answer', ans, explorerBase: deployment.explorerBase });
    if (s.claimId) write({ claimId: s.claimId, state: s.state });
    if (s.state === 'queued') startPoll();
  }

  function startPoll() {
    clearTimer(poll);
    if (demo || !s.claimId) return;
    poll = setTimer(async () => {
      const ans = await client.status(s.claimId);
      if (ans && ans.status && ans.status !== 'unknown') { dispatch({ type: 'answer', ans: { claim_id: s.claimId, ...ans }, explorerBase: deployment.explorerBase }); write({ state: s.state }); }
      if (s.state === 'queued' && root) startPoll();
    }, POLL_MS);
  }

  function trap(e) {
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...root.querySelectorAll('input, button, a[href]')].filter((x) => !x.disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    if (root) return api;
    lastFocus = doc.activeElement;
    root = el('div', 'ep-wrap');
    const box = el('div', 'ep'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('pass.title'));
    root.append(box); doc.body.append(root);
    doc.addEventListener('keydown', trap, true);
    write({ shown: true });
    render();
    if (s.state === 'queued') startPoll();
    return api;
  }

  function close() {
    if (!root) return;
    clearTimer(poll);
    doc.removeEventListener('keydown', trap, true);
    root.remove(); root = null;
    const c = el('div', 'ep-continued', t('pass.continued')); doc.body.append(c);
    setTimer(() => c.classList.add('on'), 20); setTimer(() => c.classList.remove('on'), 2600); setTimer(() => c.remove(), 3400);
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch { /* */ }
  }

  /** The story's peak: cut to black, hold, then the modal (once per account; reopenable from the HUD). */
  function cut() {
    if (root) return Promise.resolve(api);
    const once = read();
    const black = el('div', 'ep-cut'); doc.body.append(black);
    if (!reducedMotion()) sound('pass_sting');
    setTimer(() => black.classList.add('on'), 10);
    return new Promise((res) => setTimer(() => { black.remove(); open(); res(api); }, reducedMotion() ? 300 : HOLD_MS + 350)).then((x) => { void once; return x; });
  }

  // a claim queued in an earlier visit: the modal reopens in its state
  const saved = read();
  if (saved.claimId && saved.state === 'queued') s = { ...s, state: 'queued', vm: viewModel({ status: 'queued', claim_id: saved.claimId }), claimId: saved.claimId };

  const api = {
    open, close, cut,
    get state() { return s.state; }, get vm() { return s.vm; }, get shown() { return !!read().shown; }, get isOpen() { return !!root; },
    /** For tests: feed an input or an answer without the DOM. */
    dispatch,
    submit: go,
  };
  return api;
}
