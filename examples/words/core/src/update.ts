import {
  Array,
  Duration,
  Effect,
  Equivalence,
  Match as M,
  Number as Number_,
  Option,
  Order,
  Record,
  Schema as S,
  pipe,
} from 'effect'
import { Command } from 'foldkit'
import * as Dom from 'foldkit/dom'
import { load, pushUrl, replaceUrl } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'

import * as Account from './account/index.js'
import {
  AudioPlayer,
  type AudioPlayerService,
  NowPlaying,
} from './audioPlayer.js'
import * as Capture from './capture/index.js'
import { ClipboardWriter } from './clipboard.js'
import type { ShortcutContext } from './keyboard.js'
import {
  PlaybackRoute,
  RecordingListRoute,
  RecordingRoute,
  type ScribeRoute,
  SearchRecordingsRoute,
  SectionRoute,
  ShareRoute,
  formatStartSeconds,
  isListRoute,
  isRouteFocus,
  scribeRouteToAppUrl,
  scribeRouteToPath,
  scribeRouteToShareUrl,
  shareableStartSeconds,
  startSecondsOf,
  urlToScribeRoute,
} from './link.js'
import { LinkSharer } from './linkSharer.js'
import {
  AtLeastCount,
  ExactCount,
  type ListEdge,
  type ListPaging,
  type OlderEdge,
  RECORDING_WINDOW_PAGE_LIMIT,
  type RecordingCount,
  type RecordingWindow,
  UnknownCount,
  firstRecordingWindow,
  isSameRecordingWindow,
  newerRecordingWindowOf,
  olderRecordingWindowOf,
} from './listWindow.js'
import {
  CompletedFocusContent,
  CompletedFocusPlayer,
  CompletedFocusSearch,
  CompletedLoadExternal,
  CompletedNavigate,
  CompletedPauseAudio,
  CompletedPlayAudio,
  CompletedPublishNowPlaying,
  CompletedReplaceUrl,
  CompletedScrollToRecordingTitle,
  CompletedScrollToSection,
  CompletedSeekAudio,
  CompletedShareRecordingLink,
  ConfirmedMissingRecording,
  ConfirmedRecordingExists,
  ElapsedAnnouncementPause,
  ElapsedCopyNotice,
  ElapsedFocusHighlight,
  ElapsedSearchPause,
  FailedCopy,
  FailedObserveRecording,
  FailedPlayAudio,
  GotAccountMessage,
  GotCaptureMessage,
  GotShareMessage,
  type Message,
  type ObservedRecordings,
  SucceededCopy,
} from './message.js'
import {
  AudioPlayerFailed,
  AudioPlayerReady,
  CheckingIdentity,
  CopyNotice,
  FailedPlayback,
  FailedRecordings,
  LoadedRecordings,
  LoadingRecordings,
  MissingRecording,
  type Model,
  NoAudioPlayer,
  NoPlayback,
  NotScrubbing,
  OpeningPlayback,
  PausingAnnouncements,
  type PlaybackPhase,
  type PlaybackRequest,
  type PlaybackState,
  ReadyPlayback,
  ReadyToAnnounce,
  type RecordingsState,
  type ScreenMode,
  Scrubbing,
  SignedOut,
} from './model.js'
import type { WordsOrigin } from './origin.js'
import * as Questions from './questions/index.js'
import type { RecordingDetail, RecordingSummary, Section } from './recording.js'
import { SectionPlacement, TranscriptScroller } from './scroller.js'
import { SEARCH_FIELD_ID, searchTermsOf } from './search.js'
import * as Share from './share/index.js'
import { WordsStore, storeFailureReasonOf } from './store.js'
import { exportTranscript, sectionAt } from './transcript.js'

/** How far the skip buttons, arrow keys, and system skip commands move playback. */
export const SKIP_SECONDS = 15

/**
 * How far Left and Right Arrow move playback while the scrubber has focus.
 * Up and Down Arrow, and assistive technology, move it by the scrubber's
 * one-second step.
 */
export const SCRUBBER_ARROW_SECONDS = 5

const FOCUS_HIGHLIGHT_DURATION = Duration.seconds(4)
const COPY_NOTICE_DURATION = Duration.seconds(2)
const SEARCH_URL_PAUSE = Duration.millis(400)
const LIVE_COUNT_UP_LIMIT_SECONDS = 6
const MILLISECONDS_PER_SECOND = 1_000
const ANNOUNCEMENT_PAUSE = Duration.seconds(5)

type Services =
  | WordsStore
  | ClipboardWriter
  | LinkSharer
  | WordsOrigin
  | Capture.RecordingWriter
  | Capture.CaptureEnvironment
  | Share.ShareWriter
  | AudioPlayerService
  | Capture.CaptureSessionService
  | TranscriptScroller
type Commands = ReadonlyArray<Command.Command<Message, never, Services>>
type UpdateReturn = readonly [Model, Commands]
type ReadyReturn = readonly [ReadyPlayback, Commands]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

// COMMAND

/** Pushes a site path to browser history. */
export const Navigate = Command.define(
  'Navigate',
  { url: S.String },
  CompletedNavigate,
)(({ url }) => pushUrl(url).pipe(Effect.as(CompletedNavigate())))

/**
 * Shows a site path in the address bar in place of the current entry, so a
 * search typed on the list is one history step, not one per keystroke.
 */
export const ReplaceUrl = Command.define(
  'ReplaceUrl',
  { url: S.String },
  CompletedReplaceUrl,
)(({ url }) => replaceUrl(url).pipe(Effect.as(CompletedReplaceUrl())))

/** Waits for a pause in typing before the address bar shows the search. */
export const WaitForSearchPause = Command.define(
  'WaitForSearchPause',
  { query: S.String },
  ElapsedSearchPause,
)(({ query }) =>
  Effect.sleep(SEARCH_URL_PAUSE).pipe(Effect.as(ElapsedSearchPause({ query }))),
)

/** Loads an outside page, or opens the Scribe app through its URL scheme. */
export const LoadExternal = Command.define(
  'LoadExternal',
  { href: S.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))

/**
 * Asks the server whether a recording that came back empty exists for the
 * account signed in as `maybeUserID`. The answer names that account, so an
 * answer given before sign-in is not taken as the signed-in account's.
 */
export const ConfirmRecording = Command.define(
  'ConfirmRecording',
  { recordingID: S.String, maybeUserID: S.Option(S.String) },
  ConfirmedMissingRecording,
  ConfirmedRecordingExists,
  FailedObserveRecording,
)(({ recordingID, maybeUserID }) =>
  WordsStore.pipe(
    Effect.flatMap(store => store.hasRecording(recordingID)),
    Effect.map(isPresent =>
      isPresent
        ? ConfirmedRecordingExists({ recordingID, maybeUserID })
        : ConfirmedMissingRecording({ recordingID, maybeUserID }),
    ),
    Effect.catch(error =>
      Effect.succeed(
        FailedObserveRecording({
          recordingID,
          reason: storeFailureReasonOf(error),
        }),
      ),
    ),
  ),
)

/** Starts the audio player. */
export const PlayAudio = Command.define(
  'PlayAudio',
  CompletedPlayAudio,
  FailedPlayAudio,
)(
  AudioPlayer.get.pipe(
    Effect.flatMap(player => player.play),
    Effect.as(CompletedPlayAudio()),
    Effect.catchTags({
      AudioPlayerError: error =>
        Effect.succeed(FailedPlayAudio({ reason: error.reason })),
      ResourceNotAvailable: () =>
        Effect.succeed(FailedPlayAudio({ reason: 'The audio is not loaded.' })),
    }),
  ),
)

/** Pauses the audio player. */
export const PauseAudio = Command.define(
  'PauseAudio',
  CompletedPauseAudio,
)(
  AudioPlayer.get.pipe(
    Effect.flatMap(player => player.pause),
    Effect.as(CompletedPauseAudio()),
    Effect.catchTag('ResourceNotAvailable', () =>
      Effect.succeed(CompletedPauseAudio()),
    ),
  ),
)

/** Names the open recording on the lock screen and in Control Center while it plays. */
export const PublishNowPlaying = Command.define(
  'PublishNowPlaying',
  { nowPlaying: NowPlaying },
  CompletedPublishNowPlaying,
)(({ nowPlaying }) =>
  AudioPlayer.get.pipe(
    Effect.flatMap(player => player.publishNowPlaying(nowPlaying)),
    Effect.as(CompletedPublishNowPlaying()),
    Effect.catchTag('ResourceNotAvailable', () =>
      Effect.succeed(CompletedPublishNowPlaying()),
    ),
  ),
)

/**
 * Scrolls the transcript to a section: to the middle of the window while
 * audio plays, or to the live edge while a recording is in progress.
 */
export const ScrollToSection = Command.define(
  'ScrollToSection',
  { sectionID: S.String, placement: SectionPlacement },
  CompletedScrollToSection,
)(({ sectionID, placement }) =>
  TranscriptScroller.pipe(
    Effect.flatMap(scroller => scroller.scrollToSection(sectionID, placement)),
    Effect.as(CompletedScrollToSection()),
  ),
)

/** The element id of the floating player, where Skip to Player moves focus. */
export const PLAYER_ELEMENT_ID = 'player'

/**
 * The element id of the page's content column, where Skip to Content moves
 * focus: past the top bar and, from 1024 px, the recording list beside it.
 */
export const CONTENT_ELEMENT_ID = 'content'

/** Moves keyboard focus to the start of the page's content. */
export const FocusContent = Command.define(
  'FocusContent',
  CompletedFocusContent,
)(
  Dom.focus(`#${CONTENT_ELEMENT_ID}`, { makeFocusable: true }).pipe(
    Effect.ignore,
    Effect.as(CompletedFocusContent()),
  ),
)

/** The element id of the open recording's title, where its page starts. */
export const RECORDING_TITLE_ELEMENT_ID = 'recording-title'

/**
 * Scrolls a recording's page back to the top, where its title is, so a
 * recording opened without a moment starts there rather than where the last
 * page was scrolled.
 */
export const ScrollToRecordingTitle = Command.define(
  'ScrollToRecordingTitle',
  CompletedScrollToRecordingTitle,
)(
  TranscriptScroller.pipe(
    Effect.flatMap(scroller => scroller.scrollToPageTop),
    Effect.as(CompletedScrollToRecordingTitle()),
  ),
)

/** Moves keyboard focus to the floating player. */
export const FocusPlayer = Command.define(
  'FocusPlayer',
  CompletedFocusPlayer,
)(
  Dom.focus(`#${PLAYER_ELEMENT_ID}`, { makeFocusable: true }).pipe(
    Effect.ignore,
    Effect.as(CompletedFocusPlayer()),
  ),
)

/** Moves keyboard focus to the recording search. */
export const FocusSearch = Command.define(
  'FocusSearch',
  CompletedFocusSearch,
)(
  Dom.focus(`#${SEARCH_FIELD_ID}`).pipe(
    Effect.ignore,
    Effect.as(CompletedFocusSearch()),
  ),
)

/** Waits, then lets the next finished section of a recording in progress be announced. */
export const WaitForAnnouncementPause = Command.define(
  'WaitForAnnouncementPause',
  { revision: S.Number },
  ElapsedAnnouncementPause,
)(({ revision }) =>
  Effect.sleep(ANNOUNCEMENT_PAUSE).pipe(
    Effect.as(ElapsedAnnouncementPause({ revision })),
  ),
)

