// Townsfolk barks (feature 7): when Iris walks past a townsperson, that person says one short line in a small bubble
// above their head. The line follows the hour (dawn, night), the rain and whether this person is working for the
// player as a hired agent; a few people have a line of their own. One bubble at a time, a cooldown per person and a
// gap between any two barks keep the street calm. Visual and local only: no engine, no chain, no sound.
import * as THREE from 'three';
import { TOWNSFOLK, WAYFARERS } from '../play/townsfolk-plan.js';

export const BARK = Object.freeze({
  radius: 6, // metres: Iris passing this close starts a bark
  height: 2.5, // metres of vertical difference still counted as passing (stairs, the gate ramp)
  show: 2.6, // seconds a bubble stays up (declutter pass: shorter)
  fade: 0.35, // seconds of fade in and out
  cooldown: 20, // seconds before the same person speaks again
  gap: 6, // seconds between any two barks (declutter pass: fewer)
});

/** People with a line of their own (the rest share the general lines). child_a / child_b share 'child'. */
export const ROLE_LINES = Object.freeze(['guard', 'baker', 'lamplighter', 'musician', 'elder', 'child', 'scribe', 'sweeper']);
const GENERAL = ['bark.day.1', 'bark.day.2', 'bark.day.3', 'bark.day.4'];
/** The Wayfarers from Kallima (owner 14.11 night): a tourist's eight lines in rotation, whatever the hour. */
export const WAYFARER_BARKS = Object.freeze(Array.from({ length: 8 }, (_, i) => 'bark.wayfarer.' + (i + 1)));

/** The hour class of a look name: dawn, night (twilight and night) or day. */
export function hourClass(name) {
  if (name === 'dawn') return 'dawn';
  if (name === 'night' || name === 'twilight') return 'night';
  return 'day';
}

/**
 * The candidate lines for a person right now, most specific first. Pure.
 * @param {{key: string, hour?: string, rain?: number, hired?: boolean, extra?: string[]}} o `extra`: more crowd lines in the
 *   rotation (the new-player intro's barks, sprint 7.3), never for a hired agent
 */
export function barkCandidates({ key, hour = 'day', rain = 0, hired = false, extra = [] }) {
  if (hired) return ['bark.hired.1', 'bark.hired.2'];
  if (key === 'wayfarer') return WAYFARER_BARKS.slice();
  const out = [];
  if (rain > 0.35) out.push('bark.rain.1', 'bark.rain.2');
  const h = hourClass(hour);
  if (h === 'night') out.push('bark.night.1', 'bark.night.2');
  else if (h === 'dawn') out.push('bark.dawn.1', 'bark.dawn.2');
  const role = /^child_/.test(key) ? 'child' : key;
  if (ROLE_LINES.includes(role)) out.push('bark.role.' + role);
  const base = out.length ? out : GENERAL.slice();
  return extra && extra.length ? [...base, ...extra] : base;
}

/** One line from the candidates: the n-th time this person speaks walks through them, so repeats are rare. */
export function chooseBark(o, n = 0) {
  const c = barkCandidates(o);
  return c[((n % c.length) + c.length) % c.length];
}

// Built on first use: TOWNSFOLK lives in the play chunk, which imports this (client-core) chunk, so reading it at
// module level would be a TDZ error at boot.
let HEIGHT = null;
const heightOf = (key) => (HEIGHT || (HEIGHT = new Map([...TOWNSFOLK, ...WAYFARERS].map((p) => [p.key, p.height])))).get(key);

/**
 * @param {object} o
 * @param {THREE.Camera} o.camera @param {object} o.i18n
 * @param {() => Iterable<{key: string, pos: number[]}>} o.people the townsfolk Iris can meet, in world space
 * @param {() => string} [o.hour] the look name on show @param {() => number} [o.rain] 0..1
 * @param {() => Set<string>|string[]} [o.hired] keys of people working as hired agents
 * @param {Document} [o.doc] @param {() => number} [o.now] seconds
 */
