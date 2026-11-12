// The Gate-Loom (story P1/P5, docs/plans/story/FTF-Story-Quests-Leaderboard-TZ.md §6.7): a portal standing where Iris
// arrived in the hill town, the goal of the Expedition. Procedural (no new art file): a ring of nacre stone with teal
// seams, an additive shimmer disc, slow motes and one soft light; four states: dormant (fee not met: faint violet),
// ready (fee met: gold), spent (after the twist: dark), off (story flag off: nothing is created). E in reach shows its
// line through the town's prompt; in `ready` a confirmation says what happens before the fee is paid. Behind ?story=1.
import * as THREE from 'three';

/** Town-local metres beside the spawn, to Iris's right in the first frame (the spawn is (0, 0, 25), she faces -z). */
export const PORTAL_TOWN = Object.freeze([4, 0, 22.5]);
export const PORTAL_REACH = 3;

/** The portal's state from the story phase and the balance (pure). */
export function portalState({ on = false, phase = 'off', balanceC = 0, feeC = 20_000 } = {}) {
  if (!on || phase === 'off') return 'off';
  if (phase === 'twist' || phase === 'onward') return 'spent';
  return balanceC >= feeC ? 'ready' : 'dormant';
}

/** The prompt line for a state: {key, args} (locale keys story.portal.*). */
export function portalPrompt(state, { balanceC = 0, feeC = 20_000, demo = false, blocker = null, payError = null, paying = false } = {}) {
  const fee = Math.round(feeC / 100).toLocaleString('en-US'), held = Math.floor(balanceC / 100).toLocaleString('en-US');
  if (state !== 'spent' && paying) return { key: 'story.portal.paying', args: {} };
  if (state !== 'spent' && blocker === 'need_guest') return { key: 'story.portal.needGuest', args: {} };
  if (state !== 'spent' && blocker && blocker !== 'loading') return { key: 'story.portal.offline', args: {} };
  if (state !== 'spent' && payError) return { key: payError === 'no_silk' ? 'story.portal.noSilk' : 'story.portal.failed', args: { fee, n: held } };
  if (state === 'ready') return { key: demo ? 'story.portal.payDemo' : 'story.portal.pay', args: { fee } };
  if (state === 'spent') return { key: 'story.portal.quiet', args: {} };
  return { key: demo ? 'story.portal.wantsDemo' : 'story.portal.wants', args: { fee, n: held } };
}

