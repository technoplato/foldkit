---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/svelte': patch
'@foldkit/react-native': patch
'@foldkit/opentui': patch
---

A screen can take typed words and tick a row. `TextInput` gains `action`, `clearAction`, and `label`: submitting the field presses its Action with the trimmed text as the choice, so typing `Buy milk` and pressing Enter in a field whose action is `AddReminder` presses `AddReminder:Buy milk`. A field that adds, empty and with no `clearAction`, submits on Enter and empties for the next entry; a field that edits, such as a title, also submits when a person leaves it after a change, and submitting it empty presses its `clearAction`, such as `ClearNotes`. `submittedTagOf` from `foldkit/renderers` decides what a submission presses, the same in every painter. A `ListItem` gains `check`, a box at the row's start such as a reminder's completion circle: pressing it presses its own `action`, `Complete:7e1f04c2-…`, and `isChecked` shows it ticked. React, Svelte, React Native, and the Foldkit HTML painter draw a round checkbox and a field that holds what is typed until it is submitted; terminals draw `[ ]` and `[x]` as their own pressable box, which the highlight visits before the row, and a field that presses as `[ New reminder ]`. The web look sets text fields at 16px or more, so iPhone Safari does not zoom into them.
