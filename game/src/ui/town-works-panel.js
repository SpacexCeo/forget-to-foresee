// "Town works" at the Exchange counter (docs/town-economy.md): the four works with their live pledged totals and the
// rate of the last seven days (variable, can be zero), the player's deeds, and Pledge / Claim / Begin unbond / Finish
// unbond. Every action goes through the relayer (net/town-act.js); nothing here simulates a result: a relayer without
// the endpoint shows "not available yet" and the buttons stay off. Words: pledge, reward share, rate. 390 px friendly.
import { createTownAct, WORKS, toMicro, silkOf, deedActions } from '../net/town-act.js';
import { artBox, deedCardPath } from '../market/art.js';
import { syncSilkNow, refreshSilk } from '../net/silk-core.js';

const EXPLORER = 'https://testnet.nearblocks.io/txns/';
const CSS = `
.tw-wrap { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 12px; background: rgba(0, 0, 0, .45); }
.tw { width: min(560px, 100%); max-height: calc(100vh - 24px); overflow: auto; box-sizing: border-box; background: #141a1c; color: #f3ead6; border: 1px solid rgba(233, 180, 76, .45); border-radius: 14px; padding: 16px; font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 16px 40px rgba(0, 0, 0, .5); }
.tw h3 { margin: 0 0 4px; font: 700 19px/1.2 Georgia, serif; color: #f6d892; }
.tw h4 { margin: 14px 0 4px; font: 700 13px/1.2 system-ui; letter-spacing: .06em; text-transform: uppercase; color: #c9b88f; }
.tw .tw-tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 8px; }
.tw .tw-tags span { padding: 2px 8px; border-radius: 99px; font-size: 11px; background: rgba(233, 180, 76, .14); color: #e9cf95; }
.tw .tw-note { font-size: 12px; color: #b9ad97; margin: 4px 0; }
.tw .tw-row { border-top: 1px solid rgba(233, 180, 76, .2); padding: 9px 0; }
.tw .tw-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.tw .tw-name { font-weight: 700; }
.tw .tw-num { font-variant-numeric: tabular-nums; color: #f6d892; }
.tw .tw-ctl { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
.tw input, .tw select { min-height: 34px; box-sizing: border-box; padding: 4px 6px; border-radius: 8px; border: 1px solid #5b5240; background: #0b0e10; color: #fff; font: 14px system-ui; }
.tw input { width: 76px; }
.tw button { min-height: 36px; padding: 6px 12px; border-radius: 8px; border: 1px solid #8c6a2a; background: #d6a64c; color: #1b1406; font: 700 13px system-ui; cursor: pointer; }
.tw button.ghost { background: transparent; color: #f3ead6; border-color: #5b5240; }
.tw button[disabled] { opacity: .5; cursor: default; }
.tw .tw-state { min-height: 18px; font-size: 13px; margin-top: 8px; }
.tw .tw-state a { color: #8fe0b0; }
.tw .tw-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; color: #a99f8e; }
@media (max-width: 420px) { .tw { padding: 12px 10px; font-size: 13px; } .tw h3 { font-size: 17px; } }
`;

/**
 * @param {{t: Function, storage?: object, client?: object, doc?: Document}} o
 * @returns {{open(): Promise<void>, close(): void, readonly isOpen: boolean}}
 */
