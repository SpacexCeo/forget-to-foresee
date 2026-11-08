// The island map model (owner feedback 08.11: place names belong on a map, not on labels floating
// in the 3D world). Pure data built from the world layout (scenes/layout.js), the room's named
// places (net/world-map.js) and the observation: platforms, bridges, the Scroll, the six camps, the
// four anchor zones and Shells with their hub state, Iris, the current goal and the other agents,
// all projected to a square top-down drawing. map-ui.js renders it; node tests check it.
// Orientation: the default camera looks from +Z toward the centre, so +Z is the bottom of the map
// and +X its right (the Moss camp sits at the bottom, Iris's camp at the top).
import {
  CAMPS, ANCHOR_ZONES, ANCHOR_ZONE_RADIUS, SCROLL_TABLE, SHARD, BALCONY_CENTER, platforms, bridges,
} from '../scenes/layout.js';
import { placePosition } from '../net/world-map.js';
import { openSignsByShell } from './hub.js';
import { CLAN_ASSET } from './behaviour.js';

/** Metres from the island centre to the map edge (the Shells hang at r = 50–54). */
export const MAP_EXTENT = 62;
/** Side of the square drawing in SVG user units. */
export const MAP_SIZE = 400;
/** Drawn radius of a Shell disc (the coil is about 12 m across). */
export const SHELL_DRAW_RADIUS = 6;
export const ROMAN = Object.freeze(['I', 'II', 'III', 'IV']);

const ASSET_CLAN = Object.freeze(Object.fromEntries(Object.entries(CLAN_ASSET).map(([clan, asset]) => [asset, clan])));
const r2 = (v) => Math.round(v * 100) / 100;

/** Metres → map units (a length). */
export const scaleLength = (m) => r2((m / MAP_EXTENT) * (MAP_SIZE / 2));
/** World ground position [x, y, z] → map point [u, v] (u right, v down). */
export function project(position) {
  const [x, , z] = position;
  return [r2(MAP_SIZE / 2 + (x / MAP_EXTENT) * (MAP_SIZE / 2)), r2(MAP_SIZE / 2 + (z / MAP_EXTENT) * (MAP_SIZE / 2))];
}

/**
 * Static drawing geometry in map units: walkable discs, bridge decks, the plaza's anchor rings and
 * the four Shell discs.
 */
export function mapGeometry() {
  return {
    platforms: platforms().map((p) => ({ id: p.id, center: project(p.center), r: scaleLength(p.radius) })),
    bridges: bridges().map((b) => ({ id: b.id, from: project(b.from), to: project(b.to), width: Math.max(2, scaleLength(b.width)) })),
    anchors: ANCHOR_ZONES.map((z) => ({ shell: z.shell, center: project(z.position), r: scaleLength(ANCHOR_ZONE_RADIUS) })),
    shells: ANCHOR_ZONES.map((z) => ({ shell: z.shell, center: project(z.shellPosition), r: scaleLength(SHELL_DRAW_RADIUS) })),
    scroll: { center: project(SCROLL_TABLE.position), r: scaleLength(3.6) },
  };
}

/**
 * Named places on the map: {id, kind, position (world), point (map), route, labelKey, labelArgs}.
 * `route` is the room place a click walks to (`walkTo`), or `shell:<n>` for a flight in the hub.
 */
export function mapPlaces() {
  const out = [
    { id: 'scroll', kind: 'scroll', position: SCROLL_TABLE.position.slice(), route: 'scroll', labelKey: 'map.scroll', labelArgs: {} },
    { id: 'balcony', kind: 'balcony', position: BALCONY_CENTER.slice(), route: 'balcony', labelKey: 'map.balcony', labelArgs: {} },
    { id: 'pedestal', kind: 'pedestal', position: [SHARD.position[0], 0, SHARD.position[2]], route: 'shard_pedestal', labelKey: 'map.pedestal', labelArgs: {} },
  ];
  for (const c of CAMPS) {
    const clan = ASSET_CLAN[c.id];
    out.push({ id: 'camp:' + clan, kind: 'camp', clan, color: c.color, position: c.position.slice(), route: 'camp:' + clan, labelKey: 'agent.' + clan, labelArgs: {} });
  }
  for (const z of ANCHOR_ZONES) {
    out.push({ id: 'anchor:' + z.shell, kind: 'anchor', shell: z.shell, position: z.position.slice(), route: 'anchor_zone:' + z.shell, labelKey: 'map.anchor', labelArgs: { shell: ROMAN[z.shell - 1] } });
  }
  for (const z of ANCHOR_ZONES) {
    out.push({ id: 'shell:' + z.shell, kind: 'shell', shell: z.shell, position: z.shellPosition.slice(), route: 'shell:' + z.shell, labelKey: 'map.shell', labelArgs: { shell: ROMAN[z.shell - 1] } });
  }
  for (const p of out) p.point = project(p.position);
  return out;
}

