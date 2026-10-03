---
'foldkit': patch
---

`Session.compose`, `ActionMenu.compose`, and `compose.sync` keep a child Program's `subscriptions` and `managedResources`, reading them through the child's part of the Model, so a Program's clock or socket keeps running once it is composed. Before, the combinators dropped them. Under `compose.sync`, a Starting or Failed Model reads the child's initial Model. `Runtime.startHandle` takes `resources`, the Layer those Subscriptions and Commands use, such as a browser audio output.
