import {
  Array,
  Context,
  Data,
  Effect,
  HashMap,
  Layer,
  Match as M,
  Option,
  Redacted,
  Ref,
  Schema as S,
  Stream,
  String,
} from 'effect'
import { createHash } from 'node:crypto'

import {
  type AccessIdentity,
  accessTokenFromHeaders,
  cookieValue,
  hostedLoginCookieName,
  isLocalDevelopmentRequest,
} from '@foldkit/instant'

import {
  AudibleBridge,
  type AudibleBridgeError,
  type AudibleLocale,
  type BridgeLibrary,
  type PendingSignIn,
} from './bridge.node.js'
import {
  type ImportOwner,
  LibraryImport,
  type LibraryImportError,
  type PlannedTitle,
  type TitleDetailsResult,
} from './libraryImport.js'
import {
  AddressMismatch,
  AmazonRefused,
  type AudibleProblem,
  LoginExpired,
  NotConnected,
  NotSignedIn,
  SignInExpired,
  Unavailable,
} from './problem.js'
import {
  AudibleLibraryJson,
  FinishSignInJson,
  ImportAdvanced,
  type ImportEvent,
  ImportEventJson,
  ImportRequestJson,
  ImportStopped,
  ProblemBodyJson,
  StartedSignInJson,
  audibleFinishPath,
  audibleImportPath,
  audibleLibraryPath,
  audiblePathPrefix,
  audibleStartPath,
  importEventName,
} from './service.js'
import type {
  Asin,
  AudibleTitle,
  ListedTitle,
  SkipKind,
  SkippedCount,
} from './title.js'
import { CredentialsVault, type VaultError } from './vault.node.js'

// SERVER

/** One request to the Audible import, as the server reads it. */
export type AudibleRequest = Readonly<{
  method: string
  path: string
  headers: Readonly<Record<string, string>>
  remoteAddress: string | undefined
  body: string
}>

/**
 * What the server answers: JSON with a status, or a stream of
 * Server-Sent Events, each a whole `event: import` frame, for an import.
 */
export type AudibleResponse =
  | Readonly<{ _tag: 'Json'; status: number; body: string }>
  | Readonly<{ _tag: 'Events'; frames: Stream.Stream<string> }>

/**
 * Who is asking: the family member whose Cloudflare Access login checks
 * out, their email lowercased. None for anyone else.
 */
export class AudibleMembers extends Context.Service<
  AudibleMembers,
  Readonly<{
    ownerOf: (
      request: AudibleRequest,
    ) => Effect.Effect<Option.Option<ImportOwner>>
  }>
>()('books/AudibleMembers') {}

/**
 * Members as Cloudflare Access names them: a login in the assertion
 * header, the `CF_Authorization` cookie, a Bearer token, or the origin's
 * own `foldkit_access` cookie, each checked by `verifyAccessToken`. A
 * request made on this machine to `localhost`, with no proxy in between,
 * is `loopbackEmail`, the same rule the hosted identity mint keeps.
 *
 * @example
 * ```typescript
 * accessMembers({ verifyAccessToken: makeAccessVerifier({ teamDomain, audiences }).verify, loopbackEmail: loopbackMintEmail() })
 * ```
 */
export const accessMembers = (
  config: Readonly<{
    verifyAccessToken: (token: string) => Promise<Option.Option<AccessIdentity>>
    loopbackEmail: string
  }>,
) =>
  Layer.succeed(AudibleMembers, {
    ownerOf: request =>
      Effect.promise(async (): Promise<Option.Option<ImportOwner>> => {
        if (
          isLocalDevelopmentRequest({
            remoteAddress: request.remoteAddress,
            headers: request.headers,
          })
        ) {
          return Option.some({ email: config.loopbackEmail.toLowerCase() })
        }
        const tokens = Array.dedupe(
          Array.filter(
            [
              accessTokenFromHeaders(request.headers),
              cookieValue(
                request.headers['cookie'] ?? '',
                hostedLoginCookieName,
              ).trim(),
            ],
            String.isNonEmpty,
          ),
        )
        for (const token of tokens) {
          const maybeIdentity = await config
            .verifyAccessToken(token)
            .catch(() => Option.none<AccessIdentity>())
          if (Option.isSome(maybeIdentity)) {
            return Option.some({
              email: maybeIdentity.value.email.toLowerCase(),
            })
          }
        }
        return Option.none()
      }),
  })

