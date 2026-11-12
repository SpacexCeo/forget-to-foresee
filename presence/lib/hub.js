// The presence hub: rooms of at most 15 players in the sky town, relayed state at 10 Hz, chat with filters and
// rate limits. Pure logic over abstract clients ({send(text), close(code), buffered()}); server.js wires sockets.
//
// Protocol (JSON text frames, each <= 1 KB):
//   client -> server  {t:'hello', v:1, name, skin}   {t:'s', p:[x,y,z], h, a}   {t:'chat', text}   {t:'report', id}   {t:'ping'}
//   server -> client  {t:'welcome', id, room, max, players:[...]}   {t:'join', player}   {t:'leave', id}
//                     {t:'snap', s:[[id,x,y,z,h,a],...]} (10 Hz, only players that moved)   {t:'chat', id, name, text, at}
//                     {t:'sys', key, ...}   {t:'pong'}
export const LIMITS = Object.freeze({
  roomSize: 15, maxRooms: 20, tickHz: 10,
  maxMsgPerSec: 30, maxStatePerSec: 20, chatEveryMs: 2000, chatMax: 140,
  spamStrikes: 4, spamWindowMs: 30000, muteMs: 120000, reportsToMute: 3,
  idleMs: 60000, maxBuffered: 64 * 1024,
  bounds: { x: [-160, 160], y: [-40, 140], z: [-160, 160] },
  maxSpeed: 8, maxFall: 35, snapEveryMs: 3000,
});
export const SKINS = Object.freeze(['iris', 'elise']);
export const ANIMS = Object.freeze(['idle', 'walk', 'run', 'jump', 'fall', 'emote', 'cast', 'sit']);

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

/** Validates a parsed client message; returns it normalized or null. */
export function validate(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return null;
  switch (m.t) {
    case 'hello': return { t: 'hello', name: typeof m.name === 'string' ? m.name.slice(0, 40) : '', skin: SKINS.includes(m.skin) ? m.skin : 'iris' };
    case 's': {
      if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(num) || !num(m.h)) return null;
      return { t: 's', p: m.p, h: ((m.h % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), a: ANIMS.includes(m.a) ? m.a : 'idle' };
    }
    case 'chat': return typeof m.text === 'string' && m.text.length <= 400 ? { t: 'chat', text: m.text } : null;
    case 'report': return Number.isInteger(m.id) ? { t: 'report', id: m.id } : null;
    case 'ping': return { t: 'ping' };
    default: return null;
  }
}

/** A per-second counter with a cap. */
function meter(cap, now) { let sec = -1, n = 0; return () => { const s = Math.floor(now() / 1000); if (s !== sec) { sec = s; n = 0; } return ++n <= cap; }; }

export function createHub({ now = () => Date.now(), log = () => {}, limits = LIMITS } = {}) {
  const rooms = new Map(); // room number -> Map(id -> player)
  let nextId = 1, guestN = 1;
  const stats = { joined: 0, kicked: 0, chat: 0, chatDropped: 0 };

  const send = (pl, obj) => {
    if (pl.client.buffered() > limits.maxBuffered) { kick(pl, 'slow'); return; }
    pl.client.send(JSON.stringify(obj));
  };
  const broadcast = (room, obj, except = null) => {
    const text = JSON.stringify(obj);
    for (const pl of rooms.get(room).values()) if (pl !== except) { if (pl.client.buffered() > limits.maxBuffered) kick(pl, 'slow'); else pl.client.send(text); }
  };
  const view = (pl) => ({ id: pl.id, name: pl.name, skin: pl.skin, p: pl.p, h: pl.h, a: pl.a });

  function roomFor() {
    for (const [n, r] of rooms) if (r.size < limits.roomSize) return n;
    if (rooms.size >= limits.maxRooms) return null;
    let n = 1; while (rooms.has(n)) n++;
    rooms.set(n, new Map()); return n;
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
    if (r.size === 0) rooms.delete(pl.room); else broadcast(pl.room, { t: 'leave', id: pl.id });
  }

  /** A new connection. Returns {onText(text), onClose()}. */
  function connect(client) {
    const pl = { client, id: 0, room: null, name: '', skin: 'iris', p: [0, 0, 0], h: 0, a: 'idle', at: now(), moved: false, gone: false,
      msg: meter(limits.maxMsgPerSec, now), state: meter(limits.maxStatePerSec, now), lastChat: 0, strikes: [], mutedUntil: 0, reports: new Set(), lastSnap: 0, seen: now() };
    function onText(text) {
      if (pl.gone) return;
      pl.seen = now();
      if (!pl.msg()) return kick(pl, 'flood');
      let m; try { m = validate(JSON.parse(text)); } catch { m = null; }
      if (!m) return kick(pl, 'bad_message');
      if (m.t === 'ping') return send(pl, { t: 'pong' });
      if (pl.room == null) {
        if (m.t !== 'hello') return kick(pl, 'hello_first');
        const room = roomFor();
        if (room == null) { client.send(JSON.stringify({ t: 'sys', key: 'full' })); client.close(1013); pl.gone = true; return; }
        pl.id = nextId++; pl.room = room; pl.skin = m.skin; pl.name = uniqueName(room, cleanName(m.name, guestN++));
        const r = rooms.get(room);
        send(pl, { t: 'welcome', id: pl.id, room, max: limits.roomSize, players: [...r.values()].map(view) });
        r.set(pl.id, pl);
        broadcast(room, { t: 'join', player: view(pl) }, pl);
        stats.joined++;
        return;
      }
      if (m.t === 'hello') return; // already joined
      if (m.t === 's') { if (!pl.state()) return; return move(pl, m); }
      if (m.t === 'chat') return chat(pl, m.text);
      if (m.t === 'report') return report(pl, m.id);
    }
    return { onText, onClose: () => leave(pl), player: pl };
  }

  function uniqueName(room, name) {
    const taken = new Set([...rooms.get(room).values()].map((p) => p.name));
    if (!taken.has(name)) return name;
    for (let i = 2; ; i++) if (!taken.has(name + i)) return name + i;
  }

  /** Server-side clamp: town bounds, horizontal speed, fall speed; a rare larger jump (respawn) is allowed as a snap. */
  function move(pl, m) {
    const t = now(), dt = Math.max(0.05, Math.min(1, (t - pl.at) / 1000));
    const b = limits.bounds;
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
    broadcast(pl.room, { t: 'chat', id: pl.id, name: pl.name, text, at: t });
  }

  function report(pl, id) {
    const target = rooms.get(pl.room) && rooms.get(pl.room).get(id);
    if (!target || target === pl) return;
    target.reports.add(pl.id);
    if (target.reports.size >= limits.reportsToMute) { target.mutedUntil = now() + limits.muteMs * 5; target.reports.clear(); log('muted_by_reports'); }
    send(pl, { t: 'sys', key: 'reported' });
  }

  /** One 10 Hz tick: a snapshot of moved players per room; idle players are dropped. */
  function tick() {
    const t = now();
    for (const [room, r] of rooms) {
      const s = [];
      for (const pl of [...r.values()]) {
        if (t - pl.seen > limits.idleMs) { kick(pl, 'idle'); continue; }
        if (pl.dirty) { s.push([pl.id, ...pl.p, pl.h, pl.a]); pl.dirty = false; }
      }
      if (s.length && rooms.has(room)) broadcast(room, { t: 'snap', s });
    }
  }

  return {
    connect, tick,
    stats: () => ({ ...stats, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.size, 0), byRoom: Object.fromEntries([...rooms].map(([n, r]) => [n, r.size])) }),
  };
}
