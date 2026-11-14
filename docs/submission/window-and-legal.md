# Hackathon window and legal wording

- **What was built when.** Every commit in the repository is dated 7–14 Nov 2026, inside the hackathon window
  (1–14 Nov). The first commit is the empty baseline of 7 Nov (tag `pre-hackathon`); 0 commits before 1 Nov
  (`git rev-list --count --before=2026-11-01 origin/main` → 0 on a full clone). Nothing was built before the
  hackathon: no template, no earlier code. Commits a day (13.11): 7 Nov 121, 8 Nov 369, 9 Nov 258, 10 Nov 109,
  11 Nov 284, 12 Nov 659, 13 Nov 190 (`git log --format=%ad --date=short origin/main | sort | uniq -c`).
- **Testnet only.** All contracts and accounts are on NEAR testnet. Nothing in the game has real-world value.
- **Silk.** In-game only. Play silk (the free daily wheel) cannot be bought, cannot be cashed out and cannot open the
  Gate-Loom. The live build has no game of chance with stakes (the dice tab is off since 15.11).
- **AI.** Which characters are a model and which are scripted: README "What is AI, what is scripted".
