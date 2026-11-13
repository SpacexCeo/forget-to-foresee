// Twin-stick touch controls (owner brief 12.11, phone first). LEFT: a floating joystick that appears where the thumb
// lands in the lower-left zone; analog walk, run when pushed far (input.stickMove / input.stickRun, ui/input.js).
// RIGHT: the rest of the screen still orbits the camera with a drag (ui/input.js single-touch drag) and pinches zoom.
// Bottom right: a mobile-MOBA arc around the main ATTACK (strike) button: Frost Lance, Storm Snare, Dash, with cooldown
// sweeps; the two casts aim by dragging (a ground indicator through scenes/town-casting.js aimAt) and cast on release; a
// tap casts at the nearest monster in range, else straight ahead. An interact button appears above the arc when the
// town offers an action. "Tap to move" (the old touch scheme) stays available from Controls; the choice is stored.
// Skill logic and cooldowns belong to play/mobs.js and scenes/town-casting.js: this file only calls their APIs.

export const MODE_KEY = 'ftf.touch.mode.v1';
export const MODES = Object.freeze(['sticks', 'tap']);
const RADIUS = 56; // px of thumb travel for a full push
const RUN_AT = 0.86;

const CSS = `
.ts { position: fixed; inset: 0; pointer-events: none; z-index: 3; /* under every HUD button: the stick zone never covers one */ font: 600 13px/1 system-ui, sans-serif; color: #f1ead8; -webkit-user-select: none; user-select: none; }
.ts[hidden] { display: none; }
.ts-zone { position: absolute; left: 0; bottom: 0; width: 46vw; height: 46vh; pointer-events: auto; touch-action: none; }
.ts-base { position: absolute; width: 124px; height: 124px; margin: -62px 0 0 -62px; border-radius: 50%; background: radial-gradient(rgba(12, 20, 17, .35), rgba(12, 20, 17, .6)); border: 2px solid rgba(201, 163, 90, .55); opacity: .55; transition: opacity .15s; }
.ts-base.ts-live { opacity: 1; }
.ts-knob { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #f1d999, #b98a3c); box-shadow: 0 4px 14px rgba(0, 0, 0, .45); }
.ts-base.ts-run .ts-knob { box-shadow: 0 0 0 4px rgba(155, 227, 169, .55), 0 4px 14px rgba(0, 0, 0, .45); }
.ts-arc { position: absolute; right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(18px + env(safe-area-inset-bottom, 0px)); width: 180px; height: 180px; }
.ts-btn { position: absolute; width: 58px; height: 58px; border-radius: 50%; padding: 0; border: 2px solid rgba(201, 163, 90, .7); background: rgba(12, 20, 17, .78) center / 76% no-repeat;
  box-shadow: 0 6px 16px rgba(0, 0, 0, .4); pointer-events: auto; touch-action: none; overflow: hidden; color: inherit; font: inherit; }
.ts-btn[hidden] { display: none; }
.ts-btn.ts-main { width: 76px; height: 76px; right: 0; bottom: 0; border-width: 3px; }
.ts-btn.ts-down { transform: scale(.93); border-color: #f3d7a0; }
.ts-charge { position: absolute; inset: -6px; border-radius: 50%; pointer-events: none; opacity: 0; background: conic-gradient(#ffd27a calc(var(--ch, 0) * 1turn), transparent 0); -webkit-mask: radial-gradient(circle, transparent 62%, #000 64%); mask: radial-gradient(circle, transparent 62%, #000 64%); }
.ts-btn.ts-charging .ts-charge { opacity: 1; }
.ts-btn.ts-charged { box-shadow: 0 0 18px #ffd27a, 0 6px 16px rgba(0, 0, 0, .4); }
.ts-btn.ts-main { overflow: visible; }
.ts-cd { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(rgba(0, 0, 0, .62) calc(var(--cd, 0) * 1turn), transparent 0); pointer-events: none; }
.ts-btn.ts-use { right: 6px; bottom: 182px; width: auto; min-width: 72px; height: 48px; padding: 0 18px; border-radius: 999px; border-width: 1px; border-color: rgba(255, 255, 255, .35); background: rgba(10, 14, 14, .55); color: #fff; font: 500 15px/1 var(--font-ui, "Atkinson Hyperlegible"), system-ui, sans-serif; text-shadow: 0 1px 2px rgba(0, 0, 0, .6); box-shadow: 0 2px 8px rgba(0, 0, 0, .3); }   /* the quiet pill (owner 13.11) */
.ts-btn.ts-use:not([hidden]) { animation: ts-pop .25s ease-out; }
@keyframes ts-pop { from { transform: scale(.6); opacity: 0; } to { transform: none; opacity: 1; } }
.ts-cancel { position: absolute; right: 230px; bottom: 120px; padding: 10px 14px; border-radius: 20px; background: rgba(160, 50, 40, .82); pointer-events: none; }
.ts-cancel[hidden] { display: none; }
/* iOS Safari: no long-press callout, text selection or page zoom may steal a finger while the stick is held */
body.ts-touch, body.ts-touch canvas { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
body.ts-touch canvas { touch-action: none; }
/* phones: the archipelago's action list as a compact sheet (player report 12.11): right side above the bottom nav, never
   over the stick, no keyboard numbers, a close button, collapsed while walking */
body.ts-touch .pl-context { left: auto !important; right: calc(8px + env(safe-area-inset-right, 0px)) !important; width: min(300px, 64vw) !important; bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important;
  max-height: 38vh; overflow-y: auto; transform: none !important; padding: 8px 10px !important; border-radius: 16px !important; }
body.ts-touch .pl-context h3 { padding-right: 40px; font-size: 14px !important; margin: 2px 0 6px !important; }
body.ts-touch .pl-context .pl-opt { min-height: 40px; padding: 6px 10px !important; font-size: 14px !important; }
body.ts-touch .pl-context kbd, body.ts-touch .hub-host kbd { display: none !important; }
/* inside a Shell on a phone: the reading panel on the right, scrollable, the left side free for the stick */
body.ts-on .hub-dock { left: auto !important; right: calc(8px + env(safe-area-inset-right, 0px)) !important; width: min(340px, 66vw) !important; max-height: 46vh; overflow-y: auto; padding: 12px !important; }
body.ts-touch .pl-context.ts-dismissed, body.ts-moving .pl-context { max-height: 48px; overflow: hidden; opacity: .8; }
body.ts-touch .pl-context.ts-dismissed h3::after { content: " ▴"; color: #d8b46a; }
body.ts-touch .pl-context.ts-dismissed .ts-ctx-x { display: none; }
.ts-ctx-x { position: absolute; top: 4px; right: 4px; width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(201, 163, 90, .6); background: rgba(12, 20, 17, .9); color: #f3d7a0; font: 700 18px/1 system-ui, sans-serif; padding: 0; z-index: 1; }
/* every tip, toast and card stays inside the screen on phones (owner 12.11: a tip was cut at the right edge) */
body.ts-touch .d1-hint, body.ts-touch .d1-card, body.ts-touch .d1-panel, body.ts-touch .ph-toast, body.ts-touch .ftf-premise, body.ts-touch .ftf-quest-talk, body.ts-touch .ftf-town-objective, body.ts-touch .ftf-altar-timer {
  max-width: calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)) !important; box-sizing: border-box; overflow-wrap: anywhere; }
body.ts-touch #toast { max-width: calc(100vw - 24px); box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; text-align: center; }
body.ts-on .ftf-cast-bar, body.ts-on .ftf-run-toggle, body.ts-touch .ftf-scene-hint { display: none !important; }
body.ts-on .d1-hint { bottom: calc(236px + env(safe-area-inset-bottom, 0px)); }
body.ts-on .ftf-town-prompt { bottom: calc(272px + env(safe-area-inset-bottom, 0px)); font-size: 14px !important; padding: 6px 14px !important; min-height: 36px; max-width: 60vw; } /* the Use button acts; the pill only names it */
body.ts-on .ftf-photo-open { top: 40% !important; }
@media (orientation: landscape) and (max-height: 500px) { .ts-arc { transform: scale(.86); transform-origin: 100% 100%; } .ts-btn.ts-use { bottom: 168px; } }
@media (prefers-reduced-motion: reduce) { .ts-btn.ts-use:not([hidden]) { animation: none; } .ts-base { transition: none; } }
`;

