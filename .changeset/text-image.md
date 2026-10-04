---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/svelte': patch
'@foldkit/react-native': patch
---

A Text can show a picture: `Text('The Lantern Keeper cover', { image: { src, width, height } })` paints an `img` in React, Svelte, and the HTML renderer and an `Image` in React Native, inside its link when it has `href`, with the words as alt text. Terminals and painters that do not know pictures show the words, so a cover reads `The Lantern Keeper cover` in the TUI. The web look gives `.fk-image` rounded corners and a soft shadow. `TextImage` is the new type.
