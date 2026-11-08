// Chapter films (src/play/chapters.js): the chapter model and triggers (both play modes, deterministic per
// seed), the season ledger built from the player's own observations and events, the film scripts (every
// line renders in all five languages from facts of the observation), cheap / reduced-motion variants, the
// seen store and the Chronicle rows. The 3D player is browser-only; its scripts are checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';
import { ShellHub, signsByShell } from '../../src/play/hub.js';
import { PLAY_MESSAGES, createPlayI18n, renderMsg, resolvePlayArg } from '../../src/play/i18n.js';
import {
  CHAPTERS, CHAPTER_IDS, OUTCOMES, chapterFor, dueFilm, missedFilms, seasonKey, SeasonLedger, buildFilm, resolveLineArgs,
  createSeenStore, createChapterDirector, SHOT_SECONDS, TITLE_SECONDS, CARD_SECONDS, CHAPTERS_KEY,
} from '../../src/play/chapters.js';

const JUDGE = 'cc161d308faa67539af44205b56b6d4f';
const SEED2 = '0123456789abcdef0123456789abcdef';
const noPause = async () => {};
const LOCALES = ['en', 'uk', 'ru', 'it', 'zh'];

function memStorage() {
  const m = new Map();
  return { getJSON: (k, f = null) => (m.has(k) ? JSON.parse(m.get(k)) : f), setJSON: (k, v) => m.set(k, JSON.stringify(v)), map: m };
}

/** Wires a director to a session exactly like the 3D client does, and records the films that became due. */
function attach(session, director) {
  const due = [];
  const fire = (id) => { if (id && !due.includes(id)) { due.push(id); director.build(id); director.markSeen(id); } };
  session.on('event', (ev) => director.event(ev));
  session.on('result', (r) => director.command(r.type, r.args, r.ok));
  session.on('obs', (o) => fire(director.observe(o)));
  fire(director.observe(session.obs));
  return due;
}

/** A full season through the Shell hub (the default play mode), films attached. */
async function hubSeason(seedHex, storage = null) {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  const hub = new ShellHub({ session: s, sleep: noPause, pauseMs: 0 });
  const director = createChapterDirector({ obs: s.obs, storage, mode: 'hub' });
  const due = attach(s, director);
  let guard = 0;
  while (s.obs.season.phase !== 'end' && guard++ < 80) {
    if (hub.card) {
      const choice = { offer: 'later', fragment: 'give', speak: 'speak', key: 'later', vote: 'accept', heir: 'keep' }[hub.card.kind];
      await hub.resolve(choice);
      continue;
    }
    const n = [...signsByShell(s.obs)].find(([, v]) => v.length);
    if (n && s.obs.iris.attention > 0 && s.obs.iris.silk >= 10) { await hub.flyTo(n[0]); await hub.stake(); await hub.leave(); } else await hub.advance();
  }
  return { s, director, due };
}

/** A full season in the walking mode: end the trial with T, vote at the Scroll, films attached. */
async function walkSeason(seedHex, storage = null) {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex }) });
  await s.start();
  const director = createChapterDirector({ obs: s.obs, storage, mode: 'walk' });
  const due = attach(s, director);
  let guard = 0;
  while (s.obs.season.phase !== 'end' && guard++ < 40) {
    if (s.obs.season.phase === 'vote') { await s.send('move', { to: 'scroll' }, { silent: true }); await s.send('cast_vote', { accept: true }); }
    else await s.send('end_tick', {});
  }
  return { s, director, due };
}

test('chapters: the model covers every trial once, the ending follows the outcome, nothing in the intro', () => {
  const obs = (tick, phase = 'play', outcome = null) => ({ season: { tick, phase, outcome } });
  assert.equal(chapterFor(obs(1, 'intro')), null);
  const byTick = Array.from({ length: 17 }, (_, i) => chapterFor(obs(i + 1)));
  assert.deepEqual(byTick, ['arrival', 'arrival', 'arrival', 'arrival', 'language', 'language', 'language', 'language', 'trust', 'trust', 'trust', 'trust', 'crisis', 'vote', 'vote', 'vote', 'vote']);
  assert.equal(chapterFor(obs(17, 'vote')), 'vote');
  assert.equal(chapterFor(obs(17, 'end', 'gift')), 'ending');
  assert.equal(chapterFor(obs(9, 'end', 'gone')), 'ending', 'the Shells leaving ends the season early: the ending film still plays');
  for (const c of CHAPTERS) if (c.from != null) for (let t = c.from; t <= c.to; t++) assert.equal(chapterFor(obs(t)), c.id);
  assert.equal(dueFilm(obs(5), new Set(['arrival'])), 'language');
  assert.equal(dueFilm(obs(5), new Set(['arrival', 'language'])), null);
  assert.deepEqual(missedFilms(obs(13), new Set(['arrival', 'trust'])), ['language']);
  assert.equal(seasonKey({ season: { seasonId: 'random', merkleRoot: 'abcdef0123456789ffff' } }), 'abcdef0123456789');
});

