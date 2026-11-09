# Shard NFT HUD (worker N2, `claude/shard-nft-hud`, 09.11)

Closes the README gap "no HUD element shows the shard NFTs" (collab request 9). Status: **done**; not merged.

## Done
- **Memories panel → "Memory shards on NEAR"**: one NFT card per shard on `ftf-shards.testnet` (Iris's first):
  - the contract's SVG, checked byte-identical to `shardSvg()` and then drawn in stroke by stroke;
  - "NFT · NEP-171 · ftf-shards.testnet", the token id and the owner (linked);
  - the biography from the metadata;
  - "Bound to the sealed season · leaf #N", linked to the reveal tx on `ftf-seasons.testnet`;
  - a nearblocks token link.
- **"Minted on NEAR testnet" toast**:
  - it appears when a shard seen open in this session closes with a buyer and the token exists on-chain (judge path: trial 6, Frost buys Iris's call for 13 silk);
  - it is placed in the HUD's free gap: under the quest banner on desktop, between the top bar and the quest card on phones;
  - it stays up while hovered or focused.
- **Gating**: a card or toast shows only when the token is on-chain and its data equals the local shard field for field. Live season: "on-chain for the judge season only", with no RPC call. RPC error: nothing. Read-only.
- Strings `shard.nft.*` are in en, ru, uk, it and zh.
- Docs: README rows and the nfts track entry, `docs/decisions.md`, `docs/shard-nft.md`, `docs/near.md`.
- Tests: `npm test` 505/505 green. New `game/tests/client/shard-nft-hud.test.mjs` (7 tests).
- Headless run on the production build (`?demo=judge&mode=walk`): 1280×800 and iPhone 13, toast and card present, 0 console errors, no horizontal overflow. Screens are in `docs/screens/shard-nft/`.

## Not done / next steps
- Merge to the integration branch, then to main, after the lead's check (tests, build, headless run).
- Optional: show the cards in an auction or pedestal view too (today only the Memories panel and the toast show them).
- Optional: the jury video (J3) could use `docs/screens/shard-nft/*` or the live card.

## Files
- `game/src/ui/world-hud/shard-card-model.js`: view model, gating, mint moments.
- `game/src/ui/world-hud/shard-card.js`, `shard-card.css`: card, section, toast.
- `game/src/play/world-hud.js` (watcher and toast wiring) and `game/src/play/ui.js` (the Memories panel section).
- `game/src/play/locales/*.js`: strings `shard.nft.*`.
- `game/tests/client/shard-nft-hud.test.mjs` (in `npm test`).
- `game/tests/client/shard-hud-capture.mjs`: headless capture; needs a build, Chromium and testnet RPC.
