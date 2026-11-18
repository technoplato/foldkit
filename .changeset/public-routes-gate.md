---
'@foldkit/instant': minor
---

A hosted origin can now make some routes public, and only those:

- `hostedIdentity({ publicRoutes })` guards every path. A visitor with a verified Cloudflare Access login, in the assertion header, the `CF_Authorization` cookie, or the origin's own `foldkit_access` cookie, reaches the app as before. Local development does too. Anyone else gets only what `publicRoutes` answers for a plain GET or HEAD path, and 404 for anything else. So an Access bypass on `/books` shows link previews and never the app or its data.
- Paths with percent escapes, `.` or `..` segments, or doubled slashes never reach the public routes, so a trick such as `/books/..%2F__foldkit/hosted-identity/session` gets 404.
- `/__foldkit/sign-in?next=/books/a-new-earth` stays behind Access. A signed-in visitor there gets the origin's login cookie and is sent on to `next`, which must be a plain local path.
- `linkPreviewAnswer` builds a small page with Open Graph and Twitter card tags, a visible card, and an Open button that signs the visitor in first. It asks search engines not to index it, and escapes every value.
- `cookieValue` reads one cookie from a `cookie` header.
