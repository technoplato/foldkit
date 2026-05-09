---
'foldkit': patch
---

`Story.expectOutMessage` now compares OutMessages with `Equal.equals` (structural deep-equal) instead of `JSON.stringify`. OutMessages whose values include `undefined` fields, key-order differences, circular references, or values implementing the `Equal` symbol are now compared correctly.
