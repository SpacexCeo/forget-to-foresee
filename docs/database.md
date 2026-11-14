# The database

One SQLite file holds what the relayer and the presence service used to keep in JSON files. Code: `db/` (the data
layer, shared by both services), `relayer/lib/storage.js`, `presence/lib/history-db.js`.

## Why SQLite through `node:sqlite`

- No new dependency and no new server process: `node:sqlite` is built into Node (22.13+; our server runs Node 24), the
  file lives next to the services. One VPS with two small Node processes does not need a database server.
- Durable and concurrent enough: WAL mode lets the two processes read and write the same file; every write is a
  transaction; a busy timeout (5 s) replaces lock errors; foreign keys are on.
- Operable with standard tools: `sqlite3 /var/lib/ftf-db/ftf.sqlite` opens it; a backup is one file.
- If the game ever needs several relayer hosts, the stores in `db/index.js` are the only place that talks SQL: they
  can be pointed at PostgreSQL without touching the callers.

## What is in it (schema version 1, `db/migrations.js`)

| Table | Holds | Came from |
| --- | --- | --- |
| `accounts`, `identities` | One row per player account; its linked sign-in methods (wallets, passkeys, emails by hash id) with the whole record the relayer uses. A method must point at an existing account (foreign key) | `auth/identities.json` |
| `email_codes`, `email_sends` | One-time email codes as salted hashes, tries, the hourly send count. They now outlive a relayer restart | memory only |
| `chat_messages`, `room_actions` | The rooms' last chat lines and the action feed ("ann opened a chest"): the newest 30 per room, 7 days | `chat-history.json` (presence) |
| `expedition_events` | Each guest's hash-chained expedition log (server-held progress), one row per entry, `(account, seq)` unique | `expedition/<guest>.jsonl` |
| `town_credits` | Town silk credited per guest from that log | `town-credits/<guest>.json` |
| `journal` | Append-only streams: `town-log` (every trade), `clan-actions`, `clan-decisions`, `town-gate`, `town-act` | `<stream>/market-<day>.jsonl` |
| `receipts` | Append-only records by kind: `pass` claims, `wheel` skin claims, `resource` desk settlements | `pass-claims.jsonl`, `wheel-claims.jsonl`, `resource-desk.jsonl` |
| `kv` | Small state documents: `town-state` (the trader daemon), `p2p-book` (the player market), the email code salt | `town-state.json`, `p2p-book.json` |
| `schema_migrations`, `import_log` | The schema's applied steps; what the import took from each JSON file | — |

Not in the database, on purpose: the coordinator and trader **keys** (`coord-key.json`, `market-keys.json`) stay in
their own files, mode 600; the `KILL` and `STOP` switch files stay files; login nonces and rate limits stay in memory.

## How the services choose

`FTF_DB=/path/to/ftf.sqlite` switches a service to the database. Without it the JSON files are used exactly as before
(local runs, the test suites, and the rollback path). With it:

- the database is opened and migrated at start; if that fails the service prints
  `FATAL: the database (FTF_DB=…) cannot be opened … refuses to start` and exits with code 1. There is no silent
  fallback to files or memory: that would split the players' data;
- the relayer's `/api/health` shows `"storage": {"kind": "sqlite", "schema": 1}`; presence's `/health` shows
  `"historyDb": true`;
- nothing is written to the JSON files any more (they stay as they were at the move).

Schema changes: add the next numbered step to `db/migrations.js` (never edit a shipped one). Each step runs in one
transaction at start. A database with a newer schema than the code refuses to open (never deploy older code over it).

## Moving the data (once): `db/import-json.mjs`

```bash
node db/import-json.mjs --db /var/lib/ftf-db/ftf.sqlite --relayer-dir /var/lib/ftf-relayer --presence-dir /var/lib/ftf-presence --dry-run
```

It reads the JSON files (never changes or removes them), writes everything in ONE transaction and checks every count
(records found in each file against rows added); `VERIFIED` and exit 0 mean all matched, anything else is exit 1 with
nothing written. `--dry-run` does the same and rolls back. Idempotent: `import_log` remembers what each file gave; a
second run takes only lines appended since and never overwrites a row written after the move. Torn lines in a
journal are counted and skipped; a torn line in an expedition log stops the import (that log is a hash chain).

## Backups

`db/backup.mjs` makes a consistent copy while the services run (`VACUUM INTO`), runs SQLite's integrity check on the
copy, and keeps the newest 14 in `/var/lib/ftf-db/backups` (`ftf-<UTC time>.sqlite`, mode 600). The systemd timer
`db/systemd/ftf-db-backup.timer` runs it nightly at 03:17 UTC. Restore: stop both services, copy a backup over
`ftf.sqlite`, remove `ftf.sqlite-wal` and `ftf.sqlite-shm`, start the services.

