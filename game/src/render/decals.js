// Code-drawn decals on socket pads (brief: "Flat plates on the body for the Shell number (I-IV) and
// the tick: the digits are drawn by code"). Works on the real anchor.glb sockets and on the greybox
// sockets alike: each socket's local +Z is the pad's outward normal, and glTF extras carry the pad
// size (pad_size_m: [width, height]).
import * as THREE from 'three';
import { socketRole } from './asset-catalog.js';

const DEFAULT_PAD = { shell_number: [0.094, 0.112], tick: [0.094, 0.072] };
const textures = new Map();

/** Canvas texture with centered text, cached by text and aspect. */
export function padTexture(text, aspect, { ink = '#1d2321', glow = 'rgba(217, 164, 65, 0.55)' } = {}) {
  const key = text + '|' + aspect.toFixed(3) + '|' + ink;
  let tex = textures.get(key);
  if (tex) return tex;
  const h = 256, w = Math.round(h * aspect);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  let size = Math.floor(h * 0.72);
  ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
  while (ctx.measureText(text).width > w * 0.84 && size > 20) { size -= 4; ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = glow; ctx.shadowBlur = h * 0.06;
  ctx.fillStyle = ink;
  ctx.fillText(text, w / 2, h / 2 + size * 0.04);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(key, tex);
  return tex;
}

/**
 * Keeps decals on an instance's pad sockets. Re-attaches automatically when the instance swaps
 * between greybox and real art. `values` maps socket roles to text, e.g. {shell_number: 'II', tick: '7'}.
 */
export class PadDecals {
  constructor(instance, values) {
    this.values = { ...values };
    this.meshes = [];
    instance.onSockets((sockets) => this.attach(sockets));
  }

  attach(sockets) {
    for (const m of this.meshes) { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.meshes = [];
    this.sockets = sockets;
    for (const [name, socket] of sockets) {
      const role = socketRole(name, socket.userData);
      const text = this.values[role];
      if (text == null) continue;
      const size = Array.isArray(socket.userData.pad_size_m) ? socket.userData.pad_size_m : DEFAULT_PAD[role];
      if (!size) continue;
      const [w, h] = size;
      const mat = new THREE.MeshBasicMaterial({ map: padTexture(String(text), w / h), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.92), mat);
      mesh.name = 'decal_' + name;
      mesh.position.z = 0.0015; // just in front of the pad, along the socket's outward +Z
      mesh.renderOrder = 2;
      socket.add(mesh);
      this.meshes.push(mesh);
    }
  }

  set(values) { Object.assign(this.values, values); if (this.sockets) this.attach(this.sockets); }
}