export function createBarks({ camera, i18n, people, hour = () => 'day', rain = () => 0, hired = () => [], extra = () => [], doc = globalThis.document, now = () => performance.now() / 1000 }) {
  const el = doc.createElement('div');
  el.className = 'ftf-bark'; el.hidden = true; el.setAttribute('aria-live', 'polite');
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:11;pointer-events:none;max-width:min(220px,60vw);padding:6px 11px;border-radius:12px;'
    + 'background:rgba(16,22,24,.82);color:#f3ead8;font:14px/1.35 system-ui,sans-serif;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.35);'
    + 'transform:translate(-50%,-100%);opacity:0;transition:opacity .35s ease';
  const who = doc.createElement('b'); who.style.cssText = 'display:block;font-size:11px;letter-spacing:.04em;color:#e9b44c;font-weight:600';
  const text = doc.createElement('span');
  el.append(who, text);
  doc.body.append(el);
  const last = new Map(); // key -> seconds of the last bark
  const count = new Map(); // key -> barks so far
  let current = null, lastAny = -Infinity;
  const v = new THREE.Vector3();

  function start(person, t) {
    const n = count.get(person.key) || 0;
    const hiredSet = hired(); const isHired = hiredSet && (hiredSet.has ? hiredSet.has(person.key) : hiredSet.includes(person.key));
    const key = chooseBark({ key: person.key, hour: hour(), rain: rain(), hired: isHired, extra: extra() }, n);
    count.set(person.key, n + 1); last.set(person.key, t); lastAny = t;
    who.textContent = i18n.t('folk.name.' + person.key);
    text.textContent = i18n.t(key);
    current = { key: person.key, line: key, t0: t };
    el.hidden = false;
  }
  function stop() { current = null; el.style.opacity = '0'; el.hidden = true; }
  /** A scripted line for one person now (a story beat: the Wayfarer's talk on the way to the Gate-Loom). */
  function say(key, line) {
    const t = now(); last.set(key, t); lastAny = t;
    who.textContent = i18n.t('folk.name.' + key); text.textContent = i18n.t(line);
    current = { key, line, t0: t }; el.hidden = false;
  }

  return {
    el,
    get current() { return current; },
    say,
    /**
     * Per frame. `enabled` false (a talk or a panel open, indoors, the registration) hides the bubble and starts none.
     * @param {number[]} playerPos @param {boolean} [enabled]
     */
    update(playerPos, enabled = true) {
      const t = now();
      if (!enabled) { if (current) stop(); return; }
      let pos = null;
      if (current) {
        if (t - current.t0 > BARK.show) stop();
        else { for (const p of people()) if (p.key === current.key) { pos = p.pos; break; } if (!pos) stop(); }
      }
      if (!current && t - lastAny >= BARK.gap) {
        let best = null, bd = BARK.radius;
        for (const p of people()) {
          if (Math.abs(p.pos[1] - playerPos[1]) > BARK.height) continue;
          const d = Math.hypot(p.pos[0] - playerPos[0], p.pos[2] - playerPos[2]);
          if (d < bd && t - (last.get(p.key) ?? -Infinity) >= BARK.cooldown) { bd = d; best = p; }
        }
        if (best) { start(best, t); pos = best.pos; }
      }
      if (!current || !pos) return;
      v.set(pos[0], pos[1] + (heightOf(current.key) || 1.7) + 0.35, pos[2]).project(camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { el.style.opacity = '0'; return; } // behind the camera or off screen
      const w = (globalThis.innerWidth || 1280), h = (globalThis.innerHeight || 720);
      el.style.left = ((v.x + 1) / 2 * w).toFixed(1) + 'px';
      el.style.top = ((1 - v.y) / 2 * h).toFixed(1) + 'px';
      const age = t - current.t0;
      el.style.opacity = age > BARK.show - BARK.fade ? '0' : '1';
    },
    dispose() { el.remove(); },
  };
}
