# End-to-end checks (QA, Task K)

`cd game && npm run e2e` runs every `tests/e2e/*.e2e.mjs` with `node --test` in headless Chromium (Playwright). It is
**not** part of `npm test`: it needs a browser, takes about 15 minutes on a software renderer, and it is meant to be
red while the defects in `docs/qa/defects.md` are open. Each test names the defect it covers (`QA-0nn`).

- The server under test is a Vite dev server started by the harness; set `FTF_E2E_URL=https://…/forget-to-foresee/`
  to run the same checks against a deployed build.
- Playwright is resolved from `PLAYWRIGHT_PATH`, `NODE_PATH` or the global installs of the cloud container; the game
  has no new dependency. Chromium must be installed for that Playwright (`npx playwright install chromium`).
- Input goes through `window.__ftf.play.handleKey(code)` and `element.click()` (the code paths the keyboard and the
  mouse use) because real-time input is unreliable at the 5–15 fps of SwiftShader; `lib/env.mjs` documents the
  driver. Screenshots land in `tests/e2e/.shots/` (git-ignored).
- One file at a time: `node --test tests/e2e/proof-line.e2e.mjs`.
