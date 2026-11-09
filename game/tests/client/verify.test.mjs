// Verification anyone can repeat (docs/verify.md): the "Copy proof" export, the independent verifiers
// (tools/verify/verify.mjs, verify.py, the sha256sum one-liner), and the seed protocol ftf-seed/1 (room entropy
// committed first, player nonce after, optional public beacon, room entropy revealed at the end).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { createApi } from '../../src/net/api.js';
import { PlaySession } from '../../src/play/session.js';
import { proofExport, seasonExport, proofExportText, proofFileName, shellLine, buildProofExport, buildSeasonExport, PROOF_FORMAT } from '../../src/net/verify-export.js';
import { deriveSeed, entropyCommitment, demoRandomBytes, SEED_PROTOCOL } from '../../src/net/near-season.js';
import { fetchNearBeacon, createNearWatcher } from '../../src/net/near.js';
import { sha256 } from '../../src/game/crypto.js';

const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const VERIFY_MJS = join(ROOT, 'tools/verify/verify.mjs');
const VERIFY_PY = join(ROOT, 'tools/verify/verify.py');
const REPLAY = join(ROOT, 'game/scripts/replay-season.mjs');
const observe = async (tr) => (await tr.observe()).body.observation;
const tmp = mkdtempSync(join(tmpdir(), 'ftf-verify-'));
let n = 0;
const file = (name, doc) => { const p = join(tmp, `${++n}-${name}`); writeFileSync(p, proofExportText(doc)); return p; };
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const hasPython = spawnSync('python3', ['--version']).status === 0;
const hasSha = spawnSync('sh', ['-c', 'command -v sha256sum']).status === 0;

async function cmd(tr, type, args = {}) {
  const o = await observe(tr);
  return tr.command({ actionId: `verify-${type}-${++n}-${o.version}`, expectedVersion: o.version, type, args });
}
/** Plays trials until `ticks` reveals exist (end_tick; one-click decisions answered as they come). */
async function playTo(tr, ticks) {
  for (let guard = 0; guard < 80; guard++) {
    const o = await observe(tr);
    if (o.chronicle.length >= ticks || o.season.phase === 'end') return o;
    const avail = o.availableActions.map((a) => a.type);
    if (avail.includes('end_tick')) { await cmd(tr, 'end_tick'); continue; }
    if (avail.includes('cast_vote')) { await cmd(tr, 'cast_vote', { accept: true }); continue; }
    if (avail.includes('set_heir')) { await cmd(tr, 'set_heir', { heir: false }); continue; }
    const offer = o.availableActions.find((a) => a.type === 'decline_offer');
    if (offer) { await cmd(tr, 'decline_offer', offer.args); continue; }
    throw new Error('stuck: ' + avail.join(','));
  }
  throw new Error('season did not advance');
}
async function proofsOf(tr, obs) { const out = []; for (const c of obs.chronicle) out.push((await tr.proof(c.index)).body.proof); return out; }

