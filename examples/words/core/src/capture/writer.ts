import { Array, Context, Data, Duration, Effect, Layer, Option } from 'effect'

import { attachmentIDOf, audioStoragePathOf, lifecycleIDOf } from '../ids.js'
import type { WordsDatabase } from '../store.js'
import type { CaptureDraft } from './model.js'
import {
  type SegmentWrite,
  type TranscriptCounts,
  previewSlotOf,
  wordsJSONOf,
} from './segments.js'
import type { RecordedAudio } from './session.js'

/** Which recording write failed. */
export type RecordingWriteOperation =
  | 'ReadClientID'
  | 'CreateRecording'
  | 'WriteSegment'
  | 'WriteDuration'
  | 'StopRecording'
  | 'UploadAudio'
  | 'LinkAudio'

/** Instant refused a recording write, or did not confirm it in time. */
export class RecordingWriteError extends Data.TaggedError(
  'RecordingWriteError',
)<{
  readonly operation: RecordingWriteOperation
  readonly cause: unknown
}> {}

/** How a stopping recording ends: its length, speakers, last section, and totals. */
export type RecordingStop = Readonly<{
  durationSeconds: number
  maybeFinalWrite: Option.Option<SegmentWrite>
  counts: TranscriptCounts
}>

/**
 * The Instant writes a web recording makes, in exactly the shapes the iPhone
 * writes (Scribe `ScribeRecordingLibrary` and `InstantRecordingRealtime`), so
 * the iPhone lists, follows, and plays web recordings like its own.
 */
export type RecordingWriterService = Readonly<{
  activityClientID: Effect.Effect<string, RecordingWriteError>
  createRecording: (
    draft: CaptureDraft,
  ) => Effect.Effect<void, RecordingWriteError>
  writeSegment: (
    draft: CaptureDraft,
    write: SegmentWrite,
    counts: TranscriptCounts,
  ) => Effect.Effect<void, RecordingWriteError>
  writeDuration: (
    draft: CaptureDraft,
    durationSeconds: number,
  ) => Effect.Effect<void, RecordingWriteError>
  saveRecording: (
    draft: CaptureDraft,
    stop: RecordingStop,
    maybeAudio: Option.Option<RecordedAudio>,
  ) => Effect.Effect<number, RecordingWriteError>
}>

/** The Instant writes a web recording makes, chosen by the host. */
export class RecordingWriter extends Context.Service<
  RecordingWriter,
  RecordingWriterService
>()('words-core-example/RecordingWriter') {}

/** The descriptor stamped on a web recording's `transcriptions` row. */
export const webTranscriptionProvider = 'Deepgram'
/** The configuration name stamped on a web recording's `transcriptions` row. */
export const webTranscriptionConfigurationName = 'default'
/** The audio format the web records and uploads: 16 kHz mono 16-bit WAV. */
export const webTranscriptionConfiguration = {
  sampleRate: 16_000,
  channels: 1,
  language: 'en',
  diarizationEnabled: true,
}

const MILLISECONDS_PER_SECOND = 1_000
const BYTES_PER_MEGABYTE = 1_000_000
const WRITE_TIMEOUT_MS = 5_000
const UPLOAD_MS_PER_MEGABYTE = 1_000

const bounded = <A>(
  operation: RecordingWriteOperation,
  timeoutMs: number,
  run: () => Promise<A>,
): Effect.Effect<A, RecordingWriteError> =>
  Effect.tryPromise({
    try: run,
    catch: cause => new RecordingWriteError({ operation, cause }),
  }).pipe(
    Effect.timeout(Duration.millis(timeoutMs)),
    Effect.catchTag('TimeoutError', () =>
      Effect.fail(
        new RecordingWriteError({
          operation,
          cause: `Instant did not confirm the write within ${timeoutMs / MILLISECONDS_PER_SECOND} seconds.`,
        }),
      ),
    ),
  )

const present = <Chunk>(maybeChunk: Chunk | undefined): Chunk => {
  if (maybeChunk === undefined) {
    throw new Error('Instant has no transaction builder for this entity.')
  } else {
    return maybeChunk
  }
}

const speakersJSONOf = (speakerIDs: ReadonlyArray<number>) =>
  Array.map(speakerIDs, id => ({ id }))

