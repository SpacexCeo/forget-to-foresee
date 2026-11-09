# AI screening (Claude Code / Codex) and reproducibility: how a machine judge reads a repo

Read on 2026-11-08 (UTC). Juror notes feeding `docs/jury/rubric.md`.

## Summary for the rubric
- The hackathon rules define the AI pass narrowly: "reproducibility check, feature verification, structured report, preliminary score. Humans decide; low AI score alone cannot reject" (Q-017). Nothing in the rules fixes the report format or scale, so the shape below is inferred from published practice.
- The closest published pipeline (Devfolio, 2025-2026) has an agent walk the repo with `read`, `grep` and `ls`, check the pitch claim by claim, and emit a markdown audit whose core is a `claims_mismatches` list with `file:line` citations; per-criterion 0-10 scores are aggregated in code and a human accepts or overrides.
- The score drops come from the gap between what the README/pitch says and what the code does (claimed RLS isolation that only checked auth: 8 to 5; a "custom architecture" that was stock BERT: 7 to 4). It rarely drops for modest, honest claims.
- Artifact-evaluation practice (ACM badges, SPLASH/ISSTA/USI forms) gives the checklist a screener will reuse: install and a sanity run in about 30 minutes, every step with an expected output and an approximate time, a claim-by-claim list that says which claims the artifact supports and which it does not, and a fresh-machine test by the authors.
- The Hugging Face ICML 2026 reproduction run (2,226 papers, 35,908 claims) shows the dominant agent failure: "missing artifacts were the most common cause" of inconclusive verdicts, and agents misread scale-dependent behaviour. Their judge treats each submission's self-assessment as "untrusted"; expect the same here.
- Both vendor agents run sandboxed, often offline, and read-only when reviewing: Codex "agent phase runs offline by default"; Claude's Code Review works "without building or running your code"; Claude cloud sessions have network "limited by default". A screener that cannot fetch 60 MB of models or open WebGL relies on tests, CLI paths and screenshots.
- The ML Code Completeness Checklist finding applies: a README with a results table "accompanied by precise commands to run/produce those results" is the single strongest predictor of a repo being usable by a stranger.
- For this repo the biggest machine-visible risks are: no `hackathon-submission` tag yet (the required diff link is dead), a contract that is tested but not deployed (no on-chain evidence for an explorer check), a browser-only main path, and a README test count that must match what the agent sees when it runs the suites.

## Findings

### NEAR Hackathon 2026 rules (HACKATHON.md)
- Source: https://nearhackathon.com/HACKATHON.md (read 2026-11-08)
- Q-017: "Screening, not deciding: reproducibility check, feature verification, structured report, preliminary score."
- Procedure 1: README is "for a machine reader as well as a human one", with "do X - see Y" steps, "No marketing."
- Q-003: "Dedicated branch, or tags pre-hackathon and hackathon-submission, plus a README section linking the diff."
- Q-012: a "reproducible README" is required; a local-only demo is acceptable; "screenshots are not enough when judges cannot open the demo."
- Q-005: list libraries, templates and boilerplate; Q-014: LICENSE file, repository public through judging.
- The document does not define the report format, the score scale, or what "feature verification" runs.

### Devfolio, "How we built an AI hackathon judge while preserving human taste and judgment"
- Source: https://devfolio.co/blog/the-discerning-machine/ (read 2026-11-08)
- The agent gets the pitch (name, tagline, description, tracks, demo URL, answers) and enters the repo with `read`, `grep`, `ls`.
- Output is a markdown audit; its core is `claims_mismatches` with `file:line` citations; a cheaper model extracts JSON.
- "The aggregate score is computed deterministically in code." Each criterion is 0-10; "The decision stays with the human panel."
- Worked examples: Technical Execution 8 to 5 (RLS claim, policies only checked auth, writes bypassed via service role); Originality 7 to 4 ("custom architecture" was stock BERT); AI Depth up to 9 when the code did more than the pitch said.
- Failure modes named: incomplete exploration, bad evidence retrieval, "impressive-looking but trivial code", copied work, generated filler, hidden dependencies, demos that don't match the repo, timeouts, schema drift.
- A reviewer can check a cited claim "in about thirty seconds"; overrides are logged as product data.

