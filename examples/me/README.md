# me.pisspoursoftware.xyz

Each signed-in user's own page (Scribe issue 2002). It holds what is kept for that user: today their understanding
profile, its count and its history, which moved here from the performance page's `/understanding`.

## Who sees what

Cloudflare Access lets a person in with their Google login. The origin (`src/server/origin.ts`) checks that login
again with `makeAccessVerifier` from `@foldkit/instant`, the issues site's verifier, and takes who is signed in from
that verified login only, never from the URL, a header, a cookie or anything else the browser sends.

- No login, a login that does not verify, or a verifier that fails: the same Not found for every path.
- A signed-in user reads only their own folder: `<users dir>/<SHA-256 of the lowercased email>/`. `/data/me.json` is
  the origin's own answer (the verified email and the names of the files in that folder); `/data/<name>.json` is that
  file of their folder, by a strict name.
- A user without a profile sees, plainly, that they have none yet.
- Per-user answers are `private, no-store`; only the built assets may be cached.

No route names a user: `/understanding` is one address that each user reads as their own.

## Where the data comes from

The Scribe repository's exporter, `scripts/me/me_export.py`, writes each user's folder from a private list of users,
the same key as `userFolderName` here. The page never reads a user's source files directly.

## Run it

```sh
pnpm --filter me-example test        # the page, the routes and the origin
pnpm --filter me-example build       # the site, into dist/
pnpm --filter me-example bundle:server
CF_ACCESS_AUD=<the Access app's audience> ME_SITE_DIR=dist ME_USERS_DIR=<users dir> node bundle/server.mjs
```

Set `ME_USERS_DIR` when running the tests to check the data contract against a real export.

Hosting, deploys and how to undo them live with the exporter: `scripts/me/README.md` in the Scribe repository. The
performance page, `examples/performance`, links here and sends its old `/understanding` address here.
