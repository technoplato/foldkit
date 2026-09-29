import {
  AcquiredCaptureSession,
  ClickedDiscardRecordingAudio,
  ClickedDismissCaptureFailure,
  ClickedPauseRecording,
  ClickedResumeRecording,
  ClickedRetrySaveRecording,
  ClickedStartRecording,
  ClickedStopRecording,
  FailedAcquireCaptureSession,
  HeardCaptureEnded,
  HeardCaptureInterrupted,
  HeardCaptureProgress,
  HeardTranscriberState,
  HeardTranscript,
  type Message,
  ReleasedCaptureSession,
} from './message.js'

/** The listener presses Record. */
export const startRecording = (): Message => ClickedStartRecording()
/** The listener presses Pause. */
export const pauseRecording = (): Message => ClickedPauseRecording()
/** The listener presses Resume. */
export const resumeRecording = (): Message => ClickedResumeRecording()
/** The listener presses Stop. */
export const stopRecording = (): Message => ClickedStopRecording()
/** The listener tries saving the audio again. */
export const retrySaveRecording = (): Message => ClickedRetrySaveRecording()
/** The listener keeps the transcript without the audio. */
export const keepTranscriptOnly = (): Message => ClickedDiscardRecordingAudio()
/** The listener dismisses why a recording could not start. */
export const dismissCaptureFailure = (): Message =>
  ClickedDismissCaptureFailure()
/** The host opened the microphone session. */
export const reportSessionAcquired = (): Message => AcquiredCaptureSession()
/** The host closed the microphone session. */
export const reportSessionReleased = (): Message => ReleasedCaptureSession()
/** The host could not open the microphone session. */
export const reportSessionFailure = (
  payload: Parameters<typeof FailedAcquireCaptureSession>[0],
): Message => FailedAcquireCaptureSession(payload)
/** The microphone reports how much it recorded and how loud. */
export const reportProgress = (
  payload: Parameters<typeof HeardCaptureProgress>[0],
): typeof HeardCaptureProgress.Type => HeardCaptureProgress(payload)
/** The live transcriber heard words. */
export const reportTranscript = (
  payload: Parameters<typeof HeardTranscript>[0],
): typeof HeardTranscript.Type => HeardTranscript(payload)
/** The live transcriber changed state. */
export const reportTranscriberState = (
  payload: Parameters<typeof HeardTranscriberState>[0],
): typeof HeardTranscriberState.Type => HeardTranscriberState(payload)
/** The microphone stopped on its own. */
export const reportInterruption = (
  payload: Parameters<typeof HeardCaptureInterrupted>[0],
): typeof HeardCaptureInterrupted.Type => HeardCaptureInterrupted(payload)
/** The microphone stopped and the transcriber finished. */
export const reportEnd = (
  payload: Parameters<typeof HeardCaptureEnded>[0],
): typeof HeardCaptureEnded.Type => HeardCaptureEnded(payload)
