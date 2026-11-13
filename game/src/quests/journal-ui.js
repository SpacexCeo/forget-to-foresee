// The quest journal (sprint §4.7): a modal opened with J or L, the tracker or the HUD tray button. Left: five tabs
// (Story, Side, Daily, Tournament, Done) with counts, a search field and rows (status icon, title wrapped never cut,
// "Lv N · Giver", the first unfinished counter, a pin when tracked). Right: the detail (chips, summary, description,
// objectives with counters and bars, rewards, "How to get it", and the actions Walk, Track, Abandon). Click a row to
// select it; click it again, double-click or press Enter to walk there (the journal closes). Below 900 px the list and
// the detail are two screens. DOM only; the model is journal-model.js.
import { TABS, countdown } from './journal-model.js';
import { JOURNAL_BY_ID } from '../game/journal-data.js';
import { artBox, resIconPath } from '../market/art.js';

const CSS = `
.fj-back{position:fixed;inset:0;z-index:40;background:rgba(5,7,12,.55);display:flex;align-items:center;justify-content:center}
.fj{box-sizing:border-box;width:min(1280px,92vw);height:min(720px,88vh);background:#0e1018;border:1px solid #3a3f55;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.55);color:#eef0f6;font:16px/1.45 "Atkinson Hyperlegible",system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;grid-template-rows:56px 1fr;overflow:hidden}
.fj.fj-anim{animation:fj-in .12s cubic-bezier(.2,.8,.2,1)}@keyframes fj-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.fj-head{display:flex;align-items:center;gap:16px;padding:0 24px;border-bottom:1px solid #3a3f55}
.fj-head h2{margin:0;font:600 28px/1 "Cormorant Garamond",Georgia,serif;color:#f6c860;flex:1}
.fj button{font:inherit;color:inherit;cursor:pointer}
.fj-x{width:44px;height:44px;border-radius:10px;border:1px solid #3a3f55;background:rgba(255,255,255,.06);font-size:20px}
.fj-body{display:grid;grid-template-columns:384px 1fr;min-height:0}
.fj-rail{border-right:1px solid #3a3f55;display:flex;flex-direction:column;min-height:0}
.fj-tabs{display:grid;grid-template-columns:repeat(5,1fr);height:48px;border-bottom:1px solid #3a3f55}
.fj-tab{border:0;background:transparent;font-weight:700;font-size:13px;position:relative;padding:0 2px}
.fj-tab[aria-selected=true]{box-shadow:inset 0 -3px 0 #f6c860;color:#f6c860}
.fj-badge{display:inline-block;min-width:16px;height:16px;border-radius:8px;background:#f6c860;color:#1b1608;font-size:12px;line-height:16px;margin-left:4px}
.fj-reset{margin:6px 0 2px;color:#aab1c5;font-size:13px;white-space:normal}.fj-search{margin:8px 12px;height:40px;border-radius:10px;border:1px solid #3a3f55;background:rgba(255,255,255,.06);color:#eef0f6;padding:0 12px;font:14px system-ui}
.fj-list{overflow:auto;flex:1;padding-bottom:8px}
.fj-row{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:center;width:100%;min-height:64px;padding:8px 16px;border:0;border-left:3px solid transparent;background:transparent;text-align:left}
.fj-row:hover{background:rgba(255,255,255,.08)}.fj-row[aria-selected=true]{border-left-color:#f6c860;background:rgba(246,200,96,.12)}
.fj-row.is-ready{border-left-color:#5ccf8a}.fj-row.is-locked{opacity:.55}
.fj-ic{width:24px;height:24px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700}
.fj-ic.available{color:#f6c860}.fj-ic.ready{color:#5ccf8a}.fj-ic.active{color:#4aa3ff}.fj-ic.completed{color:#5ccf8a}.fj-ic.locked,.fj-ic.cooldown{color:#aab1c5}
.fj-t{font-weight:700;font-size:16px;white-space:normal}.fj-sub{display:block;font-size:12px;color:#aab1c5}
.fj-cnt{font-weight:700;font-size:14px;font-variant-numeric:tabular-nums;text-align:right}.fj-pin{display:block;font-size:12px;color:#f6c860}
.fj-detail{overflow:auto;padding:32px;min-height:0;display:flex;flex-direction:column}
.fj-detail h3{margin:0 0 8px;font:600 28px/1.15 "Cormorant Garamond",Georgia,serif}
.fj-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.fj-chip{height:28px;line-height:28px;padding:0 10px;border-radius:14px;border:1px solid #3a3f55;font-size:13px;background:rgba(255,255,255,.04)}
.fj-chip.giver{cursor:pointer}.fj-sum{color:#aab1c5;margin:0 0 6px}.fj-desc{margin:0 0 18px;max-width:70ch;line-height:1.5}
.fj-sec{font-size:14px;font-weight:700;letter-spacing:.08em;color:#aab1c5;margin:14px 0 8px}
.fj-obj{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;min-height:32px}
.fj-dot{width:18px;height:18px;border-radius:9px;border:2px solid #aab1c5;box-sizing:border-box}.fj-obj.done .fj-dot{border-color:#5ccf8a;background:#5ccf8a}
.fj-obj.done .fj-otext{color:#aab1c5;text-decoration:line-through}.fj-ocnt{font-weight:700;font-variant-numeric:tabular-nums}
.fj-bar{grid-column:2/4;height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}.fj-bar i{display:block;height:100%;background:#4aa3ff}.fj-obj.done .fj-bar i{background:#5ccf8a}
.fj-rewards{display:flex;flex-wrap:wrap;gap:12px}.fj-rw{min-width:112px;min-height:56px;border-radius:10px;border:1px solid #3a3f55;display:flex;align-items:center;justify-content:center;padding:6px 12px;font-weight:700}
.fj-rw.silk{color:#e8dcb4}.fj-rw.xp{color:#b06cff}.fj-rw.chest{border-color:#4aa3ff}
.fj-hints{background:rgba(74,163,255,.10);border-left:3px solid #4aa3ff;padding:12px 16px;border-radius:0 10px 10px 0;margin:0;padding-left:34px;font-size:15px}
.fj-foot{margin-top:auto;position:sticky;bottom:-32px;background:#0e1018;border-top:1px solid #3a3f55;padding:14px 0 0;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.fj-keys{flex:1;font-size:12px;color:#aab1c5;min-width:160px}
.fj-btn{min-height:44px;padding:0 18px;border-radius:10px;border:1px solid #3a3f55;background:transparent;font-weight:700}
.fj-btn.primary{background:#f6c860;color:#1b1608;border:0}.fj-btn.danger{border-color:#ff6b62;color:#ff6b62}.fj-btn[disabled]{opacity:.45;cursor:not-allowed}
.fj-empty{padding:28px 20px;color:#aab1c5;text-align:center}.fj-empty b{display:block;color:#eef0f6;margin-bottom:4px}
.fj-back-btn{display:none}
@media (max-width:899px){.fj{width:100vw;height:100vh;border-radius:0}.fj-body{grid-template-columns:1fr}.fj-row{min-height:72px}
 .fj.show-detail .fj-rail{display:none}.fj:not(.show-detail) .fj-detail{display:none}.fj-back-btn{display:inline-block}.fj-detail{padding:20px}}
html[data-motion=reduce] .fj.fj-anim{animation:none}
`;