/** Moves the audio player to a time. */
export const SeekAudio = Command.define(
  'SeekAudio',
  { seconds: S.Number },
  CompletedSeekAudio,
)(({ seconds }) =>
  AudioPlayer.get.pipe(
    Effect.flatMap(player => player.seek(seconds)),
    Effect.as(CompletedSeekAudio()),
    Effect.catchTag('ResourceNotAvailable', () =>
      Effect.succeed(CompletedSeekAudio()),
    ),
  ),
)

const failedNotice = (notice: CopyNotice): CopyNotice => ({
  text: 'Could not copy to the clipboard',
  isFailure: true,
  revision: notice.revision,
})

/** Writes text to the clipboard and reports the notice to show. */
export const CopyText = Command.define(
  'CopyText',
  { text: S.String, notice: CopyNotice },
  SucceededCopy,
  FailedCopy,
)(({ text, notice }) =>
  ClipboardWriter.pipe(
    Effect.flatMap(clipboard => clipboard.writeText(text)),
    Effect.as(SucceededCopy({ notice })),
    Effect.catch(() =>
      Effect.succeed(FailedCopy({ notice: failedNotice(notice) })),
    ),
  ),
)

/**
 * Opens the system share sheet with a recording's link. Closing the sheet
 * without sharing is not a failure, so every outcome completes quietly.
 */
export const ShareRecordingLink = Command.define(
  'ShareRecordingLink',
  { url: S.String, title: S.String },
  CompletedShareRecordingLink,
)(({ url, title }) =>
  LinkSharer.pipe(
    Effect.flatMap(sharer => sharer.shareLink({ url, title })),
    Effect.catch(() => Effect.void),
    Effect.as(CompletedShareRecordingLink()),
  ),
)

/** Waits, then asks to hide the copy notice with this revision. */
export const HideCopyNoticeLater = Command.define(
  'HideCopyNoticeLater',
  { revision: S.Number },
  ElapsedCopyNotice,
)(({ revision }) =>
  Effect.sleep(COPY_NOTICE_DURATION).pipe(
    Effect.as(ElapsedCopyNotice({ revision })),
  ),
)

/** Waits, then asks to clear the linked section's highlight with this revision. */
export const ClearFocusHighlightLater = Command.define(
  'ClearFocusHighlightLater',
  { revision: S.Number },
  ElapsedFocusHighlight,
)(({ revision }) =>
  Effect.sleep(FOCUS_HIGHLIGHT_DURATION).pipe(
    Effect.as(ElapsedFocusHighlight({ revision })),
  ),
)

// SELECTOR

/** Whether the open recording is still being recorded on a device. */
export const isLiveRecording = (ready: ReadyPlayback): boolean =>
  ready.detail.summary.activity === 'Recording'

/**
 * The length to show for a recording. One in progress on another device
 * shows its last saved length plus the time since that save, at most a few
 * seconds more, so it counts up each second between saves (its writer saves
 * every few seconds, the web every 5) and stops soon after saves stop, as
 * when that recording pauses. Others show their saved length.
 *
 * @example
 * ```ts
 * liveDurationSecondsOf(
 *   { ...summary, activity: 'Recording', durationSeconds: 60, maybeUpdatedAtMs: Option.some(1_000) },
 *   Option.some(4_000),
 * )
 * // 63
 * ```
 */
export const liveDurationSecondsOf = (
  summary: RecordingSummary,
  maybeNowMs: Option.Option<number>,
): number =>
  summary.activity === 'Recording'
    ? Option.match(
        Option.all({
          nowMs: maybeNowMs,
          updatedAtMs: summary.maybeUpdatedAtMs,
        }),
        {
          onNone: () => summary.durationSeconds,
          onSome: ({ nowMs, updatedAtMs }) =>
            summary.durationSeconds +
            Number_.clamp((nowMs - updatedAtMs) / MILLISECONDS_PER_SECOND, {
              minimum: 0,
              maximum: LIVE_COUNT_UP_LIMIT_SECONDS,
            }),
        },
      )
    : summary.durationSeconds

/**
 * Whether a recording in progress on another device is on screen: a list row
 * or the open or background recording, not this browser's own recording.
 * While one is, the live clock ticks each second.
 */
export const isCountingLiveOf = (model: Model): boolean =>
  Array.isReadonlyArrayNonEmpty(countedLiveSummariesOf(model))

/**
 * The recordings in progress on another device that are on screen: list rows
 * and the open or background recording, not this browser's own recording.
 * One recording can appear more than once (a row and the open page).
 */
const countedLiveSummariesOf = (
  model: Model,
): ReadonlyArray<RecordingSummary> => {
  const isOtherDeviceLive = (summary: RecordingSummary): boolean =>
    summary.activity === 'Recording' && !isOwnRecordingOf(model, summary.id)
  const listed = M.value(model.recordings).pipe(
    M.withReturnType<ReadonlyArray<RecordingSummary>>(),
    M.tag('LoadedRecordings', ({ recordings }) => recordings),
    M.orElse(() => []),
  )
  const opened = M.value(model.playback).pipe(
    M.withReturnType<ReadonlyArray<RecordingSummary>>(),
    M.tag('ReadyPlayback', ready => [ready.detail.summary]),
    M.orElse(() => []),
  )
  const background = Option.toArray(
    Option.map(model.maybeBackgroundPlayback, ready => ready.detail.summary),
  )
  return Array.filter([...listed, ...opened, ...background], isOtherDeviceLive)
}

/**
 * The length a recording shows. One in progress on another device counts up
 * from its last save (`liveDurationSecondsOf`) and never shows less than it
 * showed before: its writer can save the time of a new section without its
 * length, which would move the estimate back by up to the few seconds since
 * the last length save. Others show their saved length.
 *
 * @example
 * ```ts
 * // shown 0:23 at the last tick; a section save then moved the save time
 * displayedLengthOf(model, { ...summary, activity: 'Recording', durationSeconds: 20 })
 * // 23, not 20
 * ```
 */
export const displayedLengthOf = (
  model: Model,
  summary: RecordingSummary,
): number =>
  summary.activity === 'Recording'
    ? Math.max(
        Option.getOrElse(
          Record.get(model.liveLengthFloors, summary.id),
          () => 0,
        ),
        liveDurationSecondsOf(summary, model.maybeLiveClockMs),
      )
    : summary.durationSeconds

/**
 * The longest length each counted recording has shown, after a tick of the
 * live clock at `nowMs`. Recordings no longer counted drop out.
 */
const liveLengthFloorsAt = (
  model: Model,
  nowMs: number,
): Readonly<Record<string, number>> =>
  Array.reduce(
    countedLiveSummariesOf(model),
    Record.empty<string, number>(),
    (floors, summary) =>
      Record.set(
        floors,
        summary.id,
        Math.max(
          Option.getOrElse(Record.get(floors, summary.id), () => 0),
          Option.getOrElse(
            Record.get(model.liveLengthFloors, summary.id),
            () => 0,
          ),
          liveDurationSecondsOf(summary, Option.some(nowMs)),
        ),
      ),
  )

/** The section the transcript follows: the newest one while recording, else the one playing. */
export const followedSectionOf = (
  ready: ReadyPlayback,
): Option.Option<Section> =>
  isLiveRecording(ready)
    ? Array.last(ready.detail.sections)
    : sectionAt(ready.detail.sections, ready.positionSeconds)

/** Where the followed section lands when the transcript scrolls to it. */
export const placementOf = (ready: ReadyPlayback): SectionPlacement =>
  isLiveRecording(ready) ? 'LiveEdge' : 'Center'

/**
 * Whether Back to Playhead (or, while recording, Back to Live) shows: the
 * listener scrolled away and the followed section is off screen.
 */
export const isReturnShownOf = (ready: ReadyPlayback): boolean =>
  ready.follow === 'Detached' && ready.playheadVisibility === 'OffScreen'

/** The playback position, following the scrubber while the listener drags it. */
export const displayedPositionOf = (ready: ReadyPlayback): number =>
  M.value(ready.scrub).pipe(
    M.withReturnType<number>(),
    M.tagsExhaustive({
      NotScrubbing: () => ready.positionSeconds,
      Scrubbing: ({ seconds }) => seconds,
    }),
  )

const detailDurationOf = (detail: RecordingDetail): number =>
  Math.max(
    detail.summary.durationSeconds,
    Option.getOrElse(
      Option.map(Array.last(detail.sections), section => section.endSeconds),
      () => 0,
    ),
  )

const END_OF_AUDIO_TOLERANCE_SECONDS = 0.5

/**
 * The phase a playback shows beside its title and in the tab title, in the
 * words the iPhone uses: Playing while audio plays, and Paused when it stopped
 * part way through. A playback at rest (not started, or played to the end)
 * and a recording still in progress show none; the recording bar shows a
 * live recording's phase.
 */
export const playbackPhaseOf = (
  ready: ReadyPlayback,
): Option.Option<PlaybackPhase> => {
  const position = displayedPositionOf(ready)
  if (isLiveRecording(ready)) {
    return Option.none()
  } else if (ready.transport === 'Playing') {
    return Option.some('Playing')
  } else if (
    isAudioPlayerReady(ready) &&
    position > 0 &&
    position < durationOf(ready) - END_OF_AUDIO_TOLERANCE_SECONDS
  ) {
    return Option.some('Paused')
  } else {
    return Option.none()
  }
}

/** The recording's length: the audio's once it is known, else the transcript's. */
export const durationOf = (ready: ReadyPlayback): number =>
  M.value(ready.audioPlayer).pipe(
    M.withReturnType<number>(),
    M.tagsExhaustive({
      AudioPlayerReady: ({ maybeDurationSeconds }) =>
        Option.getOrElse(maybeDurationSeconds, () =>
          detailDurationOf(ready.detail),
        ),
      NoAudioPlayer: () => detailDurationOf(ready.detail),
      AudioPlayerFailed: () => detailDurationOf(ready.detail),
    }),
  )

/** The audio the host's player should load, and the attempt it belongs to. */
export const audioSourceOf = (
  model: Model,
): Option.Option<Readonly<{ url: string; attempt: number }>> =>
  Option.flatMap(audioOwnerOf(model), ready =>
    Option.map(ready.maybeAudioUrl, url => ({
      url,
      attempt: ready.audioAttempt,
    })),
  )

/**
 * The recording whose audio is loaded: the one kept playing in the
 * background while the page shows something else, or else the open one.
 */
export const audioOwnerOf = (model: Model): Option.Option<ReadyPlayback> =>
  Option.orElse(model.maybeBackgroundPlayback, () =>
    M.value(model.playback).pipe(
      M.withReturnType<Option.Option<ReadyPlayback>>(),
      M.tag('ReadyPlayback', ready => Option.some(ready)),
      M.orElse(() => Option.none()),
    ),
  )

const audioFileIDOf = (detail: RecordingDetail): Option.Option<string> =>
  M.value(detail.audio).pipe(
    M.tag('StoredAudio', ({ fileID }) => Option.some(fileID)),
    M.orElse(() => Option.none()),
  )

/** The Instant files whose download URLs the open recording needs, in a stable order. */
export const fileIDsOf = (model: Model): ReadonlyArray<string> =>
  M.value(model.playback).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tag('ReadyPlayback', ready =>
      Array.sort(
        [
          ...Option.toArray(audioFileIDOf(ready.detail)),
          ...Array.map(ready.detail.images, image => image.fileID),
        ],
        Order.String,
      ),
    ),
    M.orElse(() => []),
  )

/** The recording whose detail the Program observes. */
export const observedRecordingIDOf = (model: Model): Option.Option<string> =>
  M.value(model.playback).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      NoPlayback: () => Option.none(),
      OpeningPlayback: ({ recordingID }) => Option.some(recordingID),
      MissingRecording: ({ recordingID }) => Option.some(recordingID),
      FailedPlayback: ({ recordingID }) => Option.some(recordingID),
      ReadyPlayback: ({ recordingID }) => Option.some(recordingID),
    }),
  )

