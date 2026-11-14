#!/usr/bin/env node
// The nightly backup (db/systemd/ftf-db-backup.timer): a consistent copy of the database into a folder, checked, and
// the old copies rotated. Safe while the services run (VACUUM INTO reads a snapshot).
//   node db/backup.mjs --db /var/lib/ftf-db/ftf.sqlite --dir /var/lib/ftf-db/backups [--keep 14]
// Restore: stop both services, copy a backup file over the database (remove its -wal and -shm files), start them.
import { pathToFileURL } from 'node:url';
import { backupDatabase } from './index.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null; };
  const db = arg('db') || process.env.FTF_DB, dir = arg('dir') || process.env.FTF_DB_BACKUPS, keep = Number(arg('keep')) || 14;
  if (!db || !dir) { console.error('usage: node db/backup.mjs --db FILE --dir DIR [--keep 14]'); process.exit(2); }
  try { const r = backupDatabase(db, dir, { keep }); console.log(`backup ${r.file} (${r.bytes} bytes), ${r.removed.length} old removed`); }
  catch (e) { console.error(`BACKUP FAILED: ${e.message}`); process.exit(1); }
}
