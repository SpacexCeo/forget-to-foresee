// UI polish (owner feedback 08.11, docs/ui-polish.md): panel exclusivity (src/play/panels.js), the
// screen-space nameplate math (src/play/nameplate.js) and the spacing / target-size rules of the
// play layer and the world HUD, read from the stylesheets so a regression shows up in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPanelArbiter, panelArbiterFor } from '../src/play/panels.js';
import { NAMEPLATE, plateOpacity, plateScale, platePosition, platePlacement } from '../src/play/nameplate.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

/* ---------------- panel exclusivity ---------------- */

function fakeSurfaces(arb) {
  const log = [];
  const mk = (id, opts) => {
    const s = { id, open: false };
    s.show = () => { s.open = true; arb.claim(id, s.hide, opts); };
    s.hide = () => { if (!s.open) return; s.open = false; log.push('close:' + id); arb.release(id); };
    return s;
  };
  return { log, panel: mk('panel'), help: mk('help'), signs: mk('signs', { modal: false }), card: mk('hub-card') };
}

test('panels: opening one surface closes the other (Memories over Signs, Signs over Memories, help over both)', () => {
  const arb = createPanelArbiter();
  const { log, panel, help, signs } = fakeSurfaces(arb);
  signs.show();
  assert.equal(arb.current, 'signs');
  panel.show();
  assert.equal(arb.current, 'panel');
  assert.equal(signs.open, false, 'the Signs panel closed when Memories opened');
  assert.deepEqual(log, ['close:signs']);
  signs.show();
  assert.equal(panel.open, false, 'Memories closed when Signs reopened');
  help.show();
  assert.equal(signs.open, false);
  assert.equal(arb.current, 'help');
  help.hide();
  assert.equal(arb.current, null, 'nothing reopens by itself');
});

test('panels: re-claiming the open id only swaps the close handler; a stale release is a no-op', () => {
  const arb = createPanelArbiter();
  let closes = 0;
  arb.claim('panel', () => { closes++; });
  assert.equal(arb.claim('panel', () => { closes += 10; }), false);
  assert.equal(closes, 0);
  assert.equal(arb.release('signs'), false, 'another id cannot release the claim');
  assert.equal(arb.current, 'panel');
  arb.claim('signs', () => {}, { modal: false });
  assert.equal(closes, 10, 'the latest close handler ran');
  assert.equal(arb.release('panel'), false, 'the replaced claim is already gone');
  assert.equal(arb.current, 'signs');
});

test('panels: the hub dock hides under modal surfaces, not under the desktop Signs panel', () => {
  const states = [];
  const arb = createPanelArbiter({ onChange: (id, modal) => states.push([id, modal]) });
  const { panel, signs, card } = fakeSurfaces(arb);
  signs.show();
  assert.equal(arb.modal, false, 'Signs reads alongside the dock');
  panel.show();
  assert.equal(arb.modal, true, 'Memories is modal: the dock and the reading card hide');
  panel.hide();
  assert.equal(arb.modal, false);
  card.show();
  assert.equal(arb.modal, true, 'a decision card is modal');
  assert.deepEqual(states, [['signs', false], ['panel', true], [null, false], ['hub-card', true]]);
  // the same id can change its modality (the Signs sheet on a phone is modal)
  arb.claim('signs', () => {}, { modal: true });
  assert.equal(arb.modal, true);
  assert.equal(arb.claim('signs', () => {}, { modal: false }), true, 'a modality change counts as a change');
  assert.equal(arb.modal, false);
});

test('panels: closeAll and subscribe; a throwing close handler does not break the arbiter', () => {
  const arb = createPanelArbiter();
  const seen = [];
  const off = arb.subscribe((id, modal) => seen.push(id + ':' + modal));
  arb.claim('panel', () => { throw new Error('boom'); });
  const warn = console.warn; const warned = [];
  console.warn = (...a) => warned.push(a[1]);
  try { arb.claim('help', () => {}); } finally { console.warn = warn; }
  assert.deepEqual(warned, ['panel']);
  assert.equal(arb.current, 'help');
  assert.equal(arb.closeAll(), true);
  assert.equal(arb.current, null);
  assert.equal(arb.closeAll(), false);
  off();
  arb.claim('panel', () => {});
  assert.deepEqual(seen, ['panel:true', 'help:true', 'null:false']);
});

test('panels: panelArbiterFor shares one arbiter per root and toggles the body class', () => {
  const classes = new Set();
  const root = { ownerDocument: { body: { classList: { toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); } } } } };
  const a = panelArbiterFor(root), b = panelArbiterFor(root);
  assert.equal(a, b);
  assert.notEqual(panelArbiterFor({}), a);
  a.claim('signs', () => {}, { modal: false });
  assert.equal(classes.has('pl-modal-open'), false);
  a.claim('panel', () => {});
  assert.equal(classes.has('pl-modal-open'), true);
  a.release('panel');
  assert.equal(classes.has('pl-modal-open'), false);
});

/* ---------------- nameplates ---------------- */

test('nameplate: opacity fades from near to far and the scale shrinks a little', () => {
  assert.equal(plateOpacity(0), 1);
  assert.equal(plateOpacity(NAMEPLATE.near), 1);
  assert.equal(plateOpacity((NAMEPLATE.near + NAMEPLATE.far) / 2), 0.5);
  assert.equal(plateOpacity(NAMEPLATE.far), 0);
  assert.equal(plateOpacity(NAMEPLATE.far + 100), 0);
  assert.equal(plateOpacity(NaN), 0);
  assert.equal(plateScale(0), 1);
  assert.equal(plateScale(NAMEPLATE.far), 0.8);
  assert.ok(plateScale(NAMEPLATE.far + 50) >= 0.8);
});