test('proof export: one revealed sign carries everything the verifier needs and nothing secret', async () => {
  const tr = createLocalTransport({ seedHex: JUDGE_SEED });
  await cmd(tr, 'start_season');
  const obs = await playTo(tr, 1);
  const proof = (await tr.proof(obs.chronicle[0].index)).body.proof;
  const doc = proofExport({ obs, proof, fixedSeedHex: JUDGE_SEED, now: () => new Date('2026-11-08T12:00:00Z') });
  assert.equal(doc.format, PROOF_FORMAT);
  assert.equal(doc.season.id, '793f6c05e89839f2');
  assert.equal(doc.season.scheduleRoot, obs.season.merkleRoot);
  assert.equal(doc.season.leafCount, 15);
  assert.equal(doc.season.schema, 'v2');
  assert.equal(doc.season.fixedSeed, true);
  assert.equal(doc.season.seedHex, JUDGE_SEED, 'the demo seed is public');
  assert.deepEqual(doc.leaf, { index: proof.index, tick: proof.tick, canonicalEvent: proof.canonicalEvent, salt: proof.salt, leaf: proof.leaf, meaning: obs.chronicle[0].meaning });
  assert.deepEqual(doc.merklePath, proof.path);
  assert.equal(doc.contractArgs.merkle_path, proof.path);
  assert.equal(doc.recipe.shell, shellLine(doc.season, doc.leaf));
  // The recorded testnet deployment (game/src/net/near-deployment.js) names the contract; without a watcher the
  // season and leaf states are 'unknown' (the export never claims an on-chain state it did not read).
  assert.equal(doc.near.network, 'testnet');
  assert.equal(doc.near.contractId, 'ftf-seasons.testnet');
  assert.equal(doc.near.contract, 'https://testnet.nearblocks.io/address/ftf-seasons.testnet');
  assert.equal(doc.near.season, 'unknown');
  assert.equal(doc.near.leaf, 'unknown');
  assert.equal(proofExport({ obs, proof, deployment: { contractId: null } }).near, null, 'no deployment → no NEAR block');
  assert.equal(doc.exportedAt, '2026-11-08T12:00:00.000Z');
  assert.equal(proofFileName(doc), 'ftf-proof-793f6c05e89839f2-leaf-0.json');
  const text = proofExportText(doc);
  // Nothing about the other 14 leaves beyond their hashes in the path; no phrase, no truncated hash.
  const o2 = await observe(tr);
  assert.ok(!text.includes('…'), 'full hashes only');
  assert.ok(!text.includes('pepel') && !text.includes('"phrase"'), 'no Ash phrase');
  for (const p of o2.prophecies || []) if (p.salt) assert.ok(!text.includes(p.salt), 'no unrevealed salt');
  const known = new Set([doc.season.scheduleRoot, doc.season.ashKeyCommitment, doc.season.seedCommitment, proof.leaf, proof.salt, ...proof.path.map((p) => p.h)]);
  for (const h of text.match(/[0-9a-f]{64}/g) || []) assert.ok(known.has(h), `unexpected 32-byte value in the export: ${h}`);
  assert.equal(text.split(proof.salt).length - 1, 3, 'the revealed salt appears in the leaf, in contractArgs and in the shell one-liner only');
  // The HUD helper builds the same document through the session.
  const session = new PlaySession({ transport: tr, sleep: async () => {}, skipOnboarding: true, beacon: null });
  await session.refresh();
  const viaSession = await buildProofExport(session, proof.index, { fixedSeedHex: JUDGE_SEED });
  assert.deepEqual({ ...viaSession, exportedAt: null }, { ...doc, exportedAt: null });
  await assert.rejects(buildProofExport(session, 14), /not available/);
});

