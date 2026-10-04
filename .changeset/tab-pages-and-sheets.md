---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/svelte': minor
---

Tab pages, sheets, and docked player controls read better on a phone:

- `Session.compose` takes `isTab`, the pages a tab bar reaches, such as a Profile page. They show no Back button, since the tab bar is the way out.
- The Back button shows a chevron, the new `Back` icon, and sits at the top left.
- A sheet leaves a strip of the page above it, so a tap outside closes it, and it opens on its current row: a chapter list opens with the chapter playing in the middle and the keyboard on it.
- A list's current row scrolls to the middle when the list first paints, and into view when it becomes current later.
- A row of Ghost buttons with one marked current paints as a segmented control, such as Chapter | Whole book, or the speeds.
- In the dock, a labeled icon button stacks its label under the icon, a row of text spreads across, and the seek bar keeps a margin.
- A dim line right before a list heads it, bold and left-aligned, such as "Continue listening".
- List row titles wrap to two lines, and the transcript fits above the dock.
