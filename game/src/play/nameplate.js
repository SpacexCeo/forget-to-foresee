// Screen-space nameplates over the clan agents (owner feedback 08.11: the old canvas sprite floated in
// the scene like a debug label, clipped into scenery and covered the head). agents.js draws the plates
// as DOM elements projected from the head point every frame; the placement math lives here, pure and
// node-tested: fade with distance, a slight shrink, and no plate when the head is behind the camera or
// off screen.

export const NAMEPLATE = Object.freeze({
  headY: 2.05,   // metres above the agent's feet: just over the hood, so the plate never covers the face
  lift: 10,      // CSS px between the head point and the plate's bottom edge
  near: 30,      // metres: full opacity up to here (the third-person camera sits 20–30 m from the agents)
  far: 60,       // metres: invisible from here on
  margin: -48,   // CSS px: the head point must be this far inside the viewport, so a plate is never cut by the edge or parked under a HUD corner
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Opacity 0..1 by camera distance: 1 within `near`, linear to 0 at `far`. */
export function plateOpacity(d, p = NAMEPLATE) {
  if (!(d >= 0)) return 0;
  if (d <= p.near) return 1;
  if (d >= p.far) return 0;
  return 1 - (d - p.near) / (p.far - p.near);
}

/** Scale 1 → .8 across the fade band, so distant plates read smaller without shrinking into the character. */
export function plateScale(d, p = NAMEPLATE) {
  if (!(d >= 0)) return 1;
  return clamp(1 - 0.2 * ((d - p.near) / (p.far - p.near)), 0.8, 1);
}

/**
 * NDC (x, y in -1..1; z < 1 in front of the camera) → CSS px in a `width`×`height` viewport.
 * Returns null behind the camera or outside the viewport shrunk by `-margin` px (a negative margin keeps
 * plates clear of the edges; a positive one would allow them slightly outside).
 */
export function platePosition(ndc, width, height, margin = NAMEPLATE.margin) {
  if (!ndc || !(width > 0) || !(height > 0)) return null;
  if (!(ndc.z < 1) || !(ndc.z > -1)) return null;
  const x = ((ndc.x + 1) / 2) * width;
  const y = ((1 - ndc.y) / 2) * height;
  if (x < -margin || x > width + margin || y < -margin || y > height + margin) return null;
  return { x, y };
}

/**
 * Everything the DOM needs for one plate in one call: null hides it.
 * @param {{ndc: {x:number,y:number,z:number}, distance: number, width: number, height: number, hidden?: boolean}} a
 */
export function platePlacement({ ndc, distance, width, height, hidden = false }, p = NAMEPLATE) {
  if (hidden) return null;
  const opacity = plateOpacity(distance, p);
  if (opacity <= 0.02) return null;
  const pos = platePosition(ndc, width, height, p.margin);
  if (!pos) return null;
  return { x: Math.round(pos.x), y: Math.round(pos.y - p.lift), opacity: Math.round(opacity * 100) / 100, scale: Math.round(plateScale(distance, p) * 100) / 100 };
}
