import {
  Array,
  Cause,
  Context,
  Data,
  Effect,
  Layer,
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
import { type IdentityState, SignedIn, SignedOut } from './model.js'
import type { AppSchema } from './scribeSchema.js'

/** Which store operation failed. */
export type WordsStoreOperation =
  | 'ObserveIdentity'
  | 'ObserveRecordings'
  | 'ObserveRecording'
  | 'ObserveFileUrls'
  | 'FetchRecording'

/** An Instant query, observation, or sign-in check failed. */
export class WordsStoreError extends Data.TaggedError('WordsStoreError')<{
  readonly operation: WordsStoreOperation
  readonly cause: unknown
}> {}

/** Download URLs keyed by Instant file id. */
export type FileUrls = Readonly<Record<string, string>>

/** The Instant reads the web Scribe Program needs. */
export type WordsStoreService = Readonly<{
  observeIdentity: Stream.Stream<IdentityState, WordsStoreError>
  observeRecordings: (
    limit: number,
  ) => Stream.Stream<DecodedRecordingList, WordsStoreError>
  observeRecording: (
    recordingID: string,
  ) => Stream.Stream<DecodedRecordingDetail, WordsStoreError>
  observeFileUrls: (
    fileIDs: ReadonlyArray<string>,
  ) => Stream.Stream<FileUrls, WordsStoreError>
  hasRecording: (recordingID: string) => Effect.Effect<boolean, WordsStoreError>
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
    observeRecordings: limit =>
      observe<DecodedRecordingList>('ObserveRecordings', emit =>
        database.subscribeQuery(
          {
            recordings: {
              $: { order: { startedAtMs: 'desc' }, limit },
              previewSegmentA: {},
              previewSegmentB: {},
            },
          },
          response =>
            emitResponse(emit, response, data =>
              decodeRecordingList(data.recordings),
            ),
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
    observeRecordings: () => Stream.succeed(list),
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
  })
}
