#!/usr/bin/env node
// Can this user open, read and write the database? Used before a deploy, as each service's own user:
//   node db/check.mjs --db /var/lib/ftf-db/ftf.sqlite [--write]
// Prints the schema version, the row counts and the integrity check; --write also writes one kv row ("access-check").
import { pathToFileURL } from 'node:url';
import { openDatabase } from './index.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--db'), path = i > 0 ? process.argv[i + 1] : process.env.FTF_DB;
  if (!path) { console.error('usage: node db/check.mjs --db FILE [--write]'); process.exit(2); }
  try {
    const db = openDatabase(path);
    if (process.argv.includes('--write')) db.kv.set('access-check', { at: new Date().toISOString(), uid: process.getuid ? process.getuid() : null });
    const state = db.check();
    console.log(`database ${path}: schema ${db.version()}, integrity ${state}, rows ${JSON.stringify(db.counts())}`);
    db.close();
    process.exit(state === 'ok' ? 0 : 1);
  } catch (e) { console.error(`CANNOT USE THE DATABASE ${path}: ${e.message}`); process.exit(1); }
}
