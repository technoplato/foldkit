---
'foldkit': patch
---

A terminal keeps a player's words in view: a page pushed above another still highlights its first button at once, unless it follows something that moves, such as a Transcript's current passage, so the player shows the words being spoken until the first arrow instead of jumping to its Back button. A daemon keeps a terminal UI's highlight and scroll per view, by the `viewId` each `runCliTuiView` sends, so every `books tui` starts fresh and two can be open at once. `paintCommands` keeps its command column at most 30 wide, puts what an over-long command does on the next line, and leaves out a choice's title when it only repeats the command, so `books listen small-hours` stands alone.
