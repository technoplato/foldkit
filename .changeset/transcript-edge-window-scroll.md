---
'foldkit': patch
---

The HTML painter's Transcript edge now brings a word to the middle by scrolling the window itself, in place of `scrollIntoView`. In Chromium `scrollIntoView` moves where Tab starts from, so with nothing focused the next Tab skipped everything above the Transcript. The word lands in the middle of what the page's `scroll-padding-top` and `scroll-padding-bottom` leave free, as `scrollIntoView` with `block: 'center'` put it. Under `prefers-reduced-motion: reduce` the scroll, in the window or in the Transcript's own scroll area, jumps with no animation.