test('nameplate: NDC projects to CSS px; behind the camera and off screen give no plate', () => {
  assert.deepEqual(platePosition({ x: 0, y: 0, z: 0.5 }, 1280, 800), { x: 640, y: 400 });
  assert.deepEqual(platePosition({ x: -1, y: 1, z: 0.5 }, 1280, 800, 0), { x: 0, y: 0 });
  assert.equal(platePosition({ x: 0, y: 0, z: 1.2 }, 1280, 800), null, 'behind the camera');
  assert.equal(platePosition({ x: 2, y: 0, z: 0.5 }, 1280, 800), null, 'far right of the viewport');
  assert.ok(platePosition({ x: 1.02, y: 0, z: 0.5 }, 1280, 800, 24), 'a positive margin allows a few px outside');
  assert.equal(platePosition({ x: 0.95, y: 0, z: 0.5 }, 1280, 800), null, 'the default margin keeps plates 64 px clear of the edge');
  assert.ok(platePosition({ x: 0.85, y: 0, z: 0.5 }, 1280, 800), 'inside the safe band');
  assert.equal(platePosition({ x: 0, y: 0, z: 0.5 }, 0, 800), null, 'no layer size yet');
});

test('nameplate: placement lifts the plate above the head point and hides it inside a Shell', () => {
  const p = platePlacement({ ndc: { x: 0, y: 0, z: 0.5 }, distance: 5, width: 1280, height: 800 });
  assert.deepEqual(p, { x: 640, y: 400 - NAMEPLATE.lift, opacity: 1, scale: 1 });
  assert.equal(platePlacement({ ndc: { x: 0, y: 0, z: 0.5 }, distance: 5, width: 1280, height: 800, hidden: true }), null);
  assert.equal(platePlacement({ ndc: { x: 0, y: 0, z: 0.5 }, distance: NAMEPLATE.far, width: 1280, height: 800 }), null, 'faded out');
  const far = platePlacement({ ndc: { x: 0.5, y: -0.5, z: 0.9 }, distance: (NAMEPLATE.near + NAMEPLATE.far) / 2, width: 1000, height: 1000 });
  assert.equal(far.opacity, 0.5);
  assert.equal(far.scale, 0.9);
});

/* ---------------- stylesheet rules ---------------- */

const html = read('../index.html');
const tokens = read('../src/ui/world-hud/tokens.css');
const hubUi = read('../src/play/hub-ui.js');
const agents = read('../src/play/agents.js');

test('spacing: play-layer buttons use the 40 px target (48 on phones) and the shared radii', () => {
  assert.match(html, /--pl-target: 40px/);
  assert.match(html, /\.pl-btn \{[^}]*min-height: var\(--pl-target\)/);
  assert.match(html, /\.pl-opt \{[^}]*min-height: var\(--pl-target\)/);
  assert.match(html, /\.pl-btn \{ --pl-target: 48px/);
  assert.match(html, /--pl-r-btn: 10px; --pl-r-panel: 14px/);
  assert.match(hubUi, /\.hub-host button \{[^}]*min-height: 40px;[^}]*padding: 0 16px/);
  assert.match(hubUi, /\.hub-host button \{ min-height: 48px/);
  assert.match(hubUi, /\.hub-slots li button \{ width: 40px; min-height: 40px/);
});

test('stacking: modal play panels are opaque surfaces and the hub dock yields to them', () => {
  assert.match(html, /\.pl-panel, \.pl-context, \.pl-help, \.pl-info \{ background: var\(--pl-panel\) #121d1f;/, 'gradient on a solid base: fully opaque');
  const alpha = [...html.matchAll(/--pl-panel: linear-gradient\(180deg,([^;]+)\)/g)][0][1].match(/rgba\([^)]*,\s*(\.\d+|\d\.\d+)\)/g).map((s) => Number(s.match(/,\s*(\.\d+|\d\.\d+)\)/)[1]));
  assert.ok(alpha.length >= 3 && alpha.every((a) => a >= 0.9), 'every stop of the panel gradient is at least .9 opaque: ' + alpha.join(','));
  assert.match(hubUi, /body\.pl-modal-open \.hub-host \.hub-dock, body\.pl-modal-open \.hub-host \.hub-read \{ display: none; \}/);
  assert.match(hubUi, /body\.hub-dock-on \.wh-root \.wh-signs \{ max-height/);
});

test('type: every world HUD role keeps a px floor and the quest tag cannot touch its border', () => {
  const roles = [...tokens.matchAll(/--wh-fs-([a-z-]+): ([^;]+);/g)].filter((m) => !/^(tile)$/.test(m[1]));
  const bad = roles.filter((m) => !/max\(/.test(m[2]) && !/px$/.test(m[2].trim()));
  assert.deepEqual(bad.map((m) => m[1]), [], 'roles without a floor');
  assert.match(tokens, /\.wh-root \.wh-tag \{[^}]*height: max\(calc\(20 \* var\(--wh-px\)\), 20px\)/);
  assert.match(tokens, /--wh-target: 40px/);
  assert.match(tokens, /--wh-target: 48px/);
});

test('nameplate: the agents draw DOM plates from the pure placement, no canvas sprite is left', () => {
  assert.doesNotMatch(agents, /MindSprite|new THREE\.Sprite/);
  assert.match(agents, /platePlacement\(\{ ndc, distance/);
  assert.match(agents, /hidden: !ctx\.irisPos/);
  assert.match(agents, /\.pl-plates \{ position: fixed; inset: 0; pointer-events: none;/);
});
