---
'foldkit': minor
'@foldkit/opentui': minor
---

Terminal hosts now navigate. `Navigation.frameOf` returns what a single-surface host paints: the URI, the base screen, and each entry presented over it, and `Navigation.layersOf` splits a plan the same way. The program CLI surface paints that frame and adds `open <uri>`, `back`, and `where`. `@foldkit/opentui` adds `paintOpenTuiNavigationFrame`, and `runOpenTui` paints the frame for a Program with a URI and takes a `launchUri` it opens once the Program is Ready. A Program without routes now ignores `OpenedUri` and `NavigatedBack` instead of parsing them into a NotFound root.
