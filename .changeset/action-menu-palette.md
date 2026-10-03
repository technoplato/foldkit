---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/svelte': minor
'@foldkit/react-native': patch
'@foldkit/opentui': patch
---

The action menu now describes everything a Client paints, so every Client shows the same menu with no text or matching of its own. `MenuView` adds `title`, `filterLabel`, `summary` (`3 actions`, or `No actions match “zz”` for a screen reader), and `hints`, the keys that work right now (`esc` reads `close` from the search and `back to search` from a row). Each `MenuRow` adds `title` (the tag as words, `Open session settings`), `description`, both as `TextRun`s that mark the letters the query matched, and `keys`, the shortcut shown beside the row. Matching ranks a title, tag, or label prefix first, then a substring, then the query's letters in order through the title, then a substring of `what`, so `rs` puts Reset above a row whose description says `first`. Up from the search jumps to the last row, so Up and Down both reach every row from the search. `Interaction.menuStylesheet` is the web look, a command palette with a dimmed backdrop, marked matches, key caps, and a footer of hints, wrapped in `:where()` so an app's own rule wins. `paintMenuHtml`, React's `ActionMenuPanel`, and Svelte's `ActionMenuDialog` paint it and add the stylesheet themselves; React's panel also gains a backdrop that closes the menu and scrolls the highlighted row into view. React Native and OpenTUI paint the same titles, marks, and summary.