### Devfolio, "The Synthesis: What happened when AI judged AI"
- Source: https://devfolio.co/blog/synthesis/ (read 2026-11-08)
- 685 submissions, 28 partner-built judge agents; every README was evaluated, shortlisted projects got a full code audit at "15-20 minutes per shortlisted project".
- Agents did code review, deployment checks and "cross-referencing README claims against what was actually deployed."
- "The agent proposed. The human decided." Visible rubric is what made the process "feel fair".

### Hugging Face, "What We Learned by Reproducing 2,200 papers from ICML" and challenge FAQ
- Source: https://huggingface.co/blog/icml-2026-open-reproductions (read 2026-11-08); https://icml-2026-agent-repro-challenge.static.hf.space/faq.html (read 2026-11-08)
- 1,221 participants with their own agents (Claude Code, Codex, Cursor, Pi); 6,816 logbooks; 2,226 papers; 35,908 claims judged.
- Per-claim verdicts: verified / falsified / toy / inconclusive. 266 papers fully reproduced; 496 (23%) had a falsified or contested claim; 502 toy-scale only; 280 inconclusive.
- "missing artifacts were the most common cause" of inconclusive results.
- The LLM judge was told to treat each logbook's self-assessment as "untrusted"; falsifications were re-verified by humans, and one was an arithmetic bug in the reproduction itself.
- Agents "misread scale-dependent behavior"; several "verified" verdicts came from checks that stopped too early.
- Logbook = write-up + the code that ran + artifacts + optional full agent trace; for runs: job URL, hardware, command, config, results. "A toy or synthetic proxy is appropriate only when the real setup is unavailable."

### ACM-style artifact evaluation: SPLASH 2026, ISSTA 2025, USI review form
- Source: https://2026.splashcon.org/track/splash-2026-artifact-evaluation (read 2026-11-08); https://conf.researchr.org/track/issta-2025/issta-2025-artifact-evaluation (read 2026-11-08); https://evaluate.inf.usi.ch/artifacts/aea/forms/artifact-review.html (read 2026-11-08)
- Functional = "documented, consistent with the paper, complete, and exercisable"; Reusable adds careful documentation and clear organization; Reproduced = reviewers replicate all significant claims. (The acm.org policy pages returned HTTP 403 on 2026-11-08; wording taken from these venue pages.)
- Kick-the-tires: reviewers "exercise the basic functionality of the artifact to ensure that it works"; installation plus sanity test "completable in about a half hour"; full evaluation "no more than a few hours"; steps longer than a few minutes should be flagged.
- Authors must state software versions, commands to run end to end, output locations and expected results, and "expected deviations".
- Claims list: for each claim, the paper reference, the artifact component that supports it, and the steps to evaluate it; the artifact "need not support every claim" but omissions must be justified.
- ISSTA: Getting Started must let reviewers "validate its general functionality" in "less than 30 min", with "expected outcomes with approximate times".
- USI form scores four aspects, "Consistent with the paper", "Complete", "Well documented", "Easy to reuse", plus a non-judgmental artifact summary, assessment, justification and suggestions.
- Packaging: VM or Docker recommended but "plain source code can work if installation steps are precise and tested on a fresh machine."

### artifact-eval.org guidelines (Krishnamurthi et al.)
- Source: https://www.artifact-eval.org/guidelines.html (read 2026-11-08)
- Make the claims about the artifact concrete, "especially where they differ from the paper's expectations", and note difficulties and maturity.
- "We are still going to evaluate the artifact relative to the paper." A demo video is "optional but welcome"; a screencast is a fallback when running is impractical.

### ML Code Completeness Checklist (Papers with Code) and NeurIPS checklist
- Source: https://github.com/paperswithcode/releasing-research-code (read 2026-11-08); NeurIPS 2021 checklist https://neurips.cc/Conferences/2021/PaperInformation/PaperChecklist (quoted from a search snippet, page not fetched)
- Five items: dependency spec, training code, evaluation code, pre-trained models, "README file including table of results accompanied by precise commands to run/produce those results".
- Repos with all five had the most stars (median 196 vs. far fewer otherwise), an indirect proxy for "a stranger could use it".
- NeurIPS: "The instructions should contain the exact command and environment needed to run to reproduce the results."

