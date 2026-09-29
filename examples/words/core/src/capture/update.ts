import { Array, Effect, Match as M, Option, Schema as S, String } from 'effect'
import { Command } from 'foldkit'
import { evo } from 'foldkit/struct'

import { transcriptionIDOf } from '../ids.js'
import {
  CompletedPauseCapture,
  CompletedRequestFinishCapture,
  CompletedResumeCapture,
  FailedCreateRecording,
  FailedPrepareCapture,
  FailedSaveRecording,
  FailedWriteDuration,
  FailedWriteSegment,
  type Message,
  type OutMessage,
  PreparedCapture,
  SavedRecording,
  StartedRecording,
  SucceededCreateRecording,
  SucceededSaveRecording,
  SucceededWriteDuration,
  SucceededWriteSegment,
} from './message.js'
import {
  CaptureDraft,
  Capturing,
  FailedSave,
  FailedStart,
  LEVEL_HISTORY_LENGTH,
  type Model,
  NotCapturing,
  PendingSave,
  PreparingCapture,
  SavingCapture,
  StartingCapture,
  StoppingCapture,
  type TranscriptProgress,
  type TranscriptResult,
  canStart,
  emptyProgress,
  silentLevels,
} from './model.js'
import {
  SegmentWrite,
  TranscriptCounts,
  applyTranscriptResult,
  countsOf,
  settleOpenSegment,
} from './segments.js'
import {
  CaptureEnvironment,
  CaptureSession,
  type CaptureSessionService,
} from './session.js'
import {
  type RecordingWriteError,
  RecordingWriter,
  webTranscriptionConfiguration,
  webTranscriptionConfigurationName,
  webTranscriptionProvider,
} from './writer.js'

/** How often, in whole seconds of audio, the recording's length is written, as on the iPhone. */
export const DURATION_WRITE_INTERVAL_SECONDS = 5

const TITLE_NUMBER_DIGITS = 3

/**
 * What the page knows that the recorder needs: who is signed in, and the next
 * title number once the recording list has loaded.
 */
export type CaptureContext = Readonly<{
  maybeOwnerUserID: Option.Option<string>
  maybeNextTitleNumber: Option.Option<number>
}>

type Services = RecordingWriter | CaptureEnvironment | CaptureSessionService
type Commands = ReadonlyArray<Command.Command<Message, never, Services>>

/** The recorder update's result: the next Model, its Commands, and what it tells the page. */
export type UpdateReturn = readonly [Model, Commands, Option.Option<OutMessage>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const writeReasonOf = (error: RecordingWriteError): string =>
  `${error.operation}: ${error.cause instanceof Error ? error.cause.message : globalThis.String(error.cause)}`

/**
 * A web recording's title, in the iPhone's format: `Recording 019 — Sep 28, 2026`.
 * The number continues from the highest one in the account's recordings.
 */
export const recordingTitleOf = (titleNumber: number, dateLabel: string) =>
  `Recording ${String.padStart(TITLE_NUMBER_DIGITS, '0')(globalThis.String(titleNumber))} — ${dateLabel}`

// COMMAND

/** Picks the new recording's ids, start time, title, device, and activity owner. */
export const PrepareCapture = Command.define(
  'PrepareCapture',
  { ownerUserID: S.String, titleNumber: S.Number },
  PreparedCapture,
  FailedPrepareCapture,
)(({ ownerUserID, titleNumber }) =>
  Effect.gen(function* () {
    const environment = yield* CaptureEnvironment
    const writer = yield* RecordingWriter
    const recordingID = yield* environment.newRecordingID
    const startedAtMs = yield* environment.now
    const dateLabel = yield* environment.titleDateLabel(startedAtMs)
    const deviceIcon = yield* environment.deviceIcon
    const maybeBuildInfo = yield* environment.maybeBuildInfo
    const activityClientID = yield* writer.activityClientID
    return PreparedCapture({
      draft: {
        recordingID,
        transcriptionID: transcriptionIDOf(
          recordingID,
          webTranscriptionProvider,
          webTranscriptionConfigurationName,
          webTranscriptionConfiguration,
        ),
        ownerUserID,
        activityClientID,
        startedAtMs,
        title: recordingTitleOf(titleNumber, dateLabel),
        deviceIcon,
        maybeBuildInfo,
      },
    })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedPrepareCapture({ reason: writeReasonOf(error) })),
    ),
  ),
)

