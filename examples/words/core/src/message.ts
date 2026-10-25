import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import * as Account from './account/message.js'
import { MediaSessionAction } from './audioPlayer.js'
import * as Capture from './capture/message.js'
import { Shortcut } from './keyboard.js'
import { ScribeAppScheme } from './link.js'
import { ListEdge, RecordingWindow } from './listWindow.js'
import { CopyNotice, IdentityState, PlayheadVisibility } from './model.js'
import { Connectivity } from './network.js'
import * as Questions from './questions/message.js'
import { RecordingDetail, RecordingSummary } from './recording.js'
import * as Share from './share/message.js'
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

/**
 * A snapshot of the list window `window` arrived. `hasOlder` is whether the
 * server has recordings past the window's last page.
 */
export const ObservedRecordings = m('ObservedRecordings', {
  window: RecordingWindow,
  recordings: S.Array(RecordingSummary),
  skippedCount: S.Number,
  maybeSkippedReason: S.Option(S.String),
  hasOlder: S.Boolean,
})
/** The list window `window` could not be observed. */
export const FailedObserveRecordings = m('FailedObserveRecordings', {
  window: RecordingWindow,
  reason: S.String,
})
/**
 * The listener scrolled to within about a screen of the loaded rows' newer
 * or older edge, while the list showed the rows of `window`.
 */
export const ApproachedListEdge = m('ApproachedListEdge', {
  edge: ListEdge,
  window: RecordingWindow,
})
/**
 * The listener scrolled to the very top of the list while it showed
 * `window`, which does not start at the newest recording.
 */
export const ReachedListTop = m('ReachedListTop', { window: RecordingWindow })
/** Keyboard focus moved onto a recording row, or off every row. */
export const ChangedListRowFocus = m('ChangedListRowFocus', {
  maybeRecordingID: S.Option(S.String),
})
/** The listener typed in the recording search. */
export const UpdatedSearchQuery = m('UpdatedSearchQuery', { query: S.String })
/** Focus moved to the recording search. */
export const CompletedFocusSearch = m('CompletedFocusSearch')
/** The listener paused typing in the recording search; `query` is what the search held when they typed. */
export const ElapsedSearchPause = m('ElapsedSearchPause', { query: S.String })
/** The address bar shows the current page in place of the previous entry. */
export const CompletedReplaceUrl = m('CompletedReplaceUrl')
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
/** A recording has been opening for a while in this attempt without an answer. */
export const ElapsedOpeningPatience = m('ElapsedOpeningPatience', {
  recordingID: S.String,
  attempt: S.Number,
})
/** The listener chose Try Again on a recording that is slow to open or did not load. */
export const ClickedTryOpeningAgain = m('ClickedTryOpeningAgain')
/**
 * The server confirmed the recording is missing or not shared with the
 * account the question was asked for; `maybeUserID` is that account, or
 * `None` before sign-in.
 */
