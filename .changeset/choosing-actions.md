---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/svelte': patch
---

An Action can ask for its one field instead of listing every value. `Catalog.action(tag, { fields, choose })` declares the question, the choices the Model offers now (each with its own availability and detail), the preferred choice a bare press or key takes, and the sentence when there is nothing to choose. The Action stays one entry: the action menu shows `Decrement counter ›` and opens a nested step that asks "Which counter?" (`menu.choose=DecrementCounter` in the URI, Escape or Backspace goes back), a button presses `DecrementCounter:3`, a key on a counter's page takes that counter, and the CLI reads `decrement-counter <counter-id>` with its choices and an example, refusing a bare `decrement-counter` with `needs one of: 1, 2, 3`. `Entry` gains `maybeChoices`, `MenuRow` gains `isNested`, and `Catalog.entriesFor` and `Catalog.choicesAsEntries` project the choices for screens and the menu. The row helpers added earlier in this release (`rowEntries`, `rowTagOf`, `parseRowTag`) are replaced by `choiceTagOf` and `parseChoiceTag`.