### ReScience C
- Source: https://rescience.github.io/write/ (read 2026-11-08)
- Two reviewers must have "managed to run the code and obtain the same results as the ones advertised"; if either cannot before the deadline, the submission is rejected.
- Failed replications are publishable if documented; the review is a public GitHub thread in "continuous interaction with the authors".

### Claude Code: best practices, Code Review, cloud sessions
- Source: https://code.claude.com/docs/en/best-practices.md (read 2026-11-08); https://code.claude.com/docs/en/code-review.md (read 2026-11-08); https://code.claude.com/docs/en/claude-code-on-the-web.md (read 2026-11-08)
- "Claude starts every task by reading your code"; it finds "your file layout, your conventions, your test framework" itself.
- The most useful line in `CLAUDE.md` is "the command that runs" the check; "ask Claude for evidence: the command it ran and its output, or the screenshot."
- Checks Claude can read: a test file, a typecheck, a browser screenshot next to a mockup; "All tests pass" alone "tells you very little".
- Code Review pipeline: Find, Verify ("checks the candidate findings against the code and filters out false positives"), Rank, Post; it "works from reading the diff and the surrounding code, without building or running your code"; it never approves or blocks.
- Cloud sessions: isolated VM, "network access is limited by default and can be disabled"; a setup script is cached only when it finishes in about five minutes.

### OpenAI Codex: GitHub review and sandbox
- Source: https://learn.chatgpt.com/docs/third-party/github (read 2026-11-08); https://learn.chatgpt.com/docs/agent-approvals-security.md (read 2026-11-08)
- "Codex reviews the pull request diff, follows your repository guidance" and applies `## Code Review Rules` from `AGENTS.md`; it flags only P0/P1 with `[P1]` tags and file:line.
- "By default, the agent runs with network access turned off." Cloud tasks run in "isolated OpenAI-managed containers"; setup can use the network, "the agent phase runs offline by default".
- Review rules "don't replace tests, branch protections, or required approvals."

### NEAR reproducible builds and explorer verification
- Source: https://docs.near.org/smart-contracts/anatomy/reproducible-builds (read 2026-11-08)
- Verification needs `repository` in Cargo.toml, `[package.metadata.near.reproducible_build]` with a pinned `image`, `image_digest` and `container_build_command` ending in `--locked`.
- A third party reads `near view <contract> contract_source_metadata` and the NearBlocks Contract Code tab after "Verify and Publish". No deployed account means none of this can be checked (inference: the screener then falls back to `cargo test` and reading the contract source).

### LLM-as-judge for code (literature)
- Source: https://arxiv.org/html/2510.24367v1 "From Code to Courtroom" (search snippet, not fetched); https://arxiv.org/html/2411.15594v6 (search snippet)
- Execution-based checks are preferred but "hindered by test-case incompleteness, environmental drift, and high infrastructure demands"; agentic judges add "file system interaction, code execution, static linting, unit testing". Inference: a screener will run what runs cheaply (unit tests, a CLI) and read the rest.

### Devpost and lablab.ai
- Source: searches on 2026-11-08 found no official Devpost AI-judging feature announcement; lablab rule book https://lablab.ai/hackathon-rules (search snippet) scores 1-5 and puts "Github is not available" or no demo link in the lowest band.