/**
 * How the server runs: the Audible marketplace it signs in to, the
 * clock, and where it writes its log lines, which hold counts and a short
 * hash of the member, never an email, a token, or an address.
 */
export class AudibleServerConfig extends Context.Service<
  AudibleServerConfig,
  Readonly<{
    locale: AudibleLocale
    nowMs: () => number
    log: (line: string) => void
  }>
>()('books/AudibleServerConfig') {}

type StoredSignIn = Readonly<{ signIn: PendingSignIn; startedAtMs: number }>

type CachedLibrary = Readonly<{ library: BridgeLibrary; readAtMs: number }>

const signInReuseMs = 10 * 60 * 1000

const signInLifetimeMs = 20 * 60 * 1000

const libraryFreshMs = 10 * 60 * 1000

/**
 * What the server remembers between requests, in memory only: each
 * member's open Amazon sign-in, kept twenty minutes and reused for ten,
 * and their Audible library, kept ten minutes.
 */
export class AudibleSessions extends Context.Service<
  AudibleSessions,
  Readonly<{
    reusableSignIn: (
      memberKey: string,
      nowMs: number,
    ) => Effect.Effect<Option.Option<StoredSignIn>>
    putSignIn: (memberKey: string, stored: StoredSignIn) => Effect.Effect<void>
    takeSignIn: (
      memberKey: string,
      nowMs: number,
    ) => Effect.Effect<Option.Option<StoredSignIn>>
    freshLibrary: (
      memberKey: string,
      nowMs: number,
    ) => Effect.Effect<Option.Option<BridgeLibrary>>
    putLibrary: (
      memberKey: string,
      cached: CachedLibrary,
    ) => Effect.Effect<void>
    dropLibrary: (memberKey: string) => Effect.Effect<void>
  }>
>()('books/AudibleSessions') {}

/** The server's memory between requests; see {@link AudibleSessions}. */
export const audibleSessions = Layer.effect(
  AudibleSessions,
  Effect.gen(function* () {
    const signIns = yield* Ref.make(HashMap.empty<string, StoredSignIn>())
    const libraries = yield* Ref.make(HashMap.empty<string, CachedLibrary>())
    const isWithin = (startedAtMs: number, nowMs: number, spanMs: number) =>
      nowMs - startedAtMs < spanMs
    return AudibleSessions.of({
      reusableSignIn: (memberKey, nowMs) =>
        Effect.map(Ref.get(signIns), all =>
          Option.filter(HashMap.get(all, memberKey), stored =>
            isWithin(stored.startedAtMs, nowMs, signInReuseMs),
          ),
        ),
      putSignIn: (memberKey, stored) =>
        Ref.update(signIns, HashMap.set(memberKey, stored)),
      takeSignIn: (memberKey, nowMs) =>
        Ref.modify(signIns, all => [
          Option.filter(HashMap.get(all, memberKey), stored =>
            isWithin(stored.startedAtMs, nowMs, signInLifetimeMs),
          ),
          HashMap.remove(all, memberKey),
        ]),
      freshLibrary: (memberKey, nowMs) =>
        Effect.map(Ref.get(libraries), all =>
          Option.map(
            Option.filter(HashMap.get(all, memberKey), cached =>
              isWithin(cached.readAtMs, nowMs, libraryFreshMs),
            ),
            cached => cached.library,
          ),
        ),
      putLibrary: (memberKey, cached) =>
        Ref.update(libraries, HashMap.set(memberKey, cached)),
      dropLibrary: memberKey =>
        Ref.update(libraries, HashMap.remove(memberKey)),
    })
  }),
)

/** Everything the Audible import's server needs. */
export type AudibleServerServices =
  | AudibleMembers
  | AudibleServerConfig
  | AudibleSessions
  | CredentialsVault
  | AudibleBridge
  | LibraryImport

/** A request refused, with the status and the problem to answer. */
class Refusal extends Data.TaggedError('Refusal')<{
  readonly status: number
  readonly problem: AudibleProblem
}> {}

