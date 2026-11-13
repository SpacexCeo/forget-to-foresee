# The other-player card and the demo player (Social track)

**The card** (`game/src/play/player-card.js`):
- Tap or click another player in town to open it. It closes on a tap outside it or Esc, and nothing pops up by itself.
- It shows the player's name, heroine, level and silk, using the one silk number (`formatSilkC`).
- It shows the player's NFTs, read from NEAR testnet for their account (the loot NFTs on the chests contract).
- Profile opens a read-only view.
- Trade: for a real player it opens the market, where both sides confirm, every price is shown first and the sale
  settles on NEAR testnet.
- Add friend: the list is saved on this device for your account (`play/friends.js`). The menu has a Friends tab.
- Presence carries an optional `account` and a shown level `lv` in `hello` (`presence/lib/hub.js`), so others can
  read a player's public NFTs and silk. A player without an account shows "not shared".

**The demo player** (`game/src/play/demo-player.js`, `demo-walker.js`):
- It is "Sheriffchenko (demo player)" in the Sheriffchenko skin, with a "demo" badge on its name tag.
- It walks only on paths (owner rule): it uses the shared town path graph (`play/town-paths.js` `townPaths()` with the
  townsfolk's walks added by `townsfolk-plan.js`), from one random waypoint to the next, with short idles and
  look-arounds and no free roaming. It keeps clear of the portal and the shop doors. The ground is followed from just
  above the feet.
- It never walks through anyone. If Iris, a townsperson or another player stands within 1.2 m ahead, it stops and
  waits. If it is blocked for more than 6 s, it walks back the way it came.
- Its card says: "Demo player: a scripted townsperson so you can try trading, profiles and friends."
- Its trade is a practice trade on this device. It accepts by script, nothing is moved and nothing is on chain, and
  the card says so.
- It has no account, so no NFTs are read for it.
- `?demo=0` turns it off.

Five locales. Tests: `game/tests/social/` and `presence/tests/hub.test.mjs`.

Screenshots: `demo-player-in-town.png`, `demo-player-card.png`. The first-visit name prompt was hidden for the card
shot, because submitting it would create a testnet guest account.
