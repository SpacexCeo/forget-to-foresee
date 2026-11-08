# Verify it yourself: proofs anyone can check, randomness nobody chose

The juror's objection (`docs/jury/notes/onchain-game-design.md`, rubric C4): the browser generates the season, commits
the root and prints "Verified ✓" with the same code, so the badge proves that the season did not change after it began,
not that it was chosen fairly, and nobody but that code can check it. This page is the answer in three parts:

1. **Out-of-band check**: every revealed sign exports as one JSON file with full hashes, the byte recipe and the Merkle
   path; two one-file verifiers (Node, Python), a `sha256sum` one-liner and the NEAR contract's free view repeat the
   arithmetic without the game's code.
2. **Entropy the developer does not control** (protocol `ftf-seed/1`): for a live season the room commits to its random
   bytes before the player's nonce arrives, the seed is derived from both plus an optional public NEAR block hash, and
   the room's bytes are revealed when the season ends. Anyone can recompute the seed and regenerate the schedule.
3. **Registration on NEAR testnet** before trial 1 (`docs/near.md`): pending the owner's permission; the game says
   "Committed on NEAR testnet ✓" only when the contract holds the root.

The judge season (`?demo=judge`, seed `cc161d308faa67539af44205b56b6d4f`) stays fixed and bit-exact; its export says so
(`fixedSeed: true`, the seed in the file), and a verifier prints *fixed public seed (demo season)*.

## 1. The proof export (format `ftf-proof/1`)

**Do:** in Signs & Visions, on a revealed sign, **Copy proof** (per sign) or **Copy season proof** (every revealed sign;
Task F renders the buttons from `game/src/net/verify-export.js`, request 8 in `docs/collab-requests.md`). Paste into
`proof.json`.

**See:** a document like this (judge season, leaf 0; hashes in full, nothing truncated):

```json
{
  "format": "ftf-proof/1",
  "game": "Forget to Foresee",
  "season": {
    "id": "793f6c05e89839f2", "rules": "v3", "schema": "v2",
    "scheduleRoot": "03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a",
    "leafCount": 15,
    "ashKeyCommitment": "d1a397141934211d4673b7db523824988957b5d2d06b1ab050341a4b545d99b6",
    "seedCommitment": "…", "fixedSeed": true, "seedHex": "cc161d308faa67539af44205b56b6d4f",
    "entropy": { "protocol": "fixed-seed", "seedHex": "cc161d308faa67539af44205b56b6d4f", "sealed": true }
  },
  "leaf": {
    "index": 0, "tick": 3,
    "canonicalEvent": "{\"t\":3,\"place\":1,\"action\":0,\"power\":1,\"delay\":2,\"dots\":2}",
    "salt": "74428ec351d4b3ff0216e9a548213254e330621a86329280b8fa2b0484e7236f",
    "leaf": "d1f89989c73398100263ec26b794f7b140faf65ec20e20ba18c465ca001a7d85",
    "meaning": { "place": 2, "action": "gift", "power": 20, "delay": 2 }
  },
  "merklePath": [ { "h": "c5992fa3…", "left": false }, { "h": "14de0cef…", "left": false }, { "h": "…", "left": false }, { "h": "…", "left": false } ],
  "contractArgs": { "season_id": "793f6c05e89839f2", "index": 0, "canonical_event": "{…}", "salt": "…", "merkle_path": [ … ] },
  "recipe": {
    "leaf": "leaf = sha256(utf8('ftf:leaf:' + season.schema + '|' + season.id + '|' + leaf.index + '|' + leaf.canonicalEvent + '|' + leaf.salt)), lowercase hex",
    "node": "node = sha256(ascii(leftHex + rightHex)) …; for each step: step.left ? sha256(step.h + node) : sha256(node + step.h); the last node of an odd level is paired with itself",
    "root": "the final node must equal season.scheduleRoot, which was shown before trial 1",
    "shell": "printf '%s' 'ftf:leaf:v2|793f6c05e89839f2|0|{\"t\":3,\"place\":1,\"action\":0,\"power\":1,\"delay\":2,\"dots\":2}|74428ec3…' | sha256sum"
  },
  "near": null,
  "verify": { "node": "node tools/verify/verify.mjs proof.json", "python": "python3 tools/verify/verify.py proof.json", "source": "https://github.com/SpacexCeo/forget-to-foresee/blob/main/tools/verify/verify.mjs" },
  "exportedAt": "2026-11-08T…Z"
}
```

What is in it and what is not: the revealed leaf's own event and salt, the sibling hashes of its path, the root, the
commitments, the exact recipe. Not in it: any other leaf's salt or event (unrevealed signs stay secret), Ash's phrase,
the seed of a live season (only the demo seed, which is public by construction).

### Check it without the game

