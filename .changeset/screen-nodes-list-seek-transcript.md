---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/svelte': minor
'@foldkit/react-native': minor
'@foldkit/opentui': minor
---

Four new screen nodes, painted by every Client:
- `List` holds rows a person picks from, such as a library's books. Each row has a picture, a title, lines under it, an optional progress bar, a press for the whole row, and trailing buttons.
- `Progress` shows how far along something is.
- `Seek` is a seek bar. Letting go presses `SeekTo:<value>` once, so dragging never restarts the audio at each step.
- `Transcript` holds passages of words to read along with. The word sounding now is marked, a press on a word sends `SeekToWord:<id>`, and a press on a passage's time sends its `labelAction`.

On the web, the transcript keeps the current word near the middle of the window and lets a person scroll away to read ahead. Terminals draw the seek and progress bars as lines (`seekLineOf` and `progressLineOf` from `foldkit/renderers`), indent each passage under its time, and bracket the current word, `[million]`. Terminal focus moves through list rows and their buttons, so a row's Action key acts on the highlighted row.

Text gains the `Headline` emphasis for a screen or section title. Buttons now paint their `variant`: `Primary` and `Ghost` are pills, and `Destructive` is red. A Button without a variant keeps the Counter's look. A presented panel scrolls when it's taller than the window.
