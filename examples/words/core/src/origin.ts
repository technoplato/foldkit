import { Context, Data, Effect, Match as M, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { type LiveBeat } from './recording.js'

/** The origin path that reports who Cloudflare Access says the listener is. */
export const accessIdentityPath = '/__words/access'

/** The origin path that mints an Instant session for the Access email. */
export const hostedSessionPath = '/__foldkit/hosted-identity/session'

/** The origin path that mints a short-lived live transcription token. */
export const transcriptionTokenPath = '/__words/transcription-token'

/**
 * The origin path that reads a recording's newest beat from its live room,
 * like `/__words/live-beat?recording=9a8b7c6d-…`.
 */
export const liveBeatPath = '/__words/live-beat'

/**
 * How the origin learned who the listener is: from Cloudflare Access on
 * words.knophy.com, or from the loopback preview's configured email.
 */
export const AccessSource = S.Literals(['CloudflareAccess', 'Loopback'])
/** How the origin learned who the listener is. */
export type AccessSource = typeof AccessSource.Type

/** Who Cloudflare Access says the listener is, and until when. */
export const AccessIdentity = S.Struct({
  email: S.String,
  source: AccessSource,
  maybeExpiresAtMs: S.Option(S.Number),
})
/** Who Cloudflare Access says the listener is, and until when. */
export type AccessIdentity = typeof AccessIdentity.Type

/**
 * Whether the Instant app the origin serves has ADR 0014's sharing fields.
 * Production waits for Michael's approval of the schema push, so the web
 * never writes fields production does not have yet.
 */
export const SharingMode = S.Literals(['Enabled', 'AwaitingSchema'])
/** Whether the Instant app the origin serves has ADR 0014's sharing fields. */
export type SharingMode = typeof SharingMode.Type

/** What the origin turns on for this site. */
export const OriginFeatures = S.Struct({ sharing: SharingMode })
/** What the origin turns on for this site. */
export type OriginFeatures = typeof OriginFeatures.Type

/**
 * The browser can sign in to the Scribe account for the Access email: the
 * account exists, or the origin creates it on sign-in because
 * `WORDS_CREATE_SCRIBE_ACCOUNT_FROM_ACCESS` is on.
 */
export const ScribeAccountReady = ts('ScribeAccountReady', {
  access: AccessIdentity,
  features: OriginFeatures,
})
/** Scribe's Instant app has no user for the Access email yet. */
export const ScribeAccountMissing = ts('ScribeAccountMissing', {
  access: AccessIdentity,
  features: OriginFeatures,
})
/** No Cloudflare Access identity reached the origin. */
export const AccessIdentityMissing = ts('AccessIdentityMissing')
/** What the origin found for the listener. */
export const AccessCheck = S.Union([
  ScribeAccountReady,
  ScribeAccountMissing,
  AccessIdentityMissing,
])
/** What the origin found for the listener. */
export type AccessCheck = typeof AccessCheck.Type

/** The body the origin answers the access check with, when it knows the listener. */
export const AccessResponseBody = S.Struct({
  email: S.String,
  source: AccessSource,
  expiresAtMs: S.optionalKey(S.Number),
  scribeAccount: S.Literals(['Exists', 'Missing']),
  accountCreation: S.optionalKey(S.Literals(['Enabled', 'Disabled'])),
  sharing: S.optionalKey(SharingMode),
})
/** The body the origin answers the access check with, when it knows the listener. */
export type AccessResponseBody = typeof AccessResponseBody.Type

/** An Instant refresh token the origin minted for the Access email. */
export const MintedSession = S.Struct({ email: S.String, token: S.String })
/** An Instant refresh token the origin minted for the Access email. */
export type MintedSession = typeof MintedSession.Type

/** The streaming speech service a transcription token opens. */
export const TranscriptionProvider = S.Literals(['Deepgram'])
/** The streaming speech service a transcription token opens. */
export type TranscriptionProvider = typeof TranscriptionProvider.Type

/**
 * A token that opens one live transcription stream from the browser. The
 * origin keeps the provider's API key; the token expires within a minute and
 * only opens a stream.
 */
export const TranscriptionToken = S.Struct({
  provider: TranscriptionProvider,
  accessToken: S.String,
  expiresInSeconds: S.Number,
  model: S.String,
})
/** A token that opens one live transcription stream from the browser. */
export type TranscriptionToken = typeof TranscriptionToken.Type

/**
 * The body the origin answers a live beat request with: the newest beat it
 * trusts, or `{}` when there is none, the recording is not the listener's, or
 * it has no live room.
 */
export const LiveBeatResponseBody = S.Struct({
  durationSeconds: S.optionalKey(S.Number),
  beatAtMs: S.optionalKey(S.Number),
})

/** The body the origin answers a refused request with. */
export const OriginErrorBody = S.Struct({ error: S.String })

/** Which origin request failed. */
export type WordsOriginOperation =
  | 'CheckAccess'
  | 'MintSession'
  | 'MintTranscriptionToken'
  | 'ReadLiveBeat'

/** An origin request failed; `reason` is written for the listener. */
export class WordsOriginError extends Data.TaggedError('WordsOriginError')<{
  readonly operation: WordsOriginOperation
  readonly reason: string
}> {}

/** The requests web Scribe makes to its own origin, words.knophy.com. */
export type WordsOriginService = Readonly<{
  checkAccess: Effect.Effect<AccessCheck, WordsOriginError>
  mintSession: Effect.Effect<MintedSession, WordsOriginError>
  mintTranscriptionToken: Effect.Effect<TranscriptionToken, WordsOriginError>
  readLiveBeat: (
    recordingID: string,
  ) => Effect.Effect<Option.Option<LiveBeat>, WordsOriginError>
}>

/** The requests web Scribe makes to its own origin, provided by the host. */
export class WordsOrigin extends Context.Service<
  WordsOrigin,
  WordsOriginService
>()('words-core-example/WordsOrigin') {}

const HTTP_OK = 200
const HTTP_UNAUTHORIZED = 401
const HTTP_CONFLICT = 409

const errorNameOf = (body: unknown): string =>
  Option.match(S.decodeUnknownOption(OriginErrorBody)(body), {
    onNone: () => 'UnknownError',
    onSome: ({ error }) => error,
  })

const originFailureOf = (operation: WordsOriginOperation): string =>
  M.value(operation).pipe(
    M.withReturnType<string>(),
    M.when(
      'CheckAccess',
      () => 'words.pisspoursoftware.xyz could not check your account.',
    ),
    M.when(
      'MintSession',
      () => 'words.pisspoursoftware.xyz could not sign you in.',
    ),
    M.when(
      'MintTranscriptionToken',
      () => 'Live transcription could not start.',
    ),
    M.when(
      'ReadLiveBeat',
      () =>
        "words.pisspoursoftware.xyz could not read the recording device's live beat.",
    ),
    M.exhaustive,
  )

const reasonForError = (operation: WordsOriginOperation, name: string) =>
  M.value(name).pipe(
    M.withReturnType<string>(),
    M.when(
      'MintUnavailable',
      () => 'words.pisspoursoftware.xyz could not reach Scribe.',
    ),
    M.when(
      'CheckUnavailable',
      () => 'words.pisspoursoftware.xyz could not reach Scribe.',
    ),
    M.when(
      'ConnectIPhoneFirst',
      () =>
        'Scribe has no account for this email yet. Sign in on the iPhone first.',
    ),
    M.when(
      'MissingAccessIdentity',
      () => 'Cloudflare Access did not say who you are.',
    ),
    M.when(
      'TranscriptionUnavailable',
      () =>
        'Live transcription is not set up on words.pisspoursoftware.xyz (no speech service key).',
    ),
    M.orElse(() => originFailureOf(operation)),
  )

const failure = (operation: WordsOriginOperation, body: unknown) =>
  new WordsOriginError({
    operation,
    reason: reasonForError(operation, errorNameOf(body)),
  })

/**
 * Reads the origin's answer to the access check. `401` means no Access
 * identity; any other refusal is an error the page shows.
 */
export const decodeAccessResponse = (
  status: number,
  body: unknown,
): Effect.Effect<AccessCheck, WordsOriginError> => {
  if (status === HTTP_UNAUTHORIZED) {
    return Effect.succeed(AccessIdentityMissing())
  } else if (status !== HTTP_OK) {
    return Effect.fail(failure('CheckAccess', body))
  } else {
    return Option.match(S.decodeUnknownOption(AccessResponseBody)(body), {
      onNone: () =>
        Effect.fail(
          new WordsOriginError({
            operation: 'CheckAccess',
            reason:
              'words.pisspoursoftware.xyz answered the access check in a new shape.',
          }),
        ),
      onSome: response => {
        const access: AccessIdentity = {
          email: response.email,
          source: response.source,
          maybeExpiresAtMs: Option.fromNullishOr(response.expiresAtMs),
        }
        const features: OriginFeatures = {
          sharing: response.sharing ?? 'AwaitingSchema',
        }
        const isReady =
          response.scribeAccount === 'Exists' ||
          response.accountCreation === 'Enabled'
        return Effect.succeed(
          isReady
            ? ScribeAccountReady({ access, features })
            : ScribeAccountMissing({ access, features }),
        )
      },
    })
  }
}

/** Reads the origin's answer to a session mint. */
export const decodeSessionResponse = (
  status: number,
  body: unknown,
): Effect.Effect<MintedSession, WordsOriginError> => {
  if (status !== HTTP_OK) {
    return Effect.fail(
      failure(
        'MintSession',
        status === HTTP_CONFLICT ? { error: 'ConnectIPhoneFirst' } : body,
      ),
    )
  } else {
    return Option.match(S.decodeUnknownOption(MintedSession)(body), {
      onNone: () =>
        Effect.fail(
          new WordsOriginError({
            operation: 'MintSession',
            reason:
              'words.pisspoursoftware.xyz answered the sign-in in a new shape.',
          }),
        ),
      onSome: Effect.succeed,
    })
  }
}

/** Reads the origin's answer to a transcription token request. */
export const decodeTranscriptionTokenResponse = (
  status: number,
  body: unknown,
): Effect.Effect<TranscriptionToken, WordsOriginError> => {
  if (status !== HTTP_OK) {
    return Effect.fail(failure('MintTranscriptionToken', body))
  } else {
    return Option.match(S.decodeUnknownOption(TranscriptionToken)(body), {
      onNone: () =>
        Effect.fail(
          new WordsOriginError({
            operation: 'MintTranscriptionToken',
            reason:
              'words.pisspoursoftware.xyz answered the transcription token request in a new shape.',
          }),
        ),
      onSome: Effect.succeed,
    })
  }
}

/** Reads the origin's answer to a live beat request: the newest beat it trusts, if any. */
export const decodeLiveBeatResponse = (
  status: number,
  body: unknown,
): Effect.Effect<Option.Option<LiveBeat>, WordsOriginError> => {
  if (status !== HTTP_OK) {
    return Effect.fail(failure('ReadLiveBeat', body))
  } else {
    return Option.match(S.decodeUnknownOption(LiveBeatResponseBody)(body), {
      onNone: () =>
        Effect.fail(
          new WordsOriginError({
            operation: 'ReadLiveBeat',
            reason:
              'words.pisspoursoftware.xyz answered the live beat request in a new shape.',
          }),
        ),
      onSome: ({ durationSeconds, beatAtMs }) =>
        Effect.succeed(
          Option.all({
            durationSeconds: Option.fromNullishOr(durationSeconds),
            beatAtMs: Option.fromNullishOr(beatAtMs),
          }),
        ),
    })
  }
}

/** Whether two emails name the same account; email case does not matter. */
export const isSameEmail = (first: string, second: string): boolean =>
  first.trim().toLowerCase() === second.trim().toLowerCase()
