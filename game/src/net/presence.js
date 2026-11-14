// The shared town, the network side (docs/multiplayer.md): one WebSocket to the presence service, our state at most
// 10 times a second (only when it changed), the other players' snapshots buffered and interpolated 150 ms behind
// (extrapolated at most 250 ms when a snapshot is late), and the room's chat. No three.js here: play/remote-players.js
// draws, ui/chat-panel.js shows the chat. Offline is a normal state: the game stays single-player and says so.
// The room remembers (presence/lib/history.js): on joining we get its last chat lines and the players' last notable
// actions ("hist"); they sit in the same `chat` list marked `old`, so the panel shows them and no bubble pops up.
import { DAY1_DEPLOYMENT } from './day1-deployment.js';
import { botAt, BOT_NAMES } from './bot-walk.js';

const envUrl = () => { try { return import.meta.env && import.meta.env.VITE_FTF_PRESENCE_URL; } catch { return undefined; } };
/** wss URL of the presence service, or '' (then the town is single-player). */
export const presenceUrl = (dep = DAY1_DEPLOYMENT) => String(envUrl() || (dep && dep.presence) || '');

export const SEND_HZ = 10, DELAY_MS = 150, EXTRAPOLATE_MS = 250;
const MUTE_KEY = 'ftf.mp.muted.v1';
/** The notable actions a player may tell the room (the server's whitelist, presence/lib/history.js ACT_KINDS): kind -> its value check. */
export const ACTS = Object.freeze({
  level: (v) => Number.isInteger(v) && v >= 2 && v <= 99,
  quest: (v) => v == null,
  chest: (v) => ['common', 'rare', 'legendary'].includes(v),
  boss: (v) => ['crownrift', 'shoal'].includes(v),
  trade: (v) => v == null,
  gate: (v) => v == null, // the Gate-Loom was paid: everyone's Loom flares (game/src/ui/loom-meter.js)
});
/** The acts every presence server takes (before 14.11 a server named no kinds in its welcome and kicked for any other). */
export const FIRST_ACTS = Object.freeze(['level', 'quest', 'chest', 'boss', 'trade']);
export const ACT_EVERY_MS = 3200, ACT_QUEUE = 5, CHAT_KEEP = 90;
const validAct = (k, v) => typeof k === 'string' && Object.hasOwn(ACTS, k) && ACTS[k](v ?? null);
/** Drawing limits for the other players (play/remote-players.js). */
export const REMOTE = Object.freeze({ maxDrawnPhone: 8, maxDrawnDesktop: 15, farM: 70, tagFarM: 25 });

/** Which remote players to draw: the nearest `max` within `far` metres of `from` (horizontal distance). */
export function pickDrawn(list, from, max, far = REMOTE.farM) {
  return list.map((r) => ({ r, d: Math.hypot(r.p[0] - from[0], r.p[2] - from[2]) })).filter((x) => x.d <= far).sort((a, b) => a.d - b.d).slice(0, max).map((x) => x.r.id);
}

/** The animation name the server relays, from the player's ground speed (m/s) and grounded flag. */
export const animFor = (speed, grounded = true) => (!grounded ? 'fall' : speed > 2.6 ? 'run' : speed > 0.25 ? 'walk' : 'idle');

/**
 * Our combat moves as the room sees them (presence v2, owner 14.11: "hits and casts of others shown"): the clip that
 * started (play/iris-avatar.js 'ftf:iris-action') -> the relayed animation and the effect the others draw. A server
 * before v2 turns an animation it does not know into 'idle' and never gets an fx, so nothing breaks there.
 */
export const COMBAT = Object.freeze({
  strike1: { a: 'strike1', fx: 'strike' }, strike2: { a: 'strike2', fx: 'strike' }, strike3: { a: 'strike3', fx: 'strike3' },
  strike_super: { a: 'super', fx: 'super' }, dash: { a: 'dash', fx: 'dash' }, cast_lance: { a: 'cast', fx: 'lance' }, cast_snare: { a: 'cast', fx: 'snare' },
});
/** How long a combat animation stays in our state after it started (s): long enough for one 10 Hz send. */
export const COMBAT_HOLD = 0.45;
/** The remote clip for a relayed animation (null: the gait handles it). */
export const CLIP_OF = Object.freeze({ strike1: 'strike1', strike2: 'strike2', strike3: 'strike3', super: 'strike_super', dash: 'dash', cast: 'cast_lance' });
/** The spider states the server sends (presence/lib/mobs.js MOB_STATES), by index. */
export const MOB_STATES = Object.freeze(['idle', 'chase', 'windup', 'dead']);

