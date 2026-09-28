import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { ScribeAppScheme } from './link.js'
import { CopyNotice, IdentityState } from './model.js'
import { RecordingDetail, RecordingSummary } from './recording.js'
import { TranscriptFormat } from './transcript.js'

// MESSAGE

/** The listener clicked a link inside or outside the site. */
export const ClickedLink = m('ClickedLink', { request: UrlRequest })
/** The browser URL changed: a pushed link, Back, or Forward. */
export const ChangedUrl = m('ChangedUrl', { url: Url })
/** A pushed URL reached browser history. */
export const CompletedNavigate = m('CompletedNavigate')
/** The browser started loading an outside page or the Scribe app. */
export const CompletedLoadExternal = m('CompletedLoadExternal')

/** Instant reported who is signed in. */
export const ObservedIdentity = m('ObservedIdentity', {
  identity: IdentityState,
})
/** Instant could not report who is signed in. */
export const FailedObserveIdentity = m('FailedObserveIdentity', {
  reason: S.String,
})

/** A recording list snapshot arrived. */
export const ObservedRecordings = m('ObservedRecordings', {
  recordings: S.Array(RecordingSummary),
  skippedCount: S.Number,
  maybeSkippedReason: S.Option(S.String),
})
/** The recording list could not be observed. */
export const FailedObserveRecordings = m('FailedObserveRecordings', {
  reason: S.String,
})
/** The listener asked for older recordings. */
export const ClickedShowMoreRecordings = m('ClickedShowMoreRecordings')
/** The listener opened a recording from the list. */
export const ClickedRecording = m('ClickedRecording', {
  recordingID: S.String,
})

/** A snapshot of the open recording arrived; `None` means none is readable. */
export const ObservedRecording = m('ObservedRecording', {
  recordingID: S.String,
  maybeDetail: S.Option(RecordingDetail),
  skippedCount: S.Number,
  maybeSkippedReason: S.Option(S.String),
})
/** The open recording could not be observed. */
export const FailedObserveRecording = m('FailedObserveRecording', {
  recordingID: S.String,
  reason: S.String,
})
/** The server confirmed the recording is missing or not shared with this account. */
export const ConfirmedMissingRecording = m('ConfirmedMissingRecording', {
  recordingID: S.String,
})
/** The server has the recording; its snapshot will follow. */
export const ConfirmedRecordingExists = m('ConfirmedRecordingExists', {
  recordingID: S.String,
})
/** Download URLs for the open recording's audio and images arrived. */
export const ObservedFileUrls = m('ObservedFileUrls', {
  fileUrls: S.Record(S.String, S.String),
})
/** The file URLs could not be observed. */
export const FailedObserveFileUrls = m('FailedObserveFileUrls', {
  reason: S.String,
})

/** The audio player loaded the recording's audio. */
export const AcquiredAudioPlayer = m('AcquiredAudioPlayer')
/** The audio player was closed. */
export const ReleasedAudioPlayer = m('ReleasedAudioPlayer')
/** The audio player could not load the recording's audio. */
export const FailedAcquireAudioPlayer = m('FailedAcquireAudioPlayer', {
  reason: S.String,
})
/** The audio player reported its position. */
export const HeardAudioPosition = m('HeardAudioPosition', {
  seconds: S.Number,
})
/** The audio player learned the audio's length. */
export const HeardAudioDuration = m('HeardAudioDuration', {
  seconds: S.Number,
})
/** The audio started playing. */
export const HeardAudioPlaying = m('HeardAudioPlaying')
/** The audio paused. */
export const HeardAudioPaused = m('HeardAudioPaused')
/** The audio reached its end. */
export const HeardAudioEnded = m('HeardAudioEnded')
/** The audio player reported an error, such as an expired URL. */
export const HeardAudioError = m('HeardAudioError', { reason: S.String })
/** The listener asked to load the audio again after it failed. */
export const ClickedRetryAudio = m('ClickedRetryAudio')
/** Playing started. */
export const CompletedPlayAudio = m('CompletedPlayAudio')
/** The browser refused to play, for example before any user gesture. */
export const FailedPlayAudio = m('FailedPlayAudio', { reason: S.String })
/** Pausing finished. */
export const CompletedPauseAudio = m('CompletedPauseAudio')
/** Seeking finished. */
export const CompletedSeekAudio = m('CompletedSeekAudio')

