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

| What                                  | Where it lives                                      | Who reads it                                  |
| ------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Points, pointers, "something changed" | `programMessage` rows, app `brandon-dot`            | Anyone, signed out, through `Instant()`       |
| A section's words, accounts and flags | `brandonSections`, `brandonAccounts`, owner-only    | The origin, with the admin token              |
| Wallet addresses and balances         | `walletMirrorAddresses`, `walletMirrorTransactions` | The origin, for an account with `wallets` on  |
| A person's wallet activity            | `walletAccounts`, `walletTransactions`              | The origin, for that signed-in person alone   |
| A person's wallet keys                | IndexedDB on that person's own device               | That person's browser, and nothing else       |
| Money Scribe holds for a person       | `walletAccounts` (custody `Scribe`), `walletClaims` | The origin, for that signed-in person alone   |
| The key of a held account             | Michael's Mac's login keychain                      | `scribe-wallet` on that Mac, and nothing else |

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

## The wallet section

Foldkit's example wallet is composed here as a Submodel, with no wallet code of its own: `Wallet.update` inside `GotWalletMessage`, `Subscription.lift(Wallet.subscriptions)`, and `h.submodel` for its view. The `wallet` flag turns it on, and the origin enforces that: without the flag the section never leaves the server and `/api/wallet/owner` answers 403. The `wallets` flag is the read-only mirror above, a different thing.

```sh
brandon account flags Brandon --add wallet     # by display name, so no address is typed
brandon account flags Brandon --remove wallet
```

**Keys.** Each person's keys are made in their own browser and stay in IndexedDB there, in a partition the origin names from the verified login. A Mainnet key is never a test network's key. No key, seed or backup reaches the origin, Instant, the log or a network request, and `wallet.test.ts` proves it end to end. The origin reads no request body on any path, so nothing can hand it one. A person who clears this browser's data loses the keys, and the page says so.

**Networks.** Two modes from the wallet's own catalog: Devnet is Solana Devnet and Ethereum Sepolia, Mainnet is Solana Mainnet Beta and Ethereum Mainnet. A banner names the mode on every screen, red for real money. Switching reads every balance at once and shows `Checking the Solana Mainnet Beta balance…` until the fresh number lands, never the old one. Every send has a confirm step with the full address, amount, fee and network, and Confirm signs only what that step shows.

**The page's headers.** Only this origin's scripts run, never inside another site's frame, and the page talks only to Instant and the four networks' hosts. `script-src 'self'`, no `unsafe-inline`, and the site-source header's one inline style is allowed by its hash.

## Wallet activity

Every transaction of a person's wallets shows on the page and moves by itself: `Sending 0.25 SOL`, `Pending`, then `Sent 0.25 SOL`, `Confirmed`, then `Final`. A payment arrives the same way, with no tap.

1. The page tells the origin its public addresses: `PUT /api/wallet/accounts/solana:devnet/5xAm…`, no body, at most 16 per person. The holder comes from the verified login, never the request.
2. `watch.ts`, on the mini as `com.knophy.brandon-wallet-watcher`, follows `walletAccounts` through Instant and listens to each address on its chain over a WebSocket: Solana's `logsSubscribe`, Ethereum's new heads with receipts. It writes `walletTransactions` and a `ChangedWalletActivity` fact that carries a time and names no one.
3. Each open page reads `GET /api/wallet/activity` again and gets that person's rows alone. A new row moves the balance at once.

A send adds one step. The moment its chain takes it, the page reports it: `PUT /api/wallet/sent/solana:devnet/5xAm…/5hSig…/9Pz…/250000000`, no body. The origin files it as Pending under an address that person follows, and refuses anything a chain could not show. If that report fails, the chain's own report still brings the row.

The watcher follows each row not yet Final on the chain itself. A Final row never changes. A row whose block the chain forgot goes back to Pending. The chain says nothing when a send expires, so a Pending row gets one more question when its time is up, 3 minutes on Solana and an hour on Ethereum, and then reads `Did not send 0.25 SOL` with `It never landed, so nothing was sent.`

