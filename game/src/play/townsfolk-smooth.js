// What the player sees of a townsperson never jumps (owner P0: no jitter, popping or teleporting in town). The plan
// (townsfolk-plan.js) and the grounding (townsfolk.js) may move a body's target in steps: the seat offset when someone
// sits down or stands up, a side step pulled back onto the path when it would leave the ground, a ground height that
// changes stair by stair. The shown position follows the target exactly while it moves continuously; a step larger than
// the walk could cover is absorbed into an offset that fades out in a fraction of a second, so the body glides instead
// of popping. A real relocation (a visitor sent home, more than SNAP metres) still moves at once. Pure, no three.js.

/** Metres: a target jump beyond this is a relocation, shown at once. */
export const SNAP = 2.5;
/** 1/s: how fast an absorbed jump fades (horizontal, vertical). */
export const RATE_XZ = 9, RATE_Y = 14;
/** Metres a target may move in one frame beyond what its speed explains before it counts as a jump. */
export const SLACK = 0.03;

/** A fresh state (nothing shown yet). */
export function smoothState() { return { has: false, tx: 0, ty: 0, tz: 0, ox: 0, oy: 0, oz: 0, x: 0, y: 0, z: 0 }; }

/**
 * One frame: the target (tx, ty, tz) the body should stand at, its own speed (m/s) and dt. Writes and returns the shown
 * position st.x/y/z.
 */
export function smoothStep(st, tx, ty, tz, speed, dt) {
  if (!st.has) { st.has = true; st.ox = st.oy = st.oz = 0; }
  else {
    const jx = tx - st.tx, jz = tz - st.tz, jy = ty - st.ty, d = Math.hypot(jx, jz), reach = Math.max(0, speed) * dt + SLACK;
    if (d > SNAP || Math.abs(jy) > SNAP) { st.ox = st.oy = st.oz = 0; }
    else {
      // the part of the move the walk does not explain stays where it was shown and fades out
      if (d > reach) { const k = (d - reach) / d; st.ox -= jx * k; st.oz -= jz * k; }
      if (Math.abs(jy) > SLACK) st.oy -= jy;
      const ax = Math.exp(-dt * RATE_XZ), ay = Math.exp(-dt * RATE_Y);
      st.ox *= ax; st.oz *= ax; st.oy *= ay;
      if (Math.abs(st.ox) < 1e-4) st.ox = 0; if (Math.abs(st.oz) < 1e-4) st.oz = 0; if (Math.abs(st.oy) < 1e-4) st.oy = 0;
    }
  }
  st.tx = tx; st.ty = ty; st.tz = tz;
  st.x = tx + st.ox; st.y = ty + st.oy; st.z = tz + st.oz;
  return st;
}
