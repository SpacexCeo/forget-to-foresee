# Lead tools (integration helpers)

Small scripts the lead session used to merge worker branches and check builds. Run from the repo root unless noted.

| Script | Use |
|---|---|
| `union.py <file>...` | Resolve git conflict markers in docs by keeping both sides (theirs lines that ours lacks are appended). For `docs/decisions.md`, `docs/collab-requests.md` and similar logs; never for code. |
| `readme_count.py <N>` | Update every game test count in `README.md` to N (after `cd game && npm test`). |
| `irischeck.cjs <out.png>` | Headless Chromium on `http://localhost:5199/?demo=judge&mode=walk&play=direct`: lists the `agent_iris.glb` responses and console errors, saves a screenshot. Start the server first: `cd game && npm run build && npx vite preview --port 5199 --strictPort`. |
| `tapfilm.cjs <out.png>` | iPhone 13 emulation, `?play=direct&lang=ru&films=cheap`: taps through the first chapter film shot by shot and prints the shot index, subtitle and hint per tap. |

Merge flow used on 09.11: worker branch → `claude/loving-curie-ihasft` (npm test, build, a headless check) → PR to `main` → merge (owner approval for this phase). Pages republishes on every push to `main`.
