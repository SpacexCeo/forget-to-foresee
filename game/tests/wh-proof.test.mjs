// "What does this prove?" on revealed signs (readiness audit 09.11): the proof model's honest lists for every NEAR
// state, the model decoration that lets a NEAR answer between observations reach the card, and the DOM block
// (state line, recorded link, expandable panel, Copy proof) in the mini DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './lib/mini-dom.mjs';
import { proofPanelModel, attachProofViews, shortHash, STATE_KEYS } from '../src/ui/world-hud/proof-model.js';
import { verificationView } from '../src/net/near.js';
import { MESSAGES, createGameI18n } from '../src/ui/i18n/index.js';

const ROOT = '03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a';
const view = (state, extra = {}) => ({
  index: 0, local: 'ok', state, pill: ['on-chain', 'dry-run', 'mismatch'].includes(state), live: false,
  contractId: 'ftf-seasons.testnet', contractUrl: 'https://testnet.nearblocks.io/address/ftf-seasons.testnet',
  seasonId: '793f6c05e89839f2', merkleRoot: ROOT, commitTxUrl: null, commitBlock: null, revealTxUrl: null, recordedTxUrl: null, ...extra,
});
const committed = { live: true, commitTxUrl: 'https://testnet.nearblocks.io/txns/C', commitBlock: '276700000' };
const keys = (list) => list.map((x) => x.key);

test('proof model: on-chain lists the commitment (root, block, tx), the local leaf check and the contract recompute', () => {
  const m = proofPanelModel(view('on-chain', { ...committed, revealTxUrl: 'https://testnet.nearblocks.io/txns/R' }));
  assert.equal(m.line, null, 'the existing NEAR pill already says it');
  assert.equal(m.tone, 'good');
  assert.deepEqual(keys(m.proves), ['wh.proof.yes.committed', 'wh.proof.yes.leaf', 'wh.proof.yes.onchain']);
  assert.deepEqual(m.proves[0].args, { root: '03dbd458…5075769a', block: '276700000' });
  assert.equal(m.proves[0].href, 'https://testnet.nearblocks.io/txns/C');
  assert.equal(m.proves[2].href, 'https://testnet.nearblocks.io/txns/R');
  assert.deepEqual(keys(m.notProves), ['wh.proof.no.rules', 'wh.proof.no.state', 'wh.proof.no.fair']);
  assert.equal(m.recorded, null);
});

test('proof model: waiting, offline (recorded, never live), local, mismatch and a failed browser check', () => {
  const wait = proofPanelModel(view('checking'));
  assert.equal(wait.line.key, 'wh.proof.state.checking');
  assert.equal(wait.tone, 'wait');
  assert.equal(wait.proves[0].key, 'wh.proof.yes.sealed', 'not yet confirmed on NEAR: only the local seal is claimed');

  const off = proofPanelModel(view('offline', { recordedTxUrl: 'https://testnet.nearblocks.io/txns/R' }));
  assert.equal(off.line.key, 'wh.proof.state.offline');
  assert.deepEqual(off.line.args, { local: 'ok' });
  assert.deepEqual(off.recorded, { key: 'wh.proof.recorded', href: 'https://testnet.nearblocks.io/txns/R' });
  assert.ok(!keys(off.proves).includes('wh.proof.yes.onchain'), 'offline never claims the on-chain recompute');
  assert.ok(!keys(off.proves).includes('wh.proof.yes.committed'), 'nor a live commitment');

  const local = proofPanelModel(view('local'));
  assert.equal(local.line.key, 'wh.proof.state.local');
  assert.equal(local.proves[0].key, 'wh.proof.yes.sealed');

  const sm = proofPanelModel(view('season-mismatch', { live: true }));
  assert.equal(sm.line.key, 'wh.proof.state.seasonMismatch');
  assert.equal(sm.tone, 'bad');
  assert.equal(sm.proves[0].key, 'wh.proof.yes.sealed', 'a different root on-chain is not a commitment of this season');

  const bad = proofPanelModel(view('local', { local: 'fail' }));
  assert.equal(bad.proves[1].key, 'wh.proof.fail.leaf');
  assert.equal(bad.tone, 'bad');
  assert.deepEqual(bad.line.args, { local: 'fail' });

  const mm = proofPanelModel(view('mismatch', committed));
  assert.ok(keys(mm.proves).includes('wh.proof.fail.onchain'));
  const missing = proofPanelModel(view('missing', committed));
  assert.equal(missing.line.key, 'wh.proof.state.missing');
  assert.equal(missing.proves[0].key, 'wh.proof.yes.committed', 'the season is committed even when this leaf is not recorded');

  for (const k of Object.values(STATE_KEYS)) assert.ok(MESSAGES.en[k], 'missing en ' + k);
  assert.equal(shortHash('abc'), 'abc');
});

test('proof model: the English texts say what the proof does and does not show, with the ✓/✗ of the browser check', () => {
  const i18n = createGameI18n('en', { onMissing: (k) => { throw new Error('missing ' + k); } });
  assert.equal(i18n.t('wh.proof.state.offline', { local: 'ok' }), 'Could not reach NEAR testnet — local browser check only: ✓');
  assert.equal(i18n.t('wh.proof.state.offline', { local: 'fail' }), 'Could not reach NEAR testnet — local browser check only: ✗');
  assert.match(i18n.t('wh.proof.no.rules'), /browser runs them locally/);
  assert.match(i18n.t('wh.proof.recorded'), /not checked now/);
  for (const loc of ['ru', 'uk', 'it', 'zh']) {
    const t = createGameI18n(loc, { onMissing: (k) => { throw new Error(loc + ' missing ' + k); } });
    assert.match(t.t('wh.proof.state.offline', { local: 'ok' }), /NEAR.*✓/);
    assert.notEqual(t.t('wh.proof.what'), i18n.t('wh.proof.what'));
  }
});

