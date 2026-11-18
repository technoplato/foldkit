# Casino (Foldkit)

Live at [casino.pisspoursoftware.xyz](https://casino.pisspoursoftware.xyz/), behind Cloudflare Access.

Every page of the site shows where its code lives, as its first line:
[github.com/technoplato/foldkit/tree/main/examples/casino/foldkit/src](https://github.com/technoplato/foldkit/tree/main/examples/casino/foldkit/src).
`siteSourceHeader()` in `../../site-source-header.ts` writes that line from git at build time, so a build from another
branch names that branch.