/** The stored mode ('sticks' by default on touch). */
export function loadMode(storage) {
  try { const v = storage && storage.getItem(MODE_KEY); return MODES.includes(v) ? v : 'sticks'; } catch { return 'sticks'; }
}
export function saveMode(storage, mode) { try { if (storage && MODES.includes(mode)) storage.setItem(MODE_KEY, mode); } catch { /* not kept */ } }

/** Pure: thumb offset (px, screen y down) → {move: [right, forward], run} with a dead zone and a unit cap. */
export function stickVector(dx, dy, radius = RADIUS) {
  const len = Math.hypot(dx, dy);
  if (len < radius * 0.12) return { move: [0, 0], run: false, k: 0 };
  const k = Math.min(1, len / radius);
  return { move: [(dx / len) * k, (-dy / len) * k], run: k >= RUN_AT, k };
}

/** Pure: a screen drag (px) → a ground point for a cast, camera-relative; `fwd` is the camera's ground forward [x, z]. */
export function aimPoint(from, fwd, dx, dy, range, full = 90) {
  const l = Math.hypot(fwd[0], fwd[1]) || 1, fx = fwd[0] / l, fz = fwd[1] / l;
  const rx = -fz, rz = fx; // screen right on the ground
  const wx = rx * dx + fx * -dy, wz = rz * dx + fz * -dy, wl = Math.hypot(wx, wz);
  if (!wl) return null;
  const d = Math.max(1.5, Math.min(range, (Math.min(wl, full) / full) * range));
  return [from[0] + (wx / wl) * d, from[1], from[2] + (wz / wl) * d];
}

