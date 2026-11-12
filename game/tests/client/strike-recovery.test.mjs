// After strikes Iris must come back to her idle / gait (owner 12.11: "she stays twisted after strikes"): a combat clip
// never stays clamped on its last frame with weight, a tapped strike on cooldown leaves no coiled charge, and the
// turn for a strike is the root's heading only (no bone yaw). IrisAvatar with a stand-in model and real mixer.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { register } from 'node:module';
// the build's virtual model list (vite plugin) as an empty stand-in and vite's import.meta.env, so the avatar module
// loads under node
const HOOK = `export async function resolve(s, c, n) { return s === 'virtual:model-list' ? { url: 'data:text/javascript,export const MODEL_FILES={};export const MODEL_DIRS={};', shortCircuit: true } : n(s, c); }
export async function load(u, c, n) { const r = await n(u, c); if (u.includes('/game/src/') && r.source) { const t = String(r.source).replaceAll('import.meta.env', '({ BASE_URL: "/", DEV: false, PROD: true })'); return { ...r, source: t, shortCircuit: true }; } return r; }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);
const { IrisAvatar } = await import('../../src/play/iris-avatar.js');

function standIn() {
  const model = new THREE.Object3D(); model.name = 'iris';
  const clip = (name, dur, ud = {}) => { const c = new THREE.AnimationClip(name, dur, [new THREE.VectorKeyframeTrack('.position', [0, dur], [0, 0, 0, 0, 0.1, 0])]); c.userData = ud; return c; };
  const clips = [clip('strike1', 0.6, { impact_s: 0.18 }), clip('strike2', 0.6, { impact_s: 0.18 }), clip('strike3', 0.8, { impact_s: 0.25 }),
    clip('strike_charge', 0.5, { hold: true }), clip('strike_super', 0.9, { impact_s: 0.1, from: 'strike_charge' }), clip('dash', 0.35)];
  return { model, mixer: new THREE.AnimationMixer(model), clips, gait: null };
}
const weights = (m) => m.mixer._actions.filter((a) => /^strike|dash/.test(a.getClip().name)).map((a) => [a.getClip().name, a.isRunning() ? a.getEffectiveWeight() : 0]);
const run = (av, secs, speed = 0) => { for (let t = 0; t < secs; t += 1 / 60) av.update(1 / 60, speed > 0, null, t, speed); };

test('after a three-hit combo and one second every strike action has weight 0 and no combat clip is left on her', () => {
  const av = new IrisAvatar(); av.irisModel = standIn(); const m = av.irisModel;
  for (const n of ['strike1', 'strike2', 'strike3']) { assert.equal(av.combat(n), true); run(av, 0.3); }
  run(av, 1.0);
  assert.equal(m.combat, null, 'the combat layer is gone');
  for (const [name, w] of weights(m)) assert.equal(w, 0, `${name} still weighs ${w}`);
});

test('a held charge put away (refused strike) and a super strike both hand back; walking cuts the settle short', () => {
  const av = new IrisAvatar(); av.irisModel = standIn(); const m = av.irisModel;
  let held = true; av.holdWhile = () => held;
  av.combat('strike_charge'); run(av, 0.4); assert.ok(m.combat && m.combat.name === 'strike_charge', 'the coil is on while held');
  held = false; run(av, 0.6);
  assert.equal(m.combat, null, 'released without a strike: the coil fades out by itself');
  held = true; av.combat('strike_charge'); run(av, 0.3); av.combat('strike_super'); held = false; run(av, 1.5);
  assert.equal(m.combat, null); for (const [name, w] of weights(m)) assert.equal(w, 0, `${name} after the super`);
  av.combat('strike1'); run(av, 0.25); run(av, 0.3, 3.0);
  assert.equal(m.combat, null, 'a step after the impact ends the settle');
});

test('the strike turn is the root heading only: play/mobs.js face() writes player.heading and no bone', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/play/mobs.js', import.meta.url), 'utf8');
  const face = src.slice(src.indexOf('function face('), src.indexOf('let lastAim'));
  assert.match(face, /player\.heading = r\.heading/);
  assert.doesNotMatch(face, /getObjectByName|bone|spine|rotation/i);
});
