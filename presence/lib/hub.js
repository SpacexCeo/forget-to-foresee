// The presence hub: rooms of at most 15 players in the sky town, relayed state at 10 Hz, chat with filters and
// rate limits. Pure logic over abstract clients ({send(text), close(code), buffered()}); server.js wires sockets.
//
// Protocol (JSON text frames, each <= 1 KB):
//   client -> server  {t:'hello', v:1, name, skin, account?, lv?}  (account: the player's NEAR account, so others can read its
//                     public NFTs and silk on chain; lv: the level the player shows, 0-99, cosmetic)   {t:'s', p:[x,y,z], h, a}   {t:'chat', text}   {t:'report', id}   {t:'ping'}
//                     {t:'act', k, v?}  (a notable action: k is one of history.js ACT_KINDS, v its one checked value; never free text)
//   server -> client  {t:'welcome', id, name, room, max, players:[...]}   {t:'join', player}   {t:'leave', id}
//                     {t:'hist', chat:[{name, account?, text, at}], acts:[{name, account?, k, v?, at}]} (right after welcome: the room's
//                     last lines and actions, oldest first)
//                     {t:'snap', s:[[id,x,y,z,h,a],...]} (10 Hz, only players that moved)   {t:'chat', id, name, account?, text, at}
//                     {t:'act', id, name, account?, k, v?, at}   {t:'sys', key, ...}   {t:'pong'}
//   v2 (14.11, full multiplayer; an older client never sends these and ignores what it does not know):
//   client -> server  hello also carries area ('town' | 'isles': rooms are per area) and the hero (iris | elise | sheriffchenko)
//                     {t:'fx', k}  (a blow or a cast of ours, drawn at our server position by the others; 4 a second)
//                     {t:'hit', mob, k, n}  (our blow landed on a shared spider: kind and amount, checked here)
//   server -> client  welcome also carries caps ['area','fx','mobs'] and, in the town, mobs: the shared spiders
//                     {t:'mobs', m:[[id,x,z,h,hp,state],...]} (5 Hz, changed only)   {t:'bite', mob, dmg} (to the bitten player)
//                     {t:'mdeath', mob, loot:[ids]} (who may loot it)   {t:'fx', id, k, p, h}
import { createHistory, ACT_KINDS } from './history.js';
import { createMobWorld, HIT_MAX, HITS_PER_SEC } from './mobs.js';

export const LIMITS = Object.freeze({
  roomSize: 15, maxRooms: 20, tickHz: 10,
  maxMsgPerSec: 30, maxStatePerSec: 20, chatEveryMs: 2000, chatMax: 140,
  spamStrikes: 4, spamWindowMs: 30000, muteMs: 120000, reportsToMute: 3,
  actEveryMs: 3000, actPerMin: 10,
  idleMs: 60000, maxBuffered: 64 * 1024,
  bounds: { x: [-160, 160], y: [-40, 140], z: [-160, 160] },
  maxSpeed: 8, maxFall: 35, snapEveryMs: 3000,
});
export const SKINS = Object.freeze(['iris', 'elise', 'sheriffchenko']);
export const ANIMS = Object.freeze(['idle', 'walk', 'run', 'jump', 'fall', 'emote', 'cast', 'sit', 'strike1', 'strike2', 'strike3', 'super', 'dash', 'hurt', 'dead']);
export const AREAS = Object.freeze({ town: { x: [-160, 160], y: [-40, 140], z: [-160, 160] }, isles: { x: [-400, 400], y: [-80, 240], z: [-400, 400] } });
export const FX_KINDS = Object.freeze(['strike', 'strike3', 'super', 'lance', 'snare', 'dash']);
export const CAPS = Object.freeze(['area', 'fx', 'mobs']);

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ru|xyz|gg|me|ly|link|app|site|top|info)\b|t\.me\/|discord\.gg)/i;
// A short list on purpose: obvious slurs and obscenities in the game's languages; masks, never rewrites meaning.
const BAD = ['fuck', 'shit', 'cunt', 'nigger', 'faggot', 'bitch', 'хуй', 'пизд', 'ебат', 'ебан', 'бляд', 'сука', 'пидор', 'хуя', 'хує'];

/** Chat text after the filters, or null when it must not be sent. */
export function filterChat(text) {
  if (typeof text !== 'string') return null;
  let s = text.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s.length > LIMITS.chatMax) return null;
  if (URL_RE.test(s)) return null;
  for (const w of BAD) s = s.replace(new RegExp(w, 'gi'), (m) => m[0] + '*'.repeat(m.length - 1));
  return s;
}

