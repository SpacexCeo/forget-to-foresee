// Forget to Foresee — game rules as a pure module: no DOM, no three.js, no network.
// Ported 1:1 from prototype-2d/index.html (see docs/rules-baseline.md).
// The UI reads `S` (a live ES-module binding) and calls the exported actions;
// visual side effects are queued in S.fx for the 3D scenes.
import { sha256, merkle, proofFor, verifyProof, short } from './crypto.js';

export const RULES_VERSION = 'baseline-2d-1';
export const TICKS = 17, DEADLINE = 16, CRISIS = 13;
export const NAMES = ['Ирис', 'Соль', 'Пепел', 'Мох', 'Янтарь', 'Иней'];
export const PERS = [null,
  { h: .35, g: .6, p: .3, sk: .5 },
  { h: .8, g: .3, p: .85, sk: .4 },
  { h: .92, g: .2, p: .2, sk: .35 },
  { h: .65, g: .9, p: .3, sk: .45 },
  { h: .88, g: .4, p: .4, sk: .8 }];
export const SLOTS = ['Место', 'Действие', 'Сила', 'Срок'];
export const MEAN = [['Раковина I', 'Раковина II', 'Раковина III', 'Раковина IV'], ['Дар', 'Буря', 'Тишина', 'Зов'], ['малая · 10', 'средняя · 20', 'большая · 40', 'великая · 80'], ['через 1 тик', 'через 2', 'через 3', 'через 4']];
export const SHORT = [['I', 'II', 'III', 'IV'], ['Дар', 'Буря', 'Тишина', 'Зов'], ['10', '20', '40', '80'], ['+1', '+2', '+3', '+4']];
export const FORMS = ['дуга', 'шип', 'петля', 'капля'];
const PEPEL_PHRASES = ['вода помнит камень', 'мы пришли раньше времени', 'пепел тоже был деревом', 'молчание — тоже ответ'];
export const DEFAULT_PHRASE = 'я помню то, чего ещё не было';

/** Current season state. Reassigned by newSeason/loadState. */
export let S = null;

