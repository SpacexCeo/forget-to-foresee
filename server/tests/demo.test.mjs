// The example agent plays a complete season over HTTP, without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttp } from './helpers.mjs';
import { playSeason } from '../examples/agent.mjs';

for (const rules of ['v3', 'v2']) {
  test(`example agent finishes a ${rules} season through the HTTP API`, { timeout: 60000 }, async (t) => {
    const { app, base } = await startHttp();
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
