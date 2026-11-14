// The room memory in the project's database (owner 14.11; ../../db/index.js) instead of chat-history.json: the same
// interface as lib/history.js createHistory, so the hub does not know the difference. Every accepted line is one row
// (chat_messages / room_actions), written at once; a newcomer's history is one query. Entries are cleaned on the way
// in AND on the way out (the database is trusted no more than the file was).
import { HISTORY, cleanChat, cleanAct } from './history.js';
import { openDatabase } from '../../db/index.js';

/**
 * @param {{db?: object, path?: string, now?: () => number, limits?: object, log?: Function}} o db: an open database
 *   (tests), else `path` is opened here; a path that cannot be opened throws (server.js then refuses to start)
 */
export function createDbHistory({ db = null, path = null, now = () => Date.now(), limits = HISTORY, log = () => {} } = {}) {
  const d = db || openDatabase(path, { now });
  const roomOk = (n) => Number.isInteger(n) && n >= 1 && n <= limits.maxRooms;
  let lastPrune = 0;
  function add(room, kind, entry) {
    if (!roomOk(room)) return null;
    const e = kind === 'chat' ? cleanChat(entry) : cleanAct(entry);
    if (!e) return null;
    try {
      d.history.add(room, kind, e, limits.cap);
      const t = now(); if (t - lastPrune > 3600_000) { lastPrune = t; d.history.prune(t - limits.maxAgeMs); } // old lines leave once an hour
    } catch (err) { log('history_write_failed'); void err; } // the line is still relayed live; only the memory of it is lost
    return e;
  }
  return {
    addChat: (room, entry) => add(room, 'chat', entry),
    addAct: (room, entry) => add(room, 'acts', entry),
    /** What a newcomer of the room gets: {chat, acts}, oldest first, at most `cap` each, nothing older than maxAgeMs. */
    get(room) {
      if (!roomOk(room)) return { chat: [], acts: [] };
      try { const h = d.history.get(room, now() - limits.maxAgeMs, limits.cap); return { chat: h.chat.map(cleanChat).filter(Boolean), acts: h.acts.map(cleanAct).filter(Boolean) }; }
      catch { log('history_unreadable'); return { chat: [], acts: [] }; }
    },
    /** Rows are written as they come: nothing waits to be saved. */
    save: () => false,
    file: d.path,
    stats: () => { try { const s = d.history.stats(); return { historyRooms: s.rooms, historyLines: s.lines, historyFile: true, historyDb: true }; } catch { return { historyRooms: 0, historyLines: 0, historyFile: true, historyDb: true }; } },
    close: () => { if (!db) d.close(); },
  };
}