/** A shared spider where it should be drawn at time t (ms): interpolated between its last two server rows. */
export function sampleMob(buf, t) {
  if (!buf.length) return null;
  const b = buf[buf.length - 1];
  if (buf.length === 1 || t >= b.at) return { x: b.x, z: b.z, h: b.h };
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1], c = buf[i];
    if (t >= a.at && t <= c.at) { const k = (t - a.at) / Math.max(1, c.at - a.at); return { x: a.x + (c.x - a.x) * k, z: a.z + (c.z - a.z) * k, h: lerpAngle(a.h, c.h, k) }; }
  }
  return { x: buf[0].x, z: buf[0].z, h: buf[0].h };
}

/** Linear blend of two angles along the short way. */
export function lerpAngle(a, b, k) { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * k; }

/**
 * Where a remote player is at render time `t` (ms) from its snapshot buffer [{at, p, h, a}] (oldest first).
 * Interpolates between the two snapshots around `t`; past the newest, extrapolates its velocity up to EXTRAPOLATE_MS.
 */
export function sample(buf, t) {
  if (!buf.length) return null;
  if (t <= buf[0].at || buf.length === 1) return { p: buf[0].p.slice(), h: buf[0].h, a: buf[0].a, speed: 0 };
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1], b = buf[i];
    if (t >= a.at && t <= b.at) {
      const k = (t - a.at) / Math.max(1, b.at - a.at);
      const speed = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]) / Math.max(0.001, (b.at - a.at) / 1000);
      return { p: a.p.map((v, j) => v + (b.p[j] - v) * k), h: lerpAngle(a.h, b.h, k), a: k < 0.5 ? a.a : b.a, speed };
    }
  }
  const a = buf[buf.length - 2], b = buf[buf.length - 1];
  const dt = Math.max(1, b.at - a.at), over = Math.min(EXTRAPOLATE_MS, t - b.at) / dt;
  const speed = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]) / (dt / 1000);
  return { p: b.p.map((v, j) => v + (v - a.p[j]) * over), h: b.h, a: b.a, speed };
}

/** Our state only when it changed enough to matter (5 cm, 2 degrees or another animation). */
export function changed(prev, s) {
  if (!prev) return true;
  return prev.a !== s.a || Math.abs(prev.h - s.h) > 0.035 || Math.hypot(prev.p[0] - s.p[0], prev.p[1] - s.p[1], prev.p[2] - s.p[2]) > 0.05;
}

/**
 * @param {{url?: string, name?: string, skin?: 'iris'|'elise', storage?: Storage, WebSocketImpl?: typeof WebSocket, now?: () => number,
 *          onChange?: () => void, maxRetries?: number}} o
 */
