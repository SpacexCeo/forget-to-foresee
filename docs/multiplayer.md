# The shared town: multiplayer and chat

Players in the sky town see each other and can chat: rooms of at most **15 players**; when a room is full the next one
opens. Nothing else is shared — seasons, hires and chests stay per player. Without the presence service the town is
single-player, exactly as before; the judge link (`?demo=judge`) never connects; `?mp=0` turns it off.

## Pieces

- `presence/` — a small Node service, no dependencies (its own RFC 6455 WebSocket code), no database. `GET /health`
  gives counts only. Protocol in `presence/lib/hub.js`.
- `game/src/net/presence.js` — the connection, our state at most 10 Hz (only when it changed, a keep-alive every 5 s),
  others interpolated 150 ms behind with at most 250 ms of extrapolation, reconnects with backoff, then offline.
- `game/src/play/remote-players.js` — others as Iris or Elise (the light `_m` model), idle / walk / run blended by
  speed, a nickname tag; only the nearest 8 (phones) or 15 (desktop) within 70 m are drawn, tags within 25 m.
- `game/src/ui/chat-panel.js` — the "N players here · Room k" chip bottom-left; it opens the chat (Enter opens it and
  focuses the line, Enter sends, Escape leaves). A name opens Mute (kept in this browser) and Report.
- **The room remembers** (`presence/lib/history.js`): the last 30 chat lines and the last 30 player actions of every
  room, in memory and in one small file `chat-history.json` in `PRESENCE_DATA_DIR` (written atomically a moment after a
  change and on shutdown; at most 256 KB; lines older than 7 days are dropped; without the variable the memory lives
  until the service restarts). A player who joins gets them right after `welcome` (`hist`), so the chat is there
  after re-entering; the panel shows each line with its time, and only live lines pop up as bubbles over heads.
- **The action feed** (`game/src/play/feats.js`): a level gained, a quest handed in, a chest opened, a boss beaten
  (the Crownrift, the Hollow Tide) and a market purchase are told to the room as `{t:'act', k, v?}`; the panel lists
  them as grey lines ("ann opened a rare chest"), and the lines of friends (the list of `play/friends.js`) are marked
  with a star. The sentence is always the reader's own locale text; only the kind and one checked value travel.
- Names: the Day 1 nickname (a-z, 0-9, at most 12), else `guest<n>`; a duplicate gets a number.

## What the server enforces

| Layer | Rule |
|---|---|
| Connection | Origin must be `https://spacexceo.github.io` (or `ALLOWED_ORIGIN`) or localhost; at most 3 open sockets and 10 new connections per minute per IP; at most 300 sockets (20 rooms × 15) |
| Frames | text only, masked, no fragmentation, at most 1 KB (larger closes the socket before buffering) |
| Messages | JSON with a fixed schema (anything else disconnects); at most 30 messages per second per socket (disconnect), 20 state updates per second (extra ones ignored); `hello` first |
| Movement | positions clamped to the town box and to 8 m/s horizontally and 35 m/s vertically; one larger jump per 3 s is accepted (respawn, flight) |
| Chat | at most 140 characters, one line per 2 s; links dropped; a short list of slurs masked; 4 violations in 30 s mute for 2 min; 3 reports from different players mute for 10 min |
| Actions | only the kinds `level`, `quest`, `chest`, `boss`, `trade`, each with at most one value from a fixed set (a level 2–99, a chest tier, a boss id): no free text; one per 3 s and 10 per minute per player, the rest dropped in silence; none from a muted player; anything else disconnects like any bad message |
| History | only lines that passed the chat filter and limits are remembered; entries are re-checked when the file is read (the file is never trusted); the file never grows past 256 KB |
| Fan-out | one snapshot per room per tick with only the players that moved; nothing is relayed back larger than it came in |
| Health | heartbeat ping every 15 s (no pong closes); no message for 60 s closes; a client with more than 64 KB unsent is dropped |
| Privacy | IPs exist only in memory as salted hashes for the limits; logs carry counts and reasons, never addresses, names or chat; the history file holds what the room's chat showed anyway (nickname, the public NEAR account when the player has one, the line, the time) and nothing else |

## What this does not stop

These are application-level limits: they keep one abusive client, script or small botnet from filling rooms,
flooding the chat or making the server amplify traffic. They do **not** stop a volumetric DDoS (a flood of packets or
TLS handshakes that saturates the server's network or CPU before Node sees a message). That needs a network proxy in
front of the server, for example Cloudflare (free plan proxies WebSockets) on a real domain instead of the `sslip.io`
name — an owner option. Also not stopped: one person with many IPs joining several rooms; players saying unkind things
the filter does not know (mute and report exist for that).

## Seeing it without friends

- `?bots=3` (1–14) in the game, with no presence service configured: AI walkers run in your browser and walk the
  jury route; each name tag carries an "AI" badge and the chip reads "3 here · 3 AI", so they are never presented as
  real people; nothing is sent anywhere. (They follow a fixed path; "AI" marks them as non-human players.) With a
  service configured the real room wins and `?bots` does nothing.
- Against a local or test server, real sockets: `PER_IP=20 node presence/server.js` then
  `node presence/tools/bots.mjs --url ws://127.0.0.1:8788/presence --count 3`. The script refuses the live host and any
  host other than localhost unless named with `--test-host`.

## Status

Built and tested (`cd presence && npm test`; the game's `tests/client/presence.test.mjs`; a two-browser run against a
local server showed the other player's avatar with its tag and the chat line). Live only once the owner's executor
deploys it (`docs/handoff/relayer-tee-deploy.md`, steps 5–6) and its URL is in `game/src/net/day1-deployment.js` (`presence`).
