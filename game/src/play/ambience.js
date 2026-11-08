// Pure rules for the world's sound and effect presentation (no three.js, no WebAudio): footstep
// surfaces and cadence, the tension effect level, Shell hum positions, distance gain for the clan
// agents' steps. Wired into the frame loop by play/presentation.js; tested in tests/client/audio.test.mjs.
import { CAMPS, PLAZA_RADIUS, PLATEAU_RADIUS, BALCONY_CENTER, BALCONY, ANCHOR_ZONES } from '../scenes/layout.js';

/** Footstep groups of the audio manifest (`step_<surface>`). */
export const SURFACES = Object.freeze(['stone', 'wood', 'grass', 'glass', 'metal']);

/**
 * Surface under a ground position: the Shell interior is glass, camp plateaus are grass (the look-dev
 * grass patches cover them), the plaza and the balcony are stone, everything else is a bridge deck.
 */
export function surfaceAt(pos, zone = 'island') {
  if (zone === 'shell') return 'glass';
  const x = pos?.[0] ?? pos?.x ?? 0, z = pos?.[2] ?? pos?.z ?? 0;
  for (const c of CAMPS) if (Math.hypot(x - c.position[0], z - c.position[2]) <= PLATEAU_RADIUS) return 'grass';
  if (Math.hypot(x, z) <= PLAZA_RADIUS) return 'stone';
  if (Math.hypot(x - BALCONY_CENTER[0], z - BALCONY_CENTER[2]) <= BALCONY.size) return 'stone';
  return 'wood';
}

/** Step length in meters: the walk clip is authored for 1.7 m/s, the run clip for about 3.6 m/s. */
export const STEP_LENGTH = Object.freeze({ walk: 0.72, run: 1.1 });

/**
 * Distance-based footstep cadence for one walker. advance() returns how many steps fell in this frame
 * (0 or 1 at any sane frame rate; more only after a long hitch). The first step comes half a stride
 * after the walker starts, so a tap of the key still makes a sound; standing still resets the phase.
 */
export class StepMeter {
  constructor({ walk = STEP_LENGTH.walk, run = STEP_LENGTH.run, minSpeed = 0.3 } = {}) {
    this.walk = walk; this.run = run; this.minSpeed = minSpeed;
    this.phase = walk / 2; this.steps = 0;
  }
  reset() { this.phase = this.walk / 2; }
  advance(dt, speed, running = false) {
    if (!(speed >= this.minSpeed) || !(dt > 0)) { this.reset(); return 0; }
    const len = running ? this.run : this.walk;
    this.phase += speed * dt;
    let n = 0;
    while (this.phase >= len && n < 4) { this.phase -= len; n++; }
    if (this.phase >= len) this.phase = len / 2; // a huge hitch: do not fire a burst of steps later
    this.steps += n;
    return n;
  }
}

/**
 * Level of the `tension` effect (0..1) from the season tension (0..100). Calm seasons stay clean: nothing
 * below 10; the crisis band (tension 70-90 in the music mix) sits at 0.67-0.89, 100 is the Shells leaving.
 */
export function tensionLevel(H) {
  const h = Number.isFinite(+H) ? Math.min(100, Math.max(0, +H)) : 0;
  return h <= 10 ? 0 : Math.min(1, (h - 10) / 90);
}

/** Where each Shell hums: a little above its pivot (the pivot is the Shell's bottom), zone i <-> Shell i+1. */
export function humPositions() {
  return ANCHOR_ZONES.map((z) => [z.shellPosition[0], z.shellPosition[1] + 4, z.shellPosition[2]]);
}

/** Gain for a clan agent's footstep by distance to the listener: full within 6 m, silent beyond 30 m. */
export function npcStepGain(distance) {
  if (!(distance >= 0)) return 0;
  if (distance <= 6) return 0.8;
  if (distance >= 30) return 0;
  return 0.8 * (1 - (distance - 6) / 24);
}

/**
 * VFX tier for the look-dev state: phones (render profile `phone`, docs/mobile.md) always get the VFX `low`
 * preset (no lights, no distortion, no soft particles), whatever their render tier name; desktops follow the tier.
 */
export function vfxTierFor(lookdev) {
  if (!lookdev) return 'high';
  return lookdev.profile === 'phone' ? 'low' : lookdev.tier || 'high';
}
