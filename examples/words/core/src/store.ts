import {
  Array,
  Cause,
  Context,
  Data,
  Duration,
  Effect,
  Layer,
  Match as M,
  Option,
  Queue,
  Record,
  Stream,
} from 'effect'

import type { InstantCoreDatabase, User } from '@instantdb/core'

import {
  type DecodedRecordingDetail,
  type DecodedRecordingList,
  decodeRecordingDetail,
  decodeRecordingList,
} from './decode.js'
import { failureTextOf } from './failure.js'
import { type RecordingWindow, recordingWindowRangeOf } from './listWindow.js'
import { type IdentityState, SignedIn, SignedOut } from './model.js'
import * as Questions from './questions/index.js'
import type { AppSchema } from './scribeSchema.js'
import {
  decodeReceivedShares,
  decodeShareRecipients,
  decodeSharedRange,
  decodeShares,
} from './share/decode.js'
import type {
  RecordingShare,
  ShareRecipient,
  SharedRange,
} from './share/model.js'

/** Which store operation failed. */
export type WordsStoreOperation =
  | 'ObserveIdentity'
  | 'ObserveRecordings'
  | 'ObserveRecording'
  | 'ObserveFileUrls'
  | 'FetchRecording'
  | 'FetchSharedRange'
  | 'CheckSignIn'
  | 'SignIn'
  | 'SignInAsGuest'
  | 'SignOut'
  | 'ObserveShares'
  | 'ObserveShareRecipients'
  | 'ObserveReceivedShares'
  | 'ObserveSharedRange'
  | 'ObserveQuestions'

/** An Instant query, observation, or sign-in check failed. */
export class WordsStoreError extends Data.TaggedError('WordsStoreError')<{
  readonly operation: WordsStoreOperation
  readonly cause: unknown
}> {}

const storeFailureOf = (operation: WordsStoreOperation): string =>
  M.value(operation).pipe(
    M.withReturnType<string>(),
    M.when('ObserveIdentity', () => 'Scribe could not tell who is signed in.'),
    M.when('ObserveRecordings', () => 'The recordings did not load.'),
    M.when('ObserveRecording', () => 'The recording did not load.'),
    M.when('ObserveFileUrls', () => 'The audio and images did not load.'),
    M.when('FetchRecording', () => 'Scribe could not check the recording.'),
    M.when('FetchSharedRange', () => 'Scribe could not check the share.'),
    M.when('CheckSignIn', () => 'Scribe could not check the sign-in.'),
    M.when('SignIn', () => 'Signing in did not finish.'),
    M.when(
      'SignInAsGuest',
      () => 'Scribe could not open this share for reading.',
    ),
    M.when('SignOut', () => 'Signing out did not finish.'),
    M.when('ObserveShares', () => 'The shares did not load.'),
    M.when('ObserveShareRecipients', () => 'The suggestions did not load.'),
    M.when(
      'ObserveReceivedShares',
      () => 'The shares made to this account did not load.',
    ),
    M.when('ObserveSharedRange', () => 'The shared sections did not load.'),
    M.when('ObserveQuestions', () => 'Your questions did not load.'),
    M.exhaustive,
  )

/**
 * A store failure as the page says it: what did not happen, and its cause in
 * plain words when there is one to act on.
 *
 * @example
 * ```ts
 * storeFailureReasonOf(new WordsStoreError({ operation: 'ObserveRecording', cause: new TypeError('Failed to fetch') }))
 * // 'The recording did not load. The network connection dropped.'
 * ```
 */
export const storeFailureReasonOf = (error: WordsStoreError): string =>
  failureTextOf(storeFailureOf(error.operation), error.cause)

/** Download URLs keyed by Instant file id. */
export type FileUrls = Readonly<Record<string, string>>

/** The Instant user the browser is signed in as, when it is not a guest. */
export type InstantMember = Readonly<{ userID: string; email: string }>

/**
 * One snapshot of a list window: its rows, and whether the server has
 * recordings past its last page.
 */
export type RecordingListSnapshot = DecodedRecordingList &
  Readonly<{ hasOlder: boolean }>

