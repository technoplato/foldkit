---
'foldkit': minor
'@foldkit/react': minor
---

A Text can show a live view from another site in place of its words, such as a book's preview from Google Books:

- `Text(words, { embed: { kind, params, width, height } })` names the view by its `kind` and the strings it reads, such as the volume and the page. A painter with no view of that kind shows the words instead, as a link when the Text has an `href`, so terminals and the other painters keep working unchanged.
- In React, `EmbedPaintersProvider` gives every painted tree the host's views by kind, and a Text with an embed keeps its view mounted while the lines around it come and go.
