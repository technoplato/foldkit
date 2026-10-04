---
'foldkit': patch
---

A CLI command can carry an open value: `books seek-to 723000` presses `SeekTo:723000` even though no listed choice says 723000. The Action's own `accepts` rule decides, and a refused value still says which choices it offers.
