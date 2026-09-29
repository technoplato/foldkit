import { Effect, Layer, Option, Stream } from 'effect'
import {
  Capture,
  ClipboardWriteError,
  ClipboardWriter,
  type WordsDatabase,
  WordsOrigin,
  WordsOriginError,
  type WordsOriginOperation,
  type WordsOriginService,
  accessIdentityPath,
  decodeAccessResponse,
  decodeSessionResponse,
  decodeTranscriptionTokenResponse,
  hostedSessionPath,
  scribeSchema,
  transcriptionTokenPath,
} from 'words-core-example'

import { init } from '@instantdb/core'

const appId = import.meta.env.VITE_INSTANT_APP_ID

/** Scribe's Instant app id, public, from the build environment. */
export const scribeInstantAppId = typeof appId === 'string' ? appId : ''

/** The Instant client for Scribe's app, the same app the iPhone writes. */
export const makeWordsDatabase = (): WordsDatabase =>
  init({ appId: scribeInstantAppId, schema: scribeSchema, devtool: false })

/** The system clipboard through the browser Clipboard API. */
export const browserClipboard = Layer.succeed(ClipboardWriter, {
  writeText: text =>
    Effect.tryPromise({
      try: () => navigator.clipboard.writeText(text),
      catch: cause => new ClipboardWriteError({ cause }),
    }),
})

const ORIGIN_TIMEOUT_MS = 5_000

const requestOrigin = <A>(
  operation: WordsOriginOperation,
  path: string,
  method: 'GET' | 'POST',
  decode: (status: number, body: unknown) => Effect.Effect<A, WordsOriginError>,
): Effect.Effect<A, WordsOriginError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(path, {
        method,
        credentials: 'include',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
      })
      const body: unknown = await response.json().catch(() => ({}))
      return { status: response.status, body }
    },
    catch: () =>
      new WordsOriginError({
        operation,
        reason: 'words.knophy.com did not answer within 5 seconds.',
      }),
  }).pipe(Effect.flatMap(({ status, body }) => decode(status, body)))

/** Web Scribe's requests to its own origin, with the Cloudflare Access cookie. */
export const browserOrigin: WordsOriginService = {
  checkAccess: requestOrigin(
    'CheckAccess',
    accessIdentityPath,
    'GET',
    decodeAccessResponse,
  ),
  mintSession: requestOrigin(
    'MintSession',
    hostedSessionPath,
    'GET',
    decodeSessionResponse,
  ),
  mintTranscriptionToken: requestOrigin(
    'MintTranscriptionToken',
    transcriptionTokenPath,
    'POST',
    decodeTranscriptionTokenResponse,
  ),
}

/** The origin requests as a Layer. */
export const browserOriginLayer = Layer.succeed(WordsOrigin, browserOrigin)

const deviceIconOf = (userAgent: string): string => {
  if (/iPhone|Android.+Mobile/.test(userAgent)) {
    return 'phone'
  } else if (/iPad|Android/.test(userAgent)) {
    return 'tablet'
  } else {
    return 'laptop'
  }
}

const buildInfo = Option.fromNullishOr(
  import.meta.env.VITE_WORDS_BUILD_COMMIT === undefined
    ? undefined
    : {
        branch: import.meta.env.VITE_WORDS_BUILD_BRANCH ?? 'unknown',
        builtAtISO8601: import.meta.env.VITE_WORDS_BUILD_TIME ?? '',
        commit: import.meta.env.VITE_WORDS_BUILD_COMMIT,
        worktree: import.meta.env.VITE_WORDS_BUILD_WORKTREE ?? 'unknown',
      },
)

const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
  event.preventDefault()
}

/**
 * The browser's clock, ids, device kind, and date format for new recordings,
 * and a guard that makes the browser ask before closing while recorded audio
 * is not saved yet.
 */
export const browserCaptureEnvironment = Layer.succeed(
  Capture.CaptureEnvironment,
  {
    now: Effect.sync(() => Date.now()),
    newRecordingID: Effect.sync(() => crypto.randomUUID()),
    deviceIcon: Effect.sync(() => deviceIconOf(navigator.userAgent)),
    titleDateLabel: startedAtMs =>
      Effect.sync(() =>
        new Date(startedAtMs).toLocaleDateString(undefined, {
          dateStyle: 'medium',
        }),
      ),
    maybeBuildInfo: Effect.succeed(buildInfo),
    guardPageClose: Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() =>
          window.addEventListener('beforeunload', warnBeforeUnload),
        ),
        () =>
          Effect.sync(() =>
            window.removeEventListener('beforeunload', warnBeforeUnload),
          ),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  },
)
