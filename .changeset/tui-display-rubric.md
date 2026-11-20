---
'foldkit': patch
---

Clean up the terminal TUI display: calm `Transcript` views via `transcriptExcerptOf` with surrounding paragraphs in `QuietText`, keep hour-long timestamps in their own spaced column, reserve `Accent` for pressable controls (keeping headings bold uncolored `Text`), paint `Focus` with bold inverse instead of faint light blue (including the active action menu row), stop `List` inside a `Row`/`Toolbar` from hiding sibling dock controls, forward `COLORFGBG` from `runCliTuiView`, and allow hosts to supply a 1-to-2 line pinned header via `headerOf`.