// ROUTE

const noRequest: PlaybackRequest = {
  maybeStartSeconds: Option.none(),
  maybeFocusSectionID: Option.none(),
  isRouteFocus: false,
}

/** Where an open recording picks up again if it disappears and comes back: its playback position. */
const resumeRequestOf = (ready: ReadyPlayback): PlaybackRequest => ({
  maybeStartSeconds: Option.some(ready.positionSeconds),
  maybeFocusSectionID: Option.none(),
  isRouteFocus: false,
})

/** What the recording being opened was asked to show, or where an open one is. */
const openRequestOf = (playback: PlaybackState): PlaybackRequest =>
  M.value(playback).pipe(
    M.withReturnType<PlaybackRequest>(),
    M.tagsExhaustive({
      NoPlayback: () => noRequest,
      OpeningPlayback: ({ request }) => request,
      MissingRecording: ({ request }) => request,
      FailedPlayback: ({ request }) => request,
      ReadyPlayback: resumeRequestOf,
    }),
  )

/**
 * Playback after the signed-in account changed. A "missing" or "failed"
 * answer was for the other account, so the recording opens again for this
 * one and keeps what the link asked for; its observation restarts with the
 * new account.
 */
const reopenedForNewAccount = (playback: PlaybackState): PlaybackState =>
  M.value(playback).pipe(
    M.withReturnType<PlaybackState>(),
    M.tag('MissingRecording', 'FailedPlayback', ({ recordingID, request }) =>
      OpeningPlayback({ recordingID, request, patience: 'Loading' }),
    ),
    M.orElse(() => playback),
  )

/** A share link's page after the signed-in account changed: a "not available" answer was for the other account. */
const sharedRangeForNewAccount = (
  sharedRange: Share.Model.SharedRangeState,
): Share.Model.SharedRangeState =>
  M.value(sharedRange).pipe(
    M.withReturnType<Share.Model.SharedRangeState>(),
    M.tag('MissingSharedRange', 'FailedSharedRange', ({ shareID }) =>
      Share.Model.OpeningSharedRange({ shareID }),
    ),
    M.orElse(() => sharedRange),
  )

const openingFor = (
  route: ScribeRoute,
): Option.Option<Readonly<{ recordingID: string; request: PlaybackRequest }>> =>
  M.value(route).pipe(
    M.withReturnType<
      Option.Option<Readonly<{ recordingID: string; request: PlaybackRequest }>>
    >(),
    M.tagsExhaustive({
      RecordingList: () => Option.none(),
      RecordingsMap: () => Option.none(),
      SearchRecordings: () => Option.none(),
      NewRecording: () => Option.none(),
      Account: () => Option.none(),
      Questions: () => Option.none(),
      Share: () => Option.none(),
      NotFound: () => Option.none(),
      Recording: ({ recordingID }) =>
        Option.some({ recordingID, request: noRequest }),
      Thread: ({ recordingID }) =>
        Option.some({ recordingID, request: noRequest }),
      ThreadResponse: ({ recordingID }) =>
        Option.some({ recordingID, request: noRequest }),
      Section: ({ recordingID, sectionID, t }) =>
        Option.some({
          recordingID,
          request: {
            maybeStartSeconds: startSecondsOf(t),
            maybeFocusSectionID: Option.some(sectionID),
            isRouteFocus: false,
          },
        }),
      Playback: ({ recordingID, t, focus }) =>
        Option.some({
          recordingID,
          request: {
            maybeStartSeconds: startSecondsOf(t),
            maybeFocusSectionID: Option.none(),
            isRouteFocus: isRouteFocus(focus),
          },
        }),
    }),
  )

const isAudioPlayerReady = (ready: ReadyPlayback): boolean =>
  ready.audioPlayer._tag === 'AudioPlayerReady'

const seekTo = (ready: ReadyPlayback, seconds: number): ReadyReturn =>
  isAudioPlayerReady(ready)
    ? [
        evo(ready, {
          positionSeconds: () => seconds,
          maybePendingSeekSeconds: () => Option.none(),
        }),
        [SeekAudio({ seconds })],
      ]
    : [
        evo(ready, {
          positionSeconds: () => seconds,
          maybePendingSeekSeconds: () => Option.some(seconds),
        }),
        [],
      ]

const startForRequest = (
  detail: RecordingDetail,
  request: PlaybackRequest,
): Option.Option<number> =>
  Option.orElse(request.maybeStartSeconds, () =>
    pipe(
      request.maybeFocusSectionID,
      Option.flatMap(sectionID =>
        Array.findFirst(detail.sections, section => section.id === sectionID),
      ),
      Option.map(section => shareableStartSeconds(section.startSeconds)),
    ),
  )

const followedSectionIDOf = (ready: ReadyPlayback): Option.Option<string> =>
  Option.map(followedSectionOf(ready), section => section.id)

const scrollToFollowed = (ready: ReadyPlayback): Commands =>
  Option.match(followedSectionIDOf(ready), {
    onNone: () => [],
    onSome: sectionID => [
      ScrollToSection({ sectionID, placement: placementOf(ready) }),
    ],
  })

const followedExtentOf = (ready: ReadyPlayback): Option.Option<string> =>
  Option.map(
    followedSectionOf(ready),
    section => `${section.id}:${section.text.length}`,
  )

const isSameExtent = Option.makeEquivalence(Equivalence.String)

/**
 * Scrolls to the followed section when it changed while following: the
 * playhead reached another section, or the newest section of a recording in
 * progress arrived or grew. A recording that just finished stays where the
 * listener is.
 */
const followCommands = (
  before: ReadyPlayback,
  after: ReadyPlayback,
): Commands =>
  after.follow === 'Following' &&
  isLiveRecording(before) === isLiveRecording(after) &&
  !isSameExtent(followedExtentOf(before), followedExtentOf(after))
    ? scrollToFollowed(after)
    : []

const openingScrollOf = (
  ready: ReadyPlayback,
  request: PlaybackRequest,
): Commands =>
  Option.match(request.maybeFocusSectionID, {
    onSome: sectionID => [ScrollToSection({ sectionID, placement: 'Center' })],
    onNone: () =>
      Option.isSome(request.maybeStartSeconds) || isLiveRecording(ready)
        ? scrollToFollowed(ready)
        : [ScrollToRecordingTitle()],
  })

const applyRequest = (
  ready: ReadyPlayback,
  request: PlaybackRequest,
): ReadyReturn => {
  const isFocusing = Option.isSome(request.maybeFocusSectionID)
  const nextRevision = isFocusing
    ? ready.focusRevision + 1
    : ready.focusRevision
  const focused = evo(ready, {
    maybeFocusedSectionID: () => request.maybeFocusSectionID,
    focusRevision: () => nextRevision,
    follow: () => (isFocusing ? 'Detached' : 'Following'),
  })
  const highlightCommands: Commands = isFocusing
    ? [ClearFocusHighlightLater({ revision: nextRevision })]
    : []
  const [positioned, seekCommands]: ReadyReturn = Option.match(
    startForRequest(ready.detail, request),
    {
      onNone: () => [focused, []],
      onSome: seconds => seekTo(focused, seconds),
    },
  )
  return [
    positioned,
    [
      ...seekCommands,
      ...highlightCommands,
      ...openingScrollOf(positioned, request),
    ],
  ]
}

const withAudioUrl = (ready: ReadyPlayback): ReadyPlayback =>
  Option.isSome(ready.maybeAudioUrl)
    ? ready
    : evo(ready, {
        maybeAudioUrl: () =>
          Option.flatMap(audioFileIDOf(ready.detail), fileID =>
            Record.get(ready.fileUrls, fileID),
          ),
      })

const readyFor = (
  recordingID: string,
  detail: RecordingDetail,
  skippedCount: number,
  maybeSkippedReason: Option.Option<string>,
): ReadyPlayback =>
  ReadyPlayback({
    recordingID,
    detail,
    skippedCount,
    maybeSkippedReason,
    fileUrls: {},
    positionSeconds: 0,
    transport: 'Paused',
    follow: 'Following',
    playheadVisibility: 'OnScreen',
    screenMode: 'Standard',
    scrub: NotScrubbing(),
    audioPlayer: NoAudioPlayer(),
    maybeAudioUrl: Option.none(),
    audioAttempt: 0,
    maybePendingSeekSeconds: Option.none(),
    maybeFocusedSectionID: Option.none(),
    focusRevision: 0,
    maybeAnnouncedText: Option.none(),
    announcementPause: ReadyToAnnounce(),
    announcementRevision: 0,
  })

const openRecording = (
  model: Model,
  recordingID: string,
  request: PlaybackRequest,
): UpdateReturn => {
  const opening = evo(model, {
    playback: () =>
      OpeningPlayback({ recordingID, request, patience: 'Loading' }),
  })
  return M.value(model.playback).pipe(
    withUpdateReturn,
    M.tag('ReadyPlayback', ready => {
      if (ready.recordingID === recordingID) {
        const [nextReady, commands] = applyRequest(ready, request)
        return [evo(model, { playback: () => nextReady }), commands]
      } else {
        return [opening, []]
      }
    }),
    M.tag('MissingRecording', 'FailedPlayback', unopened =>
      unopened.recordingID === recordingID
        ? [
            evo(model, {
              playback: () => evo(unopened, { request: () => request }),
            }),
            [],
          ]
        : [opening, []],
    ),
    M.orElse(() => [opening, []]),
  )
}

const sharedRangeFor = (
  route: ScribeRoute,
  share: Share.Model.Model,
): Share.Model.SharedRangeState =>
  M.value(route).pipe(
    M.withReturnType<Share.Model.SharedRangeState>(),
    M.tag('Share', ({ shareID }) =>
      M.value(share.sharedRange).pipe(
        M.withReturnType<Share.Model.SharedRangeState>(),
        M.tag(
          'ReadySharedRange',
          'MissingSharedRange',
          'FailedSharedRange',
          'OpeningSharedRange',
          current =>
            current.shareID === shareID
              ? current
              : Share.Model.OpeningSharedRange({ shareID }),
        ),
        M.orElse(() => Share.Model.OpeningSharedRange({ shareID })),
      ),
    ),
    M.orElse(() => Share.Model.NoSharedRange()),
  )

/**
 * Where the listener left each recording: the open one's position is kept
 * when it was left part way through, and dropped when it was played to the
 * end, so it starts over.
 */
const rememberedPositionsOf = (
  model: Model,
): Readonly<Record<string, number>> =>
  M.value(model.playback).pipe(
    M.withReturnType<Readonly<Record<string, number>>>(),
    M.tag('ReadyPlayback', ready =>
      isLiveRecording(ready) ||
      ready.positionSeconds <= 0 ||
      ready.positionSeconds >=
        durationOf(ready) - END_OF_AUDIO_TOLERANCE_SECONDS
        ? Record.remove(model.resumePositions, ready.recordingID)
        : Record.set(
            model.resumePositions,
            ready.recordingID,
            ready.positionSeconds,
          ),
    ),
    M.orElse(() => model.resumePositions),
  )

/** A link that names no moment resumes where the listener left the recording. */
const resumingRequestOf = (
  model: Model,
  recordingID: string,
  request: PlaybackRequest,
): PlaybackRequest =>
  Option.isNone(request.maybeStartSeconds) &&
  Option.isNone(request.maybeFocusSectionID)
    ? {
        ...request,
        maybeStartSeconds: Record.get(model.resumePositions, recordingID),
      }
    : request

