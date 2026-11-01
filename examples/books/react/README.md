# Books (React)

Live at [books.pisspoursoftware.xyz](https://books.pisspoursoftware.xyz/books), behind Cloudflare Access.

Every page of the site shows where its code lives, as its first line:
[github.com/technoplato/foldkit/tree/main/examples/books/react/src](https://github.com/technoplato/foldkit/tree/main/examples/books/react/src).
`siteSourceHeader()` in `../../site-source-header.ts` writes that line from git at build time, so a build from another
branch names that branch.

Build and serve as the Mac does: `pnpm run build:live`, then `pnpm run serve:live` (port 5200).
