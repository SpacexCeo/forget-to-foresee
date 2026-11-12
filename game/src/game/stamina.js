// Stamina for the fight outside the town walls (owner 12.11): running drains it slowly, a dash takes a chunk, a strike
// a little; it refills after a short rest. At zero Iris is winded: no dash, and running slows to a walk until 20 % is
// back. Pure state machine; the HUD draws it (scenes/player-hud.js), boot-world.js feeds it and gates dash / run.

export const STAMINA = Object.freeze({
  max: 100,
  runDrain: 7,      // per second while running
  dash: 25,         // one dash
  strike: 4,        // one strike of the combo
  super: 12,        // a charged super strike
  regen: 30,        // per second once rested
  restDelay: 1.0,   // seconds without spending before it refills
  recoverAt: 20,    // winded until it is back to this
});

export function createStamina(o = STAMINA) {
  const s = { value: o.max, winded: false, rest: o.restDelay, lastUse: 0, flash: 0 };
  return {
    get value() { return s.value; },
    get ratio() { return s.value / o.max; },
    get winded() { return s.winded; },
    /** Seconds since stamina was last spent or regained to full (the HUD hides a full, idle bar). */
    get idle() { return s.lastUse; },
    /** A refused action flashes the bar for a moment (0..1). */
    get flash() { return s.flash; },
    /** May she run this frame? (winded: no) */
    canRun: () => !s.winded,
    /** Spend `n`; returns false (and flashes) when winded or short. */
    spend(n) {
      if (s.winded || s.value < Math.min(n, o.max)) { s.flash = 1; return false; }
      s.value = Math.max(0, s.value - n); s.rest = 0; s.lastUse = 0;
      if (s.value <= 0) s.winded = true;
      return true;
    },
    /** Per frame: `running` = actually running (moving with the run flag). */
    update(dt, { running = false } = {}) {
      s.flash = Math.max(0, s.flash - dt * 2.5);
      if (running && !s.winded) {
        s.value = Math.max(0, s.value - o.runDrain * dt); s.rest = 0; s.lastUse = 0;
        if (s.value <= 0) s.winded = true;
        return;
      }
      s.rest += dt;
      if (s.rest >= o.restDelay && s.value < o.max) { s.value = Math.min(o.max, s.value + o.regen * dt); s.lastUse = 0; }
      else s.lastUse += dt;
      if (s.winded && s.value >= o.recoverAt) s.winded = false;
    },
    reset() { s.value = o.max; s.winded = false; s.rest = o.restDelay; s.lastUse = 0; s.flash = 0; },
  };
}
