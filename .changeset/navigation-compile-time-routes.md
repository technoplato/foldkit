---
'foldkit': minor
'@foldkit/react': minor
---

A Destination without a route is now a compile error instead of a runtime one. `Navigation.screens({ slug, root, screens })` builds the Destination from its screens, so each screen carries its own route: `Navigation.pushScreen(Settings, Route.literal('settings'))` adds the Destination and its route together, and a route whose Biparser drops one of the screen's fields does not compile. `Navigation.make` now takes `routes` as a record keyed by tag (`{ Counter: ..., Settings: ... }`) instead of an array, so a Destination member without a key does not compile. Navigations are branded: only `make`, `screens`, and the combinators produce one, so a hand-written object literal does not compile.

`FoldkitRouter` now runs the browser history carrier itself; remove any `useBrowserHistory` call beside it. With children, the app's own React Router pages sit beside the Program's: a link to `/about` writes the address bar without a reload, the carrier parks, and the Program keeps running with its state. Back returns to the Program's current screen. `navigatorOf` takes a second argument, `'WithHostPages'` or `'ProgramOnly'`. `useBrowserHistory` accepts `isCarried`, and `Navigation.followHostLink` moves the address bar to a host page and back. Without children, a link outside the Program loads that page.
