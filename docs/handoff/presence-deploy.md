# Task for the owner's local executor: deploy the presence service (shared town + chat)

Goal: `wss://159-195-130-113.sslip.io/presence` serves the shared town (`docs/multiplayer.md`) next to the relayer on
the same server. No keys, no database. The relayer must keep working.

## 1. Code

```bash
ssh <owner server>
cd <checkout> && git fetch origin && git checkout main && git pull --ff-only
cd presence && node --version && npm test        # Node 20+, all pass
```

## 2. Run it (Docker, port 8788 on localhost only)

```bash
cd <checkout>/presence
docker build -t ftf-presence .
docker rm -f ftf-presence 2>/dev/null || true
docker run -d --name ftf-presence --restart unless-stopped -e TRUST_PROXY=1 -p 127.0.0.1:8788:8788 ftf-presence
curl -s http://127.0.0.1:8788/health             # {"ok":true,"sockets":0,...}
```

(Without Docker: `cd presence && TRUST_PROXY=1 HOST=127.0.0.1 PORT=8788 node server.js` under systemd or pm2, the
same way the relayer runs.)

## 3. Route it through the existing HTTPS proxy

If the relayer sits behind **Caddy** (the `sslip.io` certificate), add inside the site block of
`159-195-130-113.sslip.io` in the Caddyfile, before the relayer's catch-all `reverse_proxy`:

```
handle /presence* {
	reverse_proxy 127.0.0.1:8788
}
```

then `sudo systemctl reload caddy` (or `caddy reload --config /etc/caddy/Caddyfile`). Caddy passes WebSocket upgrades
and sets `X-Forwarded-For`, which the service reads because of `TRUST_PROXY=1`. If the proxy is nginx, the location
needs `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";
proxy_set_header X-Real-IP $remote_addr; proxy_read_timeout 120s;`.

## 4. Check from any machine

```bash
curl -s https://159-195-130-113.sslip.io/presence/health          # {"ok":true,...,"roomSize":15}
curl -s -o /dev/null -w '%{http_code}\n' https://159-195-130-113.sslip.io/api/health   # 200: the relayer still answers
```

and in a browser on the hosted game, two tabs: each shows "2 players here · Room 1" bottom-left once the lead has put
the URL in the build.

## 5. Report to the lead

The health JSON from step 4 and which proxy you used. The lead then sets `presence:
"wss://159-195-130-113.sslip.io/presence"` in `game/src/net/day1-deployment.js` (`node contracts/scripts/day1-write.mjs
presence=wss://159-195-130-113.sslip.io/presence`) and merges.

## Rollback

`docker rm -f ftf-presence` and remove the `handle /presence*` block; the game falls back to single-player by itself.