/**
 * @param {object} o
 * @param {Document} o.doc @param {Window} o.win @param {(k: string, a?: object) => string} o.say
 * @param {(search: string) => object} o.model journalModel(...) for the current state
 * @param {(key: string) => string} o.giverName
 * @param {(view: object) => void} o.onWalk @param {(id: string) => {ok: boolean, reason?: string}} o.onTrack
 * @param {(id: string) => void} [o.onAbandon] @param {(tab: string) => void} [o.onOpen] @param {(tab: string) => void} [o.onClose]
 * @param {() => number} [o.now] @param {() => boolean} [o.reduced]
 */
export function createJournalUI({ doc, win, say, model, giverName, onWalk, onTrack, onAbandon = () => {}, onOpen = () => {}, onClose = () => {}, now = () => Date.now(), reduced = () => false }) {
  if (!doc.getElementById || !doc.getElementById('fj-css')) { const st = doc.createElement('style'); st.id = 'fj-css'; st.textContent = CSS; (doc.head || doc.body).append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let back = null, tab = 'story', selected = null, search = '', lastClick = { id: null, t: 0 }, timer = null;

  function close() {
    if (!back) return; back.remove(); back = null; if (timer) { clearInterval(timer); timer = null; }
    win.removeEventListener('keydown', onKey, true); onClose(tab);
  }
  function rowsOf(m) { return m.tabs[tab] || []; }
  function walk(v) { if (!v || v.status === 'locked') return; close(); onWalk(v); }

  function render() {
    if (!back) return;
    const m = model(search);
    const list = rowsOf(m);
    if (!selected || !list.some((v) => v.id === selected)) selected = list.length ? list[0].id : null;
    const view = list.find((v) => v.id === selected) || null;
    const box = back.firstChild; box.replaceChildren();
    // header
    const head = el('div', 'fj-head'); const h = el('h2', null, say('journal.title'));
    const x = el('button', 'fj-x', '×'); x.type = 'button'; x.setAttribute('aria-label', say('journal.close')); x.addEventListener('click', close);
    head.append(h, x);
    // rail
    const body = el('div', 'fj-body'), rail = el('div', 'fj-rail'), tabs = el('div', 'fj-tabs'); tabs.setAttribute('role', 'tablist');
    for (const [i, t] of TABS.entries()) {
      const b = el('button', 'fj-tab', say('journal.tab.' + t)); b.type = 'button'; b.dataset.tab = t; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', t === tab ? 'true' : 'false'); b.title = String(i + 1);
      if (m.badge[t]) b.append(el('span', 'fj-badge', String(m.badge[t])));
      b.addEventListener('click', () => { tab = t; selected = null; box.classList.remove('show-detail'); render(); });
      tabs.append(b);
    }
    const s = el('input', 'fj-search'); s.type = 'search'; s.placeholder = say('journal.search'); s.value = search; s.setAttribute('aria-label', say('journal.search'));
    s.addEventListener('input', () => { search = s.value; render(); const again = back && back.querySelector('.fj-search'); if (again && again.focus) { again.focus(); try { again.setSelectionRange(search.length, search.length); } catch { /* not a text field */ } } });
    const lst = el('div', 'fj-list'); lst.setAttribute('role', 'listbox');
    if (!list.length) lst.append(empty(m));
    for (const v of list) {
      const r = el('button', 'fj-row' + (v.status === 'ready' ? ' is-ready' : '') + (v.status === 'locked' ? ' is-locked' : '')); r.type = 'button'; r.dataset.quest = v.id;
      r.setAttribute('role', 'option'); r.setAttribute('aria-selected', v.id === selected ? 'true' : 'false');
      const ic = el('span', 'fj-ic ' + v.status, v.icon); ic.setAttribute('aria-hidden', 'true');
      const mid = el('span'); mid.append(el('span', 'fj-t', v.title), el('span', 'fj-sub', say('journal.lvGiver', { level: v.level, giver: giverName(v.giver) })));
      const right = el('span', 'fj-cnt', v.counter || ''); if (v.tracked) right.append(el('span', 'fj-pin', '📌'));
      r.append(ic, mid, right);
      r.addEventListener('click', () => {
        const t = now(), again = lastClick.id === v.id && selected === v.id;
        lastClick = { id: v.id, t };
        if (again) { walk(v); return; } // the second click on the selected row: Iris walks there
        selected = v.id; box.classList.add('show-detail'); render();
      });
      r.addEventListener('dblclick', () => walk(v));
      lst.append(r);
    }
    rail.append(tabs, s);
    if (tab === 'daily' && list.length) { const rs = el('div', 'fj-reset', say('journal.resetIn', { time: countdown(m.resetAt - now()) })); rs.dataset.resetAt = String(m.resetAt); rail.append(rs); } // the daily countdown (00:00 UTC)
    rail.append(lst);
    body.append(rail, detail(view, m));
    box.append(head, body);
  }

  function empty(m) {
    const e = el('div', 'fj-empty');
    if (search) { e.append(el('b', null, say('journal.empty.search', { q: search })), el('span', null, say('journal.empty.search.next'))); return e; }
    e.append(el('b', null, say('journal.empty.' + tab)), el('span', 'fj-empty-next', say('journal.empty.' + tab + '.next', { time: countdown(m.resetAt - now()) })));
    return e;
  }

  function detail(v, m) {
    const d = el('div', 'fj-detail');
    if (!v) { d.append(empty(m)); return d; }
    const backBtn = el('button', 'fj-btn fj-back-btn', '←'); backBtn.type = 'button'; backBtn.addEventListener('click', () => { back.firstChild.classList.remove('show-detail'); });
    const chips = el('div', 'fj-chips');
    chips.append(el('span', 'fj-chip', say('journal.cat.' + v.category)), el('span', 'fj-chip', say('journal.lv', { level: v.level })));
    const giver = el('span', 'fj-chip giver', say('journal.from', { giver: giverName(v.giver) })); chips.append(giver);
    chips.append(el('span', 'fj-chip', v.lockedLevel ? say('journal.status.lockedLevel', { level: v.lockedLevel }) : say('journal.status.' + v.status)));
    d.append(backBtn, el('h3', null, v.title), chips, el('p', 'fj-sum', v.summary), el('p', 'fj-desc', v.description));
    d.append(el('div', 'fj-sec', say('journal.objectives')));
    for (const o of v.objectives) {
      const row = el('div', 'fj-obj' + (o.done ? ' done' : '')); row.dataset.obj = o.id;
      const res = ((JOURNAL_BY_ID[v.id] || {}).objectives || []).find((x) => x.id === o.id)?.resource; // a delivery: A3's resource icon
      row.append(res ? artBox(doc, resIconPath(res), o.text, { size: 20, cls: 'ftf-art fj-res' }) : el('span', 'fj-dot'), el('span', 'fj-otext', o.text), el('span', 'fj-ocnt', `${o.count}/${o.of}`));
      if (res) row.dataset.res = res;
      if (o.type === 'kill' || o.type === 'gather' || o.of > 1) { const bar = el('span', 'fj-bar'); const i = el('i'); i.style.width = Math.round(100 * o.count / o.of) + '%'; bar.append(i); row.append(bar); }
      d.append(row);
    }
    d.append(el('div', 'fj-sec', say('journal.rewards')));
    const rw = el('div', 'fj-rewards');
    if (v.rewards.silk) rw.append(el('span', 'fj-rw silk', say('journal.reward.silk', { n: v.rewards.silk })));
    if (v.rewards.xp) rw.append(el('span', 'fj-rw xp', say('journal.reward.xp', { n: v.rewards.xp })));
    if (v.rewards.chest) rw.append(el('span', 'fj-rw chest', say('journal.reward.chest', { tier: v.rewards.chest[0].toUpperCase() + v.rewards.chest.slice(1) })));
    if (v.rewards.title) rw.append(el('span', 'fj-rw', say('journal.reward.title', { title: v.rewards.title })));
    d.append(rw);
    if (v.hints.length) { d.append(el('div', 'fj-sec', say('journal.howto'))); const ol = el('ol', 'fj-hints'); for (const hnt of v.hints) ol.append(el('li', null, hnt.text)); d.append(ol); }
    if (v.category === 'daily' && v.status === 'cooldown') d.append(el('p', 'fj-sum', say('journal.resetIn', { time: countdown(m.resetAt - now()) })));
    // actions
    const foot = el('div', 'fj-foot');
    foot.append(el('span', 'fj-keys', say('journal.keys')));
    const label = v.walk.kind === 'area' ? say('journal.walkArea', { area: v.walk.label.toLowerCase() }) : say(v.status === 'ready' ? 'journal.walkTurnIn' : 'journal.walk', { giver: giverName(v.walk.giver) });
    const wb = el('button', 'fj-btn primary fj-walk', label); wb.type = 'button'; wb.disabled = v.status === 'locked'; wb.addEventListener('click', () => walk(v));
    const tb = el('button', 'fj-btn fj-track', say(v.tracked ? 'journal.untrack' : 'journal.track')); tb.type = 'button';
    tb.addEventListener('click', () => { const r = onTrack(v.id); if (!r.ok) { tb.title = say('journal.trackFull'); tb.disabled = true; } else render(); });
    foot.append(wb, tb);
    const ab = el('button', 'fj-btn danger fj-abandon', say('journal.abandon')); ab.type = 'button';
    if (!v.canAbandon) { ab.disabled = true; ab.title = v.category === 'story' ? say('journal.abandonStory') : ''; }
    ab.addEventListener('click', () => { onAbandon(v.id); render(); });
    foot.append(ab);
    d.append(foot);
    return d;
  }

  function onKey(e) {
    if (!back) return;
    const tag = e.target && e.target.tagName, typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (e.key === 'Escape') { if (typing && search) { search = ''; render(); } else close(); e.stopPropagation(); return; }
    if (typing) return;
    if (e.code === 'KeyJ' || e.code === 'KeyL') { close(); e.stopPropagation(); return; }
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
    if (idx >= 0) { tab = TABS[idx]; selected = null; render(); e.stopPropagation(); return; }
    const list = rowsOf(model(search)), i = list.findIndex((v) => v.id === selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const n = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) { selected = n.id; render(); } e.preventDefault && e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Enter') { walk(list[i]); e.stopPropagation(); return; }
    if (e.code === 'KeyT' && list[i]) { onTrack(list[i].id); render(); e.stopPropagation(); }
  }

  return {
    get isOpen() { return !!back; }, get tab() { return tab; }, get selected() { return selected; },
    open(t = null, questId = null) {
      if (t && TABS.includes(t)) tab = t;
      if (questId) selected = questId;
      if (!back) {
        back = el('div', 'fj-back'); back.addEventListener('click', (e) => { if (e.target === back) close(); });
        const box = el('div', 'fj' + (reduced() ? '' : ' fj-anim')); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', say('journal.title'));
        back.append(box); doc.body.append(back);
        win.addEventListener('keydown', onKey, true);
        timer = setInterval(() => { if (tab !== 'daily' || !back) return; const rs = back.querySelector('.fj-reset'); if (rs) rs.textContent = say('journal.resetIn', { time: countdown(Number(rs.dataset.resetAt) - now()) }); else if (back.querySelector('.fj-empty-next')) render(); }, 1000); // the daily countdown, in place
        if (timer && timer.unref) timer.unref();
        onOpen(tab);
      }
      render();
    },
    close, refresh: render,
  };
}