/** Creates the recording and its transcription row in one Instant transaction. */
export const CreateRecording = Command.define(
  'CreateRecording',
  { draft: CaptureDraft },
  SucceededCreateRecording,
  FailedCreateRecording,
)(({ draft }) =>
  RecordingWriter.pipe(
    Effect.flatMap(writer => writer.createRecording(draft)),
    Effect.as(SucceededCreateRecording()),
    Effect.catch(error =>
      Effect.succeed(FailedCreateRecording({ reason: writeReasonOf(error) })),
    ),
  ),
)

/** Writes one transcript section, and on a final section the recording's preview slot and totals. */
export const WriteSegment = Command.define(
  'WriteSegment',
  { draft: CaptureDraft, write: SegmentWrite, counts: TranscriptCounts },
  SucceededWriteSegment,
  FailedWriteSegment,
)(({ draft, write, counts }) =>
  RecordingWriter.pipe(
    Effect.flatMap(writer => writer.writeSegment(draft, write, counts)),
    Effect.as(SucceededWriteSegment()),
    Effect.catch(error =>
      Effect.succeed(FailedWriteSegment({ reason: writeReasonOf(error) })),
    ),
  ),
)

/** Writes the recording's running length. */
export const WriteDuration = Command.define(
  'WriteDuration',
  { draft: CaptureDraft, durationSeconds: S.Number },
  SucceededWriteDuration,
  FailedWriteDuration,
)(({ draft, durationSeconds }) =>
  RecordingWriter.pipe(
    Effect.flatMap(writer => writer.writeDuration(draft, durationSeconds)),
    Effect.as(SucceededWriteDuration()),
    Effect.catch(error =>
      Effect.succeed(FailedWriteDuration({ reason: writeReasonOf(error) })),
    ),
  ),
)

/** Pauses the microphone; the transcriber stays connected. */
export const PauseCapture = Command.define(
  'PauseCapture',
  CompletedPauseCapture,
)(
  CaptureSession.get.pipe(
    Effect.flatMap(session => session.pause),
    Effect.as(CompletedPauseCapture()),
    Effect.catchTag('ResourceNotAvailable', () =>
      Effect.succeed(CompletedPauseCapture()),
    ),
  ),
)

/** Resumes the microphone. */
export const ResumeCapture = Command.define(
  'ResumeCapture',
  CompletedResumeCapture,
)(
  CaptureSession.get.pipe(
    Effect.flatMap(session => session.resume),
    Effect.as(CompletedResumeCapture()),
    Effect.catchTag('ResourceNotAvailable', () =>
      Effect.succeed(CompletedResumeCapture()),
    ),
  ),
)

/** Stops the microphone and asks the transcriber for its last words; the session reports when it is done. */
export const RequestFinishCapture = Command.define(
  'RequestFinishCapture',
  CompletedRequestFinishCapture,
)(
  CaptureSession.get.pipe(
    Effect.flatMap(session => session.finish),
    Effect.as(CompletedRequestFinishCapture()),
    Effect.catchTag('ResourceNotAvailable', () =>
      Effect.succeed(CompletedRequestFinishCapture()),
    ),
  ),
)

/**
 * Writes the last section, stops the recording in Instant (clearing its live
 * activity), and uploads the audio as the iPhone does: an attachment row, the
 * WAV in Instant storage, then the attachment's file id.
 */