## Twenty checks a screener would run on this repository
| # | Check | Pass evidence | Fail evidence |
|---|---|---|---|
| 1 | Repo is public, has LICENSE, README is English and opens with what the product is | `LICENSE` present (MIT); README first lines state product and problem | 404 on clone; no LICENSE; marketing before substance |
| 2 | Pre-hackathon baseline provable: tags `pre-hackathon` and `hackathon-submission` exist, compare link resolves | `git ls-remote --tags` shows both; GitHub compare page returns a diff | Only `pre-hackathon` on the remote (state on 2026-11-08); compare URL 404 |
| 3 | Toolchain stated and pinned: Node version, Rust channel, lockfiles | `game/package-lock.json`, `Cargo.lock`, `engines` in `package.json`, CI `node-version: 22`, `rust-toolchain.toml` | No `.nvmrc`; `rust-toolchain.toml` says `channel = "stable"` (unpinned); server has no lockfile (has no deps, so acceptable if README says so) |
| 4 | `cd game && npm ci` on a clean clone, offline-tolerant | Exit 0 within minutes using only the registry | Postinstall needs network outside the registry, native build, or fails on Node 20/22 |
| 5 | `cd game && npm test` exits 0 and the count matches README | Output `# pass 349`, `# fail 0`; README says 349 | Count differs from README; skipped tests; flaky parity tests |
| 6 | `cd server && npm test` exits 0 and matches README (28) | `# pass 28` | Tests need `../game/node_modules` but README does not say install game first |
| 7 | Agent API path without a browser: `npm start` then `node examples/agent.mjs --time-scale 1000` | Server logs listening on 127.0.0.1:8787; agent plays a session to its end with the output README describes | Port clash, token required, example references a flag or file that does not exist |
| 8 | OpenAPI and catalog reachable: `curl /v1/openapi.yaml`, `/v1/actions` | 200 with YAML/JSON; schema matches README | 404; mismatch between catalog and README feature list |
| 9 | `cargo test --lib` in `contracts/season-commit` | `test result: ok. 56 passed`; same number in README | Needs `wasm32` target or network crates not vendored; count differs |
| 10 | Contract build: `cargo near build non-reproducible-wasm --no-abi` | `target/near/season_commit.wasm` produced in CI (`contracts.yml`) | cargo-near missing and README does not say it is optional |
| 11 | Deployment claim vs. chain: any address in README exists on testnet explorer | Account exists, `contract_source_metadata` readable | README says "not deployed": pass only if every sentence about on-chain verification is hedged the same way (inference) |
| 12 | README claims grep-able in code: Merkle proof check, commit-reveal, NEP-297 events, "Verified" label | `grep -rn` finds the functions and tests named in the real/mock table | A claimed feature has no code path or only a TODO |
| 13 | Real/mock table consistent with code | Each "mock" row has a labeled stub in code; each "real" row has a test | A "real" row with no test or a mock presented as live |
| 14 | CI status: workflows exist and the latest run on `main` is green | `.github/workflows/pages.yml`, `contracts.yml`; `gh run list` shows success | Red or no runs; README has no badge or link to runs |
| 15 | Live demo URL responds and matches the published build description | HTTP 200 on the Pages URL; `index.html` references the built assets | 404; Pages points at a stale build; demo differs from repo HEAD |
| 16 | Browser path is testable headlessly in some form | Screenshots or a video of the six "do/see" steps; tests cover the same logic without WebGL (README: "3D client logic (no WebGL needed)") | Only a WebGL walkthrough; no screenshots; 60 MB download blocked by sandbox |
| 17 | Third-party code disclosed (Q-005) and matches lockfiles | README library list equals `package-lock.json` and `Cargo.lock` top-level deps | Undisclosed template or copied engine |
| 18 | Git history: real work after `pre-hackathon`, no giant single commit of pre-built code | Many commits with messages, dated inside 1-14 Nov 2026 | One squash commit importing a finished product; pre-hackathon tag on a near-complete game |
| 19 | No secrets, wallets or paid services needed to run | `.env` not required; no private keys; README says "No token, no paid entry" | Tests or demo need a funded account or API key |
| 20 | README references resolve: every file, script, URL and doc link exists | Link checker and `ls` on each path pass | `docs/...` or `examples/...` referenced but missing; `?demo=judge` route absent |

## What helps the screener in a README
- Verbatim commands in fenced blocks, one per line, run from the repo root with explicit `cd`, in the order a fresh clone needs them (SPLASH 2026, NeurIPS checklist).
- An expected output after each command, quoted literally (`# pass 349`, `test result: ok. 56 passed`), plus an approximate time (ISSTA: "expected outcomes with approximate times").
- A claims table with three states (works / partial / not done) and the file or test that backs each row: this is the object Devfolio's agent builds anyway, so pre-building it removes guesswork and lets the human check a row "in about thirty seconds".
- A real/mock table that uses the same words the code uses, so `grep` confirms it.
- Exact toolchain: Node major, Rust channel, cargo-near version, OS caveats (Windows path for the contract tests already exists in README).
- A no-browser path first for machines, the browser path for humans; say explicitly which path needs WebGL 2 and roughly 60 MB.
- A link to the CI runs and to the compare view `pre-hackathon...hackathon-submission`, both live.
- Test counts that are regenerated right before tagging; an agent that gets 348 or 351 will write "count does not match README".
- "What is not done" stated in plain words near the top (artifact-eval.org: make claims concrete "especially where they differ from the paper's expectations").
- Short screenshots or a video for anything a headless agent cannot see (Q-012: "screenshots are not enough when judges cannot open the demo", so a video of the six steps is the fallback that still counts).

