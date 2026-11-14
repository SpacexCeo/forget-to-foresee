// Town tales in the town (game/tales.js has the rules): the talk spots on the townsfolk the tales use, the talk panel
// (the same look as the quest givers' panel in scenes/town-quests.js), the marks over heads, toasts for progress,
// the rewards (town XP, a chest, a postcard) and the sounds. Kills arrive as window 'ftf:mob-killed' (play/mobs.js).
// Two tales share one stored state: "The Ink That Remembers" (flag tales) and "The Lost Tourist" (flag wayfarers,
// the Wayfarer from Kallima: play/townsfolk-plan.js WAYFARERS, walked through play/townsfolk.js walkAlong).
import { artBox } from '../market/art.js';
import { portraitPath } from '../quests/portraits.js';
import { TALES_KEY, INK, LOST, cleanTales, inkDo, inkTalk, inkMarkers, lostDo, lostTalk, lostMarkers, wayLine } from '../game/tales.js';
import { WAYFARER_TO_GATE } from '../play/townsfolk-plan.js';
import { PORTAL_TOWN } from './town-portal.js';

const INK_NPCS = Object.freeze(['scribe', 'sweeper']);
/** The postcard's picture (an original sign: two moons over lilac hills and a singing lantern), drawn in SVG. */
const KALLIMA_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1f4a"/><stop offset="1" stop-color="#8d6fb8"/></linearGradient></defs>'
  + '<rect width="200" height="200" rx="24" fill="url(#s)"/><circle cx="62" cy="58" r="22" fill="#f4e6ff" opacity=".9"/><circle cx="132" cy="44" r="11" fill="#ffd9a8" opacity=".85"/>'
  + '<path d="M0 150 C40 112 78 130 104 118 C134 104 162 120 200 104 V200 H0 Z" fill="#5d4a86"/><path d="M0 172 C46 146 92 160 128 150 C160 142 182 152 200 146 V200 H0 Z" fill="#3e3164"/>'
  + '<g transform="translate(150 118)"><line x1="0" y1="0" x2="0" y2="30" stroke="#e9cf95" stroke-width="3"/><circle cx="0" cy="-6" r="9" fill="#ffe7a6"/><circle cx="0" cy="-6" r="16" fill="#ffe7a6" opacity=".25"/>'
  + '<path d="M14 -16 q6 -6 12 0 M18 -24 q8 -8 16 0" stroke="#ffe7a6" stroke-width="2" fill="none" opacity=".8"/></g></svg>';

/**
 * @param {object} o
 * @param {(k: string, a?: object) => string} o.t @param {object} o.storage @param {object} o.ledger game/town-economy.js
 * @param {object} [o.chests] game/chests.js @param {(key: string) => number[]|null} o.folkAt world position of a townsperson
 * @param {() => boolean} [o.dark] after dark (render/daycycle.js via boot-world) @param {(s: string) => void} [o.toast]
 * @param {(name: string) => void} [o.sound] a town cue (audio/town-audio.js)
 * @param {object} [o.inkOn] () => boolean: the ink tale (flag tales) @param {() => boolean} [o.lostOn] the Lost Tourist (flag wayfarers)
 * @param {object} [o.folk] play/townsfolk.js (walkAlong, walkDone, setGone, visitorShown)
 * @param {(local: number[]) => number[]} [o.toWorld] town-local to world (the Gate-Loom's place) @param {(key: string, line: string) => void} [o.say] a bubble line (scenes/barks.js say)
 * @param {(card: object) => void} [o.postcard] opens ui/postcard.js with {kicker, title, line, signSvg}
 */