const NEWEST_FIRST: Readonly<{ startedAtMs: 'desc' }> = { startedAtMs: 'desc' }

/**
 * The InstaQL the list sends for a window: the recordings newest first, with
 * the two preview slots. Only the top level is paginated; Instant ignores
 * pagination below it. The first window sends no offset, so its query is the
 * one the list has always sent.
 *
 * @example
 * ```ts
 * recordingListQueryOf({ firstPage: 2, pageCount: 3 })
 * // { recordings: { $: { order: { startedAtMs: 'desc' }, limit: 300, offset: 200 }, previewSegmentA: {}, previewSegmentB: {} } }
 * ```
 */
export const recordingListQueryOf = (window: RecordingWindow) => {
  const { limit, offset } = recordingWindowRangeOf(window)
  return {
    recordings: {
      $: {
        order: NEWEST_FIRST,
        limit,
        ...(offset > 0 ? { offset } : {}),
      },
      previewSegmentA: {},
      previewSegmentB: {},
    },
  }
}

/**
 * Whether the server has recordings past a window: its page info's
 * `hasNextPage` when it sent one, else whether the window came back full.
 * Instant computes `hasNextPage` before it applies permissions, so a window
 * can come back short while this is still true.
 */
export const hasOlderRecordingsOf = (
  rowCount: number,
  window: RecordingWindow,
  maybeHasNextPage: Option.Option<boolean>,
): boolean =>
  Option.getOrElse(
    maybeHasNextPage,
    () => rowCount >= recordingWindowRangeOf(window).limit,
  )

/** The Instant reads the web Scribe Program needs. */
export type WordsStoreService = Readonly<{
  observeIdentity: Stream.Stream<IdentityState, WordsStoreError>
  observeRecordings: (
    window: RecordingWindow,
  ) => Stream.Stream<RecordingListSnapshot, WordsStoreError>
  observeRecording: (
    recordingID: string,
  ) => Stream.Stream<DecodedRecordingDetail, WordsStoreError>
  observeFileUrls: (
    fileIDs: ReadonlyArray<string>,
  ) => Stream.Stream<FileUrls, WordsStoreError>
  hasRecording: (recordingID: string) => Effect.Effect<boolean, WordsStoreError>
  currentMember: Effect.Effect<Option.Option<InstantMember>, WordsStoreError>
  signInWithToken: (token: string) => Effect.Effect<void, WordsStoreError>
  /**
   * Signs a share link's reader in as an anonymous Instant guest: Scribe's
   * rules let a link holder read a share only when signed in (#754).
   */
  signInAsGuest: Effect.Effect<void, WordsStoreError>
  signOut: Effect.Effect<void, WordsStoreError>
  observeRecordingShares: (
    recordingID: string,
    ownerUserID: string,
  ) => Stream.Stream<ReadonlyArray<RecordingShare>, WordsStoreError>
  observeShareRecipients: (
    ownerUserID: string,
  ) => Stream.Stream<ReadonlyArray<ShareRecipient>, WordsStoreError>
  observeReceivedShares: (
    viewerUserID: string,
    maybeViewerEmail: Option.Option<string>,
  ) => Stream.Stream<ReadonlyArray<RecordingShare>, WordsStoreError>
  observeSharedRange: (
    shareID: string,
    maybeLinkToken: Option.Option<string>,
    maybeViewerUserID: Option.Option<string>,
  ) => Stream.Stream<Option.Option<SharedRange>, WordsStoreError>
  hasSharedRange: (
    shareID: string,
    maybeLinkToken: Option.Option<string>,
  ) => Effect.Effect<boolean, WordsStoreError>
  /**
   * His questions (Scribe ADR 0095), newest first, with their answers, the stretches of his words, and their topics.
   * The rules show each account its own.
   */
  observeQuestions: Stream.Stream<
    Readonly<{
      questions: ReadonlyArray<Questions.Model.Question>
      unreadableCount: number
      isLimitReached: boolean
    }>,
    WordsStoreError
  >
}>

/** The Instant reads the web Scribe Program needs, chosen by the host. */
export class WordsStore extends Context.Service<
  WordsStore,
  WordsStoreService
