// The schema, as numbered steps that only ever go forward. Never edit a step that has shipped: add the next one.
// db/index.js migrate() applies what a database lacks, each step in one transaction, and records it in schema_migrations.
export const MIGRATIONS = Object.freeze([
  Object.freeze({ version: 1, name: 'initial', sql: `
    -- one row per player account (the Day-1 NEAR account every sign-in method maps to)
    CREATE TABLE accounts (account_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL) WITHOUT ROWID;
    -- linked sign-in methods: wallets (near:, evm:, sol:), passkeys (passkey:), emails (email:<sha256>, never the address);
    -- data is the whole record as the relayer uses it (guest_key, history, an email's encrypted key box, ...)
    CREATE TABLE identities (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id), kind TEXT NOT NULL,
      address TEXT, linked_at TEXT, data TEXT NOT NULL);
    CREATE INDEX identities_account ON identities(account_id);
    -- one-time email codes: salted hashes only
    CREATE TABLE email_codes (email_id TEXT PRIMARY KEY, code_hash BLOB NOT NULL, purpose TEXT NOT NULL, bind TEXT, expires_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
    CREATE TABLE email_sends (email_id TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX email_sends_id ON email_sends(email_id, at);
    -- the rooms' memory: chat lines and the action feed ("ann opened a chest")
    CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, room INTEGER NOT NULL, name TEXT NOT NULL, account TEXT, text TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX chat_room ON chat_messages(room, id);
    CREATE TABLE room_actions (id INTEGER PRIMARY KEY, room INTEGER NOT NULL, name TEXT NOT NULL, account TEXT, kind TEXT NOT NULL, value TEXT, at INTEGER NOT NULL);
    CREATE INDEX actions_room ON room_actions(room, id);
    -- server-held progress: the hash-chained expedition log of each guest, and the town credits made from it
    CREATE TABLE expedition_events (account_id TEXT NOT NULL, seq INTEGER NOT NULL, hash TEXT NOT NULL, body TEXT NOT NULL, stored_at INTEGER NOT NULL, PRIMARY KEY (account_id, seq)) WITHOUT ROWID;
    CREATE TABLE town_credits (account_id TEXT PRIMARY KEY, credited TEXT NOT NULL, day INTEGER NOT NULL, today TEXT NOT NULL, body TEXT NOT NULL, updated_at INTEGER NOT NULL) WITHOUT ROWID;
    -- append-only journals by stream: town-log (every trade), clan-actions, clan-decisions, town-gate, town-act
    CREATE TABLE journal (id INTEGER PRIMARY KEY, stream TEXT NOT NULL, at INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE INDEX journal_stream ON journal(stream, at);
    -- append-only receipts by kind: pass (claims), wheel (skin claims), resource (the resource desk's settlements)
    CREATE TABLE receipts (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref TEXT, account TEXT, at INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE INDEX receipts_kind ON receipts(kind, ref);
    -- small state documents: town-state (the trader daemon), p2p-book (the player market)
    CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL) WITHOUT ROWID;
    -- what the one-shot import from the JSON files has taken, so a second run adds nothing twice
    CREATE TABLE import_log (source TEXT PRIMARY KEY, rows INTEGER NOT NULL, imported_at INTEGER NOT NULL) WITHOUT ROWID;
  ` }),
]);
