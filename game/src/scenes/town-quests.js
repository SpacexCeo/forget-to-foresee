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
import { portalFee } from '../game/expedition-config.js';

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
export function talkFor(giver, story, qs, { now = 0, hasPart = false } = {}) {
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
      return { lines, choices: [{ key: 'quest.' + short + '.yes', act: 'accept:' + g.id }, { key: 'story.talk.notYet', act: 'close' }] };
    }
    case 'active': {
      if (q.objective.type === 'fetch') return { lines: ['quest.part.accept'], choices: [...(hasPart ? [{ key: 'quest.part.have', act: 'turnin:q_part' }] : []), { key: 'quest.part.again', act: 'line:steps' }, close] };
      return { lines: ['quest.' + short + '.progress'], args: { n: done ? done.progress : 0, count: q.objective.count }, choices: [close] };
    }
    case 'ready': return { lines: ['quest.' + short + '.ready'], choices: [{ key: 'quest.' + short + '.report', act: 'turnin:' + g.id }] };
    default: return { lines: ['quest.' + short + '.thanks'], choices: [close] };
  }
}

/** The objective line (pure): the active quest's tracker, else the story step. {key, args} or null. */
export function objective(story, qs, now = 0) {
  for (const id of ['q_boss', 'q_spiders', 'q_part', 'b_spiders', 'q_welcome']) {
    const st = questStatus(qs, id, now), q = qs.quests[id];
    if (st === 'ready') return { key: 'quest.track.ready', args: { giver: QUESTS[id].giver } };
    if (st === 'active') {
      const ob = QUESTS[id].objective;
      if (ob.type === 'kill') return { key: 'quest.track.' + (ob.mob === 'crownrift' ? 'boss' : 'spiders'), args: { n: q.progress, count: ob.count } };
      if (ob.type === 'fetch') return { key: 'quest.track.part', args: {} };
      if (ob.type === 'guide') return { key: 'quest.track.welcome', args: {} };
    }
  }
  const k = storyStep(story); return k ? { key: k, args: {} } : null;
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
export function createTownQuests({ storage, townLedger, i18n, folkAt = () => null, inventory = null, chests = null, depart = null, search = '', doc = globalThis.document, win = globalThis, now = () => Date.now() }) {
  const t = (k, a) => i18n.t(k, a);
  const fee = portalFee(search);
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
  function storyDo(action) { const r = reduce(story, action, { now: now(), feeC: fee.feeC, demoFee: fee.demo }); if (r.rejected) return r; story = r.state; apply(r.events); changed(); return r; }
  function questDo(action) { const r = applyQuest(qs, action, { now: now() }); if (r.rejected) return r; qs = r.state; apply(r.events); changed(); return r; }

  // ---- the objective line (one goal, top centre)
  let active = true;
  const line = doc.createElement('div'); line.className = 'ftf-story-goal'; line.setAttribute('aria-live', 'polite');
  const narrow = (Number(win.innerWidth) || 1024) < 600; // the phone's top row holds the portrait and the silk pill
  line.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + ' + (narrow ? 146 : 58) + 'px);transform:translateX(-50%);z-index:9;pointer-events:none;max-width:calc(100vw - 32px);'
    + 'padding:6px 14px;border-radius:999px;background:rgba(12,16,18,.62);color:#f3ead8;font:600 13px/1.3 system-ui,sans-serif;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  doc.body.append(line);
  function renderObjective() {
    const o = objective(story, qs, now());
    const silk = Math.floor(townLedger.silk / 100).toLocaleString('en-US'), goal = Math.round(fee.feeC / 100).toLocaleString('en-US');
    line.textContent = o ? t(o.key, { ...o.args, giver: o.args && o.args.giver ? t('folk.name.' + o.args.giver) : '' }) + ' · ' + t('story.goal.silk', { n: silk, fee: goal }) + (fee.demo ? ' · ' + t('story.portal.demo') : '') : '';
    line.hidden = !active || !o || story.phase === 'onward';
  }

  // ---- the talk panel for the four givers
  let panel = null, panelGiver = null;
  function closeTalk() { if (panel) { panel.remove(); panel = null; panelGiver = null; } }
  const hasPart = () => !!(inventory && firstPart());
  function firstPart() { try { const all = inventory.list ? inventory.list(PART_IDS.map((id) => ({ id, kind: 'part' }))) : []; return all.length ? all[0].id : null; } catch { return null; } }
  function openTalk(giver, extraLines = null) {
    closeTalk(); panelGiver = giver;
    const tk = talkFor(giver, story, qs, { now: now(), hasPart: hasPart() });
    const lines = extraLines || tk.lines;
    panel = doc.createElement('div'); panel.className = 'ftf-story-talk'; panel.setAttribute('role', 'dialog');
    panel.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);transform:translateX(-50%);z-index:30;width:min(460px,calc(100vw - 32px));'
      + 'padding:14px 16px;border-radius:14px;background:rgba(12,16,18,.92);border:1px solid rgba(217,178,106,.45);color:#f3ead8;font:15px/1.45 system-ui,sans-serif';
    const who = doc.createElement('b'); who.textContent = t('folk.name.' + giver); who.style.cssText = 'display:block;color:#d9b26a;font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px';
    panel.append(who);
    for (const k of lines) { const p = doc.createElement('p'); p.textContent = t(k, tk.args || {}); p.style.margin = '0 0 8px'; panel.append(p); }
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
      const r = questDo({ type: 'TURN_IN', questId: arg, partId: part, partSource: 'inventory' });
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
  const onKill = (e) => { const d = (e && e.detail) || {}; if (!d.type) return; questDo({ type: 'KILL', mob: d.type, killId: d.id ? d.id + ':' + (d.n ?? killN) : d.type + ':' + now() + ':' + killN }); killN++; };
  win.addEventListener('ftf:mob-killed', onKill);

  // ---- the guide's 'moved' step: walking a few metres from where she arrived
  let start = null;

  // ---- the Gate-Loom and the twist
  let twisting = false;
  async function payGate() {
    const r = storyDo({ type: 'PAY_GATE', balanceC: townLedger.silk });
    if (r.rejected) return false;
    twisting = true;
    if (depart) { try { await depart({ sub: t('story.twist.line') }); } catch { /* the transition logs its own failure */ } }
    storyDo({ type: 'TWIST_DONE' }); // the stipend; the title and the sealed chest below
    if (chests) chests.add({ tier: 'common', source: 'quest' });
    story = { ...story, titles: [...new Set([...(story.titles || []), 'gate_walker'])] }; changed();
    twisting = false;
    return true;
  }

  if (story.phase === 'off') storyDo({ type: 'START', skipPrologue: true }); // the prologue (P4) is optional: arrival
  renderObjective();
  return {
    spots,
    get story() { return story; }, get quests() { return qs; }, get ledger() { return ledger; }, get fee() { return fee; },
    get talking() { return !!panel; }, get twisting() { return twisting; },
    /** Live facts for the portal. */
    portalFacts: () => ({ phase: story.phase, balanceC: townLedger.silk, feeC: fee.feeC, demo: fee.demo }),
    payGate,
    /** Per frame: the guide's movement step, the gate opening with the balance, a talk closing when she walks off. */
    update(pos) {
      if (pos && !start) start = [pos[0], pos[2]];
      if (pos && start && !story.guide.moved && Math.hypot(pos[0] - start[0], pos[2] - start[1]) > 6) { storyDo({ type: 'GUIDE_STEP', id: 'moved' }); questDo({ type: 'GUIDE', step: 'moved' }); }
      if (story.phase === 'gathering' || story.phase === 'gate_open') { const before = story.phase; const r = reduce(story, { type: 'SILK', balanceC: townLedger.silk }, { feeC: fee.feeC }); if (r.state.phase !== before) { story = r.state; changed(); } }
      if (panel && panelGiver && pos) { const p = folkAt(panelGiver); if (p && Math.hypot(p[0] - pos[0], p[2] - pos[2]) > 4.5) closeTalk(); }
    },
    act, openTalk, closeTalk,
    /** Leaving the town hides the objective line and any talk; the story state lives on (the twist runs across it). */
    setActive(on) { active = !!on; if (!active) closeTalk(); renderObjective(); },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    dispose() { closeTalk(); line.remove(); win.removeEventListener('ftf:mob-killed', onKill); },
  };
}

/** The spare parts a lamplighter accepts (items manifest kind 'part'). */
export const PART_IDS = Object.freeze(['part_gear', 'part_spring_coil', 'part_chain_link', 'part_rivet_plate', 'part_spindle', 'part_crank', 'part_valve', 'part_gauge', 'part_brass_lens', 'part_glyph_cogring']);
