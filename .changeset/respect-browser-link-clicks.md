---
'foldkit': minor
---

The router now leaves link clicks alone when the user is asking the browser to handle them. Cmd/Ctrl/Shift/Alt-click, middle and right-click, links with a `target` other than `_self`, and links with a `download` attribute all behave the way the platform does outside an SPA. Clicks whose default has already been prevented by an app-level handler are also left intact.

Previously, every primary-button click on an `<a>` with a non-empty href was captured and dispatched as a `UrlRequest`, so opening a link in a new tab or downloading a file silently did nothing.
