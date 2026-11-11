import {
  FootballSection,
  type Game,
  Games,
  HeldAccounts,
  HeldClaimRequest,
  MarkdownSection,
  Page,
  PersonalWalletSection,
  QrLinksSection,
  ScoreboardSection,
  type Section,
  SectionKey,
  SentTransaction,
  WalletActivity,
  WalletAddresses,
  WalletsSection,
  WatchedNetworkId,
  brandonWalletConnectOrigins,
} from 'brandon-core-example'
import {
  Array,
  Cause,
  Effect,
  Match as M,
  Option,
  Order,
  Schema as S,
} from 'effect'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import {
  isPublicAddressOn,
  isTransactionIdOn,
} from 'wallet-live-client-example'

import {
  type AccessVerifier,
  isLocalDevelopmentRequest,
} from '@foldkit/instant'
import type { MarkdownDocument } from '@foldkit/markdown'
import { parseMarkdown } from '@foldkit/markdown/vite'

import {
  type Account,
  accountKeyOf,
  defaultAccountKey,
  firstAccount,
  footballFlag,
  hasFlag,
  walletFlag,
  walletHolderOf,
  walletOwnerKeyOf,
  walletsFlag,
} from './account.js'
import {
  chainIdOfNetwork,
  accountKeyOf as watchedAccountKeyOf,
} from './activity.js'
import {
  claimDecisionOf,
  heldAccountOf,
  isHeldByScribeAt,
  newestClaimFor,
} from './held.js'
import type { HeldBalanceReader } from './heldBalance.js'
import { qrDrawingOf } from './qr.js'
import type { BrandonStore, SectionRow } from './store.js'

// HANDLER

/** One request as the handler reads it; every header name is lowercase. */
export type OriginRequest = Readonly<{
  method: string
  path: string
  headers: Readonly<Record<string, string>>
  remoteAddress: string | undefined
}>

/** One answer. */
export type OriginResponse = Readonly<{
  status: number
  contentType: string
  body: Buffer
}>

/**
 * What the origin needs. `loopbackEmail` names the account for a request
 * made on this machine to `localhost` with no proxy header, for local
 * development and screenshots. `heldBalance` reads a held account's
 * balance from its chain; without it, every held balance reads as unknown.
 */
export type OriginDependencies = Readonly<{
  verifier: AccessVerifier
  store: BrandonStore
  football: Effect.Effect<ReadonlyArray<Game>, Error>
  loopbackEmail: Option.Option<string>
  staticRoot?: string
  heldBalance?: HeldBalanceReader
}>

const jsonType = 'application/json; charset=utf-8'
const textType = 'text/plain; charset=utf-8'

const text = (status: number, body: string): OriginResponse => ({
  status,
  contentType: textType,
  body: Buffer.from(body),
})

const refused = text(403, 'Refused: no verified login.')
const notFound = text(404, 'Not found.')
const notAllowed = text(405, 'Refused: this origin only answers reads.')
const unavailable = text(503, 'Not available right now.')
const notAnAddress = text(
  400,
  'Refused: that is not a public address on that network.',
)
const tooManyAddresses = text(
  429,
  'Refused: this login follows as many addresses as it may.',
)
const notASend = text(400, 'Refused: that is not a send on that network.')
const notYourAddress = text(
  403,
  'Refused: this login does not follow that address.',
)
const heldSender = text(
  403,
  'Refused: Scribe holds that account, so only Scribe sends from it.',
)
const notHeldForYou = text(
  403,
  'Refused: Scribe holds no such account for this login on that network.',
)
const notYourOwnAddress = text(
  403,
  "Refused: that is not an address this login's own wallet follows on that network.",
)
const alreadyThere = text(
  400,
  'Refused: the money is in that account already.',
)
const followed = text(200, 'ok')

/** The most public addresses one person is followed on: four wallets on each of the four networks. */
export const maximumWatchedAccountsPerPerson = 16

const watchedAccountPath = /^\/api\/wallet\/accounts\/([^/]+)\/([^/]+)$/

const sentTransactionPath =
  /^\/api\/wallet\/sent\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/

const heldClaimPath = /^\/api\/wallet\/claim\/([^/]+)\/([^/]+)\/([^/]+)$/

const readMethods: ReadonlySet<string> = new Set(['GET', 'HEAD'])