test('chapters: the Shell hub plays every film in order on the judge seed, each built from the season', async () => {
  const { s, director, due } = await hubSeason(JUDGE);
  assert.equal(s.obs.season.phase, 'end');
  assert.deepEqual(due, ['arrival', 'language', 'trust', 'crisis', 'vote', 'ending'], 'one film per chapter, in order');
  assert.deepEqual(director.seen().sort(), [...due].sort());
  assert.deepEqual(director.missed(), []);
  const ending = director.films.get('ending');
  assert.equal(ending.outcome, s.obs.season.outcome, 'the ending film tells the engine outcome');
  assert.equal(ending.title.key, 'chapter.title.ending.' + s.obs.season.outcome);
  // the Language film speaks about the first reveal and reports the proof check the chronicle shows
  const lang = director.films.get('language');
  assert.equal(lang.shots[0].line.key, 'chapter.language.1');
  const first = s.obs.chronicle.slice().sort((a, b) => a.tick - b.tick)[0];
  assert.equal(first.tick, 3, 'the first reveal is always the trial-3 Gift (rules-baseline §2)');
  assert.equal(lang.shots[0].line.args.tick, first.tick);
  assert.equal(lang.shots[0].line.args.verified, 'yes', 'a failed proof would have ended the season before trial 5');
  assert.equal(lang.shots[0].line.args.action.key, 'meaning.1.0');
  assert.equal(lang.shots[0].line.args.shell.key, 'shell.' + (first.meaning.place - 1));
  assert.ok(s.obs.proofs.every((p) => p.verified), 'every retained proof check passed');
  // the Crisis film names exactly the clans Ash cut off (from the observation's edges)
  const crisis = director.films.get('crisis');
  assert.equal(crisis.shots[1].line.key, 'chapter.crisis.2');
  assert.ok(crisis.shots[1].line.args.n >= 1 && crisis.shots[1].line.args.n <= 3, 'Ash breaks two links at the crisis (one may have been broken before)');
  assert.equal(crisis.shots[1].line.args.who.length, crisis.shots[1].line.args.n);
  // the ledger saw every stake and every reveal the chronicle holds
  assert.ok(director.ledger.reveals.length >= s.obs.chronicle.length - 1);
  assert.ok(director.ledger.anchors.size >= 3, 'stakes were recorded');
  assert.ok([...director.ledger.anchors.values()].every((a) => a.outcome !== null || a.tick > s.obs.season.tick), 'every past stake has its outcome');
  assert.equal(director.ledger.crisisTick, 13);
  s.dispose();
});

test('chapters: the walking mode fires the same chapter sequence; the Chronicle rows follow the season', async () => {
  const { s, director, due } = await walkSeason(JUDGE);
  assert.deepEqual(due, ['arrival', 'language', 'trust', 'crisis', 'vote', 'ending']);
  assert.deepEqual(director.rows().map((r) => r.state), ['seen', 'seen', 'seen', 'seen', 'seen', 'seen']);
  assert.deepEqual(director.rows().map((r) => r.numeral), ['I', 'II', 'III', 'IV', 'V', 'VI']);
  const arrival = director.films.get('arrival');
  assert.equal(arrival.card.args.mode, 'walk', 'the first card tells the walker to walk, not to fly');
  s.dispose();
});

test('chapters: the Chronicle marks the current chapter, skipped chapters stay watchable', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: SEED2 }) });
  await s.start();
  const director = createChapterDirector({ obs: s.obs, mode: 'walk' });
  assert.equal(director.due(), 'arrival');
  assert.deepEqual(director.rows().map((r) => r.state), ['now', 'later', 'later', 'later', 'later', 'later']);
  assert.deepEqual(director.rows().map((r) => r.watchable), [true, false, false, false, false, false]);
  for (let i = 0; i < 5; i++) await s.send('end_tick', {}); // to trial 6 without watching anything
  director.observe(s.obs);
  assert.equal(director.due(), 'language');
  assert.deepEqual(director.missed(), ['arrival']);
  assert.deepEqual(director.rows().slice(0, 3).map((r) => r.state), ['missed', 'now', 'later']);
  assert.ok(director.build('arrival'), 'a skipped film can still be built and watched');
  s.dispose();
});

