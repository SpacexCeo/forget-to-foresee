# NEAR Hackathon — submission checklist

Source: https://nearhackathon.com/HACKATHON.md (re-read before submitting; it can change).

## Dates (Kyiv, UTC+2)
- Code counts from 19.10.2026.
- **Submission deadline: 15.11.2026 01:59** (14.11 23:59 UTC).
- Judging from 16.11, results by 19.11. The repository must stay public throughout judging.

## Required
- [ ] A working prototype, not a pitch (Q-012).
- [ ] Public repository by the deadline + LICENSE (MIT) (Q-013–014).
- [ ] README: what works, how to reproduce from a clean environment, the real/mock boundary (Q-012).
- [ ] Baseline: tags `pre-hackathon` and `hackathon-submission` with a diff link; list libraries, templates and AI-generated code (Q-001–005).
- [ ] Post on X: "built at NEAR HACKATHON", @NEARProtocol, #NEARHackathon, **video** (the demo is local) (Q-012).
- [ ] A concrete NEAR role: an own contract that fits the track is enough (Q-011).
- [ ] Form https://nearhackathon.com/#apply: name, lead, email, team size, tracks, mainnet NEAR payout address, repo, demo post, description of 20–2000 characters (Q-015).
- [ ] One submission per project. A person may be in at most two projects; then both READMEs link to each other (Q-015).

## How judging works
- First layer: AI screening (Claude Code and Codex) checks that it runs and that claimed features exist. Humans decide (Q-017).
- So: exact commands, expected output ("do X → see Y"), tests, no secrets in the repo.

## Candidate tracks
- **games** — the economy is part of the game loop, not a token for its own sake.
- **nfts** — an NFT as an account or asset with behavior.
- social — collective ownership and a shared budget (if co-owned clans make the MVP).

## Working rules for the repo
- Small commits with clear messages after each finished step; push right after committing.
- No keys or secrets: only `.env.example`.
- Never claim in the README what does not run.