## Deploy (the merge lead; about 2 minutes of downtime)

Both services run as different systemd dynamic users, so the file is shared through a group: the folder is
`root:ftf-db`, mode 2770 (setgid), and both units get the drop-in `db/systemd/ftf-db.conf`.

```bash
# 0. the code: /opt/ftf at the commit that has db/, relayer/ and presence/ of this branch
cd /opt/ftf/db && npm test && cd ../relayer && npm test && cd ../presence && npm test
# 1. backups of today's state (the JSON files stay in place as the rollback path anyway)
ts=$(date +%m%d-%H%M)
tar czf /root/ftf-data-bak-$ts.tgz -C /var/lib/private ftf-relayer ftf-presence
cp /opt/ftf/relayer/.env /root/ftf-relayer.env.bak-$ts; git -C /opt/ftf rev-parse HEAD > /root/ftf-rev.bak-$ts
# 2. the folder and the group
groupadd --system ftf-db 2>/dev/null; install -d -o root -g ftf-db -m 2770 /var/lib/ftf-db; install -d -o root -g root -m 700 /var/lib/ftf-db/backups
# 3. rehearsal while the services still run (reads only; writes nothing): must end with "DRY RUN: every count matched"
node /opt/ftf/db/import-json.mjs --db /var/lib/ftf-db/ftf.sqlite --relayer-dir /var/lib/ftf-relayer --presence-dir /var/lib/ftf-presence --dry-run
# 4. stop, move, verify
systemctl stop ftf-relayer ftf-presence
node /opt/ftf/db/import-json.mjs --db /var/lib/ftf-db/ftf.sqlite --relayer-dir /var/lib/ftf-relayer --presence-dir /var/lib/ftf-presence   # must print VERIFIED
chown root:ftf-db /var/lib/ftf-db/ftf.sqlite; chmod 660 /var/lib/ftf-db/ftf.sqlite; rm -f /var/lib/ftf-db/ftf.sqlite-wal /var/lib/ftf-db/ftf.sqlite-shm
# 5. the drop-in for both units
for u in ftf-relayer ftf-presence; do install -d /etc/systemd/system/$u.service.d; install -m 644 /opt/ftf/db/systemd/ftf-db.conf /etc/systemd/system/$u.service.d/db.conf; done
systemctl daemon-reload
# 6. can a dynamic user of that group really use the file? (must print "integrity ok"; if not, go to Rollback: nothing has started on the database yet)
systemd-run --wait --pipe --quiet -p DynamicUser=yes -p SupplementaryGroups=ftf-db -p ReadWritePaths=/var/lib/ftf-db -p UMask=0007 /usr/bin/env node /opt/ftf/db/check.mjs --db /var/lib/ftf-db/ftf.sqlite --write
# 7. start and check
systemctl start ftf-relayer ftf-presence
journalctl -u ftf-relayer -u ftf-presence -n 20 --no-pager | grep -E "storage:|FATAL"        # "storage: database /var/lib/ftf-db/ftf.sqlite (schema 1, …)" twice, no FATAL
curl -s http://127.0.0.1:8787/api/health | grep -o '"storage":{[^}]*}'                         # {"kind":"sqlite","schema":1}
curl -s http://127.0.0.1:8788/health | grep -o '"historyDb":true'
ls -la /var/lib/ftf-db                                                                         # ftf.sqlite (+ -wal, -shm), group ftf-db, rw-rw----
# 8. the nightly backup
install -m 644 /opt/ftf/db/systemd/ftf-db-backup.service /opt/ftf/db/systemd/ftf-db-backup.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now ftf-db-backup.timer && systemctl start ftf-db-backup.service && ls -la /var/lib/ftf-db/backups
```

(The relayer's port is the one in its unit; adjust the two `curl` lines if it differs.)

## Rollback

```bash
for u in ftf-relayer ftf-presence; do rm -f /etc/systemd/system/$u.service.d/db.conf; done
systemctl daemon-reload && systemctl restart ftf-relayer ftf-presence
```

Without `FTF_DB` both services read the JSON files again, exactly as they were when the services were stopped for
the move. What was written to the database after the move (new sign-in links, chat lines, journal rows) is not in
those files: it stays in `/var/lib/ftf-db/ftf.sqlite` and can be read with `sqlite3`, but nothing writes it back to
JSON. The chain stays the source of truth for silk, items and NFTs either way. To also return to the old code:
`git -C /opt/ftf checkout $(cat /root/ftf-rev.bak-<ts>) -- relayer presence` (the `db/` folder is then unused).
