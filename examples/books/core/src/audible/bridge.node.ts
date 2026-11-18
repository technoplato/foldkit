import {
  Array,
  Cause,
  Context,
  Data,
  Duration,
  Effect,
  Layer,
  Option,
  Queue,
  Redacted,
  Schema as S,
  Stream,
} from 'effect'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { Milliseconds } from '../ids.js'
import type { TitleDetails, TitleDetailsResult } from './libraryImport.js'
import { Asin, type ListedTitle } from './title.js'

// BRIDGE

/**
 * The Audible marketplaces the helper signs in to, by Audible's own
 * country code: `us` for audible.com, `uk` for audible.co.uk.
 */
export const AudibleLocale = S.Literals([
  'us',
  'uk',
  'de',
  'fr',
  'ca',
  'it',
  'au',
  'in',
  'jp',
  'es',
  'br',
])
/** An Audible marketplace. */
export type AudibleLocale = typeof AudibleLocale.Type

/**
 * What went wrong in the helper, as one word. `Missing` is a helper that
 * is not there, `TimedOut` one that took too long, and `Unreadable` one
 * that printed something this server cannot read; the rest are the
 * helper's own: a pasted address that does not match, a login Audible no
 * longer accepts, Amazon refusing or asking to slow down, the network.
 */
export const BridgeErrorKind = S.Literals([
  'AddressMismatch',
  'LoginExpired',
  'AmazonRefused',
  'RateLimited',
  'NetworkError',
  'BadInput',
  'NotAPipe',
  'Unexpected',
  'Missing',
  'TimedOut',
  'Unreadable',
])
/** What went wrong in the helper, as one word. */
export type BridgeErrorKind = typeof BridgeErrorKind.Type

/** The helper could not do it, and Amazon's short error code when it gave one. */
export class AudibleBridgeError extends Data.TaggedError('AudibleBridgeError')<{
  readonly kind: BridgeErrorKind
  readonly maybeCode: Option.Option<string>
}> {}

/**
 * An Amazon sign-in the helper started: the address to open, and the
 * verifier and device serial that finish it. The last two never leave
 * this server.
 */
export type PendingSignIn = Readonly<{
  loginUrl: string
  codeVerifier: Redacted.Redacted<string>
  serial: Redacted.Redacted<string>
  locale: AudibleLocale
}>

/**
 * The family member's Audible library as the helper read it: each title
 * in Books' shape, newest purchase first, and every row as Audible sent
 * it, podcasts and loans too, for the importer to sort out.
 */
export type BridgeLibrary = Readonly<{
  titles: ReadonlyArray<ListedTitle>
  items: ReadonlyArray<unknown>
}>

/**
 * Everything Books asks of Audible, through the helper beside the
 * toolshed's `fetch_library.py`: start a sign-in, finish it with the
 * pasted address into saved credentials, read the library, and read each
 * chosen title's chapters and place. Metadata only. Tests use a fake.
 */
export class AudibleBridge extends Context.Service<
  AudibleBridge,
  Readonly<{
    start: (
      locale: AudibleLocale,
    ) => Effect.Effect<PendingSignIn, AudibleBridgeError>
    finish: (
      input: Readonly<{
        redirectUrl: Redacted.Redacted<string>
        signIn: PendingSignIn
      }>,
    ) => Effect.Effect<Redacted.Redacted<string>, AudibleBridgeError>
    library: (
      credentials: Redacted.Redacted<string>,
    ) => Effect.Effect<BridgeLibrary, AudibleBridgeError>
    details: (
      credentials: Redacted.Redacted<string>,
      asins: ReadonlyArray<Asin>,
    ) => Stream.Stream<TitleDetailsResult, AudibleBridgeError>
  }>
>()('books/AudibleBridge') {}

// WIRE

const StartOutput = S.Struct({
  loginUrl: S.String,
  codeVerifier: S.String,
  serial: S.String,
})

const FinishOutput = S.Struct({ credentials: S.String })