const instantOrigins = ['https://api.instantdb.com', 'wss://api.instantdb.com']

const inlineStyle = /<style\b[^>]*>([\s\S]*?)<\/style>/g

/**
 * The `'sha256-…'` source of each inline `<style>` in a page, so the
 * policy allows exactly those blocks. The site-source header,
 * `<header data-site-source>`, carries one; an injected one matches no
 * hash and stays inert.
 *
 * @example
 * ```typescript
 * inlineStyleHashesOf('<style>a{color:red}</style>') // ["'sha256-…'"]
 * ```
 */
export const inlineStyleHashesOf = (html: string): ReadonlyArray<string> =>
  Array.map(
    Array.fromIterable(html.matchAll(inlineStyle)),
    ([, css = '']) =>
      `'sha256-${createHash('sha256').update(css).digest('base64')}'`,
  )

const contentSecurityPolicyWith = (
  inlineStyleHashes: ReadonlyArray<string>,
): string =>
  [
    "default-src 'none'",
    "script-src 'self'",
    `style-src ${["'self'", ...inlineStyleHashes].join(' ')}`,
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${[...instantOrigins, ...brandonWalletConnectOrigins].join(' ')}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')

const securityHeaders: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
  'strict-transport-security': 'max-age=31536000',
}

/**
 * The headers every answer carries, given the hashes of the served page's
 * own inline styles. The content security policy lets the page run only
 * its own scripts, never inside another site's frame, and talk only to
 * Instant and the wallet's own chains, so an injected script or a tag
 * from elsewhere cannot run beside the wallet's keys.
 *
 * @example
 * ```typescript
 * makeOriginHeaders(inlineStyleHashesOf(indexHtml))(answer)
 * ```
 */
export const makeOriginHeaders = (
  inlineStyleHashes: ReadonlyArray<string>,
): ((response: OriginResponse) => Readonly<Record<string, string>>) => {
  const contentSecurityPolicy = contentSecurityPolicyWith(inlineStyleHashes)
  return response => ({
    'content-type': response.contentType,
    'content-length': response.body.length.toString(),
    'cache-control': 'private, no-store',
    'content-security-policy': contentSecurityPolicy,
    ...securityHeaders,
  })
}

/** The headers for a page with no inline style. */
export const originHeaders = makeOriginHeaders([])

const json = (value: unknown): OriginResponse => ({
  status: 200,
  contentType: jsonType,
  body: Buffer.from(JSON.stringify(value)),
})

const staticTypes: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const verifiedEmail = async (
  request: OriginRequest,
  dependencies: OriginDependencies,
): Promise<Option.Option<string>> => {
  const token = request.headers['cf-access-jwt-assertion'] ?? ''
  if (token !== '') {
    const maybeIdentity = await dependencies.verifier.verify(token)
    return Option.map(maybeIdentity, identity => identity.email)
  } else if (
    isLocalDevelopmentRequest({
      remoteAddress: request.remoteAddress,
      headers: request.headers,
    })
  ) {
    return dependencies.loopbackEmail
  } else {
    return Option.none()
  }
}

const accountOf = (
  email: string,
  store: BrandonStore,
): Effect.Effect<Account, Error> =>
  Effect.gen(function* () {
    const maybeOwn = yield* store.account(accountKeyOf(email))
    const maybeDefault = yield* store.account(defaultAccountKey)
    return firstAccount(maybeOwn, maybeDefault)
  })

const documentOf = (row: SectionRow): MarkdownDocument =>
  parseMarkdown(Option.getOrElse(row.maybeMarkdown, () => ''))

const sectionOf = (row: SectionRow): Section => {
  const fields = {
    key: SectionKey.make(row.sectionKey),
    title: row.title,
    column: row.column,
  }
  return M.value(row.kind).pipe(
    M.withReturnType<Section>(),
    M.when('Markdown', () =>
      MarkdownSection({ ...fields, document: documentOf(row) }),
    ),
    M.when('QrLinks', () =>
      QrLinksSection({
        ...fields,
        document: documentOf(row),
        links: Array.map(
          Option.getOrElse(row.maybeLinks, () => []),
          ({ label, url }) => {
            const { path, size } = qrDrawingOf(url)
            return { label, url, qrPath: path, qrSize: size }
          },
        ),
      }),
    ),
    M.when('Scoreboard', () => ScoreboardSection(fields)),
    M.when('Football', () => FootballSection(fields)),
    M.when('Wallets', () => WalletsSection(fields)),
    M.when('Wallet', () => PersonalWalletSection(fields)),
    M.exhaustive,
  )
}