export function createTownWorksPanel({ t, storage = null, client = null, flush = null, doc = globalThis.document }) {
  const api = client || createTownAct({ storage, flush });
  if (!(doc.getElementById && doc.getElementById('tw-style'))) { const s = doc.createElement('style'); s.id = 'tw-style'; s.textContent = CSS; (doc.head || doc.body).append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const button = (text, fn, cls) => { const b = el('button', cls || null, text); b.type = 'button'; b.addEventListener('click', fn); return b; };
  let root = null, box = null, state = null, busy = false;
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };

  function say(key, args, hash) {
    if (!state) return;
    state.textContent = t(key, args);
    if (hash) { const a = el('a', null, ' ' + t('works.viewTx')); a.href = EXPLORER + hash; a.target = '_blank'; a.rel = 'noopener noreferrer'; state.append(a); }
  }
  async function run(action, args, doneKey) {
    if (busy) return; busy = true;
    for (const b of box.querySelectorAll('button.act')) b.disabled = true;
    say('works.sending');
    const r = await api.act(action, args);
    busy = false;
    await render();
    if (r.ok) say(doneKey, null, r.hash); else say('works.err.' + r.reason);
  }

  function worksRow(w, i, me) {
    const r = el('div', 'tw-row');
    const head = el('div', 'tw-head');
    head.append(el('span', 'tw-name', t('works.name.' + w.id)), el('span', 'tw-num', t('works.pledged', { silk: silkOf(w.principal) })));
    r.append(head, el('div', 'tw-note', t('works.rate', { rate: silkOf(w.rate) })));
    const ctl = el('div', 'tw-ctl');
    const amt = el('input'); amt.type = 'number'; amt.min = '1'; amt.step = '1'; amt.value = '10'; amt.inputMode = 'decimal'; amt.setAttribute('aria-label', t('works.amount'));
    const tier = el('select'); tier.setAttribute('aria-label', t('works.lock'));
    me.params.lockDays.forEach((d, k) => { const o = el('option', null, d ? t('works.tier.days', { n: d }) : t('works.tier.flex')); o.value = String(k); tier.append(o); });
    if (!me.params.lockDays.length) { const o = el('option', null, t('works.tier.flex')); o.value = '0'; tier.append(o); }
    const go = button(t('works.pledge'), () => {
      const amount = toMicro(amt.value);
      if (!amount) { say('works.err.bad_args'); return; }
      run('pledge', { asset: i, amount, tier: Number(tier.value) || 0 }, 'works.done.stake');
    }, 'act');
    go.disabled = me.paused;
    ctl.append(amt, tier, go); r.append(ctl);
    return r;
  }
  function deedRow(d, me) {
    const r = el('div', 'tw-row');
    const head = el('div', 'tw-head');
    const works = WORKS[d.asset] || 'loom';
    const nameEl = el('span', 'tw-name');
    nameEl.style.cssText = 'display:inline-flex;align-items:center;gap:10px;';
    nameEl.append(artBox(doc, deedCardPath(works), t('works.name.' + works), { size: 48, radius: 4 }), el('span', null, t('works.deed', { works: t('works.name.' + works), silk: silkOf(d.principal) }))); // the works' deed card (600 x 900), its letter if it fails
    head.append(nameEl, el('span', 'tw-num', t('works.share', { silk: silkOf(d.claimable) })));
    const can = deedActions(d, me.day);
    const why = d.state === 'unbonding' ? (can.finish_unbond ? t('works.ready') : t('works.cooling', { n: Math.max(0, d.readyDay - me.day) })) : (can.begin_unbond ? t('works.unlocked') : t('works.lockedFor', { n: Math.max(0, d.lockedUntil - me.day) }));
    r.append(head, el('div', 'tw-note', why));
    const ctl = el('div', 'tw-ctl');
    const c = button(t('works.claim'), () => run('claim', { token_id: d.id }, 'works.done.claim'), 'act'); c.disabled = !can.claim;
    if (d.state === 'active') { const u = button(t('works.beginUnbond'), () => run('unbond', { token_id: d.id }, 'works.done.begin_unbond'), 'act ghost'); u.disabled = !can.begin_unbond; ctl.append(c, u); }
    else { const f = button(t('works.finishUnbond'), () => run('unbond', { token_id: d.id }, 'works.done.finish_unbond'), 'act'); f.disabled = !can.finish_unbond; ctl.append(f); }
    r.append(ctl);
    return r;
  }

  async function render() {
    if (!box) return;
    const keepState = state ? state.textContent : '';
    const kids = [el('h3', null, t('works.title'))];
    const tags = el('div', 'tw-tags'); tags.append(el('span', null, t('works.testnet')), el('span', null, t('works.rateTag'))); kids.push(tags);
    kids.push(el('p', 'tw-note', t('works.lead')));
    const r = await api.me();
    if (!box) return;
    if (!r.ok) kids.push(el('p', null, t('works.err.' + r.reason)));
    else if (!r.me.registered) { // not in the town yet: one tap sets the account up through the relayer (live bug 13.11)
      const st = el('p', 'tw-note');
      const b = button(t('town.setup'), async () => { b.disabled = true; b.textContent = t('town.settingUp'); const x = await syncSilkNow().catch(() => ({ ok: false })); st.textContent = x && x.ok ? t('town.setupDone') : t('town.setupFailed'); if (x && x.ok) { refreshSilk(true).catch(() => {}); render(); } }, 'act');
      kids.push(el('p', null, t('works.err.not_registered')), b, st);
    } else {
      const me = r.me;
      kids.push(el('p', null, t('works.balance', { silk: silkOf(me.silk) })));
      if (me.limits.perDay) kids.push(el('p', 'tw-note', t('works.limit', { n: me.limits.today, max: me.limits.perDay })));
      if (me.paused) kids.push(el('p', 'tw-note', t('works.err.paused')));
      kids.push(el('h4', null, t('works.heading')), ...me.works.map((w, i) => worksRow(w, i, me)));
      kids.push(el('p', 'tw-note', t('works.feeNote', { fee: silkOf(me.params.deedFee), cool: me.params.cooldown })));
      kids.push(el('h4', null, t('works.deeds')));
      if (!me.deeds.length) kids.push(el('p', 'tw-note', t('works.noDeeds')));
      else kids.push(...me.deeds.map((d) => deedRow(d, me)));
    }
    state = el('div', 'tw-state'); state.setAttribute('aria-live', 'polite'); state.textContent = keepState;
    const foot = el('div', 'tw-foot'); foot.append(el('span', null, t('works.note')), button(t('quest.close'), close, 'ghost'));
    box.replaceChildren(...kids, state, foot);
  }

  async function open() {
    close();
    root = el('div', 'tw-wrap');
    box = el('div', 'tw'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('works.title'));
    box.append(el('p', 'tw-note', '…'));
    root.append(box); root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
    doc.body.append(root); if (doc.addEventListener) doc.addEventListener('keydown', onKey, true);
    await render();
  }
  function close() { if (!root) return; root.remove(); root = null; box = null; state = null; if (doc.removeEventListener) doc.removeEventListener('keydown', onKey, true); }
  return { open, close, get isOpen() { return !!root; } };
}

