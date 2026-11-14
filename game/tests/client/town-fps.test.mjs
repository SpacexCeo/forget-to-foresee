// Town frame cost on a strong GPU (14.11, RTX 5090 at 2x supersampling): the AO is computed at the screen's own
// resolution whatever the supersampling, so the extra pixels go to edges and textures, not to a soft occlusion term.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aoScaleFor } from '../../src/render/post.js';

test('the AO buffers follow the tier, divided by the supersampling (never above the screen resolution)', () => {
  assert.equal(aoScaleFor(1, 1), 1, 'ultra at 1x: full resolution as before');
  assert.equal(aoScaleFor(0.5, 1), 0.5, 'high: half as before');
  assert.equal(aoScaleFor(1, 2), 0.5, 'ultra at 2x: the screen\'s own 1080p, not 4K');
  assert.equal(aoScaleFor(1, 1.5), 1 / 1.5);
  assert.equal(aoScaleFor(0.5, 0.7), 0.5, 'a phone\'s lowered resolution never raises it');
  assert.equal(aoScaleFor(1, undefined), 1);
});

test('lookdev tells the post stack its supersampling before resizing it', () => {
  const src = readFileSync(new URL('../../src/render/lookdev.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('  applyPixelRatio() {'), src.indexOf('  applyTier() {'));
  assert.ok(body.indexOf('this.post.superScale = this.pixelScale;') >= 0 && body.indexOf('this.post.superScale') < body.indexOf('this.post.setSize'));
});
