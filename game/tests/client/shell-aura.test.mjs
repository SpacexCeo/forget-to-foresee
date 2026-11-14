// The tournament Shells' aura (render/shell-aura.js) sits on the model's own curve (render/shell-curve.js, a port of
// art/shells/shell_v2_geo.py). The reference points below were printed by the Python source: if the two drift apart
// the suture's light would float off the spire, so they are pinned here. The rest keeps the effect cheap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHELL, SHELL_WHORLS, SHELL_THETA_START, suturePoint, sutureSamples, spireRadius, shellScale } from '../../src/render/shell-curve.js';
import { DEFAULT_FLAGS } from '../../src/features.js';

const AURA = readFileSync(new URL('../../src/render/shell-aura.js', import.meta.url), 'utf8');
const GAME = readFileSync(new URL('../../src/play/game.js', import.meta.url), 'utf8');
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('shell curve: the suture matches the Python surface at five spiral angles', () => {
  // surface(theta, PSI_HI, ribs=False) -> to_world -> glTF (x, z, -y), from art/shells/shell_v2_geo.py
  const ref = [[0.0, [0.7642, 4.873, 0.0]], [-3.0, [-0.6962, 5.8183, -0.0992]], [-20.0, [0.1793, 10.3914, -0.401]], [-60.0, [-0.1382, 15.486, 0.0442]], [-100.0, [0.0414, 17.1694, 0.0243]]];
  for (const [theta, p] of ref) {
    const q = suturePoint(theta);
    for (let k = 0; k < 3; k++) close(q[k], p[k], 2e-4, `theta ${theta} axis ${k}`);
  }
  close(SHELL_WHORLS, 19.109934703150742, 1e-9, 'whorls');
  close(SHELL_THETA_START, -120.07126094799803, 1e-9, 'apex angle');
  close(shellScale(SHELL_THETA_START), SHELL.G0, 1e-9, 'the apex ring is G0');
});

test('shell curve: the suture climbs the spire inside its height and narrows toward the apex', () => {
  const s = sutureSamples({ whorls: 11, perWhorl: 40, lift: 0.07 });
  assert.equal(s.length, 441);
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i].p[1] > s[i - 1].p[1] - 1e-9, 'never descends at sample ' + i);
    assert.ok(s[i].g < s[i - 1].g, 'each whorl is smaller');
    close(Math.hypot(...s[i].out), 1, 1e-9, 'unit outward direction');
  }
  assert.ok(s[0].p[1] > 4 && s[s.length - 1].p[1] < SHELL.HEIGHT, 'between the body whorl and the apex');
  // lifted out of the groove: farther from the axis than the bare suture, by the lift times the whorl's scale
  const bare = suturePoint(0), lifted = suturePoint(0, 0.07);
  close(Math.hypot(lifted[0], lifted[2]) - Math.hypot(bare[0], bare[2]), 0.07 * SHELL.SCALE, 1e-9, 'lift');
});

test('shell curve: the outline is a spindle, closed at both ends, widest low on the spire', () => {
  assert.equal(spireRadius(0), 0); assert.equal(spireRadius(SHELL.HEIGHT), 0); assert.equal(spireRadius(-1), 0);
  let widest = 0, at = 0;
  for (let y = 0.25; y < SHELL.HEIGHT; y += 0.25) { const r = spireRadius(y); assert.ok(r >= 0 && r < 2.6, 'radius at ' + y); if (r > widest) { widest = r; at = y; } }
  assert.ok(widest > 2.2 && at > 2 && at < 5, `widest ${widest} at ${at}`);
  for (let y = 6; y < 17.5; y += 0.5) assert.ok(spireRadius(y + 0.5) < spireRadius(y), 'tapers above the body whorl at ' + y);
});

test('shell aura: cheap by construction, lighter on phones, an off switch that ships on', () => {
  // three draw calls per Shell at most, nothing uploaded per frame, off the ambient-occlusion pass
  assert.match(AURA, /full: Object\.freeze\(\{ motes: (\d+), glow: true/);
  assert.match(AURA, /lite: Object\.freeze\(\{ motes: (\d+), glow: false/);
  const full = +/full: Object\.freeze\(\{ motes: (\d+)/.exec(AURA)[1], lite = +/lite: Object\.freeze\(\{ motes: (\d+)/.exec(AURA)[1];
  assert.ok(full <= 64 && lite <= 24 && lite < full, `motes ${full} / ${lite}`);
  assert.ok(!/needsUpdate\s*=\s*true/.test(AURA), 'no buffer is re-uploaded per frame');
  assert.equal((AURA.match(/blending: THREE\.AdditiveBlending/g) || []).length, 3, 'glow, suture and motes are additive');
  assert.equal((AURA.match(/depthWrite: false/g) || []).length, 3);
  assert.match(AURA, /m\.layers\.set\(LAYER_OVERLAY\)/);
  assert.match(AURA, /if \(!reducedMotion\) this\.time \+= dt;/, 'reduced motion holds the light still');
  assert.equal(DEFAULT_FLAGS.shellAura, false, 'off in code');
  const file = JSON.parse(readFileSync(new URL('../../public/features.json', import.meta.url), 'utf8'));
  assert.equal(file.flags.shellAura, true, 'on in the shipped file');
  assert.match(GAME, /aura\.setEnabled\(features\.on\('shellAura'\)/, 'the flag is the off switch');
  assert.match(GAME, /lite: lookdev\.profile === 'phone' \|\| lookdev\.tier === 'low'/);
});