>()('words-core-example/WordsStore') {}

/** The Instant client for Scribe's app, typed by Scribe's own schema. */
export type WordsDatabase = InstantCoreDatabase<AppSchema, false>

type Emit<A> = Readonly<{
  value: (value: A) => void
  failure: (cause: unknown) => void
}>

const observe = <A>(
  operation: WordsStoreOperation,
  subscribe: (emit: Emit<A>) => () => void,
): Stream.Stream<A, WordsStoreError> =>
  Stream.callback<A, WordsStoreError>(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        subscribe({
          value: value => Queue.offerUnsafe(queue, value),
          failure: cause =>
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(new WordsStoreError({ operation, cause })),
            ),
        }),
      ),
      unsubscribe => Effect.sync(unsubscribe),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )

const identityOf = (maybeUser: Option.Option<User>): IdentityState =>
  Option.match(maybeUser, {
    onNone: () => SignedOut(),
    onSome: user =>
      SignedIn({
        userID: user.id,
        maybeEmail: Option.fromNullishOr(user.email),
        isGuest: user.isGuest,
      }),
  })

/**
 * How many of his newest questions the questions page reads (Scribe ADR 0095). Scribe's backfill keeps about 600
 * (#1176); 2,000 made-up questions with answers and topics read in 2.2 s (median of 5, 2.8 s at most) and search in
 * 2 ms, inside his ten seconds to find one. Past it the page says the oldest are left out.
 */
export const QUESTION_LIMIT = 2000

/** How many recent recipients autocomplete reads (ADR 0014). */
export const SHARE_RECIPIENT_LIMIT = 50

/** How many of the newest shares made to this account the list reads. */
export const RECEIVED_SHARE_LIMIT = 200

// NOTE: Instant's getAuth reads IndexedDB, which can hang in some browsers,
// so every auth step is bounded and fails loudly instead of waiting forever.
const AUTH_TIMEOUT = Duration.seconds(5)

const boundedAuth = <A>(
  operation: WordsStoreOperation,
  run: () => Promise<A>,
): Effect.Effect<A, WordsStoreError> =>
  Effect.tryPromise({
    try: run,
    catch: cause => new WordsStoreError({ operation, cause }),
  }).pipe(
    Effect.timeout(AUTH_TIMEOUT),
    Effect.catchTag('TimeoutError', cause =>
      Effect.fail(new WordsStoreError({ operation, cause })),
    ),
  )

const memberOf = (
  maybeUser: Option.Option<User>,
): Option.Option<InstantMember> =>
  Option.flatMap(maybeUser, user =>
    user.isGuest
      ? Option.none()
      : Option.map(Option.fromNullishOr(user.email), email => ({
          userID: user.id,
          email,
        })),
  )

const ruleParamsOf = (maybeLinkToken: Option.Option<string>) =>
  Option.match(maybeLinkToken, {
    onNone: () => ({}),
    onSome: k => ({ k }),
  })

const emitResponse = <Data, A>(
  emit: Emit<A>,
  response: Readonly<{ data?: Data | undefined; error?: unknown }>,
  toValue: (data: Data) => A,
): void => {
  if (response.error !== undefined) {
    emit.failure(response.error)
  } else if (response.data !== undefined) {
    emit.value(toValue(response.data))
  }
}

/**
 * Live Instant resources: the recording list, one recording with its segments
 * and attachments, and file download URLs, all observed live, so a recording
 * in progress on the iPhone streams in as it is transcribed.
 */
