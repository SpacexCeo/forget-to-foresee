# Application form answers (NEAR Hackathon)

Drafts for https://nearhackathon.com/#apply (or `POST https://nearhackathon.com/api/applications`). Field rules:
`docs/hackathon-rules.md` → "Submission fields". Every `TODO(owner)` is a value only the owner decides; the agent
never guesses it. **One submission per repository, one attempt**: review the whole payload before sending.
Mistakes afterwards go through https://nearhackathon.com/request-changes.

## Values

| Field | Value | Notes |
|---|---|---|
| `projectName` | `Forget to Foresee` | 17 characters |
| `leadName` | `TODO(owner)` | 2–80 characters |
| `email` | `TODO(owner)` | at most 2 submissions per email |
| `size` | `TODO(owner)` | exactly one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` (the string with spaces). Humans only; AI agents are not team members |
| `tracks` | `["games", "nfts"]` | owner decision 09.11, after memory-shard went live on testnet |
| `nearAddress` | `TODO(owner)` | **mainnet** account for the payout (`something.near` or 64 hex). Created by the owner in any NEAR wallet; never invented |
| `projectUrl` | `https://github.com/SpacexCeo/forget-to-foresee` | public |
| `demoUrl` | `TODO(owner)` | the X post URL once published (`docs/submission/x-post.md`) |
| `idea` | text below | 20–2000 characters; the draft is 1,979 characters, re-count after edits |
| `consent` | `true` | only after the owner has read: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |
| `requestId` | generate once | `node -e 'console.log(crypto.randomUUID())'`; keep it for retries after 503 |

Do **not** send a `website` field (spam trap: any value rejects the submission) or any other extra field.

## `idea` (project description, 20–2000 characters)

> Forget to Foresee is a 3D browser strategy game about the price of knowing the future, built to prove that a game's prophecies can be fixed in advance and checked by anyone.
>
> Problem: in most AI and on-chain games the AI quietly decides the outcome and the chain is decoration. A player cannot tell a prophecy from a script.
>
> Product: above a floating archipelago, four alien Shells speak in round signs with four slots (place, action, power, delay). Six clans, each an agent with a wallet, a memory and a temper, read the signs, stake silk on where a Gift will land, trade words, keep or break pacts, and must assemble one message from six fragments before a crisis on trial 13 and a final vote. To see a sign early, your agent forgets a memory forever and that memory goes to auction as a shard: you pay for prophecy with your own biography. Simple, Novice and Pro modes, short films between chapters, five languages, phone play. Any AI agent can play a full season through our open HTTP API (run locally): same room module, rules and proofs.
>
> How NEAR fits in: the whole 17-trial season is generated before the first move and committed to a SHA-256 Merkle root. Our Rust contract season-commit is live on NEAR testnet (ftf-seasons.testnet): the judge season's root is registered there and all 15 events have been revealed and proof-checked on-chain, byte for byte, plus a commit-reveal for the crisis key. Nobody, us included, can rewrite what the Guests said. The browser shows "Verified ✓" per reveal; anyone can re-check a proof offline with a Node or Python script. A second contract, memory-shard (NEP-171, live as ftf-shards.testnet), mints a forgotten memory as an NFT bound to the season root. The economy is closed in-game silk: no token, no payments.
>
> Open source (MIT), reproducible from a clean clone: 495 game tests, 28 API tests, 56 + 21 contract tests, and a five-minute judge path in the README.
>
> Play: https://spacexceo.github.io/forget-to-foresee/?demo=judge

Character count of the quoted text (without the `> ` prefixes, newlines included): 1,979. Updated 09.11 after the
testnet deployment of season-commit. memory-shard went live as `ftf-shards.testnet` the same morning (3 judge shards minted). Re-count before sending:
`node -e 'console.log(require("fs").readFileSync(0,"utf8").trim().length)' < idea.txt`.

## Tracks: which ids and why

- **`games`** (Games With Real Economies) — the primary track. The economy is the loop: anchors, Gift splits, trust,
  debts, shard auctions and the tension threshold all run inside one 17-trial season among six agent clans. Judged
  on the game loop, not a token: we have no token.
- **`nfts`** (NFTs That Do Something) — **claimed** (owner, 09.11). The design is "an NFT whose biography is the currency",
  and the NEP-171 contract `contracts/memory-shard` runs on testnet as `ftf-shards.testnet` (21 tests, 3 judge
  shards minted). No HUD element shows shard NFTs yet; the README says so.
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
  "tracks": ["games"],
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

## Second project (Q-015)

If the owner also submits RAEN Computers / Guard, add a "Related projects" link in both READMEs before submitting
either (`docs/decisions.md` §6 item 3 is still open).
