---
'foldkit': patch
---

A screen's `isAllowedAbove` in `Navigation.screens` now reads every screen beneath it, root first, of any kind the declaration lists, as its docs said. Before, each rule saw only screens of its own kind, so a rule such as "the player sits only on the library or a title's page" saw nothing and allowed everything: `/books/the-lantern-keeper/chapter/2/listen` parsed, and Multiple Counters' "Delete Counter 3?" rule never ran. `pushScreen` and `presentScreen` take `ScreenOptions`, whose `isAllowedAbove` receives the screens beneath as `unknown`, so a rule reads them with any Destination's `S.is` guard.
