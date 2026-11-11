// Asset catalog and glTF node naming conventions (docs/art/brief.md). Pure data and string
// rules, no three.js, so the conventions are covered by node tests.
//
// Node conventions inside one .glb:
//   <name>            runtime mesh(es), always rendered when the asset is loaded
//   <name>_inspect    close-inspection mesh, shown instead of the runtime mesh when the camera is close
//   *_col             collision meshes, never rendered, extracted into the physics world
//   socket_*          empties for code-drawn content (e.g. the anchor's Shell number and tick pads);
//                     glTF extras arrive in userData (e.g. pad_size_m: [w, h], outward_normal_gltf)
import { TOWN_DATA } from '../scenes/town-data.js';

/** Exact filenames the code looks up in /assets/models/ (brief "Slice object list"). */
export const ASSETS = Object.freeze([
  { name: 'anchor', kind: 'hero', label: 'Anchor', height: 1.6, radius: 0.9, inspectDistance: 5 },
  { name: 'scroll_table', kind: 'hero', label: 'Scroll table', height: 0.6, radius: 3.7, inspectDistance: 9 },
  { name: 'shard', kind: 'hero', label: 'Memory shard', height: 0.4, radius: 0.3, inspectDistance: 3 },
  { name: 'shell_1', kind: 'shell', label: 'Shell I', height: 18, radius: 10 },
  { name: 'shell_2', kind: 'shell', label: 'Shell II', height: 18, radius: 10 },
  { name: 'shell_3', kind: 'shell', label: 'Shell III', height: 18, radius: 10 },
  { name: 'shell_4', kind: 'shell', label: 'Shell IV', height: 18, radius: 10 },
  { name: 'shell_interior', kind: 'interior', label: 'Shell interior', height: 14, radius: 13 },
  { name: 'camp_iris', kind: 'camp', label: 'Camp: Iris', height: 3, radius: 5.7 },
  { name: 'camp_sol', kind: 'camp', label: 'Camp: Salt', height: 3, radius: 5.7 },
  { name: 'camp_pepel', kind: 'camp', label: 'Camp: Ash', height: 3, radius: 5.7 },
  { name: 'camp_moh', kind: 'camp', label: 'Camp: Moss', height: 3, radius: 5.7 },
  { name: 'camp_yantar', kind: 'camp', label: 'Camp: Amber', height: 3, radius: 5.7 },
  { name: 'camp_iney', kind: 'camp', label: 'Camp: Frost', height: 3, radius: 5.7 },
  { name: 'island', kind: 'terrain', label: 'Island', height: 4, radius: 75 },
]);

/**
 * Playable heroines. `model` is the .glb in /assets/models/ (the phone variant adds `_m`), `sidecar` the clip
 * file in /assets/anim/. `toon`: cel-shaded materials, the ink outline is geometry inside the .glb.
 * `gate: 'nft'` marks a heroine meant for holders; the gate itself is not wired yet, `?hero=<id>` picks her.
 */
export const HEROES = Object.freeze([
  Object.freeze({ id: 'iris', label: 'Iris', model: 'agent_iris', sidecar: 'iris', toon: false, gate: null }),
  Object.freeze({ id: 'elise', label: 'Elise', model: 'agent_elise', sidecar: 'elise', toon: true, gate: 'nft' }),
]);

/** The heroine named by `?hero=<id>` (Iris when absent or unknown). */
export function heroFromSearch(search = typeof location !== 'undefined' ? location.search : '') {
  const id = new URLSearchParams(search || '').get('hero');
  return HEROES.find((h) => h.id === id) || HEROES[0];
}

const TOWN_LABELS = Object.freeze({ town_terrain: 'Town: terrain', town_block: 'Town: block', town_hero: 'Town: hero', town_sky: 'Town: sky' });
const townLabel = (p) => (p.name === 'town_altar' ? 'Tournament altar' : (TOWN_LABELS[p.kind] || 'Town') + ' (' + p.name.replace(/^town_/, '').replace(/_/g, ' ') + ')');

/**
 * The town on the ground (docs/town.md): one entry per piece of scenes/town-data.js, a .glb in the `town/`
 * subfolder. Town pieces have no greybox art (`noGreybox`): nothing is shown and nothing collides until the file
 * has streamed in. `centerOffset` / `radius` are the streaming bounds from the data (pivot -> bounding sphere).
 */
export const TOWN_ASSETS = Object.freeze(TOWN_DATA.pieces.map((p) => Object.freeze({
  name: p.name, kind: p.kind, label: townLabel(p), town: true, noGreybox: true,
  height: Math.max(1, 2 * (p.center[1] - p.position[1])), radius: p.radius,
  centerOffset: Object.freeze([p.center[0] - p.position[0], p.center[1] - p.position[1], p.center[2] - p.position[2]]),
  ...(p.kind === 'town_hero' ? { inspectDistance: 7 } : {}),
})));

