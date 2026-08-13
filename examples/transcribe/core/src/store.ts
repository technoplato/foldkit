import {
  Array,
  Cause,
  Context,
  Data,
  Effect,
  Layer,
  Order,
  Queue,
  Schema as S,
  Stream,
} from "effect"

import {
  Transcript,
  TranscriptFrame,
  TranscriptStatus,
  seedTranscripts,
} from "./catalog.js"

/** A catalog query or observation failed. */
export class TranscribeStoreError extends Data.TaggedError("TranscribeStoreError")<{
  readonly cause: unknown
  readonly operation: "Fetch" | "Observe"
}> {}

/** One catalog snapshot with its source. */
export const TranscribeSnapshot = S.Struct({
  jobs: S.Array(Transcript),
  source: S.Literals(["Instant", "StaticFallback"]),
})
/** One catalog snapshot with its source. */
export type TranscribeSnapshot = typeof TranscribeSnapshot.Type

/** The side-effecting catalog capability required by the Transcribe Program. */
export type TranscribeStoreService = Readonly<{
  fetch: Effect.Effect<TranscribeSnapshot, TranscribeStoreError>
  observe: Stream.Stream<TranscribeSnapshot, TranscribeStoreError>
}>

/** An injected Transcribe catalog whose implementation is selected by the host. */
export class TranscribeStore extends Context.Service<
  TranscribeStore,
  TranscribeStoreService
>()("transcribe-core-example/TranscribeStore") {}

const InstantTranscriptRecord = S.Struct({
  analysis: S.String,
  createdAt: S.Number,
  id: S.String,
  slug: S.String,
  status: TranscriptStatus,
  title: S.String,
  transcriptText: S.String,
  url: S.String,
  videoId: S.String,
})

const InstantFrameRecord = S.Struct({
  caption: S.String,
  id: S.String,
  imagePath: S.optionalKey(S.String),
  imageUrl: S.optionalKey(S.String),
  index: S.Number,
  tSec: S.Number,
  transcriptId: S.String,
})

const transcribeQuery = {
  knophyTranscripts: {},
  knophyTranscriptFrames: {},
} as const

const byCreatedAt = Order.mapInput(Order.Number, (job: Transcript) => -job.createdAt)

const byIndex = Order.mapInput(Order.Number, (frame: TranscriptFrame) => frame.index)

const decodeFrames = (rows: ReadonlyArray<unknown>): ReadonlyArray<TranscriptFrame> => {
  const decoded = rows.flatMap(row => {
    const parsed = S.decodeUnknownOption(InstantFrameRecord)(row)
    return parsed._tag === "Some" ? [parsed.value] : []
  })
  return Array.sort(decoded, byIndex)
}

const decodeJobs = (
  transcriptRows: ReadonlyArray<unknown>,
  frameRows: ReadonlyArray<unknown>,
): ReadonlyArray<Transcript> => {
  const frames = decodeFrames(frameRows)
  const decoded = transcriptRows.flatMap(row => {
    const parsed = S.decodeUnknownOption(InstantTranscriptRecord)(row)
    if (parsed._tag === "None") {
      return []
    }
    const record = parsed.value
    const jobFrames = Array.filter(frames, frame => frame.transcriptId === record.id)
    return [
      Transcript.make({
        ...record,
        frames: jobFrames,
      }),
    ]
  })
  return Array.sort(decoded, byCreatedAt)
}

/** Minimal Instant client used by the live Transcribe store. */
export type TranscribeInstantClient = Readonly<{
  queryOnce: (query: typeof transcribeQuery) => Promise<{
    data: {
      knophyTranscripts: ReadonlyArray<unknown>
      knophyTranscriptFrames: ReadonlyArray<unknown>
    }
  }>
  subscribeQuery: (
    query: typeof transcribeQuery,
    onResponse: (response: {
      data?: {
        knophyTranscripts: ReadonlyArray<unknown>
        knophyTranscriptFrames: ReadonlyArray<unknown>
      }
      error?: unknown
    }) => void,
  ) => () => void
}>

const snapshotFromRows = (
  transcripts: ReadonlyArray<unknown>,
  frames: ReadonlyArray<unknown>,
): TranscribeSnapshot => {
  const jobs = decodeJobs(transcripts, frames)
  if (jobs.length === 0) {
    return TranscribeSnapshot.make({ jobs: seedTranscripts, source: "StaticFallback" })
  }
  return TranscribeSnapshot.make({ jobs, source: "Instant" })
}

/** Deterministic resources for tests, previews, and offline Clients. */
export const StaticTranscribeResources = Layer.succeed(TranscribeStore, {
  fetch: Effect.succeed(
    TranscribeSnapshot.make({ jobs: seedTranscripts, source: "StaticFallback" }),
  ),
  observe: Stream.succeed(
    TranscribeSnapshot.make({ jobs: seedTranscripts, source: "StaticFallback" }),
  ),
})

/** Live Instant resources for browser, native, CLI, and TUI Clients. */
export const makeLiveTranscribeResources = (database: TranscribeInstantClient) =>
  Layer.succeed(TranscribeStore, {
    fetch: Effect.tryPromise({
      try: async () => {
        const response = await database.queryOnce(transcribeQuery)
        return snapshotFromRows(
          response.data.knophyTranscripts,
          response.data.knophyTranscriptFrames,
        )
      },
      catch: cause => new TranscribeStoreError({ cause, operation: "Fetch" }),
    }),
    observe: Stream.callback<TranscribeSnapshot, TranscribeStoreError>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(transcribeQuery, response => {
            if (response.error !== undefined) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new TranscribeStoreError({
                    cause: response.error,
                    operation: "Observe",
                  }),
                ),
              )
            } else {
              const transcripts =
                response.data === undefined ? [] : response.data.knophyTranscripts
              const frames =
                response.data === undefined ? [] : response.data.knophyTranscriptFrames
              Queue.offerUnsafe(queue, snapshotFromRows(transcripts, frames))
            }
          }),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  })
