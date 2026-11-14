// The town map on M (owner 14.11: "redraw the map"): the painted map (GPT, docs/art/requests/in/map, shipped as
// assets/ui/map/town_map_{1024,2048}.webp) under live marks. The painting is not a survey, so it is calibrated to the
// town's real layout with a few landmarks (the lower gate, the altar plaza, the street square, the side walls): one
// least-squares line per axis maps town-local metres to the picture's 0..1 coordinates. Pure; the window is
// play/town-map-ui.js.

/** Landmarks seen both in the town data (town-local metres) and on the painting (0..1 of the picture). */
export const MAP_CALIBRATION = Object.freeze({
  x: Object.freeze([[0, 0.39], [0, 0.40], [-53, 0.07], [53, 0.68], [-12.8, 0.32], [12.8, 0.47]]), // the gate, the plaza fire, the walls, the shop doors
  z: Object.freeze([[33, 0.80], [-11, 0.19], [8, 0.45], [24.8, 0.70]]), // the lower gate, the altar, the street square, the Gate-Loom
});

/** A least-squares line v = a·m + b through [m, v] pairs. Pure. */
export function fitLine(pairs) {
  const n = pairs.length;
  let sm = 0, sv = 0, smm = 0, smv = 0;
  for (const [m, v] of pairs) { sm += m; sv += v; smm += m * m; smv += m * v; }
  const d = n * smm - sm * sm;
  const a = d ? (n * smv - sm * sv) / d : 0;
  return { a, b: (sv - a * sm) / n };
}

const FX = fitLine(MAP_CALIBRATION.x), FZ = fitLine(MAP_CALIBRATION.z);

/** Town-local [x, y, z] (metres) to the picture's [u, v] (0..1, v down); `clamp` keeps it inside a margin. Pure. */
export function toMap(local, { clamp = false, margin = 0.04 } = {}) {
  let u = FX.a * local[0] + FX.b, v = FZ.a * local[2] + FZ.b;
  if (clamp) { u = Math.min(1 - margin, Math.max(margin, u)); v = Math.min(1 - margin, Math.max(margin, v)); }
  return [u, v];
}

/**
 * The heading arrow's CSS rotation (degrees, clockwise from up) for a heading (radians, atan2(x, z) as player.heading).
 * On the picture +x is right and +z is down, with the axes scaled differently. Pure.
 */
export function headingDeg(heading) {
  const dx = Math.sin(heading) * FX.a, dy = Math.cos(heading) * FZ.a;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** Whether a town-local point is on the painting's town (inside the walls); beyond the lower gate is the hillside. */
export const onTownMap = (local) => local[2] <= 34 && Math.abs(local[0]) <= 56;

/** The fixed places on the map: id, badge (assets/ui/map/mark_<badge>.webp) or null, town-local position. */
export const MAP_PLACES = Object.freeze([
  Object.freeze({ id: 'altar', badge: 'altar', at: [0, 4.5, -11] }),
  Object.freeze({ id: 'portal', badge: 'portal', at: [4.4, 0, 24.8] }),
  Object.freeze({ id: 'exchange', badge: 'shop', at: [12.8, 4.5, -9.4] }),
  Object.freeze({ id: 'scribe', badge: 'shop', at: [-12.8, 4.5, -9.0] }),
  Object.freeze({ id: 'inn', badge: 'shop', at: [-9.6, 2.5, 8.6] }),
  Object.freeze({ id: 'board', badge: 'board', at: [1.6, 2.5, 4.0] }),
  Object.freeze({ id: 'gate', badge: null, at: [0, 0, 33] }),
  Object.freeze({ id: 'hillside', badge: 'monsters', at: [0, 0, 44] }),
]);
/** Painted places with no game object of their own: labels at their place on the picture. */
export const MAP_DECOR = Object.freeze([
  Object.freeze({ id: 'lookout', uv: [0.85, 0.12] }),
  Object.freeze({ id: 'terraces', uv: [0.80, 0.56] }),
]);
/** The legend, in order: id and badge (null: drawn in CSS). */
export const MAP_LEGEND = Object.freeze([
  ['you', null], ['offer', 'quest_offer'], ['turnin', 'quest_turnin'], ['shop', 'shop'], ['board', 'board'],
  ['portal', 'portal'], ['altar', 'altar'], ['monsters', 'monsters'], ['chest', 'chest'],
]);
/** Every locale key the map uses. */
export const MAP_KEYS = Object.freeze([
  'tmap.title', 'tmap.hint', 'tmap.close', 'tmap.zoomIn', 'tmap.zoomOut', 'tmap.reset', 'tmap.legend', 'tmap.outside',
  ...MAP_PLACES.map((p) => 'tmap.place.' + p.id), ...MAP_DECOR.map((p) => 'tmap.place.' + p.id), ...MAP_LEGEND.map(([id]) => 'tmap.key.' + id),
]);
/** A zoom step kept in range. Pure. */
export const zoomStep = (z, dir, min = 1, max = 3) => Math.min(max, Math.max(min, Math.round(z * (dir > 0 ? 1.25 : 0.8) * 100) / 100));
