---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/svelte': patch
---

A screen can keep one identity while its address moves. A screen's `identityOf` returns its Destination with the fields that pass reset, such as a player's place. Every stack entry and frame layer carries an `identity`, printed from those reset Destinations next to its `key`. The React frame and the Svelte overlays key by `identity`, so a player whose address follows its place (`/books/a-new-earth/listen/1h41m05s`, then `…/1h41m06s`) keeps its DOM, its scroll, and its images instead of being rebuilt every second.
