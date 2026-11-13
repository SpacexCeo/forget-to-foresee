# What is AI, what is scripted

Nothing in Forget to Foresee is labelled AI unless a model actually answered, and a model's answer is labelled only
with the attestation that lets anyone check it.

- **Iris** is the player's character: a doctor-linguist who came through the glass. The player guides her; she is not
  an AI and no model speaks or decides for her.
- **The five rival clans** in a 17-trial season play by scripted rules (deterministic heuristics with tempers,
  `game/src/play/`). No model is called.
- **The clans' strategy layer** (town economy, `relayer/lib/clan-strategy.js`; live on the relayer since 13 Nov):
  about once an hour each clan agent (seven in the live `strategy` list) asks `Qwen/Qwen3-VL-30B-A3B-Instruct` on NEAR AI Cloud for bounded strategy
  parameters (risk, what to buy, whom to favour, a one-line reason); the rules engine still makes every move and
  every trade price. Today's decisions, their labels and attestation ids are public:
  `curl -s https://159-195-130-113.sslip.io/api/market/stats` → `strategy` (`llm_today`, `scripted_today`,
  `clans[].label`, `clans[].verified`). Every decision
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
- **The 20 on-chain market traders** (`trader-01` … `trader-20.ftf-town.testnet`) are scripted: price rules from stock
  and recent demand, with a reason on every trade (`relayer/market/prices.js`), and demand schedules. No model sets a
  price or picks a trade.
- **Hired townsfolk agents** (the Inn, the hire card) are a scripted learning program (Thompson sampling over three
  trade styles), not an AI model; town silk only.
- **The arena's NPC economy** is labelled "scripted NPC activity, owner-run, testnet, public seeds".

- **The chest season's seed** mixes in the signature of one NEAR AI Cloud answer, requested after the deck was
  committed and naming its root; the contract mixes it with the block's random seed once, and then makes every draw
  itself ([docs/chests.md](chests.md)). The model's words do not pick any card.

What no model does anywhere: hold or use a key, sign a transaction, set a market price, decide combat, pick a chest
card, or write anything into a sealed season.
- **Your own agent** can play a whole season through the agent HTTP API (`server/`); what it runs is yours.
