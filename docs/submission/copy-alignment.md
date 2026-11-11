# Copy alignment (hackathon spec §7), 11.11.2026

Every public surface checked against the README real/mock table. **Owner** rows are settings or posts outside the
repo; the agent does not change them.

| Surface | Status | Action |
|---|---|---|
| GitHub repo description | **Overclaims (owner).** Today: "3D game where NFT agents pay for prophecy with their own memories…". Iris and the clans are not NFTs. | Owner, in the repo settings, suggested text: *"3D strategy game: forget a memory to see the future. Each season's events are committed on NEAR testnet before play; on the judge season, forgotten memories are NEP-171 shard NFTs. Built at NEAR HACKATHON."* |
| near.social / any teaser | Owner check: "each an agent with a wallet and a memory" is wrong | Say "an in-game silk balance", not a NEAR wallet |
| `prototype-2d/index.html` intro | Frozen ("Iris is an NFT with a wallet and a memory"; "The clans are NFT agents") | Left frozen on purpose (parity reference). The README's "2D prototype" section already says that line is the original concept and not built |
| Lobby `lobby.demoNotice` | "Guest demo on NEAR testnet. No real money, no prizes." | Kept |
| Access details `ent.wallet` | **Fixed.** Used to promise "a voluntary testnet action" with a wallet that does not exist | Now: "No NEAR wallet is needed, and the game never asks for one or for a seed phrase. The testnet records are read-only." (five locales) |
| Tournament card | Labeled **Simulation** (badge, "Enroll (simulation)", "Results (simulation)") | Kept until P2-A, which is not started |
| README "Not built" list | Accurate: no player-owned agent NFT, no live minting per season (an ordinary season shows an *Unminted shard preview*), no wallet play, no on-chain escrow, agent card not deployed | Update only if the owner deploys the agent card (P1-D) |
| X post (`docs/submission/x-post.md`) | Has "built at NEAR HACKATHON", @NEARProtocol, #NEARHackathon and the video note. Already forbids tournament, player-owned and live-mint claims | Kept |
| Game UI: first contact | **Fixed (P0-B).** "The town wakes. Walk Iris to the Tournament altar." / "Step into the town" | — |
| Game UI: shard card | **Fixed (P1-C).** "Minted on NEAR testnet" only for a matching token. Otherwise "Unminted shard preview", with no token id and no link. The section heading says "on NEAR" only when a real token is in it | — |
| Game UI: town quest purse | "Town purse: N silk (a teaching prop, not on-chain)" | — |

Not claimed anywhere: the `social` track, wallets, player-owned NFTs, live mints, prizes, an on-chain outcome.
The apply form gets no `website` field (spam trap).
