---
'foldkit': patch
---

`foldkit/cli/program` now also exports `paintTerminal`, `initialTerminalView`, `TerminalPaint` and `TerminalView`, so a browser page can paint a Program's live terminal UI as text beside its printed CLI screen: `paintTerminal(bound, 'counters', initialTerminalView, { rows: 20, columns: 72 }).lines`. The Client Matrix paints its terminal cells this way, from the Program itself.