/**
 * What keeps playing when the listener leaves the open recording: that
 * recording, if they had started it (playing, or paused part way through),
 * or else whatever was already playing in the background.
 */
const backgroundAfterLeavingOf = (model: Model): Option.Option<ReadyPlayback> =>
  M.value(model.playback).pipe(
    M.withReturnType<Option.Option<ReadyPlayback>>(),
    M.tag('ReadyPlayback', ready =>
      Option.isSome(playbackPhaseOf(ready))
        ? Option.some(evo(ready, { screenMode: () => 'Standard' }))
        : model.maybeBackgroundPlayback,
    ),
    M.orElse(() => model.maybeBackgroundPlayback),
  )

const isRequestingNoMoment = (request: PlaybackRequest): boolean =>
  Option.isNone(request.maybeStartSeconds) &&
  Option.isNone(request.maybeFocusSectionID)

/**
 * Opens a recording. The one playing in the background comes back to its
 * page where it is; this browser's own recording in progress opens beside a
 * background playback, which keeps playing; any other recording replaces it.
 */
const openRoutedRecording = (
  model: Model,
  routed: Model,
  recordingID: string,
  request: PlaybackRequest,
): UpdateReturn =>
  Option.match(
    Option.filter(
      model.maybeBackgroundPlayback,
      background => background.recordingID === recordingID,
    ),
    {
      onSome: background => {
        const restored = evo(routed, {
          playback: () => evo(background, { follow: () => 'Following' }),
          maybeBackgroundPlayback: () => Option.none(),
        })
        return isRequestingNoMoment(request)
          ? [restored, scrollToFollowed(background)]
          : openRecording(restored, recordingID, request)
      },
      onNone: () =>
        openRecording(
          evo(routed, {
            maybeBackgroundPlayback: () =>
              isOwnRecordingOf(model, recordingID)
                ? backgroundAfterLeavingOf(model)
                : Option.none(),
          }),
          recordingID,
          resumingRequestOf(routed, recordingID, request),
        ),
    },
  )

/**
 * The search a route shows: the `q` of a search link, none on the list
 * itself, and on other pages the search the sidebar already shows.
 */
const questionsFor = (
  route: ScribeRoute,
  questions: Questions.Model.Model,
): Questions.Model.Model =>
  M.value(route).pipe(
    M.withReturnType<Questions.Model.Model>(),
    M.tag('Questions', ({ q }) =>
      Questions.withSearch(
        questions,
        Option.getOrElse(q, () => ''),
      ),
    ),
    M.orElse(() => questions),
  )

const searchQueryFor = (route: ScribeRoute, searchQuery: string): string =>
  M.value(route).pipe(
    M.withReturnType<string>(),
    M.tag('SearchRecordings', ({ q }) => Option.getOrElse(q, () => '')),
    M.tag('RecordingList', () => ''),
    M.orElse(() => searchQuery),
  )

/**
 * The page a search typed on the list shows, when the address bar needs to
 * change: `/recordings/search?q=rain`, or the search page without `q` once the
 * search is cleared there. A blank search on the list itself changes nothing.
 */
const searchRouteFor = (
  route: ScribeRoute,
  query: string,
): Option.Option<ScribeRoute> =>
  pipe(
    Array.match(searchTermsOf(query), {
      onEmpty: () =>
        route._tag === 'RecordingList'
          ? Option.none()
          : Option.some(SearchRecordingsRoute({ q: Option.none() })),
      onNonEmpty: () =>
        Option.some(SearchRecordingsRoute({ q: Option.some(query) })),
    }),
    Option.filter(
      nextRoute => scribeRouteToPath(nextRoute) !== scribeRouteToPath(route),
    ),
  )

const applyRoute = (model: Model, route: ScribeRoute): UpdateReturn => {
  const isSamePage = scribeRouteToPath(route) === scribeRouteToPath(model.route)
  const routed = evo(model, {
    route: () => route,
    searchQuery: searchQuery =>
      isSamePage ? searchQuery : searchQueryFor(route, searchQuery),
    share: share =>
      evo(share, { sharedRange: () => sharedRangeFor(route, share) }),
    questions: questions =>
      isSamePage ? questions : questionsFor(route, questions),
    resumePositions: () => rememberedPositionsOf(model),
  })
  return Option.match(openingFor(route), {
    onNone: () => [
      evo(routed, {
        playback: () => NoPlayback(),
        maybeBackgroundPlayback: () => backgroundAfterLeavingOf(model),
      }),
      [],
    ],
    onSome: ({ recordingID, request }) =>
      openRoutedRecording(model, routed, recordingID, request),
  })
}

/** The Model a route opens into, before any data arrives. */
export const modelForRoute = (route: ScribeRoute): Model =>
  applyRoute(
    {
      route: RecordingListRoute(),
      identity: CheckingIdentity(),
      account: Account.Model.init(),
      capture: Capture.Model.init(),
      share: Share.Model.init(),
      questions: Questions.Model.init(),
      recordings: LoadingRecordings(),
      recordingWindow: firstRecordingWindow,
      maybeFocusedRowID: Option.none(),
      playback: NoPlayback(),
      maybeBackgroundPlayback: Option.none(),
      resumePositions: {},
      maybeLiveClockMs: Option.none(),
      liveLengthFloors: {},
      recordingAttempt: 0,
      maybeCopyNotice: Option.none(),
      copyRevision: 0,
      connectivity: 'Online',
      searchQuery: '',
    },
    route,
  )[0]

type Loaded = typeof LoadedRecordings.Type

const byNewestStart = Order.mapInput(
  Order.flip(Order.Number),
  (recording: RecordingSummary) => recording.startedAtMs,
)

const loadedOfState = (recordings: RecordingsState): Option.Option<Loaded> =>
  M.value(recordings).pipe(
    M.withReturnType<Option.Option<Loaded>>(),
    M.tag('LoadedRecordings', loaded => Option.some(loaded)),
    M.orElse(() => Option.none()),
  )

/** The loaded list, only while it shows the rows of the window it asks for. */
const settledLoadedOf = (model: Model): Option.Option<Loaded> =>
  Option.filter(loadedOfState(model.recordings), loaded =>
    isSameRecordingWindow(loaded.window, model.recordingWindow),
  )

/**
 * Whether the list is loading a page, and toward which edge: it is loading
 * while its rows came from a window other than the one it asks for.
 */
export const listPagingOf = (model: Model): ListPaging =>
  Option.match(loadedOfState(model.recordings), {
    onNone: () => 'Settled',
    onSome: ({ window }) => {
      if (isSameRecordingWindow(window, model.recordingWindow)) {
        return 'Settled'
      } else if (model.recordingWindow.firstPage < window.firstPage) {
        return 'LoadingNewer'
      } else {
        return 'LoadingOlder'
      }
    },
  })

/**
 * The rows the list shows: its window's rows, newest first, and the row that
 * holds keyboard focus when its page has left the window.
 */
export const listedRecordingsOf = (
  loaded: Loaded,
): ReadonlyArray<RecordingSummary> =>
  Option.match(loaded.maybeKeptFocusedRow, {
    onNone: () => loaded.recordings,
    onSome: kept => Array.sort([kept, ...loaded.recordings], byNewestStart),
  })

/**
 * How many recordings the list knows the account has: exactly
 * the rows it holds once the window starts at the newest recording and the
 * server reports nothing older; at least that many while more may follow;
 * none once the window no longer starts at the newest recording, since the
 * pages it dropped are not counted and may have come back short.
 */
export const recordingCountOf = (model: Model): RecordingCount =>
  Option.match(loadedOfState(model.recordings), {
    onNone: () => UnknownCount(),
    onSome: loaded => {
      const count = Array.length(loaded.recordings)
      if (loaded.window.firstPage > 0) {
        return UnknownCount()
      } else if (loaded.olderEdge === 'EndOfList') {
        return ExactCount({ count })
      } else {
        return AtLeastCount({ count })
      }
    },
  })

const isSearchingOf = (model: Model): boolean =>
  Array.isReadonlyArrayNonEmpty(searchTermsOf(model.searchQuery))

/**
 * The window an edge coming near asks for: the next one past that edge, only
 * while the list shows the rows of the window it asks for (never while a page
 * loads), only for the edge of that window, and only while there is more past
 * the edge. During a search the window grows but never slides, so the results
 * stay put.
 */
const windowForApproachOf = (
  model: Model,
  edge: ListEdge,
  window: RecordingWindow,
): Option.Option<RecordingWindow> =>
  pipe(
    settledLoadedOf(model),
    Option.filter(loaded => isSameRecordingWindow(loaded.window, window)),
    Option.flatMap(loaded =>
      M.value(edge).pipe(
        M.withReturnType<Option.Option<RecordingWindow>>(),
        M.when('Older', () =>
          loaded.olderEdge === 'MoreToLoad' &&
          (!isSearchingOf(model) ||
            loaded.window.pageCount < RECORDING_WINDOW_PAGE_LIMIT)
            ? Option.some(olderRecordingWindowOf(loaded.window))
            : Option.none(),
        ),
        M.when('Newer', () =>
          isSearchingOf(model)
            ? Option.none()
            : newerRecordingWindowOf(loaded.window),
        ),
        M.exhaustive,
      ),
    ),
  )

/** The window the very top of a slid list asks for: the newest page, in one step. */
const windowForListTopOf = (
  model: Model,
  window: RecordingWindow,
): Option.Option<RecordingWindow> =>
  pipe(
    settledLoadedOf(model),
    Option.filter(
      loaded =>
        isSameRecordingWindow(loaded.window, window) &&
        loaded.window.firstPage > 0,
    ),
    Option.as(firstRecordingWindow),
  )

const windowEndOf = (window: RecordingWindow): number =>
  window.firstPage + window.pageCount

/** Whether `next` brought a recording older than every row of `previous`. */
const addsOlderRecordings = (
  previous: ReadonlyArray<RecordingSummary>,
  next: ReadonlyArray<RecordingSummary>,
): boolean =>
  Option.match(Array.last(previous), {
    onNone: () => Array.isReadonlyArrayNonEmpty(next),
    onSome: oldest => {
      const previousIDs = new Set(
        Array.map(previous, recording => recording.id),
      )
      return Array.some(
        next,
        recording =>
          !previousIDs.has(recording.id) &&
          recording.startedAtMs <= oldest.startedAtMs,
      )
    },
  })

/**
 * What lies past a snapshot's older edge. A load that moved the older edge
 * but added no older recording is `NothingAdded`, even when the server still
 * reports more, and live snapshots of the same window keep it so: the edge
 * asks again only after the window moves, so it cannot loop.
 */
const olderEdgeAfter = (
  maybePrevious: Option.Option<Loaded>,
  window: RecordingWindow,
  recordings: ReadonlyArray<RecordingSummary>,
  hasOlder: boolean,
): OlderEdge => {
  if (!hasOlder) {
    return 'EndOfList'
  } else if (Option.isNone(maybePrevious)) {
    return 'MoreToLoad'
  } else if (isSameRecordingWindow(maybePrevious.value.window, window)) {
    return maybePrevious.value.olderEdge === 'NothingAdded'
      ? 'NothingAdded'
      : 'MoreToLoad'
  } else if (windowEndOf(window) > windowEndOf(maybePrevious.value.window)) {
    return addsOlderRecordings(maybePrevious.value.recordings, recordings)
      ? 'MoreToLoad'
      : 'NothingAdded'
  } else {
    return 'MoreToLoad'
  }
}

/**
 * The row to keep after a snapshot: the row that holds keyboard focus, when
 * the list showed it before and the snapshot no longer holds it, so a page
 * leaving the window never takes focus with it.
 */