/**
 * The on-chain tournament entry at the altar (ftf-town enter_tournament through the relayer): the open season, its
 * silk purse, the entry fee and where it goes, Enter. Same honesty rules as the works panel.
 * @param {{t: Function, storage?: object, client?: object, doc?: Document}} o
 */
export function createTournamentEntry({ t, storage = null, client = null, flush = null, doc = globalThis.document }) {
  // the seasons this browser entered (net/pet.js SEASONS_KEY): the Hatchkeeper opens once one of them has settled
  const rememberSeason = (id) => { try { const all = new Set(JSON.parse((storage && storage.getItem('ftf.tourney.seasons.v1')) || '[]')); all.add(String(id)); storage.setItem('ftf.tourney.seasons.v1', JSON.stringify([...all].slice(-20))); } catch { /* memory only */ } };
  const api = client || createTownAct({ storage, flush });
  createTownWorksPanel({ t, client: api, doc }); // installs the shared style once
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let root = null, box = null;
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  async function render(msg = '', hash = null) {
    if (!box) return;
    const kids = [el('h3', null, t('tourn.title'))];
    const tags = el('div', 'tw-tags'); tags.append(el('span', null, t('works.testnet'))); kids.push(tags);
    const r = await api.me();
    if (!box) return;
    if (!r.ok) kids.push(el('p', null, t('works.err.' + r.reason)));
    else {
      const { season, params, silk } = r.me;
      if (!season.id) kids.push(el('p', null, t('works.err.season')));
      else {
        kids.push(el('p', null, t('tourn.purse', { silk: silkOf(season.purse), n: season.entrants, id: season.id })));
        kids.push(el('p', 'tw-note', t('tourn.fee', { fee: silkOf(params.entryFee) })));
        kids.push(el('p', 'tw-note', t('works.balance', { silk: silkOf(silk) })));
        if (season.entered) { kids.push(el('p', null, t('tourn.entered', { id: season.id }))); rememberSeason(season.id); }
        else {
          const go = el('button', 'act', t('tourn.enter', { fee: silkOf(params.entryFee) })); go.type = 'button'; go.disabled = r.me.paused;
          go.addEventListener('click', async () => {
            go.disabled = true; st.textContent = t('works.sending');
            const a = await api.act('enter_tournament', { season_id: season.id });
            if (a.ok) rememberSeason(season.id); // the Hatchkeeper checks it once the season settles (net/pet.js)
            render(a.ok ? t('tourn.done') : t('works.err.' + a.reason), a.ok ? a.hash : null);
          });
          kids.push(el('div', 'tw-ctl')); kids[kids.length - 1].append(go);
        }
      }
    }
    const st = el('div', 'tw-state'); st.setAttribute('aria-live', 'polite'); st.textContent = msg;
    if (hash) { const a = el('a', null, ' ' + t('works.viewTx')); a.href = EXPLORER + hash; a.target = '_blank'; a.rel = 'noopener noreferrer'; st.append(a); }
    const foot = el('div', 'tw-foot'); const x = el('button', 'ghost', t('quest.close')); x.type = 'button'; x.addEventListener('click', close);
    foot.append(el('span', null, t('tourn.note')), x);
    box.replaceChildren(...kids, st, foot);
  }
  async function open() {
    close();
    root = el('div', 'tw-wrap'); box = el('div', 'tw'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('tourn.title'));
    box.append(el('p', 'tw-note', '…')); root.append(box);
    root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
    doc.body.append(root); if (doc.addEventListener) doc.addEventListener('keydown', onKey, true);
    await render();
  }
  function close() { if (!root) return; root.remove(); root = null; box = null; if (doc.removeEventListener) doc.removeEventListener('keydown', onKey, true); }
  return { open, close, get isOpen() { return !!root; } };
}
