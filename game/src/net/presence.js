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
export function createPresence({ url = presenceUrl(), name = '', skin = 'iris', account = null, lv = null, storage = null, WebSocketImpl = globalThis.WebSocket, now = () => performance.now(), onChange = () => {}, maxRetries = 4 } = {}) {
  const players = new Map(); // id -> {id, name, skin, buf: [{at,p,h,a}]}
  // chat lines {id, name, account, text, at, mine, old?} and actions {act: true, id, name, account, k, v, at, mine, old?}, oldest
  // first; `at` is the server's clock (epoch ms); `old` marks what the room remembered from before we joined
  const chat = [];
  // canAct: this server knows 'act' (it sent 'hist'); an older one would disconnect us for an unknown message
  let myName = '', lastActAt = -Infinity, idleKicked = false, canAct = false, kinds = null; const actQ = [];
  // kinds: the acts the server named in its welcome; a server that names none takes only the first five (it kicks for any other)
  const serverTakes = (k) => (kinds ? kinds.includes(k) : FIRST_ACTS.includes(k));
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
    ws.onopen = () => { retries = 0; send({ t: 'hello', v: 1, name, skin, ...(account ? { account } : {}), ...(Number.isInteger(lv) ? { lv } : {}) }); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
    ws.onclose = () => { ws = null; players.clear(); if (status !== 'offline') retry(); };
    ws.onerror = () => {};
  }
  function retry() {
    ws = null;
    if (stopped || ++retries > maxRetries) { status = 'offline'; emit(); return; }
    status = 'connecting'; emit();
    timer = setTimeout(open, Math.min(30000, 1000 * 2 ** retries));
  }
  function handle(m) {
    const t = now();
    if (m.t === 'welcome') { id = m.id; room = m.room; max = m.max; myName = typeof m.name === 'string' ? m.name : name; canAct = false; kinds = Array.isArray(m.kinds) ? m.kinds.filter((k) => typeof k === 'string') : null; actQ.length = 0; players.clear(); for (const p of m.players) add(p); status = 'online'; lastSent = null; emit(); }
    else if (m.t === 'join') { add(m.player); emit(); }
    else if (m.t === 'leave') { players.delete(m.id); emit(); }
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
  };
}
