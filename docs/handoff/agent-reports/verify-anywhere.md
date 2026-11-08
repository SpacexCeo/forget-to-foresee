# Task T report: verification anyone can repeat, and entropy we do not control

Branch `claude/verify-anywhere` from `c3ec7ca` (`claude/loving-curie-ihasft` with Task M merged). Worker M continuing;
the task came from the lead's message after the juror's early warning (`docs/jury/notes/onchain-game-design.md`, C4).

Files: new `tools/verify/verify.mjs`, `tools/verify/verify.py`, `game/src/net/verify-export.js`,
`game/scripts/replay-season.mjs`, `game/tests/client/verify.test.mjs`, `docs/verify.md`; changed `game/src/net/near-season.js`
(seed protocol helpers), `near.js` (`fetchNearBeacon`), `room.js` (entropy commitment, `sealSeason`, `entropyView`),
`projection.js` (`entropy`, `leafCount`, provisional values hidden), `catalog.js` (`start_season` nonce/beacon),
`game/src/play/session.js` (nonce/beacon at start), `game/tests/client/near.test.mjs` (live seasons start before they have an id),
five locale files (`wh.sign.proof.*`, `start.nonce.*`), `game/package.json`, `README.md` (one "Verify it yourself" block),
`docs/api/openapi.yaml` (season description), `docs/decisions.md` (two rows), `docs/collab-requests.md` (request 8).
Not touched: `game/src/game/engine.js`, `crypto.js`, `prototype-2d/`, `contracts/**` source.

## Done

1. **Out-of-band check.** `proofExport` / `seasonExport` (`game/src/net/verify-export.js`) produce format `ftf-proof/1`:
   season id, rules, commitment schema, full root, leaf count, commitments, the revealed leaf (index, tick, canonical
   event, salt, hash, stated meaning), the Merkle path, the contract's `check_leaf` arguments, the byte recipe in words
   and as a `sha256sum` one-liner, the NEAR state when a deployment exists, and the verifier commands. Nothing secret:
   no other leaf's salt or event, no Ash phrase, no live-season seed (tests enumerate every 32-byte value in the text).
   `buildProofExport(session, index)` / `buildSeasonExport(session)` are the two calls Task F's buttons need (request 8).
2. **Independent verifiers.** `tools/verify/verify.mjs` (Node 20+, only `node:crypto`) and `tools/verify/verify.py`
   (Python 3.8+, `hashlib`): parse the canonical event with a strict regular expression and v2 ranges, recompute the
   leaf, check the path shape against the tree depth and the index's sides, fold to the root, check the stated meaning
   against the bytes, check Ash's key when revealed, and check the seed protocol (commitment and derivation). Each
   line is `✓`/`✗`, the last line `OK` or `FAIL (n)`, exit 0/1. The shell one-liner in the export reproduces the leaf
   with `sha256sum`; `docs/verify.md` adds a `jq` loop for the path and the contract's `check_leaf` call.
3. **Entropy protocol `ftf-seed/1`** (specified in `docs/verify.md` §2, implemented in the room, not the engine): the room
   draws 32 CSPRNG bytes `R` at creation and publishes `sha256("ftf:entropy:v1|R")`; the observation hides the
   provisional root, ids and commitments until `start_season` arrives with the player's `nonce` (any text without `|`,
   default 16 random bytes from `PlaySession.start`) and an optional `beacon` (`fetchNearBeacon()`: latest final NEAR
   testnet block hash, read-only, 2.5 s budget, browser only by default); `seed = sha256("ftf:seed:v1|R|nonce|beacon")[0:32]`
   regenerates the season, `season.sealed` is emitted; `R` and the seed are revealed in the observation when the season
   ends. `game/scripts/replay-season.mjs <seed> season.json` regenerates the schedule from the seed with rules v3 and
   compares every revealed event. Fixed-seed sessions (`?demo=judge`) report `protocol: fixed-seed` and ignore the nonce;
   legacy rules report `none`. Leaf salts, Ash's salt and the owner key salt stay CSPRNG (blinding only).
4. **Judge season untouched**: season `793f6c05e89839f2`, root `03dbd458…`, bit-exact (pinned by `near.test.mjs` and
   checked again in `verify.test.mjs`); `baseline-2d-1` parity tests untouched and green.
5. **Tests**: `tests/client/verify.test.mjs`, 5 tests: export contents and secrecy; both verifiers on a real export, a
   season export, stdin, and seven tamperings (event, salt, root, path side, meaning, format, truncated root) with exit
   codes; the `sha256sum` one-liner; the replay script (pass and a wrong seed); the protocol end to end on a
   deterministic room (commitment before start, `a|b` rejected by the schema, same bytes + same nonce = same root,
   another nonce = another root, `R` hidden during play and revealed at `end`, verifier and replay pass on the final
   export, a forged `R` fails); fixed-seed, no-nonce and legacy sessions; `PlaySession.start` (default nonce, `|`
   replaced, failing beacon absent, fixed seed sends nothing); `fetchNearBeacon` on a fake RPC (fallback, dead hosts,
   timeout); the NEAR watcher ignoring an unsealed season. `near.test.mjs` adjusted (3 assertions on the unsealed intro).
6. **Docs**: `docs/verify.md` (what each check proves, limits stated plainly, API surface), README block, OpenAPI season
   description, two decision rows, request 8 to Task F (buttons, optional "Your luck word" field, the `null` intro values).

## Not done / left to others

- **HUD buttons and the nonce field**: Task F (request 8). Until then the export is reachable through the API
  (`buildProofExport`) and the agent API's proof endpoint; the README says "once the HUD button lands".
- **NEAR registration before trial 1**: still pending the owner-permitted deployment (Task M report, `docs/near.md`); the
  game shows the NEAR badge only when the contract holds the root. The export's `near` block is `null` until then.
- **Beacon verification**: the beacon is recorded as the client fetched it; `docs/verify.md` says how to confirm the
  block hash on testnet. The protocol is sound without it.
- **The local demo's trust boundary** is stated, not removed: room and player run in one browser; the protocol's order
  is visible in events and exports, and the server mode or the NEAR registration move the order onto something the
  browser does not control.
- The `season.created` event now carries `merkleRoot: null` for unsealed live seasons; nothing in the repo read it
  (grep), the OpenAPI prose was updated. Agents that start a season should send a `nonce` (optional) and read the root
  after `start_season`.

## How it was checked

- `cd game && npm test` → 368/368 (363 before + 5); `npm run build` green; `cd server && npm test` → 28/28 (the server
  runs the same room code: `start_season` without a nonce still works, sessions seal with an empty nonce).
- Verifiers run against real exports in the tests through `child_process` (Node, Python with `-I`, `sh -c` for the
  one-liner, the replay script), so the documented commands are the tested commands.
- Manual: a judge-season export checked by both verifiers and the `sha256sum` line (outputs in `docs/verify.md`); a live
  season observed before and after `start_season` (commitment only → sealed root; judge season unchanged).
- Self-review against the quality bar: no visual change in this task (the buttons are F's), every behaviour change has a
  test, all five locales have the new strings (parity test green), nothing in the export is truncated.
- Could not verify: the beacon fetch against the real RPC inside the test suite (by design, tests never touch the
  network); it was exercised by hand earlier in the session (`block` with `finality: final` answers on both hosts).
