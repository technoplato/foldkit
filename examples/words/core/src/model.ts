import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import * as Account from './account/model.js'
import * as Capture from './capture/model.js'
import { ScribeRoute } from './link.js'
import { OlderEdge, RecordingWindow } from './listWindow.js'
import { Connectivity } from './network.js'
import * as Questions from './questions/model.js'
import { LiveBeat, RecordingDetail, RecordingSummary } from './recording.js'
import * as Share from './share/model.js'

/** Waiting for the first recording list snapshot. */
export const LoadingRecordings = ts('LoadingRecordings')
/**
 * The latest snapshot of the window the list shows. `window` is the run of
 * pages these rows came from, and `olderEdge` what lies past its last row.
 * `maybeKeptFocusedRow` is a row that holds keyboard focus, kept on screen
 * after its page left the window so focus never falls off the page.
 * `highestTitleNumber` is the highest `Recording N` seen in this account's
 * list, kept when the newest page leaves the window, so a new recording's
 * title never repeats a number.
 */
export const LoadedRecordings = ts('LoadedRecordings', {
  recordings: S.Array(RecordingSummary),
  skippedCount: S.Number,
  maybeSkippedReason: S.Option(S.String),
  window: RecordingWindow,
  olderEdge: OlderEdge,
  maybeKeptFocusedRow: S.Option(RecordingSummary),
  highestTitleNumber: S.Number,
})
/** The recording list could not be observed. */
export const FailedRecordings = ts('FailedRecordings', { reason: S.String })
/** Where the recording list stands. */
export const RecordingsState = S.Union([
  LoadingRecordings,
  LoadedRecordings,
  FailedRecordings,
])
/** Where the recording list stands. */
export type RecordingsState = typeof RecordingsState.Type

/** Waiting for Instant to report who is signed in. */
export const CheckingIdentity = ts('CheckingIdentity')
/** Signed in to Scribe's Instant app. */
export const SignedIn = ts('SignedIn', {
  userID: S.String,
  maybeEmail: S.Option(S.String),
  isGuest: S.Boolean,
})
/** Not signed in; only public data can load. */
export const SignedOut = ts('SignedOut')
/** Who the web is signed in to Instant as. */
export const IdentityState = S.Union([CheckingIdentity, SignedIn, SignedOut])
/** Who the web is signed in to Instant as. */
export type IdentityState = typeof IdentityState.Type

/** Whether the listener has audio playing. */
export const Transport = S.Literals(['Paused', 'Playing'])
/** Whether the listener has audio playing. */
export type Transport = typeof Transport.Type

/** The phase a playback shows: Playing, or Paused part way through. */
export const PlaybackPhase = S.Literals(['Playing', 'Paused'])
/** The phase a playback shows. */
export type PlaybackPhase = typeof PlaybackPhase.Type

/**
 * `Following` keeps the playhead (or, while recording, the newest line) on
 * screen. `Detached` means the listener scrolled away; once the followed
 * section leaves the screen they see Back to Playhead (or Back to Live), and
 * scrolling back to it follows again.
 */
export const Follow = S.Literals(['Following', 'Detached'])
/** Whether the transcript keeps the playhead or the newest line on screen. */
export type Follow = typeof Follow.Type

/**
 * Whether the section the transcript follows (the playhead's, or while
 * recording the newest) is on screen. The host reports it as the listener
 * scrolls; Back to Playhead and Back to Live show only while it is off screen.
 */
export const PlayheadVisibility = S.Literals(['OnScreen', 'OffScreen'])
/** Whether the followed section is on screen. */
export type PlayheadVisibility = typeof PlayheadVisibility.Type

/**
 * How the recording page presents: `Standard` with its header and top bar,
 * or `FullScreen` with only the transcript, the controls, and the rotated
 * wall clock, like Full Screen on the iPhone.
 */
