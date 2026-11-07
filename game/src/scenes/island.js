// The island scene: a floating archipelago above a sea of clouds (owner concept 07.11, third image).
// Plaza plateau with the Scroll medallion and four anchor zones, six camp plateaus joined by railed
// bridges, a viewing balcony where the player starts, four levitating Shells, a hovering glyph.
// Every catalog object is a PropInstance: greybox first, real art when its .glb streams in.
// No game rules here: the values on the anchor pads are demo labels.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CollisionWorld } from '../physics/collision.js';
import { CharacterController } from '../physics/character.js';
import { AssetLibrary, AssetStreamer, PropInstance } from '../render/assets.js';
import { PadDecals } from '../render/decals.js';
import { ROMAN } from '../render/asset-catalog.js';
import { CAMPS, ANCHOR_ZONES, SCROLL_TABLE, SHARD, SPAWN, CLOUD_LEVEL, KILL_Y, WALK_SPEED, PLATEAU_RADIUS, shellHover } from './layout.js';

export const HAZE = 0xc9d3d0;

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d').createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#9fb2b3'); g.addColorStop(0.55, '#c9d3d0'); g.addColorStop(1, '#dfe4df');
  const ctx = c.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial mist texture (white center fading to transparent). */
function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(236, 240, 237, 0.85)'); g.addColorStop(0.5, 'rgba(226, 232, 229, 0.35)'); g.addColorStop(1, 'rgba(220, 226, 223, 0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tileable soft cloud texture (random blurred blobs). */
function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c9d1ce'; ctx.fillRect(0, 0, 256, 256);
  let s = 11;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = 18 + rnd() * 46;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, 'rgba(250, 252, 250, 0.55)'); g.addColorStop(1, 'rgba(250, 252, 250, 0)');
      ctx.fillStyle = g; ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Code-drawn glyph hovering above the plaza (the logogram itself comes with the language UI). */
function glyphObject() {
  const g = new THREE.Group();
  g.name = 'plaza_glyph';
  const mat = new THREE.MeshStandardMaterial({ color: 0xe9e4d2, emissive: 0x6a5a2a, roughness: 0.4, metalness: 0.2 });
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
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.05, 4, 12), new THREE.MeshStandardMaterial({ color: 0x8a6fc4, roughness: 0.6 }));
  body.position.y = 0.875; body.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.12), new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0x6a4a10, roughness: 0.4 }));
  visor.position.set(0, 1.45, 0.3);
  g.add(body, visor);
  return g;
}

export function createIslandScene(renderer, camera) {
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  // Distance fog here; height fog (dense over the sea, thin on high ground) comes from render/fog.js.
  scene.fog = new THREE.Fog(HAZE, 70, 280);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xe3ebe8, 0x55625a, 1.2);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(28, 46, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 5, far: 160 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  // Sea of clouds below the archipelago; the height fog thickens toward it.
  const cloudTex = cloudTexture();
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.repeat.set(10, 10);
  const clouds = new THREE.Mesh(new THREE.CircleGeometry(420, 48), new THREE.MeshLambertMaterial({ color: 0xe6ebe8, map: cloudTex }));
  clouds.rotation.x = -Math.PI / 2; clouds.position.y = CLOUD_LEVEL; clouds.name = 'cloud_sea';
  scene.add(clouds);

  const world = new CollisionWorld({ cellSize: 2 });
  const library = new AssetLibrary();
  const streamer = new AssetStreamer({ library, camera });
  const place = (name, position, rotationY = 0) => streamer.add(new PropInstance({ name, scene, world, position, rotationY }));
  const interactables = [];

  place('island', [0, 0, 0]);
  const table = place('scroll_table', SCROLL_TABLE.position);
  interactables.push({ label: 'Scroll table', verb: 'Inspect', instance: table, position: new THREE.Vector3(...SCROLL_TABLE.position), radius: 3.2, inspect: true });

  for (const c of CAMPS) {
    place(c.asset, c.position, c.rotationY);
    if (c.id !== 'iris') interactables.push({ label: c.label, verb: 'Talk to', position: new THREE.Vector3(...c.position), radius: PLATEAU_RADIUS - 1, inspect: false });
  }

  const anchors = [], shells = [];
  const mistTex = mistTexture();
  for (const z of ANCHOR_ZONES) {
    const [shx, shy, shz] = z.shellPosition;
    const shellInst = place(z.shellAsset, z.shellPosition, z.shellRotationY);
    // Soft mist under the levitating Shell: a drifting layer and a camera-facing haze.
    const mistDisc = new THREE.Mesh(new THREE.CircleGeometry(10, 32), new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.45, depthWrite: false }));
    mistDisc.rotation.x = -Math.PI / 2; mistDisc.position.set(shx, shy - 2.5, shz); mistDisc.name = 'shell_mist_disc';
    const mistHaze = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.3, depthWrite: false }));
    mistHaze.scale.set(18, 8, 1); mistHaze.position.set(shx, shy - 1, shz); mistHaze.name = 'shell_mist_haze';
    scene.add(mistDisc, mistHaze);
    shells.push({ instance: shellInst, restY: shy, restYaw: z.shellRotationY, index: z.index, mistDisc });
    const a = place('anchor', z.anchorPosition, z.anchorRotationY);
    // Demo label values only: the room snapshot will drive the real Shell number and tick.
    const decals = new PadDecals(a, { shell_number: ROMAN[z.index], tick: String(3 + z.index * 2) });
    anchors.push({ instance: a, decals, zone: z });
    interactables.push({ label: 'Anchor (Shell ' + ROMAN[z.index] + ')', verb: 'Inspect', instance: a, position: new THREE.Vector3(...z.anchorPosition), radius: 1.8, inspect: true });
  }

  const glyph = glyphObject();
  glyph.position.set(0, 9, 0);
  scene.add(glyph);

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
  marker.rotation.x = -Math.PI / 2; marker.visible = false; marker.name = 'move_marker';
  scene.add(marker);

  // Objective text shown top-left; the game UI step will drive it from the season state.
  const objective = 'Explore the island';
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

  return { scene, world, library, streamer, interactables, anchors, player, avatar, marker, sun, objective, update };
}
