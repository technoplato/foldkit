---
'foldkit': minor
---

`Session.compose` takes `ownNavigationHosts`, the Hosts whose Processors keep their own navigation even while the session mirrors it, such as `Processor.Host.Cli()` for a terminal that plays in the background: a browser's moves never land on it, and its own moves stay on it. It works through the new `ProgramSynchronization.keepsOwnNavigation`, which every Processor reads the same way from a row's `from`, such as `cli-4f2a9c1e`, so every Processor folds the same rows to the same Model, and `ActionMenu.compose` passes it through. Whatever folds a child Message, Session now keeps the stack only as deep as the navigation allows, with the new `Navigation.allowedStackOf`, so a Sheet another device presented over a page, folded here where that page never opened, can no longer land over the root, such as Books' contents at `/books/contents`.
