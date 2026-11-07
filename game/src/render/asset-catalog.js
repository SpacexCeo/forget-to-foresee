// Asset catalog and glTF node naming conventions (docs/art/brief.md). Pure data and string
// rules, no three.js, so the conventions are covered by node tests.
//
// Node conventions inside one .glb:
//   <name>            runtime mesh(es), always rendered when the asset is loaded
//   <name>_inspect    close-inspection mesh, shown instead of the runtime mesh when the camera is close
//   *_col             collision meshes, never rendered, extracted into the physics world
//   socket_*          empties for code-drawn content (e.g. the anchor's Shell number and tick pads);
//                     glTF extras arrive in userData (e.g. pad_size_m: [w, h], outward_normal_gltf)

/** Exact filenames the code looks up in /assets/models/ (brief "Slice object list"). */
export const ASSETS = Object.freeze([
  { name: 'anchor', kind: 'hero', label: 'Anchor', height: 1.6, radius: 0.9, inspectDistance: 5 },
  { name: 'scroll_table', kind: 'hero', label: 'Scroll table', height: 1.0, radius: 1.8, inspectDistance: 7 },
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
  { name: 'island', kind: 'terrain', label: 'Island', height: 4, radius: 50 },
]);

/** Load distance (meters from the camera to the bounding sphere surface) per kind, when on screen. */
export const LOAD_DISTANCE = Object.freeze({ hero: 70, camp: 110, shell: 260, interior: 60, terrain: 400 });

/** Doubled brief budgets (docs/decisions.md 07.11): runtime / _inspect triangles per asset kind. */
export const TRIANGLE_BUDGET = Object.freeze({
  hero: { runtime: 16000, inspect: 60000 },
  shell: { runtime: 30000 },
  interior: { runtime: 160000 },
  camp: { runtime: 24000 },
  terrain: { runtime: 120000 },
});

export const assetByName = (name) => ASSETS.find((a) => a.name === name) || null;

/** Model names accepted by URLs and the review page: lowercase letters, digits, underscore. */
export function isValidModelName(name) {
  return typeof name === 'string' && /^[a-z0-9_]{1,64}$/.test(name);
}

/** URL of a model by exact name; throws on anything outside [a-z0-9_]. */
export function modelUrl(name, base = '/') {
  if (!isValidModelName(name)) throw new Error('invalid model name: ' + JSON.stringify(name));
  return base + 'assets/models/' + name + '.glb';
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