const keptFocusedRowAfter = (
  maybePrevious: Option.Option<Loaded>,
  maybeFocusedRowID: Option.Option<string>,
  recordings: ReadonlyArray<RecordingSummary>,
): Option.Option<RecordingSummary> =>
  Option.flatMap(maybeFocusedRowID, focusedRowID =>
    Array.some(recordings, recording => recording.id === focusedRowID)
      ? Option.none()
      : Option.flatMap(maybePrevious, previous =>
          Array.findFirst(
            listedRecordingsOf(previous),
            recording => recording.id === focusedRowID,
          ),
        ),
  )

const loadedRecordingsFrom = (
  previous: RecordingsState,
  maybeFocusedRowID: Option.Option<string>,
  {
    window,
    recordings,
    skippedCount,
    maybeSkippedReason,
    hasOlder,
  }: typeof ObservedRecordings.Type,
): RecordingsState => {
  const maybePrevious = loadedOfState(previous)
  return LoadedRecordings({
    recordings,
    skippedCount,
    maybeSkippedReason,
    window,
    olderEdge: olderEdgeAfter(maybePrevious, window, recordings, hasOlder),
    maybeKeptFocusedRow: keptFocusedRowAfter(
      maybePrevious,
      maybeFocusedRowID,
      recordings,
    ),
    highestTitleNumber: Math.max(
      Option.match(maybePrevious, {
        onNone: () => 0,
        onSome: loaded => loaded.highestTitleNumber,
      }),
      highestTitleNumberIn(recordings),
    ),
  })
}

const withoutUnfocusedKeptRow = (
  recordings: RecordingsState,
  maybeFocusedRowID: Option.Option<string>,
): RecordingsState =>
  M.value(recordings).pipe(
    M.withReturnType<RecordingsState>(),
    M.tag('LoadedRecordings', loaded =>
      Option.exists(
        loaded.maybeKeptFocusedRow,
        kept => !Option.contains(maybeFocusedRowID, kept.id),
      )
        ? evo(loaded, { maybeKeptFocusedRow: () => Option.none() })
        : loaded,
    ),
    M.orElse(() => recordings),
  )

// UPDATE

const updateReady = (
  model: Model,
  transform: (ready: ReadyPlayback) => ReadyReturn,
): UpdateReturn =>
  M.value(model.playback).pipe(
    withUpdateReturn,
    M.tag('ReadyPlayback', ready => {
      const [nextReady, commands] = transform(ready)
      return [evo(model, { playback: () => nextReady }), commands]
    }),
    M.orElse(() => [model, []]),
  )

const evolveReady = (
  model: Model,
  transform: (ready: ReadyPlayback) => ReadyPlayback,
): UpdateReturn => updateReady(model, ready => [transform(ready), []])

const isPageScroll = (command: Commands[number]): boolean =>
  command.name === 'ScrollToSection'

/**
 * Applies a change to the recording whose audio is loaded (`audioOwnerOf`).
 * A recording playing in the background has no page on screen, so the scrolls
 * its playhead asks for are dropped.
 */
const updateAudio = (
  model: Model,
  transform: (ready: ReadyPlayback) => ReadyReturn,
): UpdateReturn =>
  Option.match(model.maybeBackgroundPlayback, {
    onSome: background => {
      const [nextBackground, commands] = transform(background)
      return [
        evo(model, {
          maybeBackgroundPlayback: () => Option.some(nextBackground),
        }),
        Array.filter(commands, command => !isPageScroll(command)),
      ]
    },
    onNone: () => updateReady(model, transform),
  })

const evolveAudio = (
  model: Model,
  transform: (ready: ReadyPlayback) => ReadyPlayback,
): UpdateReturn => updateAudio(model, ready => [transform(ready), []])

const announce = (ready: ReadyPlayback, text: string): ReadyReturn => {
  const revision = ready.announcementRevision + 1
  return [
    evo(ready, {
      maybeAnnouncedText: () => Option.some(text),
      announcementRevision: () => revision,
      announcementPause: () =>
        PausingAnnouncements({ revision, maybeWaitingText: Option.none() }),
    }),
    [WaitForAnnouncementPause({ revision })],
  ]
}

const newestFinishedTextOf = (
  before: ReadyPlayback,
  after: ReadyPlayback,
): Option.Option<string> => {
  const wasFinished = (sectionID: string): boolean =>
    Array.some(
      before.detail.sections,
      section => section.id === sectionID && section.isFinal,
    )
  return isLiveRecording(after)
    ? pipe(
        after.detail.sections,
        Array.filter(section => section.isFinal && !wasFinished(section.id)),
        Array.last,
        Option.map(section => section.text),
      )
    : Option.none()
}

/**
 * Announces a recording in progress to screen readers as sections finish,
 * at most once per pause; a section that finishes during a pause waits, and
 * only the newest waiting one is read when the pause ends.
 */
const announceNewSections = (
  before: ReadyPlayback,
  after: ReadyPlayback,
): ReadyReturn =>
  Option.match(newestFinishedTextOf(before, after), {
    onNone: () => [after, []],
    onSome: text =>
      M.value(after.announcementPause).pipe(
        M.withReturnType<ReadyReturn>(),
        M.tagsExhaustive({
          ReadyToAnnounce: () => announce(after, text),
          PausingAnnouncements: ({ revision }) => [
            evo(after, {
              announcementPause: () =>
                PausingAnnouncements({
                  revision,
                  maybeWaitingText: Option.some(text),
                }),
            }),
            [],
          ],
        }),
      ),
  })

const scrollToOffScreenFollowed = (ready: ReadyPlayback): Commands =>
  ready.follow === 'Following' && ready.playheadVisibility === 'OffScreen'
    ? scrollToFollowed(ready)
    : []

const play = (ready: ReadyPlayback): ReadyReturn => {
  if (isAudioPlayerReady(ready)) {
    return [
      evo(ready, { transport: () => 'Playing' }),
      [PlayAudio(), ...scrollToOffScreenFollowed(ready)],
    ]
  } else {
    return [ready, []]
  }
}

const pause = (ready: ReadyPlayback): ReadyReturn => [
  evo(ready, { transport: () => 'Paused' }),
  [PauseAudio()],
]

const togglePlayback = (ready: ReadyPlayback): ReadyReturn =>
  ready.transport === 'Playing' ? pause(ready) : play(ready)

const seekFollowing = (ready: ReadyPlayback, seconds: number): ReadyReturn => {
  const [sought, seekCommands] = seekTo(ready, seconds)
  return [sought, [...seekCommands, ...followCommands(ready, sought)]]
}

const skipBy = (ready: ReadyPlayback, deltaSeconds: number): ReadyReturn =>
  seekFollowing(
    ready,
    Math.min(
      durationOf(ready),
      Math.max(0, ready.positionSeconds + deltaSeconds),
    ),
  )

const returnToFollowed = (ready: ReadyPlayback): ReadyReturn => {
  const returned = evo(ready, {
    follow: () => 'Following',
    maybeFocusedSectionID: () => Option.none(),
  })
  return [returned, scrollToFollowed(returned)]
}

/**
 * Enters or leaves Full Screen. The header comes and goes above the
 * transcript, so a followed playhead or live edge is scrolled back into view.
 */
const withScreenMode = (
  ready: ReadyPlayback,
  screenMode: ScreenMode,
): ReadyReturn => {
  const next = evo(ready, { screenMode: () => screenMode })
  return [next, next.follow === 'Following' ? scrollToFollowed(next) : []]
}

const pauseToggleOf = (
  capture: Capture.Model.Model,
): Option.Option<Capture.Message.Message> =>
  M.value(capture.state).pipe(
    M.withReturnType<Option.Option<Capture.Message.Message>>(),
    M.tag('Capturing', ({ transport }) =>
      Option.some(
        transport === 'Paused'
          ? Capture.resumeRecording()
          : Capture.pauseRecording(),
      ),
    ),
    M.orElse(() => Option.none()),
  )

const observedRecording = (
  model: Model,
  recordingID: string,
  maybeDetail: Option.Option<RecordingDetail>,
  skippedCount: number,
  maybeSkippedReason: Option.Option<string>,
): UpdateReturn => {
  const becomeReady = (
    detail: RecordingDetail,
    request: PlaybackRequest,
  ): UpdateReturn => {
    const [ready, commands] = applyRequest(
      readyFor(recordingID, detail, skippedCount, maybeSkippedReason),
      request,
    )
    return [evo(model, { playback: () => ready }), commands]
  }
  return M.value(model.playback).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      NoPlayback: () => [model, []],
      OpeningPlayback: opening => {
        if (opening.recordingID !== recordingID) {
          return [model, []]
        } else {
          return Option.match(maybeDetail, {
            onNone: () => [
              model,
              [
                ConfirmRecording({
                  recordingID,
                  maybeUserID: signedInUserIDOf(model),
                }),
              ],
            ],
            onSome: detail => becomeReady(detail, opening.request),
          })
        }
      },
      MissingRecording: missing =>
        missing.recordingID === recordingID && Option.isSome(maybeDetail)
          ? becomeReady(maybeDetail.value, missing.request)
          : [model, []],
      FailedPlayback: failed =>
        failed.recordingID === recordingID && Option.isSome(maybeDetail)
          ? becomeReady(maybeDetail.value, failed.request)
          : [model, []],
      ReadyPlayback: ready => {
        if (ready.recordingID !== recordingID) {
          return [model, []]
        } else {
          return Option.match(maybeDetail, {
            onNone: () => [
              evo(model, {
                playback: () =>
                  MissingRecording({
                    recordingID,
                    request: resumeRequestOf(ready),
                  }),
              }),
              [],
            ],
            onSome: detail => {
              const refreshed = withAudioUrl(
                evo(ready, {
                  detail: () => detail,
                  skippedCount: () => skippedCount,
                  maybeSkippedReason: () => maybeSkippedReason,
                }),
              )
              const [announced, announcementCommands] = announceNewSections(
                ready,
                refreshed,
              )
              return [
                evo(model, { playback: () => announced }),
                [...followCommands(ready, announced), ...announcementCommands],
              ]
            },
          })
        }
      },
    }),
  )
}

const copyWithNotice = (
  model: Model,
  text: string,
  noticeText: string,
): UpdateReturn => {
  const revision = model.copyRevision + 1
  return [
    evo(model, { copyRevision: () => revision }),
    [
      CopyText({
        text,
        notice: { text: noticeText, isFailure: false, revision },
      }),
    ],
  ]
}

const copyFromReady = (
  model: Model,
  toCopy: (ready: ReadyPlayback) => Option.Option<readonly [string, string]>,
): UpdateReturn =>
  M.value(model.playback).pipe(
    withUpdateReturn,
    M.tag('ReadyPlayback', ready =>
      Option.match(toCopy(ready), {
        onNone: () => [model, []],
        onSome: ([text, noticeText]) => copyWithNotice(model, text, noticeText),
      }),
    ),
    M.orElse(() => [model, []]),
  )

/**
 * The link Copy Link to This Moment copies from the player: the section at
 * the playhead with the one-second lead-in, the same form as the section
 * menu's link and the iPhone's; the playback form only where no section is.
 */
const momentRouteOf = (ready: ReadyPlayback): ScribeRoute => {
  const position = displayedPositionOf(ready)
  const t = Option.some(formatStartSeconds(shareableStartSeconds(position)))
  return Option.match(sectionAt(ready.detail.sections, position), {
    onNone: () =>
      PlaybackRoute({
        recordingID: ready.recordingID,
        t,
        focus: Option.none(),
      }),
    onSome: section =>
      SectionRoute({
        recordingID: ready.recordingID,
        sectionID: section.id,
        t,
      }),
  })
}