const BridgeSeries = S.Struct({
  title: S.String,
  sequence: S.NullOr(S.String),
})

const BridgeTitle = S.Struct({
  asin: Asin,
  title: S.String,
  subtitle: S.NullOr(S.String),
  authors: S.Array(S.String),
  narrators: S.Array(S.String),
  series: S.Array(BridgeSeries),
  coverUrl: S.NullOr(S.String),
  runtimeMs: S.NullOr(S.Number),
})
type BridgeTitle = typeof BridgeTitle.Type

const LibraryOutput = S.Struct({
  titles: S.Array(BridgeTitle),
  items: S.Array(S.Unknown),
})

const BridgeChapter = S.Struct({
  title: S.String,
  startMs: S.Number,
  lengthMs: S.Number,
})

const DetailLine = S.Struct({
  asin: Asin,
  chapters: S.Array(BridgeChapter),
  runtimeMs: S.NullOr(S.Number),
  positionMs: S.NullOr(S.Number),
  positionUpdatedAt: S.NullOr(S.String),
  source: S.Unknown,
})
type DetailLine = typeof DetailLine.Type

const SkippedLine = S.Struct({
  asin: Asin,
  error: S.Struct({ kind: S.String, code: S.NullOr(S.String) }),
})

const DoneLine = S.Struct({ done: S.Literal(true) })

const ErrorOutput = S.Struct({
  error: S.Struct({ kind: S.String, code: S.NullOr(S.String) }),
})

const bridgeError = (
  kind: BridgeErrorKind,
  maybeCode: Option.Option<string> = Option.none(),
): AudibleBridgeError => new AudibleBridgeError({ kind, maybeCode })

const decodeJson = <A>(schema: S.Codec<A, unknown>, text: string) =>
  Effect.mapError(S.decodeUnknownEffect(S.fromJsonString(schema))(text), () =>
    bridgeError('Unreadable'),
  )

const errorOfOutput = (text: string): AudibleBridgeError =>
  Option.match(
    S.decodeUnknownOption(S.fromJsonString(ErrorOutput))(
      Option.getOrElse(Array.last(text.trim().split('\n')), () => ''),
    ),
    {
      onNone: () => bridgeError('Unexpected'),
      onSome: ({ error }) =>
        bridgeError(
          Option.getOrElse(
            S.decodeUnknownOption(BridgeErrorKind)(error.kind),
            () => 'Unexpected',
          ),
          Option.fromNullishOr(error.code),
        ),
    },
  )

const nonNegativeMs = (value: number): Milliseconds =>
  Milliseconds.make(Math.max(0, Math.round(value)))

const listedTitleOf = (title: BridgeTitle): ListedTitle => ({
  asin: title.asin,
  name: title.title,
  maybeSubtitle: Option.fromNullishOr(title.subtitle),
  authors: title.authors,
  narrators: title.narrators,
  series: Array.map(title.series, part => ({
    name: part.title,
    maybeSequence: Option.fromNullishOr(part.sequence),
  })),
  maybeCoverUrl: Option.fromNullishOr(title.coverUrl),
  maybeRuntimeMs: Option.map(
    Option.fromNullishOr(title.runtimeMs),
    nonNegativeMs,
  ),
})

const detailsOf = (line: DetailLine): TitleDetails => ({
  asin: line.asin,
  chapters: Array.map(line.chapters, chapter => ({
    name: chapter.title,
    startMs: nonNegativeMs(chapter.startMs),
    endMs: nonNegativeMs(chapter.startMs + chapter.lengthMs),
  })),
  maybeRuntimeMs: Option.map(
    Option.fromNullishOr(line.runtimeMs),
    nonNegativeMs,
  ),
  maybePosition: Option.map(
    Option.fromNullishOr(line.positionMs),
    positionMs => ({
      positionMs: nonNegativeMs(positionMs),
      maybeUpdatedAt: Option.fromNullishOr(line.positionUpdatedAt),
    }),
  ),
  source: line.source,
})

// PROCESS

