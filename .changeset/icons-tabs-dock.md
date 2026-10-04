---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/svelte': minor
'@foldkit/react-native': minor
'@foldkit/opentui': minor
---

Screens can now have icons, tabs, and a bar pinned to the bottom:

- A Button takes an `icon` from a shared set: Play, Pause, Back30, Forward30, PreviousChapter, NextChapter, Chapters, Speed, Bookmark, Share, Expand, Collapse, Close, Library, Profile, Settings, and More. The web paints it as an SVG from `iconDrawings` and terminals as a glyph from `iconGlyphs`. With `isIconOnly`, the label is left for screen readers.
- A `Tab` variant with `isCurrent` makes a set of places, such as Library and Profile.
- `Dock(...)`, a Box with `isDock`, pins its children to the bottom of the screen, such as a now-playing bar above the tabs. The web leaves room for it at the end of the page, and a terminal draws it last under a rule.
- A Seek can start at a `min`, so a bar can span one chapter.
- Hover styles now apply only where a pointer can hover, so a tapped button on a phone doesn't stay highlighted.
- List row buttons are at least 44px.
