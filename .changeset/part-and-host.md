---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/react-native': minor
---

A part is declared once in `foldkit/behavior`, and each painter hosts any part through one host.

`foldkit/behavior` gains `Part` (`define`, `compose`, `given`, `view`, `bindingOf`, `configure`, `synchronizationOf`), `Slot` (the binding the screen tree carries to a painter), `Gesture` (the closed list a painter translates its events into), `Host` (`plan`: what one platform listens for), `Block`, `LongPress` (a hold as a `Machine.define` chart whose state is in the Model and whose waits are Commands), `Placement` (`place`: where a menu goes by its anchor), and `Pace` (how a Message reaches the log: `Synced`, `Settled`, `Sampled`, `Device`). `Command.answerAfter` is the wait a chart returns. `ProgramSynchronization` gains an optional `paceOf`. `foldkit/test` gains `Shelf`, the made-up Program the painters' gesture tests share.

On the screen tree, a `Button` and a `ListItem` take `slot`, a `Transcript` takes `wordSlot`, and all three take `hold`. `menuAction` and `wordMenuAction` still work and mean the same binding.

Breaking, for a page painted with the HTML painter or `@foldkit/react`: a hold with a finger no longer asks for a row's or a word's menu unless the Program carries the hold, since no painter keeps a timer. Wrap the Program once, `Part.compose({ of: MyProgram })`, or keep `LongPress.State` in the Model and fold `LongPress.chart`. The second button and the phone's own hold work as before. `listMount` and `listMountName` are removed from `foldkit/renderers/html`; a painted List carries `slotHostMount` in their place.

`ActionMenu.compose` takes what it tells sync from `Part.synchronizationOf`, and `ActionMenu.sync` says how each of its Messages syncs.