const statusOk = 200
const statusBadRequest = 400
const statusNotSignedIn = 401
const statusNotFound = 404
const statusMethodNotAllowed = 405
const statusConflict = 409
const statusGone = 410
const statusBadGateway = 502
const statusUnavailable = 503
const statusGatewayTimeout = 504
const statusServerError = 500

const json = (status: number, body: string): AudibleResponse => ({
  _tag: 'Json',
  status,
  body,
})

const encodeProblemBody = S.encodeSync(ProblemBodyJson)

const problemAnswer = (status: number, problem: AudibleProblem) =>
  json(status, encodeProblemBody({ problem }))

const refusal = (status: number, problem: AudibleProblem): Refusal =>
  new Refusal({ status, problem })

const unavailable = (status: number, reason: string): Refusal =>
  refusal(status, Unavailable({ reason }))

const memberKeyOf = (owner: ImportOwner): string =>
  createHash('sha256').update(owner.email).digest('hex')

const memberTagLength = 8

const memberTagOf = (owner: ImportOwner): string =>
  memberKeyOf(owner).slice(0, memberTagLength)

const amazonCodeReasons: Readonly<Record<string, string>> = {
  InvalidValue: 'the sign-in was already used or ran out of time',
  InvalidToken: 'the sign-in was already used or ran out of time',
}

const reasonOfCode = (
  maybeCode: Option.Option<string>,
  fallback: string,
): string =>
  Option.getOrElse(
    Option.flatMap(maybeCode, code =>
      Option.fromNullishOr(amazonCodeReasons[code]),
    ),
    () => fallback,
  )

/**
 * The refusal for a failure in the helper. `refusedReason` says what
 * Amazon would not do in this step, such as `it did not accept the
 * sign-in`.
 */
const bridgeRefusal =
  (refusedReason: string) =>
  (error: AudibleBridgeError): Refusal =>
    M.value(error.kind).pipe(
      M.withReturnType<Refusal>(),
      M.when('AddressMismatch', () =>
        refusal(statusBadRequest, AddressMismatch()),
      ),
      M.when('LoginExpired', () => refusal(statusConflict, LoginExpired())),
      M.when('AmazonRefused', () =>
        refusal(
          statusBadGateway,
          AmazonRefused({
            reason: reasonOfCode(error.maybeCode, refusedReason),
          }),
        ),
      ),
      M.when('RateLimited', () =>
        refusal(
          statusUnavailable,
          AmazonRefused({
            reason:
              'it asked Books to slow down, so try again in a few minutes',
          }),
        ),
      ),
      M.when('NetworkError', () =>
        unavailable(statusUnavailable, 'Books could not reach Amazon'),
      ),
      M.when('TimedOut', () =>
        unavailable(statusGatewayTimeout, 'Amazon took too long to answer'),
      ),
      M.when('Missing', () =>
        unavailable(
          statusUnavailable,
          'the Audible helper is not set up on this computer',
        ),
      ),
      M.orElse(() =>
        unavailable(statusServerError, 'the Audible helper did not work'),
      ),
    )

const vaultRefusal = (error: VaultError): Refusal =>
  M.value(error.kind).pipe(
    M.withReturnType<Refusal>(),
    M.when('KeychainRefused', () =>
      unavailable(statusUnavailable, 'the Keychain did not give Books its key'),
    ),
    M.when('Unopenable', () => refusal(statusConflict, LoginExpired())),
    M.when('Unwritable', () =>
      unavailable(statusUnavailable, 'Books could not save your Audible login'),
    ),
    M.exhaustive,
  )

const importRefusal = (error: LibraryImportError): Refusal =>
  unavailable(statusUnavailable, error.reason)

/** True for the address Amazon lands on, the one with the sign-in's code. */
const isLandingAddress = (address: string): boolean =>
  String.includes('openid.oa2.authorization_code=')(address)

const isPutBackKind = (error: AudibleBridgeError): boolean =>
  error.kind !== 'AmazonRefused' &&
  error.kind !== 'LoginExpired' &&
  error.kind !== 'RateLimited'