test('chapters: every film renders in all five languages from the facts; 20 to 40 seconds each', async () => {
  const { s, director } = await hubSeason(SEED2);
  const i18ns = Object.fromEntries(LOCALES.map((l) => [l, createPlayI18n(l, { onMissing: (k) => { throw new Error('missing ' + l + ':' + k); } })]));
  for (const id of CHAPTER_IDS) {
    const film = director.films.get(id) || director.build(id);
    assert.equal(film.shots.length, 5, id + ': five shots, one idea each');
    assert.ok(film.seconds >= 20 && film.seconds <= 40, `${id}: ${film.seconds} s`);
    assert.equal(film.seconds, Math.round(TITLE_SECONDS + 5 * SHOT_SECONDS + CARD_SECONDS));
    for (const [loc, i18n] of Object.entries(i18ns)) {
      const render = (v) => resolvePlayArg(i18n, v);
      const title = renderMsg(i18n, film.title.key, {});
      assert.ok(title.length > 1 && !title.includes('{'), `${loc}:${id} title`);
      for (const sh of film.shots) {
        assert.ok(sh.cam && ['path', 'iris', 'interior'].includes(sh.cam.kind), `${id}/${sh.id} has a camera`);
        if (sh.cam.kind === 'path') for (const p of [sh.cam.from, sh.cam.to]) { assert.equal(p.pos.length, 3); assert.equal(p.look.length, 3); assert.ok(p.fov > 20 && p.fov < 70); }
        const text = i18n.t(sh.line.key, resolveLineArgs(sh.line.args, i18n, render));
        assert.ok(text.length >= 12, `${loc}:${id}/${sh.id} is a sentence: "${text}"`);
        assert.ok(!/[{}]|undefined|NaN|\$agentId/.test(text), `${loc}:${id}/${sh.id} is fully rendered: "${text}"`);
        assert.ok(text.length <= 230, `${loc}:${id}/${sh.id} fits two subtitle lines (${text.length} chars)`);
        for (const a of sh.actors) assert.ok(['defeat', 'celebrate', 'talk', 'think'].includes(a.clip) && a.clan !== 'iris');
      }
      const card = i18n.t(film.card.key, resolveLineArgs(film.card.args, i18n, render));
      assert.ok(card.length >= 12 && !/[{}]/.test(card), `${loc}:${id} card: "${card}"`);
    }
  }
  s.dispose();
});

test('chapters: lists render as a localized list and empty lists as "no one"', () => {
  const en = createPlayI18n('en'), zh = createPlayI18n('zh');
  const render = (i18n) => (v) => resolvePlayArg(i18n, v);
  const args = { who: [{ $agentId: 'salt' }, { $agentId: 'moss' }, { $agentId: 'frost' }], n: 3 };
  assert.equal(en.t('chapter.crisis.2', resolveLineArgs(args, en, render(en))), 'Ash cut its bridges to Salt, Moss and Frost and stands alone now.');
  assert.equal(zh.t('chapter.crisis.2', resolveLineArgs(args, zh, render(zh))), '灰切断了通往盐、苔和霜的桥，现在孤身一人。');
  assert.equal(resolveLineArgs({ who: [] }, en, render(en)).who, 'no one');
  assert.equal(resolveLineArgs({ who: [{ $agentId: 'ash' }] }, en, render(en)).who, 'Ash');
  assert.equal(en.t('chapter.ending.2', resolveLineArgs({ has: 'yes', yes: [{ $agentId: 'iris' }, { $agentId: 'moss' }], no: [] }, en, render(en))), 'For the gift: Iris and Moss. Against: no one.');
});

test('chapters: ending films exist for every outcome and the vote shot lists the voters', () => {
  const base = { season: { tick: 17, ticks: 17, phase: 'end', contributionDeadline: 16 }, iris: { silk: 70, forgotten: [], fragment: { status: 'scroll' }, anchors: [] }, memories: [{}, {}], scroll: [], relationships: { clans: [], edges: [] }, prophecies: [], dictionary: { confidentCells: 9, boughtWords: [] } };
  const en = createPlayI18n('en');
  const render = (v) => resolvePlayArg(en, v);
  for (const outcome of OUTCOMES) {
    const votes = outcome === 'gone' || outcome === 'proof_failed' ? null : [['iris', true], ['salt', false], ['ash', false], ['moss', true], ['amber', true], ['frost', true]].map(([clan, accept]) => ({ clan, accept }));
    const film = buildFilm('ending', { obs: { ...base, season: { ...base.season, outcome, votes } } });
    assert.equal(film.outcome, outcome);
    assert.equal(film.title.key, 'chapter.title.ending.' + outcome);
    const v = en.t(film.shots[1].line.key, resolveLineArgs(film.shots[1].line.args, en, render));
    if (votes) assert.equal(v, 'For the gift: Iris, Moss, Amber and Frost. Against: Salt and Ash.'); else assert.equal(v, 'There was no vote.');
    const card = en.t(film.card.key, resolveLineArgs(film.card.args, en, render));
    assert.ok(outcome === 'gift' ? /Heir/.test(card) : /season is over/.test(card));
  }
});