export function createTownTales({ t, storage, ledger, chests = null, folkAt, dark = () => true, toast = () => {}, sound = () => {}, inkOn = () => true, lostOn = () => false,
  folk = null, toWorld = null, say = () => {}, postcard = () => {}, now = () => performance.now() / 1000, doc = globalThis.document, win = globalThis }) {
  let state = (() => { try { return cleanTales(JSON.parse((storage && storage.getItem(TALES_KEY)) || 'null')); } catch { return cleanTales(null); } })();
  const save = () => { try { if (storage) storage.setItem(TALES_KEY, JSON.stringify(state)); } catch { /* private mode */ } };
  const level = () => (ledger && ledger.level ? ledger.level.level : 1);
  const gate = toWorld ? toWorld(PORTAL_TOWN) : null;
  let escortT0 = null, lastWay = null, chats = 0, leftThisSession = false;

  function apply(a) {
    const r = inkDo(state, { level: level(), dark: dark(), ...a });
    if (!r.events.length) return r;
    state = r.state; save();
    for (const ev of r.events) {
      if (ev.e === 'accepted') { toast(t('tale.ink.toast.accepted')); sound('ui_confirm'); }
      else if (ev.e === 'bell') { if (ev.n < INK.bells) toast(t('tale.ink.toast.bell', { n: ev.n, count: INK.bells })); }
      else if (ev.e === 'quiet') { toast(t('tale.ink.toast.quiet')); sound('ui_notify'); }
      else if (ev.e === 'sent') { if (!dark()) toast(t('tale.ink.toast.dark')); }
      else if (ev.e === 'jar') sound('memory_dissolve');
      else if (ev.e === 'reward') {
        if (ledger && ledger.grant) ledger.grant({ xp: INK.reward.xp });
        if (chests && chests.add) chests.add({ tier: INK.reward.chest, source: 'quest' });
        toast(t('tale.ink.toast.reward', { xp: INK.reward.xp })); sound('gift_chime');
        try { win.dispatchEvent(new CustomEvent('ftf:feat', { detail: { k: 'tale', v: 'ink:' + ev.choice } })); } catch { /* the action feed is optional */ }
      }
    }
    return r;
  }
  function applyLost(a) {
    const r = lostDo(state.lost, a);
    if (!r.events.length) return r;
    state = { ...state, lost: r.lost }; save();
    for (const ev of r.events) {
      if (ev.e === 'escort') {
        toast(t('tale.lost.toast.accepted')); sound('ui_confirm');
        if (folk && folk.walkAlong) folk.walkAlong(LOST.npc, WAYFARER_TO_GATE);
        escortT0 = now(); lastWay = null;
      } else if (ev.e === 'arrived') sound('ui_notify');
      else if (ev.e === 'postcard') {
        if (ledger && ledger.grant) ledger.grant({ xp: LOST.reward.xp });
        toast(t('tale.lost.toast.reward', { xp: LOST.reward.xp })); sound('gift_chime');
        postcard({ kicker: t('tale.lost.card.kicker'), title: t('tale.lost.card.title'), line: t('tale.lost.card.line'), signSvg: KALLIMA_SVG });
        // they step through the Gate-Loom to their group; back on the street next time the town is visited
        leftThisSession = true; if (folk && folk.setGone) folk.setGone(LOST.npc, true);
        try { win.dispatchEvent(new CustomEvent('ftf:feat', { detail: { k: 'tale', v: 'lost' } })); } catch { /* optional */ }
      }
    }
    return r;
  }
  // a reload during the walk: the Wayfarer is back home and the walk is offered again (cleanTales); sync the body
  if (folk && folk.setGone) folk.setGone(LOST.npc, false);

  const talkOf = (npc) => {
    if (npc === LOST.npc) return lostOn() && folk && folk.visitorShown && folk.visitorShown(npc) ? lostTalk(state.lost, chats) : null;
    return inkOn() ? inkTalk(state, npc, { level: level(), dark: dark() }) : null;
  };

  // ---- the talk panel
  let panel = null, panelNpc = null;
  function close() { if (panel) { panel.remove(); panel = null; panelNpc = null; } }
  function open(npc, override = null) {
    const tk = override || talkOf(npc);
    if (!tk) return false;
    close(); panelNpc = npc;
    const title = t(npc === LOST.npc ? 'tale.lost.title' : 'tale.ink.title');
    panel = doc.createElement('div'); panel.className = 'ftf-story-talk ftf-tale-talk'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', title);
    panel.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);transform:translateX(-50%);z-index:30;width:min(460px,calc(100vw - 32px));box-sizing:border-box;'
      + 'padding:14px 16px;border-radius:14px;background:rgba(12,16,18,.92);border:1px solid rgba(217,178,106,.45);color:#f3ead8;font:15px/1.45 system-ui,sans-serif';
    const head = doc.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:6px';
    const who = doc.createElement('b'); who.textContent = t('folk.name.' + npc); who.style.cssText = 'display:block;color:#d9b26a;font-size:12px;letter-spacing:.06em;text-transform:uppercase';
    const kick = doc.createElement('span'); kick.textContent = title; kick.style.cssText = 'display:block;color:rgba(243,234,216,.6);font:italic 12px Georgia,serif';
    const names = doc.createElement('div'); names.append(who, kick);
    head.append(artBox(doc, portraitPath(npc), t('folk.name.' + npc), { size: 44, cls: 'ftf-art ftf-talk-portrait', radius: 22 }), names);
    panel.append(head);
    for (const k of tk.lines) { const p = doc.createElement('p'); p.textContent = t(k, tk.args || {}); p.style.margin = '0 0 8px'; panel.append(p); }
    const row = doc.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:4px';
    for (const c of tk.choices) {
      const b = doc.createElement('button'); b.type = 'button'; b.textContent = t(c.key); b.dataset.act = c.act;
      b.style.cssText = 'min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid rgba(243,234,216,.35);background:rgba(217,178,106,.14);color:inherit;font:600 14px system-ui;cursor:pointer';
      b.addEventListener('click', (e) => { e.stopPropagation(); act(npc, c.act); });
      row.append(b);
    }
    panel.append(row);
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    doc.body.append(panel);
    const first = row.querySelector('button'); if (first && first.focus) first.focus();
    sound('ui_click');
    if (npc === LOST.npc && state.lost.stage === 'done') chats++;
    return true;
  }
  function act(npc, a) {
    if (a === 'close') { close(); return; }
    if (npc === LOST.npc) {
      if (a === 'accept') applyLost({ type: 'ACCEPT' });
      else if (a === 'postcard') applyLost({ type: 'POSTCARD' });
      close(); return; // the walk talks in bubbles; the postcard opens its own card
    }
    if (a === 'accept') apply({ type: 'ACCEPT' });
    else if (a === 'ask') apply({ type: 'ASK_SWEEPER' });
    else if (a === 'jar') apply({ type: 'TAKE_JAR' });
    else if (a === 'return' || a === 'keep') apply({ type: 'CHOOSE', choice: a });
    open(npc, a === 'accept' ? { lines: ['tale.ink.bells'], args: { n: 0, count: INK.bells }, choices: [{ key: 'tale.bye', act: 'close' }] } : null) || close();
  }

  const onKill = (e) => { const d = (e && e.detail) || {}; if (d.type && inkOn()) apply({ type: 'KILL', mob: d.type }); };
  win.addEventListener('ftf:mob-killed', onKill);

  // ---- spots: a townsperson with something to say about a tale takes E first (their hire talk stays otherwise)
  const spots = [...INK_NPCS, LOST.npc].map((npc) => ({
    id: 'tale_' + npc, priority: true,
    near: (pos) => { if (!talkOf(npc)) return false; const p = folkAt(npc); return !!p && Math.hypot(p[0] - pos[0], p[2] - pos[2]) <= 2.4 && Math.abs(p[1] - pos[1]) < 2.5; },
    prompt: () => t('tale.prompt', { name: t('folk.name.' + npc) }),
    onInteract: () => open(npc),
    busy: () => panelNpc === npc,
  }));

  return {
    spots,
    get state() { return cleanTales(state); },
    markers: () => [
      ...(inkOn() ? inkMarkers(state, { level: level(), dark: dark() }) : []),
      ...(lostOn() && !leftThisSession && folk && folk.visitorShown && folk.visitorShown(LOST.npc) ? lostMarkers(state.lost) : []),
    ],
    /** Per frame: the walk's lines and the arrival at the gate; a panel closes when she walks away from the speaker. */
    update(pos) {
      if (state.lost.stage === 'escort' && escortT0 !== null) {
        const line = wayLine(now() - escortT0);
        if (line && line !== lastWay) { lastWay = line; say(LOST.npc, line); }
        const p = folkAt(LOST.npc);
        const atGate = folk && folk.walkDone ? folk.walkDone(LOST.npc) : true;
        if (atGate && p && pos && gate && Math.hypot(pos[0] - gate[0], pos[2] - gate[2]) <= LOST.gateRadius) applyLost({ type: 'ARRIVE' });
      }
      if (!panel || !panelNpc || !pos) return;
      const p = folkAt(panelNpc); if (!p || Math.hypot(p[0] - pos[0], p[2] - pos[2]) > 5) close();
    },
    open, close,
    dispose() { close(); win.removeEventListener('ftf:mob-killed', onKill); },
  };
}