const sectionNamed = (
  ready: ReadyPlayback,
  sectionID: string,
): Option.Option<Section> =>
  Array.findFirst(ready.detail.sections, section => section.id === sectionID)

const applyAccountResult = (
  model: Model,
  [nextAccount, accountCommands, maybeOutMessage]: Account.UpdateReturn,
): UpdateReturn => {
  const mappedCommands = Command.mapMessages(accountCommands, message =>
    GotAccountMessage({ message }),
  )
  const nextModel = evo(model, { account: () => nextAccount })
  return Option.match(maybeOutMessage, {
    onNone: () => [nextModel, mappedCommands],
    onSome: outMessage =>
      M.value(outMessage).pipe(
        withUpdateReturn,
        M.tagsExhaustive({
          RequestedCopy: ({ text, noticeText }) => {
            const [copiedModel, copyCommands] = copyWithNotice(
              nextModel,
              text,
              noticeText,
            )
            return [copiedModel, [...mappedCommands, ...copyCommands]]
          },
        }),
      ),
  })
}

const recordingTitleNumberPattern = /^Recording (\d+)/

const titleNumberOf = (recording: RecordingSummary): Option.Option<number> =>
  pipe(
    Option.fromNullishOr(recordingTitleNumberPattern.exec(recording.title)),
    Option.flatMap(match => Array.get(match, 1)),
    Option.map(Number),
  )

const highestTitleNumberIn = (
  recordings: ReadonlyArray<RecordingSummary>,
): number =>
  Array.reduce(recordings, 0, (highest, recording) =>
    Option.match(titleNumberOf(recording), {
      onNone: () => highest,
      onSome: titleNumber => Math.max(highest, titleNumber),
    }),
  )

/**
 * The number the next web recording's title takes: one past the highest
 * `Recording N` this account's list has shown, as on the iPhone, including
 * pages that have since left the window. `None` until the list has loaded, so
 * a recording started too early never reuses a number.
 */
export const nextRecordingTitleNumberOf = (
  model: Model,
): Option.Option<number> =>
  Option.map(
    loadedOfState(model.recordings),
    loaded => loaded.highestTitleNumber + 1,
  )

const isSameUserID = Option.makeEquivalence(Equivalence.String)

/** The Instant user this browser is signed in as. */
export const signedInUserIDOf = (model: Model): Option.Option<string> =>
  M.value(model.identity).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tag('SignedIn', ({ userID }) => Option.some(userID)),
    M.orElse(() => Option.none()),
  )

/**
 * Whether signing in has finished, so what Instant answers is what this
 * account can read. Until the page knows who Cloudflare Access says the
 * listener is and has signed in to that account, a recording that looks
 * missing may still arrive.
 */
export const isSignInSettledOf = (model: Model): boolean =>
  model.identity._tag !== 'CheckingIdentity' &&
  M.value(model.account.connection).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      CheckingAccount: () => false,
      ConnectingAccount: () => false,
      ConnectedAccount: () => model.identity._tag === 'SignedIn',
      NoAccessIdentity: () => true,
      FailedAccountCheck: () => true,
      AwaitingIPhone: () => true,
      FailedConnect: () => true,
      SignedOutAccount: () => true,
    }),
  )

/**
 * The playback the recording page shows. A recording the server has not
 * found shows as opening until sign-in settles, so a link opened in a new tab
 * goes from Opening straight to the moment it points at, never through "not
 * available".
 */
export const displayedPlaybackOf = (model: Model): PlaybackState =>
  M.value(model.playback).pipe(
    M.withReturnType<PlaybackState>(),
    M.tag('MissingRecording', ({ recordingID, request }) =>
      isSignInSettledOf(model)
        ? model.playback
        : OpeningPlayback({ recordingID, request, patience: 'Loading' }),
    ),
    M.orElse(() => model.playback),
  )

/**
 * The recording that is opening in this attempt and has not been slow yet,
 * with the attempt: while there is one, a timer runs, and when it ends the
 * page says the transcript is still loading.
 */
export const openingWaitOf = (
  model: Model,
): Option.Option<Readonly<{ recordingID: string; attempt: number }>> =>
  M.value(model.playback).pipe(
    M.withReturnType<
      Option.Option<Readonly<{ recordingID: string; attempt: number }>>
    >(),
    M.tag('OpeningPlayback', ({ recordingID, patience }) =>
      patience === 'Loading'
        ? Option.some({ recordingID, attempt: model.recordingAttempt })
        : Option.none(),
    ),
    M.orElse(() => Option.none()),
  )

/**
 * Asks Scribe for the open recording again: a slow opening waits anew, and a
 * recording that did not load opens again with what its link asked for.
 * Anything else stays as it is.
 */
const tryOpeningAgain = (model: Model): UpdateReturn =>
  M.value(model.playback).pipe(
    withUpdateReturn,
    M.tag('OpeningPlayback', 'FailedPlayback', ({ recordingID, request }) => [
      evo(model, {
        recordingAttempt: attempt => attempt + 1,
        playback: () =>
          OpeningPlayback({ recordingID, request, patience: 'Loading' }),
      }),
      [],
    ]),
    M.orElse(() => [model, []]),
  )

/** The share link page's state as shown: a share not found yet shows as opening until sign-in settles. */
export const displayedSharedRangeOf = (
  model: Model,
): Share.Model.SharedRangeState =>
  M.value(model.share.sharedRange).pipe(
    M.withReturnType<Share.Model.SharedRangeState>(),
    M.tag('MissingSharedRange', ({ shareID }) =>
      isSignInSettledOf(model)
        ? model.share.sharedRange
        : Share.Model.OpeningSharedRange({ shareID }),
    ),
    M.orElse(() => model.share.sharedRange),
  )

/** The recording the host's microphone session belongs to, while one is wanted. */
export const captureSessionRequirementsOf = (
  model: Model,
): Option.Option<Readonly<{ recordingID: string }>> =>
  Option.map(Capture.Model.draftOf(model.capture), draft => ({
    recordingID: draft.recordingID,
  }))

/** Whether New Recording is offered: the account is connected, the list (or a search of it) shows, and it has loaded. */
export const isRecordAvailableOf = (model: Model): boolean =>
  model.account.connection._tag === 'ConnectedAccount' &&
  isListRoute(model.route) &&
  model.recordings._tag === 'LoadedRecordings'

/** Whether the recording search shows: on the list or the search page, once recordings have loaded. */
export const isSearchAvailableOf = (model: Model): boolean =>
  isListRoute(model.route) && model.recordings._tag === 'LoadedRecordings'

/** Whether the open recording is the one this browser is recording. */
export const isOwnRecordingOf = (model: Model, recordingID: string): boolean =>
  Option.exists(
    Capture.Model.draftOf(model.capture),
    draft => draft.recordingID === recordingID,
  )

type PlaybackShortcuts = Pick<
  ShortcutContext,
  'isPlaybackReady' | 'isAwayFromFollowed' | 'isRecordingOpen' | 'isFullScreen'
>

const playbackShortcutsOf = (model: Model): PlaybackShortcuts => {
  const isPlaybackReady = Option.exists(
    audioOwnerOf(model),
    owner =>
      isAudioPlayerReady(owner) && !isOwnRecordingOf(model, owner.recordingID),
  )
  return M.value(model.playback).pipe(
    M.withReturnType<PlaybackShortcuts>(),
    M.tag('ReadyPlayback', ready => ({
      isPlaybackReady,
      isAwayFromFollowed: isReturnShownOf(ready),
      isRecordingOpen: true,
      isFullScreen: ready.screenMode === 'FullScreen',
    })),
    M.orElse(() => ({
      isPlaybackReady,
      isAwayFromFollowed: false,
      isRecordingOpen: false,
      isFullScreen: false,
    })),
  )
}

/** What the page offers right now, for the keyboard shortcuts. */
export const shortcutContextOf = (model: Model): ShortcutContext => ({
  ...playbackShortcutsOf(model),
  isRecordAvailable:
    isRecordAvailableOf(model) && Capture.Model.canStart(model.capture),
  isCapturing: model.capture.state._tag === 'Capturing',
  isSearchAvailable: isSearchAvailableOf(model),
  isDialogOpen: model.share.sheet._tag === 'ShareSheetOpen',
})

const applyCaptureResult = (
  model: Model,
  [nextCapture, captureCommands, maybeOutMessage]: Capture.UpdateReturn,
): UpdateReturn => {
  const mappedCommands = Command.mapMessages(captureCommands, message =>
    GotCaptureMessage({ message }),
  )
  const nextModel = evo(model, { capture: () => nextCapture })
  return Option.match(maybeOutMessage, {
    onNone: () => [nextModel, mappedCommands],
    onSome: outMessage =>
      M.value(outMessage).pipe(
        withUpdateReturn,
        M.tagsExhaustive({
          StartedRecording: ({ recordingID }) => [
            nextModel,
            [
              ...mappedCommands,
              Navigate({
                url: scribeRouteToPath(RecordingRoute({ recordingID })),
              }),
            ],
          ],
          SavedRecording: ({ title }) => {
            const revision = nextModel.copyRevision + 1
            const [noticed, noticeCommands] = showNotice(
              evo(nextModel, { copyRevision: () => revision }),
              { text: `Saved ${title}`, isFailure: false, revision },
            )
            return [noticed, [...mappedCommands, ...noticeCommands]]
          },
        }),
      ),
  })
}

/** The link token the open share link carries, if any. */
export const shareLinkTokenOf = (model: Model): Option.Option<string> =>
  M.value(model.route).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tag('Share', ({ k }) => k),
    M.orElse(() => Option.none()),
  )

/**
 * The share whose link a reader with no login opened, while that reader needs
 * an identity to read it: Scribe's rules let a link holder read a share only
 * when signed in, so such a reader signs in as an anonymous Instant guest
 * (#754; Michael, Recording 186 #307: "so that it's accessible in an incognito
 * browser window to anybody that clicks the link"). Only on a share with its
 * key, only while Instant has no one signed in, and only once the origin said
 * Cloudflare Access has no login for this browser: while Access may still
 * know the reader (the owner on his own site), the account connects instead
 * and nobody is made a guest.
 */
export const guestReaderShareIDOf = (model: Model): Option.Option<string> => {
  const hasNoAccessLogin = M.value(model.account.connection).pipe(
    M.withReturnType<boolean>(),
    M.tags({
      NoAccessIdentity: () => true,
      FailedAccountCheck: () => true,
    }),
    M.orElse(() => false),
  )
  return M.value(model.route).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tag('Share', ({ shareID, k }) =>
      Option.isSome(k) &&
      model.identity._tag === 'SignedOut' &&
      hasNoAccessLogin
        ? Option.some(shareID)
        : Option.none(),
    ),
    M.orElse(() => Option.none()),
  )
}

/**
 * The share a recording on screen was shared with this account by: the
 * newest share another account made to this one of that recording, unless
 * this account owns it.
 */
export const receivedShareOf = (
  model: Model,
  summary: RecordingSummary,
): Option.Option<Share.Model.RecordingShare> => {
  const isOwnedByViewer = Option.exists(
    Option.all([summary.maybeOwnerUserID, signedInUserIDOf(model)]),
    ([ownerUserID, viewerUserID]) => ownerUserID === viewerUserID,
  )
  return isOwnedByViewer
    ? Option.none()
    : Array.findFirst(
        model.share.received,
        share => share.recordingID === summary.id,
      )
}