export const makeLiveWordsResources = (database: WordsDatabase) =>
  Layer.succeed(WordsStore, {
    observeIdentity: observe<IdentityState>('ObserveIdentity', emit =>
      database.subscribeAuth(auth => {
        if (auth.error !== undefined) {
          emit.failure(auth.error)
        } else {
          emit.value(identityOf(Option.fromNullishOr(auth.user)))
        }
      }),
    ),
    observeRecordings: window =>
      observe<RecordingListSnapshot>('ObserveRecordings', emit =>
        database.subscribeQuery(recordingListQueryOf(window), response =>
          emitResponse(emit, response, data => {
            const list = decodeRecordingList(data.recordings)
            return {
              ...list,
              hasOlder: hasOlderRecordingsOf(
                Array.length(data.recordings),
                window,
                Option.fromNullishOr(
                  response.pageInfo?.recordings?.hasNextPage,
                ),
              ),
            }
          }),
        ),
      ),
    observeRecording: recordingID =>
      observe<DecodedRecordingDetail>('ObserveRecording', emit =>
        database.subscribeQuery(
          {
            recordings: {
              $: { where: { id: recordingID } },
              segments: {},
              attachments: {},
            },
          },
          response =>
            emitResponse(emit, response, data =>
              decodeRecordingDetail(data.recordings),
            ),
        ),
      ),
    observeFileUrls: fileIDs =>
      Array.match(fileIDs, {
        onEmpty: () => Stream.succeed<FileUrls>({}),
        onNonEmpty: nonEmptyFileIDs =>
          observe<FileUrls>('ObserveFileUrls', emit =>
            database.subscribeQuery(
              {
                $files: { $: { where: { id: { $in: [...nonEmptyFileIDs] } } } },
              },
              response =>
                emitResponse(emit, response, data =>
                  Record.fromEntries(
                    Array.map(data.$files, file => [file.id, file.url]),
                  ),
                ),
            ),
          ),
      }),
    hasRecording: recordingID =>
      Effect.tryPromise({
        try: () =>
          database.queryOnce({
            recordings: { $: { where: { id: recordingID } } },
          }),
        catch: cause =>
          new WordsStoreError({ operation: 'FetchRecording', cause }),
      }).pipe(
        Effect.map(result => Array.isArrayNonEmpty(result.data.recordings)),
      ),
    currentMember: boundedAuth('CheckSignIn', () => database.getAuth()).pipe(
      Effect.map(user => memberOf(Option.fromNullishOr(user))),
    ),
    signInWithToken: token =>
      boundedAuth('SignIn', () => database.auth.signInWithToken(token)).pipe(
        Effect.asVoid,
      ),
    signInAsGuest: boundedAuth('SignInAsGuest', () =>
      database.auth.signInAsGuest(),
    ).pipe(Effect.asVoid),
    signOut: boundedAuth('SignOut', () => database.auth.signOut()),
    observeQuestions: observe<
      Readonly<{
        questions: ReadonlyArray<Questions.Model.Question>
        unreadableCount: number
        isLimitReached: boolean
      }>
    >('ObserveQuestions', emit =>
      database.subscribeQuery(
        {
          questions: {
            $: { order: { askedAtMs: 'desc' }, limit: QUESTION_LIMIT },
            answers: { moments: {} },
            moments: {},
            topics: {},
          },
        },
        response =>
          emitResponse(emit, response, data =>
            Questions.decodeQuestions(data.questions, QUESTION_LIMIT),
          ),
      ),
    ),
    observeRecordingShares: (recordingID, ownerUserID) =>
      observe<ReadonlyArray<RecordingShare>>('ObserveShares', emit =>
        database.subscribeQuery(
          {
            recordingSegmentShares: {
              $: {
                where: { recordingID, ownerUserID },
                order: { createdAtMs: 'desc' },
              },
            },
          },
          response =>
            emitResponse(emit, response, data =>
              decodeShares(data.recordingSegmentShares),
            ),
        ),
      ),
    observeShareRecipients: ownerUserID =>
      observe<ReadonlyArray<ShareRecipient>>('ObserveShareRecipients', emit =>
        database.subscribeQuery(
          {
            shareRecipients: {
              $: {
                where: { ownerUserID },
                order: { lastSharedAtMs: 'desc' },
                limit: SHARE_RECIPIENT_LIMIT,
              },
            },
          },
          response =>
            emitResponse(emit, response, data =>
              decodeShareRecipients(data.shareRecipients),
            ),
        ),
      ),
    observeReceivedShares: (viewerUserID, maybeViewerEmail) =>
      observe<ReadonlyArray<RecordingShare>>('ObserveReceivedShares', emit =>
        database.subscribeQuery(
          {
            recordingSegmentShares: {
              $: {
                where: Option.match(maybeViewerEmail, {
                  onNone: () => ({ 'readers.id': viewerUserID }),
                  onSome: email => ({
                    or: [
                      { recipientEmail: email.toLowerCase() },
                      { 'readers.id': viewerUserID },
                    ],
                  }),
                }),
                order: { createdAtMs: 'desc' },
                limit: RECEIVED_SHARE_LIMIT,
              },
            },
          },
          response =>
            emitResponse(emit, response, data =>
              decodeReceivedShares(data.recordingSegmentShares, viewerUserID),
            ),
        ),
      ),
    observeSharedRange: (shareID, maybeLinkToken, maybeViewerUserID) =>
      observe<Option.Option<SharedRange>>('ObserveSharedRange', emit =>
        database.subscribeQuery(
          {
            recordingSegmentShares: {
              $: { where: { id: shareID } },
              readers: {},
              // Readable only by the owner's own sign-ins: how the page knows the viewer's own share.
              owner: {},
              audioClip: {},
              scrubbedLines: {},
              scrubbedImages: { file: {} },
            },
          },
          response =>
            emitResponse(emit, response, data =>
              decodeSharedRange(data.recordingSegmentShares, maybeViewerUserID),
            ),
          { ruleParams: ruleParamsOf(maybeLinkToken) },
        ),
      ),
    hasSharedRange: (shareID, maybeLinkToken) =>
      Effect.tryPromise({
        try: () =>
          database.queryOnce(
            { recordingSegmentShares: { $: { where: { id: shareID } } } },
            { ruleParams: ruleParamsOf(maybeLinkToken) },
          ),
        catch: cause =>
          new WordsStoreError({ operation: 'FetchSharedRange', cause }),
      }).pipe(
        Effect.map(result =>
          Array.isArrayNonEmpty(result.data.recordingSegmentShares),
        ),
      ),
  })

