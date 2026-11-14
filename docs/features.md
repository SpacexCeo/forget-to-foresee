# Feature flags

`game/public/features.json` switches features that the build already contains, without a code deploy. The game
fetches it at boot (3 s timeout, `no-store`); on any failure the built-in defaults of `game/src/features.js` hold.
Unknown names and non-boolean values are ignored, so the file can never enable something the build does not have.
New features are **off** in `main` until the owner turns them on. `?debug=1` shows `flags: remote|default` in a corner.
Flags: `damageNumbers` (floating numbers), `loadRitual` (the loading ritual), `register`, `loomMeter`, `presenceChip`, `tuneOverlay`, `statusBanner`, `wayfarers` (the Wayfarers from Kallima: three tourist visitors in town; on in the shipped file), `townLedger` (the Town Ledger: the game menu's Town tab and the market pill's button; on in the shipped file).
