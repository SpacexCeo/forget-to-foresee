import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { GamepadInput, PAD, stickAxes } from '../../src/ui/gamepad.js';
import { Input } from '../../src/ui/input.js';
import { CameraRig } from '../../src/render/camera-rig.js';
import { CollisionWorld, MASK_CAMERA } from '../../src/physics/collision.js';

function controller(index = 0) {
  return {
    index, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
  };
}

test('radial deadzone preserves analog magnitude and bounds diagonal movement', () => {
  assert.deepEqual(stickAxes(.1, -.1), [0, 0]);
  assert.deepEqual(stickAxes(NaN, 1), [0, 0]);
  assert.ok(Math.abs(stickAxes(.6, 0)[0] - .5) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...stickAxes(1, 1)) - 1) < 1e-9);
});

test('standard gamepad actions are edge-triggered and menu transitions require release', () => {
  const pad = new GamepadInput();
  const physical = controller();
  const poll = () => pad.poll([physical]);
  const south = physical.buttons[PAD.interact];
  south.pressed = true;
  assert.equal(poll(), false, 'ignore a held button when first exposed by the browser');
  south.pressed = false; poll();
  south.pressed = true; poll();
  assert.equal(pad.hit(PAD.interact), true);
  poll();
  assert.equal(pad.hit(PAD.interact), false, 'held actions do not repeat');
  pad.clear();
  poll();
  assert.equal(pad.down(PAD.interact), false);
  south.pressed = false; poll();
  south.pressed = true; poll();
  assert.equal(pad.hit(PAD.interact), true);
});

test('gamepad axes and D-pad support one menu step per deflection or press', () => {
  const pad = new GamepadInput();
  const physical = controller();
  const poll = () => pad.poll([physical]);
  poll();
  physical.axes = [0, -.8, .7, -.3];
  poll();
  assert.equal(pad.move[0], 0);
  assert.ok(pad.move[1] > .7 && pad.move[1] < 1);
  assert.ok(pad.look[0] > 0 && pad.look[1] < 0);
  assert.equal(pad.navigation, PAD.up);
  poll();
  assert.equal(pad.navigation, null);
  physical.axes = [0, 0, 0, 0];
  physical.buttons[PAD.down].pressed = true; poll();
  assert.equal(pad.navigation, PAD.down);
  poll();
  assert.equal(pad.navigation, null);
});

test('disconnect and polling loss discard movement and edges, including on slot reuse', () => {
  const pad = new GamepadInput();
  const physical = controller();
  pad.poll([physical]);
  physical.axes[0] = 1;
  physical.buttons[PAD.cancel].pressed = true;
  pad.poll([physical]);
  assert.equal(pad.hit(PAD.cancel), true);
  pad.disconnect(0);
  assert.deepEqual(pad.move, [0, 0]);
  assert.equal(pad.hit(PAD.cancel), false);
  pad.poll([physical]);
  assert.equal(pad.hit(PAD.cancel), false);
  pad.poll([null]);
  assert.equal(pad.index, null);
  physical.mapping = '';
  assert.equal(pad.poll([physical]), false);
  assert.equal(pad.index, null);
});

