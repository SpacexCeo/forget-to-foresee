# Release polish log

One line per fix: date and time (Kyiv), what was fixed, the file, the commit. Task: `night-polish-task.md`.

- 10.11 01:10 The verified hint no longer says "it came true": the event matches its seal, your reading is judged on the card (`game/src/locales/*.js`, `wh.hint.verified`) — e7c93ad
- 10.11 02:53 Hub wait goal no longer says "no sign is waiting" when a sign waits and Iris has no attention left this trial: the hint names the Shell (`game/src/play/objectives.js`, `hub.goal.wait.hintSpent` in all five locales) — 3b93ff7
