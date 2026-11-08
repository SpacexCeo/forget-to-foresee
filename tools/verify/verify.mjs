#!/usr/bin/env node
// Independent verifier for Forget to Foresee proof exports (format "ftf-proof/1").
// Zero dependencies: Node 20+ and its built-in SHA-256 (node:crypto), nothing from the game's own code.
//
//   node tools/verify/verify.mjs proof.json          # one revealed sign ("Copy proof" in Signs & Visions)
//   node tools/verify/verify.mjs season.json         # every revealed sign of a season ("Copy season proof")
//   cat proof.json | node tools/verify/verify.mjs -  # from stdin
//
// Prints each check and ends with OK (exit 0) or FAIL (exit 1). What a pass means, in plain words:
//   * the revealed event, with its salt, hashes to the leaf the game showed (the byte recipe is in the file);
//   * that leaf, folded along the Merkle path, lands exactly on the schedule root that was shown before trial 1;
//   * so this event was fixed before the season started and was not changed afterwards.
// What it does not prove on its own: that the season was chosen fairly. For that the export may carry an
// `entropy` block (protocol ftf-seed/1): a commitment to the room's random bytes shown before the player's nonce
// was sent, and after the season ends the bytes themselves; this file checks the commitment and the seed derivation,
// and game/scripts/replay-season.mjs regenerates the schedule from that seed with the published rules.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sha256 = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;
let failed = 0;
const ok = (what, extra = '') => console.log(`  ✓ ${what}${extra ? '  ' + extra : ''}`);
const bad = (what, extra = '') => { failed++; console.log(`  ✗ ${what}${extra ? '  ' + extra : ''}`); };
const check = (cond, what, extra) => (cond ? ok(what, extra) : bad(what, extra));
const short = (h) => (typeof h === 'string' && h.length > 16 ? h.slice(0, 8) + '…' + h.slice(-8) : String(h));

function parseCanonical(s) {
  // Accept only the exact byte form the game hashes: {"t":T,"place":P,"action":A,"power":W,"delay":D,"dots":O}
  const m = /^\{"t":(\d+),"place":(\d),"action":(\d),"power":(\d),"delay":(\d),"dots":(\d)\}$/.exec(s);
  if (!m) return null;
  const [t, place, action, power, delay, dots] = m.slice(1).map(Number);
  if (place > 3 || action > 3 || power > 3 || dots > 3 || delay < 1 || delay > 4 || delay >= t) return null;
  return { t, place, action, power, delay, dots };
}

function foldPath(leaf, path) {
  let node = leaf;
  for (const step of path) node = step.left ? sha256(step.h + node) : sha256(node + step.h);
  return node;
}

function verifyLeaf(season, leaf, path, label) {
  console.log(`${label}: index ${leaf.index}, tick ${leaf.tick}, event ${leaf.canonicalEvent}`);
  const ev = parseCanonical(leaf.canonicalEvent);
  check(!!ev, 'canonical event has the exact byte form and v2 ranges');
  check(/^[0-9a-f]{64,128}$/.test(leaf.salt) && leaf.salt.length % 2 === 0, 'salt is 32-64 bytes of lowercase hex', `(${leaf.salt.length / 2} bytes)`);
  const preimage = `ftf:leaf:${season.schema}|${season.id}|${leaf.index}|${leaf.canonicalEvent}|${leaf.salt}`;
  const recomputed = sha256(preimage);
  check(recomputed === leaf.leaf, 'sha256(preimage) equals the leaf hash', short(recomputed));
  check(Array.isArray(path) && path.every((s) => HEX64.test(s.h) && typeof s.left === 'boolean'), `Merkle path has ${Array.isArray(path) ? path.length : 0} well-formed steps`);
  if (season.leafCount != null) {
    let depth = 0; for (let n = season.leafCount; n > 1; n = Math.ceil(n / 2)) depth++;
    check(path.length === depth, `path length ${path.length} matches the depth of a ${season.leafCount}-leaf tree`);
    let idx = leaf.index;
    check(path.every((s) => { const sibLeft = (idx & 1) === 1; idx >>= 1; return s.left === sibLeft; }), 'every step sits on the side its index implies');
  }
  const root = foldPath(recomputed, path);
  check(root === season.scheduleRoot, 'folding the path lands on the schedule root', short(root));
  if (ev && leaf.meaning) {
    const shells = ['I', 'II', 'III', 'IV'], actions = ['gift', 'storm', 'silence', 'call'], powers = [10, 20, 40, 80];
    const m = leaf.meaning;
    const same = (m.place == null || m.place === ev.place + 1) && (m.action == null || String(m.action).toLowerCase() === actions[ev.action]) && (m.power == null || m.power === powers[ev.power]) && (m.delay == null || m.delay === ev.delay);
    check(same, `the stated meaning (Shell ${shells[ev.place]}, ${actions[ev.action]}, power ${powers[ev.power]}, delay ${ev.delay}) is what the bytes say`);
  }
}