## Red flags that lower a preliminary score
- Any README sentence a `grep` cannot find support for, especially security or on-chain claims (Devfolio's RLS example: 8 to 5).
- A dead compare link or a missing `hackathon-submission` tag: the baseline rule (Q-003) cannot be verified, so the whole diff is "unverified" (inference from the rules).
- Test counts, routes, flags or filenames in the README that differ from the repo at HEAD.
- Tests that are skipped, commented out, or need a resource the sandbox lacks without a documented fallback.
- Unpinned toolchain (`stable`, `latest`, no lockfile) combined with an install that breaks on the current default.
- A hosted demo that requires a browser capability (WebGL 2) and offers no tests, CLI or recorded evidence for the same features.
- Large downloads on the critical path with no size warning and no smaller path.
- "Coming soon" features in the main feature list rather than in a clearly separated roadmap.
- Hard-coded demo data presented as live (deployed, on-chain, multiplayer) without a label.
- Marketing language, superlatives, or a pitch that describes a larger product than the code (Devfolio: "custom architecture" that was stock BERT, 7 to 4).
- Non-English docs or mixed languages in the primary path (the rules require the README to be machine-readable; inference: an agent will still read it but humans on the panel may not).
- Pre-hackathon code that is most of the product, with hackathon work limited to cosmetics.
- Secrets or a funded wallet required to run anything.

## Implications for Forget to Foresee
- The six-step judge table is the right shape ("do X, see Y" with literal HUD values), but it is browser-only and needs WebGL 2 plus about 60 MB; a sandboxed screener will likely not execute it (Codex "agent phase runs offline by default"; Claude cloud "network access is limited by default"). Keep it, and add the evidence a headless agent can use: a screenshot per step or the demo video, linked next to the table.
- The agent API path (`cd server && npm start`, `node examples/agent.mjs --time-scale 1000`) is the path a machine will actually run. Make it the first thing after the one-line pitch, state what the terminal prints at the end, and make sure the example needs nothing the sandbox lacks (no network, no wallet).
- Test counts 349 / 28 / 56 are strong evidence only while exact; re-run all three suites immediately before the `hackathon-submission` tag and update the README in the same commit. The README's line "the breakdown below is the 260 of the first measurement; 89 were added" is honest but reads as drift; a single current breakdown is safer.
- `rust-toolchain.toml` pins `channel = "stable"`, not a version, and there is no `.nvmrc`; CI uses Node 22 and `engines` says `>=20`. Stating "tested with Node 22 and Rust 1.xx (`rustc --version`)" in the README costs one line and closes check 3.
- The contract is tested but not deployed, so check 11 has nothing to verify on an explorer. The README already says "not deployed" and the real/mock table says the game never claims "verified on-chain"; keep every mention hedged identically. If a testnet deploy happens before the deadline, add the account id, a `near view ... contract_source_metadata` line and the NearBlocks link; otherwise state once that on-chain verification is out of scope and point to the 56 tests and CI.
- Only `pre-hackathon` exists on the remote; `hackathon-submission` is required by Q-003 and the README compare link is dead until it is pushed. Tag on the final `main` commit and check the compare URL returns a diff.
- No CI badge or link to workflow runs in the README; add links to the two workflows' run pages so check 14 is one click.
- The live demo on GitHub Pages is a plus under Q-012 but must stay up to 2026-11-18 (ideally 2026-11-25); the demo video is not shot yet and is the fallback evidence when a judge cannot open the demo. Shooting it against the six-step table makes the video and the table verify each other.
- The real/mock table already uses the vocabulary a grep-based screener needs (mock AI, real cryptography local, mock NFTs). Keep the same words in code comments and test names so each row is grep-confirmable.
- Pre-building the claims table (claim, status, file or test) in the README mirrors what the Devfolio-style agent produces; it reduces the chance that an incomplete exploration marks a working feature "unverified".
