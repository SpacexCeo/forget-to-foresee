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
