# Day 1: arrival, name, free mint of Elise, first steps (owner, 11.11) — top priority

Owner decision: before the hackathon we run on the testnet keys the lead holds; real free mint at entry must work. (Keys are rotated after the hackathon.)

## Player flow
1. The game opens in the town: the camera flies in and settles on the heroine at the gate. Title card **"Welcome · Day 1"**.
2. **Name field** ("What should the town call you?"). Confirm → a bright burst: **"A gift is waiting for you."**
3. **Two face-down holographic cards** with a "?" and **"Free mint"** under them. Tap one → it flips with light and sparkles → **Elise** (her NFT-001 card) is revealed → the mint runs on NEAR testnet in the background (progress shimmer, then "Minted on NEAR testnet ✓" + explorer link only after the transaction is final). Button **"Claim to inventory"** → the card flies into the inventory icon. If the mint fails or the network is down: the card stays as an "Unminted preview — tap to retry", never a fake ✓.
4. The player is in the game and can run. **Hints** in order: switch heroine skin (Iris ⇄ Elise: how and where — menu → Heroine, or a key), then the town quest, then short **10-second story trailers** (in-engine cinematics with subtitles, skippable) about who the heroine is and the town's backstory, then **"The Tournament is open"**: go to the guide (shrine keeper) to learn how it works, register at the altar, enter now. Above the altar a **timer** shows when the next Tournament round starts; in this build it reads "Open now" between rounds.

## Accounts and the mint (real, testnet)
- The browser generates an ed25519 keypair for the player and keeps it in localStorage ("this browser holds your testnet key"; export/backup option in the profile).
- A contract method `create_guest(public_key, nickname)` on a new `guests` contract (sub-account of ftf-coordinator.testnet) creates a real sub-account `<nick>-<short id>.guests.ftf-coordinator.testnet` with the player's public key as full access, funds its storage from the contract balance, and mints **Elise** (heroine contract) to it. One guest per public key; nickname sanitized; daily cap.
- The client calls `create_guest` with a **function-call access key** of the guests contract that is restricted to that one method and has a small gas allowance; that limited key may live in the client (it cannot move funds). The lead creates and funds it; it is the only key in the client, documented in README as a limited testnet guest key.
- Dragons later mint to Elise's own account (companion plan). The player really owns Elise on testnet; the README real/mock table and the honest-copy rules are updated accordingly (player-owned testnet NFT via a browser-held guest key; still no mainnet, no wallet connect).

## Tests
create_guest happy path, duplicate key rejected, nickname sanitizing, cap; client: no "Minted ✓" before final status; retry path; skin switch persists; hints sequence; altar timer states.
