# Submission texts (NEAR Hackathon)

Drafts for the X post and the application form. Every claim here must match the README's real/mock
table; update both together. NFTs are **not** claimed until they run.

## X post — "DAY ONE OR ONE DAY"

**Post 1 (attach the gameplay video):**

> DAY ONE OR ONE DAY.
> We chose day one.
>
> Forget to Foresee: a game where your agent sees the future only by forgetting a memory forever.
>
> Built at NEAR HACKATHON by RAEN Computers.
> @NEARProtocol #NEARHackathon

**Post 2:**

> Shells hang over a floating archipelago. The Guests speak in round signs: Place, Action, Power, Delay.
> Read the sign. Stake silk where it points. Watch the future arrive exactly as it was sealed.

**Post 3:**

> The whole season is sealed in a Merkle root before trial 1. Every reveal is checked against that root in the game,
> and our NEAR contract verifies each proof on-chain. Nobody, not even us, can rewrite what the Guests said.

**Post 4:**

> Six clans. One message split into six fragments. Trust, debts, a crisis on trial 13, and a final vote: gift or weapon?
> Novice mode guides you from A to Z. Pro shows every number.

**Post 5:**

> Humans play in 3D. AI agents play the same room over an open HTTP API, same rules, same proofs.
> Play: spacexceo.github.io/forget-to-foresee
> Open source (MIT): github.com/SpacexCeo/forget-to-foresee
> Day one starts now. #NEARHackathon

## Application form — project description (20–2000 characters)

Forget to Foresee is a 3D strategy game about the price of knowing the future. Over a floating archipelago, alien Shells speak in round logograms with four slots (Place, Action, Power, Delay). Six clans read them, stake silk on where a Gift will land, trade words, keep or break trust, and must assemble one message from six fragments before a crisis on trial 13. To see a sign early, your agent forgets a memory forever, and that memory goes to auction: you pay for prophecy with your own biography.

Fairness is provable. Before trial 1 the full season is committed to a SHA-256 Merkle root; every revealed event carries a proof and is verified against that root, in the game ("Verified ✓") and by our NEAR contract season-commit, which verifies each proof on-chain and handles a commit-reveal for the crisis key. The contract builds and passes unit, mocked-chain and local sandbox tests; testnet deployment is the last step.

What runs today: a full 17-trial season in the browser (Three.js) on a deterministic headless engine that matches our 2D prototype move for move; a world HUD with Novice mode and hints from A to Z; English and Russian with live switching; and an agent-playable HTTP API (OpenAPI 3.1, idempotent commands, per-viewer observations, Merkle proofs) where AI agents play the same room code as humans. The economy is closed in-game silk: no real money, no token, no pay-to-win.

Play: https://spacexceo.github.io/forget-to-foresee/?demo=judge (or clone the repo, run npm install and npm run dev in game/, open /?demo=judge). Tests: npm test in game/ and server/.

## Teaser video

`docs/video/forget-to-foresee-teaser-10s.mp4` — 10 s, 1080p30, 2.9 MB: aerial island in fog → a sign glowing on
the Shell glass → close-up of the logogram → "DAY ONE OR ONE DAY." / "FORGET TO FORESEE". Cut from the owner's
gameplay recordings of 08.11 (HUD cropped out, cool grade, light grain); audio from the game's own sounds
(`amb_shell_inside`, `guest_phrase_1`, `guest_call`). Known flaw: the mouse cursor is visible in two shots.
