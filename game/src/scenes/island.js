// The island scene: a floating archipelago above a sea of clouds (owner concept 07.11, third image).
// Plaza plateau with the Scroll medallion and four anchor zones, six camp plateaus joined by railed
// bridges, a viewing balcony where the player starts, four levitating Shells, a hovering glyph.
// Every catalog object is a PropInstance: greybox first, real art when its .glb streams in.
// Lighting, sky, clouds, foliage and post-processing live in render/lookdev.js; this file only
// places geometry, props and physics. No game rules here: anchor pads and the plaza sign are set by
// the play layer from the room's observation.
import * as THREE from 'three';
import { CollisionWorld } from '../physics/collision.js';
import { CharacterController } from '../physics/character.js';
import { AssetLibrary, AssetStreamer, PropInstance } from '../render/assets.js';
import { PadDecals } from '../render/decals.js';
import { ROMAN } from '../render/asset-catalog.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { LAYER_OVERLAY } from '../render/layers.js';
import { CAMPS, ANCHOR_ZONES, SCROLL_TABLE, SHARD, SPAWN, CLOUD_LEVEL, KILL_Y, WALK_SPEED, PLATEAU_RADIUS, shellHover } from './layout.js';

export const HAZE = 0xb7c2c7;

/** Soft radial mist texture (white center fading to transparent). */
function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(236, 240, 242, 0.8)'); g.addColorStop(0.5, 'rgba(226, 232, 236, 0.32)'); g.addColorStop(1, 'rgba(220, 226, 230, 0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Code-drawn glyph hovering above the plaza (the logogram itself comes with the language UI). */
function glyphObject() {
  const g = new THREE.Group();
  g.name = 'plaza_glyph';
  const mat = new THREE.MeshStandardMaterial({ color: 0xf3ecd8, emissive: 0xd9b25a, emissiveIntensity: 1.6, roughness: 0.35, metalness: 0.4 });
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 40), mat));
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), mat);
    const a = (i / 4) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0); s.rotation.z = a; g.add(s);
  }
  return g;
}

function playerMesh() {
  const g = new THREE.Group();
  g.name = 'player_iris';
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.05, 4, 12), new THREE.MeshStandardMaterial({ color: 0x6f5aa6, roughness: 0.7 }));
  body.position.y = 0.875; body.castShadow = true;
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a4650, roughness: 0.95, side: THREE.DoubleSide }));
  cloak.position.y = 0.75; cloak.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.12), new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0x8a5a14, emissiveIntensity: 1.2, roughness: 0.4 }));
  visor.position.set(0, 1.45, 0.3);
  g.add(body, cloak, visor);
  return g;
}

