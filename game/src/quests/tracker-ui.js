// The quest tracker (sprint §4.8): replaces the one-line pills that cut text off. Right edge on desktop, a card under
// the top row on phones; nothing is ever truncated (long lines wrap; the phone card shows three lines, then "Show
// more"). Top to bottom: the header "Quests [J]" with collapse, the Road Home bar ("{gate} / {fee} silk"), the pinned
// quest (title, objectives with counters, "Ready: turn in to <Giver>", a walk button and an expand chevron with the
// full description and hints), up to two more tracked quests, and the town errand (the innkeeper's chain) in full.
// DOM only; the data comes from the caller.

const CSS = `
.ft{position:fixed;right:calc(env(safe-area-inset-right,0px) + 16px);top:calc(env(safe-area-inset-top,0px) + 150px);width:min(320px,calc(100vw - 24px));max-height:min(420px,60vh);overflow:auto;z-index:12;
 box-sizing:border-box;padding:10px 12px;border-radius:10px;background:rgba(14, 20, 18,.72);color:var(--ftf-text, #eef0ea);font:14px/1.4 "Atkinson Hyperlegible",system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:auto}
.ft[hidden]{display:none}.ft button{font:inherit;color:inherit;cursor:pointer}
.ft-head{display:flex;align-items:center;gap:6px;font-weight:700}.ft-head span{flex:1}.ft-key{color:var(--ftf-muted, #aab6b0);font-weight:400}
.ft-ib{min-width:28px;min-height:28px;border-radius:8px;border:1px solid var(--ftf-border, rgba(197,164,105,.4));background:rgba(255,255,255,.06);padding:0 6px}
.ft-road{display:block;width:100%;text-align:left;margin:8px 0;padding:6px 8px;border-radius:8px;border:1px solid var(--ftf-border, rgba(197,164,105,.4));background:rgba(255,255,255,.04)}
.ft-road small{display:block;color:var(--ftf-muted, #aab6b0);font-size:12px}.ft-road b{color:#e8dcb4;font-size:16px}
.ft-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.08);margin-top:4px;overflow:hidden}.ft-bar i{display:block;height:100%;background:#e8dcb4}
.ft-q{padding:6px 0;border-top:1px solid rgba(255,255,255,.08)}
.ft-qh{display:flex;gap:6px;align-items:flex-start}.ft-title{flex:1;text-align:left;border:0;background:transparent;padding:0;font-weight:700;color:var(--ftf-gold, #c5a469);white-space:normal}
.ft-obj{display:flex;gap:8px;justify-content:space-between;white-space:normal}.ft-obj.done{color:var(--ftf-muted, #aab6b0);text-decoration:line-through}.ft-obj b{font-variant-numeric:tabular-nums}
.ft-ready{color:#5ccf8a;font-weight:700}.ft-more{color:var(--ftf-muted, #aab6b0);font-size:13px;margin-top:4px;white-space:normal}
.ft-q.compact .ft-title{color:var(--ftf-text, #eef0ea);font-weight:600}.ft-none{color:var(--ftf-muted, #aab6b0);white-space:normal}
.ft-flash{animation:ft-flash 1.2s}@keyframes ft-flash{0%,60%{background:rgba(92,207,138,.25)}100%{background:transparent}}
@media (max-width:599px){.ft{top:calc(env(safe-area-inset-top,0px) + 112px);right:12px;left:12px;width:auto;max-height:40vh}.ft.ft-short .ft-rest{display:none}}
html[data-motion=reduce] .ft-flash{animation:none}
.ft-close{font-size:12px;line-height:1}
.ft.ft-compact{background:none;border:0;box-shadow:none;padding:0;max-height:none;overflow:visible;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 6px rgba(0,0,0,.5);width:min(300px,calc(100vw - 100px))}
.ft-cline{display:flex;align-items:center;gap:2px;padding:2px 4px 2px 8px;border-radius:8px;background:rgba(10,14,16,.5);width:max-content;max-width:100%;box-sizing:border-box}
.ft-croad{flex:1;display:flex;flex-wrap:wrap;column-gap:6px;align-items:baseline;border:0;background:none;padding:2px 0;text-align:left;font-weight:500}
.ft-cic{color:#f0c75e;font-size:11px}.ft-croad b{color:#e8dcb4;font-weight:600}
.ft-cobj{display:flex;gap:6px;margin:4px 0 0 8px;border:0;background:none;padding:0;color:rgba(240,242,240,.78);font-size:13px;text-align:left}
.ft.ft-compact .ft-ib{border:0;background:none;min-width:24px;min-height:24px;padding:0 4px;color:rgba(240,242,240,.85)}
`;

/** The tracker's saved choices (ftf.tracker.v1): collapsed, hidden (the × hides it entirely; the Journal brings it back)
 * and compact (null: decided by the window size). Pure over a storage; a broken store gives the defaults. */