/* ---------- rng (state lives in S.rs, so snapshots replay exactly) ---------- */
function rnd() { S.rs = (S.rs + 0x6D2B79F5) | 0; let t = S.rs; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const ri = (n) => Math.floor(rnd() * n);
function pickW(ws) { const s = ws.reduce((a, b) => a + b, 0); let r = rnd() * s; for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) return i; } return ws.length - 1; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const hex = (n) => { let s = ''; for (let i = 0; i < n; i++) s += ri(16).toString(16); return s; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function encodeForms(m, dots) {
  const forms = [0, 0, 0, 0];
  for (let s = 0; s < 4; s++) { const f = S.perm[s].indexOf(m[s]); forms[(dots + s) % 4] = f; }
  return forms;
}

/* ---------- season ---------- */
export function newSeason(seed) {
  S = {
    seed, rs: seed, tick: 1, phase: 'intro', uid: 0, H: 10, ap: 3, wild: false, rule: 'unknown',
    silk: [60, 60, 60, 60, 60, 60], mast: [0, .12, .1, .08, .1, .18], T: [], broken: [], isolated: [false, false, false, false, false, false],
    mem: [], forgot: [], shards: [], offers: [], feed: [], anchors: [], chron: [], pins: {}, no: {}, bought: [], visions: [], proofs: [],
    aiSeen: {}, aiPact: {}, pPromise: null, escrow: 0, claims: [], rumor: false, pepelKeyKnown: false, firstBuyer: null,
    outcome: null, heir: null, votes: null, fx: [], version: 0,
  };
  for (let i = 0; i < 6; i++) S.T.push([50, 50, 50, 50, 50, 50]);
  S.perm = [0, 1, 2, 3].map(() => shuffle([0, 1, 2, 3]));
  S.events = [];
  for (let T = 3; T <= TICKS; T++) {
    const action = T === 3 ? 0 : pickW([40, 24, 16, 20]);
    const power = T === 3 ? 1 : pickW([34, 36, 22, 8]);
    const delay = 1 + ri(Math.min(4, T - 1));
    const e = { t: T, place: ri(4), action, power, delay, pub: T - delay, dots: ri(4), salt: hex(12) };
    e.forms = encodeForms([e.place, e.action, e.power, e.delay - 1], e.dots);
    e.leaf = sha256(JSON.stringify({ t: e.t, place: e.place, action: e.action, power: e.power, delay: e.delay, dots: e.dots }) + e.salt);
    S.events.push(e);
  }
  S.levels = merkle(S.events.map((e) => e.leaf));
  S.root = S.levels[S.levels.length - 1][0];
  S.seedCommit = sha256('seed:' + seed);
  S.truthGift = rnd() < .6;
  S.keyHolder = rnd() < .6 ? 2 : 4;
  S.frag = NAMES.map((_, i) => {
    const m = [ri(4), i === S.keyHolder ? (S.truthGift ? 0 : 1) : 2 + ri(2), ri(4), ri(4)], dots = ri(4);
    return { owner: i, m, dots, forms: encodeForms(m, dots), key: i === S.keyHolder, st: 'held', at: null };
  });
  S.V = [[30, 40, 50, 60][ri(4)], 20 + ri(4) * 10, 30 + ri(3) * 10, 20 + ri(3) * 10, 80, 20 + ri(3) * 10];
  S.tV = [11 + ri(5), 17, 18, 18, 15, 13 + ri(5)];
  const pp = PEPEL_PHRASES[ri(PEPEL_PHRASES.length)], ps = hex(8);
  S.pepelKey = { phrase: pp, salt: ps, hash: sha256(pp + ps) };
  S.pKey = null;
  addMem({ kind: 'first', w: 4, text: 'Первое слово: Ключ владельца, который знает только Ирис' });
  addMem({ kind: 'call', w: 2, text: 'Зов Раковин в ночь прибытия' });
  addMem({ kind: 'gift', about: 3, w: 1, text: 'Мох поделился шёлком в первую ночь' });
  S.T[0][3] = 65; S.T[3][0] = 60;
  startTick();
  return S;
}

/** Replace the current state with a snapshot (tests, save/load). */
export function loadState(state) { S = state; if (!S.fx) S.fx = []; if (S.version == null) S.version = 0; return S; }

export function startGame(phrase) {
  if (S.phase !== 'intro') return;
  const v = (phrase || '').trim() || DEFAULT_PHRASE;
  const salt = hex(8);
  S.pKey = { phrase: v, salt, hash: sha256(v + salt) };
  S.phase = S.tick === TICKS ? 'vote' : 'play';
  log(`Ключ владельца закоммичен: ${short(S.pKey.hash)}.`, 'key');
  bump();
}

/* ---------- helpers ---------- */
function bump() { S.version++; }
function fx(type, data) { S.fx.push({ type, ...data }); }
function log(text, cls = '') { S.feed.unshift({ t: S.tick, text, cls }); if (S.feed.length > 90) S.feed.length = 90; }
function addMem(m) { m.id = ++S.uid; S.mem.push(m); return m; }
const ek = (i, j) => Math.min(i, j) + '-' + Math.max(i, j);
export const isBroken = (i, j) => S.broken.includes(ek(i, j));
function addH(n) { S.H = Math.max(0, Math.round(S.H + n)); }
function breakEdge(i, j) { if (isBroken(i, j)) return; S.broken.push(ek(i, j)); addH(10); fx('break', { i, j }); }
function restoreEdge(i, j) { if (!isBroken(i, j)) return; S.broken = S.broken.filter((k) => k !== ek(i, j)); addH(-10); fx('mend', { i, j }); }
export function hasBetrayal(x) { return S.mem.some((m) => m.kind === 'betrayal' && m.about === x); }
function trustAdd(i, j, d) { S.T[i][j] = clamp(S.T[i][j] + d, 0, 100); if (i === 0 && hasBetrayal(j)) S.T[0][j] = Math.min(S.T[0][j], 15); }
export const maxAP = () => (S.wild ? 2 : 3);
const avgTrust = (i) => { let s = 0; for (let j = 0; j < 6; j++) if (j !== i) s += S.T[i][j]; return s / 5; };

/* ---------- dictionary ---------- */
export function dictVotes() {
  const V = [0, 1, 2, 3].map(() => [0, 1, 2, 3].map(() => [0, 0, 0, 0]));
  for (const c of S.chron) {
    const rs = S.rule === 'dots' ? [[c.dots, 1]] : S.rule === 'top' ? [[0, 1]] : [[0, .25], [1, .25], [2, .25], [3, .25]];
    for (const [r, w] of rs) for (let s = 0; s < 4; s++) V[s][c.forms[(r + s) % 4]][c.m[s]] += w;
  }
  return V;
}
export function guess(s, f, V) {
  const pin = S.pins[s + '_' + f];
  if (pin) return { m: pin.m, conf: 1, src: pin.src, cert: true };
  const taken = new Set();
  for (let ff = 0; ff < 4; ff++) { const p = S.pins[s + '_' + ff]; if (p && ff !== f) taken.add(p.m); }
  const no = S.no[s + '_' + f] || [];
  const b = S.bought.find((x) => x.s === s && x.f === f && !x.revealed);
  const sc = [0, 1, 2, 3].map((m) => (taken.has(m) || no.includes(m)) ? -1 : V[s][f][m] + .35 + (b && b.m === m ? 1.6 : 0));
  let best = 0; for (let m = 1; m < 4; m++) if (sc[m] > sc[best]) best = m;
  const tot = sc.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  return { m: best, conf: tot ? sc[best] / tot : 0, src: b && b.m === best ? NAMES[b.from] : null, cert: false };
}
export function readGlyph(forms, dots, V) {
  V = V || dictVotes();
  const rs = S.rule === 'dots' ? [dots] : S.rule === 'top' ? [0] : [0, 1, 2, 3];
  let best = null;
  for (const r of rs) { const sl = [0, 1, 2, 3].map((s) => guess(s, forms[(r + s) % 4], V)); const tot = sl.reduce((a, x) => a + x.conf, 0); if (!best || tot > best.tot) best = { r, sl, tot }; }
  return best;
}
export function confidentCells() { const V = dictVotes(); let n = 0; for (let s = 0; s < 4; s++) for (let f = 0; f < 4; f++) if (guess(s, f, V).conf >= .65) n++; return n; }
export function trueMastery() { const V = dictVotes(); let n = 0; for (let s = 0; s < 4; s++) for (let f = 0; f < 4; f++) if (guess(s, f, V).m === S.perm[s][f]) n++; return n / 16; }
function checkBought() {
  const V = dictVotes();
  for (const b of S.bought) {
    if (b.revealed || b.honest) continue;
    const tm = S.perm[b.s][b.f];
    if (V[b.s][b.f][tm] >= 1.5 && V[b.s][b.f][tm] > V[b.s][b.f][b.m] + .5) revealLie(b);
  }
}
function revealLie(b) {
  b.revealed = true;
  addMem({ kind: 'betrayal', about: b.from, w: 3, text: `${NAMES[b.from]} продал ложное слово («${FORMS[b.f]}» в слоте «${SLOTS[b.s]}»)` });
  trustAdd(0, b.from, -40); addH(6); breakEdge(0, b.from);
  log(`Ирис поняла: ${NAMES[b.from]} продал ей ложное слово. Она больше не разговаривает с ${NAMES[b.from]}.`, 'bad');
}
/** Prophecies the player can see now: published ones plus visions. */
export function visibleProphecies() {
  return S.events.map((e, i) => ({ e, i })).filter((x) => x.e.t >= S.tick && (x.e.pub <= S.tick || S.visions.includes(x.i)));
}

/* ---------- tick flow ---------- */
function startTick() {
  const t = S.tick;
  S.ap = maxAP();
  for (let i = 0; i < 6; i++) S.silk[i] += 3;
  log(`— Тик ${t} —`, 'tick');
  resolveShards();
  for (const m of S.mem.filter((m) => m.kind === 'debt' && m.data.due === t)) {
    const X = m.about; S.mem = S.mem.filter((x) => x !== m);
    if (rnd() < PERS[X].h) { const a = m.data.amount; S.silk[X] -= a; S.silk[0] += a; trustAdd(0, X, 10); log(`${NAMES[X]} вернул долг: +${a} шёлка.`, 'good'); fx('walk', { from: X, to: 0, kind: 'silk' }); }
    else { addMem({ kind: 'betrayal', about: X, w: 3, text: `${NAMES[X]} не вернул долг ${m.data.amount}` }); trustAdd(0, X, -40); addH(6); breakEdge(0, X); log(`${NAMES[X]} не вернул долг. Ирис порвала с ним.`, 'bad'); }
  }
  for (const c of S.claims.filter((c) => c.due === t)) { if (rnd() < PERS[c.debtor].h) { S.silk[c.debtor] -= c.amount; S.silk[c.holder] += c.amount; log(`${NAMES[c.debtor]} вернул ${c.amount} шёлка владельцу осколка: ${NAMES[c.holder]}.`, 'muted'); } }
  S.claims = S.claims.filter((c) => c.due !== t);
  const pm = S.mem.find((m) => m.kind === 'promise');
  if (pm && pm.data.by === t && S.frag[0].st === 'held') contribute(0, `Ирис держит слово перед ${NAMES[pm.about]} и вносит фрагмент.`);
  for (const [k, by] of Object.entries(S.aiPact)) {
    const i = +k; if (by !== t) continue; delete S.aiPact[i];
    if (S.frag[i].st !== 'held') continue;
    if (!S.isolated[i] && rnd() < PERS[i].h) contribute(i, `${NAMES[i]} держит обещание и вносит фрагмент.`);
    else { addMem({ kind: 'betrayal', about: i, w: 3, text: `${NAMES[i]} не внёс фрагмент, как обещал` }); trustAdd(0, i, -40); addH(6); breakEdge(0, i); log(`${NAMES[i]} нарушил обещание.`, 'bad'); }
  }
  if (S.escrow && S.frag[4].st === 'held') contribute(4, 'Янтарь вносит фрагмент: эскроу сработал.');
  if (t <= DEADLINE) for (let i = 1; i < 6; i++) {
    if (S.frag[i].st !== 'held' || S.isolated[i]) continue;
    if (PERS[i].g > .7 && S.tV[i] <= DEADLINE) continue;
    let c = .05 + Math.max(0, avgTrust(i) - 45) / 150 + (PERS[i].h - .5) * .2 + (t >= 11 ? .15 : 0) + (t >= 15 ? .3 : 0);
    c *= 1 - PERS[i].p * .7;
    if (rnd() < c) contribute(i, `${NAMES[i]} вносит фрагмент в Свиток.`);
  }
  tickPrizesAndSocial(t);
}

function tickPrizesAndSocial(t) {
  for (let i = 0; i < 6; i++) if (S.frag[i].st === 'held' && S.tV[i] === t) {
    S.frag[i].st = 'dark'; S.silk[i] += S.V[i];
    log(i === 0 ? `Вы удержали фрагмент и получили ${S.V[i]} шёлка. Ваша часть послания погасла.` : `${NAMES[i]} удержал фрагмент ради приза (${S.V[i]}). Его часть послания погасла.`, i === 0 ? 'good' : 'bad');
    fx('dark', { i });
    if (i !== 0) for (let j = 1; j < 6; j++) if (j !== i) S.T[j][i] = clamp(S.T[j][i] - 10, 0, 100);
  }
  if (t > DEADLINE) for (let i = 0; i < 6; i++) if (S.frag[i].st === 'held') { S.frag[i].st = 'dark'; log(`${NAMES[i]} не успел внести фрагмент.`, 'muted'); fx('dark', { i }); }
  if (t === CRISIS) crisis();
  if (t >= 4 && rnd() < .22) {
    const ais = [1, 2, 3, 4, 5], b = ais[pickW(ais.map((i) => 1 - PERS[i].h))];
    const others = ais.filter((i) => i !== b && !isBroken(i, b));
    if (others.length) {
      const v = others[ri(others.length)], amt = 8 + ri(10);
      S.silk[v] -= amt; S.silk[b] += amt; S.T[v][b] = clamp(S.T[v][b] - 35, 0, 100); addH(6);
      log(`${NAMES[b]} обманул ${NAMES[v]} на ${amt} шёлка.`, 'bad');
      fx('walk', { from: b, to: v, kind: 'betray' });
      if (S.T[v][b] < 20) { breakEdge(v, b); log(`${NAMES[v]} порвал с ${NAMES[b]}.`, 'bad'); }
    }
  }
  for (let i = 1; i < 6; i++) for (let j = 0; j < 6; j++) if (i !== j) { const d = 50 - S.T[i][j]; S.T[i][j] += Math.sign(d) * Math.min(2, Math.abs(d)); }
  for (const k of [...S.broken]) {
    const [i, j] = k.split('-').map(Number); if (i === 0) continue;
    if (!S.isolated[i] && !S.isolated[j] && S.T[i][j] >= 30 && S.T[j][i] >= 30 && rnd() < .2) { restoreEdge(i, j); log(`${NAMES[i]} и ${NAMES[j]} снова разговаривают.`, 'muted'); }
  }
  for (let i = 1; i < 6; i++) if (S.T[i][0] < 15 && !isBroken(i, 0)) { breakEdge(i, 0); log(`${NAMES[i]} больше не разговаривает с Ирис.`, 'bad'); }
  for (let i = 1; i < 6; i++) S.mast[i] = Math.min(.95, S.mast[i] + PERS[i].sk * .045 + .01);
  const pubs = S.events.filter((e) => e.pub === t);
  if (pubs.length) { log(`Глас Гостей: ${pubs.length === 1 ? 'новый знак' : pubs.length + ' новых знака'}.`); fx('voice', { n: pubs.length }); }
  aiAnchors();
  genOffers();
  if (t === 7 || t === 11) inejShard();
  if (t === TICKS) S.phase = S.phase === 'intro' ? 'intro' : 'vote';
}

function crisis() {
  addH(15);
  log('Глас: двусмысленный знак над всеми Раковинами. Пепел прочёл в нём «Оружие».', 'bad');
  fx('crisis', {});
  const cand = [0, 1, 3, 4, 5].filter((j) => S.T[2][j] < 70 && !isBroken(2, j)).sort((a, b) => S.T[2][a] - S.T[2][b]).slice(0, 2);
  cand.forEach((j) => { breakEdge(2, j); log(`Пепел рвёт связь с ${NAMES[j]}.`, 'bad'); });
  S.isolated[2] = true; S.rumor = true;
  log('Соль шепчет всем: «Это оружие. Я видел».', 'muted');
}

export function endTick() {
  if (S.phase !== 'play') return false;
  resolveEvent(S.tick);
  S.offers = [];
  addH(-2);
  if (S.H >= 100) { finish('gone'); return true; }
  S.tick++;
  startTick();
  if (S.H >= 100) finish('gone');
  bump();
  return true;
}

function resolveEvent(t) {
  const idx = S.events.findIndex((e) => e.t === t); if (idx < 0) return;
  const e = S.events[idx], truth = [e.place, e.action, e.power, e.delay - 1];
  const rd = readGlyph(e.forms, e.dots);
  const ok = truth.filter((v, s) => rd.sl[s].m === v).length;
  const verified = verifyProof(e.leaf, proofFor(S.levels, idx), S.root);
  const here = S.anchors.filter((a) => a.t === t), hit = here.filter((a) => a.place === e.place);
  here.filter((a) => a.place !== e.place).forEach((a) => { S.silk[a.c] += a.stake; });
  const pot = [10, 20, 40, 80][e.power];
  if (e.action === 0) {
    const W = hit.reduce((s, a) => s + (t - a.at + 1), 0);
    hit.forEach((a) => { const g = Math.round(pot * (t - a.at + 1) / W); S.silk[a.c] += a.stake + g; if (a.c === 0) log(`Дар на Раковине ${SHORT[0][e.place]}: вам ${g} шёлка и залог.`, 'good'); });
    if (hit.length && !hit.some((a) => a.c === 0)) log(`Дар забрали: ${[...new Set(hit.map((a) => NAMES[a.c]))].join(', ')}.`, 'muted');
  } else if (e.action === 1) {
    hit.forEach((a) => { if (a.c === 0) log(`Буря на Раковине ${SHORT[0][e.place]} сожгла ваш залог.`, 'bad'); });
  } else hit.forEach((a) => {
    S.silk[a.c] += a.stake;
    if (e.action === 3) {
      if (a.c === 0) { addMem({ kind: 'call', w: 2, text: `Зов Раковины ${SHORT[0][e.place]} на тике ${t}` }); log('Зов: у Ирис появилось новое воспоминание.', 'good'); }
      else S.mast[a.c] = Math.min(.95, S.mast[a.c] + .04);
    }
  });
  S.anchors = S.anchors.filter((a) => a.t !== t);
  S.chron.push({ t, forms: e.forms, dots: e.dots, m: truth, ok, idx });
  S.proofs.unshift({ t, idx, leaf: e.leaf, ok: verified }); if (S.proofs.length > 5) S.proofs.length = 5;
  log(`Тик ${t} · Раковина ${SHORT[0][e.place]}: ${MEAN[1][e.action]}, сила ${pot}. Лист №${idx} сверен с корнем ${verified ? '✓' : '✗'}`);
  fx('event', { place: e.place, action: e.action, power: e.power, idx, verified });
  checkBought();
}

function aiAnchors() {
  for (const e of S.events) {
    if (e.pub > S.tick || e.t < S.tick) continue;
    for (let i = 1; i < 6; i++) {
      const k = i + '_' + e.t; if (S.aiSeen[k]) continue; S.aiSeen[k] = 1;
      const p = .3 + .7 * S.mast[i], tr = [e.place, e.action, e.power, e.delay - 1], rd = (s) => (rnd() < p ? tr[s] : ri(4));
      if (rd(1) !== 0) continue;
      const place = rd(0), tt = e.pub + rd(3) + 1;
      if (tt < S.tick || tt > TICKS || S.silk[i] < 10 || rnd() > .7) continue;
      S.silk[i] -= 10; S.anchors.push({ c: i, place, t: tt, at: S.tick, stake: 10 });
    }
  }
}

function contribute(i, why) {
  const f = S.frag[i]; if (f.st !== 'held') return;
  f.st = 'scroll'; f.at = S.tick; log(why || `${NAMES[i]} вносит фрагмент.`, i === 0 ? 'good' : '');
  fx('fragment', { i });
  for (let j = 1; j < 6; j++) if (j !== i) S.T[j][i] = clamp(S.T[j][i] + 5, 0, 100);
  if (i === 0) { const pm = S.mem.find((m) => m.kind === 'promise'); if (pm) { S.mem = S.mem.filter((x) => x !== pm); trustAdd(pm.about, 0, 15); log(`${NAMES[pm.about]}: обещание выполнено.`, 'good'); } }
  if (i === 4 && S.escrow) { S.silk[4] += S.escrow; log(`Эскроу: ${S.escrow} шёлка ушли Янтарю.`, 'muted'); S.escrow = 0; }
}

/* ---------- offers ---------- */
function offSell(from) {
  const c = []; for (let s = 0; s < 4; s++) for (let f = 0; f < 4; f++) if (!S.pins[s + '_' + f] && !S.bought.some((b) => b.s === s && b.f === f)) c.push([s, f]);
  if (!c.length) return null;
  const [s, f] = c[ri(c.length)], tm = S.perm[s][f], honest = rnd() < PERS[from].h;
  let m = tm; if (!honest) { do { m = ri(4); } while (m === tm); }
  return { from, kind: 'sell', s, f, m, honest, price: from === 5 ? 12 : from === 4 ? 10 : 7 };
}
function genOffers() {
  const t = S.tick; S.offers = [];
  const add = (o) => { if (!o || isBroken(0, o.from)) return; o.id = ++S.uid; S.offers.push(o); };
  const canPact = () => S.frag[0].st === 'held' && !S.mem.some((m) => m.kind === 'promise');
  if (t === 2) add(offSell(1));
  if (t === 3) add({ from: 3, kind: 'loan', n: 15, back: 25, due: t + 4 });
  if (t === 4) add({ from: 5, kind: 'gift' });
  if (t === 5 && S.frag[2].st === 'held' && canPact()) add({ from: 2, kind: 'pact', by: 14 });
  if (t === 6) add(offSell(5));
  if (t === 7) add({ from: 1, kind: 'loan', n: 20, back: 32, due: t + 4 });
  if (t === 8) add(offSell(1));
  if ((t === 9 || t === 13) && S.frag[4].st === 'held' && S.tV[4] > t && !S.escrow) add({ from: 4, kind: 'escrow', price: t === 9 ? 45 : 55 });
  if (t === 10 && S.frag[3].st === 'held' && canPact()) add({ from: 3, kind: 'pact', by: 14 });
  if (t === 11) add(offSell(5));
  if (t >= 3 && t <= 15 && rnd() < .3) add(offSell([1, 4, 5][ri(3)]));
}
export function offerText(o) {
  const n = `<b>${NAMES[o.from]}</b>`;
  if (o.kind === 'sell') return `${n}: «Продам слово. Знак «${FORMS[o.f]}» в слоте «${SLOTS[o.s]}» значит «${MEAN[o.s][o.m]}».» Цена ${o.price}.`;
  if (o.kind === 'loan') return `${n}: «Одолжи ${o.n} шёлка, верну ${o.back} на тике ${o.due}.»`;
  if (o.kind === 'gift') return `${n}: «Делюсь одним словом из летописи бесплатно. Запомни, кто помог.»`;
  if (o.kind === 'pact') return `${n}: «Пообещаем друг другу внести фрагменты до тика ${o.by}. На слово.»`;
  if (o.kind === 'escrow') return `${n}: «Внесу свой фрагмент за ${o.price} шёлка. Деньги в эскроу: они уйдут мне, только когда фрагмент окажется в Свитке.»`;
  return '';
}

/* ---------- memory, shards ---------- */
export function effectText(m) {
  const X = m.about != null ? NAMES[m.about] : '';
  switch (m.kind) {
    case 'first': return 'Пока Ирис помнит владельца, она слушается вас: 3 внимания за тик. Если забудет, останется 2.';
    case 'call': return 'Нить к Гостям. Ничего не держит, это хорошее топливо для видения.';
    case 'gift': return `Доверие к ${X} выше. Если забыть, Ирис станет к ${X} равнодушна.`;
    case 'betrayal': return `Ирис не разговаривает с ${X}. Если забыть, она снова поверит и может попасться ещё раз.`;
    case 'debt': return `${X} вернёт ${m.data.amount} на тике ${m.data.due}. Если забыть, долг исчезнет, а право требования уйдёт с осколком.`;
    case 'promise': return `На тике ${m.data.by} Ирис внесёт фрагмент, что бы вы ни решили. Если забыть, вы свободны, но ${X} может купить осколок и узнать.`;
  }
  return '';
}
function inejShard() {
  const lie = S.tick === 11 && S.bought.some((b) => b.from === 1 && !b.honest && !b.revealed);
  const c = []; for (let s = 0; s < 4; s++) for (let f = 0; f < 4; f++) if (!S.pins[s + '_' + f]) c.push([s, f]);
  if (!lie && !c.length) return;
  const [s, f] = lie ? [0, 0] : c[ri(c.length)];
  const sh = { id: ++S.uid, from: 5, kind: lie ? 'lie' : 'insight', s, f, title: lie ? 'Как Соль торговал словами' : `Слово из слота «${SLOTS[s]}»`, exp: S.tick + 2, bids: [], vals: lie ? { 1: 20, 4: 6 } : { 1: 9, 4: 8 } };
  sh.bids.push({ c: 1, amt: lie ? 14 : 4 + ri(4) }); sh.bids.push({ c: 4, amt: 3 + ri(4) });
  S.shards.push(sh);
  log(`Иней забыл воспоминание ради видения. Осколок «${sh.title}» на торгах.`, 'muted');
}
export const topBid = (sh) => sh.bids.reduce((b, x) => (!b || x.amt > b.amt) ? x : b, null);
function resolveShards() {
  for (const sh of S.shards) {
    if (sh.done || sh.exp > S.tick) continue;
    sh.done = true; sh.doneAt = S.tick;
    let top = topBid(sh);
    if (top && S.silk[top.c] < top.amt) top = null;
    if (!top) { sh.result = 'Никто не купил. Осколок сгорел, этого больше нет в истории мира.'; if (sh.from === 0) S.forgot[sh.fg].fate = 'сгорело'; log(`Осколок «${sh.title}» сгорел.`, 'muted'); continue; }
    S.silk[top.c] -= top.amt; S.silk[sh.from] += top.amt; sh.winner = top.c;
    if (sh.from === 0) S.forgot[sh.fg].fate = `купил ${NAMES[top.c]} за ${top.amt}`;
    sh.result = `Купил ${NAMES[top.c]} за ${top.amt}.`;
    fx('walk', { from: sh.from, to: top.c, kind: 'shard' });
    applyShard(sh, top.c);
  }
  S.shards = S.shards.filter((x) => !x.done || x.doneAt >= S.tick);
}
function applyShard(sh, w) {
  const who = NAMES[w];
  if (sh.from === 0) {
    const m = sh.mem, X = m.about;
    if (m.kind === 'betrayal') { if (w === X) log(`${who} выкупил и уничтожил память о своём обмане.`, 'muted'); else { S.T[w][X] = clamp(S.T[w][X] - 25, 0, 100); log(`${who} купил память о том, как ${NAMES[X]} обманул Ирис. Теперь ${who} тоже ему не верит.`); } }
    if (m.kind === 'debt') { if (w === X) log(`${who} выкупил свой долг и списал его.`, 'muted'); else { S.claims.push({ holder: w, debtor: X, amount: m.data.amount, due: m.data.due }); log(`${who} купил ваш долг: теперь ${NAMES[X]} должен ему.`); } }
    if (m.kind === 'promise' && w === X) { S.T[X][0] = clamp(S.T[X][0] - 40, 0, 100); addH(6); log(`${who} купил осколок и узнал, что Ирис забыла обещание.`, 'bad'); }
    if (m.kind === 'gift' && w !== X) S.T[w][X] = clamp(S.T[w][X] + 10, 0, 100);
    if (m.kind === 'call') S.mast[w] = Math.min(.95, S.mast[w] + .06);
    if (m.kind === 'first') { S.firstBuyer = w; log(`${who} купил Первое слово Ирис. Теперь он знает ваш Ключ.`, 'bad'); }
  } else if (w === 0) {
    if (sh.kind === 'insight') { S.pins[sh.s + '_' + sh.f] = { m: S.perm[sh.s][sh.f], src: 'осколок' }; log('Осколок Инея: Ирис узнала верное слово.', 'good'); }
    if (sh.kind === 'lie') { const l = S.bought.filter((b) => b.from === 1 && !b.honest && !b.revealed); if (l.length) l.forEach(revealLie); else { trustAdd(0, 1, 15); log('Осколок Инея: Соль был с вами честен.', 'good'); } }
  } else S.mast[w] = Math.min(.95, S.mast[w] + .05);
}

function finish(outcome) { S.outcome = outcome; S.phase = 'end'; fx('end', { outcome }); }

/* ======================= player actions =======================
 * Each action returns { ok: true } or { ok: false, reason }.
 * Guards include the conditions the 2D prototype enforced only in its UI
 * (docs/rules-baseline.md §10), so an authoritative server can trust them.
 */
const OK = { ok: true };
const no = (reason) => ({ ok: false, reason });

/** The 2D click handler ended the season whenever tension reached 100 after any click. */
export function settle() { if (S.H >= 100 && S.phase === 'play') finish('gone'); }
function done() { settle(); bump(); return OK; }

export function placeAnchor(p, t) {
  if (S.phase !== 'play') return no('phase');
  if (S.ap < 1) return no('no_ap');
  if (S.silk[0] < 10) return no('no_silk');
  if (t < S.tick || t > TICKS) return no('bad_tick');
  if (S.anchors.some((a) => a.c === 0 && a.place === p && a.t === t)) return no('duplicate');
  S.ap--; S.silk[0] -= 10; S.anchors.push({ c: 0, place: p, t, at: S.tick, stake: 10 });
  log(`Якорь: Раковина ${SHORT[0][p]}, тик ${t}.`);
  fx('anchor', { place: p, t });
  return done();
}

export function askGuests(s, f, m) {
  if (S.phase !== 'play') return no('phase');
  const k = s + '_' + f;
  if (S.pins[k]) return no('already_known');
  if ((S.no[k] || []).includes(m)) return no('already_excluded');
  if (S.ap < 1) return no('no_ap');
  if (S.silk[0] < 5) return no('no_silk');
  S.ap--; S.silk[0] -= 5;
  if (S.perm[s][f] === m) {
    S.pins[k] = { m, src: 'Гости' }; log(`Гости: да, «${FORMS[f]}» в слоте «${SLOTS[s]}» значит «${MEAN[s][m]}».`, 'good');
    const b = S.bought.find((x) => x.s === s && x.f === f && !x.honest && !x.revealed); if (b) revealLie(b);
  } else {
    (S.no[k] = S.no[k] || []).push(m); log(`Гости: нет, это не «${MEAN[s][m]}».`, 'muted');
    const b = S.bought.find((x) => x.s === s && x.f === f && x.m === m && !x.revealed); if (b) revealLie(b);
    const left = [0, 1, 2, 3].filter((x) => !S.no[k].includes(x)); if (left.length === 1) S.pins[k] = { m: left[0], src: 'Гости' };
  }
  fx('ask', { s, f, yes: S.perm[s][f] === m });
  return done();
}

/** Changing the reading rule is free. Like the 2D change handler, it does not settle tension. */
export function setRule(r) {
  if (!['unknown', 'top', 'dots'].includes(r)) return no('bad_rule');
  S.rule = r; checkBought(); bump();
  return OK;
}

/** Whether the "see Пепел's key" vision is available right now. */
export function keyVisionStatus() {
  const open = S.isolated[2] && !S.pepelKeyKnown && S.phase === 'play';
  const cells = confidentCells();
  return { open, cells, needCells: 8, enoughCells: cells >= 8, heavyMemory: S.mem.some((m) => m.w >= 3) };
}

export function forget(id, purpose = 'vision') {
  if (S.phase !== 'play') return no('phase');
  const m = S.mem.find((x) => x.id === id);
  if (!m) return no('no_memory');
  if (S.ap < 1) return no('no_ap');
  if (purpose === 'key') { const k = keyVisionStatus(); if (!k.open) return no('key_closed'); if (!k.enoughCells) return no('need_language'); if (m.w < 3) return no('memory_too_light'); }
  S.mem = S.mem.filter((x) => x !== m); S.ap--;
  if (m.kind === 'betrayal') { S.T[0][m.about] = 50; if (isBroken(0, m.about)) { restoreEdge(0, m.about); log(`Ирис забыла обиду и снова говорит с ${NAMES[m.about]}.`); } }
  if (m.kind === 'gift') S.T[0][m.about] = clamp(S.T[0][m.about] - 15, 0, 100);
  if (m.kind === 'first') { S.wild = true; S.ap = Math.min(S.ap, maxAP()); log('Ирис забыла, кто её владелец. Она слушается хуже.', 'bad'); }
  S.forgot.push({ text: m.text, fate: 'на торгах' });
  if (purpose === 'key') { S.pepelKeyKnown = true; log(`Видение: Ирис видит Ключ Пепла — «${S.pepelKey.phrase}».`, 'key'); }
  else {
    const fut = S.events.map((e, i) => ({ e, i })).filter((x) => x.e.pub > S.tick && !S.visions.includes(x.i)).sort((a, b) => a.e.pub - b.e.pub || a.e.t - b.e.t).slice(0, m.w);
    fut.forEach((x) => S.visions.push(x.i));
    log(fut.length ? `Видение: Ирис видит ${fut.length} будущих знака раньше всех.` : 'Видение пусто: будущих гласов больше нет.', 'key');
  }
  fx('memory_burned', { kind: m.kind, about: m.about ?? null, purpose });
  const sh = { id: ++S.uid, from: 0, mem: m, title: m.text, exp: S.tick + 2, bids: [], vals: {}, fg: S.forgot.length - 1 };
  for (let i = 1; i < 6; i++) {
    let v = rnd() * 5; const X = m.about;
    if (m.kind === 'betrayal' && i === X) v = 16 + rnd() * 10;
    if (m.kind === 'debt') v = m.data.amount * (i === X ? .55 : .25 + rnd() * .3);
    if (m.kind === 'promise' && i === X) v = 12 + rnd() * 6;
    if (m.kind === 'gift' && i === X) v = 5 + rnd() * 4;
    if (m.kind === 'call' && i === 5) v = 9 + rnd() * 5;
    if (m.kind === 'first' && i === 1) v = 22 + rnd() * 8;
    v = Math.round(v); sh.vals[i] = v;
    if (v >= 3 && S.silk[i] >= v) sh.bids.push({ c: i, amt: v });
  }
  S.shards.push(sh);
  log(`Осколок «${m.text}» выставлен на торги.`, 'muted');
  return done();
}

export function speakKey() {
  if (S.phase !== 'play') return no('phase');
  if (!S.pepelKeyKnown || !S.isolated[2]) return no('key_unavailable');
  if (S.ap < 1) return no('no_ap');
  S.ap--;
  const h = sha256(S.pepelKey.phrase + S.pepelKey.salt);
  if (h !== S.pepelKey.hash) { log('Ключ не совпал с коммитом.', 'bad'); return done(); }
  log(`Ирис произносит: «${S.pepelKey.phrase}». Хэш совпал с коммитом Пепла ✓`, 'key');
  S.isolated[2] = false;
  for (const j of [0, 1, 3, 4, 5]) if (isBroken(2, j)) { restoreEdge(2, j); S.T[2][j] = Math.max(S.T[2][j], 45); }
  S.T[2][0] = 90;
  log('Пепел возвращается. «Кто-то знал мои слова. Значит, будущее можно прочесть».', 'good');
  fx('key_spoken', { to: 2, hash: h });
  if (S.frag[2].st === 'held' && S.tick < DEADLINE) S.aiPact[2] = S.tick + 1;
  return done();
}

export function mend(j) {
  if (S.phase !== 'play') return no('phase');
  if (!isBroken(0, j)) return no('not_broken');
  if (hasBetrayal(j)) return no('remembers_betrayal');
  if (S.T[j][0] < 25) return no('no_trust');
  if (S.ap < 1) return no('no_ap');
  if (S.silk[0] < 10) return no('no_silk');
  S.ap--; S.silk[0] -= 10; S.silk[j] += 10; restoreEdge(0, j);
  S.T[0][j] = Math.max(S.T[0][j], 40); S.T[j][0] = Math.max(S.T[j][0], 35);
  log(`Ирис и ${NAMES[j]} снова разговаривают.`, 'good');
  return done();
}

export function mediate(i, j) {
  if (S.phase !== 'play') return no('phase');
  if (i === 0 || j === 0 || !isBroken(i, j)) return no('not_broken');
  if (S.isolated[i] || S.isolated[j]) return no('isolated');
  if (S.T[i][0] < 40 || S.T[j][0] < 40) return no('no_trust');
  if (S.ap < 1) return no('no_ap');
  if (S.silk[0] < 15) return no('no_silk');
  S.ap--; S.silk[0] -= 15; restoreEdge(i, j);
  S.T[i][j] = S.T[j][i] = 45; S.T[i][0] += 5; S.T[j][0] += 5; // baseline: no clamp (rules-baseline §12)
  log(`Ирис помирила ${NAMES[i]} и ${NAMES[j]}.`, 'good');
  return done();
}

export function acceptOffer(id) {
  if (S.phase !== 'play') return no('phase');
  const o = S.offers.find((x) => x.id === id);
  if (!o) return no('no_offer');
  if (o.kind === 'sell') { if (S.silk[0] < o.price) return no('no_silk'); S.silk[0] -= o.price; S.silk[o.from] += o.price; S.bought.push({ s: o.s, f: o.f, m: o.m, from: o.from, honest: o.honest, revealed: false }); log(`Куплено слово у ${NAMES[o.from]}. Ирис ему пока верит.`); }
  if (o.kind === 'loan') { if (S.silk[0] < o.n) return no('no_silk'); S.silk[0] -= o.n; S.silk[o.from] += o.n; addMem({ kind: 'debt', about: o.from, w: 2, text: `${NAMES[o.from]} должен ${o.back} шёлка`, data: { amount: o.back, due: o.due } }); log(`Вы одолжили ${NAMES[o.from]} ${o.n} шёлка.`); fx('walk', { from: 0, to: o.from, kind: 'silk' }); }
  if (o.kind === 'gift') { const c = []; for (let s = 0; s < 4; s++) for (let f = 0; f < 4; f++) if (!S.pins[s + '_' + f]) c.push([s, f]); if (c.length) { const [s, f] = c[ri(c.length)]; S.pins[s + '_' + f] = { m: S.perm[s][f], src: 'Иней' }; } addMem({ kind: 'gift', about: 5, w: 1, text: 'Иней подарил слово из летописи' }); trustAdd(0, 5, 15); log('Иней подарил слово. Ирис запомнила.', 'good'); fx('walk', { from: 5, to: 0, kind: 'gift' }); }
  if (o.kind === 'pact') { addMem({ kind: 'promise', about: o.from, w: 2, text: `Вы обещали ${NAMES[o.from]} внести фрагмент до тика ${o.by}`, data: { by: o.by } }); S.aiPact[o.from] = o.by; trustAdd(o.from, 0, 10); log(`Пакт с ${NAMES[o.from]}: оба вносят до тика ${o.by}.`); fx('pact', { with: o.from }); }
  if (o.kind === 'escrow') { if (S.silk[0] < o.price) return no('no_silk'); S.silk[0] -= o.price; S.escrow = o.price; log(`Эскроу открыт: ${o.price} шёлка ждут фрагмента Янтаря.`); fx('escrow', { with: 4 }); }
  S.offers = S.offers.filter((x) => x !== o);
  return done();
}

export function declineOffer(id) {
  const o = S.offers.find((x) => x.id === id);
  if (!o) return no('no_offer');
  S.offers = S.offers.filter((x) => x !== o); S.T[o.from][0] = clamp(S.T[o.from][0] - 2, 0, 100);
  return done();
}

export function bid(id) {
  if (S.phase !== 'play') return no('phase');
  const sh = S.shards.find((x) => x.id === id);
  if (!sh || sh.done) return no('no_auction');
  if (sh.from === 0) return no('own_shard');
  const top = topBid(sh);
  if (top && top.c === 0) return no('already_leading');
  const amt = (top ? top.amt : 0) + 3;
  if (S.silk[0] < amt) return no('no_silk');
  sh.bids = sh.bids.filter((b) => b.c !== 0); sh.bids.push({ c: 0, amt });
  let best = null; for (const [c, v] of Object.entries(sh.vals || {})) if (v >= amt + 2 && S.silk[+c] >= amt + 2 && (!best || v > best.v)) best = { c: +c, v };
  if (best) { sh.bids.push({ c: best.c, amt: amt + 2 }); log(`${NAMES[best.c]} перебивает вашу ставку: ${amt + 2}.`, 'muted'); }
  return done();
}

export function contributeMine() {
  if (S.phase !== 'play') return no('phase');
  if (S.tick > DEADLINE) return no('too_late');
  if (S.frag[0].st !== 'held') return no('no_fragment');
  contribute(0, 'Ирис вносит ваш фрагмент в Свиток.');
  return done();
}

export function castVote(acceptMine) {
  if (S.phase !== 'vote') return no('phase');
  resolveEvent(S.tick);
  const key = S.frag[S.keyHolder], keyIn = key.st === 'scroll';
  const votes = [acceptMine];
  for (let i = 1; i < 6; i++) {
    let g;
    if (keyIn) { g = rnd() < .35 + .6 * S.mast[i] ? S.truthGift : !S.truthGift; if (i === 2 && S.rumor && rnd() < .4) g = false; }
    else g = rnd() < (i === 2 ? .25 : .5);
    votes.push(g);
  }
  S.votes = votes;
  const accept = votes.filter(Boolean).length >= 4;
  const contrib = S.frag.filter((f) => f.st === 'scroll').map((f) => f.owner);
  let o;
  if (S.truthGift && accept) { contrib.forEach((i) => (S.silk[i] += 40)); o = 'gift'; }
  else if (!S.truthGift && accept) { S.silk = S.silk.map(() => 0); o = 'weapon'; }
  else if (!S.truthGift && !accept) { contrib.forEach((i) => (S.silk[i] += 15)); o = 'survived'; }
  else o = 'lost';
  finish(o); bump();
  return OK;
}

export function setHeir(v) { if (S.phase !== 'end') return no('phase'); S.heir = v; bump(); return OK; }

/** Drains queued visual effects for the 3D layer. */
export function takeFx() { const q = S.fx; S.fx = []; return q; }

export { sha256, short, verifyProof, proofFor };
