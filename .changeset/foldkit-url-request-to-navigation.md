---
'foldkit': minor
---

Move `UrlRequest`, `Internal`, and `External` from the `Runtime` namespace to `Navigation`.

```ts
// Before
import { Runtime } from 'foldkit'
const ClickedLink = m('ClickedLink', { request: Runtime.UrlRequest })

// After
import { UrlRequest } from 'foldkit/navigation'
const ClickedLink = m('ClickedLink', { request: UrlRequest })
```

The namespaced form is also available via the main barrel:

```ts
import { Navigation } from 'foldkit'

const ClickedLink = m('ClickedLink', { request: Navigation.UrlRequest })
```

A `UrlRequest` is a navigation primitive that pairs with the Commands (`pushUrl`, `load`) that consume it, so it now lives in the same namespace.

`Internal` and `External` are now exported as callable Schema constructors in addition to types, so you can build a `UrlRequest` directly (useful for tests):

```ts
import { External, Internal } from 'foldkit/navigation'

const request = Internal({ url: someUrl })
```
