---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/instant': minor
'@foldkit/instant-tools': minor
---

The renderer vocabulary gains `RichText` (plain parts and reference chips with a label, title, state, link and hover detail) and `Box` layers (a dialog or side panel with a dismiss), and lists gain a board layout (`Row.isBoard`), draggable rows (`ListItem.isDraggable`, `ListNode.dropAction`) and an extending check (`ItemCheck.extendAction`). React and HTML painters draw them; terminal and native painters fall back to the words. `hostedIdentity({ session })` mints for a second Instant app. A catalog observed from Instant decodes only the records that changed.