export const ScreenMode = S.Literals(['Standard', 'FullScreen'])
/** How the recording page presents. */
export type ScreenMode = typeof ScreenMode.Type

/** The next finished section of a recording in progress is announced at once. */
export const ReadyToAnnounce = ts('ReadyToAnnounce')
/**
 * A section was just announced to screen readers. A newer one waits until the
 * pause with this revision ends, so announcements come at most every few
 * seconds and only the newest waiting section is read.
 */
export const PausingAnnouncements = ts('PausingAnnouncements', {
  revision: S.Number,
  maybeWaitingText: S.Option(S.String),
})
/** How finished sections of a recording in progress reach screen readers. */
export const AnnouncementPause = S.Union([
  ReadyToAnnounce,
  PausingAnnouncements,
])
/** How finished sections of a recording in progress reach screen readers. */
export type AnnouncementPause = typeof AnnouncementPause.Type

/** The scrubber is at rest. */
export const NotScrubbing = ts('NotScrubbing')
/** The listener is dragging the scrubber; playback seeks when they let go. */
export const Scrubbing = ts('Scrubbing', { seconds: S.Number })
/** Whether the listener is dragging the scrubber. */
export const Scrub = S.Union([NotScrubbing, Scrubbing])
/** Whether the listener is dragging the scrubber. */
export type Scrub = typeof Scrub.Type

/** No audio player: no stored audio yet, or its URL has not resolved. */
export const NoAudioPlayer = ts('NoAudioPlayer')
/** The audio player exists and can play. */
export const AudioPlayerReady = ts('AudioPlayerReady', {
  maybeDurationSeconds: S.Option(S.Number),
})
/** The audio player failed to load or play. */
export const AudioPlayerFailed = ts('AudioPlayerFailed', { reason: S.String })
/** Where the audio player stands. */
export const AudioPlayerState = S.Union([
  NoAudioPlayer,
  AudioPlayerReady,
  AudioPlayerFailed,
])
/** Where the audio player stands. */
export type AudioPlayerState = typeof AudioPlayerState.Type

/** What the opened link asked for: a start time, a section to focus, the route. */
export const PlaybackRequest = S.Struct({
  maybeStartSeconds: S.Option(S.Number),
  maybeFocusSectionID: S.Option(S.String),
  isRouteFocus: S.Boolean,
})
/** What the opened link asked for: a start time, a section to focus, the route. */
export type PlaybackRequest = typeof PlaybackRequest.Type

/**
 * How long a recording has been opening: `Loading` at first, and `Slow` once
 * Scribe has not answered for a few seconds, when the page says it is still
 * loading and offers Try Again.
 */
export const OpeningPatience = S.Literals(['Loading', 'Slow'])
/** How long a recording has been opening. */
export type OpeningPatience = typeof OpeningPatience.Type

/** No recording is open. */
export const NoPlayback = ts('NoPlayback')
/** A recording is opening; its detail has not arrived. */
export const OpeningPlayback = ts('OpeningPlayback', {
  recordingID: S.String,
  request: PlaybackRequest,
  patience: OpeningPatience,
})
/**
 * The server found no recording this account can read. It keeps what the link
 * asked for, because a first answer can come before the browser has signed in:
 * the recording may still arrive, and it then opens where the link points.
 */
