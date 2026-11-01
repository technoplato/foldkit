# Issues (React)

Live at [issues.pisspoursoftware.xyz](https://issues.pisspoursoftware.xyz/), behind Cloudflare Access.

Every page of the site shows where its code lives, as its first line:
[github.com/technoplato/foldkit/tree/main/examples/issues/react/src](https://github.com/technoplato/foldkit/tree/main/examples/issues/react/src).
`siteSourceHeader()` in `../../site-source-header.ts` writes that line from git at build time, so a build from another
branch names that branch.

What the site shows, how it reads Scribe's rows and what a change costs: `../README.md`, "The site".