/** The page a share made to this account opens: the share, with its link token if it has one. */
export const receivedShareRouteOf = (
  share: Share.Model.RecordingShare,
): ScribeRoute =>
  ShareRoute({
    recordingID: share.recordingID,
    shareID: share.id,
    k: share.maybeLinkToken,
  })

const summaryOnScreenOf = (
  model: Model,
  recordingID: string,
): Option.Option<RecordingSummary> =>
  Option.orElse(
    M.value(model.playback).pipe(
      M.withReturnType<Option.Option<RecordingSummary>>(),
      M.tag('ReadyPlayback', ready =>
        ready.recordingID === recordingID
          ? Option.some(ready.detail.summary)
          : Option.none(),
      ),
      M.orElse(() => Option.none()),
    ),
    () =>
      M.value(model.recordings).pipe(
        M.withReturnType<Option.Option<RecordingSummary>>(),
        M.tag('LoadedRecordings', ({ recordings }) =>
          Array.findFirst(
            recordings,
            recording => recording.id === recordingID,
          ),
        ),
        M.orElse(() => Option.none()),
      ),
  )

/**
 * A recording page for a recording someone else shared with this account
 * opens as that share's page instead, and the address bar follows: the
 * recording page would offer the owner's actions and could read only the
 * shared sections.
 */
const openingReceivedShare = ([model, commands]: UpdateReturn): UpdateReturn =>
  pipe(
    openingFor(model.route),
    Option.flatMap(({ recordingID }) => summaryOnScreenOf(model, recordingID)),
    Option.flatMap(summary => receivedShareOf(model, summary)),
    Option.match({
      onNone: () => [model, commands],
      onSome: share => {
        const route = receivedShareRouteOf(share)
        const [routed, routeCommands] = applyRoute(model, route)
        return [
          routed,
          [
            ...commands,
            ...routeCommands,
            ReplaceUrl({ url: scribeRouteToPath(route) }),
          ],
        ]
      },
    }),
  )

/** The sections of the open recording, for picking a range to share. */
export const openSectionsOf = (model: Model): ReadonlyArray<Section> =>
  M.value(model.playback).pipe(
    M.withReturnType<ReadonlyArray<Section>>(),
    M.tag('ReadyPlayback', ready => ready.detail.sections),
    M.orElse(() => []),
  )

const shareContextOf = (model: Model): Share.ShareContext => ({
  sharing: Account.Model.isSharingEnabled(model.account)
    ? 'Enabled'
    : 'AwaitingSchema',
  maybeOwnerUserID: signedInUserIDOf(model),
  maybeSharedBy: Option.map(
    Account.Model.accessOf(model.account),
    access => access.email,
  ),
  sections: openSectionsOf(model),
  maybeViewer: M.value(model.identity).pipe(
    M.withReturnType<
      Option.Option<
        Readonly<{ userID: string; maybeEmail: Option.Option<string> }>
      >
    >(),
    M.tag('SignedIn', ({ userID, maybeEmail }) =>
      Option.some({ userID, maybeEmail }),
    ),
    M.orElse(() => Option.none()),
  ),
  maybeLinkToken: shareLinkTokenOf(model),
})

const applyShareResult = (
  model: Model,
  [nextShare, shareCommands, maybeOutMessage]: Share.UpdateReturn,
): UpdateReturn => {
  const mappedCommands = Command.mapMessages(shareCommands, message =>
    GotShareMessage({ message }),
  )
  const nextModel = evo(model, { share: () => nextShare })
  return Option.match(maybeOutMessage, {
    onNone: () => [nextModel, mappedCommands],
    onSome: outMessage =>
      M.value(outMessage).pipe(
        withUpdateReturn,
        M.tagsExhaustive({
          RequestedShareCopy: ({ text, noticeText }) => {
            const [copiedModel, copyCommands] = copyWithNotice(
              nextModel,
              text,
              noticeText,
            )
            return [copiedModel, [...mappedCommands, ...copyCommands]]
          },
          RequestedShareNotice: ({ text, isFailure }) => {
            const revision = nextModel.copyRevision + 1
            const [noticed, noticeCommands] = showNotice(
              evo(nextModel, { copyRevision: () => revision }),
              { text, isFailure, revision },
            )
            return [noticed, [...mappedCommands, ...noticeCommands]]
          },
        }),
      ),
  })
}

const captureContextOf = (model: Model): Capture.CaptureContext => ({
  maybeOwnerUserID: signedInUserIDOf(model),
  maybeNextTitleNumber: nextRecordingTitleNumberOf(model),
})

/** The Commands a page load starts: the account check that signs the browser in. */
export const startupCommands: Commands = Command.mapMessages(
  [Account.CheckAccess()],
  message => GotAccountMessage({ message }),
)

const showNotice = (model: Model, notice: CopyNotice): UpdateReturn => [
  evo(model, { maybeCopyNotice: () => Option.some(notice) }),
  [HideCopyNoticeLater({ revision: notice.revision })],
]