export const SaveRecording = Command.define(
  'SaveRecording',
  { draft: CaptureDraft, save: PendingSave },
  SucceededSaveRecording,
  FailedSaveRecording,
)(({ draft, save }) =>
  Effect.gen(function* () {
    const writer = yield* RecordingWriter
    const maybeAudio = save.isKeepingAudio
      ? Option.some(
          yield* CaptureSession.get.pipe(
            Effect.flatMap(session => session.recordedAudio),
          ),
        )
      : Option.none()
    const byteCount = yield* writer.saveRecording(
      draft,
      {
        durationSeconds: save.durationSeconds,
        maybeFinalWrite: save.maybeFinalWrite,
        counts: save.counts,
      },
      maybeAudio,
    )
    return SucceededSaveRecording({ byteCount })
  }).pipe(
    Effect.catchTags({
      RecordingWriteError: error =>
        Effect.succeed(FailedSaveRecording({ reason: writeReasonOf(error) })),
      CaptureSessionError: error =>
        Effect.succeed(FailedSaveRecording({ reason: error.reason })),
      ResourceNotAvailable: () =>
        Effect.succeed(
          FailedSaveRecording({
            reason: 'The recorded audio is no longer in this browser.',
          }),
        ),
    }),
  ),
)

// UPDATE

const noOutMessage = Option.none<OutMessage>()

const withState = (model: Model, state: Model['state']): Model =>
  evo(model, { state: () => state })

const writesFor = (
  draft: CaptureDraft,
  step: Readonly<{
    progress: TranscriptProgress
    writes: ReadonlyArray<SegmentWrite>
  }>,
): Commands =>
  Array.map(step.writes, write =>
    WriteSegment({ draft, write, counts: countsOf(step.progress) }),
  )

const shiftLevels = (
  levels: ReadonlyArray<number>,
  level: number,
): ReadonlyArray<number> =>
  Array.takeRight([...levels, level], LEVEL_HISTORY_LENGTH)

const stop = (
  model: Model,
  draft: CaptureDraft,
  recordedSeconds: number,
  progress: TranscriptProgress,
): UpdateReturn => [
  withState(model, StoppingCapture({ draft, recordedSeconds, progress })),
  [RequestFinishCapture()],
  noOutMessage,
]

const startSaving = (
  model: Model,
  draft: CaptureDraft,
  recordedSeconds: number,
  progress: TranscriptProgress,
): UpdateReturn => {
  const settled = settleOpenSegment(draft.recordingID, progress)
  const save = {
    durationSeconds: recordedSeconds,
    maybeFinalWrite: Array.head(settled.writes),
    counts: countsOf(settled.progress),
    isKeepingAudio: true,
  }
  return [
    withState(model, SavingCapture({ draft, save })),
    [SaveRecording({ draft, save })],
    noOutMessage,
  ]
}

const inCapturing = (
  model: Model,
  transform: (capturing: typeof Capturing.Type) => UpdateReturn,
): UpdateReturn =>
  M.value(model.state).pipe(
    withUpdateReturn,
    M.tag('Capturing', transform),
    M.orElse(() => [model, [], noOutMessage]),
  )

const heardProgress = (
  model: Model,
  recordedSeconds: number,
  level: number,
): UpdateReturn =>
  M.value(model.state).pipe(
    withUpdateReturn,
    M.tag('Capturing', capturing => {
      const nextDurationWrittenSeconds =
        Math.floor(recordedSeconds / DURATION_WRITE_INTERVAL_SECONDS) *
        DURATION_WRITE_INTERVAL_SECONDS
      const isDurationDue =
        nextDurationWrittenSeconds > capturing.durationWrittenSeconds
      return [
        withState(
          model,
          evo(capturing, {
            recordedSeconds: () => recordedSeconds,
            levels: levels => shiftLevels(levels, level),
            durationWrittenSeconds: () =>
              isDurationDue
                ? nextDurationWrittenSeconds
                : capturing.durationWrittenSeconds,
          }),
        ),
        isDurationDue
          ? [
              WriteDuration({
                draft: capturing.draft,
                durationSeconds: nextDurationWrittenSeconds,
              }),
            ]
          : [],
        noOutMessage,
      ]
    }),
    M.tag('StoppingCapture', stopping => [
      withState(
        model,
        evo(stopping, { recordedSeconds: () => recordedSeconds }),
      ),
      [],
      noOutMessage,
    ]),
    M.orElse(() => [model, [], noOutMessage]),
  )

