// UI polish (owner feedback 08.11, docs/ui-polish.md): panel exclusivity (src/play/panels.js), the
// screen-space nameplate math (src/play/nameplate.js) and the spacing / target-size rules of the
// play layer and the world HUD, read from the stylesheets so a regression shows up in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPanelArbiter, panelArbiterFor } from '../src/play/panels.js';
import { signsFromObs } from '../src/ui/world-hud/from-obs.js';
import { viewportTier, inAppBrowser, VH_TIERS } from '../src/ui/world-hud/index.js';
import { createHints, resolveHintArgs } from '../src/play/hints.js';
import { NAMEPLATE, plateOpacity, plateScale, platePosition, platePlacement, proximityOpacity, boxesIntersect, plateBox } from '../src/play/nameplate.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const agents = read('../src/play/agents.js');

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

test('nameplate: proximity only (no floating text in the world): 0 beyond 7 m, fading in over the last 2 m', () => {
  assert.equal(proximityOpacity(20), 0);
  assert.equal(proximityOpacity(NAMEPLATE.show), 0);
  assert.equal(proximityOpacity(NAMEPLATE.show - NAMEPLATE.fadeIn / 2), 0.5);
  assert.equal(proximityOpacity(1), 1);
  assert.equal(proximityOpacity(Infinity), 0, 'inside a Shell Iris is nowhere near');
  const near = platePlacement({ ndc: { x: 0, y: 0, z: 0.5 }, distance: 5, irisDistance: 2, width: 1280, height: 800 });
  assert.equal(near.opacity, 1);
  assert.equal(platePlacement({ ndc: { x: 0, y: 0, z: 0.5 }, distance: 5, irisDistance: 12, width: 1280, height: 800 }), null, 'the agent across the plaza has no plate');
  assert.equal(platePlacement({ ndc: { x: 0, y: 0, z: 0.5 }, distance: 5, irisDistance: 6, width: 1280, height: 800 }).opacity, 0.5);
});

test('nameplate: a plate never sits under a HUD box (box test used by agents.js)', () => {
  const at = { x: 640, y: 400, opacity: 1, scale: 1 };
  assert.deepEqual(plateBox(at, 100, 26), [590, 374, 690, 400]);
  assert.deepEqual(plateBox({ ...at, scale: 0.8 }, 100, 26), [600, 379.2, 680, 400]);
  assert.equal(boxesIntersect([590, 374, 690, 400], [680, 390, 900, 500]), true);
  assert.equal(boxesIntersect([590, 374, 690, 400], [690, 400, 900, 500]), false, 'touching edges do not count');
  assert.equal(boxesIntersect([0, 0, 10, 10], [20, 20, 30, 30]), false);
  assert.match(agents, /hudRects\(ctx\)\.some\(\(r\) => boxesIntersect\(box, r\)\)/);
  assert.match(agents, /irisDistance >= NAMEPLATE\.show/);
});

/* ---------------- stylesheet rules ---------------- */

