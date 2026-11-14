// The heroine's footsteps as the game fires them: the game's own GaitLayer (play/gait.js) driven at a ground speed with
// the clips of her shipped clip file (assets/anim/<hero>.glb, the same 1x locomotion scale as the game), every
// 'ftf:foot' event (the footstep sound) logged with its time. Prints the step times, the step interval and the stride
// the feet cover between two landings of the same foot (it should equal the ground covered: no sliding).
//   node tools/gait-steps.mjs <hero> [speed m/s, default the player's run] [seconds, default 5]   (run in game/)
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GaitLayer } from '../game/src/play/gait.js';

const [hero = 'iris', speedArg, secsArg] = process.argv.slice(2);
const speed = Number(speedArg) || 1.7 * 2.6, secs = Number(secsArg) || 5;
const b = readFileSync(new URL(`../game/public/assets/anim/${hero}.glb`, import.meta.url));
const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
// the clips the gait needs: their names, durations (from the key times) and extras
const clips = json.animations.map((a) => { const c = new THREE.AnimationClip(a.name, Math.max(...a.samplers.map((s) => json.accessors[s.input].max[0])), []); c.userData = { ...(a.extras || {}) }; return c; });
const mixer = new THREE.AnimationMixer(new THREE.Object3D());
const gait = new GaitLayer(mixer, clips), steps = [];
let t = 0; gait.onFoot = (foot, running) => steps.push([+t.toFixed(3), foot, running]);
for (const dt = 1 / 60; t < secs; t += dt) gait.update(dt, speed);
const run = clips.find((c) => c.name === 'run'), gaps = steps.slice(1).map((s, i) => +(s[0] - steps[i][0]).toFixed(3));
const same = steps.filter((s) => s[1] === 'L').slice(1).map((s, i, a) => (i ? +(s[0] - a[i - 1][0]).toFixed(3) : null)).filter(Boolean);
console.log(JSON.stringify({ hero, speed: +speed.toFixed(2), run: { duration: +run.duration.toFixed(3), speed: run.userData.speed, contact: run.userData.contact },
  rate: +(speed / run.userData.speed).toFixed(3), steps: steps.length, feet: steps.map((s) => s[1]).join(''), gap_mean: +(gaps.slice(2).reduce((x, y) => x + y, 0) / Math.max(1, gaps.length - 2)).toFixed(3),
  stride_m: same.length ? +(same.reduce((x, y) => x + y, 0) / same.length * speed).toFixed(3) : null, clip_stride_m: +(run.userData.speed * run.duration).toFixed(3), times: steps.map((s) => s[0]) }));
