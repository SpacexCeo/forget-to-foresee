# Task C report: decision table in `docs/decisions.md`

Done:
- Split the glued §4 row ("P2 and P8 approved" `||` "Strict rule: the repository and the game are English-only")
  into two rows.
- Moved the 27 header-less rows from the end of §7 "Environment notes" into the §4 table; §7 is bullets only now.
- Sorted the §4 table by date (stable: rows with the same date keep their relative order). 64 rows: 07.11 first,
  then 08.11.
- Escaped the pipe in `` `?tex=full\|m` `` (row "Phone crash on entering a Shell fixed"): GFM splits table cells on
  `|` even inside code spans, so the rest of that row was cut off. It still renders as `?tex=full|m`.

Not changed: any wording.

How it was checked:
- A script compared the old and new files line by line as multisets (the split row counted as two lines): identical.
- Every row has exactly two cells; dates are non-decreasing.
- Rendered with markdown-it 14.1.0 (CommonMark + GFM tables): one `<table>`, header + 64 rows, 2 cells each,
  no table row left as a paragraph.
