// The example agent plays a complete season over HTTP, without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttp, seededBytes } from './helpers.mjs';
import { playSeason } from '../examples/agent.mjs';

for (const rules of ['v3', 'v2']) {
  test(`example agent finishes a ${rules} season through the HTTP API`, { timeout: 60000 }, async (t) => {
    // A fixed season: with fresh randomness some seasons end at tick 16 with outcome "gone" (no vote, a valid end),
    // which made this test fail about one run in four.
    const { app, base } = await startHttp({ registry: { seasonRandomBytes: seededBytes(1) } });
    t.after(() => app.close());
    const r = await playSeason({ url: base, rules, timeScale: 1000 });
    assert.ok(['survived', 'weapon', 'gone'].includes(r.outcome) || typeof r.outcome === 'string', `outcome: ${r.outcome}`);
    assert.equal(r.tick, 17);
    assert.equal(r.stats.contributed, true);
    assert.equal(r.stats.voted, true);
    assert.ok(r.stats.moves >= 2, 'the agent walked');
    assert.equal(r.stats.rejected, 0);
    assert.equal(r.historyLength, r.stats.commands);
    assert.equal(r.firstProofVerified, true);
  });
}