const byPosition = Order.mapInput(
  Order.Number,
  (row: SectionRow) => row.position,
)

const pageFor = (
  account: Account,
  rows: ReadonlyArray<SectionRow>,
): typeof Page.Type => ({
  displayName: account.displayName,
  sections: Array.map(
    Array.sort(
      Array.filter(rows, row => hasFlag(account, row.flag)),
      byPosition,
    ),
    sectionOf,
  ),
})

type PublicAccountRequest = Readonly<{
  networkId: string
  address: string
}>

const publicAccountRequestOf = (
  method: string,
  path: string,
): Option.Option<PublicAccountRequest> => {
  const maybeMatch = Option.fromNullishOr(path.match(watchedAccountPath))
  if (method !== 'PUT' || Option.isNone(maybeMatch)) {
    return Option.none()
  }
  const decode = Option.liftThrowable(decodeURIComponent)
  return Option.all({
    networkId: decode(maybeMatch.value[1] ?? ''),
    address: decode(maybeMatch.value[2] ?? ''),
  })
}

const reportedSendOf = (
  method: string,
  path: string,
): Option.Option<Readonly<Record<keyof SentTransaction, string>>> => {
  const maybeMatch = Option.fromNullishOr(path.match(sentTransactionPath))
  if (method !== 'PUT' || Option.isNone(maybeMatch)) {
    return Option.none()
  }
  const decode = Option.liftThrowable(decodeURIComponent)
  return Option.all({
    networkId: decode(maybeMatch.value[1] ?? ''),
    senderAddress: decode(maybeMatch.value[2] ?? ''),
    transactionId: decode(maybeMatch.value[3] ?? ''),
    recipientAddress: decode(maybeMatch.value[4] ?? ''),
    amountAtomic: decode(maybeMatch.value[5] ?? ''),
  })
}

const heldClaimRequestOf = (
  method: string,
  path: string,
): Option.Option<Readonly<Record<keyof HeldClaimRequest, string>>> => {
  const maybeMatch = Option.fromNullishOr(path.match(heldClaimPath))
  if (method !== 'PUT' || Option.isNone(maybeMatch)) {
    return Option.none()
  }
  const decode = Option.liftThrowable(decodeURIComponent)
  return Option.all({
    networkId: decode(maybeMatch.value[1] ?? ''),
    heldAddress: decode(maybeMatch.value[2] ?? ''),
    toAddress: decode(maybeMatch.value[3] ?? ''),
  })
}

const isClaimOnItsChain = (request: HeldClaimRequest): boolean => {
  const chainId = chainIdOfNetwork(request.networkId)
  return (
    isPublicAddressOn(chainId, request.heldAddress) &&
    isPublicAddressOn(chainId, request.toAddress)
  )
}

const unknownBalance: HeldBalanceReader = () => Effect.succeed(Option.none())

const fileClaim = (
  asked: Readonly<Record<keyof HeldClaimRequest, string>>,
  email: string,
  store: BrandonStore,
): Effect.Effect<OriginResponse, Error> =>
  Effect.gen(function* () {
    if (!S.is(HeldClaimRequest)(asked) || !isClaimOnItsChain(asked)) {
      return notAnAddress
    }
    const holder = walletHolderOf(email)
    const decision = claimDecisionOf({
      holder,
      request: asked,
      accounts: yield* store.personAccounts(holder),
      claims: yield* store.claims(holder),
      nowMs: Date.now(),
      sendId: randomUUID(),
    })
    return yield* M.value(decision).pipe(
      M.withReturnType<Effect.Effect<OriginResponse, Error>>(),
      M.tagsExhaustive({
        RefusedSameAddress: () => Effect.succeed(alreadyThere),
        RefusedNotHeld: () => Effect.succeed(notHeldForYou),
        RefusedNotOwnAddress: () => Effect.succeed(notYourOwnAddress),
        AlreadyRequested: () => Effect.succeed(followed),
        FileClaim: ({ claim }) => Effect.as(store.addClaim(claim), followed),
      }),
    )
  })

