---
'foldkit': minor
'@foldkit/opentui': patch
---

The TUI and OpenTUI move a highlight across a screen's buttons: the arrows and Tab move it (Up and Down change row and keep the column), Enter presses it, and an Action's key acts on the highlighted row, so with Counter 2's `+` highlighted, `r` resets Counter 2 and `d` asks "Delete Counter 2?". A dialog takes the keyboard with its first button highlighted, labels each button with its keys (`[ Delete (y) ] [ Cancel (n) ]`), and returns the highlight to where it was when it closes. `Interaction.pressTerminalKeyAt`, `terminalFrameOf`, `focusedTagOf`, and `TerminalFocus` hold it in core; the text TUI marks the highlight `[>-<]`, and OpenTUI draws a heavy border. `ButtonNode` gains `focused`, and the terminal footer names `[↑↓←→] move  [↵] press`.