const heardTranscript = (
  model: Model,
  result: TranscriptResult,
): UpdateReturn =>
  M.value(model.state).pipe(
    withUpdateReturn,
    M.tag('Capturing', capturing => {
      const step = applyTranscriptResult(
        capturing.draft.recordingID,
        capturing.progress,
        result,
      )
      return [
        withState(model, evo(capturing, { progress: () => step.progress })),
        writesFor(capturing.draft, step),
        noOutMessage,
      ]
    }),
    M.tag('StoppingCapture', stopping => {
      const step = applyTranscriptResult(
        stopping.draft.recordingID,
        stopping.progress,
        result,
      )
      return [
        withState(model, evo(stopping, { progress: () => step.progress })),
        writesFor(stopping.draft, step),
        noOutMessage,
      ]
    }),
    M.orElse(() => [model, [], noOutMessage]),
  )

const retrySave = (model: Model, isKeepingAudio: boolean): UpdateReturn =>
  M.value(model.state).pipe(
    withUpdateReturn,
    M.tag('FailedSave', ({ draft, save }) => {
      const nextSave = evo(save, { isKeepingAudio: () => isKeepingAudio })
      return [
        withState(model, SavingCapture({ draft, save: nextSave })),
        [SaveRecording({ draft, save: nextSave })],
        noOutMessage,
      ]
    }),
    M.orElse(() => [model, [], noOutMessage]),
  )