/** Display name: the Day 1 nickname rule (a-z, 0-9, at most 12) or guest-<n>. */
export function cleanName(name, fallbackN) {
  const s = [...String(name == null ? '' : name).toLowerCase()].filter((c) => /^[a-z0-9]$/.test(c)).slice(0, 12).join('');
  return s && !BAD.some((w) => s.includes(w)) ? s : 'guest' + fallbackN;
}

const num = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
const round = (v) => Math.round(v * 100) / 100;

const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;
/** Validates a parsed client message; returns it normalized or null. */
export function validate(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return null;
  switch (m.t) {
    case 'hello': return { t: 'hello', name: typeof m.name === 'string' ? m.name.slice(0, 40) : '', skin: SKINS.includes(m.skin) ? m.skin : 'iris',
      account: typeof m.account === 'string' && ACCOUNT_RE.test(m.account) ? m.account : null, lv: Number.isInteger(m.lv) && m.lv >= 0 && m.lv <= 99 ? m.lv : null,
      area: Object.hasOwn(AREAS, m.area) ? m.area : 'town' };
    case 's': {
      if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(num) || !num(m.h)) return null;
      return { t: 's', p: m.p, h: ((m.h % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), a: ANIMS.includes(m.a) ? m.a : 'idle' };
    }
    case 'chat': return typeof m.text === 'string' && m.text.length <= 400 ? { t: 'chat', text: m.text } : null;
    case 'act': return typeof m.k === 'string' && Object.hasOwn(ACT_KINDS, m.k) && ACT_KINDS[m.k](m.v ?? null) ? { t: 'act', k: m.k, v: m.v ?? null } : null;
    case 'fx': return FX_KINDS.includes(m.k) ? { t: 'fx', k: m.k } : null;
    case 'hit': return typeof m.mob === 'string' && /^[a-z]{2,12}[0-9]{1,2}_[0-9]{1,2}$/.test(m.mob) && Object.hasOwn(HIT_MAX, m.k) && num(m.n) ? { t: 'hit', mob: m.mob, k: m.k, n: m.n } : null;
    case 'report': return Number.isInteger(m.id) ? { t: 'report', id: m.id } : null;
    case 'ping': return { t: 'ping' };
    default: return null;
  }
}

/** A per-second counter with a cap. */
function meter(cap, now) { let sec = -1, n = 0; return () => { const s = Math.floor(now() / 1000); if (s !== sec) { sec = s; n = 0; } return ++n <= cap; }; }

