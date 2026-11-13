// The Expedition in the hill town (story P2/P3/P5, docs/plans/story/FTF-Story-Quests-Leaderboard-TZ.md): the story
// state (game/expedition.js) and the citizens' quests (game/quest-rules.js) driven by the town: the elder's starter
// guide, the guard's spiders and bounty, the lamplighter's spare part, the shardkeeper's crown; kills from the window
// event ftf:mob-killed; every silk delta through the expedition ledger (town silk + the hash-chained log); a one-goal
// objective line; the Gate-Loom (scenes/town-portal.js) and the twist that sends Iris onward to the archipelago.
// Behind ?story=1: without the flag nothing is created and nothing is written.
import { reduce, initialState, storyStep, STORY_KEY } from '../game/expedition.js';
import { applyQuest, initialQuests, questStatus, QUESTS_KEY } from '../game/quest-rules.js';
import { QUESTS } from '../game/quests-data.js';
import { createExpeditionLedger } from '../game/expedition-ledger.js';
import { EXPEDITION } from '../game/expedition-config.js';
import { rollDrops, missingFor, RESOURCE_IDS } from '../game/resources.js';
import { silkView, subscribeSilk, refreshSilk, formatSilkC } from '../net/silk-core.js';
import { features } from '../features.js';
import { createSay, giverName as nameOf } from '../quests/say.js';
import { journalModel, questView, toggleTrack, MAX_TRACKED } from '../quests/journal-model.js';
import { createJournalUI } from '../quests/journal-ui.js';
import { createTrackerUI } from '../quests/tracker-ui.js';
import { createAutoWalk, setAutoWalker } from '../sprint/auto-walk.js';
import { GIVER_NAMES } from '../game/journal-data.js';
import { loadGuide, guideEvent, guideView, GUIDE_KEY, registerGuideCoach, coachFor } from '../quests/guide.js';
import { questMarkers } from '../quests/markers-feed.js';
import { createWaypoint, createTrail, trailDots } from '../quests/waypoint-ui.js';
import { TOWN_ORIGIN } from './town-layout.js';
import * as THREE from 'three';
import { setMarkers } from '../sprint/markers.js';

/** A sprint flag: features.json (sprint §3.6), or ?ff=questJournal,questTracker,autoWalk for a local check. */
export function flagOn(name, search = (globalThis.location && globalThis.location.search) || '') {
  if (features.on(name)) return true;
  try { return (new URLSearchParams(search).get('ff') || '').split(',').includes(name); } catch { return false; }
}

/** Which quest a giver talks about now (pure): the first of theirs that is not done, else the last. */
export function giverQuest(qs, giver, now = 0) {
  const ids = Object.keys(QUESTS).filter((id) => QUESTS[id].giver === giver);
  for (const id of ids) { const st = questStatus(qs, id, now); if (st !== 'done') return { id, status: st }; }
  return ids.length ? { id: ids[ids.length - 1], status: 'done' } : null;
}

/**
 * The talk for a giver (pure): {lines: [key...], args, choices: [{key, act}]}; act is applied by the view.
 * @param {string} giver @param {object} story @param {object} qs @param {{now?: number, hasPart?: boolean}} [o]
 */
export function talkFor(giver, story, qs, { now = 0, hasPart = false, have = {} } = {}) {
  const close = { key: 'story.talk.bye', act: 'close' };
  if (giver === 'elder') {
    const w = questStatus(qs, 'q_welcome', now);
    if (w === 'ready') return { lines: ['story.guide.go'], choices: [{ key: 'story.talk.thanks', act: 'turnin:q_welcome' }] };
    if (story.guide.talked && w === 'done') return { lines: ['story.guide.again'], choices: [close] };
    return { lines: ['story.guide.hello'], choices: [{ key: 'story.guide.ask.where', act: 'line:story.guide.fee' }, { key: 'story.guide.ask.silk', act: 'line:story.guide.how' }, { key: 'story.guide.ask.ok', act: 'guide:talked' }] };
  }
  const g = giverQuest(qs, giver, now); if (!g) return { lines: ['story.talk.quiet'], choices: [close] };
  const q = QUESTS[g.id], short = g.id === 'b_spiders' ? 'bounty' : g.id.slice(2), done = qs.quests[g.id];
  switch (g.status) {
    case 'locked': return { lines: [g.id === 'q_boss' ? 'quest.locked.boss' : 'quest.locked.spiders'], choices: [close] };
    case 'available': {
      const lines = ['quest.' + short + '.offer']; if (g.id === 'q_boss') lines.push('quest.boss.warn');
      if (g.id === 'q_part') lines.push(...q.steps);
      if (q.needs) lines.push('quest.needs.ask');
      return { lines, needs: q.needs || null, choices: [{ key: 'quest.' + short + '.yes', act: 'accept:' + g.id }, { key: 'story.talk.notYet', act: 'close' }] };
    }
    case 'active': {
      if (q.objective.type === 'fetch') { const miss = missingFor(q.needs, have); return { lines: ['quest.part.accept', ...(miss.length ? ['quest.needs.missing'] : [])], needs: miss.length ? q.needs : null, choices: [...(hasPart && !miss.length ? [{ key: 'quest.part.have', act: 'turnin:q_part' }] : []), { key: 'quest.part.again', act: 'line:steps' }, close] }; }
      return { lines: ['quest.' + short + '.progress'], args: { n: done ? done.progress : 0, count: q.objective.count }, choices: [close] };
    }
    case 'ready': { const miss = missingFor(q.needs, have); if (miss.length) return { lines: ['quest.needs.missing'], needs: q.needs, choices: [close] }; return { lines: ['quest.' + short + '.ready'], choices: [{ key: 'quest.' + short + '.report', act: 'turnin:' + g.id }] }; }
    default: return { lines: ['quest.' + short + '.thanks'], choices: [close] };
  }
}

