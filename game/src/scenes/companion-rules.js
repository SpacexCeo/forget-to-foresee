// The dragon companion's numbers and its keep-out rule (pure: no renderer; scenes/companion.js flies by them).
export const COMPANION = Object.freeze({
  height: 1.85, side: 1.15, back: -0.25, stiffness: 3.2, scale: 1.35, // beside her shoulder, a touch ahead: in frame from the follow camera
  keepOut: 0.8, // m around her axis the dragon's centre never enters (below the top of her head)
  perchAfter: 14, perchSide: 0.95, perchHeight: 0.11, // seconds of her standing still before it lands; where it sits
  cheerEvery: 2.2, // s between flourishes at most
  bob: 0.12, bobCalm: 0.03, // m of body bob in the hover; under reduced motion
  glow: { radius: 0.8, shrink: 0.5, full: 2.4, opacity: 0.7 }, // the light on the ground under it: m at ground level, share lost at `full` m up
  motes: { desktop: 7, phone: 3, life: 1.7, fall: 0.32, spread: 0.16, size: 0.1 }, // slow sparks drifting down from the belly
  tint: { nacre: 0xfff0d8, rill: 0x59ebdc, cinder: 0xffad40 },
});
/** The ground light under a hovering dragon: {radius m, opacity} for its height above the ground (pure). */
export function glowAt(height, sitting = false, g = COMPANION.glow) {
  if (sitting) return { radius: g.radius * 0.5, opacity: 0 };
  const k = Math.min(1, Math.max(0, height / g.full));
  return { radius: g.radius * (1 - g.shrink * k), opacity: g.opacity * (1 - 0.6 * k) };
}
/**
 * Keeps `pos` out of a vertical cylinder around the heroine (pure; exported for the tests).
 * @param {{x:number,y:number,z:number}} pos  mutated
 * @param {{x:number,y:number,z:number}} hero her feet
 */
export function keepClear(pos, hero, radius = COMPANION.keepOut, top = 1.95) {
  if (pos.y > hero.y + top) return pos;
  const dx = pos.x - hero.x, dz = pos.z - hero.z, d = Math.hypot(dx, dz);
  if (d >= radius) return pos;
  if (d < 1e-4) { pos.x = hero.x + radius; return pos; }
  pos.x = hero.x + (dx / d) * radius; pos.z = hero.z + (dz / d) * radius;
  return pos;
}
