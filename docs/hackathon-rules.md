# NEAR Hackathon — rules and submission checklist

Source: https://nearhackathon.com/HACKATHON.md (re-read before submitting; it can change). Last compared on
08.11.2026: the dates, fields and limits below match that version. Every item below is either **done**, an
**owner action** (needs the owner's account, wallet or confirmation), or **blocked**; the checklist in
`docs/handoff/agent-reports/submission.md` tracks the state per date. The current submission package is
`docs/submission/` (order of the owner's remaining steps: `docs/submission/owner-steps.md`). State below: 09.11.2026.

## Dates (UTC, with Kyiv = UTC+2)
- There is no sign-up before the hackathon: the final submission is the only registration.
- Code counts from the announcement on 19.10.2026 (Q-001); the hackathon window is 01.11–14.11.
- **Submission deadline: 14.11.2026 23:59 UTC = 15.11.2026 01:59 Kyiv.** Submissions are accepted only from
  01.11 00:00 UTC to that moment; outside the window the API answers 403.
- Judging starts 16.11 00:00 UTC; results are announced by 18.11 23:59 UTC (19.11 01:59 Kyiv).
- The repository must stay public through judging. A hosted demo should stay up until 18.11, ideally 25.11 (Q-012).
- Our own plan: code freeze 13.11 20:00 Kyiv; 14.11 is buffer and submission (`docs/spec.md` §0).

## Required
- [x] A working prototype, not a pitch (Q-012). Live: https://spacexceo.github.io/forget-to-foresee/?demo=judge
  (HTTP 200 on 09.11; the season runs locally in the browser tab, see README "The season lives in this browser tab").
- [x] Public repository + LICENSE (MIT) (Q-013–014). https://github.com/SpacexCeo/forget-to-foresee
- [x] README written for a machine reader as well as a human: what the product is, the problem, "do X, see Y"
  steps, the real/mock boundary, no marketing (Procedure §1, Q-012).
- [ ] Baseline (Q-001–005): done: tag `pre-hackathon` exists; the README links the diff and lists libraries,
  templates and AI-generated code. Open: tag `hackathon-submission`, created by the owner at freeze.
  **Owner action** (commands in `docs/submission/owner-steps.md` §1).
- [ ] Demo post on X: says the project was **built at NEAR HACKATHON**, tags **@NEARProtocol** and
  **#NEARHackathon** (optionally @NearLegion and @NearBuilders), has the demo **video** attached (screenshots are
  not enough for a local-only demo, Q-012). **Owner action**: draft in `docs/submission/x-post.md`, the video is the
  60 s jury cut (`docs/submission/jury-video.md`). Not posted yet.
- [x] A concrete NEAR role (Q-011): our own contracts, **deployed on NEAR testnet** (09.11, owner-permitted; Q-010:
  testnet-only projects are eligible in every track). `ftf-seasons.testnet` (`contracts/season-commit`): the judge
  season committed, 15 leaves revealed and verified on-chain, read back by the game ("Verified on NEAR testnet ✓").
  `ftf-shards.testnet` (`contracts/memory-shard`): 3 memory-shard NEP-171 NFTs tied to that season. Explorer links and
  every transaction hash: `docs/near.md`.
- [ ] Submission (Procedure §3): the form at https://nearhackathon.com/#apply or `POST
  https://nearhackathon.com/api/applications` with exactly the fields below. **One submission per repository, one
  attempt**: mistakes are fixed at https://nearhackathon.com/request-changes, never by submitting again.
  **Owner action**: values and the ready payload in `docs/submission/apply-form.md`. Not sent yet.
- [ ] If the owner submits a second, independent project (RAEN Computers / Guard), both READMEs must name each
  other (Q-015: at most 2 projects per person, each email at most 2 submissions). **TODO(owner)**: unconfirmed
  (`docs/decisions.md` §6 item 3); the README's "Related projects" section holds a marked placeholder.

## Submission fields (the human decides every value; never guess or fill placeholders)

| Field | Rule |
|---|---|
| `projectName` | 2–80 characters |
| `leadName` | 2–80 characters |
| `email` | valid, max 160 characters, at most 2 submissions per email |
| `size` | exactly one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` |
| `tracks` | one or more ids, each once: `defi`, `thesis`, `privacy`, `business`, `swarms`, `security`, `agents`, `realworld`, `games`, `nfts`, `memecoins`, `social`, `open` |
| `nearAddress` | **mainnet** payout account, 2–64 chars, lowercase, `^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$` (`team.near` or a 64-hex implicit account); the team creates it in any NEAR wallet |
| `projectUrl` | public repository URL, max 300 chars, unique per submission |
| `demoUrl` | public demo post URL (the X post), max 300 chars |
| `idea` | 20–2000 characters: the problem, the product, how NEAR fits in |
| `consent` | `true` only after the human agreed to: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |
| `requestId` | UUID generated once (`node -e 'console.log(crypto.randomUUID())'`), reused on a retry after a network error or 503 |

Body up to 12000 bytes. **Do not add any other field**: `website` is a spam trap and rejects the submission.
Responses: 201 saved · 400 fix the listed fields and resend with the same `requestId` · 403 window closed or
cross-site, do not retry · 409 repository or email already used, do not change the link to get around it ·
413 shorten `idea` · 503 wait a minute, resend with the same `requestId`. Never commit the payload (personal data).

## How judging works
- First layer: AI screening (Claude Code and Codex) checks reproducibility, verifies claimed features, writes a
  structured report and a preliminary score. Humans decide; a low AI score alone cannot reject (Q-017).
- So: exact commands, expected output ("do X → see Y"), tests, no secrets in the repo, no claim that does not run.
- Prizes: $250,000 pool; one grand prize ($55,000) and 1st/2nd/3rd ($10,000 / $3,000 / $2,000) in each of the 13
  tracks, paid in NEAR to the submitted mainnet account within 30 days of the results (Q-016).

## Tracks we fit (ids for the `tracks` array)
- **`games`** (Games With Real Economies), the primary track: judged on the game loop, not the token; NPCs with
  wallets and economies that evolve without a dev patch. Ours: six clans (five computer-run) trade words, silk, trust
  and memories inside one local season; each clan's "wallet" is an in-game silk balance; the economy is closed
  in-game silk; the season's events are committed before the first move. The weekly tournament is a UI simulation
  and is not part of the judged loop.
- **`nfts`** (NFTs That Do Something) — claimed (owner, 09.11) for the memory shards only: `contracts/memory-shard`
  (NEP-171) runs as `ftf-shards.testnet` with the judge season's 3 shards, minted by the coordinator script; each
  carries its biography and the season's root, and the game shows them as NFT cards on the judge path. Not claimed:
  a persistent, player-owned agent NFT, live minting per season, wallet-controlled play (future work in the README).
- **`open`** remains a fallback if the owner drops `nfts`. `social` (shared budgets on Sputnik DAO /
  Trezu) is not a fit for the MVP.

## What the agent never does without the owner's explicit confirmation (from HACKATHON.md)
Send the submission (print the payload first, wait for a yes); post on X; make the repo public, push or
force-push on the owner's behalf (our workers push to their own branches by the owner's standing rule in
`CLAUDE.md`); sign transactions, spend tokens or deploy to mainnet; commit secrets.

## Working rules for the repo
- Small commits with clear messages after each finished step; push right after committing.
- No keys or secrets: only `.env.example`.
- Never claim in the README what does not run; keep the real/mock table current.
- `cd game && npm test`, `cd server && npm test` and `npm run build` stay green; the Pages workflow runs them on
  every push to `main`.