const heldFor = (
  email: string,
  store: BrandonStore,
  heldBalance: HeldBalanceReader,
): Effect.Effect<OriginResponse, Error> =>
  Effect.gen(function* () {
    const holder = walletHolderOf(email)
    const accounts = yield* store.personAccounts(holder)
    const claims = yield* store.claims(holder)
    const held = yield* Effect.forEach(
      Array.filter(accounts, account => account.isHeldByScribe),
      account =>
        Effect.map(heldBalance(account), maybeBalanceAtomic =>
          heldAccountOf(
            account,
            newestClaimFor(claims, account),
            maybeBalanceAtomic,
          ),
        ),
      { concurrency: 'unbounded' },
    )
    return json(S.encodeSync(HeldAccounts)(held))
  })

const isSendOnItsChain = (sent: SentTransaction): boolean => {
  const chainId = chainIdOfNetwork(sent.networkId)
  return (
    isPublicAddressOn(chainId, sent.senderAddress) &&
    isPublicAddressOn(chainId, sent.recipientAddress) &&
    isTransactionIdOn(chainId, sent.transactionId)
  )
}

const recordSend = (
  reported: Readonly<Record<keyof SentTransaction, string>>,
  email: string,
  store: BrandonStore,
): Effect.Effect<OriginResponse, Error> =>
  Effect.gen(function* () {
    if (!S.is(SentTransaction)(reported) || !isSendOnItsChain(reported)) {
      return notASend
    }
    const holder = walletHolderOf(email)
    const known = yield* store.watchedAccountKeys(holder)
    const accountKey = watchedAccountKeyOf({
      holder,
      networkId: reported.networkId,
      address: reported.senderAddress,
    })
    if (!Array.contains(known, accountKey)) {
      return notYourAddress
    }
    if (
      isHeldByScribeAt(
        yield* store.personAccounts(holder),
        reported.networkId,
        reported.senderAddress,
      )
    ) {
      return heldSender
    }
    yield* store.addSentTransaction(holder, reported)
    return followed
  })

const follow = (
  { networkId, address }: PublicAccountRequest,
  email: string,
  store: BrandonStore,
): Effect.Effect<OriginResponse, Error> =>
  Effect.gen(function* () {
    if (!S.is(WatchedNetworkId)(networkId)) {
      return notAnAddress
    }
    if (!isPublicAddressOn(chainIdOfNetwork(networkId), address)) {
      return notAnAddress
    }
    const holder = walletHolderOf(email)
    const known = yield* store.watchedAccountKeys(holder)
    if (
      Array.contains(known, watchedAccountKeyOf({ holder, networkId, address }))
    ) {
      return followed
    }
    if (known.length >= maximumWatchedAccountsPerPerson) {
      return tooManyAddresses
    }
    yield* store.addWatchedAccount({ holder, networkId, address })
    return followed
  })

const read = (
  effect: Effect.Effect<OriginResponse, Error>,
): Promise<OriginResponse> =>
  Effect.runPromise(
    Effect.catchCause(effect, cause =>
      Effect.sync(() => {
        console.error('origin read failed:', Cause.pretty(cause))
        return unavailable
      }),
    ),
  )

const staticFile = async (
  urlPath: string,
  root: string,
): Promise<Option.Option<OriginResponse>> => {
  const decodedPath = Option.liftThrowable(decodeURIComponent)(urlPath)
  if (Option.isNone(decodedPath)) {
    return Option.none()
  }
  const relative = decodedPath.value.replace(/^\/+/, '') || 'index.html'
  const segments = relative.split(/[/\\]/)
  const type = staticTypes[extname(relative).toLowerCase()]
  const full = resolve(join(root, relative))
  if (
    type === undefined ||
    !full.startsWith(`${resolve(root)}${sep}`) ||
    Array.some(segments, segment => segment.startsWith('.'))
  ) {
    return Option.none()
  }
  try {
    const details = await stat(full)
    return details.isFile()
      ? Option.some({
          status: 200,
          contentType: type,
          body: await readFile(full),
        })
      : Option.none()
  } catch {
    return Option.none()
  }
}

