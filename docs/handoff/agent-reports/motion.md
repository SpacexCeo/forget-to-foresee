# Task S report: motion design system (work in progress)

Branch `claude/motion` (from `claude/loving-curie-ihasft` at de4465d). Paused on the lead's order (usage limit, 08.11).

**Where it stopped:** the survey is done (existing tokens `--ftf-motion-fast` 160 ms / `--ftf-ease-out`, `--wh-transition`
160 ms ease, `html[data-motion]` from `prefs.js`, how the lobby, onboarding, hologram constructor, map panel and
`mountShell` mount and swap screens, the mini DOM used by the tests); no code is written yet.
**Next:** `game/src/ui/motion/index.js` (tokens: durations 120/200/320/480 ms, expo-out and emphasized easings, three
springs; helpers: enter/exit, stagger, FLIP, number tick-up, press feedback, seal, parallax, reduced-motion resolver,
injected `--mo-*` CSS), `tests/motion.test.mjs`, `docs/motion.md`, the announcement in `docs/collab-requests.md` (next
number: 15), then the lobby, onboarding, constructor, map panel and the world (Iris anticipation/follow-through and her
look-at toward the clan she talks to, via a shared look-at helper on the Iris bones).