/** Every asset the library knows: the archipelago slice list and the town pieces. */
export const ALL_ASSETS = Object.freeze([...ASSETS, ...TOWN_ASSETS]);

/** Load distance (meters from the camera to the bounding sphere surface) per kind, when on screen. */
export const LOAD_DISTANCE = Object.freeze({ hero: 70, camp: 110, shell: 260, interior: 60, terrain: 400, town_terrain: 400, town_block: 220, town_hero: 140, town_sky: 600 });

/** Doubled brief budgets (docs/decisions.md 07.11): runtime / _inspect triangles per asset kind. */
export const TRIANGLE_BUDGET = Object.freeze({
  hero: { runtime: 16000, inspect: 60000 },
  shell: { runtime: 30000 },
  interior: { runtime: 160000 },
  camp: { runtime: 24000 },
  terrain: { runtime: 120000 },
  town_terrain: { runtime: 120000 },
  town_block: { runtime: 120000 },
  town_hero: { runtime: 16000, inspect: 60000 },
  town_sky: { runtime: 20000 },
});

export const assetByName = (name) => ALL_ASSETS.find((a) => a.name === name) || null;

/** Model names accepted by URLs and the review page: lowercase letters, digits, underscore. */
export function isValidModelName(name) {
  return typeof name === 'string' && /^[a-z0-9_]{1,64}$/.test(name);
}

/** Subfolder of a model inside assets/models/: '' (flat) or one lowercase folder with a trailing slash ('town/'). */
export function isValidModelDir(dir) {
  return dir === '' || (typeof dir === 'string' && /^[a-z0-9_]{1,32}\/$/.test(dir));
}

/**
 * URL of a model by exact name; throws on anything outside [a-z0-9_].
 * @param {string} [dir] subfolder from the build's MODEL_DIRS (virtual:model-list), '' for the flat folder
 */
export function modelUrl(name, base = '/', dir = '') {
  if (!isValidModelName(name)) throw new Error('invalid model name: ' + JSON.stringify(name));
  dir = dir || '';
  if (!isValidModelDir(dir)) throw new Error('invalid model folder: ' + JSON.stringify(dir));
  // Hosts that do not serve .glb can ship the same bytes under another extension (build-time VITE_MODEL_EXT).
  const ext = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MODEL_EXT) || '.glb';
  return base + 'assets/models/' + dir + name + ext;
}

/**
 * The model URL with a cache key: the file's build-time byte size (?v=<bytes>). Hosts such as GitHub
 * Pages let browsers and phones keep a .glb for a while; a new build of a model has a new size, so the
 * new file is fetched instead of a stale copy (the owner's phone kept the old Iris after a deploy).
 */
export function versionedModelUrl(name, base = '/', bytes, dir = '') {
  const url = modelUrl(name, base, dir);
  return Number.isFinite(bytes) && bytes > 0 ? url + '?v=' + bytes : url;
}

// Blender may append ".001" to duplicate names; three.js strips the dot ("001").
const COL_RE = /_col(?:[._]?\d+)?$/;
const INSPECT_RE = /_inspect(?:[._]?\d+)?$/;
const SOCKET_RE = /^socket_/;

/** Classifies one node name: 'collision' | 'inspect' | 'socket' | 'runtime'. */
export function classifyNodeName(name) {
  const n = String(name || '');
  if (SOCKET_RE.test(n)) return 'socket';
  if (COL_RE.test(n)) return 'collision';
  if (INSPECT_RE.test(n)) return 'inspect';
  return 'runtime';
}

/**
 * Classifies a node by its own name and its ancestors' names (closest special name wins), so the
 * child primitives of a multi-material anchor_inspect mesh are still 'inspect'.
 * @param {string[]} path names from the asset root (exclusive) down to the node (inclusive)
 */
export function classifyPath(path) {
  for (let i = path.length - 1; i >= 0; i--) {
    const c = classifyNodeName(path[i]);
    if (c !== 'runtime') return c;
  }
  return 'runtime';
}

/** Role of a socket for code-drawn content, from its glTF extras or, failing that, its name. */
export function socketRole(name, extras = {}) {
  if (extras && typeof extras.socket === 'string') return extras.socket;
  const n = String(name || '');
  if (/^socket_shell/.test(n)) return 'shell_number';
  if (/^socket_tick/.test(n)) return 'tick';
  if (/^socket_beacon/.test(n)) return 'beacon';
  return n.replace(SOCKET_RE, '');
}

export const ROMAN = Object.freeze(['I', 'II', 'III', 'IV']);