export function loadTrackerPref(storage) {
  const d = { collapsed: false, hidden: false, compact: null };
  try { const r = JSON.parse((storage && storage.getItem('ftf.tracker.v1')) || '{}'); return { ...d, ...(r && typeof r === 'object' ? r : {}) }; } catch { return d; }
}
export function saveTrackerPref(storage, pref) { try { if (storage) storage.setItem('ftf.tracker.v1', JSON.stringify(pref)); return true; } catch { return false; } }
/** Small windows (narrower than 1100 px or lower than 720 px) start with the compact tracker: the active quest line only. */
export const startsCompact = (w, h) => w < 1100 || h < 720;
/** Compact now? The player's own choice wins; otherwise the window size decides. Pure. */
export const isCompact = (pref, w, h) => (pref.compact === true || pref.compact === false ? pref.compact : startsCompact(w, h));

/**
 * @param {object} o
 * @param {Document} o.doc @param {(k: string, a?: object) => string} o.say @param {(key: string) => string} o.giverName
 * @param {() => {tracked: object[], road: {gateC: number, feeC: number}, errand: string|null}} o.data
 * @param {(id: string|null) => void} o.onOpen opens the journal (at a quest) @param {(view: object) => void} o.onWalk
 * @param {object} [o.storage] keeps the collapsed state (ftf.tracker.v1)
 */