/** Pure: the nearest live monster within `range` of `pos`, else a point `ahead` metres along `heading`. */
export function quickTarget(pos, heading, mobs, range, ahead = 8) {
  let best = null, bd = Infinity;
  for (const m of mobs || []) {
    if (!m || m.state === 'dead' || m.state === 'gone') continue;
    const d = Math.hypot(m.pos[0] - pos[0], m.pos[2] - pos[2]);
    if (d <= range && d < bd) { bd = d; best = m; }
  }
  if (best) return [best.pos[0], best.pos[1], best.pos[2]];
  return [pos[0] + Math.sin(heading) * ahead, pos[1], pos[2] + Math.cos(heading) * ahead];
}

/**
 * @param {{doc?: Document, input: object, t: Function, base?: string, storage?: object, camForward?: () => number[], player: object,
 *   casting: () => object|null, mobs: () => object|null, flow: () => object|null, wish: () => number[], ranges?: object}} o
 */
export function createTouchControls({ doc = document, input, t, base = '/', storage = null, camForward = null, player, casting, mobs, flow, attack = null, wish = () => [0, 0], ranges = { lance: 13, snare: 14 } }) {
  if (!(doc.getElementById && doc.getElementById('ts-style'))) { const st = doc.createElement('style'); st.id = 'ts-style'; st.textContent = CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('div', 'ts'); root.hidden = true;
  let mode = loadMode(storage);

  // ---- left stick ----
  const zone = el('div', 'ts-zone'); const baseEl = el('div', 'ts-base'); const knob = el('i', 'ts-knob'); baseEl.append(knob); zone.append(baseEl);
  const rest = () => { const r = zone.getBoundingClientRect ? zone.getBoundingClientRect() : { width: 300, height: 300 }; baseEl.style.left = '96px'; baseEl.style.top = Math.max(80, (r.height || 300) - 110) + 'px'; };
  let stick = null;
  const setStick = (dx, dy) => {
    const v = stickVector(dx, dy);
    input.stickMove = v.k ? v.move : null; input.stickRun = v.run;
    const k = Math.min(1, Math.hypot(dx, dy) / RADIUS) || 0, a = Math.atan2(dy, dx);
    knob.style.transform = k ? `translate(${(Math.cos(a) * k * RADIUS).toFixed(1)}px, ${(Math.sin(a) * k * RADIUS).toFixed(1)}px)` : '';
    baseEl.classList.toggle('ts-run', v.run);
  };
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (stick) return;
    const r = zone.getBoundingClientRect();
    stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
    baseEl.style.left = (e.clientX - r.left) + 'px'; baseEl.style.top = (e.clientY - r.top) + 'px'; baseEl.classList.add('ts-live');
    if (zone.setPointerCapture) try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  });
  zone.addEventListener('pointermove', (e) => { if (stick && e.pointerId === stick.id) setStick(e.clientX - stick.x, e.clientY - stick.y); });
  const endStick = (e) => { if (!stick || (e && e.pointerId !== stick.id)) return; stick = null; setStick(0, 0); baseEl.classList.remove('ts-live'); rest(); };
  zone.addEventListener('pointerup', endStick); zone.addEventListener('pointercancel', endStick);

  // ---- right arc ----
  const arc = el('div', 'ts-arc');
  const icon = (name) => `url("${base}assets/ui/icons/${name}.webp")`;
  const mk = (id, cls, art, label, pos) => {
    const b = el('button', 'ts-btn ' + cls); b.type = 'button'; b.dataset.skill = id; b.setAttribute('aria-label', label);
    if (art) b.style.backgroundImage = icon(art);
    if (pos) { b.style.right = pos[0] + 'px'; b.style.bottom = pos[1] + 'px'; }
    const cd = el('i', 'ts-cd'); b.append(cd); b.cd = cd; arc.append(b); return b;
  };
  // the arc: 98 px from the main button's centre, from straight up to straight left
  const P = (deg) => { const r = 82, a = deg * Math.PI / 180; return [Math.round(38 - Math.cos(a) * r - 29), Math.round(38 + Math.sin(a) * r - 29)]; };
  const strike = mk('strike', 'ts-main', 'strike', t('town.cast.strike'));
  const lance = mk('lance', '', 'shard_burst', t('town.cast.lance'), P(90));
  const snare = mk('snare', '', 'mark', t('town.cast.snare'), P(135));
  const dash = mk('dash', '', 'dash', t('town.cast.dash'), P(180));
  const use = mk('use', 'ts-use', null, t('touch.use')); use.prepend(doc.createTextNode(t('touch.use')));
  const cancel = el('div', 'ts-cancel', t('touch.cancel')); cancel.hidden = true; arc.append(cancel);
  root.append(zone, arc); doc.body.append(root);

  const press = (b) => { b.classList.add('ts-down'); setTimeout(() => b.classList.remove('ts-down'), 140); };
  for (const b of [strike, dash, use]) b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
  // hold to charge the super strike (boot-world attackPress: down on press, up on release); the ring shows the charge
  const ring = el('i', 'ts-charge'); strike.append(ring);
  let held = null;
  strike.addEventListener('pointerdown', (e) => { if (held != null) return; held = e.pointerId; if (strike.setPointerCapture) try { strike.setPointerCapture(e.pointerId); } catch { /* synthetic */ } if (attack) attack(true); else { const m = mobs(); if (m) m.strike(); } strike.classList.add('ts-down'); });
  const letGo = (e) => { if (held == null || (e && e.pointerId !== held)) return; held = null; strike.classList.remove('ts-down'); if (attack) attack(false); };
  strike.addEventListener('pointerup', letGo); strike.addEventListener('pointercancel', letGo); strike.addEventListener('lostpointercapture', letGo);
  dash.addEventListener('pointerup', () => { const m = mobs(); if (m) { m.dash(wish()); press(dash); } });
  use.addEventListener('pointerup', () => { const f = flow(); if (f && f.interact) { f.interact(); press(use); } });

  // drag-to-aim casts
  const camFwd = () => (camForward ? camForward() : [Math.sin(player.heading), Math.cos(player.heading)]);
  let aim = null;
  for (const [b, id] of [[lance, 'lance'], [snare, 'snare']]) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const c = casting(); if (!c || !c.field) return;
      aim = { id, b, pid: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      if (b.setPointerCapture) try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      b.classList.add('ts-down');
    });
    b.addEventListener('pointermove', (e) => {
      if (!aim || aim.pid !== e.pointerId) return;
      const dx = e.clientX - aim.x, dy = e.clientY - aim.y;
      if (!aim.moved && Math.hypot(dx, dy) < 12) return;
      aim.moved = true;
      const c = casting(); const p = aimPoint(player.pos, camFwd(), dx, dy, ranges[id]);
      if (c && p) c.aimAt(id, p);
      cancel.hidden = false;
    });
    const end = (e, cancelled) => {
      if (!aim || aim.pid !== e.pointerId) return;
      const a = aim; aim = null; a.b.classList.remove('ts-down'); cancel.hidden = true;
      const c = casting(); if (!c) return;
      if (cancelled || overCancel(e)) { c.handleKey('Escape'); return; }
      if (!a.moved) { const m = mobs(); c.aimAt(a.id, quickTarget(player.pos, player.heading, m && m.brain ? m.brain.mobs : [], ranges[a.id])); }
      c.release();
    };
    b.addEventListener('pointerup', (e) => end(e, false));
    b.addEventListener('pointercancel', (e) => end(e, true));
  }
  // dragging back over the left part of the screen cancels the cast (the red pill shows where)
  const overCancel = (e) => e.clientX < (globalThis.innerWidth || 800) * 0.42;

  // Multi-touch on iOS Safari: page gestures (pinch zoom, double-tap zoom) would cancel the stick or the camera finger,
  // so they are refused on the game's own surfaces; nothing is prevented document-wide for ordinary touches.
  const noGesture = (e) => { if (doc.body.classList.contains('ts-touch')) e.preventDefault(); };
  for (const ev of ['gesturestart', 'gesturechange']) doc.addEventListener(ev, noGesture, { passive: false });
  for (const n of [zone, arc]) n.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  // the action list sheet (play/ui.js #pl-context): a close button or a tap outside folds it to its title until the spot
  // changes (a tap on the title unfolds it), and it folds while the stick moves
  let ctxTitle = '', dismissed = false;
  const sheet = () => {
    const c = doc.getElementById && doc.getElementById('pl-context');
    doc.body.classList.toggle('ts-moving', !!(input.stickMove && (input.stickMove[0] || input.stickMove[1])));
    if (!c) return;
    const h = c.querySelector('h3'), title = h ? h.textContent : '';
    if (title !== ctxTitle) { ctxTitle = title; dismissed = false; }
    c.classList.toggle('ts-dismissed', dismissed);
    if (!c.hidden && !c.querySelector('.ts-ctx-x')) {
      const x = el('button', 'ts-ctx-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', t('quest.close'));
      x.addEventListener('pointerdown', (e) => e.stopPropagation());
      x.addEventListener('click', (e) => { e.stopPropagation(); dismissed = true; c.classList.add('ts-dismissed'); });
      c.append(x);
      // the folded sheet keeps its title: a tap on it unfolds the actions again
      c.addEventListener('click', (e) => { if (dismissed && e.target && e.target.tagName === 'H3') { dismissed = false; c.classList.remove('ts-dismissed'); } });
    }
  };
  doc.addEventListener('pointerdown', (e) => {
    const c = doc.getElementById && doc.getElementById('pl-context');
    if (!touch || !c || c.hidden || dismissed) return;
    if (e.target && e.target.tagName === 'CANVAS') { dismissed = true; c.classList.add('ts-dismissed'); }
  }, true);
  rest();
  let visible = false, touch = false;
  return {
    root,
    get mode() { return mode; },
    setMode(m) { if (!MODES.includes(m)) return; mode = m; saveMode(storage, m); },
    /** Per frame. `active`: the world takes input (no menu over it). */
    update({ active = true } = {}) {
      touch = !!input.touchControls;
      doc.body.classList.toggle('ts-touch', touch);
      if (touch) sheet();
      const v = touch && mode === 'sticks' && active;
      if (v !== visible) { visible = v; root.hidden = !v; doc.body.classList.toggle('ts-on', v); if (!v) endStick(); }
      if (!v) return;
      const c = casting(), m = mobs(), f = flow();
      const field = !!(c && c.field);
      strike.hidden = dash.hidden = !(m && field); lance.hidden = snare.hidden = !field;
      { const ch = m && m.charging != null ? Math.min(1, m.charging / 0.4) : 0; strike.classList.toggle('ts-charging', ch > 0); strike.classList.toggle('ts-charged', ch >= 1); ring.style.setProperty('--ch', ch.toFixed(3)); }
      if (m && m.actions) { strike.cd.style.setProperty('--cd', String(Math.max(0, Math.min(1, m.actions.strikeCd / 0.32)))); dash.cd.style.setProperty('--cd', String(Math.max(0, Math.min(1, m.actions.dashCd / 1.0)))); }
      if (c && c.cooldownOf) { lance.cd.style.setProperty('--cd', String(c.cooldownOf('lance'))); snare.cd.style.setProperty('--cd', String(c.cooldownOf('snare'))); }
      use.hidden = !(f && f.promptVisible);
    },
    dispose() { root.remove(); doc.body.classList.remove('ts-on', 'ts-touch'); input.stickMove = null; input.stickRun = false; },
  };
}