/** Fixed data for one recording, as the static resources serve it. */
export type StaticRecording = Readonly<{
  detail: DecodedRecordingDetail
  fileUrls: FileUrls
}>

/** Deterministic resources for tests and previews. */
export const makeStaticWordsResources = (
  identity: IdentityState,
  list: DecodedRecordingList,
  recordings: Readonly<Record<string, StaticRecording>>,
) => {
  const fileUrls: FileUrls = Array.reduce(
    Record.values(recordings),
    {},
    (urls: FileUrls, recording) => ({ ...urls, ...recording.fileUrls }),
  )
  return Layer.succeed(WordsStore, {
    observeIdentity: Stream.succeed(identity),
    observeRecordings: () => Stream.succeed({ ...list, hasOlder: false }),
    observeRecording: recordingID =>
      Stream.succeed(
        Option.match(Record.get(recordings, recordingID), {
          onNone: () => ({
            maybeDetail: Option.none(),
            skipped: { count: 0, maybeFirstReason: Option.none() },
          }),
          onSome: recording => recording.detail,
        }),
      ),
    observeFileUrls: fileIDs =>
      Stream.succeed(
        Record.filter(fileUrls, (_url, fileID) =>
          Array.contains(fileIDs, fileID),
        ),
      ),
    hasRecording: recordingID =>
      Effect.succeed(Record.has(recordings, recordingID)),
    currentMember: Effect.succeed(
      M.value(identity).pipe(
        M.withReturnType<Option.Option<InstantMember>>(),
        M.tag('SignedIn', ({ userID, maybeEmail, isGuest }) =>
          isGuest
            ? Option.none()
            : Option.map(maybeEmail, email => ({ userID, email })),
        ),
        M.orElse(() => Option.none()),
      ),
    ),
    signInWithToken: () => Effect.void,
    signInAsGuest: Effect.void,
    signOut: Effect.void,
    observeRecordingShares: () => Stream.succeed([]),
    observeShareRecipients: () => Stream.succeed([]),
    observeReceivedShares: () => Stream.succeed([]),
    observeSharedRange: () => Stream.succeed(Option.none()),
    hasSharedRange: () => Effect.succeed(false),
    observeQuestions: Stream.succeed({
      questions: [],
      unreadableCount: 0,
      isLimitReached: false,
    }),
  })
}
