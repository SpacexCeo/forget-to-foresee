# A living island: the NPC agents (Task N)

State on 08.11.2026, branch `claude/living-npcs` (worker G continues). Owner files: the animation and behaviour code
of `game/src/play/agents.js` (not the nameplates: Task F), `game/src/play/behaviour.js`, `game/src/physics/motion.js`,
tests `game/tests/client/npc.test.mjs`. Presentation only: nothing here changes what the engine decides; the agents
only go where the room says they acted, and look alive in between. Both play modes (hub and `?mode=walk`).

## What the agents do now

1. **Look-at.** Each agent's neck (35 %), head (65 %) and eye bones (an extra 30 %) turn toward a target after the
   mixer has posed the clip, as a world-space delta (yaw about +Y, pitch about the agent's right axis) blended in the
   parent bone's space, so the clip's own head motion stays underneath. Targets, by priority: the conversation
   partner; Iris when she is within 7 m of the agent, on its plateau, or talking to it; the Shell of a reveal for 4 s
   (every clan looks up); an idle glance (a seeded yaw/pitch for 1–2.5 s). Angles are clamped (±70° yaw, ±30° pitch)
   and the weight fades to zero as a target passes behind the agent (no head snapping round the back). Smoothing 6/s
   (3/s under reduced motion). Bones are found by name (`head`, `neck`, `eye*`, the rig's own names; prefixes and
   numeric suffixes ignored); a model without them simply does not turn its head.
2. **Idle life.** `IdleLife` (behaviour.js): per agent a seeded scheduler of glances (45 %), weight shifts (35 %: a
   ±2° roll of the body group eased in and out) and short gestures (20 %: `think`, `talk` or `gesture_offer` for about
   2 s, by temperament: Frost and Ash think, Amber offers, Salt talks). Gaps of 4–12 s divided by the clan's tempo,
   a seeded first offset of 1–8 s, and the director holds a gesture back when another agent started one in the last
   0.7 s, so no two agents move in step (tested: at most one coincident start in 120 s for any pair). The seed is the
   season's `seedCommitment`, so the same season breathes the same way on every machine. The existing cue layer
   stays: `think` for Ash under high tension, `gesture_offer` while a clan has an open offer, `celebrate` / `defeat`
   on fragment and link changes (`reactionsFor`), `talk` toward Iris during a dialogue.
3. **Purposeful movement.** `NpcDirector` (behaviour.js) turns what the room shows into goals:

   | the room shows | who walks where | there |
   |---|---|---|
   | a clan's fragment goes into the Scroll | that clan → the Scroll (plaza) | `gesture_offer` 3.5 s, faces the Scroll, beat `line.fragment` |
   | silk moves from clan A to clan B (A's silk down by what B's went up) | A → B's camp, B steps to its bridge | they face each other and talk in turns (2.4 s beats, 7 s), A then walks home |
   | a link between two clans is mended | the same meeting | beat `line.mend` |
   | a clan's link with Iris is mended | that clan → the Iris camp | `talk` 3.5 s |
   | an auction opens | the auctioneer → the shard pedestal | `gesture_offer` 14 s |
   | a bid leads an auction | the bidder → the pedestal | `think` 8 s |
   | a pact, an escrow (events) | the clan → the Scroll / Amber → the pedestal | `gesture_offer` |
   | the vote phase | every clan → its own node on the plaza ring (4.2 m) | stands facing the Scroll until the end |
   | a clan goes dark or is isolated / broken with Iris | it goes home and stays | the cue layer (slump, turned away) |

   Goals come from **observation diffs** (public state only, so no new wiring is needed) and, when the play layer
   calls `agents.event(ev, now)`, from the public events as well (same goals, a few seconds earlier; and the sky
   look-at for reveals needs the event). A clan queues at most two goals; duplicates are dropped; an errand is go →
   act → return home. Routes come from the room's own walk graph (`planRoute` in `src/net/world-map.js`), so the
   agents cross the same bridges Iris does; they walk with the Task G motion model (`NPC_MOTION`, 1.55 m/s on an
   errand, 1.1 m/s ambling about the camp) and brake into their spot. **Local avoidance** (`avoidWish`, motion.js):
   a neighbour (another agent or Iris) within 2.2 m ahead and 1.1 m to the side pushes the step sideways, one almost
   on top of the agent slows it; the push is bounded so nobody is pushed off a bridge (the corridor is checked in the
   route test).
4. **Conversations.** A meeting: the visitor walks to the host's camp, the host walks to its bridge end; when both are
   there (or within 2.4 m of each other on the way) they face each other, the visitor speaks first (`talk`), turns
   alternate every 2.4 s for 7 s, then the visitor walks home. The first beat is offered to the dialogue strip through
   `agents.onSay({speakerId, key, args})` with existing line keys (`line.walk.silk`, `line.mend`, `line.fragment`,
   `line.pact`, `line.escrow`, args as `{$agentId}`), so no new locale strings are needed. The hook is wired by the
   play layer (request 9 in `docs/collab-requests.md`); until then the beat is silent and the room's own line (shown
   at event time) is the only text. A host (or a visitor who arrives first) waits while the partner still means to come, up to 60 s, and walks home at once if the partner drops the meeting.
