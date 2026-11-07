# Agent API

An autonomous agent can play a full Forget to Foresee season over HTTP, with no browser. The
specification is [openapi.yaml](openapi.yaml) (also served at `GET /v1/openapi.yaml`), and the
machine-readable action catalog is `GET /v1/actions`.

## Run it

```bash
cd game && npm install          # once: the server reuses the game's engine and collision modules
cd ../server
npm start                       # http://127.0.0.1:8787/v1
node examples/agent.mjs --time-scale 1000   # in a second terminal: plays one season and prints a summary
npm test                        # 28 tests
```

**See:** the agent prints each step (`walk to scroll`, `tick 1: contribute fragment`,
`tick 1: anchor Shell 1 @ tick 2`, … `vote: accept`) and a JSON summary with the outcome, the
number of commands, zero rejections and `firstProofVerified: true`.

## How it works

- **One authority.** `game/src/net/room.js` is the only place commands are processed. Every rules
  outcome comes from the engine (`game/src/game/engine.js`) via `engine-host.js`; the room never
  re-implements a rule. `availableActions` evaluates engine guards by a dry run of the real engine
  call on a copy of the state.
- **Transport-independent.** `game/src/net/api.js` returns `{status, body}` for every operation.
  The HTTP server (`server/src/server.js`, `node:http`, no dependencies) only adds bearer auth,
  rate limits, a 16 KiB body limit, CORS for local dev and SSE. The equivalence test drives the
  same seeded season through HTTP and in-process and requires identical results.
- **Commands** are `{actionId, expectedVersion, type, args}`: `actionId` is an idempotency key
  (replays return the stored result, reuse for another command is a 409), and `expectedVersion`
  is optimistic concurrency (a stale version is a 409 and nothing is applied). Rejections (422)
  name the failing precondition or engine guard and are stored under the key too.
- **Per-viewer observations** (`projection.js`): the controller sees Iris's inventory, memories,
  offers, auctions and visions; helpers (joined with the invite code, at most 4 members) see public
  state only and may only move, inspect, talk and enter or leave Shells. Seed, salts, truth, AI
  valuations and unpublished events are never sent. Events are filtered per viewer.
- **Navigation-bound world.** `move` plans a route over the walk graph and simulates the same
  kinematic capsule the 3D client uses against the same greybox colliders; it takes simulated
  time (`timeScale` simulated seconds per real second, up to 1000). In `proximity` sessions rules
  actions need the avatar at the right place (the Scroll, a camp, an anchor zone, the glass wall).
- **Audit.** `GET .../history` lists every command (other players' commands without private
  details); `GET .../proofs/{index}` returns the Merkle proof of each revealed event against the
  season root committed before the first move.
- **No money.** Test sessions only: no accounts, wallet, signing or transfer endpoints. Minting
  the final card stays a voluntary human wallet action (`mint_final_card` is listed as planned,
  kind `chain`, and is never available to agents).

## Implemented vs planned

| Action | Status |
|---|---|
| `start_season`, `set_reading_rule`, `place_anchor`, `ask_guests`, `sacrifice_memory`, `speak_key`, `mend`, `mediate`, `accept_offer`, `decline_offer`, `bid_shard`, `contribute_fragment`, `end_tick`, `cast_vote`, `set_heir` | **implemented**, engine-backed |
| `move`, `inspect`, `talk`, `enter_shell`, `exit_shell`, `assemble_logogram` | **implemented**, world layer (never changes a rules outcome) |
| `propose_trade`, `chat`, `helper_contribute` | **planned** (501) |
| `mint_final_card` | **planned**, never exposed to agents |

## Limits and known gaps

- Sessions live in server memory (no persistence); idle sessions are dropped after 2 hours.
- Tokens are per-session test tokens, not accounts.
- The browser client does not use this API yet: wiring the 3D client through the same room
  (local transport) is the next step.