test('window blur clears pending keyboard, pointer and controller input before focus returns', () => {
  const globals = ['window', 'document', 'navigator'];
  const descriptors = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const win = new EventTarget();
  const doc = new EventTarget();
  const target = new EventTarget();
  const physical = controller();
  const fire = (receiver, type, data = {}) => receiver.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), data));
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: win },
    document: { configurable: true, value: doc },
    navigator: { configurable: true, value: { getGamepads: () => [physical] } },
  });
  let capture;
  target.setPointerCapture = (id) => { capture = id; };
  target.hasPointerCapture = (id) => capture === id;
  target.releasePointerCapture = () => { capture = null; };
  try {
    const input = new Input(target);
    input.poll();
    physical.axes[0] = 1;
    physical.buttons[PAD.interact].pressed = true;
    input.poll();
    fire(win, 'keydown', { code: 'KeyW' });
    fire(win, 'keydown', { code: 'KeyD' });
    fire(win, 'keydown', { code: 'KeyE' });
    assert.ok(Math.abs(Math.hypot(...input.moveAxes()) - 1) < 1e-9);
    fire(target, 'pointerdown', { button: 2, pointerId: 1 });
    fire(target, 'pointermove', { pointerId: 1, movementX: 10, movementY: 3 });
    fire(target, 'wheel', { deltaY: 100 });
    fire(win, 'blur');
    input.poll();
    assert.equal(capture, null);
    assert.deepEqual([input.dragX, input.dragY, input.wheel], [0, 0, 0]);
    assert.equal(input.hit('KeyE'), false);
    assert.deepEqual(input.moveAxes(), [0, 0]);
    fire(win, 'focus');
    fire(win, 'keydown', { code: 'KeyW', repeat: true });
    input.poll();
    assert.deepEqual(input.moveAxes(), [0, 0]);
    assert.equal(input.pad.hit(PAD.interact), false);
    physical.axes[0] = 0; physical.buttons[PAD.interact].pressed = false;
    input.poll();
    physical.axes[0] = .6;
    input.poll();
    assert.ok(input.moveAxes()[0] > .49);
  } finally {
    globals.forEach((name, i) => {
      if (descriptors[i]) Object.defineProperty(globalThis, name, descriptors[i]);
      else delete globalThis[name];
    });
  }
});

test('orbit, tilt and reset preserve camera-relative axes and sweep close obstacles', () => {
  const world = new CollisionWorld();
  world.addBox('wall', [-1, 0, 0.46], [1, 5, .75], MASK_CAMERA);
  const camera = new PerspectiveCamera();
  const rig = new CameraRig(camera, world, { dist: 4.5 });
  rig.tilt(-10);
  rig.update(1, new Vector3(0, 0, 0));
  assert.ok(rig.lastSweep < 1);
  assert.ok(camera.position.z < 0.46 - rig.radius, 'avoid forcing a minimum camera distance through a wall');
  rig.rotate(Math.PI);
  rig.rotate(Math.PI / 2);
  assert.ok(Math.abs(rig.groundAxes().fwd.x - 1) < 1e-9, 'can orbit through the rear hemisphere');
  rig.reset();
  assert.equal(rig.yaw, 0);
  assert.equal(rig.pitchOffset, 0);
  assert.equal(rig.dist, 4.5);
});

test('keyboard layouts: KeyW on a Russian layout (key "ц") moves forward exactly like "w"; WASD never reads e.key', async () => {
  const globals = ['window', 'document', 'navigator'];
  const descriptors = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const axes = (key, code) => {
    const win = new EventTarget();
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: win },
      document: { configurable: true, value: new EventTarget() },
      navigator: { configurable: true, value: { getGamepads: () => [] } },
    });
    const input = new Input(new EventTarget());
    win.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code, key }));
    return input.moveAxes();
  };
  try {
    assert.deepEqual(axes('ц', 'KeyW'), [0, 1]);
    assert.deepEqual(axes('ц', 'KeyW'), axes('w', 'KeyW'));
    assert.deepEqual(axes('ф', 'KeyA'), axes('a', 'KeyA'));
    assert.deepEqual(axes('і', 'KeyS'), axes('s', 'KeyS'), 'Ukrainian layout');
    assert.deepEqual(axes('w', 'KeyZ'), [0, 0], 'a "w" typed on another physical key is not forward');
  } finally {
    globals.forEach((name, i) => { if (descriptors[i]) Object.defineProperty(globalThis, name, descriptors[i]); else delete globalThis[name]; });
  }
  // Static: no movement code compares e.key to a WASD letter.
  const { readFileSync } = await import('node:fs');
  for (const f of ['src/ui/input.js', 'src/boot-world.js', 'src/play/game.js', 'src/play/hub-ui.js', 'src/ui/flow.js', 'src/ui/onboarding.js']) {
    const src = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\.key\s*===?\s*['"][wasdWASD]['"]/, f + ' reads e.key for a movement letter');
  }
});