```bash
node tools/verify/verify.mjs proof.json          # Node 20+, zero dependencies, node:crypto SHA-256
python3 tools/verify/verify.py proof.json        # Python 3.8+, standard library only
cat proof.json | node tools/verify/verify.mjs -  # from stdin
```
**See:**
```
Forget to Foresee proof export, season 793f6c05e89839f2 (rules v3, commitment schema v2)
schedule root 03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a
  ✓ schedule root is a full 32-byte hash
  ✓ season id is lowercase hex
leaf: index 0, tick 3, event {"t":3,"place":1,"action":0,"power":1,"delay":2,"dots":2}
  ✓ canonical event has the exact byte form and v2 ranges
  ✓ salt is 32-64 bytes of lowercase hex  (32 bytes)
  ✓ sha256(preimage) equals the leaf hash  d1f89989…001a7d85
  ✓ Merkle path has 4 well-formed steps
  ✓ path length 4 matches the depth of a 15-leaf tree
  ✓ every step sits on the side its index implies
  ✓ folding the path lands on the schedule root  03dbd458…5075769a
  ✓ the stated meaning (Shell II, gift, power 20, delay 2) is what the bytes say
season entropy: fixed public seed cc161d308faa67539af44205b56b6d4f (demo season: anyone can regenerate it, nobody can claim it was random)
OK
```
Change one digit of the event, the salt, a path step or the root and the same command prints `✗ …` and `FAIL` with exit
code 1 (`game/tests/client/verify.test.mjs` does exactly that, for both verifiers).

The leaf alone, with nothing but a shell (the `recipe.shell` line of the file, ready to paste):
```bash
printf '%s' 'ftf:leaf:v2|793f6c05e89839f2|0|{"t":3,"place":1,"action":0,"power":1,"delay":2,"dots":2}|74428ec351d4b3ff0216e9a548213254e330621a86329280b8fa2b0484e7236f' | sha256sum
```
**See:** `d1f89989c73398100263ec26b794f7b140faf65ec20e20ba18c465ca001a7d85  -`, the `leaf.leaf` of the file. To fold the path by
hand: `printf '%s%s' "$node" "$sibling" | sha256sum` (or sibling first when `left` is true), four times, and compare with the
root. With `jq`:
```bash
node=$(jq -r .leaf.leaf proof.json); for i in $(seq 0 $(( $(jq '.merklePath|length' proof.json) - 1 ))); do h=$(jq -r ".merklePath[$i].h" proof.json); l=$(jq -r ".merklePath[$i].left" proof.json); if [ "$l" = true ]; then node=$(printf '%s%s' "$h" "$node" | sha256sum | cut -c1-64); else node=$(printf '%s%s' "$node" "$h" | sha256sum | cut -c1-64); fi; done; echo "$node"; jq -r .season.scheduleRoot proof.json
```
**See:** two identical lines.

And on NEAR testnet, once the contract is deployed (`docs/near.md`): `near contract call-function as-read-only <CONTRACT_ID>
check_leaf json-args "$(jq -c .contractArgs proof.json)" network-config testnet now` → `{ "valid": true, "leaf": "d1f8…", "error": null }`;
the contract recomputes the same bytes and folds the same path against the root it holds.

What a pass proves: this event, with this salt, hashes to this leaf, and this leaf sits in the tree whose root was shown
before trial 1 at the position the index says. So the event was fixed before play and not changed. What it does not
prove by itself: that the root was chosen fairly. That is part 2.

### Independence

- `tools/verify/verify.mjs` and `verify.py` import nothing from the game; their SHA-256 comes from Node's `node:crypto`
  and Python's `hashlib`, two implementations other than the game's own `game/src/game/crypto.js`. The contract
  (`contracts/season-commit/src/proof.rs`) is a third, in Rust, with the same vectors.
- The byte recipe is printed in the file and in the contract README; the canonical event form is a regular expression
  (`{"t":T,"place":P,"action":A,"power":W,"delay":D,"dots":O}` with v2 ranges), so there is no hidden normalisation.
- Hashes are never truncated in the export; the game's log shows short forms only as labels, the export is the record.

## 2. Entropy the developer does not control (protocol `ftf-seed/1`)

Under rules v3 the whole schedule is a deterministic function of a 128-bit seed (P5). The question is who picked the
seed and whether they saw anything first. The protocol, for every live season (no client-chosen seed):

| Step | Who | What | Visible to the player |
|---|---|---|---|
| 1 | room (the engine host: the browser's local room or the server) | draws 32 CSPRNG bytes `R`, keeps them, publishes `commitment = sha256("ftf:entropy:v1\|" + hex(R))`; generates a provisional season from `R` alone | `season.entropy.commitment`; the root and ids stay hidden (`null`) until step 3 |
| 2 | player | picks a **nonce**: any text without `\|` (the HUD may offer a field; the default is 16 random bytes as hex), and optionally fetches a **beacon**: the hash of the latest final NEAR testnet block, read-only RPC, `near-testnet:<height>:<hash>` | the nonce is theirs; the beacon is public |
| 3 | room, on `start_season {phrase, nonce, beacon}` | `seedHex = sha256("ftf:seed:v1\|" + hex(R) + "\|" + nonce + "\|" + beacon)[0:32]`, regenerates the season from that seed, seals it; `season.sealed` event | `season.entropy.{nonce, beacon, sealed: true}`, the root, the ids, the Ash key commitment |
| 4 | room, when `phase` is `end` | reveals `R` and the seed | `season.entropy.{roomEntropy, seedHex}` |

Why neither side can steer the season:
- the room committed to `R` before it saw the nonce or the beacon, so it cannot grind `R` for a favourable schedule
  (abort-and-retry would show as a new commitment, which the player sees before choosing);
- the player chooses the nonce without knowing `R`, so no nonce is better than another for them, and the beacon is a
  block hash nobody in the game produced;
- a player who gives no nonce gets the provisional season (`nonce: ""`), which is still bound to the commitment.
- Ash's phrase and salt, the owner key salt and every leaf salt still come from the CSPRNG (they blind, they do not
  steer): the schedule depends on the seed only, so the check below is complete.

