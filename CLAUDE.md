# Forget to Foresee

RAEN Computers' game for NEAR Hackathon (submission deadline 15.11.2026 01:59 Kyiv).

- **Strict rule: everything in this repository is English** — README, docs, commit messages, code, code comments and notes (TODOs, JSDoc, test names), game text. **English is the primary version of the game**; Russian exists only as the second UI language in locale files (and in tests that check the Russian locale renders). Conversation with the user stays in Russian.
- At the start of every session read `docs/decisions.md` (context and decisions) and `docs/spec.md` (requirements), then `docs/hackathon-rules.md` (submission checklist).
- Record decisions and course changes in `docs/decisions.md`.
- Commit in small steps after each finished piece and push right away. No secrets in the repository.
- The README never claims anything that does not run; keep the real/mock table current.
- `npm test` in `game/` must stay green. `baseline-2d-1` rules must stay bit-exact with `prototype-2d/` (parity tests).
- The drive is exFAT: run git with `-c safe.directory=<repo path>` unless a global exception is configured.
