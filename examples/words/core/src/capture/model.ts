import { Array, Match as M, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

// MODEL

/** One recognized word, timed from the start of the recording's audio. */
export const CapturedWord = S.Struct({
  text: S.String,
  startSeconds: S.Number,
  endSeconds: S.Number,
  maybeSpeaker: S.Option(S.Number),
})
/** One recognized word, timed from the start of the recording's audio. */
export type CapturedWord = typeof CapturedWord.Type

/**
 * One result from the live transcriber: the words of the section being
 * spoken. Interim results revise that section; a final result settles it.
 */
export const TranscriptResult = S.Struct({
  isFinal: S.Boolean,
  words: S.Array(CapturedWord),
})
/** One result from the live transcriber. */
export type TranscriptResult = typeof TranscriptResult.Type

/** The build a web recording was made with, in the shape the iPhone stamps. */
export const ScribeBuildInfo = S.Struct({
  branch: S.String,
  builtAtDisplayString: S.optionalKey(S.String),
  builtAtISO8601: S.String,
  commit: S.String,
  worktree: S.String,
})
/** The build a web recording was made with. */
export type ScribeBuildInfo = typeof ScribeBuildInfo.Type

/** Everything fixed when a web recording starts: its ids, owner, start, and title. */
export const CaptureDraft = S.Struct({
  recordingID: S.String,
  transcriptionID: S.String,
  ownerUserID: S.String,
  activityClientID: S.String,
  startedAtMs: S.Number,
  title: S.String,
  deviceIcon: S.String,
  maybeBuildInfo: S.Option(ScribeBuildInfo),
})
/** Everything fixed when a web recording starts. */
export type CaptureDraft = typeof CaptureDraft.Type

/** The section being transcribed now, not yet final. */
export const OpenSegment = S.Struct({
  index: S.Number,
  id: S.String,
  words: S.Array(CapturedWord),
  isWritten: S.Boolean,
})
/** The section being transcribed now, not yet final. */
export type OpenSegment = typeof OpenSegment.Type

/** What the recording's transcript has so far, as the iPhone counts it. */
export const TranscriptProgress = S.Struct({
  nextSegmentIndex: S.Number,
  maybeOpenSegment: S.Option(OpenSegment),
  finalSegmentCount: S.Number,
  finalWordCount: S.Number,
  speakerIDs: S.Array(S.Number),
})
/** What the recording's transcript has so far. */
export type TranscriptProgress = typeof TranscriptProgress.Type

/** Where the live transcriber stands. */
export const TranscriberState = S.Literals([
  'Connecting',
  'Live',
  'Reconnecting',
  'Unavailable',
])
/** Where the live transcriber stands. */
export type TranscriberState = typeof TranscriberState.Type

/** Whether the microphone is recording or paused. */
export const CaptureTransport = S.Literals(['Recording', 'Paused'])
/** Whether the microphone is recording or paused. */
export type CaptureTransport = typeof CaptureTransport.Type

/** The words of a section, as `segments.ts` writes them; kept here so saves can be retried. */
export const PendingSegmentWrite = S.Struct({
  id: S.String,
  index: S.Number,
  words: S.Array(CapturedWord),
  isFinal: S.Boolean,
  isFirstWrite: S.Boolean,
})

/** The totals the transcription row carries, counting only final sections. */
export const PendingCounts = S.Struct({
  segmentCount: S.Number,
  wordCount: S.Number,
  speakerIDs: S.Array(S.Number),
})

/** Everything a stopped recording still needs to write, kept until it is saved. */
export const PendingSave = S.Struct({
  durationSeconds: S.Number,
  maybeFinalWrite: S.Option(PendingSegmentWrite),
  counts: PendingCounts,
  isKeepingAudio: S.Boolean,
})
/** Everything a stopped recording still needs to write. */
export type PendingSave = typeof PendingSave.Type

/** No web recording. */
export const NotCapturing = ts('NotCapturing')
/** Preparing the new recording's ids and title. */
export const PreparingCapture = ts('PreparingCapture')
/** Waiting for the microphone; nothing is written until the browser allows it. */
export const StartingCapture = ts('StartingCapture', { draft: CaptureDraft })
/** Recording and transcribing live. */
export const Capturing = ts('Capturing', {
  draft: CaptureDraft,
  transport: CaptureTransport,
  recordedSeconds: S.Number,
  levels: S.Array(S.Number),
  transcriber: TranscriberState,
  maybeTranscriberNotice: S.Option(S.String),
  maybeWriteProblem: S.Option(S.String),
  progress: TranscriptProgress,
  durationWrittenSeconds: S.Number,
})
/** Stopped; the transcriber is finishing its last words. */
export const StoppingCapture = ts('StoppingCapture', {
  draft: CaptureDraft,
  recordedSeconds: S.Number,
  progress: TranscriptProgress,
})
/** Writing the last section, stopping the recording in Instant, and uploading its audio. */
export const SavingCapture = ts('SavingCapture', {
  draft: CaptureDraft,
  save: PendingSave,
})
/** Saving failed; the audio is still in the browser and the save can be retried. */
export const FailedSave = ts('FailedSave', {
  draft: CaptureDraft,
  save: PendingSave,
  reason: S.String,
})
/** The recording could not start, for example because the microphone was refused. */
export const FailedStart = ts('FailedStart', { reason: S.String })

/** Where the web recorder stands. */
export const CaptureState = S.Union([
  NotCapturing,
  PreparingCapture,
  StartingCapture,
  Capturing,
  StoppingCapture,
  SavingCapture,
  FailedSave,
  FailedStart,
])
/** Where the web recorder stands. */
export type CaptureState = typeof CaptureState.Type

/** The capture Submodel. */
export const Model = S.Struct({ state: CaptureState })
/** The capture Submodel. */
export type Model = typeof Model.Type

/** How many recent input levels the meter shows. */
export const LEVEL_HISTORY_LENGTH = 28

// INIT

/** No recording. */
export const init = (): Model => ({ state: NotCapturing() })

/** A recording's transcript before any words. */
export const emptyProgress = (): TranscriptProgress => ({
  nextSegmentIndex: 0,
  maybeOpenSegment: Option.none(),
  finalSegmentCount: 0,
  finalWordCount: 0,
  speakerIDs: [],
})

/** A silent meter. */
export const silentLevels = (): ReadonlyArray<number> =>
  Array.replicate(0, LEVEL_HISTORY_LENGTH)

// SELECTOR

/** The recording this browser is capturing or saving, if any. */
export const draftOf = (model: Model): Option.Option<CaptureDraft> =>
  M.value(model.state).pipe(
    M.withReturnType<Option.Option<CaptureDraft>>(),
    M.tagsExhaustive({
      NotCapturing: () => Option.none(),
      PreparingCapture: () => Option.none(),
      StartingCapture: ({ draft }) => Option.some(draft),
      Capturing: ({ draft }) => Option.some(draft),
      StoppingCapture: ({ draft }) => Option.some(draft),
      SavingCapture: ({ draft }) => Option.some(draft),
      FailedSave: ({ draft }) => Option.some(draft),
      FailedStart: () => Option.none(),
    }),
  )

/** Whether the microphone session should be open: from Record until the audio is saved or let go. */
export const isSessionWanted = (model: Model): boolean =>
  Option.isSome(draftOf(model))

/** Whether the session's events still flow: while recording and while the transcriber finishes. */
export const isReadingEvents = (model: Model): boolean =>
  M.value(model.state).pipe(
    M.withReturnType<boolean>(),
    M.tags({ Capturing: () => true, StoppingCapture: () => true }),
    M.orElse(() => false),
  )

/** Whether leaving the page now would lose recorded audio. */
export const isHoldingUnsavedAudio = (model: Model): boolean =>
  M.value(model.state).pipe(
    M.withReturnType<boolean>(),
    M.tags({
      StartingCapture: () => true,
      Capturing: () => true,
      StoppingCapture: () => true,
      SavingCapture: () => true,
      FailedSave: () => true,
    }),
    M.orElse(() => false),
  )

/** Whether a new recording can start now. */
export const canStart = (model: Model): boolean =>
  M.value(model.state).pipe(
    M.withReturnType<boolean>(),
    M.tags({ NotCapturing: () => true, FailedStart: () => true }),
    M.orElse(() => false),
  )
