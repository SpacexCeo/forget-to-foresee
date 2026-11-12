# Runbook for the owner's local executor: relayer (TEE agents + loot chests) and the shared town

One pass on the owner's server (`159-195-130-113.sslip.io`). After it:

- the relayer answers TEE agent lines (`/api/agent/say`, `/api/agent/decide`, `docs/tee.md`) and opens loot chests
  (`/api/chest/open`, `docs/chests.md`); the free mint (`/api/create-guest`) keeps working exactly as before;
- the presence service runs the shared town and chat at `wss://159-195-130-113.sslip.io/presence`
  (`docs/multiplayer.md`).

You need SSH to the server and the NEAR AI Cloud API key (the owner has it; it starts with `sk-`). The NEAR AI Cloud
account must have credits / a spending limit, or every agent call answers `402 no_limit_configured`. **Never paste a
key into a chat, a commit, a log or a screenshot.** Every block below is copy-paste; replace `<…>` first.

## 1. Find how the relayer runs now

```bash
ssh <owner server>
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' | grep -i -E 'relayer|ftf'   # Docker?
systemctl list-units --type=service | grep -i -E 'relayer|ftf'                    # systemd?
pm2 ls 2>/dev/null | grep -i relayer                                               # pm2?
ls /etc/caddy/Caddyfile 2>/dev/null; ls /etc/nginx/sites-enabled 2>/dev/null       # which HTTPS proxy
```

Write down: the checkout path (e.g. `~/forget-to-foresee`), how the relayer runs, and the proxy (Caddy or nginx).

## 2. Update the code and run the tests

```bash
cd <checkout>
git fetch origin && git checkout main && git pull --ff-only
node --version                                   # 20 or newer
(cd relayer && npm test) && (cd presence && npm test)   # all pass, no network needed
```

## 3. Keys in `relayer/.env`

`relayer/.env` is ignored by git; `server.js` reads it at start (variables already set in the environment win).

```bash
cd <checkout>/relayer
touch .env && chmod 600 .env
nano .env      # add the NEARAI_API_KEY line below; keep FTF_GUEST_KEY / ALLOWED_ORIGIN lines if they live here
```

```
NEARAI_API_KEY=sk-...
```

Optional: `NEARAI_MODEL=Qwen/Qwen3-VL-30B-A3B-Instruct` (the default), `FTF_TEE_DAILY_CAP=1500`.

Then make the chest-opener key **on this server** (its private part never leaves it):

```bash
cd <checkout>/relayer
node scripts/chest-key.mjs      # appends FTF_CHEST_KEY=… to .env (once) and prints ONLY the public key ed25519:…
```

Keep the printed public key for step 8. Then the wheel's skin minter key (the Sheriffchenko NFT, `docs/wheel-skin.md`):

```bash
node scripts/chest-key.mjs FTF_SKIN_KEY   # appends FTF_SKIN_KEY=… to .env (once) and prints ONLY its public key
```

## 4. Restart the relayer

- **systemd / plain Node:** `sudo systemctl restart <service>` (or stop the old `node server.js` and start it the same
  way, with `TRUST_PROXY=1` behind the proxy).
- **pm2:** `pm2 restart <name> --update-env`
- **Docker** (the image has no `.env`; rebuild and pass it). First copy any `-e FTF_GUEST_KEY` / `-e ALLOWED_ORIGIN`
  the old container had into `.env` (`docker inspect <old name> | grep -E 'FTF_|ALLOWED'`), then:
  ```bash
  cd <checkout>/relayer
  docker build -t ftf-relayer . && docker rm -f <old name>
  docker run -d --name <old name> --restart unless-stopped --env-file .env -e TRUST_PROXY=1 -p 127.0.0.1:8787:8787 ftf-relayer
  ```
  (keep the old `-p` mapping if the proxy reached it another way).

The start line (`docker logs <name> | tail -1`, `journalctl -u <service> -n 5`) reads
`relayer on http://… (key set, TEE set, chests set, skins set)`.

## 5. Start the presence service (port 8788, localhost only)

