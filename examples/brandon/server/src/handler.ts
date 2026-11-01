import {
  FootballSection,
  type Game,
  Games,
  MarkdownSection,
  Page,
  QrLinksSection,
  ScoreboardSection,
  type Section,
  SectionKey,
  WalletAddresses,
  WalletsSection,
} from 'brandon-core-example'
import { Array, Effect, Match as M, Option, Order, Schema as S } from 'effect'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'

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
  walletsFlag,
} from './account.js'
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
 * development and screenshots.
 */
export type OriginDependencies = Readonly<{
  verifier: AccessVerifier
  store: BrandonStore
  football: Effect.Effect<ReadonlyArray<Game>, Error>
  loopbackEmail: Option.Option<string>
  staticRoot?: string
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
const unavailable = text(503, 'Not available right now.')

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

const read = (
  effect: Effect.Effect<OriginResponse, Error>,
): Promise<OriginResponse> =>
  Effect.runPromise(
    Effect.catch(effect, error =>
      Effect.sync(() => {
        console.error('origin read failed:', error.message)
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
 * read, and a flag that is off means those words stay here.
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
  if (path === '/health') {
    return text(200, 'ok')
  }
  const maybeEmail = await verifiedEmail(request, dependencies)
  if (Option.isNone(maybeEmail)) {
    return refused
  }
  const email = maybeEmail.value
  if (path === '/api/page') {
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
  } else if (staticRoot === undefined) {
    return notFound
  } else {
    return Option.getOrElse(await staticFile(path, staticRoot), () => notFound)
  }
}
