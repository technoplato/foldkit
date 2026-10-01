---
'foldkit': minor
---

Add the navigation carrier core to `foldkit/navigation`. A Program's navigation declares a slug and one route per Destination with `rootRoute`, `pushRoute`, `presentRoute`, and `notFoundRoute`. `printStack` prints the whole stack to one URI, such as `/counter/session/menu?q=re`, and `parseStack` parses any URI back into a stack, keeping a path no route matches as `NotFound`. `OpenedUri` and `NavigatedBack` are the two navigation facts, and `applyMessage` folds them into a stack. `runCarrier` keeps one carrier showing a Program's plan through a small driver: `browserHistoryDriver` for browser history and `keyedStackDriver` for keyed native stacks. `Route.here` matches without consuming a segment. Removes `makeUriSync`, `HistoryPort`, `UriSync`, `parseResultToOption`, `sameStack`, and the seam's `ProgramNavigation` type, which the carrier loop replaces.