export const ConfirmedMissingRecording = m('ConfirmedMissingRecording', {
  recordingID: S.String,
  maybeUserID: S.Option(S.String),
})
/** The server has the recording; its snapshot will follow. */
export const ConfirmedRecordingExists = m('ConfirmedRecordingExists', {
  recordingID: S.String,
  maybeUserID: S.Option(S.String),
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
/** The system's media controls (lock screen, headphones, media keys) asked for an action. */
export const HeardMediaSessionAction = m('HeardMediaSessionAction', {
  action: MediaSessionAction,
})
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
/** The system's Now Playing names the open recording. */
export const CompletedPublishNowPlaying = m('CompletedPublishNowPlaying')

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
/** An arrow key on the scrubber: Left moves playback back, Right forward. */
export const ScrubberArrow = S.Literals(['Left', 'Right'])
/** An arrow key on the scrubber. */
export type ScrubberArrow = typeof ScrubberArrow.Type
/** The listener pressed Left or Right Arrow on the focused scrubber. */
export const PressedScrubberArrow = m('PressedScrubberArrow', {
  arrow: ScrubberArrow,
})
/** The listener scrolled the transcript away from the playhead or the newest line. */
export const ScrolledTranscriptAway = m('ScrolledTranscriptAway')
/** The listener asked to return to the playhead, or to the newest line while recording. */
export const ClickedReturnToPlayhead = m('ClickedReturnToPlayhead')
/** The transcript scrolled a section into view. */
export const CompletedScrollToSection = m('CompletedScrollToSection')
/** A newly opened recording's page scrolled to its title. */
export const CompletedScrollToRecordingTitle = m(
  'CompletedScrollToRecordingTitle',
)
/** The followed section came on screen or left it, as the listener scrolled or the transcript grew. */
export const ChangedPlayheadVisibility = m('ChangedPlayheadVisibility', {
  sectionID: S.String,
  visibility: PlayheadVisibility,
})
/** The listener closed the player that kept a recording playing while browsing. */
export const ClickedCloseMiniPlayer = m('ClickedCloseMiniPlayer')
/** The listener chose Full Screen for the open recording. */
export const ClickedEnterFullScreen = m('ClickedEnterFullScreen')
/** The listener left Full Screen. */
export const ClickedExitFullScreen = m('ClickedExitFullScreen')
/** The full-screen wall clock started ticking. */
export const CompletedRunWallClock = m('CompletedRunWallClock')
/** Right-clicking a recording row opens its menu from now on. */
export const CompletedShowRowMenuOnContextMenu = m(
  'CompletedShowRowMenuOnContextMenu',
)
/** The listener chose Skip to Controls from the keyboard. */
export const ClickedSkipToPlayer = m('ClickedSkipToPlayer')
/** Focus moved to the player. */
export const CompletedFocusPlayer = m('CompletedFocusPlayer')
/** The listener chose Skip to Content from the keyboard. */
export const ClickedSkipToContent = m('ClickedSkipToContent')
/** Focus moved to the start of the page's content. */
export const CompletedFocusContent = m('CompletedFocusContent')
/** The listener pressed a keyboard shortcut. */
export const PressedShortcut = m('PressedShortcut', { shortcut: Shortcut })
/** A pause between screen reader announcements of new sections ended. */
export const ElapsedAnnouncementPause = m('ElapsedAnnouncementPause', {
  revision: S.Number,
})
/** A second passed while a recording in progress on another device is on screen. */
export const TickedLiveClock = m('TickedLiveClock', { nowMs: S.Number })
/** The browser lost or regained its network connection. */
export const ChangedConnectivity = m('ChangedConnectivity', {
  connectivity: Connectivity,
})
/** A linked section's highlight has shown long enough. */
export const ElapsedFocusHighlight = m('ElapsedFocusHighlight', {
  revision: S.Number,
})

/** The listener copied a link to a recording, from the list or from playback. */
export const ClickedCopyRecordingLink = m('ClickedCopyRecordingLink', {
  recordingID: S.String,
})
/** The listener asked to share a recording's link through the system share sheet. */
export const ClickedShareRecordingLink = m('ClickedShareRecordingLink', {
  recordingID: S.String,
  title: S.String,
})
/** The system share sheet closed, shared or not. */
export const CompletedShareRecordingLink = m('CompletedShareRecordingLink')
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

/** The account Submodel handled a Message. */
export const GotAccountMessage = m('GotAccountMessage', {
  message: Account.Message,
})
/** The recorder Submodel handled a Message. */
export const GotCaptureMessage = m('GotCaptureMessage', {
  message: Capture.Message,
})
/** The share Submodel handled a Message. */
export const GotShareMessage = m('GotShareMessage', {
  message: Share.Message,
})
/** The questions Submodel handled a Message. */
export const GotQuestionsMessage = m('GotQuestionsMessage', {
  message: Questions.Message,
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
  UpdatedSearchQuery,
  CompletedFocusSearch,
  ElapsedSearchPause,
  CompletedReplaceUrl,
  ApproachedListEdge,
  ReachedListTop,
  ChangedListRowFocus,
  ClickedRecording,
  ObservedRecording,
  FailedObserveRecording,
  ElapsedOpeningPatience,
  ClickedTryOpeningAgain,
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
  HeardMediaSessionAction,
  ClickedRetryAudio,
  CompletedPlayAudio,
  FailedPlayAudio,
  CompletedPauseAudio,
  CompletedSeekAudio,
  CompletedPublishNowPlaying,
  ClickedPlay,
  ClickedPause,
  ClickedSkip,
  ClickedWord,
  StartedScrub,
  MovedScrub,
  EndedScrub,
  PressedScrubberArrow,
  ScrolledTranscriptAway,
  ClickedReturnToPlayhead,
  CompletedScrollToSection,
  CompletedScrollToRecordingTitle,
  ChangedPlayheadVisibility,
  ClickedSkipToPlayer,
  CompletedFocusPlayer,
  ClickedSkipToContent,
  CompletedFocusContent,
  ClickedCloseMiniPlayer,
  ClickedEnterFullScreen,
  ClickedExitFullScreen,
  CompletedRunWallClock,
  CompletedShowRowMenuOnContextMenu,
  PressedShortcut,
  ElapsedAnnouncementPause,
  TickedLiveClock,
  ChangedConnectivity,
  ElapsedFocusHighlight,
  ClickedCopyRecordingLink,
  ClickedShareRecordingLink,
  CompletedShareRecordingLink,
  ClickedCopySectionLink,
  ClickedCopyMomentLink,
  ClickedCopySectionText,
  ClickedCopyTranscript,
  SucceededCopy,
  FailedCopy,
  ElapsedCopyNotice,
  ClickedOpenInApp,
  GotAccountMessage,
  GotCaptureMessage,
  GotShareMessage,
  GotQuestionsMessage,
])
/** Every web Scribe Message. */
export type Message = typeof Message.Type
