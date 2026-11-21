---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/react-native': minor
---

Add synced screen focus (`Session.Focused`) paced with `Pace.Settled({ afterMs: 150 })` across TUI, Web, Phone, and `books tail`; stop `ArrowLeft`/`ArrowRight` in terminal focus from stealing enabled Catalog shortcuts such as ReadAloud page turns; and add `Navigation.launchUriOf` so browser reloads and bfcache restores reconcile to the synced Program stack instead of dispatching an unpressed `OpenedUri`.
