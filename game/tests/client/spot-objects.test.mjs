// Every interaction prompt has something to look at (owner 12.11: "in some places there is a button but no object").
// Town spots: each prompt's trigger is within 1.5 m (ground distance) of a visible object; a new spot without an object
// fails here. Archipelago interactables are built from their own model instance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOWN_SPOTS, SPOT_PROPS, TOWN_ALTAR, TOWN_PIECES, TOWN_SHOPS, townToWorld, besideDoor, WHEEL_SPOT } from '../../src/scenes/town-layout.js';

const ground = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const src = (p) => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8');

test('the mirror and the notice board stand within 1.5 m of their prompts, at the same level', () => {
  for (const [id, spot] of Object.entries(TOWN_SPOTS)) {
    const prop = SPOT_PROPS[id];
    assert.ok(prop, `spot "${id}" has no object (add it to SPOT_PROPS and scenes/town-spot-props.js)`);
    const d = ground(townToWorld(spot), townToWorld(prop.position));
    assert.ok(d > 0.3 && d <= 1.5, `${id}: object ${d.toFixed(2)} m from the trigger`);
    assert.ok(Math.abs(spot[1] - prop.position[1]) <= 1, `${id}: object on another level`);
  }
  const props = src('scenes/town-spot-props.js');
  for (const id of Object.keys(TOWN_SPOTS)) assert.match(props, new RegExp(`\\['${id}', build`), `${id} is built`);
});

test('every town spot in boot-world.js maps to an object: shop doors, the wheel prop, the spot props', () => {
  const boot = src('boot-world.js');
  const block = boot.slice(boot.indexOf('const spots = ['), boot.indexOf('];', boot.indexOf('const spots = [')));
  const ids = [...block.matchAll(/id: '([a-z_]+)'/g)].map((m) => m[1]);
  const shops = TOWN_SHOPS.map((s) => s.id);
  for (const id of ids) assert.ok(id === 'wheel' || TOWN_SPOTS[id], `spot "${id}" has no object mapping`);
  assert.match(block, /\.\.\.TOWN_SHOPS\.filter/, 'the shop doors are spots of their own shop buildings');
  for (const id of ['exchange', 'scribe', 'inn']) assert.ok(shops.includes(id), id);
  // the wheel's prompt is measured from the wheel prop itself
  assert.match(src('scenes/town-props.js'), /nearWheel: \(pos\) => !!wheelAt && Math\.hypot\(pos\[0\] - wheelAt\.position\[0\]/);
  const inn = TOWN_SHOPS.find((s) => s.id === 'inn');
  assert.ok(besideDoor(inn.door, WHEEL_SPOT.out, WHEEL_SPOT.side), 'the wheel has a place');
});

test('the altar prompt is centred on the altar model', () => {
  const piece = TOWN_PIECES.find((p) => p.name === 'town_altar');
  assert.ok(piece);
  assert.ok(ground(TOWN_ALTAR.position, piece.position) <= 1.5, 'altar trigger on the altar');
});

test('archipelago interactables are built from their model instance', () => {
  const island = src('scenes/island.js');
  const pushes = [...island.matchAll(/interactables\.push\(\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(pushes.length >= 3);
  for (const p of pushes) assert.match(p, /instance: \w+/, 'an interactable without its object: ' + p.slice(0, 60));
});
