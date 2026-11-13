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
| `idea` | text below | 20–2000 characters; the draft is 1,893 characters, re-count after edits |
| `consent` | `true` | only after the owner has read: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |
| `requestId` | generate once | `node -e 'console.log(crypto.randomUUID())'`; keep it for retries after 503 |

Do **not** send a `website` field (spam trap: any value rejects the submission) or any other extra field.

## `idea` (project description, 20–2000 characters)

> Forget to Foresee is a 3D browser game set in a hill town whose economy runs live on NEAR testnet.
>
> Live economy: 20 trader accounts, each with its own key (trader-01 to trader-20.ftf-town.testnet), trade silk on the town contract ftf-town.testnet all day, over 21,000 trades on 13 Nov; nobody presses a button. Prices follow stock and recent demand by rules in one file, and every trade carries a readable reason ("why this price"). Live stats: https://159-195-130-113.sslip.io/api/market/stats. The traders are scripted: about once an hour a model on NEAR AI Cloud sets each clan's bounded strategy, with an attestation id, and the rules engine makes every trade. Town items are NEP-245 multi-tokens (items.ftf-town.testnet). In the game, the Town Ledger window shows today's count, the latest trades with their reasons and explorer links, every trader's account and the clans' strategy calls; the Economy Lab plays a week of the market in a minute.
>
> Players on chain so far: 56 guest accounts, each owning its heroine NFT; chests opened from a deck committed on chain; dragon NFTs owned by a heroine NFT's own account.
>
> Sign-in: play as a guest at once, with no wallet popups (the browser makes a free testnet guest account), or sign in with a NEAR, EVM or Solana wallet or a passkey.
>
> Story: Iris, a doctor-linguist from another planet, year 2048, came through the glass. She pays for prophecy with her own memories. Each season's prophecies are sealed before the first move: committed to a Merkle root on ftf-seasons.testnet and revealed with proofs anyone can check. A forgotten memory becomes a memory shard, a NEP-171 NFT (ftf-shards.testnet) bound to its sealed season.
>
> Honest scope: testnet only, free to play, nothing has money value; the trades are scripted NPC activity, not player volume. MIT, open source, CI on every push.
>
> Play: https://spacexceo.github.io/forget-to-foresee/

Character count of the quoted text (without the `> ` prefixes, newlines included): 1,893. Rewritten 13.11 (jury review):
leads with the live economy (20 trader accounts with their own keys on `ftf-town.testnet`, the readable price reasons,
the Town Ledger window, the Economy Lab week), then sign-in, then the sealed seasons and memory shards. Every claim
matches the README "Live on NEAR testnet right now" block and `docs/ai-use.md` (scripted traders; the clans' strategy
layer asks NEAR AI Cloud about once an hour; the rules engine makes every trade). "Over 21,000 trades on 13 Nov": the
relayer sent 21,218 by 23:57 UTC; the recount from the public indexer is `docs/proof/tx-2026-11-13.md`. "56 guest
accounts": `stats` on `guests.ftf-coordinator.testnet` at 00:00 UTC 14 Nov. NEP-245: the item contract is deployed; do not claim mints until `items.ftf-town.testnet` shows supply.
Re-count before sending:
`node -e 'console.log(require("fs").readFileSync(0,"utf8").trim().length)' < idea.txt`.

## Tracks: which ids and why

- **`games`** (Games With Real Economies) — the primary track. The economy is the loop: anchors, Gift splits, trust,
  debts, shard auctions and the tension threshold all run inside one 17-trial season among six agent clans. Judged
  on the game loop, not a token: we have no token.
- **`nfts`** (NFTs That Do Something) — **claimed** (owner, 09.11). The design is "an NFT whose biography is the currency",
  and the NEP-171 contract `contracts/memory-shard` runs on testnet as `ftf-shards.testnet` (21 tests, 3 shards of
  the recorded season minted by the coordinator script). In the game, Profile → NFTs → Holder access reads them from
  the chain. Claimed for the memory
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