/** The objective line (pure): the active quest's tracker, else the story step. {key, args} or null. */
export function objective(story, qs, now = 0, have = {}) {
  // a quest to turn in first, then the active one, then a giver with an offer, then the story's step
  for (const id of ['q_boss', 'q_spiders', 'q_part', 'b_spiders', 'q_welcome']) {
    const st = questStatus(qs, id, now), q = qs.quests[id], giver = QUESTS[id].giver;
    if (st === 'ready') { const miss = missingFor(QUESTS[id].needs, have); if (miss.length) return { key: 'quest.track.needs', args: { id: miss[0].id, n: miss[0].have, count: miss[0].need } }; return { key: 'quest.track.ready', args: { giver }, giver }; }
    if (st === 'active') {
      const ob = QUESTS[id].objective;
      if (ob.type === 'kill') {
        if (q.progress >= ob.count) continue;
        return { key: 'quest.track.' + (ob.mob === 'crownrift' ? 'boss' : 'spiders'), args: { n: q.progress, count: ob.count } };
      }
      if (ob.type === 'fetch') { const miss = missingFor(QUESTS[id].needs, have); return miss.length ? { key: 'quest.track.needs', args: { id: miss[0].id, n: miss[0].have, count: miss[0].need } } : { key: 'quest.track.part', args: {} }; }
      if (ob.type === 'guide') return { key: 'quest.track.welcome', args: {}, giver: 'elder' };
    }
  }
  if (!(story.guide && story.guide.talked) && questStatus(qs, 'q_welcome', now) === 'available') return { key: 'story.step.talk', args: {}, giver: 'elder' };
  for (const id of ['q_spiders', 'q_part', 'q_boss', 'b_spiders']) if (questStatus(qs, id, now) === 'available') return { key: 'quest.track.offer', args: { giver: QUESTS[id].giver }, giver: QUESTS[id].giver };
  const k = storyStep(story); return k ? { key: k, args: {} } : null;
}

/** The marker over a giver (pure): '?' when a quest of theirs can be turned in, '!' when one is on offer, else null. */
export function markerFor(giver, story, qs, now = 0, have = {}) {
  let offer = false;
  for (const id of Object.keys(QUESTS)) {
    if (QUESTS[id].giver !== giver || QUESTS[id].auto) continue; // auto quests (side/daily/tournament) need no talk
    const st = questStatus(qs, id, now), q = QUESTS[id];
    if (st === 'ready' && !missingFor(q.needs, have).length) return '?';
    if (st === 'active' && q.objective.type === 'guide' && story.guide && story.guide.moved) return '?';
    if (st === 'available' && !(id === 'q_welcome' && story.guide && story.guide.talked)) offer = true;
  }
  return offer ? '!' : null;
}

/** The quest log (pure): active and ready quests first, then the offers; progress, needs (with what she holds), reward. */
export function questLog(story, qs, now = 0, have = {}) {
  const rows = [];
  for (const id of Object.keys(QUESTS)) {
    const st = questStatus(qs, id, now); if (!['active', 'ready', 'available'].includes(st)) continue;
    const q = QUESTS[id], cur = qs.quests[id] || {};
    rows.push({ id, giver: q.giver, title: q.title, status: st, progress: q.objective.type === 'kill' ? (cur.progress || 0) : null, count: q.objective.type === 'kill' ? q.objective.count : null,
      needs: Object.entries(q.needs || {}).map(([res, need]) => ({ id: res, need, have: Math.min(need, Math.max(0, Number(have[res]) || 0)) })), rewardSilk: q.reward.silk });
  }
  const rank = { ready: 0, active: 1, available: 2 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status]);
}

const load = (storage, key, fresh) => { try { const v = JSON.parse((storage && storage.getItem(key)) || 'null'); return v && v.v === 1 ? v : fresh(); } catch { return fresh(); } };

/**
 * @param {object} o
 * @param {object} o.storage @param {object} o.townLedger game/town-economy.js @param {object} o.i18n
 * @param {(key: string) => number[]|null} o.folkAt world position of a townsperson (the givers walk)
 * @param {object} [o.inventory] game/inventory.js (a part for the lamplighter) @param {object} [o.chests] game/chests.js
 * @param {(opts: {sub: string}) => Promise} [o.depart] the town's transition to the archipelago (town-flow depart)
 * @param {string} [o.search] @param {Document} [o.doc] @param {Window} [o.win] @param {() => number} [o.now]
 */