/**
 * Where the helper is: the script, and the Python that runs it, which is
 * the toolshed folder's own `.venv` after `uv sync` there.
 */
export type BridgeProcess = Readonly<{ script: string; python: string }>

/** Where the helper sits in the toolshed checkout on this laptop. */
export const defaultBridgeScript = join(
  homedir(),
  'Development/Personal/psuedonymous/toolshed/references/audible-library/audible_bridge.py',
)

/**
 * The helper the environment names: `BOOKS_AUDIBLE_BRIDGE`, the script,
 * else the toolshed's, and `BOOKS_AUDIBLE_PYTHON`, else the `.venv`
 * beside the script.
 *
 * @example
 * ```typescript
 * bridgeProcessFromEnv({ BOOKS_AUDIBLE_BRIDGE: '/srv/toolshed/audible_bridge.py' })
 * // { script: '/srv/toolshed/audible_bridge.py', python: '/srv/toolshed/.venv/bin/python' }
 * ```
 */
export const bridgeProcessFromEnv = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): BridgeProcess => {
  const script = env['BOOKS_AUDIBLE_BRIDGE']?.trim() || defaultBridgeScript
  return {
    script,
    python:
      env['BOOKS_AUDIBLE_PYTHON']?.trim() ||
      join(dirname(script), '.venv', 'bin', 'python'),
  }
}

const startTimeoutMs = 30_000
const finishTimeoutMs = 60_000
const libraryTimeoutMs = 180_000
const detailTimeoutMs = 20_000
const maximumOutputBytes = 64 * 1024 * 1024

const childEnvironment = (): Readonly<Record<string, string>> => ({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  HOME: homedir(),
  LANG: 'en_US.UTF-8',
})

type Chunked = Readonly<{
  onLine: (line: string) => void
  onDone: (code: number | null, tail: string) => void
  onMissing: () => void
}>

/**
 * Runs the helper once with `input` on stdin. The helper gets only PATH,
 * HOME, and LANG, never this server's Instant tokens, and its stderr is
 * read and dropped, never logged. Returns a way to stop it.
 */
const runHelper = (
  helper: BridgeProcess,
  args: ReadonlyArray<string>,
  input: string,
  chunked: Chunked,
): (() => void) => {
  const child = spawn(helper.python, [helper.script, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: childEnvironment(),
  })
  let buffered = ''
  let seenBytes = 0
  let isTooLong = false
  child.on('error', () => {
    chunked.onMissing()
  })
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    seenBytes += chunk.length
    if (seenBytes > maximumOutputBytes) {
      isTooLong = true
      child.kill('SIGKILL')
      return
    }
    buffered += chunk
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    Array.forEach(lines, chunked.onLine)
  })
  child.stderr.resume()
  child.on('close', code => {
    chunked.onDone(isTooLong ? null : code, buffered)
  })
  child.stdin.on('error', () => {})
  child.stdin.end(input)
  return () => {
    child.kill('SIGKILL')
  }
}

const runToEnd = (
  helper: BridgeProcess,
  args: ReadonlyArray<string>,
  input: string,
  timeoutMs: number,
): Effect.Effect<string, AudibleBridgeError> =>
  Effect.callback<string, AudibleBridgeError>(resume => {
    const lines: Array<string> = []
    const stop = runHelper(helper, args, input, {
      onLine: line => {
        lines.push(line)
      },
      onDone: (code, tail) => {
        const output = Array.join([...lines, tail], '\n')
        if (code === 0) {
          resume(Effect.succeed(output))
        } else if (code === null) {
          resume(Effect.fail(bridgeError('Unreadable')))
        } else {
          resume(Effect.fail(errorOfOutput(output)))
        }
      },
      onMissing: () => {
        resume(Effect.fail(bridgeError('Missing')))
      },
    })
    return Effect.sync(stop)
  }).pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(timeoutMs),
      orElse: () => Effect.fail(bridgeError('TimedOut')),
    }),
  )

const decodeDetailLine = S.decodeUnknownOption(S.fromJsonString(DetailLine))