const html = read('../index.html');
const tokens = read('../src/ui/world-hud/tokens.css');
const hubUi = read('../src/play/hub-ui.js');

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
  assert.match(agents, /platePlacement\(\{ ndc, distance, irisDistance/);
  assert.match(agents, /a\.plate\.place\(null\); return;/, 'far agents get no plate at all');
  assert.match(agents, /\.pl-plates \{ position: absolute; inset: 0; pointer-events: none;/);
  assert.match(agents, /\.pl-plate\[hidden\] \{ display: none; \}/, 'a hidden plate must not render at the layer origin');
});

test('NEAR badge (request 9): resolved sign cards carry near.leafBadge(index); active cards and no watcher carry nothing', () => {
  const obs = {
    iris: { anchors: [] }, prophecies: [], proofs: [{ index: 3, verified: true, leaf: 'abcdef0123456789' }],
    chronicle: [{ index: 3, tick: 5, meaning: { place: 1, action: 0, power: 10, delay: 2 } }],
    dictionary: { cells: [] }, season: { tick: 6 },
  };
  const i18n = { t: (k) => k };
  const near = { leafBadge: (i) => (i === 3 ? { kind: 'leaf', state: 'on-chain', labelKey: 'wh.sign.near.leaf', tipKey: 'wh.sign.near.tip', href: 'https://testnet.nearblocks.io/x' } : null), seasonBadge: () => null };
  const [card] = signsFromObs(obs, { i18n, near });
  assert.equal(card.verified, 'ok');
  assert.equal(card.near.state, 'on-chain');
  assert.equal(signsFromObs(obs, { i18n })[0].near, null);
});

test('short viewports: tiers by the measured visible height; in-app browsers are a hint only', () => {
  assert.equal(viewportTier(844), 'tall');
  assert.equal(viewportTier(VH_TIERS.short), 'tall');
  assert.equal(viewportTier(560), 'short');
  assert.equal(viewportTier(500), 'short', '375x500 keeps the trial row');
  assert.equal(viewportTier(480), 'tiny');
  assert.equal(viewportTier(300), 'tiny');
  assert.equal(viewportTier(0), 'tall', 'no measurement yet: the full layout');
  assert.equal(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Twitter for iPhone/10.0'), 'inapp');
  assert.equal(inAppBrowser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 [FB_IAB/FB4A;FBAV/450.0.0.0;]'), 'inapp');
  assert.equal(inAppBrowser('Mozilla/5.0 (iPhone) Instagram 300.0'), 'inapp');
  assert.equal(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile/15E148 Safari/604.1'), '');
  const css = read('../src/ui/world-hud/tokens.css') + read('../src/ui/world-hud/status.css') + read('../src/play/hub-ui.js') + read('../index.html');
  for (const sel of ['html[data-vh="short"] .wh-root .wh-quest--mobile', 'html[data-vh="tiny"] .wh-root .wh-trial--mobile { display: none; }', 'html[data-vh="short"] .hub-dock', 'body.in-world #ui { bottom: auto; height: var(--vvh, 100%); }']) {
    assert.ok(css.includes(sel), 'compact rule present: ' + sel);
  }
});

test('QA-006: a hint about a sign whose trial has passed is withdrawn, a newer sign re-issues it', () => {
  let t = 0;
  const i18n = { t: (k) => k };
  const mem = new Map(); const storage = { getJSON: (k) => mem.get(k) ?? null, setJSON: (k, v) => mem.set(k, v) };
  const hints = createHints({ storage, i18n, now: () => t });
  const sign = (index, tick) => ({ index, reading: { slots: [{ meaning: 0 }, { meaning: 1 }, { meaning: 0 }, { meaning: 0 }] }, impliedAnchor: { shell: 1, tick } });
  const obs = (tick, prophecies) => ({ season: { tick, phase: 'play', tension: 0 }, iris: { anchors: [], attention: 3, silk: 60 }, prophecies, proofs: [], offers: [], memories: [], dictionary: { confidentCells: 0 } });
  hints.action('moved');
  hints.observe(obs(1, [sign(0, 2)]));
  t = 7000; hints.tick(0.1); hints.observe(obs(1, [sign(0, 2)]));
  let v = hints.view();
  const args = (x) => (typeof x.text.args === 'function' ? x.text.args() : x.text.args);
  assert.equal(v.active && v.active.id, 'firstSign');
  assert.equal(args(v.active).trial, 2);
  // trial 4: the sign's trial has passed and no newer sign exists → the toast is withdrawn
  t = 8000; hints.observe(obs(4, [sign(0, 2)]));
  assert.equal(hints.view().active, null, 'stale hint withdrawn');
  // a newer sign for trial 7 → the hint comes back with the new facts (after the 30 s repeat gap)
  t = 60000; hints.observe(obs(4, [sign(0, 2), sign(1, 7)])); hints.tick(0.1);
  v = hints.view();
  assert.equal(v.active && v.active.id, 'firstSign');
  assert.equal(args(v.active).trial, 7);
  // the facts change while the toast is up → it is re-issued in place
  t = 61000; hints.observe(obs(4, [sign(0, 2), sign(1, 7), sign(2, 9)]));
  assert.equal(args(hints.view().active).trial, 9);
});

test('QA-019: hint args are raw ids resolved in the current language at render time', () => {
  const en = { t: (k) => ({ 'shell.0': 'Shell I', 'meaning.1.1': 'Gift', 'meaning.0.0': 'Shell I', 'agent.moss': 'Moss' })[k] || k };
  const ru = { t: (k) => ({ 'shell.0': 'Раковина I', 'meaning.1.1': 'Дар', 'meaning.0.0': 'Раковина I', 'agent.moss': 'Мох' })[k] || k };
  const raw = { shell: 1, action: 1, place: 0, power: 10, trial: 2, who: 'moss' };
  assert.deepEqual(resolveHintArgs(raw, en), { shell: 'Shell I', action: 'Gift', place: 'Shell I', power: 10, trial: 2, who: 'Moss' });
  assert.deepEqual(resolveHintArgs(raw, ru), { shell: 'Раковина I', action: 'Дар', place: 'Раковина I', power: 10, trial: 2, who: 'Мох' });
  assert.deepEqual(resolveHintArgs(raw, null), raw);
  const hints = createHints({ i18n: en, now: () => 0 });
  hints.action('moved');
  hints.observe({ season: { tick: 1, phase: 'play', tension: 0 }, iris: { anchors: [], attention: 3, silk: 60 }, prophecies: [{ index: 0, reading: { slots: [{ meaning: 0 }, { meaning: 1 }, { meaning: 0 }, { meaning: 0 }] }, impliedAnchor: { shell: 1, tick: 2 } }], proofs: [], offers: [], memories: [], dictionary: { confidentCells: 0 } });
  const row = hints.view().journal[0];
  assert.ok(row, 'the hint reached the journal');
  assert.deepEqual(row.time, { key: 'wh.log.trial', args: { n: 1 } }, 'the clock column is a TextRef');
  assert.equal(typeof row.text.args, 'function', 'args resolve lazily');
  assert.equal(row.text.args().action, 'Gift');
});

test('QA-012: the trial progress reaches 100 % once the season leaves play', () => {
  const src = read('../src/ui/world-hud/from-obs.js');
  assert.match(src, /progressDone: s\.phase === 'play' \? Math\.max\(0, s\.tick - 1\) : s\.ticks/);
});


/* ---------------- elements that borrow .wh-root for its tokens (QA-031) ---------------- */

// tokens.css gives `.wh-root` `position: absolute; inset: 0; pointer-events: none`. On the lobby path Vite injects
// that sheet after the Chronicle and map styles, so a single-class base rule (`.ch-fab { ... }`) lost and the
// Chronicle button sat at the top-left corner over the trial card. Each borrower's base rule doubles the class.
test('layout: an element that borrows .wh-root keeps its own position whatever the stylesheet order', () => {
  const borrowers = [
    ['../src/cinematic/chapters/chronicle.js', ['ch-fab', 'ch-menu']],
    ['../src/play/map-ui.js', ['ftf-map-host']],
  ];
  for (const [file, classes] of borrowers) {
    const src = read(file);
    for (const cls of classes) {
      assert.match(src, new RegExp(`class: '(${cls}[^']*\\bwh-root\\b|wh-root[^']*\\b${cls}\\b)`), `${cls} still borrows .wh-root (else drop it here)`);
      const base = new RegExp(`(^|[\\s}])\\.${cls}\\s*\\{[^}]*(position|inset|top|bottom|pointer-events)`, 'm');
      assert.doesNotMatch(src, base, `${file}: a single-class .${cls} rule sets layout; tokens.css .wh-root can override it`);
      assert.match(src, new RegExp(`\\.${cls}\\.wh-root\\s*\\{[^}]*position: fixed`), `${cls}: the doubled base rule fixes the position`);
    }
  }
  const chronicle = read('../src/cinematic/chapters/chronicle.js');
  assert.match(chronicle, /\.ch-fab\.wh-root \{[^}]*top: auto[^}]*bottom: calc\(56px/, 'the Chronicle fab resets the inherited top: 0 and sits at the bottom left');
  assert.match(chronicle, /\.ch-fab\.wh-root \{[^}]*pointer-events: auto/, 'the fab stays clickable over .wh-root pointer-events: none');
});

// QA-005 / README step 6: "Forget it for a vision" opens the HUD's Signs & Visions panel (the new cards marked
// Vision), not the greybox-era detail panel. Checked in Chromium at 1280x800 (hub and walk); this pins the wiring.
test('panels: a vision sacrifice opens the HUD Signs & Visions panel, the detail panel only without a HUD', () => {
  const ui = read('../src/play/ui.js');
  const game = read('../src/play/game.js');
  const forget = ui.slice(ui.indexOf('async function forget('), ui.indexOf('async function sendAsk('));
  assert.match(forget, /if \(!r\.ok\) \{[^}]*return; \}/, 'a rejected sacrifice opens nothing');
  assert.match(forget, /purpose === 'vision'\) \{ if \(handlers\.onSigns\) handlers\.onSigns\(\); else open\('vision'\); \}/);
  assert.match(game, /onSigns: \(\) => \{ if \(worldHud && worldHud\.hud\) worldHud\.hud\.signs\.open\(\); \}/, 'game.js routes onSigns to the HUD Signs panel');
});