test('independent verifiers accept a real export and reject a tampered one (Node, Python, sha256sum)', async () => {
  const tr = createLocalTransport({ seedHex: JUDGE_SEED });
  await cmd(tr, 'start_season');
  const obs = await playTo(tr, 2);
  const proofs = await proofsOf(tr, obs);
  const one = proofExport({ obs, proof: proofs[0], fixedSeedHex: JUDGE_SEED });
  const all = seasonExport({ obs, proofs, fixedSeedHex: JUDGE_SEED });
  assert.equal(all.leaves.length, 2);
  assert.equal(proofFileName(all), 'ftf-season-793f6c05e89839f2.json');
  const good = run('node', [VERIFY_MJS, file('proof.json', one)]);
  assert.equal(good.code, 0, good.out);
  assert.match(good.out, /sha256\(preimage\) equals the leaf hash/);
  assert.match(good.out, /lands on the schedule root/);
  assert.match(good.out, /path length 4 matches the depth of a 15-leaf tree/);
  assert.match(good.out, /fixed public seed cc161d308faa67539af44205b56b6d4f/);
  assert.match(good.out, /\nOK\n$/);
  const season = run('node', [VERIFY_MJS, file('season.json', all)]);
  assert.equal(season.code, 0, season.out);
  assert.equal((season.out.match(/lands on the schedule root/g) || []).length, 2);
  const stdin = spawnSync('node', [VERIFY_MJS, '-'], { input: proofExportText(one), encoding: 'utf8' });
  assert.equal(stdin.status, 0);
  // Tampering: a different power in the event, a flipped salt nibble, a wrong root, a moved step, a false meaning.
  const tamper = (f) => { const d = structuredClone(one); f(d); return run('node', [VERIFY_MJS, file('bad.json', d)]); };
  let r = tamper((d) => { d.leaf.canonicalEvent = d.leaf.canonicalEvent.replace('"power":1', '"power":2'); });
  assert.equal(r.code, 1); assert.match(r.out, /✗ sha256\(preimage\) equals the leaf hash/); assert.match(r.out, /FAIL/);
  r = tamper((d) => { d.leaf.salt = (d.leaf.salt[0] === '0' ? '1' : '0') + d.leaf.salt.slice(1); });
  assert.equal(r.code, 1);
  r = tamper((d) => { d.season.scheduleRoot = 'ab'.repeat(32); });
  assert.equal(r.code, 1); assert.match(r.out, /✗ folding the path lands on the schedule root/);
  r = tamper((d) => { d.merklePath[0].left = !d.merklePath[0].left; });
  assert.equal(r.code, 1); assert.match(r.out, /✗ every step sits on the side its index implies/);
  r = tamper((d) => { d.leaf.meaning.power = 80; });
  assert.equal(r.code, 1); assert.match(r.out, /✗ the stated meaning/);
  r = tamper((d) => { d.format = 'other'; });
  assert.equal(r.code, 1);
  r = tamper((d) => { d.season.scheduleRoot = d.season.scheduleRoot.slice(0, 10); });
  assert.equal(r.code, 1); assert.match(r.out, /✗ schedule root is a full 32-byte hash/);
  if (hasPython) {
    const py = run('python3', ['-I', VERIFY_PY, file('proof.json', one)]);
    assert.equal(py.code, 0, py.out); assert.match(py.out, /\nOK\n$/);
    const pyAll = run('python3', ['-I', VERIFY_PY, file('season.json', all)]);
    assert.equal(pyAll.code, 0, pyAll.out);
    const d = structuredClone(one); d.leaf.canonicalEvent = d.leaf.canonicalEvent.replace('"power":1', '"power":2');
    const pyBad = run('python3', ['-I', VERIFY_PY, file('bad.json', d)]);
    assert.equal(pyBad.code, 1); assert.match(pyBad.out, /FAIL/);
  }
  if (hasSha) {
    const sh = spawnSync('sh', ['-c', one.recipe.shell], { encoding: 'utf8' });
    assert.equal(sh.status, 0);
    assert.equal(sh.stdout.split(/\s+/)[0], one.leaf.leaf, 'the documented sha256sum one-liner yields the leaf');
  }
  // The replay script regenerates the revealed events from the (public) judge seed.
  const rp = run('node', [REPLAY, JUDGE_SEED, file('season.json', all)]);
  assert.equal(rp.code, 0, rp.out); assert.match(rp.out, /OK: 2 revealed event\(s\)/);
  const rpBad = run('node', [REPLAY, '0'.repeat(32), file('season.json', all)]);
  assert.equal(rpBad.code, 1);
});