function verifyEntropy(season) {
  const e = season.entropy;
  if (!e || e.protocol === 'fixed-seed') { console.log(`season entropy: ${season.fixedSeed ? `fixed public seed ${season.seedHex} (demo season: anyone can regenerate it, nobody can claim it was random)` : 'not exported'}`); return; }
  if (e.protocol === 'none') { console.log('season entropy: no seed protocol (legacy rules mode)'); return; }
  console.log(`season entropy: protocol ${e.protocol}`);
  if (e.protocol !== 'ftf-seed/1') { bad('unknown entropy protocol'); return; }
  check(HEX64.test(e.commitment || ''), 'room entropy commitment present (shown before the nonce was sent)', short(e.commitment));
  check(typeof e.nonce === 'string' && e.nonce.length <= 128, e.nonce === '' ? 'player nonce recorded as empty (the player gave none)' : 'player nonce present', JSON.stringify(e.nonce).slice(0, 60));
  if (e.roomEntropy == null) { console.log('  · room entropy not revealed yet (the season has not ended): commitment and nonce are recorded, derivation checked after the reveal'); return; }
  check(HEX64.test(e.roomEntropy), 'room entropy is 32 bytes of hex');
  check(sha256(`ftf:entropy:v1|${e.roomEntropy}`) === e.commitment, 'sha256("ftf:entropy:v1|" + roomEntropy) equals the commitment');
  const seed = sha256(`ftf:seed:v1|${e.roomEntropy}|${e.nonce}|${e.beacon ?? ''}`).slice(0, 32);
  check(seed === e.seedHex, 'seed = sha256("ftf:seed:v1|" + roomEntropy + "|" + nonce + "|" + beacon)[0:32]', seed);
  console.log('  · regenerate the schedule from this seed with the published rules: cd game && node scripts/replay-season.mjs ' + seed + ' <this file>');
}

function main() {
  const arg = process.argv[2];
  if (!arg || arg === '--help' || arg === '-h') {
    console.log('usage: node tools/verify/verify.mjs <proof.json | ->\n  Checks a Forget to Foresee proof export (format ftf-proof/1): the leaf hash, the Merkle path to the\n  schedule root, the stated meaning, Ash\'s key when revealed and the seed protocol. Exit 0 = OK, 1 = FAIL.');
    process.exit(arg ? 0 : 2);
  }
  const text = arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8');
  const doc = JSON.parse(text);
  if (doc.format !== 'ftf-proof/1') { console.log(`FAIL: unknown format ${JSON.stringify(doc.format)}`); process.exit(1); }
  const s = doc.season;
  console.log(`${doc.game || 'ftf'} proof export, season ${s.id} (rules ${s.rules}, commitment schema ${s.schema})`);
  console.log(`schedule root ${s.scheduleRoot}`);
  check(HEX64.test(s.scheduleRoot || ''), 'schedule root is a full 32-byte hash');
  check(/^[0-9a-f]{8,64}$/.test(s.id || ''), 'season id is lowercase hex');
  if (doc.leaf) verifyLeaf(s, doc.leaf, doc.merklePath, 'leaf');
  else if (Array.isArray(doc.leaves) && doc.leaves.length) for (const l of doc.leaves) verifyLeaf(s, l.leaf, l.merklePath, 'leaf');
  else bad('the export has neither a leaf nor leaves');
  if (s.ashKey && s.ashKey.phrase != null) {
    check(sha256(`ftf:key:${s.schema}|${s.id}|${s.ashKey.phrase}|${s.ashKey.salt}`) === s.ashKeyCommitment, "Ash's revealed phrase and salt hash to the key commitment");
  }
  verifyEntropy(s);
  if (doc.near && doc.near.contractId) console.log(`NEAR testnet: contract ${doc.near.contractId}, season ${doc.near.season}${doc.near.leaf ? `, leaf ${doc.near.leaf}` : ''} (the contract's check_leaf view accepts the same arguments; see contractArgs)`);
  console.log(failed ? `FAIL (${failed} check${failed > 1 ? 's' : ''} failed)` : 'OK');
  process.exit(failed ? 1 : 0);
}

main();
