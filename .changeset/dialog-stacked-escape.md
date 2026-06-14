---
'foldkit': patch
---

Fix Escape and Tab handling when more than one Dialog is open at once. Only
the topmost dialog now responds, so Escape closes stacked dialogs from the top
down and focus stays trapped in the frontmost dialog.
