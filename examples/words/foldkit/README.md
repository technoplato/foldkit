# Words (Foldkit)

Live at [words.pisspoursoftware.xyz](https://words.pisspoursoftware.xyz/), behind Cloudflare Access; share links
(`/recording/…/share/…`) are public.

Every page of the site shows where its code lives, as its first line:
[github.com/technoplato/foldkit/tree/claude/words-web-scribe-scrubbed/examples/words/foldkit/src](https://github.com/technoplato/foldkit/tree/claude/words-web-scribe-scrubbed/examples/words/foldkit/src).
The site is built from that branch, not main. `siteSourceHeader()` in `../../site-source-header.ts` writes the line
from git at build time, so a build from another branch names that branch.