What a verifier does after the season (`tools/verify/verify.mjs season.json`):
```
season entropy: protocol ftf-seed/1
  ✓ room entropy commitment present (shown before the nonce was sent)  14a253ee…6db97b25
  ✓ player nonce present  "my luck word"
  ✓ room entropy is 32 bytes of hex
  ✓ sha256("ftf:entropy:v1|" + roomEntropy) equals the commitment
  ✓ seed = sha256("ftf:seed:v1|" + roomEntropy + "|" + nonce + "|" + beacon)[0:32]  5a1c…
  · regenerate the schedule from this seed with the published rules: cd game && node scripts/replay-season.mjs 5a1c… season.json
```
and then, with the published generator:
```bash
cd game && node scripts/replay-season.mjs <seedHex> season.json
```
**See:** the 15 events the seed produces and `✓ leaf N: export {…} matches the seed's {…}` for every revealed leaf, then
`OK`. The replay uses `engine.js` (rules v3) with zero bytes in place of the CSPRNG: salts and ids are irrelevant to the
schedule, which is what fairness is about. Before the season ends the export carries the commitment and the nonce, the
verifier prints *room entropy not revealed yet*, and the hash checks of part 1 still pass.

Limits, stated plainly:
- In the local demo the "room" runs in the same browser as the player. The protocol is still followed (the commitment
  is published before `start_season` is sent, the order is visible in the events and the export), but a reader who
  distrusts the browser needs the server mode (the agent API runs the same room code) or the NEAR registration of the
  root before trial 1 (`docs/near.md`), where the order is on a ledger nobody edits.
- The beacon is fetched by the client (read-only) and recorded as given; a verifier can confirm the block hash exists
  on testnet at that height (`near block` or the explorer). The protocol is sound without it; it adds randomness that
  neither the room nor the player produced.
- Fixed-seed sessions (`?demo=judge`, `?seed=`) have no protocol: `entropy.protocol = "fixed-seed"`, the seed is in the
  export, and a verifier says so. Legacy rules modes (`v2`, `baseline-2d-1`) report `protocol: "none"`.
- The commitment schema of leaves and keys is unchanged (`v2`), so `baseline-2d-1` parity and the contract vectors hold.

### API surface (game and agents)

- Observation `season`: `leafCount` (new), `entropy` (new: `{protocol, commitment, nonce, beacon, sealed, seedHex, roomEntropy}`
  under `ftf-seed/1`; `{protocol: "fixed-seed", seedHex}`; `{protocol: "none"}`). Before `start_season` under the protocol
  `seasonId`, `merkleRoot`, `seedCommitment` and `ashKeyCommitment` are `null`.
- `start_season` args: `phrase?`, `nonce?` (`^[^|]{1,128}$`), `beacon?` (`^[^|]{1,200}$`).
- Events: `season.created` now carries `entropyProtocol`, `entropyCommitment` and `merkleRoot: null` for unsealed seasons;
  `season.sealed {merkleRoot, seasonId, entropyCommitment, nonce, beacon}` when the season is fixed.
- `PlaySession.start({ phrase, nonce, beacon })`: default nonce 16 random bytes; the beacon is fetched in a browser by
  `fetchNearBeacon()` (`game/src/net/near.js`, 2.5 s budget, null when offline) unless `beacon` is given or the session
  was created with `beacon: null`.
- Exports: `proofExport`, `seasonExport`, `buildProofExport(session, index)`, `buildSeasonExport(session)`,
  `proofExportText`, `proofFileName` in `game/src/net/verify-export.js`.

## 3. Registration on NEAR testnet

`docs/near.md`. The export's `near` block names the contract, the season state (`committed` when the on-chain root equals
the exported root) and the reveal transaction when there is one, and `contractArgs` are exactly what `check_leaf` and
`reveal_leaf` take. Until the deployment is recorded the block is `null` and the game shows no NEAR badge.

## Tests

`cd game && npm test` runs `tests/client/verify.test.mjs`: the export's contents and secrecy (one salt, no phrase, no
truncation), both verifiers on real and tampered exports (seven tamperings, exit codes), the `sha256sum` one-liner, the
replay script, the protocol end to end on a deterministic room (commitment before start, bad nonce rejected by the
schema, same bytes + same nonce = same root, another nonce = another root, entropy revealed only at the end, forged
reveal fails), fixed-seed and legacy sessions, and `PlaySession.start` (default nonce, separator replacement, failing
beacon, fixed seed sends nothing), plus `fetchNearBeacon` on a fake RPC.