const started = (owner: ImportOwner) =>
  Effect.gen(function* () {
    const config = yield* AudibleServerConfig
    const vault = yield* CredentialsVault
    const sessions = yield* AudibleSessions
    const bridge = yield* AudibleBridge
    yield* Effect.mapError(vault.ensureKey, vaultRefusal)
    const memberKey = memberKeyOf(owner)
    const nowMs = config.nowMs()
    const maybeReusable = yield* sessions.reusableSignIn(memberKey, nowMs)
    const signIn = yield* Option.match(maybeReusable, {
      onSome: stored => Effect.succeed(stored.signIn),
      onNone: () =>
        Effect.tap(
          Effect.mapError(
            bridge.start(config.locale),
            bridgeRefusal('it would not start a sign-in'),
          ),
          fresh =>
            sessions.putSignIn(memberKey, {
              signIn: fresh,
              startedAtMs: nowMs,
            }),
        ),
    })
    config.log(`audible ${memberTagOf(owner)}: sign-in ready`)
    return json(
      statusOk,
      S.encodeSync(StartedSignInJson)({ loginUrl: signIn.loginUrl }),
    )
  })

const finished = (owner: ImportOwner, body: string) =>
  Effect.gen(function* () {
    const config = yield* AudibleServerConfig
    const vault = yield* CredentialsVault
    const sessions = yield* AudibleSessions
    const bridge = yield* AudibleBridge
    const request = yield* Effect.mapError(
      S.decodeUnknownEffect(FinishSignInJson)(body),
      () =>
        unavailable(statusBadRequest, 'Books sent a sign-in it cannot read'),
    )
    if (!isLandingAddress(request.redirectUrl)) {
      return yield* Effect.fail(refusal(statusBadRequest, AddressMismatch()))
    }
    const memberKey = memberKeyOf(owner)
    const maybeStored = yield* sessions.takeSignIn(memberKey, config.nowMs())
    if (Option.isNone(maybeStored)) {
      return yield* Effect.fail(refusal(statusGone, SignInExpired()))
    }
    const stored = maybeStored.value
    const putBack = sessions.putSignIn(memberKey, stored)
    yield* vault.ensureKey.pipe(
      Effect.tapError(() => putBack),
      Effect.mapError(vaultRefusal),
    )
    const credentials = yield* bridge
      .finish({
        redirectUrl: Redacted.make(request.redirectUrl),
        signIn: stored.signIn,
      })
      .pipe(
        Effect.tapError(error =>
          isPutBackKind(error) ? putBack : Effect.void,
        ),
        Effect.mapError(bridgeRefusal('it did not accept the sign-in')),
      )
    yield* vault.save(owner, credentials).pipe(
      Effect.tapError(() =>
        Effect.sync(() => {
          config.log(
            `audible ${memberTagOf(owner)}: connected at Amazon, but the login was not saved`,
          )
        }),
      ),
      Effect.mapError(vaultRefusal),
    )
    yield* sessions.dropLibrary(memberKey)
    config.log(`audible ${memberTagOf(owner)}: connected`)
    return json(statusOk, '{}')
  })

const savedLoginOf = (owner: ImportOwner) =>
  Effect.flatMap(CredentialsVault, vault =>
    Effect.flatMap(
      Effect.mapError(vault.load(owner), vaultRefusal),
      maybeCredentials =>
        Option.match(maybeCredentials, {
          onNone: () => Effect.fail(refusal(statusConflict, NotConnected())),
          onSome: Effect.succeed,
        }),
    ),
  )

const libraryOf = (
  owner: ImportOwner,
  credentials: Redacted.Redacted<string>,
) =>
  Effect.gen(function* () {
    const config = yield* AudibleServerConfig
    const sessions = yield* AudibleSessions
    const bridge = yield* AudibleBridge
    const memberKey = memberKeyOf(owner)
    const nowMs = config.nowMs()
    const maybeFresh = yield* sessions.freshLibrary(memberKey, nowMs)
    if (Option.isSome(maybeFresh)) {
      return maybeFresh.value
    }
    const library = yield* Effect.mapError(
      bridge.library(credentials),
      bridgeRefusal('it did not send your library'),
    )
    yield* sessions.putLibrary(memberKey, { library, readAtMs: nowMs })
    return library
  })

/** The titles the importer would bring in, and what it leaves out. */
type PlannedLibrary = Readonly<{
  titles: ReadonlyArray<AudibleTitle>
  skipped: ReadonlyArray<SkippedCount>
}>