test('chapters: cheap and reduced-motion films keep the story but hold the camera still', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  const full = buildFilm('arrival', { obs: s.obs, profile: 'full' });
  const cheap = buildFilm('arrival', { obs: s.obs, profile: 'cheap' });
  const still = buildFilm('arrival', { obs: s.obs, reducedMotion: true });
  assert.deepEqual(cheap.shots.map((x) => x.line), full.shots.map((x) => x.line), 'same narration');
  assert.ok(full.shots.some((x) => x.cam.kind === 'interior'), 'the full film visits the Shell interior');
  assert.ok(cheap.shots.every((x) => x.cam.kind !== 'interior'), 'the cheap film shows the Shell from outside instead');
  assert.ok(cheap.shots.every((x) => x.cam.still), 'no camera moves on phones and the low tier');
  assert.ok(still.shots.every((x) => x.cam.still), 'no camera moves under reduced motion');
  assert.ok(still.shots.some((x) => x.cam.kind === 'interior'), 'reduced motion keeps the interior shot');
  for (const x of full.shots) if (x.cam.kind === 'path') assert.notDeepEqual(x.cam.from.pos, x.cam.to.pos, 'full shots move');
  s.dispose();
});

test('chapters: deterministic per seed, in both modes', async () => {
  const a = await hubSeason(JUDGE), b = await hubSeason(JUDGE);
  assert.deepEqual(a.due, b.due);
  for (const id of a.due) assert.deepEqual(a.director.films.get(id), b.director.films.get(id), id + ' is the same film on the same seed');
  const other = await hubSeason(SEED2);
  assert.notDeepEqual(other.director.films.get('language'), a.director.films.get('language'), 'another seed tells another story');
  a.s.dispose(); b.s.dispose(); other.s.dispose();
});

test('chapters: seen films persist per season and reset clears them', async () => {
  const storage = memStorage();
  const key = 'season-x';
  const st = createSeenStore(storage, key);
  st.add('arrival'); st.add('language'); st.add('arrival');
  assert.deepEqual(storage.getJSON(CHAPTERS_KEY), { [key]: ['arrival', 'language'] });
  const again = createSeenStore(storage, key);
  assert.ok(again.has('language'));
  again.reset();
  assert.deepEqual(storage.getJSON(CHAPTERS_KEY), {});
  // seen films are remembered per season commitment: a random season is new, the same fixed seed remembers
  const first = await hubSeason(JUDGE, storage);
  const random = new PlaySession({ transport: createLocalTransport({}) });
  await random.start();
  assert.notEqual(seasonKey(random.obs), seasonKey(first.s.obs), 'another season has another key');
  assert.equal(createChapterDirector({ obs: random.obs, storage, mode: 'hub' }).due(), 'arrival');
  random.dispose();
  const s2 = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s2.start();
  const d2 = createChapterDirector({ obs: s2.obs, storage, mode: 'hub' });
  if (seasonKey(s2.obs) === seasonKey(first.s.obs)) { assert.equal(d2.due(), null, 'the same commitment remembers its films'); d2.reset(); }
  assert.equal(d2.due(), 'arrival');
  d2.markSeen('arrival');
  assert.equal(createChapterDirector({ obs: s2.obs, storage, mode: 'hub' }).due(), null, 'the same room (same key) remembers');
  assert.ok(Object.keys(storage.getJSON(CHAPTERS_KEY)).length <= 8, 'the store keeps at most eight seasons');
  const noStore = createChapterDirector({ obs: s2.obs, storage: null, mode: 'hub', enabled: false });
  assert.equal(noStore.due(), null, 'films can be disabled');
  first.s.dispose(); s2.dispose();
});

test('chapters: every chapter key exists in all five languages', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('chapter.'));
  assert.ok(keys.length >= 60);
  for (const loc of LOCALES) for (const k of keys) assert.ok(k in PLAY_MESSAGES[loc], `${loc}:${k}`);
  for (const id of CHAPTER_IDS) for (let i = 1; i <= 5; i++) assert.ok(keys.includes(`chapter.${id}.${i}`), `chapter.${id}.${i}`);
  for (const o of OUTCOMES) assert.ok(keys.includes('chapter.title.ending.' + o));
});

test('films: the judge link skips them unless asked; normal seasons play them', async () => {
  const { filmsEnabled } = await import('../../src/cinematic/chapters/films-enabled.js');
  const q = (s) => filmsEnabled(new URLSearchParams(s));
  assert.equal(q('?demo=judge'), false);
  assert.equal(q('?demo=judge&mode=walk&play=direct'), false);
  assert.equal(q('?demo=judge&films=full'), true);
  assert.equal(q('?demo=judge&films=cheap'), true);
  assert.equal(q(''), true);
  assert.equal(q('?play=direct'), true);
  assert.equal(q('?films=off'), false);
  assert.equal(q('?film=arrival'), false);
});
