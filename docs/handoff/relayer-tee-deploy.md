# Task for the owner's local executor: redeploy the relayer with TEE agents

Goal: the relayer on the owner's server gains `POST /api/agent/say` and `POST /api/agent/decide` (NEAR AI Cloud
confidential inference, `docs/tee.md`). The free mint (`/api/create-guest`) must keep working exactly as before.

You need: SSH to the owner's server, the NEAR AI Cloud API key (the owner has it; it starts with `sk-`). The NEAR AI
Cloud account must have credits / a spending limit set, or every chat call answers `402 no_limit_configured`.
Never paste the key into a chat, a commit, a log or a screenshot.

## 1. Find how the relayer runs now

```bash
ssh <owner server>
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' | grep -i relayer    # Docker?
systemctl list-units --type=service | grep -i -E 'relayer|ftf'           # systemd?
pm2 ls 2>/dev/null | grep -i relayer                                      # pm2?
```

Note the checkout path (e.g. `~/forget-to-foresee`) and which of the three it is.

## 2. Update the code

```bash
cd <checkout>
git fetch origin && git checkout main && git pull --ff-only    # after the lead has merged claude/tee-agents
cd relayer && node --version                                   # must be 20 or newer
npm test                                                       # all pass, no network needed
```

## 3. Put the key in `relayer/.env`

`relayer/.env` is ignored by git; `server.js` reads it at start (variables already in the environment win).

```bash
cd <checkout>/relayer
touch .env && chmod 600 .env
nano .env        # add the line below; keep the existing FTF_GUEST_KEY / ALLOWED_ORIGIN lines if they live here
```

```
NEARAI_API_KEY=sk-...
```

Optional lines: `NEARAI_MODEL=Qwen/Qwen3-VL-30B-A3B-Instruct` (the default), `FTF_TEE_DAILY_CAP=1500`.

## 4. Restart

- **plain Node / systemd:** `sudo systemctl restart <service>` (or stop the old `node server.js` and start it again
  the same way it was started, with `TRUST_PROXY=1` behind the reverse proxy).
- **pm2:** `pm2 restart <name> --update-env`.
- **Docker:** the image does not contain `.env`; rebuild and pass it:
  ```bash
  docker build -t ftf-relayer . && docker rm -f <old name>
  docker run -d --name <old name> --restart unless-stopped --env-file .env -e TRUST_PROXY=1 -p 8787:8787 ftf-relayer
  ```
  (keep any `-e FTF_GUEST_KEY` / `-e ALLOWED_ORIGIN` the old container had — `docker inspect <old name>` shows them;
  copy them into `.env` before removing it).

The start line prints `relayer on http://… (key set, TEE set)`.

## 5. Health checks (from any machine)

```bash
H=https://<relayer host>
curl -s $H/api/health                      # "configured": true (mint key) and "tee": {"configured": true, "model": "..."}
curl -s -X POST $H/api/agent/say -H 'Content-Type: application/json' \
  -d '{"npc":"baker","question":"Good morning!","facts":"The bakery sells bread for silk.","lang":"en"}' > answer.json
node -e 'const j=require("./answer.json");console.log(j.text, "| verified:", j.tee && j.tee.verified)'
node tools/verify-tee/verify.mjs answer.json   # from the repo root: every line ok, then PASS
curl -s -o /dev/null -w '%{http_code}\n' -X POST $H/api/create-guest -H 'Content-Type: application/json' -d '{"public_key":"nope"}'   # 400 (mint route alive)
```

Report back to the lead: the health JSON (it never contains the key), the `text` and `verified` line, and the
verifier's last line. If `say` returns `502` with `upstream_status: 402`, the NEAR AI Cloud account needs credits; if
`503 tee_not_configured`, the key did not reach the process (check step 3/4).

## Rollback

`git checkout <previous commit>` in the checkout and restart; or remove the `NEARAI_API_KEY` line and restart — the
agent routes then answer `503` and the game keeps its scripted lines.
