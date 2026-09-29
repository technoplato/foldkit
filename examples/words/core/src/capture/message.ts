import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { CaptureDraft, TranscriberState, TranscriptResult } from './model.js'

// MESSAGE

/** The listener pressed Record. */
export const ClickedStartRecording = m('ClickedStartRecording')
/** The new recording's ids, start time, and title are ready. */
export const PreparedCapture = m('PreparedCapture', { draft: CaptureDraft })
/** The new recording could not be prepared. */
export const FailedPrepareCapture = m('FailedPrepareCapture', {
  reason: S.String,
})
/** The browser opened the microphone and the live transcriber. */
export const AcquiredCaptureSession = m('AcquiredCaptureSession')
/** The microphone session closed. */
export const ReleasedCaptureSession = m('ReleasedCaptureSession')
/** The microphone could not open, for example because the browser refused it. */
export const FailedAcquireCaptureSession = m('FailedAcquireCaptureSession', {
  reason: S.String,
})
/** Instant accepted the new recording and its transcription row. */
export const SucceededCreateRecording = m('SucceededCreateRecording')
/** Instant did not accept the new recording. */
export const FailedCreateRecording = m('FailedCreateRecording', {
  reason: S.String,
})
/** The microphone reported how much audio it has recorded and how loud it is. */
export const HeardCaptureProgress = m('HeardCaptureProgress', {
  recordedSeconds: S.Number,
  level: S.Number,
})
/** The live transcriber heard words. */
export const HeardTranscript = m('HeardTranscript', {
  result: TranscriptResult,
})
/** The live transcriber connected, dropped, or became unavailable. */
export const HeardTranscriberState = m('HeardTranscriberState', {
  state: TranscriberState,
  maybeNotice: S.Option(S.String),
})
/** The microphone stopped on its own, for example when it was unplugged. */
export const HeardCaptureInterrupted = m('HeardCaptureInterrupted', {
  reason: S.String,
})
/** The microphone stopped and the transcriber finished; no more words will come. */
export const HeardCaptureEnded = m('HeardCaptureEnded', {
  recordedSeconds: S.Number,
})
/** The listener pressed Pause. */
export const ClickedPauseRecording = m('ClickedPauseRecording')
/** The listener pressed Resume. */
export const ClickedResumeRecording = m('ClickedResumeRecording')
/** The microphone paused. */
export const CompletedPauseCapture = m('CompletedPauseCapture')
/** The microphone resumed. */
export const CompletedResumeCapture = m('CompletedResumeCapture')
/** The listener pressed Stop. */
export const ClickedStopRecording = m('ClickedStopRecording')
/** The microphone was asked to stop and the transcriber to finish. */
export const CompletedRequestFinishCapture = m('CompletedRequestFinishCapture')
/** Instant accepted a transcript section. */
export const SucceededWriteSegment = m('SucceededWriteSegment')
/** Instant did not accept a transcript section. */
export const FailedWriteSegment = m('FailedWriteSegment', { reason: S.String })
/** Instant accepted the recording's running length. */
export const SucceededWriteDuration = m('SucceededWriteDuration')
/** Instant did not accept the recording's running length. */
export const FailedWriteDuration = m('FailedWriteDuration', {
  reason: S.String,
})
/** The recording is saved: stopped in Instant, with its audio in storage. */
export const SucceededSaveRecording = m('SucceededSaveRecording', {
  byteCount: S.Number,
})
/** Saving the recording failed. */
export const FailedSaveRecording = m('FailedSaveRecording', {
  reason: S.String,
})
/** The listener asked to try saving the audio again. */
export const ClickedRetrySaveRecording = m('ClickedRetrySaveRecording')
/** The listener chose to keep the transcript without the audio. */
export const ClickedDiscardRecordingAudio = m('ClickedDiscardRecordingAudio')
/** The listener dismissed the reason a recording could not start. */
export const ClickedDismissCaptureFailure = m('ClickedDismissCaptureFailure')

/** Every capture Message. */
export const Message = S.Union([
  ClickedStartRecording,
  PreparedCapture,
  FailedPrepareCapture,
  AcquiredCaptureSession,
  ReleasedCaptureSession,
  FailedAcquireCaptureSession,
  SucceededCreateRecording,
  FailedCreateRecording,
  HeardCaptureProgress,
  HeardTranscript,
  HeardTranscriberState,
  HeardCaptureInterrupted,
  HeardCaptureEnded,
  ClickedPauseRecording,
  ClickedResumeRecording,
  CompletedPauseCapture,
  CompletedResumeCapture,
  ClickedStopRecording,
  CompletedRequestFinishCapture,
  SucceededWriteSegment,
  FailedWriteSegment,
  SucceededWriteDuration,
  FailedWriteDuration,
  SucceededSaveRecording,
  FailedSaveRecording,
  ClickedRetrySaveRecording,
  ClickedDiscardRecordingAudio,
  ClickedDismissCaptureFailure,
])
/** Every capture Message. */
export type Message = typeof Message.Type

// OUT MESSAGE

/** The recording exists in Instant; the page opens it. */
export const StartedRecording = m('StartedRecording', { recordingID: S.String })
/** The recording is saved with its audio. */
export const SavedRecording = m('SavedRecording', {
  recordingID: S.String,
  title: S.String,
})

/** What the recorder tells the page. */
export const OutMessage = S.Union([StartedRecording, SavedRecording])
/** What the recorder tells the page. */
export type OutMessage = typeof OutMessage.Type
