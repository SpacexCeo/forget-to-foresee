# Application form answers (NEAR Hackathon)

Part of the single current submission package (`docs/submission/`; order of steps: `owner-steps.md`). Drafts for
https://nearhackathon.com/#apply (or `POST https://nearhackathon.com/api/applications`). Field rules:
`docs/hackathon-rules.md` → "Submission fields". Every `TODO(owner)` is a value only the owner decides; the agent
never guesses it. **One submission per repository, one attempt**: review the whole payload before sending.
Mistakes afterwards go through https://nearhackathon.com/request-changes.

## Values

| Field | Value | Notes |
|---|---|---|
| `projectName` | `Forget to Foresee` | 17 characters |
| `leadName` | `TODO(owner)` | 2–80 characters. The team credit everywhere else is **Lambada_eth** (owner 09.11; X: @Lambada_eth); the lead's name in the form is the owner's choice |
| `email` | `TODO(owner)` | at most 2 submissions per email |
| `size` | `TODO(owner)` | exactly one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` (the string with spaces). Humans only; AI agents are not team members |
| `tracks` | `["games", "nfts"]` | owner decision 09.11, after memory-shard went live on testnet |
| `nearAddress` | `TODO(owner)` | **mainnet** account for the payout (`something.near` or 64 hex). Created by the owner in any NEAR wallet; never invented |
| `projectUrl` | `https://github.com/SpacexCeo/forget-to-foresee` | public |
| `demoUrl` | `TODO(owner)` | the X post URL once published (`docs/submission/x-post.md`) |
| `idea` | text below | 20–2000 characters; the draft is 1,987 characters, re-count after edits |
| `consent` | `true` | only after the owner has read: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |
| `requestId` | generate once | `node -e 'console.log(crypto.randomUUID())'`; keep it for retries after 503 |

Do **not** send a `website` field (spam trap: any value rejects the submission) or any other extra field.

## `idea` (project description, 20–2000 characters)

> Forget to Foresee is a 3D browser strategy game about the price of knowing the future, whose prophecies are fixed in advance and can be checked by anyone.
>
> Problem: in most AI and on-chain games the AI quietly decides the ending and the chain is decoration.
>
> Product: above a floating archipelago, alien Shells speak in round signs with four slots (place, action, power, delay). Six clans (you guide Iris; five are computer-run agents with silk, memory and temper) read the signs, stake silk on where a Gift will land, trade words, keep or break pacts, and must assemble one message before a crisis on trial 13 and a final vote. To see a sign early, Iris forgets a memory forever, and it goes to auction as a shard: she pays for prophecy with her own biography. The season runs locally in the browser; AI agents can play full seasons through our open HTTP API (run locally).
>
> How NEAR fits in: the 17-trial season is generated before the first move and committed to a SHA-256 Merkle root. Our Rust contract season-commit is live on NEAR testnet (ftf-seasons.testnet): the judge season's root and crisis key are committed, and all 15 events were revealed and proof-checked on-chain (the contract recomputes each leaf). This proves the events were fixed before play and match the root; the rules run in the browser, so silk and outcomes are not on-chain.
>
> NFTs: memory-shard (NEP-171, live as ftf-shards.testnet) turns a forgotten memory into an NFT whose metadata is its biography (which memory, the trial it was forgotten, the buyer) plus the Merkle leaf of the sign it opened, binding it to the sealed season. Its ink-ring art is drawn on-chain, byte-identical to the game's. The judge season's 3 shards are minted by our coordinator and shown in-game as NFT cards; holding one unlocks an in-game perk. Live minting and a player-owned agent NFT are future work. No token, no payments.
>
> MIT; 900+ tests; a 5-minute judge path.
>
> Play: https://spacexceo.github.io/forget-to-foresee/?demo=judge

Character count of the quoted text (without the `> ` prefixes, newlines included): 1,991. Updated 09.11, 11.11 (tests, holder perk),
(readiness audit): exact scope (the season runs locally; testnet records and shard NFTs for the judge season; live
minting and a player-owned agent NFT are future work), what the commitment proves and what it does not, test counts
from `npm test` on 09.11. Re-count before sending:
`node -e 'console.log(require("fs").readFileSync(0,"utf8").trim().length)' < idea.txt`.

## Tracks: which ids and why

- **`games`** (Games With Real Economies) — the primary track. The economy is the loop: anchors, Gift splits, trust,
  debts, shard auctions and the tension threshold all run inside one 17-trial season among six agent clans. Judged
  on the game loop, not a token: we have no token.
- **`nfts`** (NFTs That Do Something) — **claimed** (owner, 09.11). The design is "an NFT whose biography is the currency",
  and the NEP-171 contract `contracts/memory-shard` runs on testnet as `ftf-shards.testnet` (21 tests, 3 judge
  shards minted by the coordinator script). On the judge path the Memories panel shows each minted shard as an NFT
  card read from the chain, and a "Minted on NEAR testnet" toast marks the trial-6 sale. Claimed for the memory
  shards only: Iris is not an NFT, live seasons mint nothing, and a player-owned agent NFT is future work.
- Not claimed: `social` (we have no shared budget / DAO), `agents` (our agents do not pay for anything in NEAR),
  `open` (only as a fallback instead of `nfts`).

## Ready payload (fill the TODOs, print, confirm, send once)

```json
{
  "requestId": "<uuid generated once>",
  "projectName": "Forget to Foresee",
  "leadName": "TODO(owner)",
  "email": "TODO(owner)",
  "size": "TODO(owner)",
  "tracks": ["games", "nfts"],
  "nearAddress": "TODO(owner)",
  "projectUrl": "https://github.com/SpacexCeo/forget-to-foresee",
  "demoUrl": "TODO(owner): https://x.com/.../status/...",
  "idea": "<the text above, one paragraph breaks allowed, 20-2000 characters>",
  "consent": true
}
```

```sh
curl -sS -X POST https://nearhackathon.com/api/applications -H 'Content-Type: application/json' -d @payload.json
```
Keep `payload.json` outside the repository (it holds personal data). 201 = saved. 400 = fix the listed fields and
resend with the same `requestId`. 409 = already submitted (do not change the link or the email). 503 = wait a minute,
resend with the same `requestId`.

## Related project (Q-015)

Settled 09.11 (owner): no related project. RAEN is the company name; Lambada_eth is its owner, CEO and the
developer of this game. Forget to Foresee is the only submission, so no cross-links are needed.