const LOOK = Object.freeze({
  dormant: { disc: 0x7a5cff, light: 0x8c6cff, intensity: 1.2, discOpacity: 0.32 },
  ready: { disc: 0xffc861, light: 0xffc861, intensity: 3.2, discOpacity: 0.62 },
  spent: { disc: 0x1a1d22, light: 0x334048, intensity: 0, discOpacity: 0.08 },
});

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene @param {number[]} o.position world position (on the ground) @param {number} [o.facing] heading (rad)
 * @param {object} o.i18n @param {() => {phase: string, balanceC: number, feeC: number, demo: boolean}} o.read live story facts
 * @param {() => void} o.onPay pays the fee (the story's PAY_GATE) after the confirmation
 * @param {boolean} [o.reducedMotion] @param {boolean} [o.light] one point light (off on the phone / low tier)
 * @param {Document} [o.doc]
 */
export function createTownPortal({ scene, position, facing = 0, i18n, read, onPay, reducedMotion = false, light = true, doc = globalThis.document }) {
  const t = (k, a) => i18n.t(k, a);
  const root = new THREE.Group(); root.name = 'story_portal';
  root.position.set(position[0], position[1], position[2]); root.rotation.y = facing;
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.42, metalness: 0.15, emissive: new THREE.Color(0x2fc4b2), emissiveIntensity: 0.35 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.16, 12, 48), ringMat); ring.position.y = 1.55; ring.name = 'story_portal_ring';
  const discMat = new THREE.MeshBasicMaterial({ color: LOOK.dormant.disc, transparent: true, opacity: LOOK.dormant.discOpacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.22, 40), discMat); disc.position.y = 1.55; disc.name = 'story_portal_disc';
  root.add(ring, disc);
  let glow = null;
  if (light) { glow = new THREE.PointLight(LOOK.dormant.light, LOOK.dormant.intensity, 7, 2); glow.position.set(0, 1.6, 0.4); root.add(glow); }
  let motes = null;
  if (!reducedMotion) {
    const n = 40, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pos[i * 3] = Math.cos(a) * 1.3; pos[i * 3 + 1] = 1.55 + Math.sin(a) * 1.3; pos[i * 3 + 2] = 0; seed[i] = (i * 0.618) % 1; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    motes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfeee6, size: 0.06, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    motes.userData.seed = seed; root.add(motes);
  }
  scene.add(root);

  let state = 'dormant', panel = null;
  const facts = () => read() || { phase: 'off', balanceC: 0, feeC: 1_000_000, demo: false };
  function setLook(s) {
    if (s === state) return; state = s;
    const L = LOOK[s] || LOOK.dormant;
    discMat.color.setHex(L.disc); discMat.opacity = L.discOpacity;
    ringMat.emissive.setHex(s === 'ready' ? 0xffc861 : s === 'spent' ? 0x0c0f12 : 0x2fc4b2);
    if (glow) { glow.color.setHex(L.light); glow.intensity = L.intensity; }
  }

  function closePanel() { if (panel) { panel.remove(); panel = null; } }
  function confirm() {
    closePanel();
    const f = facts();
    panel = doc.createElement('div'); panel.className = 'ftf-portal-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;max-width:min(420px,calc(100vw - 32px));padding:18px 20px;border-radius:14px;'
      + 'background:rgba(12,16,18,.94);border:1px solid rgba(255,200,97,.55);color:#f3ead8;font:15px/1.45 system-ui,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.5)';
    const h = doc.createElement('h3'); h.textContent = t('story.portal.title'); h.style.cssText = 'margin:0 0 8px;font:600 17px/1.2 system-ui;color:#ffc861';
    const p = doc.createElement('p'); p.textContent = t(f.demo ? 'story.portal.confirmDemo' : 'story.portal.confirm', { fee: Math.round(f.feeC / 100).toLocaleString('en-US') }); p.style.margin = '0 0 14px';
    const row = doc.createElement('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:center';
    const mk = (key, fn, primary) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = t(key); b.style.cssText = 'min-height:44px;min-width:120px;padding:8px 16px;border-radius:10px;font:600 15px system-ui;cursor:pointer;' + (primary ? 'background:#ffc861;color:#1a1408;border:0' : 'background:transparent;color:#f3ead8;border:1px solid rgba(243,234,216,.4)'); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };
    const pay = mk('story.portal.payButton', () => { closePanel(); onPay(); }, true);
    row.append(pay, mk('story.portal.notYet', closePanel, false));
    panel.append(h, p, row);
    doc.body.append(panel);
    if (pay.focus) pay.focus();
  }

  const spot = {
    id: 'portal',
    near: (pos) => { const at = root.position; return state !== 'off' && Math.hypot(pos[0] - at.x, pos[2] - at.z) <= PORTAL_REACH && Math.abs(pos[1] - at.y) < 3; }, // grounded later by the caller
    prompt: () => { const f = facts(); const p = portalPrompt(state, f); return t(p.key, p.args); },
    onInteract: () => { const f = facts(); if (state === 'ready' && !f.blocker && !f.paying) confirm(); return true; }, // pays on chain (pay_gate) after the confirmation
  };

  return {
    root, spot,
    get state() { return state; },
    get panelOpen() { return !!panel; },
    /** Per frame: the look follows the story and the balance; the disc breathes, the motes drift. */
    update(dt, time) {
      const f = facts();
      setLook(portalState({ on: true, ...f }));
      if (state === 'spent') return;
      if (!reducedMotion) {
        disc.material.opacity = (LOOK[state] || LOOK.dormant).discOpacity * (0.85 + 0.15 * Math.sin(time * 1.7));
        ring.rotation.z = Math.sin(time * 0.3) * 0.03;
        if (motes) { motes.rotation.z += dt * (state === 'ready' ? 0.35 : 0.12); }
      }
    },
    /** The twist's flare (P5): the disc burns white for a moment. */
    flare(k = 1) { discMat.opacity = Math.min(1, 0.6 + 0.4 * k); discMat.color.setHex(0xffffff); if (glow) glow.intensity = 6 * k; },
    closePanel,
    /** Hidden while Iris is away from the town. */
    setActive(on) { root.visible = !!on; if (!on) closePanel(); },
    dispose() { closePanel(); scene.remove(root); ring.geometry.dispose(); disc.geometry.dispose(); ringMat.dispose(); discMat.dispose(); if (motes) { motes.geometry.dispose(); motes.material.dispose(); } },
  };
}