const segmentRowOf = (
  draft: CaptureDraft,
  write: SegmentWrite,
  writtenAtMs: number,
) => {
  const startSeconds = Option.getOrElse(
    Option.map(Array.head(write.words), word => word.startSeconds),
    () => 0,
  )
  const endSeconds = Option.getOrElse(
    Option.map(Array.last(write.words), word => word.endSeconds),
    () => startSeconds,
  )
  return {
    ownerUserID: draft.ownerUserID,
    recordingID: draft.recordingID,
    transcriptionID: draft.transcriptionID,
    segmentIndex: write.index,
    startTimeSeconds: startSeconds,
    endTimeSeconds: endSeconds,
    wallClockStartedAtMs: Math.round(
      draft.startedAtMs + startSeconds * MILLISECONDS_PER_SECOND,
    ),
    wallClockEndedAtMs: Math.round(
      draft.startedAtMs + endSeconds * MILLISECONDS_PER_SECOND,
    ),
    text: Array.join(
      Array.map(write.words, word => word.text),
      ' ',
    ),
    speaker: Option.getOrNull(
      Option.flatMap(Array.head(write.words), word => word.maybeSpeaker),
    ),
    wordCount: Array.length(write.words),
    wordsJSON: wordsJSONOf(write.words),
    isFinal: write.isFinal,
    sentToInstantAtMs: writtenAtMs,
    updatedAtMs: writtenAtMs,
  }
}

const segmentChunks = (
  database: WordsDatabase,
  draft: CaptureDraft,
  write: SegmentWrite,
  counts: TranscriptCounts,
  writtenAtMs: number,
) => {
  const row = segmentRowOf(draft, write, writtenAtMs)
  const segment = write.isFirstWrite
    ? present(database.tx.transcriptionSegments[write.id])
        .update(row)
        .link({ recording: draft.recordingID })
    : present(database.tx.transcriptionSegments[write.id]).update(row)
  if (!write.isFinal) {
    return [segment]
  } else {
    const recording = present(database.tx.recordings[draft.recordingID]).update(
      { speakers: speakersJSONOf(counts.speakerIDs), updatedAtMs: writtenAtMs },
      { upsert: false },
    )
    const previewLink =
      previewSlotOf(write.index) === 'A'
        ? recording.link({ previewSegmentA: write.id })
        : recording.link({ previewSegmentB: write.id })
    return [
      segment,
      previewLink,
      present(database.tx.transcriptions[draft.transcriptionID]).update(
        {
          segmentCount: counts.segmentCount,
          wordCount: counts.wordCount,
          updatedAtMs: writtenAtMs,
        },
        { upsert: false },
      ),
    ]
  }
}

