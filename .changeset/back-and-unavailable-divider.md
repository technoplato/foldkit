---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/svelte': patch
'@foldkit/react-native': patch
---

Every Program composed with `Session.compose` can go back on every host. The new `GoBack` Action (`Back`, key Escape) returns to the screen beneath the top one, and the top pushed page shows it as a Back button, so OpenTUI and the TUI go back from `/counters/3` to `/counters` without a browser. It is unavailable on the first screen ("this is the first screen"), and the action menu does not count as a screen to go back from. The action menu now lists unavailable Actions after the available ones, under a hairline: `MenuRow` gains `isFirstUnavailable`, the web styles and React Native draw a thin line above that row, and terminals print a `────` line. `ActionMenu.isActionMenu` is exported.