// ---- mouse aim (owner 13.11): the pure parts of ui/mouse-aim.js
test('mouse aim: the left button strikes or takes the prompt, the right button casts Lance', async () => {
  const { mouseAction } = await import('../../src/ui/mouse-aim.js');
  const { KEY_ACTIONS } = await import('../../src/ui/keybinds.js');
  assert.equal(mouseAction(0), 'strike');
  assert.equal(mouseAction(0, { prompt: true }), 'interact');
  assert.equal(mouseAction(2), 'lance');
  assert.equal(mouseAction(2, { prompt: true }), 'lance');
  assert.equal(mouseAction(1), null);
  const ids = new Set(KEY_ACTIONS.map((a) => a.id));
  for (const a of ['strike', 'interact', 'lance']) assert.ok(ids.has(a), a + ' is a bindable action: the button sends its key');
});

test('mouse aim: the pointer is held only while aiming, with no Ctrl and no window open', async () => {
  const { wantsLock } = await import('../../src/ui/mouse-aim.js');
  const on = { mode: 'aim', touch: false, active: true, engaged: true, ctrl: false, uiOpen: false, focused: true };
  assert.equal(wantsLock(on), true);
  assert.equal(wantsLock({ ...on, ctrl: true }), false, 'Ctrl shows the cursor');
  assert.equal(wantsLock({ ...on, uiOpen: true }), false, 'a window shows the cursor');
  assert.equal(wantsLock({ ...on, mode: 'classic' }), false, 'Classic mouse never takes the pointer');
  assert.equal(wantsLock({ ...on, touch: true }), false, 'touch is unchanged');
  assert.equal(wantsLock({ ...on, engaged: false }), false, 'not before the first click into the scene');
  assert.equal(wantsLock({ ...on, active: false }), false);
  assert.equal(wantsLock({ ...on, focused: false }), false);
});

test('mouse aim: a lock the browser dropped on Esc is passed on as Esc, the release by the game is not', async () => {
  const { unlockMeansEscape, aimPoint, AIM_REACH } = await import('../../src/ui/mouse-aim.js');
  assert.equal(unlockMeansEscape({ byScript: false, focused: true, escAgoMs: Infinity }), true);
  assert.equal(unlockMeansEscape({ byScript: true, focused: true }), false, 'Ctrl or a window released it');
  assert.equal(unlockMeansEscape({ byScript: false, focused: false }), false, 'Alt+Tab');
  assert.equal(unlockMeansEscape({ byScript: false, focused: true, escAgoMs: 20 }), false, 'the page saw the real key');
  // the crosshair aims along the ground direction of the camera (CameraRig.groundAxes: fwd = [-sin yaw, -cos yaw])
  const rig = new CameraRig(new PerspectiveCamera(), new CollisionWorld());
  for (const yaw of [0, 0.7, -2.1]) {
    rig.yaw = yaw;
    const { fwd } = rig.groundAxes(), p = aimPoint([3, 1, -4], yaw);
    assert.ok(Math.abs(p[0] - (3 + fwd.x * AIM_REACH)) < 1e-9 && Math.abs(p[2] - (-4 + fwd.y * AIM_REACH)) < 1e-9);
    assert.equal(p[1], 1);
  }
});

test('mouse aim: a held pointer turns the camera with no button, and its buttons are not walk orders', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/ui/input.js', import.meta.url), 'utf8');
  assert.match(src, /if \(this\.lookLocked && e\.pointerType === 'mouse'\) \{ this\.dragX \+= e\.movementX \* AIM_LOOK_SCALE/);
  assert.match(src, /if \(this\.aimMode && e\.pointerType === 'mouse'\) return;/);
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /mode: \(\) => \(judge \? 'classic' : gameSettings\.mouseMode\)/);
  assert.match(boot, /mouseAim\.update\(\);/);
});