/** Recording writes against Scribe's Instant app, the same app the iPhone writes. */
export const makeLiveRecordingWriter = (database: WordsDatabase) =>
  Layer.succeed(RecordingWriter, {
    activityClientID: bounded('ReadClientID', WRITE_TIMEOUT_MS, () =>
      database.getLocalId('instant.client'),
    ),
    createRecording: draft =>
      bounded('CreateRecording', WRITE_TIMEOUT_MS, () => {
        const writtenAtMs = Date.now()
        return database.transact([
          present(database.tx.recordings[draft.recordingID])
            .update({
              title: draft.title,
              buildInfo: Option.getOrNull(draft.maybeBuildInfo),
              ownerUserID: draft.ownerUserID,
              deviceIcon: draft.deviceIcon,
              activityKind: 'active',
              activityClientID: draft.activityClientID,
              startedAtMs: draft.startedAtMs,
              durationSeconds: 0,
              audioFileURL: null,
              location: null,
              clipboardEntries: [],
              speakers: [],
              systemAudioContextEntries: [],
              media: [],
              updatedAtMs: writtenAtMs,
            })
            .link({ owner: draft.ownerUserID }),
          present(database.tx.transcriptions[draft.transcriptionID])
            .update({
              ownerUserID: draft.ownerUserID,
              recordingID: draft.recordingID,
              buildInfo: Option.getOrNull(draft.maybeBuildInfo),
              provider: webTranscriptionProvider,
              configurationName: webTranscriptionConfigurationName,
              configurationJSON: webTranscriptionConfiguration,
              startedAtMs: draft.startedAtMs,
              updatedAtMs: writtenAtMs,
              segmentCount: 0,
              wordCount: 0,
            })
            .link({ recording: draft.recordingID }),
        ])
      }).pipe(Effect.asVoid),
    writeSegment: (draft, write, counts) =>
      bounded('WriteSegment', WRITE_TIMEOUT_MS, () =>
        database.transact(
          segmentChunks(database, draft, write, counts, Date.now()),
        ),
      ).pipe(Effect.asVoid),
    writeDuration: (draft, durationSeconds) =>
      bounded('WriteDuration', WRITE_TIMEOUT_MS, () =>
        database.transact(
          present(database.tx.recordings[draft.recordingID]).update(
            { durationSeconds, updatedAtMs: Date.now() },
            { upsert: false },
          ),
        ),
      ).pipe(Effect.asVoid),
    saveRecording: (draft, stop, maybeAudio) =>
      Effect.gen(function* () {
        const lifecycleID = lifecycleIDOf(draft.recordingID, draft.startedAtMs)
        const storageName = audioStoragePathOf(
          draft.recordingID,
          draft.startedAtMs,
        )
        const attachmentID = yield* attachmentIDOf(
          lifecycleID,
          'audio',
          'audio',
        )
        const byteCount = Option.match(maybeAudio, {
          onNone: () => 0,
          onSome: audio => audio.wav.size,
        })
        yield* bounded('StopRecording', WRITE_TIMEOUT_MS, () => {
          const writtenAtMs = Date.now()
          const finalChunks = Option.match(stop.maybeFinalWrite, {
            onNone: () => [],
            onSome: write =>
              segmentChunks(database, draft, write, stop.counts, writtenAtMs),
          })
          const stopRecording = present(
            database.tx.recordings[draft.recordingID],
          ).update(
            {
              title: draft.title,
              durationSeconds: stop.durationSeconds,
              location: null,
              speakers: speakersJSONOf(stop.counts.speakerIDs),
              activityKind: null,
              activityClientID: null,
              updatedAtMs: writtenAtMs,
            },
            { upsert: false },
          )
          const attachment = Option.match(maybeAudio, {
            onNone: () => [],
            onSome: () => [
              present(database.tx.recordingAttachments[attachmentID])
                .update({
                  analysisCaptureContextJSON: null,
                  ownerUserID: draft.ownerUserID,
                  recordingID: draft.recordingID,
                  kind: 'audio',
                  lifecycleID,
                  timestampSeconds: null,
                  fileExtension: 'wav',
                  contentType: 'audio/wav',
                  byteCount,
                  storageName,
                  updatedAtMs: writtenAtMs,
                })
                .link({ recording: draft.recordingID }),
            ],
          })
          return database.transact([
            ...finalChunks,
            stopRecording,
            ...attachment,
          ])
        })
        if (Option.isSome(maybeAudio)) {
          const uploadTimeoutMs =
            WRITE_TIMEOUT_MS +
            Math.ceil(byteCount / BYTES_PER_MEGABYTE) * UPLOAD_MS_PER_MEGABYTE
          const upload = yield* bounded('UploadAudio', uploadTimeoutMs, () =>
            database.storage.uploadFile(storageName, maybeAudio.value.wav, {
              contentType: 'audio/wav',
            }),
          )
          yield* bounded('LinkAudio', WRITE_TIMEOUT_MS, () =>
            database.transact(
              present(database.tx.recordingAttachments[attachmentID]).update(
                {
                  ownerUserID: draft.ownerUserID,
                  recordingID: draft.recordingID,
                  lifecycleID,
                  byteCount,
                  streamID: null,
                  streamClientID: null,
                  storageFileID: upload.data.id,
                  storageName,
                  updatedAtMs: Date.now(),
                },
                { upsert: false },
              ),
            ),
          )
        }
        return byteCount
      }),
  })

/** A writer that accepts every write, for tests and previews. */
export const makeAcceptingRecordingWriter = (
  written: Array<string> = [],
): Layer.Layer<RecordingWriter> =>
  Layer.succeed(RecordingWriter, {
    activityClientID: Effect.succeed('test-client'),
    createRecording: draft =>
      Effect.sync(() => {
        written.push(`createRecording ${draft.recordingID}`)
      }),
    writeSegment: (_draft, write) =>
      Effect.sync(() => {
        written.push(
          `writeSegment ${write.index} ${write.isFinal ? 'final' : 'interim'}`,
        )
      }),
    writeDuration: (_draft, durationSeconds) =>
      Effect.sync(() => {
        written.push(`writeDuration ${durationSeconds}`)
      }),
    saveRecording: (_draft, stop, maybeAudio) =>
      Effect.sync(() => {
        written.push(`saveRecording ${stop.durationSeconds}`)
        return Option.match(maybeAudio, {
          onNone: () => 0,
          onSome: audio => audio.wav.size,
        })
      }),
  })