export function placeById(id) { return mapPlaces().find((p) => p.id === id) || null; }

/**
 * Per Shell: `quiet` (no sign for it), `waiting` (signs Iris reads for it), `inside` (Iris is in it),
 * plus the trials Iris staked there. Works on any observation (hub or walking play).
 */
export function shellStates(obs) {
  const by = obs ? openSignsByShell(obs) : null; // only signs that can still pay (QA-007)
  const inside = obs && obs.you && obs.you.zone === 'shell' ? obs.you.shell : null;
  const anchors = (obs && obs.iris && obs.iris.anchors) || [];
  return [1, 2, 3, 4].map((n) => {
    const signs = by ? by.get(n).length : 0;
    return { shell: n, signs, anchors: anchors.filter((a) => a.shell === n).map((a) => a.tick).sort((a, b) => a - b), state: inside === n ? 'inside' : signs ? 'waiting' : 'quiet' };
  });
}

/**
 * What a click on a place does: {kind: 'walk', place} (the room's walk graph), {kind: 'fly', shell}
 * (the hub's flight) or null when nothing sensible can happen from where Iris is.
 * Inside a Shell only another Shell is reachable (the hub flies; walking play leaves through E first).
 */
export function routeFor(placeId, { hub = false, zone = 'island', shell = null } = {}) {
  const p = placeById(placeId);
  if (!p) return null;
  if (p.kind === 'shell') {
    if (hub) return zone === 'shell' && shell === p.shell ? null : { kind: 'fly', shell: p.shell };
    return zone === 'shell' ? null : { kind: 'walk', place: 'anchor_zone:' + p.shell };
  }
  if (zone === 'shell') return null;
  return { kind: 'walk', place: p.route };
}

/** Where the current goal points on the map: {point, placeId} or null (goals without a place). */
export function goalMarker(goal) {
  const target = goal && goal.target;
  if (!target) return null;
  if (target.startsWith('shell:')) { const p = placeById(target); return p ? { point: p.point, placeId: p.id } : null; }
  const dest = placePosition(target);
  if (!dest || dest.zone !== 'island') return null;
  const pos = dest.target || dest.position;
  const place = mapPlaces().find((p) => p.route === target);
  return { point: project(pos), placeId: place ? place.id : null };
}

/**
 * Iris on the map. Heading 0 faces +Z (character.js), i.e. straight down the map; the arrow art
 * points up, so the SVG rotation (clockwise, degrees) is 180 − heading.
 */
export function irisMarker(position, heading = 0) {
  return { point: project(position), angle: r2(((180 - (heading * 180) / Math.PI) % 360 + 360) % 360) };
}

/**
 * The whole view model for one render.
 * @param {{obs: object|null, hub?: boolean, zone?: 'island'|'shell', playerPos?: number[], heading?: number,
 *          goal?: object|null, agents?: {clan: string, position: number[]}[]}} o
 */
export function buildMapModel({ obs, hub = false, zone = 'island', playerPos = null, heading = 0, goal = null, agents = [] }) {
  const shells = shellStates(obs);
  const insideShell = zone === 'shell' ? (obs && obs.you && obs.you.shell) || null : null;
  const places = mapPlaces().map((p) => {
    const st = p.kind === 'shell' ? shells[p.shell - 1] : null;
    return { ...p, shellState: st, route: routeFor(p.id, { hub, zone, shell: insideShell }) };
  });
  // Inside a Shell Iris stands in the Shell, not on the island: mark the Shell instead of a ground point.
  const iris = insideShell
    ? { point: placeById('shell:' + insideShell).point, angle: null, inside: insideShell }
    : playerPos ? { ...irisMarker(playerPos, heading), inside: null } : null;
  const campColor = Object.fromEntries(CAMPS.map((c) => [ASSET_CLAN[c.id], c.color]));
  return {
    geometry: mapGeometry(),
    places,
    shells,
    iris,
    goal: goalMarker(goal),
    agents: agents.filter((a) => a && a.position).map((a) => ({ clan: a.clan, point: project(a.position), color: campColor[a.clan] ?? 0xd6dcd8 })),
    hub,
    zone,
  };
}
