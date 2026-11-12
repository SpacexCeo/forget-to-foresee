// tools/verify-chest: a simulated season passes; any changed record fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitment, seasonSeed, drawRandom, replayDraws, nftTierOf } from '../lib/chest-deck.js';
import { hex, personalMessageHash, signHashForTest } from '../lib/tee-crypto.js';
import { verifyChest } from '../../tools/verify-chest/lib.mjs';
import { seedRequest } from '../../tools/chest/seed.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
function season(n = 120) {
  const c = commitment('s1');
  const request_body = JSON.stringify(seedRequest('s1', c.root, 'm'));
  const signed_text = `${sha(request_body)}:${sha('{"id":"c"}')}`;
  const signature = '0x' + hex(signHashForTest(personalMessageHash(signed_text), '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'));
  const block_random = randomBytes(32);
  const seed = seasonSeed(signature, block_random);
  const openings = [];
  for (let k = 0; k < n; k++) { const br = randomBytes(32); openings.push({ index: k, account_id: `p${k % 3}.testnet`, block_random: br.toString('hex'), random: drawRandom(seed, k, br).toString('hex') }); }
  replayDraws(openings).forEach((p, k) => { const t = nftTierOf(p); Object.assign(openings[k], { position: p, nft: !!t, tier: t, token_id: t ? `s1-${k}` : null }); });
  const info = { season: 's1', root: c.root, deck_sha256: c.deck_sha256, committed_block: '100', opened: n, nft_minted: openings.filter((o) => o.nft).length, size: 10000,
    seed: { seed: seed.toString('hex'), request_body, signed_text, signature, signing_address: '0x2c7536e3605d9c16a7a3d7b1898e529396a65c23', block_random: block_random.toString('hex'), block: '105' } };
  return { info, openings };
}

test('a simulated season passes every check', () => {
  const d = season();
  const nftIx = d.openings.findIndex((o) => o.nft);
  const r = verifyChest({ ...d, index: 7 });
  assert.equal(r.pass, true, r.lines.filter(([ok]) => ok === false).map(([, t]) => t).join('\n'));
  if (nftIx >= 0) assert.equal(verifyChest({ ...d, index: nftIx, nftToken: { owner_id: d.openings[nftIx].account_id } }).pass, true);
});

test('tampering fails: position, random, counters, seed, root', () => {
  const t = (fn) => { const d = season(); fn(d); return verifyChest({ ...d, index: 3 }).pass; };
  assert.equal(t((d) => { d.openings[3].position = (d.openings[3].position + 1) % 10000; }), false);
  assert.equal(t((d) => { d.openings[5].block_random = '00'.repeat(32); }), false);
  assert.equal(t((d) => { d.info.nft_minted += 1; }), false);
  assert.equal(t((d) => { d.info.seed.seed = 'ab'.repeat(32); }), false);
  assert.equal(t((d) => { d.info.seed.block = '99'; }), false);
  assert.equal(t((d) => { d.info.root = '00'.repeat(32); }), false);
  assert.equal(t((d) => { d.info.seed.signing_address = '0x' + '11'.repeat(20); }), false);
});

test('CLI offline: PASS and exit 0', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'ftf-chest-')), 'd.json');
  writeFileSync(f, JSON.stringify(season(30)));
  const r = spawnSync(process.execPath, [new URL('../../tools/verify-chest/verify.mjs', import.meta.url).pathname, '--offline', f, '--index', '2'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /PASS\n$/);
});