export function createTownQuests({ scene = null, hudToast = null, storage, townLedger, i18n, folkAt = () => null, inventory = null, chests = null, depart = null, gate = null, walkDriver = null, toWorld = null, camera = null, portalAt = null, level = () => 1, flags = flagOn, storyDrops = true, search = '', doc = globalThis.document, win = globalThis, now = () => Date.now() }) {
  const t = (k, a) => i18n.t(k, a);
  // The Gate-Loom is paid on chain (rev 4): its price and the player's silk are ftf-town's gate_price and balance_of,
  // paying is the guest's pay_gate (net/town-gate.js, injected as `gate`). Without a gate nothing can be paid.
  let syncing = false;
  let chain = { ok: false, reason: gate ? 'loading' : 'not_configured', priceC: EXPEDITION.PORTAL_FEE_C, balanceC: 0, paid: null }, lastRead = -Infinity, reading = false, payError = null;
  const feeC = () => (chain.ok ? chain.priceC : EXPEDITION.PORTAL_FEE_C);
  // The ONE silk number (net/silk-balance.js, sprint 6.2): shown = silk recorded on NEAR (the same number as the HUD chip);
  // payable = that plus the earned-and-checked silk the relayer records (credits) right before it pays.
  const heldC = () => { const v = silkView(); return v.chainOk ? v.gateC : (chain.ok ? chain.balanceC : 0); };
  const balanceC = () => { const v = silkView(); return v.chainOk ? v.gateC + v.pendingC : (chain.ok ? Math.max(chain.balanceC, ledger ? ledger.earnedVerifiedC : 0) : 0); };
  const fee = { get feeC() { return feeC(); }, demo: false };
  async function refreshChain() {
    if (!gate || reading) return chain; reading = true; lastRead = now();
    try { const c = await gate.read(); chain = c && c.ok ? c : { ...chain, ok: false, reason: (c && c.reason) || 'network' }; } catch { chain = { ...chain, ok: false, reason: 'network' }; }
    reading = false; refreshSilk(true).catch(() => {}); gateFromBalance(); changed(); return chain;
  }
  function gateFromBalance() { if (story.phase === 'gathering' || story.phase === 'gate_open') { const r = reduce(story, { type: 'SILK', balanceC: balanceC() }, { feeC: feeC() }); if (r.state.phase !== story.phase) story = r.state; } }
  let story = load(storage, STORY_KEY, initialState);
  let qs = load(storage, QUESTS_KEY, initialQuests);
  const ledger = createExpeditionLedger({ storage, now, town: townLedger });
  const save = () => { try { storage.setItem(STORY_KEY, JSON.stringify(story)); storage.setItem(QUESTS_KEY, JSON.stringify(qs)); } catch { /* memory only */ } };
  const listeners = new Set();
  const changed = () => { save(); renderObjective(); for (const f of [...listeners]) f(); };

  /** Story events into the log (and town silk); quest rewards' xp and chests into their stores. */
  function apply(events) {
    for (const e of events) {
      const r = ledger.append({ kind: e.kind, data: e.data || {}, silkC: e.silkC || 0, trust: e.trust || 'T2' });
      if (!r.ok) return false;
      if (e.data && e.data.xp) townLedger.grant({ xp: e.data.xp });
      if (e.data && e.data.chest && chests) chests.add({ tier: e.data.chest, source: 'quest' });
    }
    return true;
  }
  function storyDo(action) { const r = reduce(story, action, { now: now(), feeC: feeC(), demoFee: false }); if (r.rejected) return r; story = r.state; apply(r.events); changed(); return r; }
  function questDo(action) { const r = applyQuest(qs, action, { now: now() }); if (r.rejected) return r; qs = r.state; apply(r.events); changed(); return r; }

  // ---- the objective line (one goal, top centre)
  let active = true;
  const line = doc.createElement('div'); line.className = 'ftf-story-goal'; line.setAttribute('aria-live', 'polite');
  const narrow = (Number(win.innerWidth) || 1024) < 600; // the phone's top row holds the portrait and the silk pill
  line.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + ' + (narrow ? 146 : 58) + 'px);transform:translateX(-50%);z-index:9;pointer-events:none;max-width:calc(100vw - 32px);'
    + 'padding:6px 14px;border-radius:999px;background:rgba(12,16,18,.62);color:#f3ead8;font:600 13px/1.3 system-ui,sans-serif;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  doc.body.append(line);
  function renderObjective() {
    const o = objective(story, qs, now(), have());
    const silk = formatSilkC(heldC()), goal = formatSilkC(feeC()); // the one silk number: recorded on NEAR (ftf-town)
    const near = o && o.giver ? distanceTo(o.giver) : null;
    line.textContent = o ? t(o.key, { ...o.args, giver: o.args && o.args.giver ? t('folk.name.' + o.args.giver) : '', res: o.args && o.args.id ? t('res.' + o.args.id) : '' }) + (near != null ? ' · ' + t('quest.track.near', { m: near }) : '') + ' · ' + t('story.goal.silk', { n: silk, fee: goal }) : '';
    line.hidden = !active || !o || story.phase === 'onward' || useTracker; // the tracker replaces this pill (sprint §4.8)
    if (!useTracker) line.title = line.textContent; // the flag-off fallback: the full text is always reachable
  }

  // ---- where she is (update) and how far a giver stands
  let herPos = null;
  const distanceTo = (giver) => { const p = folkAt(giver); return p && herPos ? Math.round(Math.hypot(p[0] - herPos[0], p[2] - herPos[2])) : null; };

  // ---- the quest log (J, or the button in the HUD tray): active, ready and offered quests at a glance
  let logPanel = null, logT = -Infinity, lineT = -Infinity;
  function closeLog() { if (logPanel) { logPanel.remove(); logPanel = null; } }
  function renderLog() {
    const rows = questLog(story, qs, now(), have());
    const p = doc.createElement('div'); p.className = 'ftf-quest-log'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', t('quest.log.title'));
    p.style.cssText = 'position:fixed;right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 96px);z-index:70;width:min(340px,calc(100vw - 32px));max-height:min(64vh,520px);overflow:auto;'
      + 'padding:12px 14px;border-radius:14px;background:rgba(12,16,18,.92);border:1px solid rgba(217,178,106,.45);color:#f3ead8;font:14px/1.4 system-ui,sans-serif';
    const head = doc.createElement('div'); head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px';
    const h = doc.createElement('b'); h.textContent = t('quest.log.title'); h.style.cssText = 'color:#d9b26a;font-size:13px;letter-spacing:.06em;text-transform:uppercase';
    const x = doc.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', t('quest.log.close'));
    x.style.cssText = 'min-width:44px;min-height:44px;border-radius:10px;border:1px solid rgba(243,234,216,.3);background:transparent;color:inherit;font:600 16px system-ui;cursor:pointer';
    x.addEventListener('click', (e) => { e.stopPropagation(); closeLog(); });
    head.append(h, x); p.append(head);
    if (!rows.length) { const e = doc.createElement('p'); e.textContent = t('quest.log.empty'); e.style.margin = '4px 0'; p.append(e); }
    for (const r of rows) {
      const item = doc.createElement('div'); item.className = 'ftf-quest-row'; item.dataset.quest = r.id; item.style.cssText = 'padding:8px 0;border-top:1px solid rgba(243,234,216,.1)';
      const title = doc.createElement('b'); title.textContent = (r.status === 'ready' ? '? ' : r.status === 'available' ? '! ' : '') + t(r.title); title.style.cssText = 'display:block;color:' + (r.status === 'active' ? '#f3ead8' : '#ffc861');
      const meta = doc.createElement('span'); const d = distanceTo(r.giver);
      meta.textContent = t('quest.log.' + r.status) + ' · ' + (d != null ? t('quest.log.where', { giver: t('folk.name.' + r.giver), m: d }) : t('folk.name.' + r.giver)) + ' · ' + t('quest.log.reward', { silk: r.rewardSilk });
      meta.style.cssText = 'display:block;font-size:12px;color:#b9c7c4';
      item.append(title, meta);
      const bits = [];
      if (r.count != null) bits.push(t('quest.log.progress', { n: r.progress, count: r.count }));
      for (const n of r.needs) bits.push(t('quest.needs.item', { res: t('res.' + n.id), have: n.have, n: n.need }));
      if (bits.length) { const b = doc.createElement('span'); b.className = 'ftf-quest-needs'; b.textContent = bits.join(' · '); b.style.cssText = 'display:block;font-size:13px;margin-top:2px'; item.append(b); }
      p.append(item);
    }
    return p;
  }
  function openLog() { closeLog(); logPanel = renderLog(); doc.body.append(logPanel); }
  function toggleLog() { if (journal) { if (journal.isOpen) journal.close(); else journal.open(); return; } if (logPanel) closeLog(); else openLog(); }
  const onKey = (e) => {
    const tag = e && e.target && e.target.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'KeyJ' || e.key === 'j' || e.key === 'J') { toggleLog(); }
    else if (e.key === 'Escape' && logPanel) closeLog();
  };
  win.addEventListener('keydown', onKey);
  const logBtn = doc.createElement('button'); logBtn.type = 'button'; logBtn.className = 'ftf-quest-log-btn'; logBtn.textContent = '!';
  logBtn.setAttribute('aria-label', t('quest.log.button')); logBtn.title = t('quest.log.button');
  logBtn.style.cssText = 'min-width:44px;min-height:44px;border-radius:999px;border:1px solid rgba(217,178,106,.6);background:rgba(12,16,18,.7);color:#ffc861;font:700 18px system-ui;cursor:pointer';
  logBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  logBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLog(); });
  { const tray = doc.querySelector && doc.querySelector('.ph-wallet'); if (tray && tray.prepend) tray.prepend(logBtn); else { logBtn.style.position = 'fixed'; logBtn.style.right = 'calc(env(safe-area-inset-right,0px) + 12px)'; logBtn.style.top = 'calc(env(safe-area-inset-top,0px) + 50px)'; logBtn.style.zIndex = '30'; doc.body.append(logBtn); } }

  // ---- the talk panel for the four givers
  let panel = null, panelGiver = null;
  function closeTalk() { if (panel) { panel.remove(); panel = null; panelGiver = null; } }
  const hasPart = () => !!(inventory && firstPart());
  const have = () => { const o = {}; if (inventory && inventory.count) { for (const id of RESOURCE_IDS) o[id] = inventory.count(id); o.part = PART_IDS.reduce((x, id) => x + inventory.count(id), 0); } return o; };
  function firstPart() { try { const all = inventory.list ? inventory.list(PART_IDS.map((id) => ({ id, kind: 'part' }))) : []; return all.length ? all[0].id : null; } catch { return null; } }
  function openTalk(giver, extraLines = null) {
    if (typeof feedGuide === 'function' && !extraLines) feedGuide('talked:' + giver);
    closeTalk(); panelGiver = giver;
    const h = have(); const tk = talkFor(giver, story, qs, { now: now(), hasPart: hasPart(), have: h });
    const needsText = tk.needs ? Object.entries(tk.needs).map(([id, n]) => t('quest.needs.item', { n, have: h[id] || 0, res: t('res.' + id) })).join(', ') : '';
    const lines = extraLines || tk.lines;
    panel = doc.createElement('div'); panel.className = 'ftf-story-talk'; panel.setAttribute('role', 'dialog');
    panel.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);transform:translateX(-50%);z-index:30;width:min(460px,calc(100vw - 32px));'
      + 'padding:14px 16px;border-radius:14px;background:rgba(12,16,18,.92);border:1px solid rgba(217,178,106,.45);color:#f3ead8;font:15px/1.45 system-ui,sans-serif';
    const who = doc.createElement('b'); who.textContent = t('folk.name.' + giver); who.style.cssText = 'display:block;color:#d9b26a;font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px';
    panel.append(who);
    for (const k of lines) { const p = doc.createElement('p'); p.textContent = t(k, { ...(tk.args || {}), list: needsText }); p.style.margin = '0 0 8px'; panel.append(p); }
    const row = doc.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:4px';
    for (const c of tk.choices) {
      const b = doc.createElement('button'); b.type = 'button'; b.textContent = t(c.key);
      b.style.cssText = 'min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid rgba(243,234,216,.35);background:rgba(217,178,106,.14);color:inherit;font:600 14px system-ui;cursor:pointer';
      b.addEventListener('click', (e) => { e.stopPropagation(); act(giver, c.act); });
      row.append(b);
    }
    panel.append(row); doc.body.append(panel);
    const first = row.querySelector('button'); if (first && first.focus) first.focus();
  }
  function act(giver, a) {
    const [verb, arg] = String(a).split(':');
    if (verb === 'close') { closeTalk(); return; }
    if (verb === 'line') { openTalk(giver, arg === 'steps' ? QUESTS.q_part.steps : [arg]); return; }
    if (verb === 'guide') { storyDo({ type: 'GUIDE_STEP', id: arg }); questDo({ type: 'GUIDE', step: arg }); if (questStatus(qs, 'q_welcome', now()) === 'available') questDo({ type: 'ACCEPT', questId: 'q_welcome' }); openTalk(giver, ['story.guide.go']); return; }
    if (verb === 'accept') { questDo({ type: 'ACCEPT', questId: arg }); openTalk(giver, [arg === 'q_part' ? 'quest.part.accept' : arg === 'q_boss' ? 'quest.boss.accept' : arg === 'b_spiders' ? 'quest.bounty.accept' : 'quest.spiders.accept']); return; }
    if (verb === 'turnin') {
      const part = arg === 'q_part' ? firstPart() : null;
      const r = questDo({ type: 'TURN_IN', questId: arg, partId: part, partSource: 'inventory', have: have() });
      if (!r.rejected && inventory && inventory.take) { for (const [id, n] of Object.entries(QUESTS[arg].needs || {})) inventory.take(id, n); if (part) inventory.take(part, 1); renderObjective(); }
      if (arg === 'q_welcome' && !r.rejected) storyDo({ type: 'GUIDE_STEP', id: 'talked' }); // the elder's second talk: free play
      closeTalk(); return;
    }
  }

  // ---- spots: the givers (where they walk now) for the town's prompt and E
  const spots = ['elder', 'guard', 'lamplighter', 'shardkeeper'].map((giver) => ({
    id: 'story_' + giver, priority: true,
    near: (pos) => { const p = folkAt(giver); return !!p && Math.hypot(p[0] - pos[0], p[2] - pos[2]) <= 2.4 && Math.abs(p[1] - pos[1]) < 2.5; },
    prompt: () => t('story.talk.prompt', { name: t('folk.name.' + giver) }),
    onInteract: () => { openTalk(giver); return true; },
    busy: () => panelGiver === giver,
  }));

  // ---- kills (play/mobs.js window event): quest progress and kill silk
  let killN = 0;
  const onKill = (e) => { const d = (e && e.detail) || {}; if (!d.type) return;
    if (storyDrops && inventory && typeof d.killId === 'string') for (const x of rollDrops(d.killId, d.type)) inventory.add(x.id, x.n, 'drop'); // until the combat stream's drops land
    questDo({ type: 'KILL', mob: d.type, killId: typeof d.killId === 'string' && d.killId ? d.killId : d.type + ':' + now() + ':' + killN }); /* play/mobs.js: stable per creature and life */ killN++; };
  win.addEventListener('ftf:mob-killed', onKill);
  win.addEventListener('ftf:journal-toggle', toggleLog); // the rpg HUD's J button, via sprint/window-router.js

  // ---- the guide's 'moved' step: walking a few metres from where she arrived
  let start = null;

  // ---- the Gate-Loom and the twist
  let twisting = false;
  async function payGate() {
    if (!gate || twisting || story.phase === 'twist' || story.phase === 'onward') return false; // paid once: no second call to the chain
    twisting = true; payError = null;
    let p; try { p = await gate.pay(); } catch { p = { ok: false, reason: 'network' }; }
    if (!p || !p.ok) { twisting = false; payError = (p && p.reason) || 'network'; await refreshChain(); return false; }
    // paid on chain (or already paid): the log records it once, with the receipt
    storyDo({ type: 'SILK', balanceC: Math.max(balanceC(), feeC()) });
    const r = storyDo({ type: 'PAY_GATE', balanceC: Math.max(balanceC(), feeC()), tx: p.hash || null });
    if (r.rejected) { twisting = false; payError = r.rejected; return false; }
    if (depart) { try { await depart({ sub: t('story.twist.line') }); } catch { /* the transition logs its own failure */ } }
    storyDo({ type: 'TWIST_DONE' }); // the stipend; the title and the sealed chest below
    if (chests) chests.add({ tier: 'common', source: 'quest' });
    story = { ...story, titles: [...new Set([...(story.titles || []), 'gate_walker'])] }; changed();
    try { win.dispatchEvent(new CustomEvent('ftf:story-onward', { detail: { paidAt: story.paidAt ?? null, logHead: ledger.log.length ? ledger.log[ledger.log.length - 1].hash : null } })); } catch { /* no CustomEvent: nothing listens */ }
    twisting = false;
    return true;
  }

  // ---- the quest journal, the tracker and auto-walk (sprint §4.7-4.10; flags questJournal, questTracker, autoWalk)
  const say = createSay(i18n), gname = (k) => nameOf(say, k, GIVER_NAMES);
  const useJournal = flags('questJournal'), useTracker = flags('questTracker'), useWalk = flags('autoWalk') && !!walkDriver, useGuide = flags('starterGuide');
  let guide = loadGuide(storage);
  const notify = (text) => { if (hudToast) { hudToast(text); return; } try { win.dispatchEvent(new CustomEvent('ftf:toast', { detail: { text } })); } catch { /* none */ } }; // the HUD toast stack (boot-world toast)
  function feedGuide(ev) {
    if (!useGuide) return;
    const r = guideEvent(guide, ev); if (!r.completed) return;
    guide = r.state; try { storage.setItem(GUIDE_KEY, JSON.stringify(guide)); } catch { /* memory only */ }
    try { win.dispatchEvent(new CustomEvent('ftf:guide.step', { detail: { id: r.completed, done: true } })); } catch { /* none */ }
    if (r.reward) { townLedger.grant({ xp: r.reward }); notify(say('guide.done')); }
    if (tracker) tracker.refresh(true);
  }
  // coach marks for steps 4, 6, 7 (sprint §4.11): the seam's first-seen bubble at the HUD button, once each
  // first-seen is loaded lazily: a static import from here would tie the play and sprint chunks into a cycle (TDZ at boot)
  let showTip = null;
  if (useGuide) import('../sprint/first-seen.js').then((fs) => { registerGuideCoach(fs.registerTip, (n, total) => say('guide.title', { n, total })); showTip = fs.showTip; }).catch(() => { /* no coach marks */ });
  let coached = null; const bornAt = now();
  function coach() { const id = useGuide && active ? coachFor(guide) : null; if (id && showTip && id !== coached && now() - bornAt > 4000) { coached = id; showTip(id); } } // after the HUD has mounted
  let tracked = []; try { tracked = (JSON.parse((storage && storage.getItem('ftf.tracked.v1')) || '[]') || []).filter((id) => QUESTS[id]).slice(0, MAX_TRACKED); } catch { tracked = []; }
  const saveTracked = () => { try { storage.setItem('ftf.tracked.v1', JSON.stringify(tracked)); } catch { /* memory only */ } };
  const lvl = () => { try { return Math.max(1, Number(level()) || 1); } catch { return 1; } };
  const jModel = (q2 = '') => journalModel({ qs, now: now(), have: have(), level: lvl(), tracked, search: q2, giverName: gname });
  const walker = useWalk ? createAutoWalk({ driver: walkDriver, say, toast: notify, doc,
    emit: (n, pl) => { try { win.dispatchEvent(new CustomEvent('ftf:' + n, { detail: pl })); } catch { /* none */ } } }) : null;
  if (walker) setAutoWalker(walker);
  function walkTo(v) {
    if (!walker || !v) return false;
    if (v.walk.kind === 'area' && toWorld) { const w = toWorld([v.walk.pos[0], 0, v.walk.pos[1]]); return !!walker.autoWalkTo({ pos: [w[0], w[2]], stopRadius: 3, label: v.walk.label, questId: v.id }); }
    const giver = v.walk.giver, p = folkAt(giver); if (!p) return false;
    return !!walker.autoWalkTo({ pos: [p[0], p[2]], stopRadius: 2.2, label: gname(giver), questId: v.id, follow: () => { const q2 = folkAt(giver); return q2 ? [q2[0], q2[2]] : null; } });
  }
  const journal = useJournal ? createJournalUI({ doc, win, say, model: jModel, giverName: gname, now,
    onWalk: (v) => walkTo(v),
    onTrack: (id) => { const r = toggleTrack(tracked, id); if (r.ok) { tracked = r.tracked; saveTracked(); if (tracker) tracker.refresh(true); } return r; },
    onAbandon: (id) => { questDo({ type: 'ABANDON', questId: id }); },
    onOpen: () => { if (tracker) tracker.setHidden(true); feedGuide('journal'); }, onClose: () => { if (tracker) { tracker.setHidden(!active); tracker.refresh(true); } } }) : null;
  const townObjective = () => (doc.querySelector ? doc.querySelector('.ftf-town-objective') : null);
  let lastErrand = null;
  const errand = () => { const e = townObjective(); const txt = e && !e.hidden ? (e.textContent || '').trim() : ''; return txt || null; };
  const tracker = useTracker ? createTrackerUI({ doc, say, giverName: gname, storage,
    data: () => ({ tracked: tracked.map((id) => questView(id, { qs, now: now(), have: have(), level: lvl(), tracked })).filter(Boolean), road: { gateC: balanceC(), feeC: feeC() }, errand: errand(), guide: useGuide ? guideView(guide, Math.round(feeC() / 100)) : null }),
    onHideGuide: () => { guide = { ...guide, hidden: true }; try { storage.setItem(GUIDE_KEY, JSON.stringify(guide)); } catch { /* memory only */ } tracker.refresh(true); },
    onOpen: (id) => { if (journal) journal.open(null, id); }, onWalk: (v) => walkTo(v) }) : null;
  if (useTracker && doc.body && doc.body.classList) { doc.body.classList.add('ftf-tracker-on'); if (!doc.getElementById || !doc.getElementById('ft-hide-pill')) { const st = doc.createElement('style'); st.id = 'ft-hide-pill'; st.textContent = 'body.ftf-tracker-on .ftf-town-objective{display:none!important}'; (doc.head || doc.body).append(st); } }
  const onGuideKey = (e) => { const tag = e && e.target && e.target.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return; if (e.code === 'KeyR') feedGuide('camera'); else if (e.code === 'KeyI') feedGuide('bag'); else if (e.code === 'KeyB') feedGuide('market'); };
  const onDrag = (e) => { if (e && e.buttons && e.target && e.target.tagName === 'CANVAS') feedGuide('camera'); };
  const onPortal = () => feedGuide('portal'), onHit = () => feedGuide('hit');
  if (useGuide) { win.addEventListener('keydown', onGuideKey); win.addEventListener('pointermove', onDrag); win.addEventListener('ftf:portal-near', onPortal); win.addEventListener('ftf:mob-killed', onHit); win.addEventListener('ftf:mob-hit', onHit); }
  function autoTrack() { // newly accepted quests are tracked while fewer than three are
    for (const id of Object.keys(QUESTS)) { const st = questStatus(qs, id, now()); if ((st === 'active' || st === 'ready') && !tracked.includes(id) && tracked.length < MAX_TRACKED && !QUESTS[id].auto) { tracked = [...tracked, id]; saveTracked(); } }
    tracked = tracked.filter((id) => questStatus(qs, id, now()) !== 'done'); // a finished quest leaves the tracker; anything else the player pinned stays
  }
  // ---- the waypoint arrow to the pinned quest's target and the markers for the maps (sprint §4.9)
  const v3 = new THREE.Vector3();
  const targetOf = (v) => { if (!v) return null; if (v.walk.kind === 'area' && toWorld) return toWorld([v.walk.pos[0], 0, v.walk.pos[1]]); const p = folkAt(v.walk.giver); return p ? [p[0], p[1] + 1.6, p[2]] : null; };
  const trail = walker && scene ? createTrail({ THREE, scene }) : null; // the auto-walk ground trail (sprint §4.9)
  const waypoint = useTracker && camera ? createWaypoint({ doc, win, view: { project: (p) => { v3.set(p[0], p[1], p[2]).project(camera); return { x: v3.x, y: v3.y, z: v3.z, behind: v3.z > 1 }; } },
    target: () => { if (!tracked.length || !herPos) return null; const pos = targetOf(questView(tracked[0], { qs, now: now(), have: have(), level: lvl(), tracked })); return pos ? { pos, from: herPos } : null; },
    hidden: () => !active || !!(journal && journal.isOpen) }) : null;
  let lastMarkers = '', markersT = -Infinity;
  function publishMarkers() {
    const giverAt = (k) => { const p = folkAt(k); return p ? [p[0] - TOWN_ORIGIN[0], p[2] - TOWN_ORIGIN[2]] : null; };
    const list = questMarkers({ qs, now: now(), have: have(), tracked, giverAt, portal: portalAt, giverName: gname });
    const key = JSON.stringify(list.map((m) => [m.id, m.kind, m.pinned, Math.round(m.pos[0]), Math.round(m.pos[1])]));
    if (key === lastMarkers) return list; lastMarkers = key;
    globalThis.__ftfQuestMarkers = list;
    setMarkers('quests', list); // the shared marker seam (sprint/markers.js): the minimap reads it
    try { win.dispatchEvent(new CustomEvent('ftf:markers', { detail: { source: 'quests', list } })); } catch { /* none */ }
    return list;
  }
  function errandWatch() { // the innkeeper's sign: the town errand moving past "read" completes s_sign
    const txt = errand(), readTxt = i18n.t('quest.obj.read');
    if (lastErrand === readTxt && txt !== readTxt) questDo({ type: 'EVENT', event: 'read' });
    lastErrand = txt;
  }

  if (!useTracker) { // flag off (sprint §4.8): the old pill wraps instead of cutting, shows its full text and opens the log
    line.style.pointerEvents = 'auto'; line.style.whiteSpace = 'normal'; line.style.overflow = 'visible'; line.style.textOverflow = 'clip'; line.style.maxWidth = 'min(560px, 92vw)'; line.style.cursor = 'pointer';
    line.addEventListener('click', (e) => { e.stopPropagation(); toggleLog(); });
  }
  if (story.phase === 'off') storyDo({ type: 'START', skipPrologue: true }); // the prologue (P4) is optional: arrival
  if (qs.since == null) questDo({ type: 'BEGIN' }); // the guide's grace period: the guard's quest opens even if the elder is skipped
  if (gate) refreshChain();
  const unSilk = subscribeSilk(() => { gateFromBalance(); renderObjective(); }); // the shared model moved: same number here as on the HUD
  renderObjective();
  return {
    spots,
    get story() { return story; }, get quests() { return qs; }, get ledger() { return ledger; }, get fee() { return fee; },
    get talking() { return !!panel; }, get twisting() { return twisting; },
    /** Live facts for the portal. */
    portalFacts: () => ({ phase: story.phase, balanceC: balanceC(), heldC: heldC(), onChainC: heldC(), totalC: balanceC(), pendingC: silkView().pendingC, feeC: feeC(), demo: false, blocker: chain.ok ? null : chain.reason, payError, paying: twisting, syncing }),
    /** E at the Gate-Loom when the verified silk would cover the fee: the relayer credits it on chain (credit only). */
    async syncGate() { if (!gate || !gate.sync || syncing) return false; syncing = true; changed(); try { const r = await gate.sync(); payError = r && r.ok ? null : ((r && r.reason) || 'network'); } catch { payError = 'network'; } syncing = false; await refreshChain(); return !payError; },
    refreshChain, get chain() { return chain; },
    payGate,
    /** Per frame: the guide's movement step, the gate opening with the balance, a talk closing when she walks off. */
    update(pos) {
      if (walker) { walker.update(); if (trail) trail.set(walker.active && pos ? trailDots(pos, walker.path) : null); }
      if (tracker || journal) { autoTrack(); errandWatch(); if (tracker) tracker.refresh(); }
      if (waypoint) waypoint.update();
      if ((tracker || journal) && now() - markersT > 1000) { markersT = now(); publishMarkers(); coach(); }
      if (pos) { herPos = pos; if (now() - lineT > 1000) { lineT = now(); renderObjective(); } } // the distance to the next giver
      if (logPanel && now() - logT > 1000) { logT = now(); const fresh = renderLog(); logPanel.replaceWith ? logPanel.replaceWith(fresh) : (logPanel.remove(), doc.body.append(fresh)); logPanel = fresh; }
      if (pos && !start) start = [pos[0], pos[2]];
      if (pos && start && !story.guide.moved && Math.hypot(pos[0] - start[0], pos[2] - start[1]) > 6) { storyDo({ type: 'GUIDE_STEP', id: 'moved' }); questDo({ type: 'GUIDE', step: 'moved' }); }
      if (pos && start && Math.hypot(pos[0] - start[0], pos[2] - start[1]) > 6) feedGuide('moved');
      if (gate && now() - lastRead > 20_000) refreshChain(); // the on-chain balance grows with the relayer's story credits
      if (panel && panelGiver && pos) { const p = folkAt(panelGiver); if (p && Math.hypot(p[0] - pos[0], p[2] - pos[2]) > 4.5) closeTalk(); }
    },
    act, openTalk, closeTalk,
    /** Leaving the town hides the objective line and any talk; the story state lives on (the twist runs across it). */
    setActive(on) { active = !!on; if (!active) { if (trail) trail.set(null); closeTalk(); closeLog(); if (journal) journal.close(); if (walker) walker.cancel('replaced'); } if (tracker) tracker.setHidden(!active); logBtn.hidden = !active; renderObjective(); },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    /** Markers over the givers: [{giver, sym: '!'|'?'}] for scenes/quest-markers.js. */
    markers: () => ['elder', 'guard', 'lamplighter', 'shardkeeper'].map((giver) => ({ giver, sym: markerFor(giver, story, qs, now(), have()) })).filter((m) => m.sym),
    openLog, closeLog, toggleLog, get logOpen() { return !!logPanel || !!(journal && journal.isOpen); },
    get guide() { return guide; }, feedGuide, publishMarkers,
    get journal() { return journal; }, get tracker() { return tracker; }, get walker() { return walker; }, walkTo, get tracked() { return tracked.slice(); },
    dispose() { unSilk(); setMarkers('quests', []); if (trail) trail.dispose(); if (waypoint) waypoint.dispose(); if (journal) journal.close(); if (tracker) tracker.dispose(); if (walker) { walker.dispose(); setAutoWalker(null); } if (doc.body && doc.body.classList) doc.body.classList.remove('ftf-tracker-on'); closeTalk(); closeLog(); logBtn.remove(); line.remove(); win.removeEventListener('ftf:mob-killed', onKill); win.removeEventListener('ftf:journal-toggle', toggleLog); win.removeEventListener('keydown', onKey); win.removeEventListener('keydown', onGuideKey); win.removeEventListener('pointermove', onDrag); win.removeEventListener('ftf:portal-near', onPortal); win.removeEventListener('ftf:mob-killed', onHit); win.removeEventListener('ftf:mob-hit', onHit); },
  };
}

/** The spare parts a lamplighter accepts (items manifest kind 'part'). */
export const PART_IDS = Object.freeze(['part_gear', 'part_spring_coil', 'part_chain_link', 'part_rivet_plate', 'part_spindle', 'part_crank', 'part_valve', 'part_gauge', 'part_brass_lens', 'part_glyph_cogring']);
