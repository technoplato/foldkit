---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/react-native': patch
'@foldkit/opentui': patch
---

Navigation fixes from a second review round. `parseStack` reads a URI of more than 32 segments as one NotFound root, so a crafted URI can no longer exhaust the stack or take seconds to parse. A route's `isAllowedAbove` now reads every Destination beneath it, root first, so the Session page and the action menu each appear once in a stack, whatever a URI says, and opening the menu while one sits beneath a pushed page returns to it. `ProgramInteraction.menuKeys` declares the keys that open the action menu, `Interaction.isKey` matches a key press against one, and `Interaction.menuHintOf` turns them into a terminal hint, so the program TUI and OpenTUI both show `[?] actions` without naming the key. React Router's navigator loads a URI that is not the Program's as a page instead of opening it as NotFound. Native stack headers show an empty title rather than the route name for an entry without one. `useDeepLinks` keeps only the latest link waiting while the Program starts. The CLI refuses `open` without a URI by its words, not an empty string.