/**
 * Answers one request. Everything but `/health` needs a login whose JWT
 * verifies against the team's certs: the email header alone is never
 * read, and a flag that is off means those words stay here. No path reads
 * a request body, so nothing can hand this origin a key in one. Besides
 * reads, it answers three writes, each only for the signed-in person:
 * `PUT /api/wallet/accounts/solana:devnet/5xAm…` follows that public address,
 * which must parse as one on that network,
 * `PUT /api/wallet/sent/solana:devnet/5xAm…/5hSig…/9Pz…/250000000` files a
 * send from an address they follow as Pending, every part of it something
 * the chain shows to anyone, and
 * `PUT /api/wallet/claim/solana:mainnet-beta/43T9…/9Pz…` asks Scribe to move
 * the money it holds for them at the first address to the second, one of
 * their own wallet's.
 */
export const handle = async (
  request: OriginRequest,
  dependencies: OriginDependencies,
): Promise<OriginResponse> => {
  const { store, football, staticRoot } = dependencies
  const path = Option.getOrElse(
    Array.head(request.path.split('?')),
    () => request.path,
  )
  const maybeFollow = publicAccountRequestOf(request.method, path)
  const maybeReportedSend = reportedSendOf(request.method, path)
  const maybeClaim = heldClaimRequestOf(request.method, path)
  if (
    !readMethods.has(request.method) &&
    Option.isNone(maybeFollow) &&
    Option.isNone(maybeReportedSend) &&
    Option.isNone(maybeClaim)
  ) {
    return notAllowed
  }
  if (path === '/health') {
    return text(200, 'ok')
  }
  const maybeEmail = await verifiedEmail(request, dependencies)
  if (Option.isNone(maybeEmail)) {
    return refused
  }
  const email = maybeEmail.value
  if (Option.isSome(maybeFollow)) {
    return read(
      Effect.gen(function* () {
        const account = yield* accountOf(email, store)
        if (!hasFlag(account, walletFlag)) {
          return refused
        }
        return yield* follow(maybeFollow.value, email, store)
      }),
    )
  } else if (Option.isSome(maybeReportedSend)) {
    return read(
      Effect.gen(function* () {
        const account = yield* accountOf(email, store)
        if (!hasFlag(account, walletFlag)) {
          return refused
        }
        return yield* recordSend(maybeReportedSend.value, email, store)
      }),
    )
  } else if (Option.isSome(maybeClaim)) {
    return read(
      Effect.gen(function* () {
        const account = yield* accountOf(email, store)
        if (!hasFlag(account, walletFlag)) {
          return refused
        }
        return yield* fileClaim(maybeClaim.value, email, store)
      }),
    )
  } else if (path === '/api/page') {
    return read(
      Effect.gen(function* () {
        const account = yield* accountOf(email, store)
        const rows = yield* store.sections
        return json(S.encodeSync(Page)(pageFor(account, rows)))
      }),
    )
  } else if (path === '/api/football') {
    return read(
      Effect.gen(function* () {
        const account = yield* accountOf(email, store)
        if (!hasFlag(account, footballFlag)) {
          return refused
        }
        return json(S.encodeSync(Games)(yield* football))
      }),
    )
  } else if (path === '/api/wallets') {
    return read(
      Effect.gen(function* () {
        const account = yield* accountOf(email, store)
        if (!hasFlag(account, walletsFlag)) {
          return refused
        }
        return json(S.encodeSync(WalletAddresses)(yield* store.wallets))
      }),
    )
  } else if (path === '/api/wallet/owner') {
    return read(
      Effect.gen(function* () {
        const account = yield* accountOf(email, store)
        if (!hasFlag(account, walletFlag)) {
          return refused
        }
        return json({ ownerKey: walletOwnerKeyOf(email) })
      }),
    )
  } else if (path === '/api/wallet/activity') {
    return read(
      Effect.gen(function* () {
        const account = yield* accountOf(email, store)
        if (!hasFlag(account, walletFlag)) {
          return refused
        }
        return json(
          S.encodeSync(WalletActivity)(
            yield* store.walletActivity(walletHolderOf(email)),
          ),
        )
      }),
    )
  } else if (path === '/api/wallet/held') {
    return read(
      Effect.gen(function* () {
        const account = yield* accountOf(email, store)
        if (!hasFlag(account, walletFlag)) {
          return refused
        }
        return yield* heldFor(
          email,
          store,
          dependencies.heldBalance ?? unknownBalance,
        )
      }),
    )
  } else if (staticRoot === undefined) {
    return notFound
  } else {
    return Option.getOrElse(await staticFile(path, staticRoot), () => notFound)
  }
}
