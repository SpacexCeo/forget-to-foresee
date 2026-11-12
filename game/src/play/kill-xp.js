// XP for monsters felled beyond the walls (owner 12.11: "the level must grow from killing mobs").
//
// Listens on window for 'ftf:mob-killed' {type, pos, elite} (play/mobs.js, the hillside packs) and
// 'ftf:critter-killed' {pos} (scenes/town-monsters.js, the moss critters when the packs are off), credits the town
// ledger (game/town-economy.js killMob: per-type XP, a one-time first-kill bonus, saved with the economy state) and
// shows it: a gold "+N XP" rising from the kill, and on a level up a short gold burst around the heroine, a quiet chime
// and one toast. The portrait's level badge and XP ring follow the ledger by themselves (scenes/player-hud.js).
// Local and visual: no engine, no chain; the judge path never fires these events.
import { cueAt } from '../audio/town-audio.js';

const CSS = `
.ftf-xpgain { position: fixed; left: 0; top: 0; z-index: 5; pointer-events: none; color: #ffd98a; font: 800 16px/1 system-ui, sans-serif;
  text-shadow: 0 1px 2px #000, 0 0 8px rgba(255, 190, 90, .55); white-space: nowrap; will-change: transform, opacity; }
.ftf-xpgain.lv { font-size: 20px; color: #fff1c4; }
`;
const RISE = 1.1;          // metres a label climbs
const LIFE = 1.3;          // seconds a label lives
const BURST = 1.2;         // seconds the level-up burst lasts

/**
 * @param {object} o
 * @param {object} o.THREE @param {object} o.scene @param {object} o.camera @param {object} o.player (pos: [x, y, z] world)
 * @param {object} o.ledger the town ledger (killMob) @param {(k: string, a?: object) => string} o.t
 * @param {(text: string) => void} o.toast @param {() => boolean} [o.reduced] @param {() => boolean} [o.active]
 * @param {Window} [o.win] @param {Document} [o.doc]
 */
export function createKillXp({ THREE, scene, camera, player, ledger, t, toast, reduced = () => false, active = () => true, win = globalThis.window, doc = globalThis.document }) {
  if (doc && !doc.getElementById('ftf-xp-style')) { const s = doc.createElement('style'); s.id = 'ftf-xp-style'; s.textContent = CSS; doc.head.append(s); }
  const labels = [];
  const v3 = new THREE.Vector3();
  // the burst: two gold rings that widen on the ground and a soft column, reused
  const burst = new THREE.Group(); burst.name = 'levelup_burst'; burst.visible = false; scene.add(burst);
  const gold = (o) => new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ringGeo = new THREE.RingGeometry(0.82, 1.0, 48); ringGeo.rotateX(-Math.PI / 2);
  const rings = [new THREE.Mesh(ringGeo, gold(0.9)), new THREE.Mesh(ringGeo, gold(0.6))];
  const colGeo = new THREE.CylinderGeometry(0.55, 0.75, 2.4, 24, 1, true); colGeo.translate(0, 1.2, 0);
  const column = new THREE.Mesh(colGeo, gold(0.28));
  for (const m of [...rings, column]) { m.renderOrder = 5; burst.add(m); }
  let burstT = -1;

  function label(text, pos, big = false) {
    if (!doc || reduced() || !pos) return;
    const el = doc.createElement('div'); el.className = 'ftf-xpgain' + (big ? ' lv' : ''); el.textContent = text; doc.body.append(el);
    labels.push({ el, p: [pos[0] + (Math.random() - 0.5) * 0.3, pos[1] + 1.6, pos[2]], t: 0 });
  }

  function credit(type, pos, elite) {
    if (!active()) return null;
    const r = ledger.killMob(type, elite);
    label(t('xp.gain', { n: r.gained }), pos);
    if (r.levelUp) {
      toast(t('xp.levelUp', { level: r.levelUp }));
      cueAt('gift_chime', null, 0.55);
      if (!reduced()) { burstT = 0; burst.visible = true; }
    }
    return r;
  }
  const onMob = (e) => { const d = e && e.detail; if (d) credit(d.type || 'skitter', d.pos, !!d.elite); };
  const onCritter = (e) => { const d = (e && e.detail) || {}; credit('critter', d.pos, false); };
  if (win && win.addEventListener) { win.addEventListener('ftf:mob-killed', onMob); win.addEventListener('ftf:critter-killed', onCritter); }

  return {
    credit,
    /** Per frame: the labels climb and fade, the burst follows the heroine. */
    update(dt) {
      if (labels.length) {
        const w = win ? win.innerWidth : 1, h = win ? win.innerHeight : 1;
        for (const n of labels) {
          n.t += dt; v3.set(n.p[0], n.p[1] + RISE * Math.min(1, n.t / LIFE), n.p[2]).project(camera);
          n.el.style.transform = `translate(${((v3.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v3.y) / 2 * h).toFixed(1)}px) translate(-50%, -50%)`;
          n.el.style.opacity = String(Math.max(0, Math.min(1, (LIFE - n.t) / 0.4)));
          if (n.t > LIFE || v3.z > 1) n.el.remove();
        }
        for (let i = labels.length - 1; i >= 0; i--) if (labels[i].t > LIFE || !labels[i].el.isConnected) labels.splice(i, 1);
      }
      if (burstT >= 0) {
        burstT += dt;
        const k = burstT / BURST;
        burst.position.set(player.pos[0], player.pos[1] + 0.03, player.pos[2]);
        rings[0].scale.setScalar(0.4 + 1.6 * k); rings[0].material.opacity = 0.9 * (1 - k);
        const k2 = Math.max(0, k - 0.18) / 0.82;
        rings[1].scale.setScalar(0.3 + 1.2 * k2); rings[1].material.opacity = 0.6 * (1 - k2);
        column.scale.set(1 + 0.3 * k, 0.6 + 0.6 * Math.sin(Math.min(1, k * 1.4) * Math.PI / 2), 1 + 0.3 * k); column.material.opacity = 0.28 * Math.sin(Math.PI * Math.min(1, k));
        if (k >= 1) { burstT = -1; burst.visible = false; }
      }
    },
    dispose() {
      if (win && win.removeEventListener) { win.removeEventListener('ftf:mob-killed', onMob); win.removeEventListener('ftf:critter-killed', onCritter); }
      for (const n of labels) n.el.remove();
      scene.remove(burst); ringGeo.dispose(); colGeo.dispose(); for (const m of [...rings, column]) m.material.dispose();
    },
  };
}
