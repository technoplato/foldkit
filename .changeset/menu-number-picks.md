---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/svelte': patch
---

The open action menu numbers its first nine rows that can run, and Command (Control off a Mac) with that number runs the row, the way Raycast does: `⌘K`, then `⌘3` asks "Decrement › Which counter?", then `⌘2` decrements Counter 2. `MenuRow` gains `maybePick`, `Interaction.pickShortcutOf(3, 'Mac')` reads `⌘3`, and the web menus show it on each row. A Program never takes a chord the browser owns: `Interaction.isBrowserOwnedChord` names zoom (`⌘+`, `⌘-`, `⌘0`), reload, tabs and windows, the address bar, find, print, save, bookmarks, history, editing, and back and forward, and a bound Program refuses them so the browser keeps them. Command with an Action's key no longer opens that Action's choices.
