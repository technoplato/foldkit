import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import * as Account from './account/model.js'
import * as Capture from './capture/model.js'
import { ScribeRoute } from './link.js'
import { RecordingDetail, RecordingSummary } from './recording.js'
import * as Share from './share/model.js'

/** Waiting for the first recording list snapshot. */
export const LoadingRecordings = ts('LoadingRecordings')
/** The latest recording list snapshot. */
export const LoadedRecordings = ts('LoadedRecordings', {
  recordings: S.Array(RecordingSummary),
  skippedCount: S.Number,
  maybeSkippedReason: S.Option(S.String),
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

/**
 * `Following` keeps the playhead (or, while recording, the newest line) on
 * screen. `Detached` means the listener scrolled away and sees Return to
 * Playhead.
 */
export const Follow = S.Literals(['Following', 'Detached'])
/** Whether the transcript keeps the playhead or the newest line on screen. */
export type Follow = typeof Follow.Type

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

/** No recording is open. */
export const NoPlayback = ts('NoPlayback')
/** A recording is opening; its detail has not arrived. */
export const OpeningPlayback = ts('OpeningPlayback', {
  recordingID: S.String,
  request: PlaybackRequest,
})
/** The recording does not exist or is not shared with this account. */
export const MissingRecording = ts('MissingRecording', {
  recordingID: S.String,
})
/** The recording's detail could not be observed. */
export const FailedPlayback = ts('FailedPlayback', {
  recordingID: S.String,
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
  scrub: Scrub,
  audioPlayer: AudioPlayerState,
  maybeAudioUrl: S.Option(S.String),
  audioAttempt: S.Number,
  maybePendingSeekSeconds: S.Option(S.Number),
  maybeFocusedSectionID: S.Option(S.String),
  focusRevision: S.Number,
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

/** The web Scribe Model. */
export const Model = S.Struct({
  route: ScribeRoute,
  identity: IdentityState,
  account: Account.Model,
  capture: Capture.Model,
  share: Share.Model,
  recordings: RecordingsState,
  recordingListLimit: S.Number,
  playback: PlaybackState,
  maybeCopyNotice: S.Option(CopyNotice),
  copyRevision: S.Number,
})
/** The web Scribe Model. */
export type Model = typeof Model.Type