export function createTrackerUI({ doc, say, giverName, data, onOpen, onWalk, onHideGuide = () => {}, storage = null, win = null }) {
  if (!doc.getElementById || !doc.getElementById('ft-css')) { const st = doc.createElement('style'); st.id = 'ft-css'; st.textContent = CSS; (doc.head || doc.body).append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pref = loadTrackerPref(storage);
  const save = () => saveTrackerPref(storage, pref);
  const view = win || doc.defaultView || globalThis.window || null;
  const compactNow = () => isCompact(pref, view && view.innerWidth ? view.innerWidth : 1920, view && view.innerHeight ? view.innerHeight : 1080);
  let outerHidden = false;   // the scene hides it (the Journal is open, the town is not active)
  const apply = () => { root.hidden = outerHidden || !!pref.hidden; };
  const root = el('div', 'ft'); root.setAttribute('role', 'region'); root.setAttribute('aria-label', say('tracker.title'));
  doc.body.append(root); apply();
  let expanded = null, short = true, lastKey = '';

  function block(v, pinned) {
    const b = el('div', 'ft-q' + (pinned ? '' : ' compact')); b.dataset.quest = v.id;
    const h = el('div', 'ft-qh');
    const title = el('button', 'ft-title', v.title); title.type = 'button'; title.addEventListener('click', () => onOpen(v.id));
    h.append(title);
    if (pinned) {
      const w = el('button', 'ft-ib ft-walk', '➜'); w.type = 'button'; w.title = say('tracker.walk'); w.setAttribute('aria-label', say('tracker.walk')); w.addEventListener('click', () => onWalk(v));
      const x = el('button', 'ft-ib ft-expand', expanded === v.id ? '▴' : '▾'); x.type = 'button'; x.title = say(expanded === v.id ? 'tracker.less' : 'tracker.more');
      x.addEventListener('click', () => { expanded = expanded === v.id ? null : v.id; render(true); });
      h.append(w, x);
    }
    b.append(h);
    if (v.status === 'ready') b.append(el('div', 'ft-ready', say('tracker.ready', { giver: giverName(v.turnIn) })));
    const objs = pinned ? v.objectives : v.objectives.filter((o) => !o.done).slice(0, 1);
    if (v.status !== 'ready') for (const o of objs) { const r = el('div', 'ft-obj' + (o.done ? ' done' : '')); r.append(el('span', null, o.text), el('b', null, `${o.count}/${o.of}`)); b.append(r); }
    if (pinned && expanded === v.id) { b.append(el('div', 'ft-more', v.description)); for (const hn of v.hints) b.append(el('div', 'ft-more', '• ' + hn.text)); }
    return b;
  }

  function render(force = false) {
    const d = data(); if (!d) return;
    const compact = compactNow();
    const key = JSON.stringify([d.tracked.map((v) => [v.id, v.status, v.objectives.map((o) => o.count)]), d.road, d.errand, d.guide || null, pref.collapsed, expanded, short, compact]);
    if (!force && key === lastKey) return; lastKey = key;
    root.replaceChildren();
    root.classList.toggle('ft-short', short); root.classList.toggle('ft-compact', compact);
    const gate = Math.floor(d.road.gateC / 100), fee = Math.round(d.road.feeC / 100);
    if (compact) {   // two lines: the Road home, and the active quest (or the guide step, or the town errand)
      const line = el('div', 'ft-cline'), road = el('button', 'ft-croad'); road.type = 'button';
      road.append(el('span', 'ft-cic', '\u25C6'), el('span', null, say('tracker.road')), el('b', null, say('tracker.roadValue', { gate, fee })));
      road.addEventListener('click', () => onOpen(null));
      const more = el('button', 'ft-ib ft-showmore', '\u2304'); more.type = 'button'; more.title = say('tracker.more'); more.setAttribute('aria-label', say('tracker.more'));
      more.addEventListener('click', () => { pref.compact = false; save(); render(true); });   // the full tracker, remembered
      const hide = el('button', 'ft-ib ft-close', '\u00D7'); hide.type = 'button'; hide.title = say('tracker.hide'); hide.setAttribute('aria-label', say('tracker.hide'));
      hide.addEventListener('click', () => { pref.hidden = true; save(); apply(); });
      line.append(road, more, hide); root.append(line);
      const q = d.tracked[0];
      const text = q ? (q.status === 'ready' ? `${q.title} \u00B7 ${say('tracker.ready', { giver: giverName(q.turnIn) })}` : q.title) : d.guide ? d.guide.text : d.errand;
      if (text) { const ob = el('button', 'ft-cobj'); ob.type = 'button'; ob.append(el('span', null, '\u25CE'), el('span', null, text)); ob.addEventListener('click', () => onOpen(q ? q.id : null)); root.append(ob); }
      return;
    }
    const head = el('div', 'ft-head'); head.append(el('span', null, say('tracker.title')), el('small', 'ft-key', '[J]'));
    const col = el('button', 'ft-ib ft-collapse', pref.collapsed ? '+' : '–'); col.type = 'button'; col.title = say(pref.collapsed ? 'tracker.expand' : 'tracker.collapse');
    col.addEventListener('click', () => { pref.collapsed = !pref.collapsed; save(); render(true); });
    const hide = el('button', 'ft-ib ft-close', '×'); hide.type = 'button'; hide.title = say('tracker.hide'); hide.setAttribute('aria-label', say('tracker.hide'));
    hide.addEventListener('click', () => { pref.hidden = true; save(); apply(); });   // gone entirely; the Journal's checkbox brings it back
    head.append(col, hide); root.append(head);
    if (pref.collapsed) return;
    const road = el('button', 'ft-road'); road.type = 'button';
    road.append(el('small', null, say('tracker.road')), el('b', null, say('tracker.roadValue', { gate, fee })));
    const bar = el('div', 'ft-bar'); const i = el('i'); i.style.width = Math.min(100, Math.round(100 * d.road.gateC / Math.max(1, d.road.feeC))) + '%'; bar.append(i); road.append(bar);
    road.title = say('tracker.roadValue', { gate, fee });
    road.addEventListener('click', () => onOpen(null));
    root.append(road);
    const rest = el('div', 'ft-rest');
    if (!d.tracked.length && !d.guide) root.append(el('div', 'ft-none', say('tracker.none')));   // one next action: the guide step stands in for "No quest tracked"
    d.tracked.forEach((v, n) => (n === 0 ? root : rest).append(block(v, n === 0)));
    if (d.guide) { // the starter guide's active step (sprint §4.11)
      const g = el('div', 'ft-q ft-guide'); g.dataset.step = d.guide.id;
      const gh = el('div', 'ft-qh'); gh.append(el('span', 'ft-title', say('guide.title', { n: d.guide.n, total: d.guide.total })));
      const hx = el('button', 'ft-ib ft-guide-hide', '✕'); hx.type = 'button'; hx.title = say('guide.hide'); hx.setAttribute('aria-label', say('guide.hide')); hx.addEventListener('click', () => onHideGuide());
      gh.append(hx); g.append(gh, el('div', 'ft-obj', d.guide.text)); root.append(g);
    }
    if (d.errand) { const e = el('div', 'ft-q compact'); e.append(el('div', 'ft-title', say('tracker.town')), el('div', 'ft-obj', d.errand)); rest.append(e); }
    root.append(rest);
    if (rest.children.length) {
      const more = el('button', 'ft-ib ft-showmore', say(short ? 'tracker.more' : 'tracker.less')); more.type = 'button';
      more.addEventListener('click', () => { short = !short; render(true); });
      root.append(more);
    }
  }
  return {
    root, refresh: render,
    flash(id) { const b = root.querySelector && root.querySelector(`[data-quest="${id}"]`); if (b) { b.classList.remove('ft-flash'); void b.offsetWidth; b.classList.add('ft-flash'); } },
    setHidden(h) { outerHidden = !!h; apply(); },
    /** The player's choice (the × and the Journal's "Show the quest tracker"): persisted in ftf.tracker.v1. */
    get shown() { return !pref.hidden; },
    setShown(on) { pref.hidden = !on; save(); apply(); if (on) render(true); },
    dispose() { root.remove(); },
  };
}