/** Folds one recorder Message into the recorder Model. */
export const update = (
  model: Model,
  message: Message,
  context: CaptureContext,
): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedStartRecording: () => {
        if (!canStart(model)) {
          return [model, [], noOutMessage]
        } else {
          return Option.match(
            Option.all({
              ownerUserID: context.maybeOwnerUserID,
              titleNumber: context.maybeNextTitleNumber,
            }),
            {
              onNone: () => [
                withState(
                  model,
                  FailedStart({
                    reason: Option.isNone(context.maybeOwnerUserID)
                      ? 'Sign in to Scribe before recording on the web.'
                      : 'Your recordings are still loading. Press Record again in a moment.',
                  }),
                ),
                [],
                noOutMessage,
              ],
              onSome: ({ ownerUserID, titleNumber }) => [
                withState(model, PreparingCapture()),
                [PrepareCapture({ ownerUserID, titleNumber })],
                noOutMessage,
              ],
            },
          )
        }
      },
      PreparedCapture: ({ draft }) =>
        M.value(model.state).pipe(
          withUpdateReturn,
          M.tag('PreparingCapture', () => [
            withState(model, StartingCapture({ draft })),
            [],
            noOutMessage,
          ]),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      FailedPrepareCapture: ({ reason }) => [
        withState(model, FailedStart({ reason })),
        [],
        noOutMessage,
      ],
      AcquiredCaptureSession: () =>
        M.value(model.state).pipe(
          withUpdateReturn,
          M.tag('StartingCapture', ({ draft }) => [
            withState(
              model,
              Capturing({
                draft,
                transport: 'Recording',
                recordedSeconds: 0,
                levels: silentLevels(),
                transcriber: 'Connecting',
                maybeTranscriberNotice: Option.none(),
                maybeWriteProblem: Option.none(),
                progress: emptyProgress(),
                durationWrittenSeconds: 0,
              }),
            ),
            [CreateRecording({ draft })],
            Option.some(StartedRecording({ recordingID: draft.recordingID })),
          ]),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      ReleasedCaptureSession: () => [model, [], noOutMessage],
      FailedAcquireCaptureSession: ({ reason }) =>
        M.value(model.state).pipe(
          withUpdateReturn,
          M.tag('StartingCapture', () => [
            withState(model, FailedStart({ reason })),
            [],
            noOutMessage,
          ]),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      SucceededCreateRecording: () => [model, [], noOutMessage],
      FailedCreateRecording: ({ reason }) => [
        withState(
          model,
          FailedStart({
            reason: `Instant did not accept the new recording. ${reason}`,
          }),
        ),
        [],
        noOutMessage,
      ],
      HeardCaptureProgress: ({ recordedSeconds, level }) =>
        heardProgress(model, recordedSeconds, level),
      HeardTranscript: ({ result }) => heardTranscript(model, result),
      HeardTranscriberState: ({ state, maybeNotice }) =>
        inCapturing(model, capturing => [
          withState(
            model,
            evo(capturing, {
              transcriber: () => state,
              maybeTranscriberNotice: () => maybeNotice,
            }),
          ),
          [],
          noOutMessage,
        ]),
      HeardCaptureInterrupted: () =>
        inCapturing(model, capturing =>
          stop(
            model,
            capturing.draft,
            capturing.recordedSeconds,
            capturing.progress,
          ),
        ),
      HeardCaptureEnded: ({ recordedSeconds }) =>
        M.value(model.state).pipe(
          withUpdateReturn,
          M.tag('StoppingCapture', stopping =>
            startSaving(
              model,
              stopping.draft,
              recordedSeconds,
              stopping.progress,
            ),
          ),
          M.tag('Capturing', capturing =>
            startSaving(
              model,
              capturing.draft,
              recordedSeconds,
              capturing.progress,
            ),
          ),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      ClickedPauseRecording: () =>
        inCapturing(model, capturing =>
          capturing.transport === 'Recording'
            ? [
                withState(model, evo(capturing, { transport: () => 'Paused' })),
                [PauseCapture()],
                noOutMessage,
              ]
            : [model, [], noOutMessage],
        ),
      ClickedResumeRecording: () =>
        inCapturing(model, capturing =>
          capturing.transport === 'Paused'
            ? [
                withState(
                  model,
                  evo(capturing, { transport: () => 'Recording' }),
                ),
                [ResumeCapture()],
                noOutMessage,
              ]
            : [model, [], noOutMessage],
        ),
      CompletedPauseCapture: () => [model, [], noOutMessage],
      CompletedResumeCapture: () => [model, [], noOutMessage],
      ClickedStopRecording: () =>
        inCapturing(model, capturing =>
          stop(
            model,
            capturing.draft,
            capturing.recordedSeconds,
            capturing.progress,
          ),
        ),
      CompletedRequestFinishCapture: () => [model, [], noOutMessage],
      SucceededWriteSegment: () =>
        inCapturing(model, capturing => [
          withState(
            model,
            evo(capturing, { maybeWriteProblem: () => Option.none() }),
          ),
          [],
          noOutMessage,
        ]),
      FailedWriteSegment: ({ reason }) =>
        inCapturing(model, capturing => [
          withState(
            model,
            evo(capturing, { maybeWriteProblem: () => Option.some(reason) }),
          ),
          [],
          noOutMessage,
        ]),
      SucceededWriteDuration: () => [model, [], noOutMessage],
      FailedWriteDuration: ({ reason }) =>
        inCapturing(model, capturing => [
          withState(
            model,
            evo(capturing, { maybeWriteProblem: () => Option.some(reason) }),
          ),
          [],
          noOutMessage,
        ]),
      SucceededSaveRecording: () =>
        M.value(model.state).pipe(
          withUpdateReturn,
          M.tag('SavingCapture', ({ draft }) => [
            withState(model, NotCapturing()),
            [],
            Option.some(
              SavedRecording({
                recordingID: draft.recordingID,
                title: draft.title,
              }),
            ),
          ]),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      FailedSaveRecording: ({ reason }) =>
        M.value(model.state).pipe(
          withUpdateReturn,
          M.tag('SavingCapture', ({ draft, save }) => [
            withState(model, FailedSave({ draft, save, reason })),
            [],
            noOutMessage,
          ]),
          M.orElse(() => [model, [], noOutMessage]),
        ),
      ClickedRetrySaveRecording: () => retrySave(model, true),
      ClickedDiscardRecordingAudio: () => retrySave(model, false),
      ClickedDismissCaptureFailure: () =>
        M.value(model.state).pipe(
          withUpdateReturn,
          M.tag('FailedStart', () => [
            withState(model, NotCapturing()),
            [],
            noOutMessage,
          ]),
          M.orElse(() => [model, [], noOutMessage]),
        ),
    }),
  )
