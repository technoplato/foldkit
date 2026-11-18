---
'foldkit': patch
'@foldkit/react': patch
'@foldkit/svelte': patch
---

Fixes and polish for the new screen nodes:
- `Catalog.within` now types its Actions from the child's own struct, so `SeekTo({ placeMs })` from a parent is the child's `SeekTo`.
- A pressed key goes to the Action that is offered for it. A choosing Action counts as offered only while its preferred choice is, so on a title that's already in the player, `p` reaches the player's Play instead of a disabled "play this title".
- The transcript scrolls inside its own area, so the seek bar and transport above it stay on screen while the sounding word stays in the middle.
- Session's Back and Session settings buttons paint as quiet Ghost pills.
- A nested column fills its parent, so a list keeps its full width under a page header.
- Row items center against each other.