```bash
cd <checkout>/presence
docker build -t ftf-presence .
docker rm -f ftf-presence 2>/dev/null || true
docker run -d --name ftf-presence --restart unless-stopped -e TRUST_PROXY=1 -p 127.0.0.1:8788:8788 ftf-presence
curl -s http://127.0.0.1:8788/health        # {"ok":true,"sockets":0,...,"roomSize":15}
```

(Without Docker: `cd presence && TRUST_PROXY=1 HOST=127.0.0.1 PORT=8788 node server.js` under systemd or pm2.)

## 6. Proxy route for `/presence`

**Caddy:** in the site block of `159-195-130-113.sslip.io`, before the relayer's catch-all `reverse_proxy`, add

```
handle /presence* {
	reverse_proxy 127.0.0.1:8788
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

**nginx** (instead): a `location /presence` with `proxy_pass http://127.0.0.1:8788; proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header X-Real-IP $remote_addr;
proxy_read_timeout 120s;`, then `sudo nginx -t && sudo systemctl reload nginx`.

## 7. Health checks (from any machine, in the repository root)

```bash
H=https://159-195-130-113.sslip.io
curl -s $H/api/health            # "configured": true, "tee": {…true…}, "chests": {…true…}, "wheel": {…true…}
curl -s $H/presence/health       # {"ok":true,…,"roomSize":15}
curl -s -o /dev/null -w '%{http_code}\n' -X POST $H/api/create-guest -H 'Content-Type: application/json' -d '{"public_key":"nope"}'   # 400: mint route alive
curl -s -o /dev/null -w '%{http_code}\n' -X POST $H/api/chest/open -H 'Content-Type: application/json' -d '{}'                         # 400: chest route alive
curl -s -o /dev/null -w '%{http_code}\n' -X POST $H/api/wheel/claim -H 'Content-Type: application/json' -d '{}'                        # 400: wheel route alive
curl -s -X POST $H/api/agent/say -H 'Content-Type: application/json' \
  -d '{"npc":"baker","question":"Good morning!","facts":"The bakery sells bread for silk.","lang":"en"}' > answer.json
node -e 'const j=require("./answer.json");console.log(j.text || j.error, "| verified:", j.tee && j.tee.verified)'
node tools/verify-tee/verify.mjs answer.json    # every line ok, then PASS (only once NEAR AI credits exist)
```

If `say` returns `502` with `upstream_status: 402`, the NEAR AI Cloud account needs credits; `503
tee_not_configured` means the key did not reach the process (steps 3–4).

## 8. Report to the lead

1. the chest-opener and skin-minter **public** keys from step 3;
2. the two health JSONs from step 7 (they never contain keys);
3. the `say` line and the verifier's last line (or the 402);
4. which proxy you edited.

## 9. The lead then runs (in the lead's container, with the testnet keys)

```bash
OPENER_PUB=ed25519:<chest key from step 3> bash contracts/scripts/chest-deploy.sh    # open_chest-only key + add_opener
MINTER_PUB=ed25519:<skin key from step 3> bash contracts/scripts/skin-deploy.sh      # deploys skins.<signer> (cap 100) + mint_skin-only key
node contracts/scripts/day1-write.mjs presence=wss://159-195-130-113.sslip.io/presence # the game connects to the shared town
NEARAI_API_KEY=proxy-injected node tools/chest/seed.mjs --season s1                  # once NEAR AI credits exist; prints the fix_seed call
# send the printed `near contract call-function … fix_seed …` line, then:
node tools/verify-chest/verify.mjs                                                    # PASS (0 openings yet)
```

and commits `game/src/net/day1-deployment.js`.

## Rollback

- Relayer: `git checkout <previous commit>` in the checkout and restart; or remove the `NEARAI_API_KEY` /
  `FTF_CHEST_KEY` / `FTF_SKIN_KEY` line and restart — those routes then answer `503` and the game keeps its scripted lines and sealed
  chests.
- Presence: `docker rm -f ftf-presence` and remove the `/presence` route; the game falls back to single-player.
