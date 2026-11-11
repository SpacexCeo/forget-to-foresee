// Walk-in shops and the wind swing (scenes/town-shops.js, render/swing.js): the interiors are catalogued, the door
// enters, the counter opens the door's panel, the day cycle and casts pause indoors; swing nodes follow the wind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSwingSet, swingAngles, SWING_MAX } from '../../src/render/swing.js';
import { TOWN_SHOPS, shopPrompt } from '../../src/scenes/town-layout.js';
import { assetByName } from '../../src/render/asset-catalog.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

test('three shops with interiors in the catalog and prompts in five locales', () => {
  assert.deepEqual(TOWN_SHOPS.map((s) => s.id), ['exchange', 'scribe', 'inn']);
  for (const s of TOWN_SHOPS) {
    assert.ok(assetByName(s.piece) && assetByName(s.piece).noGreybox, s.piece);
    for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
      const p = shopPrompt({ phase: 'inside', shop: s, zone: 'counter' });
      assert.ok(PLAY_MESSAGES[loc][p.key], `${loc} ${p.key}`);
      assert.ok(PLAY_MESSAGES[loc]['town.shop.enter.' + s.id], `${loc} enter ${s.id}`);
    }
  }
  assert.ok(PLAY_MESSAGES.en['town.shop.leave']);
});

test('wiring: door enters, counter opens the panel, day cycle and casts pause indoors', () => {
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /onDoor: \(id\) => \{ if \(!townShops\) return false; townShops\.enter\(id\); return true; \}/);
  assert.match(boot, /onCounter: \(id\) => townFlow\.openSpot\(id\)/);
  assert.match(boot, /!\(townShops && townShops\.inside\)\) tickDayCycle/);
  assert.match(boot, /!\(townShops && townShops\.inside\)\); \/\/ no casts indoors/);
});

test('swing: tilts with the wind, bounded, still under reduced motion', () => {
  const [ax, az] = swingAngles({ x: 1, z: 0 }, 0);
  assert.ok(Math.abs(az) > 0.05 && Math.abs(ax) <= SWING_MAX && Math.abs(az) <= SWING_MAX);
  assert.deepEqual(swingAngles({ x: 0, z: 0 }, 3), [0, 0]);
  const root = new THREE.Group(); const sign = new THREE.Group(); sign.name = 'swing_sign_exchange'; root.add(sign); root.add(new THREE.Group());
  const set = createSwingSet();
  assert.equal(set.set('h15', root), 1);
  set.update(1, true); assert.ok(sign.quaternion.equals(new THREE.Quaternion()), 'reduced motion: at rest');
  set.set('h15', null); assert.equal(set.count, 0);
});

test('props: the board beside the Exchange door, the wheel beside the Inn door, facing the street; E at the wheel opens it', async () => {
  const { besideDoor, BOARD_SPOT, WHEEL_SPOT } = await import('../../src/scenes/town-props.js');
  const door = { position: [10, 0, 0], heading: Math.PI / 2 }; // walking in faces +X
  const at = besideDoor(door, 1, 2);
  assert.ok(Math.abs(at.position[0] - 9) < 1e-9, 'out of the door, into the street');
  assert.ok(Math.abs(Math.abs(at.position[2]) - 2) < 1e-9, 'along the house front');
  assert.ok(Math.abs(at.heading - (Math.PI / 2 + Math.PI)) < 1e-9, 'facing the street');
  assert.equal(BOARD_SPOT.shop, 'exchange'); assert.equal(WHEEL_SPOT.shop, 'inn');
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /onWheel: \(\) => openProfileFor\(null, 'wheel'\)/);
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) assert.ok(PLAY_MESSAGES[loc]['spot.wheel'], loc);
});
