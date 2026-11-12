// The casting field outside the town walls (docs/town.md, "Outside the walls"): arm a cast, aim it on the ground
// with the mouse, click to throw it. Only beyond the walls (scenes/town-outside.js `onField`); inside the town the
// keys do nothing and an armed cast is put away. Visuals: scenes/town-casting-fx.js. The two casts are the first two
// slots of the skill bar: full-art buttons with the key on a dark plate.
//
//   Q / 1  Frost Lance (aim arrow)        V / 2  Storm Snare (targeting circle)
//   Left click or tap: cast. Esc, or the same key again: put it away. A touch tap on a button arms; the next tap
//   on the ground casts there.
import * as THREE from 'three';
import { rayCast, MASK_PLAYER } from '../physics/collision.js';
import { TOWN_ORIGIN } from './town-layout.js';
import { onField } from './town-outside.js';
import { CASTS, createCastEffects } from './town-casting-fx.js';
import { actionKey, onBindings, KEY_ACTIONS } from '../ui/keybinds.js';

/** Seconds Iris stays rooted after the release frame of a cast (the overshoot and the held key pose); then a step cancels the settle. */
export const CAST_ROOT_AFTER = 0.24;
export const CAST_KEYS = Object.freeze({ KeyQ: 'lance', Digit1: 'lance', KeyV: 'snare', Digit2: 'snare' });
const SLOTS = [['lance', 'Q'], ['snare', 'V']]; // the label follows the live binding (ui/keybinds.js)
/** UI-003 full-art icons (assets/ui/icons): the lance a burst of shards, the snare the targeting mark. */
const ICON_ART = Object.freeze({ lance: 'shard_burst', snare: 'mark' });

// Placeholder full-art icons (until the UI-003 skill icons land): a frost lance and a storm snare.
const ICONS = {
  lance: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="ftf-ic-l" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0b3a63"/><stop offset="1" stop-color="#4fc3ff"/></linearGradient></defs><rect width="64" height="64" fill="url(#ftf-ic-l)"/><path d="M12 52 L44 20 L50 14 L48 22 L16 54 Z" fill="#e8f7ff"/><path d="M44 20 L54 10 L50 22 Z" fill="#fff"/><path d="M20 40 l-6 -2 M26 34 l-6 -3 M32 28 l-5 -4" stroke="#bfeaff" stroke-width="2" stroke-linecap="round"/><circle cx="50" cy="14" r="6" fill="#fff" opacity=".35"/></svg>',
  snare: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="ftf-ic-s" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="#7a4dff"/><stop offset="1" stop-color="#1c0f45"/></radialGradient></defs><rect width="64" height="64" fill="url(#ftf-ic-s)"/><ellipse cx="32" cy="44" rx="20" ry="7" fill="none" stroke="#d6c4ff" stroke-width="3"/><path d="M34 8 L24 30 L32 30 L26 48 L42 24 L34 24 L40 8 Z" fill="#fff4b0" stroke="#ffe066" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};

