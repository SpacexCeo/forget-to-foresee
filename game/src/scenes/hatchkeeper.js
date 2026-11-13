// The Hatchkeeper (owner 13.11): the pet seller by the lower-lane stalls, not open yet. One townsfolk body with the
// shared idle/talk clips, a nameplate "Hatchkeeper · Companions", and the three companion dragons (Nacre, Rill,
// Cinder) on slow, offset loops around them, 1.5 to 2.5 m out and up. E (or a tap on the prompt) opens a talk panel
// with the riddle and the status "Not available yet": there is no buy action. The dragons use the companions' own
// files (dragon_<kind>[_m].glb) through the same loader, so improved clips arrive by themselves; phones load the
// light files, reduced motion slows the loops, and everything far from Iris is hidden and not animated.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { fetchGltfUrl } from '../render/assets.js';
import { townsfolkClips, mergeClips } from '../play/anim-library.js';
import { townToWorld } from './town-layout.js';

import { HATCHKEEPER, DRAGON_LOOPS, HATCH_LINES, dragonOrbit } from './hatchkeeper-rules.js';
export { HATCHKEEPER, DRAGON_LOOPS, HATCH_LINES, dragonOrbit };

/** A canvas nameplate sprite (null without a canvas, e.g. in tests). */
function nameplate(text) {
  const doc = globalThis.document; if (!doc || !doc.createElement) return null;
  const c = doc.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext && c.getContext('2d'); if (!g) return null;
  g.fillStyle = 'rgba(14,16,24,0.78)'; g.strokeStyle = 'rgba(246,200,96,0.9)'; g.lineWidth = 4;
  if (g.roundRect) { g.beginPath(); g.roundRect(4, 4, 504, 88, 20); g.fill(); g.stroke(); } else { g.fillRect(4, 4, 504, 88); g.strokeRect(4, 4, 504, 88); }
  g.fillStyle = '#f6c860'; g.font = '600 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.scale.set(2.2, 0.41, 1); s.name = 'hatchkeeper_sign';
  return s;
}

/**
 * @param {{scene: THREE.Scene, t: (k: string) => string, groundAt?: (x: number, z: number) => (number|null), mobile?: boolean,
 *   reduced?: () => boolean, doc?: Document, win?: Window, base?: string, coarse?: boolean}} o
 */