/** @param {THREE.WebGLRenderer} renderer @param {THREE.PerspectiveCamera} camera */
export function createIslandScene(renderer, camera) {
  void renderer;
  const scene = new THREE.Scene();
  // Sky, environment, lights, fog and clouds are installed by LookDev (render/lookdev.js).

  const world = new CollisionWorld({ cellSize: 2 });
  const library = new AssetLibrary({ onTemplate: upgradeAssetMaterials });
  const streamer = new AssetStreamer({ library, camera });
  const place = (name, position, rotationY = 0) => streamer.add(new PropInstance({ name, scene, world, position, rotationY }));
  const interactables = [];

  place('island', [0, 0, 0]);
  const table = place('scroll_table', SCROLL_TABLE.position);
  interactables.push({ label: 'Scroll table', verb: 'Inspect', instance: table, position: new THREE.Vector3(...SCROLL_TABLE.position), radius: 3.2, inspect: true });

  const camps = [];
  for (const c of CAMPS) {
    const inst = place(c.asset, c.position, c.rotationY);
    camps.push({ clan: c, instance: inst });
  }

  const anchors = [], shells = [];
  const mistTex = mistTexture();
  for (const z of ANCHOR_ZONES) {
    const [shx, shy, shz] = z.shellPosition;
    const shellInst = place(z.shellAsset, z.shellPosition, z.shellRotationY);
    // Soft mist under the levitating Shell: a drifting layer and a camera-facing haze.
    const mistDisc = new THREE.Mesh(new THREE.CircleGeometry(11, 32), new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.5, depthWrite: false }));
    mistDisc.rotation.x = -Math.PI / 2; mistDisc.position.set(shx, shy - 2.5, shz); mistDisc.name = 'shell_mist_disc';
    const mistHaze = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.35, depthWrite: false }));
    mistHaze.scale.set(20, 9, 1); mistHaze.position.set(shx, shy - 1, shz); mistHaze.name = 'shell_mist_haze';
    mistDisc.layers.set(LAYER_OVERLAY); mistHaze.layers.set(LAYER_OVERLAY);
    scene.add(mistDisc, mistHaze);
    shells.push({ instance: shellInst, restY: shy, restYaw: z.shellRotationY, index: z.index, mistDisc });
    const a = place('anchor', z.anchorPosition, z.anchorRotationY);
    // The Shell number is fixed; the tick pad shows Iris's next anchor here (setAnchorTicks, from the room).
    const decals = new PadDecals(a, { shell_number: ROMAN[z.index], tick: '·' });
    anchors.push({ instance: a, decals, zone: z });
    interactables.push({ label: 'Anchor (Shell ' + ROMAN[z.index] + ')', verb: 'Inspect', instance: a, position: new THREE.Vector3(...z.anchorPosition), radius: 1.8, inspect: true });
  }

  const glyph = glyphObject();
  glyph.position.set(0, 9, 0);
  scene.add(glyph);
  // The newest visible Guest sign hangs inside the glyph ring (drawn by play/logogram.js via setPlazaSign).
  const signCanvas = document.createElement('canvas');
  signCanvas.width = signCanvas.height = 256;
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
  signMesh.name = 'plaza_sign'; signMesh.visible = false;
  glyph.add(signMesh);

  // Shard on a pedestal at the Iris camp. The pedestal is scene dressing with its own collider.
  const [sx, , sz] = SHARD.position, [pw, ph, pd] = SHARD.pedestal.size;
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), new THREE.MeshStandardMaterial({ color: 0x7d8781, roughness: 0.9 }));
  pedestal.position.set(sx, ph / 2, sz); pedestal.castShadow = true; pedestal.receiveShadow = true; pedestal.name = 'shard_pedestal';
  scene.add(pedestal);
  world.addBox('shard_pedestal', [sx - pw / 2, 0, sz - pd / 2], [sx + pw / 2, ph, sz + pd / 2]);
  const shard = place('shard', SHARD.position);
  interactables.push({ label: 'Memory shard', verb: 'Inspect', instance: shard, position: new THREE.Vector3(sx, 0, sz), radius: 1.8, inspect: true });

  const player = new CharacterController(world, { spawn: SPAWN, walkSpeed: WALK_SPEED, killY: KILL_Y });
  const avatar = playerMesh();
  scene.add(avatar);

  const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.36, 24), new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.9, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.visible = false; marker.name = 'move_marker'; marker.layers.set(LAYER_OVERLAY);
  scene.add(marker);

  // Look-dev inputs: grass on the six camp plateaus (tinted by clan) and a thin ring on the balcony;
  // lantern light positions from the camp greybox sockets (the real camp art uses the same names).
  const grassPatches = CAMPS.map((c) => ({ center: c.position, radius: PLATEAU_RADIUS - 0.6, tint: c.color }));
  const lanterns = [];
  for (const { instance } of camps) {
    for (const name of ['socket_lantern_l', 'socket_lantern_r']) {
      const s = instance.sockets.get(name);
      if (s) lanterns.push(s.getWorldPosition(new THREE.Vector3()).toArray());
    }
  }

  // Objective text shown top-left until the play layer (src/play/) drives it from the room.
  const objective = 'Explore the island';
  /** Tick pad per anchor zone: {1: 5, 3: 7} → Iris's next anchor tick at that Shell ('·' when none). */
  function setAnchorTicks(map) {
    for (const a of anchors) { const t = map[a.zone.shell]; const txt = t == null ? '·' : String(t); if (a.decals.values.tick !== txt) a.decals.set({ tick: txt }); }
  }
  /** Draws a sign into the plaza glyph with fn(ctx2d); null hides it. */
  function setPlazaSign(draw) {
    if (!draw) { signMesh.visible = false; return; }
    draw(signCanvas.getContext('2d'));
    signTex.needsUpdate = true; signMesh.visible = true;
  }
  /** Visual-only animation (never touches game state): Shell hover and drifting mist. */
  function update(t) {
    for (const s of shells) {
      const h = shellHover(t, s.index);
      s.instance.root.position.y = s.restY + h.dy;
      s.instance.root.rotation.y = s.restYaw + h.yaw;
      s.mistDisc.rotation.z = t * 0.02 + s.index;
    }
    glyph.rotation.y = t * 0.25;
    glyph.position.y = 9 + Math.sin(t * 0.7) * 0.15;
  }

  return { scene, world, library, streamer, interactables, anchors, shells, camps, player, avatar, marker, objective, grassPatches, lanterns, cloudLevel: CLOUD_LEVEL, update, setAnchorTicks, setPlazaSign };
}
