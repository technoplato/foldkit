# Brandon dot | A party page with per-person sections

The page at `brandon.pisspoursoftware.xyz`, built on Foldkit's Instant sync, with one rule: a section a person may not see never leaves the server.

Every page of the site shows where its code lives, as its first line:
[github.com/technoplato/foldkit/tree/main/examples/brandon/foldkit/src](https://github.com/technoplato/foldkit/tree/main/examples/brandon/foldkit/src).
`siteSourceHeader()` in `../site-source-header.ts` writes that line from git at build time, and the origin allows the header's one inline style by its hash.

```
core/      the Program: the log's facts, update, Subscriptions, the sync wiring
foldkit/   the browser page, phone first
server/    the origin behind Cloudflare Access, and the `brandon` command
```

## Three kinds of data, three paths

| What                                  | Where it lives                                      | Who reads it                                 |
| ------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| Points, pointers, "something changed" | `programMessage` rows, app `brandon-dot`            | Anyone, signed out, through `Instant()`      |
| A section's words, accounts and flags | `brandonSections`, `brandonAccounts`, owner-only    | The origin, with the admin token             |
| Wallet addresses and balances         | `walletMirrorAddresses`, `walletMirrorTransactions` | The origin, for an account with `wallets` on |

Guests never sign into Instant, because that would put their email in the shared project's `$users`. So the browser follows the log signed out, and everything private comes from the origin.

The log carries facts and never words. `ChangedSections({ atMs })` says only that something changed; each open page then asks `GET /api/page` again, and gets its own filtered answer.

## A request, end to end

1. Cloudflare Access signs the person in and adds `Cf-Access-Jwt-Assertion`.
2. `handler.ts` checks that JWT against the team's certs with `makeAccessVerifier`: signature, issuer, expiry, and audience. The email header alone is never read, and neither is a cookie.
3. It looks up `sha256(lowercased email)` in `brandonAccounts`, or the `default` row. No row holds an address.
4. It sends only the sections whose `flag` that account has on. With `flags: ["scoreboard"]`, the words of `the-riddle` are not in the response at all.

## The `brandon` command

```sh
brandon go the-riddle                        # every open page scrolls there
brandon score add Claude 1 "the riddle"      # Scribe's score row and the log fact, in one transaction
brandon score check                          # the log's totals against Scribe's rows
brandon note Tyler "guilty: it's an SVG" --dunce
brandon section put the-riddle --title "The riddle" --kind Markdown --column Main \
  --flag riddle --position 80 --file riddle.md
brandon account set brandon@example.com --name Brandon --flags scoreboard,riddle
brandon wallet add So1111… --label "Devnet" --network Devnet
```

It needs `BRANDON_INSTANT_APP_ID`, `BRANDON_INSTANT_ADMIN_TOKEN`, and `BRANDON_OWNER_USER_ID` in the environment. `section put` parses the Markdown first, so words the page cannot show are refused before they are stored.

## The wallet mirror

The mirror reads what any block explorer shows, through three JSON-RPC methods: `getBalance`, `getSignaturesForAddress`, and `getTransaction`. It holds no key, signs nothing, and cannot send. Mainnet stays off until `BRANDON_MAINNET_APPROVED=yes`.

## Run it

```sh
pnpm --filter brandon-core-example build
pnpm --filter brandon-server-example bundle
VITE_INSTANT_APP_ID=<app> pnpm --filter brandon-foldkit-example build
PORT=5262 BRANDON_LOOPBACK_EMAIL=you@example.com BRANDON_STATIC_ROOT=examples/brandon/foldkit/dist \
  node examples/brandon/server/bundle/main.mjs
```

Open `http://localhost:5262`. `BRANDON_LOOPBACK_EMAIL` names the account only for a request made on this machine to `localhost` with no proxy header, so it never applies to a visitor through the tunnel.

## Laid out for a phone

Below 1050 px the page stacks Top, Side, then Main: the QR codes, the scoreboard, then the words. At 1050 px and wider, the scoreboard is the right column. Checked at 390 px wide with no sideways overflow.