export function createHub({ now = () => Date.now(), log = () => {}, limits = LIMITS, history = createHistory({ now }), mobWorld = () => createMobWorld({ now }) } = {}) {
  const rooms = new Map(); // room number -> Map(id -> player)
  const areaOf = new Map(); // room number -> 'town' | 'isles'
  const worlds = new Map(); // town room number -> its shared spiders (lib/mobs.js)
  let lastTick = now(), tickN = 0;
  let nextId = 1, guestN = 1;
  const stats = { joined: 0, kicked: 0, chat: 0, chatDropped: 0, acts: 0, actsDropped: 0, fx: 0, hits: 0, hitsRefused: 0, kills: 0, bites: 0 };

  const send = (pl, obj) => {
    if (pl.client.buffered() > limits.maxBuffered) { kick(pl, 'slow'); return; }
    pl.client.send(JSON.stringify(obj));
  };
  const broadcast = (room, obj, except = null) => {
    const text = JSON.stringify(obj);
    for (const pl of rooms.get(room).values()) if (pl !== except) { if (pl.client.buffered() > limits.maxBuffered) kick(pl, 'slow'); else pl.client.send(text); }
  };
  const view = (pl) => ({ id: pl.id, name: pl.name, skin: pl.skin, p: pl.p, h: pl.h, a: pl.a, ...(pl.account ? { account: pl.account } : {}), ...(pl.lv != null ? { lv: pl.lv } : {}) });

  function roomFor(area = 'town') {
    for (const [n, r] of rooms) if (r.size < limits.roomSize && areaOf.get(n) === area) return n;
    if (rooms.size >= limits.maxRooms) return null;
    let n = 1; while (rooms.has(n)) n++;
    rooms.set(n, new Map()); areaOf.set(n, area);
    if (area === 'town' && !worlds.has(n)) worlds.set(n, mobWorld());
    return n;
  }

  function kick(pl, reason) {
    if (pl.gone) return;
    stats.kicked++; log('kick', reason);
    try { pl.client.send(JSON.stringify({ t: 'sys', key: 'kicked', reason })); } catch { /* closed */ }
    pl.client.close(reason === 'slow' ? 1008 : 4000);
    leave(pl);
  }

  function leave(pl) {
    if (pl.gone) return; pl.gone = true;
    if (pl.room == null) return;
    const r = rooms.get(pl.room); if (!r) return;
    r.delete(pl.id);
    const w = worlds.get(pl.room); if (w) w.forget(pl.id);
    if (r.size === 0) { rooms.delete(pl.room); areaOf.delete(pl.room); worlds.delete(pl.room); } else broadcast(pl.room, { t: 'leave', id: pl.id });
  }

  /** A new connection. Returns {onText(text), onClose()}. */
  function connect(client) {
    const pl = { client, id: 0, room: null, name: '', skin: 'iris', p: [0, 0, 0], h: 0, a: 'idle', at: now(), moved: false, gone: false,
      msg: meter(limits.maxMsgPerSec, now), state: meter(limits.maxStatePerSec, now), fxm: meter(4, now), hitm: meter(HITS_PER_SEC, now), area: 'town', lastChat: 0, lastAct: 0, acts: [], strikes: [], mutedUntil: 0, reports: new Set(), lastSnap: 0, seen: now() };
    function onText(text) {
      if (pl.gone) return;
      pl.seen = now();
      if (!pl.msg()) return kick(pl, 'flood');
      let m; try { m = validate(JSON.parse(text)); } catch { m = null; }
      if (!m) return kick(pl, 'bad_message');
      if (m.t === 'ping') return send(pl, { t: 'pong' });
      if (pl.room == null) {
        if (m.t !== 'hello') return kick(pl, 'hello_first');
        pl.area = m.area;
        const room = roomFor(m.area);
        if (room == null) { client.send(JSON.stringify({ t: 'sys', key: 'full' })); client.close(1013); pl.gone = true; return; }
        pl.id = nextId++; pl.room = room; pl.skin = m.skin; pl.account = m.account; pl.lv = m.lv; pl.name = uniqueName(room, cleanName(m.name, guestN++));
        const r = rooms.get(room);
        send(pl, { t: 'welcome', id: pl.id, name: pl.name, room, max: limits.roomSize, players: [...r.values()].map(view), kinds: Object.keys(ACT_KINDS), caps: CAPS, area: pl.area, ...(worlds.has(room) ? { mobs: worlds.get(room).all() } : {}) }); // kinds: the acts this server takes (a newer client never sends one it would kick for)
        if (!pl.gone) send(pl, { t: 'hist', ...history.get(room) });
        r.set(pl.id, pl);
        broadcast(room, { t: 'join', player: view(pl) }, pl);
        stats.joined++;
        return;
      }
      if (m.t === 'hello') return; // already joined
      if (m.t === 's') { if (!pl.state()) return; return move(pl, m); }
      if (m.t === 'chat') return chat(pl, m.text);
      if (m.t === 'act') return act(pl, m);
      if (m.t === 'fx') { if (!pl.fxm() || !pl.moved) return; stats.fx++; return broadcast(pl.room, { t: 'fx', id: pl.id, k: m.k, p: pl.p, h: pl.h }, pl); }
      if (m.t === 'hit') return hitMob(pl, m);
      if (m.t === 'report') return report(pl, m.id);
    }
    return { onText, onClose: () => leave(pl), player: pl };
  }

  function uniqueName(room, name) {
    const taken = new Set([...rooms.get(room).values()].map((p) => p.name));
    if (!taken.has(name)) return name;
    for (let i = 2; ; i++) if (!taken.has(name + i)) return name + i;
  }

  /** A blow on a shared spider: the world checks it from the player's server position; a kill tells the room who may loot. */
  function hitMob(pl, m) {
    const w = worlds.get(pl.room);
    if (!w || !pl.hitm() || !pl.moved) { stats.hitsRefused++; return; }
    const r = w.hit(pl.id, pl.p, m.mob, m.k, m.n);
    if (!r.ok) { stats.hitsRefused++; return; }
    stats.hits++;
    if (r.death) { stats.kills++; broadcast(pl.room, { t: 'mdeath', mob: r.death.mob, loot: r.death.loot }); }
  }

  /** Server-side clamp: town bounds, horizontal speed, fall speed; a rare larger jump (respawn) is allowed as a snap. */
  function move(pl, m) {
    const t = now(), dt = Math.max(0.05, Math.min(1, (t - pl.at) / 1000));
    const b = pl.area === 'town' ? limits.bounds : AREAS[pl.area];
    let [x, y, z] = [clamp(m.p[0], b.x), clamp(m.p[1], b.y), clamp(m.p[2], b.z)];
    const [px, py, pz] = pl.p, dx = x - px, dz = z - pz, dh = Math.hypot(dx, dz), maxH = limits.maxSpeed * dt + 0.5;
    const first = !pl.moved;
    if (!first && (dh > maxH || Math.abs(y - py) > limits.maxFall * dt + 1)) {
      if (t - pl.lastSnap >= limits.snapEveryMs) pl.lastSnap = t; // respawn / flight: accept once in a while
      else { const k = dh > maxH ? maxH / dh : 1; x = px + dx * k; z = pz + dz * k; y = py + clamp(y - py, [-(limits.maxFall * dt + 1), limits.maxFall * dt + 1]); }
    }
    pl.p = [round(x), round(y), round(z)]; pl.h = round(m.h); pl.a = m.a; pl.at = t; pl.moved = true; pl.dirty = true;
  }

  function chat(pl, raw) {
    const t = now();
    if (t < pl.mutedUntil) { stats.chatDropped++; return send(pl, { t: 'sys', key: 'muted', s: Math.ceil((pl.mutedUntil - t) / 1000) }); }
    const text = filterChat(raw);
    if (t - pl.lastChat < limits.chatEveryMs || !text) {
      pl.strikes = pl.strikes.filter((s) => t - s < limits.spamWindowMs); pl.strikes.push(t);
      stats.chatDropped++;
      if (pl.strikes.length >= limits.spamStrikes) { pl.mutedUntil = t + limits.muteMs; pl.strikes = []; return send(pl, { t: 'sys', key: 'muted', s: limits.muteMs / 1000 }); }
      return send(pl, { t: 'sys', key: text ? 'slow_down' : 'filtered' });
    }
    pl.lastChat = t; stats.chat++;
    const line = history.addChat(pl.room, { name: pl.name, account: pl.account, text, at: t }) || { name: pl.name, text, at: t };
    broadcast(pl.room, { t: 'chat', id: pl.id, ...line });
  }

  /** A notable action (level up, quest, chest, boss, trade): relayed and remembered; too many are dropped in silence. */
  function act(pl, m) {
    const t = now();
    pl.acts = pl.acts.filter((x) => t - x < 60000);
    if (t < pl.mutedUntil || t - pl.lastAct < limits.actEveryMs || pl.acts.length >= limits.actPerMin) { stats.actsDropped++; return; }
    const e = history.addAct(pl.room, { name: pl.name, account: pl.account, k: m.k, v: m.v, at: t });
    if (!e) { stats.actsDropped++; return; }
    pl.lastAct = t; pl.acts.push(t); stats.acts++;
    broadcast(pl.room, { t: 'act', id: pl.id, ...e });
  }

  function report(pl, id) {
    const target = rooms.get(pl.room) && rooms.get(pl.room).get(id);
    if (!target || target === pl) return;
    target.reports.add(pl.id);
    if (target.reports.size >= limits.reportsToMute) { target.mutedUntil = now() + limits.muteMs * 5; target.reports.clear(); log('muted_by_reports'); }
    send(pl, { t: 'sys', key: 'reported' });
  }

  /** One 10 Hz tick: a snapshot of moved players per room; idle players are dropped; the shared spiders step (5 Hz out). */
  function tick() {
    const t = now(), dt = Math.max(0, Math.min(0.5, (t - lastTick) / 1000)); lastTick = t; tickN++;
    for (const [room, r] of rooms) {
      const s = [];
      for (const pl of [...r.values()]) {
        if (t - pl.seen > limits.idleMs) { kick(pl, 'idle'); continue; }
        if (pl.dirty) { s.push([pl.id, ...pl.p, pl.h, pl.a]); pl.dirty = false; }
      }
      if (s.length && rooms.has(room)) broadcast(room, { t: 'snap', s });
      const w = worlds.get(room);
      if (w && rooms.has(room)) {
        const ps = [...r.values()].filter((pl) => pl.moved && !pl.gone).map((pl) => ({ id: pl.id, p: pl.p }));
        for (const e of w.step(dt, ps)) if (e.k === 'bite') { const v = r.get(e.target); if (v) { stats.bites++; send(v, { t: 'bite', mob: e.mob, dmg: e.dmg }); } }
        if (tickN % 2 === 0) { const ch = w.changed(); if (ch.length && rooms.has(room)) broadcast(room, { t: 'mobs', m: ch }); }
      }
    }
  }

  return {
    connect, tick,
    stats: () => ({ ...stats, ...history.stats(), spiders: worlds.size, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.size, 0), byRoom: Object.fromEntries([...rooms].map(([n, r]) => [n, r.size])) }),
  };
}
