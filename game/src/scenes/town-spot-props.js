// The objects of the town spots that the town files do not model (owner 12.11: "in some places there is a button but no
// object"): a standing ornate mirror by the gate (E: change your look) and a notice board after the stairs (E: read the
// notice board). Procedural three.js in the town's palette: honey stone, dark timber, gold. Each object glows softly
// while Iris is within reach of its prompt (the doors' highlight), and sits on the ground once its colliders are in.
// Visual only (no colliders): both stand just off the walking line, facing it.
import * as THREE from 'three';
import { SPOT_PROPS, townToWorld } from './town-layout.js';

const GOLD = 0xc99a3c, TIMBER = 0x4a3324, PARCHMENT = 0xe8dcc0;

/** The standing mirror: an oval gold frame with a bright, mirror-like glass on a footed stand, about 1.9 m tall. */
export function buildMirror() {
  const g = new THREE.Group(); g.name = 'spot_mirror';
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.32, emissive: 0x6b4a12, emissiveIntensity: 0 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, metalness: 1, roughness: 0.04, envMapIntensity: 1.6 });
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 12, 48), gold); frame.scale.set(1, 1.45, 1); frame.position.y = 1.25;
  const pane = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), glass); pane.scale.set(1, 1.45, 1); pane.position.set(0, 1.25, 0.004);
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.44, 32), new THREE.MeshStandardMaterial({ color: TIMBER, roughness: 0.8 })); back.scale.set(1, 1.45, 1); back.position.set(0, 1.25, -0.01); back.rotation.y = Math.PI;
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), gold); crest.position.y = 1.25 + 0.42 * 1.45 + 0.1;
  const legMat = new THREE.MeshStandardMaterial({ color: TIMBER, roughness: 0.7 });
  const legGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.75, 8);
  for (const x of [-0.3, 0.3]) { const leg = new THREE.Mesh(legGeo, legMat); leg.position.set(x, 0.42, 0); leg.rotation.z = x > 0 ? -0.12 : 0.12; g.add(leg); }
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.32), legMat); foot.position.y = 0.03;
  g.add(frame, pane, back, crest, foot);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.glow = [gold];
  return g;
}

/** The notice board: two posts, a small shingled roof, a dark board with pinned parchment notes, about 2.1 m tall. */
export function buildNoticeBoard() {
  const g = new THREE.Group(); g.name = 'spot_notice_board';
  const wood = new THREE.MeshStandardMaterial({ color: TIMBER, roughness: 0.8 });
  const trim = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.8, roughness: 0.4, emissive: 0x6b4a12, emissiveIntensity: 0 });
  for (const x of [-0.62, 0.62]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.05, 0.09), wood); post.position.set(x, 1.02, 0); g.add(post); }
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.05), new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.9 })); board.position.y = 1.4;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.06, 0.07), trim); rim.position.y = 1.85;
  const rimLow = rim.clone(); rimLow.position.y = 0.95;
  const roofA = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.32), wood); roofA.position.set(0, 2.06, 0.1); roofA.rotation.x = 0.5;
  const roofB = roofA.clone(); roofB.position.set(0, 2.06, -0.1); roofB.rotation.x = -0.5;
  const paper = new THREE.MeshStandardMaterial({ color: PARCHMENT, roughness: 0.95, side: THREE.DoubleSide });
  const pin = new THREE.MeshStandardMaterial({ color: 0xb03a2e, roughness: 0.5 });
  [[-0.38, 1.52, 0.32, 0.38, 0.04], [0.02, 1.44, 0.3, 0.42, -0.05], [0.4, 1.56, 0.28, 0.3, 0.06], [-0.2, 1.16, 0.34, 0.24, -0.03], [0.34, 1.18, 0.26, 0.26, 0.02]].forEach(([x, y, w, h, r]) => {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper); n.position.set(x, y, 0.03); n.rotation.z = r; g.add(n);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), pin); p.position.set(x, y + h / 2 - 0.03, 0.04); g.add(p);
  });
  g.add(board, rim, rimLow, roofA, roofB);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.glow = [trim];
  return g;
}

/**
 * @param {{scene: THREE.Scene, town: {groundAt?: Function}, near?: (id: string) => boolean}} o
 *   near(id): whether Iris stands within the prompt of that spot (the glow follows it)
 */
export function createSpotProps({ scene, town, near = () => false }) {
  const group = new THREE.Group(); group.name = 'town_spot_props'; scene.add(group);
  const items = [];
  for (const [id, build] of [['mirror', buildMirror], ['board', buildNoticeBoard]]) {
    const spec = SPOT_PROPS[id], obj = build(), w = townToWorld(spec.position);
    obj.position.set(w[0], w[1], w[2]); obj.rotation.y = spec.heading;
    group.add(obj); items.push({ id, obj, w, grounded: false, glow: 0 });
  }
  return {
    group, items,
    /** Per frame: ground the props once the colliders are in; the soft gold glow eases in while the prompt is offered. */
    update(dt, reducedMotion = false) {
      for (const it of items) {
        if (!it.grounded && town.groundAt) { const y = town.groundAt(it.w[0], it.w[2], it.w[1] + 3); if (y != null) { it.obj.position.y = y; it.grounded = true; } }
        const target = near(it.id) ? 1 : 0;
        it.glow += (target - it.glow) * Math.min(1, dt * 4);
        const pulse = reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(performance.now() / 380);
        for (const m of it.obj.userData.glow) m.emissiveIntensity = it.glow * 1.6 * pulse;
      }
    },
    dispose() { scene.remove(group); group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } }); },
  };
}
