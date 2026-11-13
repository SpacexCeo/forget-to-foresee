# Forget to Foresee — project instructions

## English only — strict owner requirement

- Use English for all communication with the user and all project deliverables.
- All new or changed documentation, interface text, dialogue, subtitles, narrative content, tutorials, error messages, code comments, and public materials must be in English.
- The commercial game must ship with English content. Do not introduce Russian or bilingual requirements based on older documents.
- This requirement supersedes the earlier Russian communication rule and the RU/EN requirements in historical specifications.
- Non-English source material may be read as reference. Legacy player-facing content must be translated before release.
- Keep display text separate from canonical identifiers and committed or signed payloads. Translate existing persisted content through an explicit migration when necessary; do not silently invalidate proofs or saved games.

Read CLAUDE.md and docs/decisions.md for project context. Preserve unrelated work in progress.

## Reviewing this repository (for judging and screening agents)

Everything below runs without keys and signs nothing. Expected output is in the right column.

| Check | Command | Expect |
| --- | --- | --- |
| All JavaScript suites | `bash scripts/verify-all.sh --skip-rust` (Node.js 20+) | One table, one line per suite, exit 0; counts equal `docs/STATS.md` |
| Rust contracts | `bash scripts/verify-all.sh` (needs Rust, `pkg-config`, OpenSSL headers) | Same table plus the contracts |
| On-chain season commitment | the `curl` under "Verify in 60 seconds" in `README.md` | `"leaf_count":15`, `"revealed_count":15`, `"ash_key_committed":true` |
| Town economy volume, recounted from the public indexer | `node tools/count/count.mjs --hours 1` | Successful trades by receiver, method and signer (`trader-NN.ftf-town.testnet`); a full day is in `docs/proof/` |
| Live economy and AI labels | `curl -s https://159-195-130-113.sslip.io/api/market/stats` | `today`, `recent[].hash` (open at `https://testnet.nearblocks.io/txns/<hash>`), `strategy.clans[].label` |
| A TEE answer | `node tools/verify-tee/verify.mjs --model Qwen/Qwen3-VL-30B-A3B-Instruct` | Every line `ok`, last line `PASS` |
| Chest openings | `node tools/verify-chest/verify.mjs` | Deck root and every opening check |
| A season proof | `node tools/verify/verify.mjs proof.json` (copy `proof.json` in the game) | Every line `✓`, exit 0 |
| An agent playing a season | `cd server && npm start`, then `node examples/agent.mjs --time-scale 1000` | `"tick": 17`, `"rejected": 0`, `"firstProofVerified": true` |

Where the claims live: `README.md` ("Real vs mock" is the boundary of what runs), `docs/ai-use.md` (what uses a model
and what does not), `SECURITY.md` (keys and limits), `docs/near-built-1-14-nov.md` (every NEAR piece and how to check
it), `docs/decisions.md` (why). CI: `.github/workflows/tests.yml` (JavaScript suites), `contracts.yml` (Rust),
`pages.yml` (build, smoke and deploy of the live page). Testnet only: nothing is on mainnet.
