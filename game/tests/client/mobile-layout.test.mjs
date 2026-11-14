// The phone layout pass (mobile audit 14.11 on a real GPU, 390x844, 844x390, 360x740, 768x1024): what was cut off or
// covered, pinned so it does not come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { premisePolicy } from '../../src/ui/premise.js';

const src = (p) => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8');

test('phones: the quest tracker ends left of the photo button (they overlapped by 14 px at every phone width)', () => {
  const css = src('rpg/hud-style.js');
  const m = css.match(/html\.rpg-on \.ft \{ top: calc\(80px[^}]*width: calc\(100vw - (\d+)px/);
  assert.ok(m, 'the phone tracker rule');
  const photo = css.match(/html\.rpg-on \.ftf-photo-open \{ top: calc\(94px[^}]*right: calc\((\d+)px[^}]*width: (\d+)px/);
  assert.ok(photo, 'the phone photo button rule');
  const left = 14; // the tracker spans [left, 100vw - n + left]
  assert.ok(Number(m[1]) - left >= Number(photo[1]) + Number(photo[2]), `tracker right edge (100vw - ${Number(m[1]) - 14}) clears the photo button (100vw - ${Number(photo[1]) + Number(photo[2])})`);
});

test('phones: the game menu and the market never grow past a 360 px screen', () => {
  assert.match(src('play/game-menu.js'), /\.gm-panel \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(src('play/game-menu.js'), /\.gm-head \.gm-x \{ flex: 0 0 44px; \}/);
  const mk = src('market/market-ui.js');
  assert.match(mk, /\.mk2-wrap \{ padding: 8px; grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(mk, /\.mk2-tabs \{ overflow-x: auto;/);
});

test('tablets: the altar label is kept below the quest tracker where they meet', () => {
  assert.match(src('boot-world.js'), /const under = fr && fr\.height > 0 && x \+ half > fr\.left && x - half < fr\.right \? fr\.bottom/);
});

test('the Glass Shoal link opens on the fight with no premise card over its Leave button', () => {
  assert.equal(premisePolicy(new URLSearchParams('shoal=arena')).show, false);
  assert.equal(premisePolicy(new URLSearchParams('')).show, true);
});

test('phones: the dialogue box fits the screen and sits above the bottom tray; the menu × is pinned to the corner', () => {
  const flow = src('scenes/town-flow.js');
  assert.match(flow, /\.ftf-quest-talk \{ max-height: calc\(100dvh - 32px/);
  assert.match(flow, /@media \(max-height: 500px\) \{ \.ftf-quest-talk \{ bottom: calc\(8px/);
  assert.match(flow, /\.ftf-quest-talk \{ bottom: calc\(60px/);
  assert.match(src('play/game-menu.js'), /@media \(max-width: 480px\) \{ \.gm-head \{ padding-right: 64px; flex-wrap: wrap; \} \.gm-head \.gm-x \{ position: absolute;/);
});

test('the inventory: the rare / epic / legendary shine never takes the clicks meant for Open', () => {
  const m = src('play/game-menu.js').match(/\.gm-card\[data-rarity="rare"\]::after[^{]*\{([^}]*)\}/);
  assert.ok(m, 'the shine rule');
  assert.match(m[1], /pointer-events: none/);
});