const everySkipKind: ReadonlyArray<SkipKind> = [
  'Podcast',
  'AudiblePlusLoan',
  'Part',
  'Duplicate',
  'Other',
]

const skippedCountsOf = (
  planned: ReadonlyArray<PlannedTitle>,
): ReadonlyArray<SkippedCount> =>
  Array.getSomes(
    Array.map(everySkipKind, kind => {
      const count = Array.filter(
        planned,
        title => title._tag === 'PlannedSkip' && title.kind === kind,
      ).length
      return count === 0 ? Option.none() : Option.some({ kind, count })
    }),
  )

const shownTitleOf = (
  title: ListedTitle,
  maybePlanned: Option.Option<PlannedTitle>,
): Option.Option<AudibleTitle> =>
  Option.match(maybePlanned, {
    onNone: () => Option.some({ ...title, match: 'New', marks: [] }),
    onSome: planned =>
      M.value(planned).pipe(
        M.withReturnType<Option.Option<AudibleTitle>>(),
        M.tagsExhaustive({
          PlannedNew: ({ marks }) =>
            Option.some({ ...title, match: 'New', marks }),
          PlannedInLibrary: ({ marks }) =>
            Option.some({ ...title, match: 'InLibrary', marks }),
          PlannedSkip: () => Option.none(),
        }),
      ),
  })

/**
 * The titles as the importer sees them: those it would add or finds on
 * the shelf already, each marked, and how many it leaves out and why.
 * When the importer cannot plan, every title shows as new; importing still
 * matches the ones the shelf has.
 */
const plannedLibraryOf = (owner: ImportOwner, library: BridgeLibrary) =>
  Effect.gen(function* () {
    const config = yield* AudibleServerConfig
    const libraryImport = yield* LibraryImport
    const planned = yield* libraryImport
      .plan({ owner, library: library.items })
      .pipe(
        Effect.catch(() =>
          Effect.sync((): ReadonlyArray<PlannedTitle> => {
            config.log(
              `audible ${memberTagOf(owner)}: could not plan, showing every title as new`,
            )
            return []
          }),
        ),
      )
    const plannedLibrary: PlannedLibrary = {
      titles: Array.getSomes(
        Array.map(library.titles, title =>
          shownTitleOf(
            title,
            Array.findFirst(planned, each => each.asin === title.asin),
          ),
        ),
      ),
      skipped: skippedCountsOf(planned),
    }
    return plannedLibrary
  })

const listed = (owner: ImportOwner) =>
  Effect.gen(function* () {
    const config = yield* AudibleServerConfig
    const credentials = yield* savedLoginOf(owner)
    const library = yield* libraryOf(owner, credentials)
    const plannedLibrary = yield* plannedLibraryOf(owner, library)
    config.log(
      `audible ${memberTagOf(owner)}: library read, ${plannedLibrary.titles.length.toString()} titles to show`,
    )
    return json(statusOk, S.encodeSync(AudibleLibraryJson)(plannedLibrary))
  })

const encodeImportEvent = S.encodeSync(ImportEventJson)

/** One import event as a whole Server-Sent Event frame. */
export const frameOf = (event: ImportEvent): string =>
  `event: ${importEventName}\ndata: ${encodeImportEvent(event)}\n\n`

const stoppedBy = (problem: AudibleProblem): ImportEvent =>
  ImportStopped({ problem })