// ---- one game window at a time (owner 13.11): ui/window-toggle.js
test('the game menu: the same key closes it, another key switches the tab, a plain open keeps it', async () => {
  const { menuKeyAction } = await import('../../src/ui/window-toggle.js');
  assert.equal(menuKeyAction({ open: false }, 'inventory'), 'open');
  assert.equal(menuKeyAction({ open: true, tab: 'inventory' }, 'inventory'), 'close');
  assert.equal(menuKeyAction({ open: true, tab: 'profile' }, 'inventory'), 'switch');
  assert.equal(menuKeyAction({ open: true, tab: 'inventory' }, 'inventory', false), 'stay');
  assert.equal(menuKeyAction({ open: true, tab: 'inventory' }, 'town', false), 'switch');
  assert.equal(menuKeyAction(null, 'profile'), 'open');
});

test('one window at a time: opening one closes the others, its own key closes it', async () => {
  const W = await import('../../src/ui/window-toggle.js');
  W.resetWindows();
  const mk = () => { const w = { on: false, isOpen: () => w.on, close: () => { w.on = false; } }; return w; };
  const menu = mk(), sheet = mk(), journal = mk();
  W.registerWindow('menu', menu); W.registerWindow('character', sheet); const off = W.registerWindow('journal', journal);
  assert.equal(W.pressWindow('menu'), true); menu.on = true;
  assert.deepEqual(W.openWindows(), ['menu']);
  assert.equal(W.pressWindow('character'), true, 'another key: the menu closes, the sheet may open'); sheet.on = true;
  assert.equal(menu.on, false);
  assert.deepEqual(W.openWindows(), ['character']);
  assert.equal(W.pressWindow('character'), false, 'the same key closes it');
  assert.equal(sheet.on, false);
  journal.on = true; menu.on = true;
  assert.deepEqual(W.claimWindow('menu'), ['journal']);
  assert.equal(W.isWindowOpen('menu'), true);
  off(); journal.on = true;
  assert.deepEqual(W.claimWindow('menu'), [], 'a removed window is left alone');
  W.resetWindows();
});

test('one window at a time: the menu, the journal, the market and the HUD windows all register', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (f) => readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');
  assert.match(read('boot-world.js'), /registerWindow\('menu'/);
  assert.match(read('boot-world.js'), /openProfileFor\(null, typeof d\.tab === 'string' \? d\.tab : 'profile', !!d\.id\)/);
  assert.match(read('scenes/town-quests.js'), /registerWindow\('journal'/);
  assert.match(read('market/index.js'), /registerWindow\('market'/);
  for (const id of ['skills', 'character', 'help']) assert.ok(read('rpg/index.js').includes(`['${id}', () =>`), id);
});

test('Esc closes the top-most open window first; the menu only when none is open (QA P1 14.11)', async () => {
  const W = await import('../../src/ui/window-toggle.js');
  W.resetWindows();
  const mk = () => { const w = { on: false, isOpen: () => w.on, close: () => { w.on = false; } }; return w; };
  const sheet = mk(), map = mk();
  W.registerWindow('character', sheet); W.registerWindow('map', map);
  assert.equal(W.closeTopWindow(), null, 'nothing open: Esc may open the menu');
  W.claimWindow('character'); sheet.on = true;
  assert.equal(W.closeTopWindow(), 'character'); assert.equal(sheet.on, false);
  W.claimWindow('character'); sheet.on = true; W.claimWindow('map'); map.on = true;
  assert.equal(sheet.on, false, 'opening the map closed the sheet');
  sheet.on = true; // a window that opened without a claim still closes, after the claimed ones
  assert.equal(W.closeTopWindow(), 'map'); assert.equal(W.closeTopWindow(), 'character'); assert.equal(W.closeTopWindow(), null);
  W.resetWindows();
  const { readFileSync } = await import('node:fs');
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.ok(boot.indexOf('if (closeTopWindow()) return false;') > 0 && boot.indexOf('if (closeTopWindow()) return false;') < boot.indexOf("else if (!blocksWindows()) openMenu();"), 'before the menu');
});