/** Folds one Message into the Model and returns the Commands it starts. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedLink: ({ request }) =>
        M.value(request).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            Internal: ({ url }) => [
              model,
              [Navigate({ url: urlToString(url) })],
            ],
            External: ({ href }) => [model, [LoadExternal({ href })]],
          }),
        ),
      ChangedUrl: ({ url }) =>
        openingReceivedShare(applyRoute(model, urlToScribeRoute(url))),
      CompletedNavigate: () => [model, []],
      CompletedLoadExternal: () => [model, []],

      ObservedIdentity: ({ identity }) => {
        const isSameUser = isSameUserID(
          signedInUserIDOf(model),
          signedInUserIDOf(evo(model, { identity: () => identity })),
        )
        const observed = evo(model, {
          identity: () => identity,
          recordings: recordings =>
            isSameUser ? recordings : LoadingRecordings(),
          recordingWindow: recordingWindow =>
            isSameUser ? recordingWindow : firstRecordingWindow,
          playback: playback =>
            isSameUser ? playback : reopenedForNewAccount(playback),
          share: share =>
            isSameUser
              ? share
              : evo(share, { sharedRange: sharedRangeForNewAccount }),
        })
        return identity._tag === 'SignedOut'
          ? applyAccountResult(
              observed,
              Account.update(
                observed.account,
                Account.reportLostInstantSession(),
              ),
            )
          : [observed, []]
      },
      FailedObserveIdentity: () => [
        evo(model, { identity: () => SignedOut() }),
        [],
      ],

      ObservedRecordings: snapshot =>
        isSameRecordingWindow(snapshot.window, model.recordingWindow)
          ? openingReceivedShare([
              evo(model, {
                recordings: recordings =>
                  loadedRecordingsFrom(
                    recordings,
                    model.maybeFocusedRowID,
                    snapshot,
                  ),
              }),
              [],
            ])
          : [model, []],
      FailedObserveRecordings: ({ window, reason }) =>
        isSameRecordingWindow(window, model.recordingWindow)
          ? [evo(model, { recordings: () => FailedRecordings({ reason }) }), []]
          : [model, []],
      UpdatedSearchQuery: ({ query }) => [
        evo(model, { searchQuery: () => query }),
        isListRoute(model.route) ? [WaitForSearchPause({ query })] : [],
      ],
      ElapsedSearchPause: ({ query }) =>
        query === model.searchQuery && isListRoute(model.route)
          ? Option.match(searchRouteFor(model.route, query), {
              onNone: () => [model, []],
              onSome: nextRoute => [
                evo(model, { route: () => nextRoute }),
                [ReplaceUrl({ url: scribeRouteToPath(nextRoute) })],
              ],
            })
          : [model, []],
      CompletedReplaceUrl: () => [model, []],
      TickedLiveClock: ({ nowMs }) => [
        evo(model, {
          maybeLiveClockMs: () => Option.some(nowMs),
          liveLengthFloors: () => liveLengthFloorsAt(model, nowMs),
        }),
        [],
      ],
      CompletedFocusSearch: () => [model, []],
      ApproachedListEdge: ({ edge, window }) =>
        Option.match(windowForApproachOf(model, edge, window), {
          onNone: () => [model, []],
          onSome: nextRecordingWindow => [
            evo(model, { recordingWindow: () => nextRecordingWindow }),
            [],
          ],
        }),
      ReachedListTop: ({ window }) =>
        Option.match(windowForListTopOf(model, window), {
          onNone: () => [model, []],
          onSome: nextRecordingWindow => [
            evo(model, { recordingWindow: () => nextRecordingWindow }),
            [],
          ],
        }),
      ChangedListRowFocus: ({ maybeRecordingID }) => [
        evo(model, {
          maybeFocusedRowID: () => maybeRecordingID,
          recordings: recordings =>
            withoutUnfocusedKeptRow(recordings, maybeRecordingID),
        }),
        [],
      ],
      ClickedRecording: ({ recordingID }) => [
        model,
        [Navigate({ url: scribeRouteToPath(RecordingRoute({ recordingID })) })],
      ],

      ObservedRecording: ({
        recordingID,
        maybeDetail,
        skippedCount,
        maybeSkippedReason,
      }) =>
        openingReceivedShare(
          observedRecording(
            model,
            recordingID,
            maybeDetail,
            skippedCount,
            maybeSkippedReason,
          ),
        ),
      FailedObserveRecording: ({ recordingID, reason }) =>
        Option.exists(
          observedRecordingIDOf(model),
          observedID => observedID === recordingID,
        )
          ? [
              evo(model, {
                playback: playback =>
                  FailedPlayback({
                    recordingID,
                    request: openRequestOf(playback),
                    reason,
                  }),
              }),
              [],
            ]
          : [model, []],
      ConfirmedMissingRecording: ({ recordingID, maybeUserID }) =>
        M.value(model.playback).pipe(
          withUpdateReturn,
          M.tag('OpeningPlayback', opening =>
            opening.recordingID === recordingID &&
            isSameUserID(maybeUserID, signedInUserIDOf(model))
              ? [
                  evo(model, {
                    playback: () =>
                      MissingRecording({
                        recordingID,
                        request: opening.request,
                      }),
                  }),
                  [],
                ]
              : [model, []],
          ),
          M.orElse(() => [model, []]),
        ),
      ConfirmedRecordingExists: () => [model, []],
      ElapsedOpeningPatience: ({ recordingID, attempt }) =>
        M.value(model.playback).pipe(
          withUpdateReturn,
          M.tag('OpeningPlayback', opening =>
            opening.recordingID === recordingID &&
            attempt === model.recordingAttempt
              ? [
                  evo(model, {
                    playback: () => evo(opening, { patience: () => 'Slow' }),
                  }),
                  [],
                ]
              : [model, []],
          ),
          M.orElse(() => [model, []]),
        ),
      ClickedTryOpeningAgain: () => tryOpeningAgain(model),
      ObservedFileUrls: ({ fileUrls }) =>
        evolveReady(model, ready =>
          withAudioUrl(evo(ready, { fileUrls: () => fileUrls })),
        ),
      FailedObserveFileUrls: () => [model, []],

      AcquiredAudioPlayer: () =>
        updateAudio(model, ready => {
          const acquired = evo(ready, {
            audioPlayer: () =>
              AudioPlayerReady({ maybeDurationSeconds: Option.none() }),
            maybePendingSeekSeconds: () => Option.none(),
          })
          return Option.match(ready.maybePendingSeekSeconds, {
            onNone: () => [acquired, []],
            onSome: seconds => [acquired, [SeekAudio({ seconds })]],
          })
        }),
      ReleasedAudioPlayer: () =>
        evolveAudio(model, ready =>
          evo(ready, {
            audioPlayer: () => NoAudioPlayer(),
            transport: () => 'Paused',
          }),
        ),
      FailedAcquireAudioPlayer: ({ reason }) =>
        evolveAudio(model, ready =>
          evo(ready, {
            audioPlayer: () => AudioPlayerFailed({ reason }),
            transport: () => 'Paused',
          }),
        ),
      HeardAudioPosition: ({ seconds }) =>
        updateAudio(model, ready => {
          if (ready.scrub._tag === 'Scrubbing') {
            return [ready, []]
          } else {
            const moved = evo(ready, { positionSeconds: () => seconds })
            return [moved, followCommands(ready, moved)]
          }
        }),
      HeardAudioDuration: ({ seconds }) =>
        evolveAudio(model, ready =>
          isAudioPlayerReady(ready)
            ? evo(ready, {
                audioPlayer: () =>
                  AudioPlayerReady({
                    maybeDurationSeconds: Option.some(seconds),
                  }),
              })
            : ready,
        ),
      HeardAudioPlaying: () =>
        updateAudio(model, ready => [
          evo(ready, { transport: () => 'Playing' }),
          [
            PublishNowPlaying({
              nowPlaying: {
                title: ready.detail.summary.title,
                startedAtMs: ready.detail.summary.startedAtMs,
              },
            }),
          ],
        ]),
      HeardAudioPaused: () =>
        evolveAudio(model, ready => evo(ready, { transport: () => 'Paused' })),
      HeardAudioEnded: () =>
        evolveAudio(model, ready => evo(ready, { transport: () => 'Paused' })),
      HeardAudioError: ({ reason }) =>
        evolveAudio(model, ready =>
          evo(ready, {
            audioPlayer: () => AudioPlayerFailed({ reason }),
            transport: () => 'Paused',
          }),
        ),
      HeardMediaSessionAction: ({ action }) =>
        M.value(action).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            MediaSessionPlay: () => updateAudio(model, play),
            MediaSessionPause: () => updateAudio(model, pause),
            MediaSessionSkip: ({ deltaSeconds }) =>
              updateAudio(model, ready => skipBy(ready, deltaSeconds)),
            MediaSessionSeek: ({ seconds }) =>
              updateAudio(model, ready =>
                seekFollowing(
                  ready,
                  Math.min(durationOf(ready), Math.max(0, seconds)),
                ),
              ),
          }),
        ),
      ClickedRetryAudio: () =>
        evolveAudio(model, ready =>
          evo(ready, {
            audioAttempt: attempt => attempt + 1,
            audioPlayer: () => NoAudioPlayer(),
            maybeAudioUrl: () =>
              Option.flatMap(audioFileIDOf(ready.detail), fileID =>
                Record.get(ready.fileUrls, fileID),
              ),
          }),
        ),
      CompletedPlayAudio: () => [model, []],
      FailedPlayAudio: () =>
        evolveAudio(model, ready => evo(ready, { transport: () => 'Paused' })),
      CompletedPauseAudio: () => [model, []],
      CompletedSeekAudio: () => [model, []],
      CompletedPublishNowPlaying: () => [model, []],

      ClickedPlay: () => updateAudio(model, play),
      ClickedPause: () => updateAudio(model, pause),
      ClickedSkip: ({ deltaSeconds }) =>
        updateAudio(model, ready => skipBy(ready, deltaSeconds)),
      ClickedCloseMiniPlayer: () => [
        evo(model, { maybeBackgroundPlayback: () => Option.none() }),
        [],
      ],
      ClickedWord: ({ seconds }) =>
        updateReady(model, ready => {
          const [sought, seekCommands] = seekTo(
            evo(ready, {
              follow: () => 'Following',
              maybeFocusedSectionID: () => Option.none(),
            }),
            seconds,
          )
          return isAudioPlayerReady(sought)
            ? [
                evo(sought, { transport: () => 'Playing' }),
                [...seekCommands, PlayAudio()],
              ]
            : [sought, seekCommands]
        }),
      StartedScrub: ({ seconds }) =>
        evolveReady(model, ready =>
          evo(ready, { scrub: () => Scrubbing({ seconds }) }),
        ),
      MovedScrub: ({ seconds }) =>
        evolveReady(model, ready =>
          evo(ready, { scrub: () => Scrubbing({ seconds }) }),
        ),
      EndedScrub: ({ seconds }) =>
        updateReady(model, ready => {
          const [sought, seekCommands] = seekTo(
            evo(ready, {
              scrub: () => NotScrubbing(),
              follow: () => 'Following',
            }),
            seconds,
          )
          return [sought, [...seekCommands, ...scrollToFollowed(sought)]]
        }),
      PressedScrubberArrow: ({ arrow }) =>
        updateAudio(model, ready =>
          skipBy(
            ready,
            arrow === 'Left' ? -SCRUBBER_ARROW_SECONDS : SCRUBBER_ARROW_SECONDS,
          ),
        ),
      ScrolledTranscriptAway: () =>
        evolveReady(model, ready => evo(ready, { follow: () => 'Detached' })),
      ClickedReturnToPlayhead: () => updateReady(model, returnToFollowed),
      CompletedScrollToSection: () => [model, []],
      CompletedScrollToRecordingTitle: () => [model, []],
      ChangedPlayheadVisibility: ({ sectionID, visibility }) =>
        evolveReady(model, ready =>
          Option.exists(
            followedSectionIDOf(ready),
            followedID => followedID === sectionID,
          )
            ? evo(ready, {
                playheadVisibility: () => visibility,
                follow: follow =>
                  follow === 'Detached' && visibility === 'OnScreen'
                    ? 'Following'
                    : follow,
              })
            : ready,
        ),
      PressedShortcut: ({ shortcut }) =>
        M.value(shortcut).pipe(
          withUpdateReturn,
          M.when('TogglePlayback', () => updateAudio(model, togglePlayback)),
          M.when('SkipBackward', () =>
            updateAudio(model, ready => skipBy(ready, -SKIP_SECONDS)),
          ),
          M.when('SkipForward', () =>
            updateAudio(model, ready => skipBy(ready, SKIP_SECONDS)),
          ),
          M.when('NewRecording', () =>
            update(
              model,
              GotCaptureMessage({ message: Capture.startRecording() }),
            ),
          ),
          M.when('TogglePauseRecording', () =>
            Option.match(pauseToggleOf(model.capture), {
              onNone: () => [model, []],
              onSome: message => update(model, GotCaptureMessage({ message })),
            }),
          ),
          M.when('StopRecording', () =>
            model.capture.state._tag === 'Capturing'
              ? update(
                  model,
                  GotCaptureMessage({ message: Capture.stopRecording() }),
                )
              : [model, []],
          ),
          M.when('ReturnToFollowed', () =>
            updateReady(model, returnToFollowed),
          ),
          M.when('ToggleFullScreen', () =>
            updateReady(model, ready =>
              withScreenMode(
                ready,
                ready.screenMode === 'FullScreen' ? 'Standard' : 'FullScreen',
              ),
            ),
          ),
          M.when('ExitFullScreen', () =>
            updateReady(model, ready => withScreenMode(ready, 'Standard')),
          ),
          M.when('FocusSearch', () => [model, [FocusSearch()]]),
          M.exhaustive,
        ),
      ElapsedAnnouncementPause: ({ revision }) =>
        updateReady(model, ready =>
          M.value(ready.announcementPause).pipe(
            M.withReturnType<ReadyReturn>(),
            M.tagsExhaustive({
              ReadyToAnnounce: () => [ready, []],
              PausingAnnouncements: pausing =>
                pausing.revision === revision
                  ? Option.match(pausing.maybeWaitingText, {
                      onNone: () => [
                        evo(ready, {
                          announcementPause: () => ReadyToAnnounce(),
                        }),
                        [],
                      ],
                      onSome: text => announce(ready, text),
                    })
                  : [ready, []],
            }),
          ),
        ),
      ChangedConnectivity: ({ connectivity }) => [
        evo(model, { connectivity: () => connectivity }),
        [],
      ],
      ClickedSkipToPlayer: () => [model, [FocusPlayer()]],
      CompletedFocusPlayer: () => [model, []],
      ClickedSkipToContent: () => [model, [FocusContent()]],
      CompletedFocusContent: () => [model, []],
      ClickedEnterFullScreen: () =>
        updateReady(model, ready => withScreenMode(ready, 'FullScreen')),
      ClickedExitFullScreen: () =>
        updateReady(model, ready => withScreenMode(ready, 'Standard')),
      CompletedRunWallClock: () => [model, []],
      CompletedShowRowMenuOnContextMenu: () => [model, []],
      ElapsedFocusHighlight: ({ revision }) =>
        evolveReady(model, ready =>
          ready.focusRevision === revision
            ? evo(ready, { maybeFocusedSectionID: () => Option.none() })
            : ready,
        ),

      ClickedCopyRecordingLink: ({ recordingID }) =>
        copyWithNotice(
          model,
          scribeRouteToShareUrl(RecordingRoute({ recordingID })),
          'Copied link to recording',
        ),
      ClickedShareRecordingLink: ({ recordingID, title }) => [
        model,
        [
          ShareRecordingLink({
            url: scribeRouteToShareUrl(RecordingRoute({ recordingID })),
            title,
          }),
        ],
      ],
      CompletedShareRecordingLink: () => [model, []],
      ClickedCopySectionLink: ({ sectionID }) =>
        copyFromReady(model, ready =>
          Option.map(sectionNamed(ready, sectionID), section => [
            scribeRouteToShareUrl(
              SectionRoute({
                recordingID: ready.recordingID,
                sectionID,
                t: Option.some(
                  formatStartSeconds(
                    shareableStartSeconds(section.startSeconds),
                  ),
                ),
              }),
            ),
            'Copied link to this moment',
          ]),
        ),
      ClickedCopyMomentLink: () =>
        copyFromReady(model, ready =>
          Option.some([
            scribeRouteToShareUrl(momentRouteOf(ready)),
            'Copied link to this moment',
          ]),
        ),
      ClickedCopySectionText: ({ sectionID }) =>
        copyFromReady(model, ready =>
          Option.map(sectionNamed(ready, sectionID), section => [
            section.text,
            'Copied text',
          ]),
        ),
      ClickedCopyTranscript: ({ format }) =>
        copyFromReady(model, ready =>
          Option.some([
            exportTranscript(ready.detail, format, fileID =>
              Option.getOrElse(
                Record.get(ready.fileUrls, fileID),
                () => fileID,
              ),
            ),
            'Copied transcript',
          ]),
        ),
      SucceededCopy: ({ notice }) => showNotice(model, notice),
      FailedCopy: ({ notice }) => showNotice(model, notice),
      ElapsedCopyNotice: ({ revision }) => [
        evo(model, {
          maybeCopyNotice: maybeNotice =>
            Option.filter(maybeNotice, notice => notice.revision !== revision),
        }),
        [],
      ],
      ClickedOpenInApp: ({ scheme }) => [
        model,
        [LoadExternal({ href: scribeRouteToAppUrl(model.route, scheme) })],
      ],
      GotAccountMessage: ({ message }) =>
        applyAccountResult(model, Account.update(model.account, message)),
      GotCaptureMessage: ({ message }) =>
        applyCaptureResult(
          model,
          Capture.update(model.capture, message, captureContextOf(model)),
        ),
      GotShareMessage: ({ message }) =>
        openingReceivedShare(
          applyShareResult(
            model,
            Share.update(model.share, message, shareContextOf(model)),
          ),
        ),
      GotQuestionsMessage: ({ message }) => [
        evo(model, {
          questions: questions => Questions.update(questions, message),
        }),
        [],
      ],
    }),
  )
