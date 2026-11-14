// Town tales in the town (game/tales.js has the rules): the talk spots on the townsfolk the tales use, the talk panel
// (the same look as the quest givers' panel in scenes/town-quests.js), the marks over heads, toasts for progress,
// the rewards (town XP and a chest) and the sounds. Kills arrive as window 'ftf:mob-killed' (play/mobs.js).
import { artBox } from '../market/art.js';
import { portraitPath } from '../quests/portraits.js';
import { TALES_KEY, INK, cleanTales, inkDo, inkTalk, inkMarkers } from '../game/tales.js';

const TALK_NPCS = Object.freeze(['scribe', 'sweeper']);

/**
 * @param {object} o
 * @param {(k: string, a?: object) => string} o.t @param {object} o.storage @param {object} o.ledger game/town-economy.js
 * @param {object} [o.chests] game/chests.js @param {(key: string) => number[]|null} o.folkAt
 * @param {() => boolean} [o.dark] after dark (render/daycycle.js via boot-world) @param {(s: string) => void} [o.toast]
 * @param {(name: string) => void} [o.sound] a town cue (audio/town-audio.js)
 */
export function createTownTales({ t, storage, ledger, chests = null, folkAt, dark = () => true, toast = () => {}, sound = () => {}, doc = globalThis.document, win = globalThis }) {
  let state = (() => { try { return cleanTales(JSON.parse((storage && storage.getItem(TALES_KEY)) || 'null')); } catch { return cleanTales(null); } })();
  const save = () => { try { if (storage) storage.setItem(TALES_KEY, JSON.stringify(state)); } catch { /* private mode */ } };
  const level = () => (ledger && ledger.level ? ledger.level.level : 1);

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

  // ---- the talk panel
  let panel = null, panelNpc = null;
  function close() { if (panel) { panel.remove(); panel = null; panelNpc = null; } }
  function open(npc, override = null) {
    const tk = override || inkTalk(state, npc, { level: level(), dark: dark() });
    if (!tk) return false;
    close(); panelNpc = npc;
    panel = doc.createElement('div'); panel.className = 'ftf-story-talk ftf-tale-talk'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', t('tale.ink.title'));
    panel.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);transform:translateX(-50%);z-index:30;width:min(460px,calc(100vw - 32px));box-sizing:border-box;'
      + 'padding:14px 16px;border-radius:14px;background:rgba(12,16,18,.92);border:1px solid rgba(217,178,106,.45);color:#f3ead8;font:15px/1.45 system-ui,sans-serif';
    const head = doc.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:6px';
    const who = doc.createElement('b'); who.textContent = t('folk.name.' + npc); who.style.cssText = 'display:block;color:#d9b26a;font-size:12px;letter-spacing:.06em;text-transform:uppercase';
    const kick = doc.createElement('span'); kick.textContent = t('tale.ink.title'); kick.style.cssText = 'display:block;color:rgba(243,234,216,.6);font:italic 12px Georgia,serif';
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
    return true;
  }
  function act(npc, a) {
    if (a === 'close') { close(); return; }
    if (a === 'accept') apply({ type: 'ACCEPT' });
    else if (a === 'ask') apply({ type: 'ASK_SWEEPER' });
    else if (a === 'jar') apply({ type: 'TAKE_JAR' });
    else if (a === 'return' || a === 'keep') apply({ type: 'CHOOSE', choice: a });
    open(npc, a === 'accept' ? { lines: ['tale.ink.bells'], args: { n: 0, count: INK.bells }, choices: [{ key: 'tale.bye', act: 'close' }] } : null) || close();
  }

  const onKill = (e) => { const d = (e && e.detail) || {}; if (d.type) apply({ type: 'KILL', mob: d.type }); };
  win.addEventListener('ftf:mob-killed', onKill);

  // ---- spots: a townsperson with something to say about the tale takes E first (their hire talk stays otherwise)
  const spots = TALK_NPCS.map((npc) => ({
    id: 'tale_' + npc, priority: true,
    near: (pos) => { if (!inkTalk(state, npc, { level: level(), dark: dark() })) return false; const p = folkAt(npc); return !!p && Math.hypot(p[0] - pos[0], p[2] - pos[2]) <= 2.4 && Math.abs(p[1] - pos[1]) < 2.5; },
    prompt: () => t('tale.prompt', { name: t('folk.name.' + npc) }),
    onInteract: () => open(npc),
    busy: () => panelNpc === npc,
  }));

  return {
    spots,
    get state() { return cleanTales(state); },
    markers: () => inkMarkers(state, { level: level(), dark: dark() }),
    /** Per frame: the panel closes when she walks away from the one she talks to. */
    update(pos) { if (!panel || !panelNpc || !pos) return; const p = folkAt(panelNpc); if (!p || Math.hypot(p[0] - pos[0], p[2] - pos[2]) > 5) close(); },
    open, close,
    dispose() { close(); win.removeEventListener('ftf:mob-killed', onKill); },
  };
}
