// The island diorama scene (docs/art/brief.md, owner concept 07.11): terrain, central plaza with the
// Scroll table, six camps on the hexagonal ring, four anchor zones on the diagonals with a floating
// Shell above each, sea and pale haze. Every catalog object is a PropInstance: greybox first, real
// art when its .glb streams in. No game rules here: the demo values on the anchor pads are labels.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CollisionWorld } from '../physics/collision.js';
import { CharacterController } from '../physics/character.js';
import { AssetLibrary, AssetStreamer, PropInstance } from '../render/assets.js';
import { PadDecals } from '../render/decals.js';
import { ROMAN } from '../render/asset-catalog.js';
import { CAMPS, ANCHOR_ZONES, SCROLL_TABLE, SHARD, SPAWN, SHELL_FLOAT_HEIGHT, WATER_LEVEL, shellHover } from './layout.js';

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
  scene.fog = new THREE.Fog(HAZE, 45, 190);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xe3ebe8, 0x55625a, 1.2);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(28, 46, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 5, far: 140 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  const sea = new THREE.Mesh(new THREE.CircleGeometry(320, 64), new THREE.MeshStandardMaterial({ color: 0x86a0a2, roughness: 0.3, metalness: 0.05 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = WATER_LEVEL; sea.receiveShadow = true; sea.name = 'sea';
  scene.add(sea);

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
    if (c.id !== 'iris') interactables.push({ label: c.label, verb: 'Talk to', position: new THREE.Vector3(...c.position), radius: 4.2, inspect: false });
  }

  const anchors = [], shells = [];
  const mistTex = mistTexture();
  for (const z of ANCHOR_ZONES) {
    const restYaw = -((z.angle * Math.PI) / 180);
    const shellInst = place(z.shellAsset, [z.position[0], SHELL_FLOAT_HEIGHT, z.position[2]], restYaw);
    // Soft mist under the levitating Shell: a ground layer and a camera-facing haze.
    const mistDisc = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.5, depthWrite: false }));
    mistDisc.rotation.x = -Math.PI / 2; mistDisc.position.set(z.position[0], 1.2, z.position[2]); mistDisc.name = 'shell_mist_disc';
    const mistHaze = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.3, depthWrite: false }));
    mistHaze.scale.set(15, 7, 1); mistHaze.position.set(z.position[0], 4, z.position[2]); mistHaze.name = 'shell_mist_haze';
    scene.add(mistDisc, mistHaze);
    shells.push({ instance: shellInst, restYaw, index: z.index, mistDisc });
    const a = place('anchor', z.anchorPosition, z.anchorRotationY);
    // Demo label values only: the room snapshot will drive the real Shell number and tick.
    const decals = new PadDecals(a, { shell_number: ROMAN[z.index], tick: String(3 + z.index * 2) });
    anchors.push({ instance: a, decals, zone: z });
    interactables.push({ label: 'Anchor (Shell ' + ROMAN[z.index] + ')', verb: 'Inspect', instance: a, position: new THREE.Vector3(...z.anchorPosition), radius: 2.2, inspect: true });
  }

  // Shard on a pedestal at the Iris camp. The pedestal is scene dressing with its own collider.
  const [sx, , sz] = SHARD.position, [pw, ph, pd] = SHARD.pedestal.size;
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), new THREE.MeshStandardMaterial({ color: 0x7d8781, roughness: 0.9 }));
  pedestal.position.set(sx, ph / 2, sz); pedestal.castShadow = true; pedestal.receiveShadow = true; pedestal.name = 'shard_pedestal';
  scene.add(pedestal);
  world.addBox('shard_pedestal', [sx - pw / 2, 0, sz - pd / 2], [sx + pw / 2, ph, sz + pd / 2]);
  const shard = place('shard', SHARD.position);
  interactables.push({ label: 'Memory shard', verb: 'Inspect', instance: shard, position: new THREE.Vector3(sx, 0, sz), radius: 1.8, inspect: true });

  const player = new CharacterController(world, { spawn: SPAWN });
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
      s.instance.root.position.y = SHELL_FLOAT_HEIGHT + h.dy;
      s.instance.root.rotation.y = s.restYaw + h.yaw;
      s.mistDisc.rotation.z = t * 0.02 + s.index;
    }
  }

  return { scene, world, library, streamer, interactables, anchors, player, avatar, marker, sun, objective, update };
}