export function createPresence({ url = presenceUrl(), name = '', skin = 'iris', account = null, lv = null, area = 'town', storage = null, WebSocketImpl = globalThis.WebSocket, now = () => performance.now(), onChange = () => {}, maxRetries = 4 } = {}) {
  const players = new Map(); // id -> {id, name, skin, buf: [{at,p,h,a}]}
  // chat lines {id, name, account, text, at, mine, old?} and actions {act: true, id, name, account, k, v, at, mine, old?}, oldest
  // first; `at` is the server's clock (epoch ms); `old` marks what the room remembered from before we joined
  const chat = [];
  // canAct: this server knows 'act' (it sent 'hist'); an older one would disconnect us for an unknown message
  let myName = '', lastActAt = -Infinity, idleKicked = false, canAct = false, kinds = null; const actQ = [];
  // kinds: the acts the server named in its welcome; a server that names none takes only the first five (it kicks for any other)
  const serverTakes = (k) => (kinds ? kinds.includes(k) : FIRST_ACTS.includes(k));
  let caps = new Set(); const mobs = new Map(); const ears = { bite: [], death: [], fx: [] };
  const tell = (k, e) => { for (const f of ears[k]) try { f(e); } catch (err) { console.warn('[mp]', err); } };
  let ws = null, id = 0, room = 0, max = 15, status = url && WebSocketImpl ? 'connecting' : 'offline', retries = 0, lastSent = null, lastSendAt = 0, stopped = false, timer = null, sys = null;
  let muted = new Set(); try { muted = new Set(JSON.parse((storage && storage.getItem(MUTE_KEY)) || '[]')); } catch { /* fresh */ }
  const saveMuted = () => { try { storage && storage.setItem(MUTE_KEY, JSON.stringify([...muted].slice(-200))); } catch { /* private mode */ } };
  const emit = () => { try { onChange(); } catch { /* UI errors stay in the UI */ } };
  const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const isMine = (m) => (account && m.account ? m.account === account : !!myName && m.name === myName && !m.account === !account);
  const keep = (e) => { chat.push(e); while (chat.length > CHAT_KEEP) chat.shift(); };
  const pump = () => { if (actQ.length && status === 'online' && now() - lastActAt >= ACT_EVERY_MS) { lastActAt = now(); send({ t: 'act', ...actQ.shift() }); } };
  const add = (pl) => { players.set(pl.id, { id: pl.id, name: pl.name, skin: pl.skin, account: pl.account || null, lv: pl.lv ?? null, buf: [{ at: now(), p: pl.p, h: pl.h, a: pl.a }] }); };

  function open() {
    if (stopped || !url || !WebSocketImpl) { status = 'offline'; emit(); return; }
    status = 'connecting'; emit();
    try { ws = new WebSocketImpl(url); } catch { return retry(); }
    // the account lets others read this player's public NFTs and silk on chain (the player card); lv is the shown level
    ws.onopen = () => { retries = 0; send({ t: 'hello', v: 1, name, skin, area, ...(account ? { account } : {}), ...(Number.isInteger(lv) ? { lv } : {}) }); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
    ws.onclose = () => { ws = null; players.clear(); mobs.clear(); caps = new Set(); if (status !== 'offline') retry(); };
    ws.onerror = () => {};
  }
  function retry() {
    ws = null;
    if (stopped || ++retries > maxRetries) { status = 'offline'; emit(); return; }
    status = 'connecting'; emit();
    timer = setTimeout(open, Math.min(30000, 1000 * 2 ** retries));
  }
  /** Rows [id, x, z, h, hp, state] from the server: each spider keeps its last positions for interpolation. */
  function mobRows(rows, t) {
    for (const r of rows) {
      if (!Array.isArray(r) || typeof r[0] !== 'string' || ![1, 2, 3, 4].every((i) => Number.isFinite(r[i]))) continue;
      let e = mobs.get(r[0]); if (!e) mobs.set(r[0], e = { id: r[0], buf: [], hp: r[4], st: 'idle' });
      const st = MOB_STATES[r[5]] || 'idle';
      if (e.st === 'dead' && st !== 'dead') e.buf.length = 0; // it came back somewhere else: no slide from its grave
      e.buf.push({ at: t, x: r[1], z: r[2], h: r[3] }); if (e.buf.length > 4) e.buf.shift();
      e.hp = r[4]; e.st = st;
    }
  }
  function handle(m) {
    const t = now();
    if (m.t === 'welcome') { id = m.id; room = m.room; max = m.max; myName = typeof m.name === 'string' ? m.name : name; canAct = false; kinds = Array.isArray(m.kinds) ? m.kinds.filter((k) => typeof k === 'string') : null; actQ.length = 0; players.clear(); for (const p of m.players) add(p); status = 'online'; lastSent = null;
      caps = new Set(Array.isArray(m.caps) ? m.caps : []); mobs.clear(); if (Array.isArray(m.mobs)) mobRows(m.mobs, t);
      emit(); }
    else if (m.t === 'join') { add(m.player); if (m.player && typeof m.player.name === 'string' && !muted.has(m.player.name)) keep({ act: true, k: 'joined', id: m.player.id, name: m.player.name, at: Date.now(), mine: false, local: true }); emit(); }
    else if (m.t === 'leave') { const gone = players.get(m.id); players.delete(m.id); if (gone && !muted.has(gone.name)) keep({ act: true, k: 'left', id: m.id, name: gone.name, at: Date.now(), mine: false, local: true }); emit(); }
    else if (m.t === 'mobs') { if (Array.isArray(m.m)) mobRows(m.m, t); }
    else if (m.t === 'bite') { if (typeof m.mob === 'string' && Number.isFinite(m.dmg)) tell('bite', { mob: m.mob, dmg: Math.max(0, Math.min(50, m.dmg)) }); }
    else if (m.t === 'mdeath') { if (typeof m.mob === 'string') { const r = mobs.get(m.mob); if (r) { r.hp = 0; r.st = 'dead'; } tell('death', { mob: m.mob, mine: Array.isArray(m.loot) && m.loot.includes(id) }); } }
    else if (m.t === 'fx') { const pl = players.get(m.id); if (pl && Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite) && Object.values(COMBAT).some((c) => c.fx === m.k)) tell('fx', { id: m.id, k: m.k, p: m.p, h: Number(m.h) || 0 }); }
    else if (m.t === 'snap') {
      for (const [pid, x, y, z, h, a] of m.s) {
        if (pid === id) continue;
        const pl = players.get(pid); if (!pl) continue;
        pl.buf.push({ at: t, p: [x, y, z], h, a });
        while (pl.buf.length > 2 && pl.buf[1].at < t - 1000) pl.buf.shift();
        if (pl.buf.length > 20) pl.buf.shift();
      }
    } else if (m.t === 'hist') {
      // the room's memory replaces what we held (a reconnect brings the same lines again), oldest first by the server clock
      const lines = (Array.isArray(m.chat) ? m.chat : []).filter((c) => c && typeof c.name === 'string' && typeof c.text === 'string').map((c) => ({ id: 0, name: c.name, account: c.account || null, text: c.text, at: c.at, old: true }));
      const acts = (Array.isArray(m.acts) ? m.acts : []).filter((a) => a && typeof a.name === 'string' && validAct(a.k, a.v)).map((a) => ({ act: true, id: 0, name: a.name, account: a.account || null, k: a.k, v: a.v ?? null, at: a.at, old: true }));
      chat.length = 0; canAct = true;
      for (const e of [...lines, ...acts].sort((a, b) => a.at - b.at)) { e.mine = isMine(e); if (e.mine || !muted.has(e.name)) keep(e); }
      emit();
    } else if (m.t === 'chat') {
      if (muted.has(m.name) && m.id !== id) return;
      keep({ id: m.id, name: m.name, account: m.account || null, text: m.text, at: m.at, mine: m.id === id });
      emit();
    } else if (m.t === 'act') {
      if (!validAct(m.k, m.v) || (muted.has(m.name) && m.id !== id)) return;
      keep({ act: true, id: m.id, name: m.name, account: m.account || null, k: m.k, v: m.v ?? null, at: m.at, mine: m.id === id });
      emit();
    } else if (m.t === 'sys') {
      sys = { key: m.key, s: m.s || 0, reason: m.reason || null, at: t };
      // an idle kick (the player was away from the town for a minute) is not final: update() joins again on her return
      if (m.key === 'full' || m.key === 'kicked') { status = 'offline'; idleKicked = m.key === 'kicked' && m.reason === 'idle'; stopped = m.key === 'kicked' && !idleKicked; }
      emit();
    }
  }

  open();
  return {
    get status() { return status; }, get room() { return room; }, get max() { return max; }, get id() { return id; }, get sys() { return sys; },
    /** How many players share the room, us included (0 when not online). */
    get count() { return status === 'online' ? players.size + 1 : 0; },
    players, chat,
    /** What this server can do (presence v2: 'area', 'fx', 'mobs'); empty for an older one. */
    has: (cap) => caps.has(cap),
    /** The shared spiders, drawn 150 ms behind: [{id, x, z, h, hp, state}] (town-local metres). */
    mobs() { const t = now() - DELAY_MS; return [...mobs.values()].filter((e) => e.buf.length).map((e) => ({ id: e.id, hp: e.hp, state: e.st, ...sampleMob(e.buf, t) })); },
    /** Listens for 'bite' {mob, dmg} (a spider reached us), 'death' {mob, mine} (mine: we may loot it), 'fx' {id, k, p, h}. */
    on(kind, fn) { if (ears[kind]) ears[kind].push(fn); return () => { const i = ears[kind].indexOf(fn); if (i >= 0) ears[kind].splice(i, 1); }; },
    /** Our blow or cast for the others to see (a v2 server only). */
    fx(k) { if (status === 'online' && caps.has('fx') && Object.values(COMBAT).some((c) => c.fx === k)) send({ t: 'fx', k }); },
    /** Our blow landed on a shared spider: the server checks it and keeps the health. */
    hit(mob, k, n) { if (status === 'online' && caps.has('mobs') && typeof mob === 'string' && Number.isFinite(n) && n > 0) { send({ t: 'hit', mob, k, n: Math.round(n * 10) / 10 }); return true; } return false; },
    /** Per frame: sends our state at most SEND_HZ when it changed. */
    update(state) {
      if (idleKicked && status === 'offline' && !ws) { idleKicked = false; retries = 0; open(); return; }
      if (status !== 'online') return;
      pump();
      const t = now();
      if (t - lastSendAt < 1000 / SEND_HZ) return;
      const s = { p: state.p.map((v) => Math.round(v * 100) / 100), h: Math.round(state.h * 1000) / 1000, a: state.a };
      if (!changed(lastSent, s) && t - lastSendAt < 5000) return; // a keep-alive every 5 s also beats the idle timeout
      send({ t: 's', ...s }); lastSent = s; lastSendAt = t;
    },
    /** Where every other player is now (render time = now - DELAY_MS). */
    positions() { const t = now() - DELAY_MS; return [...players.values()].map((pl) => ({ id: pl.id, name: pl.name, skin: pl.skin, account: pl.account, lv: pl.lv, ...sample(pl.buf, t) })); },
    /**
     * Tells the room a notable action of ours (k of ACTS, v its one value): the feed line "ann opened a chest". Sent at
     * most one per ACT_EVERY_MS (the server's limit), a few wait in a short queue; anything not whitelisted is dropped.
     */
    act(k, v = null) {
      if (status !== 'online' || !canAct || !validAct(k, v) || !serverTakes(k) || actQ.length >= ACT_QUEUE) return false;
      actQ.push(v == null ? { k } : { k, v }); pump(); return true;
    },
    say(text) { const s = String(text || '').trim().slice(0, 140); if (s && status === 'online') send({ t: 'chat', text: s }); },
    mute(nameOf) { muted.add(nameOf); saveMuted(); for (let i = chat.length - 1; i >= 0; i--) if (chat[i].name === nameOf && !chat[i].mine) chat.splice(i, 1); emit(); },
    unmute(nameOf) { muted.delete(nameOf); saveMuted(); emit(); },
    isMuted: (nameOf) => muted.has(nameOf),
    report(pid) { send({ t: 'report', id: pid }); },
    /** The area we are in ('town' | 'isles'): a change rejoins in a room of that area (presence v2; an older server keeps one room). */
    get area() { return area; },
    setArea(a) { if (a === area || !['town', 'isles'].includes(a)) return; area = a; players.clear(); mobs.clear(); if (ws) { status = 'connecting'; retries = 0; try { ws.close(); } catch { /* closed */ } emit(); } },
    stop() { stopped = true; idleKicked = false; actQ.length = 0; status = 'offline'; clearTimeout(timer); if (ws) try { ws.close(); } catch { /* closed */ } ws = null; players.clear(); emit(); },
  };
}

