---
'foldkit': patch
---

Hydrate `syncedModel` before folding navigation and session messages inside `Session.compose` and `ActionMenu.compose` `foldSynced`, so child `settleEntry` and `stack.get` hooks that inspect loaded or ephemeral fields do not crash during shared snapshot folds.