test('seed protocol: the room commits first, the nonce seals the season, the entropy is revealed at the end', async () => {
  // Deterministic room bytes so the test can compute the expected seed itself.
  const bytes = demoRandomBytes('a'.repeat(32), 'test-room');
  const api = createApi({ seasonRandomBytes: () => bytes, allowClientSeed: true });
  const created = api.createSession({ worldRules: 'free', label: 'protocol test' });
  assert.equal(created.status, 201);
  const { sessionId, token } = created.body;
  const tr = { observe: () => api.observe(sessionId, token), command: (env) => api.command(sessionId, token, env), proof: (i) => api.proof(sessionId, token, i), actions: () => api.actions(sessionId, token) };
  let obs = await observe(tr);
  const e0 = obs.season.entropy;
  assert.equal(e0.protocol, SEED_PROTOCOL);
  assert.match(e0.commitment, /^[0-9a-f]{64}$/);
  assert.equal(e0.sealed, false);
  assert.equal(e0.nonce, null); assert.equal(e0.roomEntropy, null); assert.equal(e0.seedHex, null);
  assert.equal(obs.season.merkleRoot, null, 'no root is shown before the nonce: the provisional season is not the one played');
  assert.equal(obs.season.seasonId, null);
  assert.equal(obs.season.ashKeyCommitment, null);
  assert.equal(obs.season.leafCount, 15);
  const sealedEvents = [];
  api.subscribe(sessionId, token, (ev) => { if (ev.type === 'season.sealed') sealedEvents.push(ev); });
  // A bad nonce is rejected by the schema (no "|", 1-128 chars).
  const badNonce = await cmd(tr, 'start_season', { nonce: 'a|b' });
  assert.equal(badNonce.status, 400);
  const r = await cmd(tr, 'start_season', { phrase: 'quiet tide', nonce: 'my luck word', beacon: 'near-testnet:1:AbCd' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  obs = await observe(tr);
  const e1 = obs.season.entropy;
  assert.equal(e1.sealed, true);
  assert.equal(e1.nonce, 'my luck word');
  assert.equal(e1.beacon, 'near-testnet:1:AbCd');
  assert.equal(e1.commitment, e0.commitment, 'the commitment did not change');
  assert.equal(e1.roomEntropy, null, 'the room bytes stay secret while the season runs');
  assert.equal(e1.seedHex, null);
  assert.match(obs.season.merkleRoot, /^[0-9a-f]{64}$/);
  assert.equal(sealedEvents.length, 1);
  assert.equal(sealedEvents[0].data.merkleRoot, obs.season.merkleRoot);
  assert.equal(sealedEvents[0].data.entropyCommitment, e0.commitment);
  // The same room bytes with the same nonce give the same season; another nonce gives another one.
  const again = (nonce) => { const b = demoRandomBytes('a'.repeat(32), 'test-room'); const a2 = createApi({ seasonRandomBytes: () => b }); const c = a2.createSession({ worldRules: 'free' }); return { a2, id: c.body.sessionId, tok: c.body.token, obs0: a2.observe(c.body.sessionId, c.body.token).body.observation, nonce }; };
  const same = again('my luck word');
  assert.equal(same.obs0.season.entropy.commitment, e0.commitment);
  await same.a2.command(same.id, same.tok, { actionId: 'verify-same-0001', expectedVersion: same.obs0.version, type: 'start_season', args: { phrase: 'quiet tide', nonce: same.nonce, beacon: 'near-testnet:1:AbCd' } });
  assert.equal(same.a2.observe(same.id, same.tok).body.observation.season.merkleRoot, obs.season.merkleRoot);
  const other = again('another word');
  await other.a2.command(other.id, other.tok, { actionId: 'verify-other-001', expectedVersion: other.obs0.version, type: 'start_season', args: { nonce: other.nonce, beacon: 'near-testnet:1:AbCd' } });
  assert.notEqual(other.a2.observe(other.id, other.tok).body.observation.season.merkleRoot, obs.season.merkleRoot, 'the player’s nonce changes the season');
  // Play to the end: the room entropy is revealed, and the export verifies end to end, including the seed derivation.
  obs = await playTo(tr, 15);
  assert.equal(obs.season.phase, 'end', 'season ended');
  const e2 = obs.season.entropy;
  assert.match(e2.roomEntropy, /^[0-9a-f]{64}$/);
  assert.equal(entropyCommitment(e2.roomEntropy), e0.commitment);
  assert.equal(e2.seedHex, deriveSeed(e2.roomEntropy, 'my luck word', 'near-testnet:1:AbCd'));
  assert.equal(e2.seedHex, sha256(`ftf:seed:v1|${e2.roomEntropy}|my luck word|near-testnet:1:AbCd`).slice(0, 32));
  const proofs = await proofsOf(tr, obs);
  assert.ok(proofs.length >= 14, 'most leaves revealed (a season that ends early reveals fewer)');
  const all = seasonExport({ obs, proofs });
  assert.equal(all.season.fixedSeed, false);
  assert.equal(all.season.seedHex, undefined, 'a live season never exports its seed outside the entropy block');
  assert.deepEqual(all.season.entropy, e2);
  const v = run('node', [VERIFY_MJS, file('live-season.json', all)]);
  assert.equal(v.code, 0, v.out);
  assert.match(v.out, /✓ sha256\("ftf:entropy:v1\|" \+ roomEntropy\) equals the commitment/);
  assert.match(v.out, /✓ seed = sha256/);
  const rp = run('node', [REPLAY, e2.seedHex, file('live-season.json', all)]);
  assert.equal(rp.code, 0, rp.out);
  assert.match(rp.out, new RegExp(`OK: ${proofs.length} revealed event`));
  if (hasPython) { const py = run('python3', ['-I', VERIFY_PY, file('live-season.json', all)]); assert.equal(py.code, 0, py.out); }
  // A forged reveal (another room entropy) fails the commitment check.
  const forged = structuredClone(all); forged.season.entropy.roomEntropy = 'f'.repeat(64);
  const fv = run('node', [VERIFY_MJS, file('forged.json', forged)]);
  assert.equal(fv.code, 1); assert.match(fv.out, /✗ sha256\("ftf:entropy:v1/);
  // Before the end, the export says the entropy is not revealed yet and still passes the hash checks.
  const tr2 = createLocalTransport({});
  await cmd(tr2, 'start_season', { nonce: 'early' });
  const obs2 = await playTo(tr2, 1);
  const early = proofExport({ obs: obs2, proof: (await tr2.proof(obs2.chronicle[0].index)).body.proof });
  assert.equal(early.season.entropy.roomEntropy, null);
  const ev = run('node', [VERIFY_MJS, file('early.json', early)]);
  assert.equal(ev.code, 0, ev.out); assert.match(ev.out, /not revealed yet/);
});

test('seed protocol: fixed-seed sessions ignore the nonce; start without a nonce keeps the committed provisional season', async () => {
  const j = createLocalTransport({ seedHex: JUDGE_SEED });
  const o0 = await observe(j);
  assert.deepEqual(o0.season.entropy, { protocol: 'fixed-seed', seedHex: JUDGE_SEED, sealed: true });
  assert.equal(o0.season.merkleRoot, '03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a', 'the judge season is shown from the start');
  await cmd(j, 'start_season', { nonce: 'whatever' });
  assert.equal((await observe(j)).season.merkleRoot, o0.season.merkleRoot, 'bit-exact judge season regardless of the nonce');
  const bytes = demoRandomBytes('b'.repeat(32), 'no-nonce');
  const api = createApi({ seasonRandomBytes: () => bytes });
  const c = api.createSession({ worldRules: 'free' });
  const { sessionId: id, token: tok } = c.body;
  const o1 = api.observe(id, tok).body.observation;
  api.command(id, tok, { actionId: 'verify-nononce-01', expectedVersion: o1.version, type: 'start_season', args: {} });
  const o2 = api.observe(id, tok).body.observation;
  assert.equal(o2.season.entropy.nonce, '', 'recorded as an empty nonce');
  assert.equal(o2.season.entropy.sealed, true);
  assert.match(o2.season.merkleRoot, /^[0-9a-f]{64}$/);
  // Legacy rules have no seed protocol.
  const v2 = createLocalTransport({ rules: 'v2' });
  assert.deepEqual((await observe(v2)).season.entropy, { protocol: 'none', sealed: true });
  assert.match((await observe(v2)).season.merkleRoot, /^[0-9a-f]{64}$/);
});

test('PlaySession.start sends a nonce and the beacon under the protocol, nothing for fixed seeds; the NEAR beacon fetch', async () => {
  const seen = [];
  const wrap = (tr) => ({ ...tr, command: (env) => { seen.push(env); return tr.command(env); } });
  const live = new PlaySession({ transport: wrap(createLocalTransport({})), sleep: async () => {}, skipOnboarding: true, beacon: async () => 'near-testnet:7:Hash' });
  await live.start({ phrase: 'x' });
  const start = seen.find((e) => e.type === 'start_season');
  assert.equal(start.args.phrase, 'x');
  assert.match(start.args.nonce, /^[0-9a-f]{32}$/, 'a random 16-byte nonce by default');
  assert.equal(start.args.beacon, 'near-testnet:7:Hash');
  assert.equal(live.obs.season.entropy.nonce, start.args.nonce);
  seen.length = 0;
  const typed = new PlaySession({ transport: wrap(createLocalTransport({})), sleep: async () => {}, skipOnboarding: true, beacon: null });
  await typed.start({ nonce: 'luck|word' });
  assert.equal(seen.find((e) => e.type === 'start_season').args.nonce, 'luck/word', 'the separator is replaced');
  assert.equal(seen.find((e) => e.type === 'start_season').args.beacon, undefined);
  seen.length = 0;
  const failing = new PlaySession({ transport: wrap(createLocalTransport({})), sleep: async () => {}, skipOnboarding: true, beacon: async () => { throw new Error('offline'); } });
  await failing.start();
  assert.equal(seen.find((e) => e.type === 'start_season').args.beacon, undefined, 'a failing beacon is simply absent');
  seen.length = 0;
  const judge = new PlaySession({ transport: wrap(createLocalTransport({ seedHex: JUDGE_SEED })), sleep: async () => {}, skipOnboarding: true, beacon: async () => 'near-testnet:7:Hash' });
  await judge.start();
  assert.deepEqual(seen.find((e) => e.type === 'start_season').args, {}, 'fixed-seed sessions send neither');
  // fetchNearBeacon against a fake RPC: final block header → "near-testnet:<height>:<hash>"; dead hosts → null.
  const fetch = async (url) => (url.includes('dead') ? Promise.reject(new TypeError('fetch failed')) : { ok: true, json: async () => ({ result: { header: { height: 276786815, hash: '4GRfGvhHpggr2HYF4mLttWAhLHQ4HS8NKKwTEkfPLVqs' } } }) });
  assert.equal(await fetchNearBeacon({ rpcUrls: ['https://dead.example', 'https://ok.example'], fetch }), 'near-testnet:276786815:4GRfGvhHpggr2HYF4mLttWAhLHQ4HS8NKKwTEkfPLVqs');
  assert.equal(await fetchNearBeacon({ rpcUrls: ['https://dead.example'], fetch }), null);
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  assert.equal(await fetchNearBeacon({ rpcUrls: ['https://slow.example'], fetch: hang, timeoutMs: 20 }), null);
  // The NEAR watcher ignores the provisional (unsealed) season and picks up the sealed one.
  const tr = createLocalTransport({});
  const w = createNearWatcher({ season: () => null, proof: tr.proof, deployment: { network: 'testnet', contractId: 'x.testnet', rpcUrls: ['https://a.example'], explorer: 'https://e', seasons: {} }, fetch: async () => { throw new Error('must not be called'); } });
  w.observe(await observe(tr));
  assert.equal(w.status.state, 'idle', 'nothing to ask about before the season is sealed');
});