const importEventsOf = (
  owner: ImportOwner,
  credentials: Redacted.Redacted<string>,
  library: BridgeLibrary,
  asins: ReadonlyArray<Asin>,
) =>
  Effect.gen(function* () {
    const config = yield* AudibleServerConfig
    const bridge = yield* AudibleBridge
    const libraryImport = yield* LibraryImport
    const total = asins.length
    const results = yield* Ref.make<ReadonlyArray<TitleDetailsResult>>([])
    const readingChapters = Stream.concat(
      Stream.make(
        ImportAdvanced({
          progress: { stage: 'ReadingChapters', done: 0, total },
        }),
      ),
      bridge.details(credentials, asins).pipe(
        Stream.mapError(bridgeRefusal('it did not send the chapters')),
        Stream.tap(result => Ref.update(results, Array.append(result))),
        Stream.mapAccum(
          () => 0,
          (done, _result) => [
            done + 1,
            [
              ImportAdvanced({
                progress: { stage: 'ReadingChapters', done: done + 1, total },
              }),
            ],
          ],
        ),
      ),
    )
    const addingBooks = Stream.unwrap(
      Effect.map(Ref.get(results), details =>
        libraryImport
          .apply({ owner, library: library.items, asins, details })
          .pipe(Stream.mapError(importRefusal)),
      ),
    )
    return Stream.concat(readingChapters, addingBooks).pipe(
      Stream.tap(update =>
        Effect.sync(() => {
          if (update._tag === 'ImportFinished') {
            config.log(
              `audible ${memberTagOf(owner)}: imported, added ${update.summary.added.toString()}, matched ${update.summary.matched.toString()}`,
            )
          }
        }),
      ),
      Stream.map((update): ImportEvent => update),
      Stream.catch(refused => Stream.make(stoppedBy(refused.problem))),
      Stream.map(frameOf),
    )
  })

const imported = (owner: ImportOwner, body: string) =>
  Effect.gen(function* () {
    const request = yield* Effect.mapError(
      S.decodeUnknownEffect(ImportRequestJson)(body),
      () =>
        unavailable(statusBadRequest, 'Books sent an import it cannot read'),
    )
    const credentials = yield* savedLoginOf(owner)
    const library = yield* libraryOf(owner, credentials)
    const asins = Array.filter(
      Array.map(library.titles, title => title.asin),
      asin => Array.contains(request.asins, asin),
    )
    if (Array.isReadonlyArrayEmpty(asins)) {
      return yield* Effect.fail(
        unavailable(
          statusBadRequest,
          'none of those titles are in your Audible library',
        ),
      )
    }
    const frames = yield* importEventsOf(owner, credentials, library, asins)
    const answer: AudibleResponse = { _tag: 'Events', frames }
    return answer
  })

const routed = (request: AudibleRequest, owner: ImportOwner) => {
  const method = request.method.toUpperCase()
  const isPost = method === 'POST'
  const wrongMethod = Effect.fail(
    unavailable(statusMethodNotAllowed, 'that is not how to ask for this'),
  )
  if (request.path === audibleStartPath) {
    return isPost ? started(owner) : wrongMethod
  } else if (request.path === audibleFinishPath) {
    return isPost ? finished(owner, request.body) : wrongMethod
  } else if (request.path === audibleLibraryPath) {
    return method === 'GET' ? listed(owner) : wrongMethod
  } else if (request.path === audibleImportPath) {
    return isPost ? imported(owner, request.body) : wrongMethod
  } else {
    return Effect.fail(
      unavailable(statusNotFound, 'there is no such Audible import step'),
    )
  }
}

/**
 * Answers one request under `/__books/audible/`, and None for any other
 * path. A request without a verified Access login gets 401 before
 * anything else happens. Every refusal is a problem in JSON; nothing it
 * answers holds a token, a verifier, or a pasted address.
 *
 * @example
 * ```typescript
 * handleAudibleRequest({ method: 'GET', path: '/__books/audible/library', headers, remoteAddress, body: '' })
 * // Some({ _tag: 'Json', status: 200, body: '{"titles":[…]}' }), or status 409 with {"problem":{"_tag":"NotConnected"}}
 * ```
 */
export const handleAudibleRequest = (
  request: AudibleRequest,
): Effect.Effect<
  Option.Option<AudibleResponse>,
  never,
  AudibleServerServices
> =>
  String.startsWith(audiblePathPrefix)(request.path)
    ? Effect.gen(function* () {
        const members = yield* AudibleMembers
        const config = yield* AudibleServerConfig
        const maybeOwner = yield* members.ownerOf(request)
        if (Option.isNone(maybeOwner)) {
          config.log('audible: refused a request with no Access login')
          return Option.some(problemAnswer(statusNotSignedIn, NotSignedIn()))
        }
        const answer = yield* routed(request, maybeOwner.value).pipe(
          Effect.catch(refused =>
            Effect.succeed(problemAnswer(refused.status, refused.problem)),
          ),
        )
        return Option.some(answer)
      })
    : Effect.succeed(Option.none())
