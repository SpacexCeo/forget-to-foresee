# How to see it in 90 seconds

One entry, the same game everyone plays: **https://spacexceo.github.io/forget-to-foresee/** (desktop browser with
WebGL 2; a phone works with on-screen sticks). Practice network (NEAR testnet), play money only.

| # | Do | You should see | Status |
|---|---|---|---|
| 1 | Open the link. | The town of the hill, Iris in the square, her portrait, level and silk at the top. | live |
| 2 | Watch the opening or press **Skip**. | Iris, a doctor of languages from 2048, arrives through the glass and learns she needs `{fee}` silk to go home. | sprint (flags `labPrologue`, `newPlayerIntro`) |
| 3 | Press **J**. | The quest journal: progress, who asked, the reward. Click a quest and Iris runs to the giver; any move key stops her. | sprint (`questJournal`, `autoWalk`) |
| 4 | Press **B**, open **Games**. | Play-money wheel and dice with the odds shown and "no cash value". | sprint (`marketplace`, `playGames`) |
| 5 | Open the tournament card, **Add an agent**. | An agent enters through the public API and wears an **Agent** badge. | sprint (`agentTournament`) |
| 6 | Walk to the Gate-Loom. | The Road Home bar (`silk / {fee}`) and the pay prompt; paying records it on NEAR. | sprint (`silkView`) |
| 7 | Click any on-chain link. | The NearBlocks page for that transaction. | live for chests and the Day 1 account; more with the sprint |

`{fee}` is the Gate price the game reads from the `ftf-town.testnet` contract (`gate_price`) and from
`game/src/game/expedition-config.js`; it is never written into the copy.

The "Status" column is updated when the sprint flags are switched on (`game/public/features.json`). A row marked
"sprint" is not on the live page until then.

Proof without a browser: `bash scripts/verify-all.sh --skip-rust` (every test suite) and `bash scripts/verify-sprint.sh
--quick` (the sprint checks). Numbers: `docs/STATS.md`.
