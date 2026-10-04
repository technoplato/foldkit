---
'foldkit': minor
---

A link that opens the app now works while Session mirrors navigation. A launch at the Program's home, such as `/books`, still joins the shared stack. A launch that names a page beyond it, such as `/books/a-new-earth/listen/12m03s`, moves the shared stack there, so a link someone sends opens what it names on every mirrored device. `adoptsLaunch` now receives the launch URI as its second argument.