const CSS = `
.ftf-cast { position: absolute; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; z-index: 5; }
.ftf-cast[hidden] { display: none; }
.ftf-cast-bar { display: flex; gap: 10px; padding: 6px; border-radius: 18px; background: rgba(12, 14, 20, 0.55); backdrop-filter: blur(6px); }
.ftf-cast-slot { pointer-events: auto; position: relative; overflow: hidden; width: 64px; height: 64px; padding: 0; border-radius: 14px; border: 2px solid rgba(255,255,255,0.25);
  background: #111; cursor: pointer; transition: transform .12s ease, border-color .12s ease; }
.ftf-cast-slot svg, .ftf-cast-slot img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ftf-cast-slot:hover { transform: translateY(-2px); }
.ftf-cast-slot:active { transform: scale(.95); }
.ftf-cast-slot kbd { position: absolute; left: 3px; bottom: 3px; min-width: 18px; padding: 1px 5px; border-radius: 5px; background: rgba(8, 10, 14, 0.82); color: #f3efe6; font: 700 12px/1.3 system-ui, sans-serif; text-align: center; }
.ftf-cast-slot .ftf-cast-name { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.ftf-cast-slot[aria-pressed="true"] { border-color: #ffe9b4; box-shadow: 0 0 14px rgba(255, 220, 140, 0.8); }
.ftf-cast-slot .ftf-cast-cd { position: absolute; left: 0; bottom: 0; height: 100%; background: rgba(0,0,0,0.55); pointer-events: none; }
.ftf-cast-hint { color: #f3efe6; font: 400 13px/1.3 inherit; text-shadow: 0 1px 3px rgba(0,0,0,0.7); }
.ftf-cast-hint[hidden] { display: none; }
@media (max-width: 700px) { .ftf-cast { bottom: calc(108px + env(safe-area-inset-bottom, 0px)); } .ftf-cast-slot { width: 56px; height: 56px; } }
@media (prefers-reduced-motion: reduce) { .ftf-cast-slot { transition: none; } .ftf-cast-slot:hover, .ftf-cast-slot:active { transform: none; } }
`;

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene @param {THREE.Camera} o.camera @param {object} o.town scenes/town.js handle
 * @param {object} o.player CharacterController @param {object} o.i18n @param {boolean} [o.coarse] touch device
 * @param {(id: string, shot: {from: number[], point: number[], dir: number[]}) => (number|void)} [o.onCastStart] the cast begins
 *   (her wind-up clip starts). It may return the seconds until the release frame of that clip: the cast's effect, `onCast`
 *   and `onFire` then wait for it, and she stands still until `CAST_ROOT_AFTER` s past it. Nothing returned: it leaves at once.
 * @param {(id: string, shot: {from: number[], point: number[], dir: number[]}) => void} [o.onCast] a cast left Iris's hands, on the release frame (the sound, the critters' hit test)
 * @param {() => (number[]|null)} [o.handPos] world position of her casting hand on the release frame (the snare's leash starts there)
 * @param {(c: {id: string, from: number[], dir: number[], point: number[]}) => void} [o.onFire] where it goes (play/mobs.js: the hits)
 * @param {Document} [o.doc]
 */
export function createTownCasting({ scene, camera, town, player, i18n, coarse = false, onCastStart = null, onCast = null, onFire = null, handPos = null, extra = [], base = (import.meta.env && import.meta.env.BASE_URL) || '/', doc = globalThis.document }) {
  const fx = createCastEffects(scene);
  if (!doc.getElementById('ftf-cast-style')) { const st = doc.createElement('style'); st.id = 'ftf-cast-style'; st.textContent = CSS; doc.head.append(st); }
  const root = doc.createElement('div'); root.className = 'ftf-cast'; root.hidden = true;
  const hint = doc.createElement('div'); hint.className = 'ftf-cast-hint'; hint.hidden = true; hint.setAttribute('role', 'status');
  const bar = doc.createElement('div'); bar.className = 'ftf-cast-bar';
  const slots = {};
  for (const [id, key] of SLOTS) {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'ftf-cast-slot'; b.dataset.id = id; b.setAttribute('aria-pressed', 'false');
    const cap = doc.createElement('kbd'); cap.textContent = key; cap.hidden = coarse;
    const art = doc.createElement('span'); art.innerHTML = ICONS[id];
    if (ICON_ART[id]) { art.innerHTML = ''; const img = doc.createElement('img'); img.src = base + 'assets/ui/icons/' + ICON_ART[id] + '.webp'; img.alt = ''; img.onerror = () => { art.innerHTML = ICONS[id]; }; art.append(img); } // UI-003 art, the SVG if it fails
    const name = doc.createElement('span'); name.className = 'ftf-cast-name'; const cd = doc.createElement('span'); cd.className = 'ftf-cast-cd';
    b.append(art.firstChild, cd, cap, name);
    b.addEventListener('click', (e) => { e.stopPropagation(); toggle(id); });
    slots[id] = { button: b, name, cd, cap };
    bar.append(b);
  }
  // extra slots after the casts (the strike and the dash of play/mobs.js): {id, key, icon, label, press(), cooldown() 0..1};
  // a slot with down() / up() is pressed and held (the strike: hold for the super strike) instead of clicked
  const extras = extra.map((x) => {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'ftf-cast-slot'; b.dataset.id = x.id;
    const img = doc.createElement('img'); img.src = base + 'assets/ui/icons/' + x.icon + '.webp'; img.alt = '';
    const cap = doc.createElement('kbd'); cap.textContent = x.key; cap.hidden = coarse;
    const cd = doc.createElement('span'); cd.className = 'ftf-cast-cd'; const name = doc.createElement('span'); name.className = 'ftf-cast-name';
    b.append(img, cd, cap, name);
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (x.down) { b.setPointerCapture?.(e.pointerId); x.down(); } });
    if (x.up) for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, (e) => { e.stopPropagation(); x.up(); });
    b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); if (!x.down) x.press(); });   // a slot with down/up is held, not clicked
    bar.append(b);
    return { ...x, button: b, cd, name, cap };
  });
  root.append(hint, bar);
  doc.body.append(root);

  const state = { field: false, armed: null, cooldown: { lance: 0, snare: 0 }, aim: null, casts: 0, pointer: null, t: 0, pending: null };
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();

  function renderText() {
    for (const [id] of SLOTS) { const key = actionKey(id), n = i18n.t('town.cast.' + id); slots[id].cap.textContent = key; slots[id].name.textContent = n; slots[id].button.title = coarse ? n : `${n} (${key})`; }
    for (const x of extras) { const key = KEY_ACTIONS.some((a) => a.id === x.id) ? actionKey(x.id) : x.key, n = i18n.t(x.label); x.cap.textContent = key; x.name.textContent = n; x.button.title = coarse ? n : `${n} (${key})`; }
    hint.textContent = i18n.t(coarse ? 'town.cast.hint.touch' : 'town.cast.hint');
  }
  const unsubscribe = typeof i18n.subscribe === 'function' ? i18n.subscribe(renderText) : null;
  const unbind = onBindings(renderText);
  renderText();

  /** Ground height under a world point near `nearY` (the hillside, the road), else `nearY`. */
  function groundY(x, z, nearY) {
    const hit = rayCast(town.world, [x, nearY + 8, z], [0, -1, 0], 30, MASK_PLAYER);
    return hit ? hit.point[1] : nearY;
  }

  /** The ground point under a screen position, or null (sky, too far). */
  function pick(sx, sy) {
    ndc.set((sx / globalThis.innerWidth) * 2 - 1, -(sy / globalThis.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    const hit = rayCast(town.world, [o.x, o.y, o.z], [d.x, d.y, d.z], 300, MASK_PLAYER);
    return hit ? hit.point : null;
  }

  function setArmed(id) {
    state.armed = id;
    for (const [s] of SLOTS) slots[s].button.setAttribute('aria-pressed', String(s === id));
    hint.hidden = !id;
    if (!id) fx.aim.hide();
  }
  function toggle(id) {
    if (!state.field) return;
    setArmed(state.armed === id ? null : id);
  }

  function release(point) {
    const id = state.armed, cast = CASTS[id];
    if (!id || state.cooldown[id] > 0 || state.pending) return false;
    const from = player.pos;
    const target = point || (state.aim && state.aim.point);
    if (!target) return false;
    const dx = target[0] - from[0], dz = target[2] - from[2], d = Math.hypot(dx, dz);
    if (d < Math.max(cast.minRange, 0.3)) return false;
    const aim = fx.aim.show(cast, from, target, state.t, groundY);
    player.heading = Math.atan2(aim.dir[0], aim.dir[1]); player.prevHeading = player.heading; // she turns to the cast
    state.cooldown[id] = cast.cooldown; state.casts++;
    setArmed(null);
    const shot = { from: [from[0], from[1], from[2]], point: aim.point.slice(), dir: aim.dir.slice() };
    const wait = onCastStart ? Number(onCastStart(id, shot)) || 0 : 0;      // her wind-up: the cast leaves on its release frame
    doc.defaultView && doc.defaultView.dispatchEvent && doc.defaultView.dispatchEvent(new CustomEvent('ftf:cast', { detail: { id, phase: 'start', release: wait } }));
    state.pending = { id, shot, t: 0, at: wait, fired: false };
    if (wait <= 0) fire(state.pending);
    return true;
  }

  /** The release frame: the effect, the sound and the hits. */
  function fire(p) {
    p.fired = true;
    const { id, shot } = p, from = player.pos;
    const hand = (handPos && handPos()) || [from[0] + shot.dir[0] * 0.35, from[1] + 1.35, from[2] + shot.dir[1] * 0.35];
    fx.fire(id, { from: [from[0], from[1], from[2]], hand, dir: shot.dir, point: shot.point, groundY });
    doc.defaultView && doc.defaultView.dispatchEvent && doc.defaultView.dispatchEvent(new CustomEvent('ftf:cast', { detail: { id, phase: 'release', release: 0 } }));
    if (onCast) onCast(id, shot); // the critters take the hit (scenes/town-monsters.js)
    if (onFire) onFire({ id, from: shot.from.slice(), dir: shot.dir.slice(), point: shot.point.slice() });
  }

  return {
    fx, elements: { root, bar, hint },
    get field() { return state.field; }, cooldownOf: (id) => (CASTS[id] ? Math.max(0, Math.min(1, state.cooldown[id] / CASTS[id].cooldown)) : 0), get armed() { return state.armed; }, get casts() { return state.casts; },
    get busy() { return fx.busy; },
    /** True from the click to shortly after the release frame: she winds up and lets go standing still (the caller holds her walk). */
    get casting() { return !!state.pending; },
    /** The cast in progress: {id, t, at (seconds to the release frame), fired}, or null. */
    get pending() { return state.pending; },

    /** A world key (KeyQ, KeyV, Digit1, Digit2, Escape). Returns true when the field used it. */
    handleKey(code) {
      if (code === 'Escape') { if (state.armed) { setArmed(null); return true; } return false; }
      const id = CAST_KEYS[code];
      if (!id || !state.field) return false;
      toggle(id);
      return true;
    },

    /** A click or tap on the canvas. Returns true when it cast (so it does not also walk there). */
    click(sx, sy) {
      if (!state.armed) return false;
      const p = pick(sx, sy);
      if (!p) return true; // armed: a click into the sky is swallowed, not a walk order
      release(p);
      return true;
    },

    /** Where the mouse is over the canvas (null: no hover, e.g. touch). */
    setPointer(x, y) { state.pointer = x == null ? null : [x, y]; },

    /** QA and the capture script: arm `id` and aim at a world point. */
    aimAt(id, point) { if (!state.field) return false; setArmed(id); state.aim = { point: point.slice() }; state.fixedAim = point.slice(); return true; },
    /** QA: cast what is armed at the current aim. */
    release: () => release(state.fixedAim || null),

    update(dt, t, reducedMotion, visible = true) {
      state.t = t;
      if (state.pending) {
        const p = state.pending; p.t += dt;
        if (!p.fired && p.t >= p.at) fire(p);
        if (p.fired && p.t >= p.at + (p.at > 0 ? CAST_ROOT_AFTER : 0)) state.pending = null;
      }
      const lx = player.pos[0] - TOWN_ORIGIN[0], lz = player.pos[2] - TOWN_ORIGIN[2];
      const field = visible && onField(lx, lz);
      if (field !== state.field) { state.field = field; root.hidden = !field; if (!field) setArmed(null); }
      for (const id in state.cooldown) {
        state.cooldown[id] = Math.max(0, state.cooldown[id] - dt);
        slots[id].cd.style.width = (100 * state.cooldown[id] / CASTS[id].cooldown).toFixed(1) + '%';
      }
      for (const x of extras) { const k = x.cooldown ? Math.max(0, Math.min(1, x.cooldown())) : 0; x.cd.style.width = (100 * k).toFixed(1) + '%'; x.button.hidden = x.available ? !x.available() : false; }
      if (state.armed) {
        const target = state.fixedAim || (state.pointer && pick(state.pointer[0], state.pointer[1]));
        if (target) state.aim = fx.aim.show(CASTS[state.armed], player.pos, target, t, groundY);
        else { // no pointer (touch): aim straight ahead until the tap
          const h = player.heading, f = [player.pos[0] + Math.sin(h) * 8, player.pos[1], player.pos[2] + Math.cos(h) * 8];
          state.aim = fx.aim.show(CASTS[state.armed], player.pos, f, t, groundY);
        }
      } else state.fixedAim = null;
      fx.update(dt, t, camera, reducedMotion);
    },

    setVisible(on) { if (!on) { setArmed(null); root.hidden = true; state.field = false; } },

    dispose() { if (unsubscribe) unsubscribe(); fx.dispose(); root.remove(); },
  };
}