Sockets drop, so every watch listens first and backfills to its cursor alongside, a quiet watch ends after 10 minutes to bound a deaf socket, and a watch that held under a minute backs off up to 30 seconds. Every chain and Instant call has 5 seconds.

## Money Scribe holds for a person

Michael can put money in the app for a person's email before they have a wallet: Scribe makes the account's key on his Mac, and the money is theirs to move to their own wallet from this page. Michael, Recording 409 #297-298: "I'm going to put the money in the app for your email. And if you log in and grab it uh that's great".

1. On Michael's Mac, Scribe makes the key and the person's page holds the account: `scribe wallet create --chain solana --another`, then `brandon wallet hold <name> --network solana:mainnet-beta --address <address>`. The second writes the `walletAccounts` row with custody `Scribe` under that person's holder, by display name so no email is typed, and lists the account in this Mac's held list (`~/.config/scribe-private/brandon-dot/held-accounts.tsv`, `BRANDON_HELD_ACCOUNTS`, readable by its user alone). The watcher follows the row like any other, so a payment to it is the person's activity at once.
2. Signed in, the person sees a Held for you card at the top of the wallet section, in both modes, naming its network as real money: `Scribe holds 0.181 SOL for you on Solana Mainnet Beta.` The origin answers `GET /api/wallet/held` with that person's held accounts alone, each balance read from its chain as it answers.
3. Once their own wallet here has its account on that network and the origin follows it, Move it to my wallet asks the origin: `PUT /api/wallet/claim/solana:mainnet-beta/43T9…/9Pz…`, no body. The origin files a `walletClaims` row, Requested, only for one of that person's held accounts and only to an address their own wallet registered on the same network, one move at a time: the same move asked for twice at once files one claim. It refuses an address that looks like the held account (the same first or last three characters, `43T9AN5m…2xjc` beside `43T9sv9Y…Kxjc`), which is how an address-poisoning copy looks, and the card names the address in full before the tap.
4. The claims worker on Michael's Mac (`claims.ts`, bundled as `claims.mjs`, launchd's `com.knophy.brandon-held-claims`) follows Requested claims and pays each with `scribe-wallet send --all --id <the claim's send id>`: everything less the fee, so the held account ends at zero, and one id is one payment, so a retry re-sends the same signed bytes. It pays only from an account the held list names for that claim's person, so a database row alone never spends from another key of the Mac, and never to an address that is, or looks like, any account the list names. One worker runs at a time (a lock beside the held list), and it never starts a second claim on a held account while an older one is unsettled. A claim is Sent only once the chain has its send in a block; while it is pending the worker asks again every ten seconds under the same id. A refusal or a send that never landed is Failed with the signer's words; a network failure, a timeout or a locked keychain leave the claim to run again. Each end writes a `ChangedWalletActivity` fact, and the card says Moving, Moved or why not.

The key of a held account lives only in that Mac's login keychain, so it moves with the login keychain when the Mac does. `e2e/claim-local.sh` runs the worker's own code and the real signer against `solana-test-validator`: the held account ends at zero, the claim records what the chain moved, and the same claim again moves nothing more. Templates for the worker's launchd job are in `launchd/`.

### Who sees which address

The mini holds the watcher's sockets, so a closed page still gets its rows. Nothing below sees a key.

| Host                                                                | Who asks           | What it sees               |
| ------------------------------------------------------------------- | ------------------ | -------------------------- |
| `api.devnet.solana.com`                                             | the page, the mini | Solana Devnet addresses    |
| `solana-rpc.publicnode.com`                                         | the page           | Solana Mainnet addresses   |
| `api.mainnet-beta.solana.com`                                       | the mini           | Solana Mainnet addresses   |
| `ethereum-sepolia-rpc.publicnode.com`, `eth-sepolia.blockscout.com` | the page, the mini | Sepolia addresses          |
| `ethereum-rpc.publicnode.com`, `eth.blockscout.com`                 | the page, the mini | Ethereum Mainnet addresses |

A page asks from the person's own IP address. The mini asks from its own: the origin reads a held account's balance there, through the same endpoints the watcher uses. The claims worker's `scribe-wallet` asks from Michael's Mac, and sees the held account and the person's own address it pays.

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