test('attachProofViews: decorates resolved cards, and replaces the signs object only when a NEAR state changed', () => {
  let state = 'checking';
  const near = {
    verification: (index, local, root) => verificationView({ state, seasonId: 's', contractUrl: 'c', commitTxUrl: 't', onChain: { committed_at_block: '9' } }, state === 'committed' ? { state: 'on-chain', txUrl: 'x' } : null, { index, local, merkleRoot: root, deployment: {} }),
    leafBadge: () => (state === 'committed' ? { state: 'on-chain', labelKey: 'wh.sign.near.leaf' } : null),
  };
  const signs = { open: true, filter: 'all', items: [{ id: 'p1', state: 'active', verified: 'pending' }, { id: 'c0', state: 'resolved', verified: 'ok', proof: { index: 0, leaf: 'aa' } }] };
  const m1 = attachProofViews({ signs }, { near, merkleRoot: ROOT });
  assert.notEqual(m1.signs, signs);
  assert.equal(m1.signs.items[0].proofView, undefined, 'an active sign has no proof');
  assert.equal(m1.signs.items[1].proofView.state, 'checking');
  const again = attachProofViews({ signs: m1.signs }, { near, merkleRoot: ROOT });
  assert.equal(again.signs, m1.signs, 'nothing changed → the same object (no re-render)');
  state = 'committed';
  const m2 = attachProofViews({ signs: m1.signs }, { near, merkleRoot: ROOT });
  assert.notEqual(m2.signs, m1.signs, 'a NEAR answer between observations re-renders the card');
  assert.equal(m2.signs.items[1].proofView.state, 'on-chain');
  assert.equal(m2.signs.items[1].near.labelKey, 'wh.sign.near.leaf', 'the pill is refreshed too');
  const noNear = attachProofViews({ signs }, { near: null, merkleRoot: ROOT });
  assert.equal(noNear.signs.items[1].proofView.state, 'local', 'without a watcher the card says local');
});

test('proof block: state line, recorded link, "What does this prove?" that survives a re-render, Copy proof', async () => {
  const { doc } = installDom();
  const { proofBlock, resetProofPanels } = await import('../src/ui/world-hud/proof-panel.js');
  resetProofPanels();
  const i18n = createGameI18n('en', { onMissing: (k) => { throw new Error('missing ' + k); } });
  const sign = { id: 'c0', proofView: view('offline', { recordedTxUrl: 'https://testnet.nearblocks.io/txns/R' }) };
  const calls = [];
  const onAction = (...a) => calls.push(a);
  const b = proofBlock(i18n, sign, onAction);
  doc.body.append(b);
  assert.equal(b.querySelector('.wh-proof__state').textContent, 'Could not reach NEAR testnet — local browser check only: ✓');
  const rec = b.querySelector('.wh-proof__recorded');
  assert.equal(rec.getAttribute('href'), 'https://testnet.nearblocks.io/txns/R');
  const summary = b.querySelector('summary');
  assert.equal(summary.textContent, 'What does this prove?');
  const text = b.querySelector('details').textContent;
  assert.match(text, /sealed in this browser before trial 1: root 03dbd458…5075769a/);
  assert.match(text, /That the rules ran honestly/);
  assert.match(text, /That silk, trust or outcomes are on-chain/);
  assert.match(text, /That the schedule was chosen fairly/);
  assert.ok(!/recomputed this leaf on-chain/.test(text), 'offline: no on-chain claim');
  // clicks and Enter inside never open the card
  let stopped = 0;
  for (const fn of b.listeners.click) fn({ type: 'click', stopPropagation: () => stopped++ });
  for (const fn of b.listeners.keydown) fn({ type: 'keydown', key: 'Enter', stopPropagation: () => stopped++ });
  for (const fn of b.listeners.keydown) fn({ type: 'keydown', key: 'Escape', stopPropagation: () => stopped++ });
  assert.equal(stopped, 2, 'Escape still reaches the HUD');
  // the open state is kept when the list re-renders
  const det = b.querySelector('details');
  det.open = true; for (const fn of det.listeners.toggle) fn({ type: 'toggle' });
  assert.ok(proofBlock(i18n, sign, onAction).querySelector('details').hasAttribute('open'));
  // Copy proof: the host copies and answers done(ok)
  const copy = b.querySelector('.wh-proof__copy');
  assert.equal(copy.textContent, 'Copy proof');
  for (const fn of copy.listeners.click) fn({ type: 'click', stopPropagation() {} });
  assert.deepEqual(calls.map((c) => c.slice(0, 2)), [['copyProof', 0]]);
  calls[0][2](true);
  assert.equal(copy.textContent, 'Copied ✓');
  // a pill state shows no extra line
  const good = proofBlock(i18n, { id: 'c1', proofView: view('on-chain', { ...committed, revealTxUrl: 'https://testnet.nearblocks.io/txns/R' }) }, onAction);
  assert.equal(good.querySelector('.wh-proof__state'), null);
  assert.match(good.querySelector('details').textContent, /committed on NEAR testnet before play: root 03dbd458…5075769a, block 276700000/);
  assert.equal(proofBlock(i18n, { id: 'p' }, onAction), null, 'no proof view → nothing');
});