export function createHatchkeeper({ pet = null, scene, t, groundAt = null, mobile = false, reduced = () => false, doc = globalThis.document, win = globalThis.window, base = (import.meta.env && import.meta.env.BASE_URL) || '/' }) {
  const at = townToWorld(HATCHKEEPER.pos);
  const root = new THREE.Group(); root.name = 'hatchkeeper'; root.position.set(at[0], at[1], at[2]); root.rotation.y = HATCHKEEPER.heading; scene.add(root);
  const sign = nameplate(t('hatch.sign')); if (sign) { sign.position.set(0, 2.35, 0); root.add(sign); }
  let grounded = false, mixer = null, acts = {}, playing = null, clock = 0, panel = null, onDocDown = null, onKey = null;
  const play = (name) => { const a = acts[name] || acts.idle; if (!a || a === playing) return; if (playing) playing.fadeOut(0.3); a.reset().fadeIn(0.3).play(); playing = a; };
  fetchGltfUrl(base + 'assets/models/' + HATCHKEEPER.model + (mobile ? '_m' : '') + '.glb').then(async (g) => {
    const m = cloneSkinned(g.scene);
    const extra = await townsfolkClips(m, { key: 'hatchkeeper:' + (mobile ? 'm' : 'f'), body: 'adult' }).catch(() => []);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    root.add(m);
    mixer = new THREE.AnimationMixer(m);
    for (const c of mergeClips(g.animations || [], extra || [])) acts[c.name] = mixer.clipAction(c);
    if (!acts.talk) acts.talk = acts.gesture_offer || acts.idle;
    play(panel ? 'talk' : 'idle');
  }).catch((e) => console.warn('[hatchkeeper]', e));

  // the three dragons: a ring group at the Hatchkeeper's feet (not rotated with them)
  const ring = new THREE.Group(); ring.name = 'hatchkeeper_dragons'; ring.position.copy(root.position); scene.add(ring);
  const dragons = DRAGON_LOOPS.map((L) => {
    const d = { group: new THREE.Group(), mixer: null };
    d.group.name = 'hatch_dragon_' + L.kind; ring.add(d.group);
    fetchGltfUrl(base + 'assets/models/dragon_' + L.kind + (mobile ? '_m' : '') + '.glb').then((g) => {
      const m = cloneSkinned(g.scene); m.scale.setScalar(1.1);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = !mobile; o.frustumCulled = false; } });
      d.group.add(m); d.mixer = new THREE.AnimationMixer(m);
      const clips = g.animations || []; const fly = clips.find((c) => c.name === 'glide') || clips.find((c) => c.name === 'fly') || clips.find((c) => c.name === 'idle') || clips[0];
      if (fly) d.mixer.clipAction(fly).play();
    }).catch((e) => console.warn('[hatchkeeper] dragon', L.kind, e));
    return d;
  });

  function close() {
    if (!panel) return;
    panel.remove(); panel = null; play('idle');
    if (onDocDown) doc.removeEventListener('pointerdown', onDocDown, true); if (onKey) win.removeEventListener('keydown', onKey, true);
    onDocDown = onKey = null;
  }
  function open() {
    if (panel || !doc) return;
    panel = doc.createElement('div'); panel.className = 'ftf-hatch-talk'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', t('hatch.title'));
    panel.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);transform:translateX(-50%);z-index:30;width:min(480px,calc(100vw - 32px));box-sizing:border-box;'
      + 'padding:14px 16px;border-radius:14px;background:rgba(12,16,18,.92);border:1px solid rgba(217,178,106,.45);color:#f3ead8;font:15px/1.45 system-ui,sans-serif';
    const h = doc.createElement('b'); h.textContent = t('hatch.title'); h.style.cssText = 'display:block;color:#f6c860;margin-bottom:6px';
    panel.append(h);
    const body = doc.createElement('div'); panel.append(body);
    const line = (text, css = 'margin:0 0 8px') => { const p = doc.createElement('p'); p.textContent = text; p.style.cssText = css; body.append(p); return p; };
    const status = (text) => { const st = line(text, 'margin:4px 0 0;color:#aab1c5;font-style:italic'); st.className = 'ftf-hatch-status'; return st; };
    const riddle = () => { body.replaceChildren(); for (const k of HATCH_LINES) line(t(k)); status(t('hatch.status')); };
    riddle();
    doc.body.append(panel);
    // "prove you are real" (owner 13.11): after the first finished tournament the riddle becomes the claim; a pet already
    // chosen shows who it flies with. The view decides nothing: `pet` asks the chain and the relayer (net/pet.js).
    if (pet) pet.state().then((ps) => {
      if (!panel || !ps || ps.state === 'riddle') return;
      body.replaceChildren();
      if (ps.state === 'owned') { line(t('hatch.owned', { name: t('hatch.kind.' + ps.pet.kind), heroine: ps.pet.heroine })); return; }
      line(t('hatch.proven')); line(t('hatch.pick'));
      let chosen = ps.heroines[0] || null; const opts = doc.createElement('div'); opts.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px';
      const btn = (text, primary) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = text; b.style.cssText = `min-height:40px;padding:0 12px;border-radius:8px;cursor:pointer;font:inherit;border:1px solid #d9b26a;${primary ? 'background:#e9b44c;color:#1a1408;font-weight:700' : 'background:rgba(255,255,255,.06);color:#f3ead8'}`; return b; };
      const marks = ps.heroines.map((h) => { const b = btn(h, false); b.setAttribute('aria-pressed', String(h === chosen)); b.addEventListener('click', () => { chosen = h; for (const m of marks) m.setAttribute('aria-pressed', String(m.textContent === h)); }); opts.append(b); return b; });
      body.append(opts);
      const claim = btn(t('hatch.claim'), true); body.append(claim);
      const st = status('');
      claim.addEventListener('click', async () => {
        if (!chosen) return; claim.disabled = true; st.textContent = t('hatch.claiming');
        const r = await pet.claim(chosen, ps.seasonId).catch(() => ({ ok: false, reason: 'network' }));
        if (!panel) return;
        if (r && r.ok) { body.replaceChildren(); line(t('hatch.owned', { name: t('hatch.kind.' + (r.kind || 'nacre')), heroine: chosen })); }
        else { claim.disabled = false; st.textContent = t('hatch.failed', { reason: (r && r.reason) || 'network' }); }
      });
    }).catch(() => { /* the riddle stays */ });
    play('talk');
    onDocDown = (e) => { if (panel && !panel.contains(e.target)) close(); }; // a tap outside closes it
    onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    doc.addEventListener('pointerdown', onDocDown, true); win.addEventListener('keydown', onKey, true);
  }

  const spot = {
    id: 'hatchkeeper',
    near: (pos) => Math.hypot(pos[0] - root.position.x, pos[2] - root.position.z) <= HATCHKEEPER.reach && Math.abs(pos[1] - root.position.y) < 3,
    prompt: () => t('hatch.prompt'),
    onInteract: () => { if (panel) close(); else open(); return true; },
    busy: () => !!panel,
  };

  return {
    root, ring, spot, dragons,
    get open() { return !!panel; }, openPanel: open, close,
    /** Per frame: ground once, cull far away, fly the loops, close the panel when she walks off. */
    update(dt, pos) {
      if (!grounded && groundAt) { const y = groundAt(root.position.x, root.position.z); if (y != null) { root.position.y = y; ring.position.y = y; grounded = true; } }
      const far = !pos || Math.hypot(pos[0] - root.position.x, pos[2] - root.position.z) > HATCHKEEPER.cull;
      root.visible = ring.visible = !far;
      if (panel && pos && Math.hypot(pos[0] - root.position.x, pos[2] - root.position.z) > HATCHKEEPER.reach + 2) close();
      if (far) return;
      clock += dt; const red = reduced();
      if (mixer) mixer.update(red ? 0 : dt);
      dragons.forEach((d, i) => { const o = dragonOrbit(i, clock, { reduced: red }); d.group.position.set(o.pos[0], o.pos[1], o.pos[2]); d.group.rotation.y = o.yaw; if (d.mixer) d.mixer.update(dt * (red ? 0.5 : 1)); });
      if (pos && !panel) root.rotation.y = HATCHKEEPER.heading; // stands facing the lane
    },
    dispose() { close(); scene.remove(root); scene.remove(ring); },
  };
}
