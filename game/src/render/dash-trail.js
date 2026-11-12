// The trail of Iris's dash (owner, 12.11): afterimages of her own silhouette left along the path, and a short ribbon
// streak in her colour behind the hips. Short and crisp: a ghost lives 0.36 s, the ribbon 0.26 s. Cheap: the ghosts
// are clones of her skinned model made once, drawn with one flat additive material and only while a dash fades
// (phones get two instead of three); nothing runs between dashes. Not shown under reduced motion.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const DASH_TRAIL = Object.freeze({ color: 0x8f7bff, ghosts: 3, ghostsPhone: 2, spacing: 1.15, ghostLife: 0.36, ribbonLife: 0.26, ribbonPoints: 14, ribbonY: 0.92, ribbonHeight: 0.34 });

/** How far along the dash (metres from its start) each of `n` ghosts is left: evenly, whatever the frame rate. */
export function stampDistances(n, T = DASH_TRAIL) { return Array.from({ length: n }, (_, i) => (i + 0.6) * T.spacing); }
/** A ghost's opacity `age` seconds after its stamp: a quick ease out to nothing. */
export function ghostOpacity(age, life = DASH_TRAIL.ghostLife) { const k = 1 - Math.min(1, Math.max(0, age / life)); return 0.6 * k * k; }

export class DashTrail {
  /** @param {THREE.Object3D} parent the scene @param {THREE.Object3D} model her model (child of the avatar group) */
  constructor(parent, model, { phone = false } = {}) {
    this.parent = parent; this.model = model;
    this.group = new THREE.Group(); this.group.name = 'iris_dash_trail'; parent.add(this.group);
    const n = phone ? DASH_TRAIL.ghostsPhone : DASH_TRAIL.ghosts;
    this.live = new Map(); model.traverse((o) => { if (o.isBone) this.live.set(o.name, o); });
    this.ghosts = [];
    for (let i = 0; i < n; i++) {
      const g = cloneSkinned(model);
      const mat = new THREE.MeshBasicMaterial({ color: DASH_TRAIL.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.NormalBlending });
      const bones = [];
      g.traverse((o) => {
        if (o.isBone && this.live.has(o.name)) bones.push([o, this.live.get(o.name)]);
        if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.renderOrder = 3; if (o.userData.outline) o.visible = false; }
      });
      const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.visible = false; holder.add(g);
      this.group.add(holder);
      this.ghosts.push({ holder, model: g, mat, bones, age: 1e9 });
    }
    // the ribbon: a vertical strip through the recent hip positions, bright at her back and gone at its tail
    const P = DASH_TRAIL.ribbonPoints;
    this.pts = []; this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(P * 2 * 3); this.col = new Float32Array(P * 2 * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx = []; for (let i = 0; i < P - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.geo.setIndex(idx);
    this.ribbon = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: DASH_TRAIL.color, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.ribbon.frustumCulled = false; this.ribbon.visible = false; this.ribbon.renderOrder = 3;
    this.group.add(this.ribbon);
    this.t = -1; this.next = 0; this.stamps = stampDistances(n); this.from = new THREE.Vector3(); this.at = new THREE.Vector3(); this.gone = new THREE.Vector3();
  }

  get active() { return this.t >= 0; }

  /** A dash begins. */
  start() { this.t = 0; this.next = 0; this.pts.length = 0; this.fresh = true; }

  /** Leaves ghost `g` in her current pose at the world point `at` on the path. */
  stamp(g, avatarGroup, at) {
    avatarGroup.updateMatrixWorld(true);
    g.holder.matrix.copy(avatarGroup.matrixWorld).setPosition(at); g.holder.matrixWorldNeedsUpdate = true;
    g.model.position.copy(this.model.position); g.model.quaternion.copy(this.model.quaternion); g.model.scale.copy(this.model.scale);
    for (const [b, src] of g.bones) { b.position.copy(src.position); b.quaternion.copy(src.quaternion); b.scale.copy(src.scale); }
    g.age = 0; g.holder.visible = true;
  }

  /** Per frame, after her pose is final. */
  update(dt, avatarGroup, reduced = false) {
    if (this.t < 0) return;
    if (reduced) { this.stop(); return; }
    if (this.fresh) { this.fresh = false; this.from.copy(avatarGroup.position); }
    this.t += dt;
    // a ghost every `spacing` metres of the burst, placed on the path itself (a slow frame still spreads them)
    const gone = this.gone.copy(avatarGroup.position).sub(this.from), far = gone.length();
    while (this.t < 0.3 && this.next < this.stamps.length && far >= this.stamps[this.next]) {
      this.stamp(this.ghosts[this.next], avatarGroup, this.at.copy(this.from).addScaledVector(gone, this.stamps[this.next] / far)); this.next++;
    }
    let alive = this.t < 0.3 && this.next < this.stamps.length;
    for (const g of this.ghosts) {
      if (!g.holder.visible) continue;
      g.age += dt; g.mat.opacity = ghostOpacity(g.age);
      if (g.age >= DASH_TRAIL.ghostLife) g.holder.visible = false; else alive = true;
    }
    // ribbon points: her position while the burst lasts, each fading on its own clock
    const p = avatarGroup.position;
    if (this.t < 0.22) { this.pts.unshift({ x: p.x, y: p.y, z: p.z, age: 0 }); if (this.pts.length > DASH_TRAIL.ribbonPoints) this.pts.pop(); }
    for (const q of this.pts) q.age += dt;
    while (this.pts.length && this.pts[this.pts.length - 1].age > DASH_TRAIL.ribbonLife) this.pts.pop();
    const P = DASH_TRAIL.ribbonPoints, n = this.pts.length;
    if (n >= 2) {
      for (let i = 0; i < P; i++) {
        const q = this.pts[Math.min(i, n - 1)], a = i < n ? 0.8 * Math.pow(1 - q.age / DASH_TRAIL.ribbonLife, 2) * Math.min(1, i / 1.5) : 0;
        const h = DASH_TRAIL.ribbonHeight * (0.35 + 0.65 * (1 - q.age / DASH_TRAIL.ribbonLife));       // it thins as it fades
        this.pos.set([q.x, q.y + DASH_TRAIL.ribbonY - h / 2, q.z, q.x, q.y + DASH_TRAIL.ribbonY + h / 2, q.z], i * 6);
        this.col.set([1, 1, 1, a * 0.25, 1, 1, 1, a], i * 8);
      }
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
      this.ribbon.visible = true; alive = true;
    } else this.ribbon.visible = false;
    if (!alive) this.stop();
  }

  stop() { this.t = -1; this.ribbon.visible = false; for (const g of this.ghosts) g.holder.visible = false; }

  dispose() { this.stop(); for (const g of this.ghosts) g.mat.dispose(); this.geo.dispose(); this.ribbon.material.dispose(); this.group.removeFromParent(); }
}
