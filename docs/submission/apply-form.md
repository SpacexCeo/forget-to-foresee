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
| `idea` | text below | 20–2000 characters; the draft is 1,722 characters, re-count after edits |
| `consent` | `true` | only after the owner has read: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |
| `requestId` | `6d93ee96-620e-4ae1-a013-d48ae6dc159e` | generated once on 14.11; reuse this exact value on any retry after a network error or 503 |

Do **not** send a `website` field (spam trap: any value rejects the submission) or any other extra field.

## `idea` (project description, 20–2000 characters)

> Forget to Foresee is a 3D browser action-RPG in a hill town whose economy runs live on NEAR testnet. Play now: https://ftf-game.xyz/ (judge mode: https://ftf-game.xyz/?judge=1). No install, no wallet popups.
>
> Live economy: 20 trader accounts, each with its own key (trader-01 to trader-20.ftf-town.testnet), trade on the town contract ftf-town.testnet all day: over 23,000 trades today, nobody presses a button. Prices follow stock and demand by rules in one file; every trade carries a readable reason. A model on NEAR AI Cloud sets each clan's bounded strategy about once an hour, with an attestation id; the rules engine makes every trade. In game, the Town Ledger shows the trades, reasons and explorer links.
>
> Players on chain: 88 guest accounts, each owning an Elise heroine NFT whose token has its own account; dragon NFTs are minted to that account, so the dragon follows the heroine. Loot chests open from a deck committed on chain, each draw verifiable.
>
> Play: walk the town, talk to townsfolk, fight stone spiders, open chests, trade at the market, unlock the tournament, ride a dragon to the Glass Shoal and beat the ice serpent. Shared multiplayer town (server-side spiders, fair loot), sign in as a guest, by email, or with a NEAR, EVM or Solana wallet; 5 languages; desktop and phone.
>
> Story: Iris, a doctor-linguist from 2048, pays for prophecy with her own memories. Each season's prophecies are sealed before the first move (Merkle root on ftf-seasons.testnet, revealed with proofs); a forgotten memory becomes a memory shard, a NEP-171 NFT (ftf-shards.testnet).
>
> Honest scope: testnet only, free to play, nothing has money value; the trades are scripted NPC activity. MIT, open source, CI on every push.

Character count of the quoted text (without the `> ` prefixes, newlines included): 1,722 (final text of 15 Nov, matches the owner's submission folder `02-idea.txt`). Every claim must match the README; "over 23,000 trades today" and "88 guest accounts" are the 15 Nov figures and must be rechecked on the day of sending.
Re-count before sending:
`node -e 'console.log(require("fs").readFileSync(0,"utf8").trim().length)' < idea.txt`.

## Tracks: which ids and why

- **`games`** (Games With Real Economies) — the primary track. The economy is the loop: anchors, Gift splits, trust,
  debts, shard auctions and the tension threshold all run inside one 17-trial season among six agent clans. Judged
  on the game loop, not a token: we have no token.
- **`nfts`** (NFTs That Do Something) — **claimed** (owner, 09.11). The design is "an NFT whose biography is the currency",
  and the NEP-171 contract `contracts/memory-shard` runs on testnet as `ftf-shards.testnet` (21 tests, 3 shards of
  the recorded season minted by the coordinator script). In the game, Profile → NFTs → Holder access reads them from
  the chain. Also claimed: an NFT that owns an NFT.
  Every Day 1 guest gets an Elise heroine NFT whose token has its own sub-account (88 by 15 Nov); dragon NFTs
  are minted to that sub-account (`companions.ftf-coordinator.testnet`, 6), so the dragon follows the heroine.
  Not claimed: Iris is not an NFT, live seasons mint nothing, and a player-owned agent NFT is future work.
- Not claimed: `social` (we have no shared budget / DAO), `agents` (our agents do not pay for anything in NEAR),
  `open` (only as a fallback instead of `nfts`).

## Ready payload (fill the five TODO(owner) values, print, confirm, send once)

Only `leadName`, `email`, `size`, `nearAddress` and `demoUrl` are left to the owner; every other value is final. `consent: true` stands for the owner's own agreement to the sentence in the table above.

```json
{
  "requestId": "6d93ee96-620e-4ae1-a013-d48ae6dc159e",
  "projectName": "Forget to Foresee",
  "leadName": "TODO(owner)",
  "email": "TODO(owner)",
  "size": "TODO(owner)",
  "tracks": ["games", "nfts"],
  "nearAddress": "TODO(owner)",
  "projectUrl": "https://github.com/SpacexCeo/forget-to-foresee",
  "demoUrl": "TODO(owner): https://x.com/.../status/...",
  "idea": "Forget to Foresee is a 3D browser action-RPG in a hill town whose economy runs live on NEAR testnet. Play now: https://ftf-game.xyz/ (judge mode: https://ftf-game.xyz/?judge=1). No install, no wallet popups.\n\nLive economy: 20 trader accounts, each with its own key (trader-01 to trader-20.ftf-town.testnet), trade on the town contract ftf-town.testnet all day: over 23,000 trades today, nobody presses a button. Prices follow stock and demand by rules in one file; every trade carries a readable reason. A model on NEAR AI Cloud sets each clan's bounded strategy about once an hour, with an attestation id; the rules engine makes every trade. In game, the Town Ledger shows the trades, reasons and explorer links.\n\nPlayers on chain: 88 guest accounts, each owning an Elise heroine NFT whose token has its own account; dragon NFTs are minted to that account, so the dragon follows the heroine. Loot chests open from a deck committed on chain, each draw verifiable.\n\nPlay: walk the town, talk to townsfolk, fight stone spiders, open chests, trade at the market, unlock the tournament, ride a dragon to the Glass Shoal and beat the ice serpent. Shared multiplayer town (server-side spiders, fair loot), sign in as a guest, by email, or with a NEAR, EVM or Solana wallet; 5 languages; desktop and phone.\n\nStory: Iris, a doctor-linguist from 2048, pays for prophecy with her own memories. Each season's prophecies are sealed before the first move (Merkle root on ftf-seasons.testnet, revealed with proofs); a forgotten memory becomes a memory shard, a NEP-171 NFT (ftf-shards.testnet).\n\nHonest scope: testnet only, free to play, nothing has money value; the trades are scripted NPC activity. MIT, open source, CI on every push.",
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