5. **Budget.** Per frame per agent: one `clanCue`, one directive lookup, one `steerTo`, one avoidance pass over at
   most six neighbours, one motion step, the gait blend, and three quaternion products for the look-at; a route is
   planned once per goal (Dijkstra over 35 nodes). No per-frame allocations beyond a few small arrays. Measured in
   headless Chromium (SwiftShader, so only relative): see the report.

## Tests (`game/tests/client/npc.test.mjs`, 9)

Seeded rng; idle life determinism, desync between clans, gap bounds, gesture hold-back; look-at clamps and the
fade behind; avoidance (sidestep, mirror side, dead-ahead tie-break, slow-down, no wish → no push); the director's
errand, meeting (turns, host second, visitor home, give-up), gathering and reveal look; observation-diff inference
(contribution, silk transfer, mend, auction, bidder dedupe, dark); and a route walk from the Moss camp to the Scroll
and back with the motion model that stays inside the bridge width and takes 12–25 s.

## QA

- `/?play=direct&mode=walk&demo=judge`: press T a few times; watch a clan walk to the Scroll after a contribution,
  two clans meet after a silk transfer, heads follow Iris when she comes near a camp.
- `/?play=direct&demo=judge` (hub): fly into a Shell and leave; the trials pass automatically and the clans act.
- Console: `__ftf.play.agents.stats()` (move / act / look weight / bones per agent),
  `__ftf.play.agents.director.events` (queued goals).
- Headless result (SwiftShader at about 245 ms per frame, `vite preview` of the build, zero console errors or
  warnings beyond SwiftShader's own "GPU stall" notice, in walk mode and in the hub): head and neck bones found on
  every loaded agent (the glbs export no eye bones, so the eye share is inert until the GPU rebuild adds them);
  idle glances show as look weights rising and falling while nobody is near; a director-driven contribution sends
  Moss to the Scroll at 1.55 m/s with the gait weight at 1 and the cue clip under it; a silk transfer sends Ash to
  Salt's camp while Salt steps to its bridge end and looks at the approaching visitor; two real `end_tick` commands
  (tick 1 → 3) make the director queue Scroll errands for the clans whose fragments went in and fire the celebrate
  reactions; `gather()` sends all five toward their plaza-ring nodes. Frame time 243 → 248 ms (unchanged within
  noise). Screenshots: `docs/npcs/after-walk-trials-1280x800.png`, `after-errand-1280x800.png`,
  `after-gather-1280x800.png`, `after-meeting-1280x800.png`. A final run to completion: `KeyN` toggles the map
  once per press (closed → open → closed); Frost walks from its camp to the Scroll along the graph, gestures at the
  ring node (−0.1, 4.2), walks home; Moss visits Amber (the room's graph routes it over the plaza), Amber steps to its
  bridge end and waits looking at the approaching visitor, the talk turns start when Moss arrives; crossing at the
  plaza ring both slow to 0.7 m/s (avoidance) and carry on. Note: under SwiftShader the game clock runs at about a
  third of wall time, so the walks look three times longer in these logs than they are.

## Not done / open

- The mind glyphs above the agents (name, trust arc, glyph) are Task F's nameplate code and are not touched here.
  They are floating text in the world; see the note to Task F in `docs/collab-requests.md`.
- Eyes: the rigs expose eye bones; whether a 30 % eye share reads well needs a GPU close-up.
- Iris does not look at the clan she talks to yet (her look-at would live in `updateIris`); the clans look at her.
- No NPC walks inside a Shell (there are none there).
