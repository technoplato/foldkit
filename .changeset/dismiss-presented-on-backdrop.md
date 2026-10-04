---
'@foldkit/react': patch
'@foldkit/svelte': patch
---

A click on the dimmed backdrop around a presented screen, such as a Sheet or a "Delete the bookmark?" Dialog, now goes back one entry through `Navigation.backOneEntry`, the same as Escape. A click inside the sheet itself still does nothing to it. React's `NavigationFrame` and Svelte's `NavigationFrame` both do it, so `/books/the-lantern-keeper/contents` closes to `/books/the-lantern-keeper` on a click outside.
