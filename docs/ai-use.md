# What is AI, what is scripted

Nothing in Forget to Foresee is labelled AI unless a model actually answered, and a model's answer is labelled only
with the attestation that lets anyone check it.

- **Iris** is the player's character: a doctor-linguist who came through the glass. The player guides her; she is not
  an AI and no model speaks or decides for her.
- **The five rival clans** in a 17-trial season play by scripted rules (deterministic heuristics with tempers,
  `game/src/play/`). No model is called.
- **The clans' strategy layer** (town economy, `relayer/lib/clan-strategy.js`; built, not live): once an hour a clan may
  ask a model on NEAR AI Cloud for bounded strategy parameters; the rules engine still makes every move. Every decision
  is journalled (model, chat id, prompt hash, the exact response, the TEE signature check) and labelled by one function,
  `labelFor`: `LLM-chosen strategy (<model> via NEAR AI Cloud, attestation <id>), moves by the rules engine` only with a
  verified TEE signature and its attestation id; otherwise `Scripted (model unavailable: <reason>)` (no key, the
  endpoint's 402, an unparseable or unsigned answer). `relayer/tests/clan-strategy.test.mjs` checks that an LLM label
  without an attestation id throws and that no scripted label says AI or LLM.
- **Townsfolk speech and the trade advisor** (`/api/agent/say`, `/api/agent/decide`): NEAR AI Cloud confidential
  inference through the relayer. The browser re-checks the TEE signature before the answer replaces the scripted line;
  `node tools/verify-tee/verify.mjs answer.json` re-checks a saved answer ([docs/tee.md](tee.md)).
- **Town traders, quest givers, the Guests' language and the season's signs** are scripted. The sealed schedule never
  contains model output.
- **The arena's NPC economy** is labelled "scripted NPC activity, owner-run, testnet, public seeds".
- **Your own agent** can play a whole season through the agent HTTP API (`server/`); what it runs is yours.
