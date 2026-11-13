// The wake-up script (sprint 7.3, 7.11 test 1): 19 lines in order with the right speakers, every spoken line at most
// 25 words and 140 characters, no banned jargon (1.6), the fee only through {fee}, the premise of 7.1 present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import NPE from '../../src/play/locales/en-npe.js';
import TIPS from '../../src/play/locales/en-tips.js';
import { WAKEUP, BARKS, SPEAKERS, lineVars, typeMs, typedChars, silkWhole } from '../../src/npe/dialogue-script.js';

export const BANNED = /\b(NEP-?245|NEP-?171|multi-token|relayer|coordinator|RPC|gas|nonce|testnet|TEE|enclave|merkle|commit-reveal|guest account|mint|idempotency|request hash|on-chain|off-chain)\b/i;
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
const words = (s) => s.trim().split(/\s+/).length;

test('script: 19 lines W1..W19 with the speakers of 7.3; every key has text', () => {
  assert.equal(WAKEUP.length, 19);
  assert.deepEqual(WAKEUP.map((l) => l.id), Array.from({ length: 19 }, (_, i) => 'W' + (i + 1)));
  assert.deepEqual(WAKEUP.map((l) => l.speaker), ['townsfolk', 'child', 'guard', 'lamplighter', 'weaver', 'elder', 'iris', 'elder', 'elder', 'elder', 'iris', 'elder', 'elder', 'guard', 'lamplighter', 'weaver', 'elder', 'elder', 'iris']);
  for (const l of WAKEUP) { assert.ok(NPE[l.key], l.key); assert.ok(SPEAKERS[l.speaker], l.speaker); assert.ok(NPE['npe.speaker.' + l.speaker]); }
  assert.equal(WAKEUP.filter((l) => l.award).length, 0, 'the intro grants no silk: the welcome is the story\'s one stipend (TWIST_DONE)');
});

test('script: every spoken line (dialogue, barks, quest givers) is at most 25 words and 140 characters once filled', () => {
  const v = lineVars('');
  const spoken = [...WAKEUP.map((l) => NPE[l.key]), ...BARKS.map((k) => NPE[k]), ...Object.keys(NPE).filter((k) => k.startsWith('npc.talk.')).map((k) => NPE[k])];
  assert.ok(spoken.length >= 19 + 10 + 16);
  for (const s of spoken) { const f = fill(s, v); assert.ok(words(f) <= 25, `${words(f)} words: ${f}`); assert.ok(f.length <= 140, `${f.length} chars: ${f}`); }
});

test('script: no banned jargon in player text (curious.* allowed); no literal portal fee anywhere', () => {
  for (const [k, s] of Object.entries({ ...NPE, ...TIPS })) {
    if (!k.startsWith('curious.') && k !== 'gloss.testnet.term') assert.doesNotMatch(s, BANNED, k); // the glossary entry names the term it explains
    assert.doesNotMatch(s, /\b(200|20000|20,000|10,000|10000)\b/, `${k}: use {fee}`);
    assert.doesNotMatch(s, /\bwool\b/i, k);
  }
  assert.match(NPE['npe.w13'], /\{fee\} silk/); assert.match(NPE['npe.w18'], /\{fee\} silk/); assert.doesNotMatch(NPE['npe.w17'], /\{stipend\}|silk/, 'W17 promises no silk now');
});

test('script: the premise of 7.1 is said (Guests and a gift, nobody speaks their tongue, elders at the Shell, a reward, the fee, hunt/gather/quests)', () => {
  const all = WAKEUP.map((l) => NPE[l.key]).join(' ');
  for (const re of [/Guests arrived and left us a gift/, /none of us speaks their tongue/, /elders have gathered at the Shell/, /reward you generously/, /\{fee\} silk/, /hunt, gather, trade/, /Gate-Loom/]) assert.match(all, re);
});

test('script: placeholders come from config; typing is 40 cps and instant under reduced motion', () => {
  assert.deepEqual(lineVars(''), { fee: '200', stipend: '10', end: '15 November' }, 'the real fee and stipend from expedition-config');
  assert.equal(lineVars('?portalFee=5').fee, '5', 'the visible QA fee follows config');
  assert.equal(silkWhole(1250), '12.5'); assert.equal(silkWhole(20000), '200');
  assert.equal(typeMs('a'.repeat(40)), 1000); assert.equal(typeMs('a'.repeat(40), true), 0);
  assert.equal(typedChars('abcdefghij', 100), 4); assert.equal(typedChars('abcdefghij', 0, true), 10); assert.equal(typedChars('abc', 99999), 3);
});

test('barks: the intro lines join the crowd rotation when passed, never for a hired agent', async () => {
  const { barkCandidates } = await import('../../src/scenes/barks.js');
  const base = barkCandidates({ key: 'weaver' });
  const withNpe = barkCandidates({ key: 'weaver', extra: BARKS });
  assert.deepEqual(withNpe, [...base, ...BARKS]);
  assert.deepEqual(barkCandidates({ key: 'guard', hired: true, extra: BARKS }), ['bark.hired.1', 'bark.hired.2']);
  for (const k of BARKS) assert.ok(NPE[k], k);
});