export const MissingRecording = ts('MissingRecording', {
  recordingID: S.String,
  request: PlaybackRequest,
})
/** The recording's detail could not be observed; a later snapshot still opens it where the link points. */
export const FailedPlayback = ts('FailedPlayback', {
  recordingID: S.String,
  request: PlaybackRequest,
  reason: S.String,
})
/** A recording is open, playing back or following along live. */
export const ReadyPlayback = ts('ReadyPlayback', {
  recordingID: S.String,
  detail: RecordingDetail,
  skippedCount: S.Number,
  maybeSkippedReason: S.Option(S.String),
  fileUrls: S.Record(S.String, S.String),
  positionSeconds: S.Number,
  transport: Transport,
  follow: Follow,
  playheadVisibility: PlayheadVisibility,
  screenMode: ScreenMode,
  scrub: Scrub,
  audioPlayer: AudioPlayerState,
  maybeAudioUrl: S.Option(S.String),
  audioAttempt: S.Number,
  maybePendingSeekSeconds: S.Option(S.Number),
  maybeFocusedSectionID: S.Option(S.String),
  focusRevision: S.Number,
  maybeAnnouncedText: S.Option(S.String),
  announcementPause: AnnouncementPause,
  announcementRevision: S.Number,
})
/** Where playback stands. */
export const PlaybackState = S.Union([
  NoPlayback,
  OpeningPlayback,
  MissingRecording,
  FailedPlayback,
  ReadyPlayback,
])
/** Where playback stands. */
export type PlaybackState = typeof PlaybackState.Type
/** A recording that is open and loaded. */
export type ReadyPlayback = typeof ReadyPlayback.Type

/** The short notice shown after copying. */
export const CopyNotice = S.Struct({
  text: S.String,
  isFailure: S.Boolean,
  revision: S.Number,
})
/** The short notice shown after copying. */
export type CopyNotice = typeof CopyNotice.Type

/**
 * A save of a recording in progress elsewhere that its live clock counts
 * from: its length, and when it was saved by the writer's clock.
 */
export const LiveLengthSave = S.Struct({
  durationSeconds: S.Number,
  savedAtMs: S.Number,
})
/** A save a live clock counts from. */
export type LiveLengthSave = typeof LiveLengthSave.Type

/**
 * The web Scribe Model. `resumePositions` holds, per recording, where the
 * listener left it part way through in this tab, so opening it again resumes
 * there. `maybeBackgroundPlayback` is a recording whose audio keeps playing
 * while the page shows something else (the list, Settings, or this browser's
 * own recording in progress), like the iPhone's playback piece beside its
 * live chip; opening another recording replaces it. `maybeLiveClockMs` is the
 * browser's clock, ticking each second while a recording in progress on
 * another device is on screen, so its length counts up between saves;
 * `liveLengthSaves` holds, per such recording, the save its clock counts
 * from: the first save of its current length, so a later save that moves the
 * save time but not the length (a rename, an image) never holds it back.
 * `liveBeats` holds, per such recording whose device publishes in a live
 * room, the newest beat the origin read there; the clock counts from it when
 * it is newer than the length save.
 * `liveLengthFloors` holds, per such recording, the longest length shown so
 * far, so a save that comes in behind the clock never makes it run backward. `recordingAttempt` counts Try Again presses; each one asks
 * Scribe for the open recording again. `recordingWindow` is the run of list
 * pages the list observes; it moves as the listener scrolls near an edge of
 * the loaded rows. `maybeFocusedRowID` is the recording row that holds
 * keyboard focus, as the host reports it.
 */
export const Model = S.Struct({
  route: ScribeRoute,
  identity: IdentityState,
  account: Account.Model,
  capture: Capture.Model,
  share: Share.Model,
  questions: Questions.Model,
  recordings: RecordingsState,
  recordingWindow: RecordingWindow,
  maybeFocusedRowID: S.Option(S.String),
  playback: PlaybackState,
  maybeBackgroundPlayback: S.Option(ReadyPlayback),
  resumePositions: S.Record(S.String, S.Number),
  maybeLiveClockMs: S.Option(S.Number),
  liveLengthSaves: S.Record(S.String, LiveLengthSave),
  liveBeats: S.Record(S.String, LiveBeat),
  liveLengthFloors: S.Record(S.String, S.Number),
  recordingAttempt: S.Number,
  maybeCopyNotice: S.Option(CopyNotice),
  copyRevision: S.Number,
  connectivity: Connectivity,
  searchQuery: S.String,
})
/** The web Scribe Model. */
export type Model = typeof Model.Type