/**
 * ?bots=N without a presence service: N AI walkers run in this browser (no network). Same interface as
 * createPresence; status 'demo': each carries an AI badge, the chip counts them as AI and the chat line stays disabled.
 */
export function createDemoPresence({ count = 3, now = () => performance.now(), onChange = () => {} } = {}) {
  const n = Math.max(1, Math.min(14, count | 0));
  const players = new Map(Array.from({ length: n }, (_, k) => [k + 1, { id: k + 1, name: BOT_NAMES[k], skin: k % 2 ? 'elise' : 'iris', ai: true, buf: [] }]));
  const t0 = now();
  queueMicrotask(() => { try { onChange(); } catch { /* UI */ } });
  return {
    status: 'demo', room: 0, max: 15, id: 0, sys: null, players, chat: [],
    get count() { return n + 1; },
    update() {},
    positions() { const t = (now() - t0) / 1000; return [...players.values()].map((pl, k) => { const s = botAt(k, t); const s2 = botAt(k, t - 0.1); return { id: pl.id, name: pl.name, skin: pl.skin, ai: true, p: s.p, h: s.h, a: s.a, speed: Math.hypot(s.p[0] - s2.p[0], s.p[2] - s2.p[2]) / 0.1 }; }); },
    say() {}, act: () => false, mute() {}, unmute() {}, isMuted: () => false, report() {}, stop() {},
    has: () => false, mobs: () => [], on: () => () => {}, fx() {}, hit: () => false, area: 'town', setArea() {},
  };
}
