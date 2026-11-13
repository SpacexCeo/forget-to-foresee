// The room memory of the presence service: the last chat lines and the last player actions of every room, kept in
// memory and in one small JSON file (owner 13.11: "the last few chat messages should stay on the server, everyone
// sees them, and they are there after re-entering"). A room's memory outlives its players: the room number is the
// key, so whoever enters room 1 next reads what was said there. The file is written atomically (temp file + rename)
// a moment after a change; a missing, oversized or broken file only means an empty memory.
import nodeFs from 'node:fs';
import nodePath from 'node:path';

export const HISTORY = Object.freeze({ cap: 30, maxRooms: 20, maxBytes: 256 * 1024, maxAgeMs: 7 * 24 * 3600 * 1000, saveDelayMs: 2000, file: 'chat-history.json' });
/** The action kinds a client may report, each with the check of its one optional value. No kind carries free text. */
export const ACT_KINDS = Object.freeze({
  level: (v) => Number.isInteger(v) && v >= 2 && v <= 99,
  quest: (v) => v == null,
  chest: (v) => ['common', 'rare', 'legendary'].includes(v),
  boss: (v) => ['crownrift', 'shoal'].includes(v),
  trade: (v) => v == null,
});

const NAME_RE = /^[a-z0-9]{1,16}$/, ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;
const who = (e) => e && typeof e === 'object' && typeof e.name === 'string' && NAME_RE.test(e.name) && Number.isFinite(e.at) && (e.account == null || (typeof e.account === 'string' && ACCOUNT_RE.test(e.account)));
const base = (e) => ({ name: e.name, at: e.at, ...(e.account ? { account: e.account } : {}) });
/** A stored chat line or action as it is kept and sent, or null when it is not one (the file is never trusted). */
export const cleanChat = (e) => (who(e) && typeof e.text === 'string' && e.text.length >= 1 && e.text.length <= 140 && !/[\u0000-\u001f\u007f]/.test(e.text) ? { ...base(e), text: e.text } : null);
export const cleanAct = (e) => (who(e) && typeof e.k === 'string' && Object.hasOwn(ACT_KINDS, e.k) && ACT_KINDS[e.k](e.v ?? null) ? { ...base(e), k: e.k, ...(e.v != null ? { v: e.v } : {}) } : null);

/**
 * @param {{dir?: string|null, now?: () => number, fs?: object, limits?: object, log?: Function, timers?: boolean}} o
 *   dir: the data folder (null keeps the memory in RAM only); timers: false makes save() the caller's job (tests)
 */
export function createHistory({ dir = null, now = () => Date.now(), fs = nodeFs, limits = HISTORY, log = () => {}, timers = true } = {}) {
  const file = dir ? nodePath.join(dir, limits.file) : null;
  const rooms = new Map(); // room number -> {chat: [], acts: []}, oldest first
  let dirty = false, timer = null;

  const fresh = (list, t) => list.filter((e) => t - e.at < limits.maxAgeMs).slice(-limits.cap);
  const roomOk = (n) => Number.isInteger(n) && n >= 1 && n <= limits.maxRooms;

  function load() {
    if (!file) return;
    try {
      if (fs.statSync(file).size > limits.maxBytes) { log('history_too_large'); return; }
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!j || j.v !== 1 || !j.rooms || typeof j.rooms !== 'object') return;
      const t = now();
      for (const [k, r] of Object.entries(j.rooms)) {
        const n = Number(k); if (!roomOk(n) || !r || typeof r !== 'object') continue;
        const chat = fresh((Array.isArray(r.chat) ? r.chat : []).map(cleanChat).filter(Boolean), t), acts = fresh((Array.isArray(r.acts) ? r.acts : []).map(cleanAct).filter(Boolean), t);
        if (chat.length || acts.length) rooms.set(n, { chat, acts });
      }
    } catch (e) { if (e && e.code !== 'ENOENT') log('history_unreadable'); }
  }

  /** The file's text within the size cap: the oldest half of every room goes until it fits. */
  function serialize() {
    const snap = new Map([...rooms].map(([n, r]) => [n, { chat: r.chat.slice(), acts: r.acts.slice() }]));
    for (;;) {
      const text = JSON.stringify({ v: 1, savedAt: now(), rooms: Object.fromEntries(snap) });
      if (Buffer.byteLength(text) <= limits.maxBytes) return text;
      let cut = false;
      for (const r of snap.values()) for (const k of ['chat', 'acts']) if (r[k].length) { r[k] = r[k].slice(Math.ceil(r[k].length / 2)); cut = true; }
      if (!cut) return JSON.stringify({ v: 1, savedAt: now(), rooms: {} });
    }
  }

  /** Writes the file now (temp file, then rename over the old one). Returns whether it was written. */
  function save() {
    clearTimeout(timer); timer = null;
    if (!file || !dirty) return false;
    dirty = false;
    const tmp = file + '.tmp';
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(tmp, serialize(), { mode: 0o600 }); fs.renameSync(tmp, file); return true; }
    catch { log('history_write_failed'); try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to clean */ } return false; }
  }

  function add(room, kind, entry) {
    if (!roomOk(room)) return null;
    const e = kind === 'chat' ? cleanChat(entry) : cleanAct(entry);
    if (!e) return null;
    let r = rooms.get(room); if (!r) rooms.set(room, r = { chat: [], acts: [] });
    r[kind].push(e); if (r[kind].length > limits.cap) r[kind].splice(0, r[kind].length - limits.cap);
    dirty = true;
    if (file && timers && !timer) { timer = setTimeout(save, limits.saveDelayMs); if (timer.unref) timer.unref(); }
    return e;
  }

  load();
  return {
    addChat: (room, entry) => add(room, 'chat', entry),
    addAct: (room, entry) => add(room, 'acts', entry),
    /** What a newcomer of the room gets: {chat, acts}, oldest first, at most `cap` each, nothing older than maxAgeMs. */
    get(room) { const r = rooms.get(room), t = now(); return r ? { chat: fresh(r.chat, t), acts: fresh(r.acts, t) } : { chat: [], acts: [] }; },
    save, file,
    stats: () => ({ historyRooms: rooms.size, historyLines: [...rooms.values()].reduce((n, r) => n + r.chat.length + r.acts.length, 0), historyFile: !!file }),
  };
}
