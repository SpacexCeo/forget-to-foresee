# GPU server archive, 11 Nov 2026 ~23:40 Kyiv

Snapshot of the rented RTX 5090 server (night of 11→12 Nov), so nothing exists only on the server.

- `board/`: the GPT board (board.md, refs/, renders/).
- `blends/`: every .blend changed in the last 25 h, de-duplicated by content (`<path>_<md5-12>.blend`).
- `repos/<clone>/`: branch, HEAD, unpushed commits (all already on GitHub at archive time), diff.patch and
  modified/untracked files (`files.tgz`) of each working clone on the server.
- `work/elise4-heroine2.tgz.part-*`: Elise v2 / heroine work folders without .blend (join with `cat part-* > x.tgz`).
- `logs/work-notes.tgz`: logs, json, md and py notes from the work folders.