/** The listener pressed Play. */
export const ClickedPlay = m('ClickedPlay')
/** The listener pressed Pause. */
export const ClickedPause = m('ClickedPause')
/** The listener pressed a skip button. */
export const ClickedSkip = m('ClickedSkip', { deltaSeconds: S.Number })
/** The listener clicked a transcript word to play from it. */
export const ClickedWord = m('ClickedWord', { seconds: S.Number })
/** The listener started dragging the scrubber. */
export const StartedScrub = m('StartedScrub', { seconds: S.Number })
/** The listener dragged the scrubber. */
export const MovedScrub = m('MovedScrub', { seconds: S.Number })
/** The listener let go of the scrubber. */
export const EndedScrub = m('EndedScrub', { seconds: S.Number })
/** The listener scrolled the transcript away from the playhead or the newest line. */
export const ScrolledTranscriptAway = m('ScrolledTranscriptAway')
/** The listener asked to return to the playhead, or to the newest line while recording. */
export const ClickedReturnToPlayhead = m('ClickedReturnToPlayhead')
/** The transcript scrolled a section into view. */
export const CompletedScrollToSection = m('CompletedScrollToSection')
/** A linked section's highlight has shown long enough. */
export const ElapsedFocusHighlight = m('ElapsedFocusHighlight', {
  revision: S.Number,
})

/** The listener copied a link to a recording, from the list or from playback. */
export const ClickedCopyRecordingLink = m('ClickedCopyRecordingLink', {
  recordingID: S.String,
})
/** The listener copied a link to a transcript section. */
export const ClickedCopySectionLink = m('ClickedCopySectionLink', {
  sectionID: S.String,
})
/** The listener copied a link to the current playback position. */
export const ClickedCopyMomentLink = m('ClickedCopyMomentLink')
/** The listener copied one section's text. */
export const ClickedCopySectionText = m('ClickedCopySectionText', {
  sectionID: S.String,
})
/** The listener copied the whole transcript in a format. */
export const ClickedCopyTranscript = m('ClickedCopyTranscript', {
  format: TranscriptFormat,
})
/** A copy reached the clipboard. */
export const SucceededCopy = m('SucceededCopy', { notice: CopyNotice })
/** A copy did not reach the clipboard. */
export const FailedCopy = m('FailedCopy', { notice: CopyNotice })
/** The copy notice has shown long enough. */
export const ElapsedCopyNotice = m('ElapsedCopyNotice', { revision: S.Number })
/** The listener asked to open the current place in the Scribe app. */
export const ClickedOpenInApp = m('ClickedOpenInApp', {
  scheme: ScribeAppScheme,
})

/** Every web Scribe Message. */
export const Message = S.Union([
  ClickedLink,
  ChangedUrl,
  CompletedNavigate,
  CompletedLoadExternal,
  ObservedIdentity,
  FailedObserveIdentity,
  ObservedRecordings,
  FailedObserveRecordings,
  ClickedShowMoreRecordings,
  ClickedRecording,
  ObservedRecording,
  FailedObserveRecording,
  ConfirmedMissingRecording,
  ConfirmedRecordingExists,
  ObservedFileUrls,
  FailedObserveFileUrls,
  AcquiredAudioPlayer,
  ReleasedAudioPlayer,
  FailedAcquireAudioPlayer,
  HeardAudioPosition,
  HeardAudioDuration,
  HeardAudioPlaying,
  HeardAudioPaused,
  HeardAudioEnded,
  HeardAudioError,
  ClickedRetryAudio,
  CompletedPlayAudio,
  FailedPlayAudio,
  CompletedPauseAudio,
  CompletedSeekAudio,
  ClickedPlay,
  ClickedPause,
  ClickedSkip,
  ClickedWord,
  StartedScrub,
  MovedScrub,
  EndedScrub,
  ScrolledTranscriptAway,
  ClickedReturnToPlayhead,
  CompletedScrollToSection,
  ElapsedFocusHighlight,
  ClickedCopyRecordingLink,
  ClickedCopySectionLink,
  ClickedCopyMomentLink,
  ClickedCopySectionText,
  ClickedCopyTranscript,
  SucceededCopy,
  FailedCopy,
  ElapsedCopyNotice,
  ClickedOpenInApp,
])
/** Every web Scribe Message. */
export type Message = typeof Message.Type