const decodeSkippedLine = S.decodeUnknownOption(S.fromJsonString(SkippedLine))

const decodeDoneLine = S.decodeUnknownOption(S.fromJsonString(DoneLine))

const decodeErrorLine = S.decodeUnknownOption(S.fromJsonString(ErrorOutput))

/**
 * The helper as the live bridge: one process per step, JSON on stdin, and
 * JSON back on stdout. Secrets go in on stdin, never as arguments, which
 * any process on the machine could read.
 *
 * @example
 * ```typescript
 * Layer.mergeAll(processBridge(bridgeProcessFromEnv()), …)
 * ```
 */
export const processBridge = (helper: BridgeProcess) =>
  Layer.succeed(AudibleBridge, {
    start: locale =>
      Effect.flatMap(
        runToEnd(helper, ['start', '--locale', locale], '', startTimeoutMs),
        text =>
          Effect.map(decodeJson(StartOutput, text), output => ({
            loginUrl: output.loginUrl,
            codeVerifier: Redacted.make(output.codeVerifier),
            serial: Redacted.make(output.serial),
            locale,
          })),
      ),
    finish: ({ redirectUrl, signIn }) =>
      Effect.flatMap(
        runToEnd(
          helper,
          ['finish', '--locale', signIn.locale],
          JSON.stringify({
            redirectUrl: Redacted.value(redirectUrl),
            codeVerifier: Redacted.value(signIn.codeVerifier),
            serial: Redacted.value(signIn.serial),
            locale: signIn.locale,
          }),
          finishTimeoutMs,
        ),
        text =>
          Effect.map(decodeJson(FinishOutput, text), output =>
            Redacted.make(output.credentials),
          ),
      ),
    library: credentials =>
      Effect.flatMap(
        runToEnd(
          helper,
          ['library'],
          JSON.stringify({ credentials: Redacted.value(credentials) }),
          libraryTimeoutMs,
        ),
        text =>
          Effect.map(decodeJson(LibraryOutput, text), output => ({
            titles: Array.map(output.titles, listedTitleOf),
            items: output.items,
          })),
      ),
    details: (credentials, asins) =>
      Stream.callback<TitleDetailsResult, AudibleBridgeError>(queue =>
        Effect.acquireRelease(
          Effect.sync(() =>
            runHelper(
              helper,
              ['details'],
              JSON.stringify({
                credentials: Redacted.value(credentials),
                asins,
              }),
              {
                onLine: line => {
                  const maybeDetail = decodeDetailLine(line)
                  const maybeSkipped = decodeSkippedLine(line)
                  if (Option.isSome(maybeDetail)) {
                    Queue.offerUnsafe(queue, {
                      asin: maybeDetail.value.asin,
                      maybeDetails: Option.some(detailsOf(maybeDetail.value)),
                    })
                  } else if (Option.isSome(maybeSkipped)) {
                    Queue.offerUnsafe(queue, {
                      asin: maybeSkipped.value.asin,
                      maybeDetails: Option.none(),
                    })
                  } else if (
                    Option.isNone(decodeDoneLine(line)) &&
                    Option.isNone(decodeErrorLine(line))
                  ) {
                    Queue.failCauseUnsafe(
                      queue,
                      Cause.fail(bridgeError('Unreadable')),
                    )
                  }
                },
                onDone: (code, tail) => {
                  if (code === 0) {
                    Queue.endUnsafe(queue)
                  } else {
                    Queue.failCauseUnsafe(
                      queue,
                      Cause.fail(
                        code === null
                          ? bridgeError('Unreadable')
                          : errorOfOutput(tail),
                      ),
                    )
                  }
                },
                onMissing: () => {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(bridgeError('Missing')),
                  )
                },
              },
            ),
          ),
          stop => Effect.sync(stop),
        ),
      ).pipe(
        Stream.timeoutOrElse({
          duration: Duration.millis(detailTimeoutMs),
          orElse: () => Stream.fail(bridgeError('TimedOut')),
        }),
      ),
  })
