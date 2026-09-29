import {
  Array,
  Duration,
  Effect,
  Equivalence,
  Match as M,
  Option,
  Order,
  Record,
  Schema as S,
  pipe,
} from 'effect'
import { Command } from 'foldkit'
import * as Dom from 'foldkit/dom'
import { load, pushUrl } from 'foldkit/navigation'
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
  SectionRoute,
  formatStartSeconds,
  isRouteFocus,
  scribeRouteToAppUrl,
  scribeRouteToPath,
  scribeRouteToShareUrl,
  shareableStartSeconds,
  startSecondsOf,
  urlToScribeRoute,
} from './link.js'
import {
  CompletedFocusPlayer,
  CompletedFocusSearch,
  CompletedLoadExternal,
  CompletedNavigate,
  CompletedPauseAudio,
  CompletedPlayAudio,
  CompletedPublishNowPlaying,
  CompletedScrollToSection,
  CompletedSeekAudio,
  ConfirmedMissingRecording,
  ConfirmedRecordingExists,
  ElapsedAnnouncementPause,
  ElapsedCopyNotice,
  ElapsedFocusHighlight,
  FailedCopy,
  FailedObserveRecording,
  FailedPlayAudio,
  GotAccountMessage,
  GotCaptureMessage,
  GotShareMessage,
  type Message,
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
  type PlaybackRequest,
  ReadyPlayback,
  ReadyToAnnounce,
  type ScreenMode,
  Scrubbing,
  SignedOut,
} from './model.js'
import type { WordsOrigin } from './origin.js'
import type { RecordingDetail, Section } from './recording.js'
import { SectionPlacement, TranscriptScroller } from './scroller.js'
import { SEARCH_FIELD_ID } from './search.js'
import * as Share from './share/index.js'
import { WordsStore } from './store.js'
import { exportTranscript, sectionAt } from './transcript.js'

/** How many recordings the list shows at first, and adds per Show More. */
export const RECORDING_LIST_PAGE_SIZE = 100

/** How far the skip buttons, arrow keys, and system skip commands move playback. */
export const SKIP_SECONDS = 15

const FOCUS_HIGHLIGHT_DURATION = Duration.seconds(4)
const COPY_NOTICE_DURATION = Duration.seconds(2)
const ANNOUNCEMENT_PAUSE = Duration.seconds(5)

type Services =
  | WordsStore
  | ClipboardWriter
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

/** Loads an outside page, or opens the Scribe app through its URL scheme. */
export const LoadExternal = Command.define(
  'LoadExternal',
  { href: S.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))

/** Asks the server whether a recording that came back empty exists for this account. */
export const ConfirmRecording = Command.define(
  'ConfirmRecording',
  { recordingID: S.String },
  ConfirmedMissingRecording,
  ConfirmedRecordingExists,
  FailedObserveRecording,
)(({ recordingID }) =>
  WordsStore.pipe(
    Effect.flatMap(store => store.hasRecording(recordingID)),
    Effect.map(isPresent =>
      isPresent
        ? ConfirmedRecordingExists({ recordingID })
        : ConfirmedMissingRecording({ recordingID }),
    ),
    Effect.catch(error =>
      Effect.succeed(
        FailedObserveRecording({ recordingID, reason: String(error.cause) }),
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
  M.value(model.playback).pipe(
    M.tag('ReadyPlayback', ready =>
      Option.map(ready.maybeAudioUrl, url => ({
        url,
        attempt: ready.audioAttempt,
      })),
    ),
    M.orElse(() => Option.none()),
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
        : [],
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
    playback: () => OpeningPlayback({ recordingID, request }),
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

const applyRoute = (model: Model, route: ScribeRoute): UpdateReturn => {
  const routed = evo(model, {
    route: () => route,
    share: share =>
      evo(share, { sharedRange: () => sharedRangeFor(route, share) }),
  })
  return Option.match(openingFor(route), {
    onNone: () => [evo(routed, { playback: () => NoPlayback() }), []],
    onSome: ({ recordingID, request }) =>
      openRecording(routed, recordingID, request),
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
      recordings: LoadingRecordings(),
      recordingListLimit: RECORDING_LIST_PAGE_SIZE,
      playback: NoPlayback(),
      maybeCopyNotice: Option.none(),
      copyRevision: 0,
      connectivity: 'Online',
      searchQuery: '',
    },
    route,
  )[0]

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
            onNone: () => [model, [ConfirmRecording({ recordingID })]],
            onSome: detail => becomeReady(detail, opening.request),
          })
        }
      },
      MissingRecording: missing =>
        missing.recordingID === recordingID && Option.isSome(maybeDetail)
          ? becomeReady(maybeDetail.value, noRequest)
          : [model, []],
      FailedPlayback: failed =>
        failed.recordingID === recordingID && Option.isSome(maybeDetail)
          ? becomeReady(maybeDetail.value, noRequest)
          : [model, []],
      ReadyPlayback: ready => {
        if (ready.recordingID !== recordingID) {
          return [model, []]
        } else {
          return Option.match(maybeDetail, {
            onNone: () => [
              evo(model, { playback: () => MissingRecording({ recordingID }) }),
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

/**
 * The number the next web recording's title takes: one past the highest
 * `Recording N` in the loaded list, as on the iPhone. `None` until the list
 * has loaded, so a recording started too early never reuses a number.
 */
export const nextRecordingTitleNumberOf = (
  model: Model,
): Option.Option<number> =>
  M.value(model.recordings).pipe(
    M.withReturnType<Option.Option<number>>(),
    M.tag('LoadedRecordings', ({ recordings }) =>
      Option.some(
        Array.reduce(recordings, 0, (highest, recording) =>
          Option.match(
            Option.flatMap(
              Option.fromNullishOr(
                recordingTitleNumberPattern.exec(recording.title),
              ),
              match => Array.get(match, 1),
            ),
            {
              onNone: () => highest,
              onSome: digits => Math.max(highest, Number(digits)),
            },
          ),
        ) + 1,
      ),
    ),
    M.orElse(() => Option.none()),
  )

const isSameUserID = Option.makeEquivalence(Equivalence.String)

/** The Instant user this browser is signed in as. */
export const signedInUserIDOf = (model: Model): Option.Option<string> =>
  M.value(model.identity).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tag('SignedIn', ({ userID }) => Option.some(userID)),
    M.orElse(() => Option.none()),
  )

/** The recording the host's microphone session belongs to, while one is wanted. */
export const captureSessionRequirementsOf = (
  model: Model,
): Option.Option<Readonly<{ recordingID: string }>> =>
  Option.map(Capture.Model.draftOf(model.capture), draft => ({
    recordingID: draft.recordingID,
  }))

/** Whether New Recording is offered: the account is connected and the recording list has loaded. */
export const isRecordAvailableOf = (model: Model): boolean =>
  model.account.connection._tag === 'ConnectedAccount' &&
  model.route._tag === 'RecordingList' &&
  model.recordings._tag === 'LoadedRecordings'

/** Whether the recording search shows: on the list or the search page, once recordings have loaded. */
export const isSearchAvailableOf = (model: Model): boolean =>
  (model.route._tag === 'RecordingList' ||
    model.route._tag === 'SearchRecordings') &&
  model.recordings._tag === 'LoadedRecordings'

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

const playbackShortcutsOf = (model: Model): PlaybackShortcuts =>
  M.value(model.playback).pipe(
    M.withReturnType<PlaybackShortcuts>(),
    M.tag('ReadyPlayback', ready => ({
      isPlaybackReady:
        isAudioPlayerReady(ready) &&
        !isOwnRecordingOf(model, ready.recordingID),
      isAwayFromFollowed: isReturnShownOf(ready),
      isRecordingOpen: true,
      isFullScreen: ready.screenMode === 'FullScreen',
    })),
    M.orElse(() => ({
      isPlaybackReady: false,
      isAwayFromFollowed: false,
      isRecordingOpen: false,
      isFullScreen: false,
    })),
  )

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

/** The sections of the open recording, for picking a range to share. */
export const openSectionsOf = (model: Model): ReadonlyArray<Section> =>
  M.value(model.playback).pipe(
    M.withReturnType<ReadonlyArray<Section>>(),
    M.tag('ReadyPlayback', ready => ready.detail.sections),
    M.orElse(() => []),
  )

const shareContextOf = (model: Model): Share.ShareContext => ({
  sharing: model.account.features.sharing,
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
      ChangedUrl: ({ url }) => applyRoute(model, urlToScribeRoute(url)),
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

      ObservedRecordings: ({
        recordings,
        skippedCount,
        maybeSkippedReason,
      }) => [
        evo(model, {
          recordings: () =>
            LoadedRecordings({ recordings, skippedCount, maybeSkippedReason }),
        }),
        [],
      ],
      FailedObserveRecordings: ({ reason }) => [
        evo(model, { recordings: () => FailedRecordings({ reason }) }),
        [],
      ],
      UpdatedSearchQuery: ({ query }) => [
        evo(model, { searchQuery: () => query }),
        [],
      ],
      CompletedFocusSearch: () => [model, []],
      ClickedShowMoreRecordings: () => [
        evo(model, {
          recordingListLimit: limit => limit + RECORDING_LIST_PAGE_SIZE,
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
        observedRecording(
          model,
          recordingID,
          maybeDetail,
          skippedCount,
          maybeSkippedReason,
        ),
      FailedObserveRecording: ({ recordingID, reason }) =>
        Option.exists(
          observedRecordingIDOf(model),
          observedID => observedID === recordingID,
        )
          ? [
              evo(model, {
                playback: () => FailedPlayback({ recordingID, reason }),
              }),
              [],
            ]
          : [model, []],
      ConfirmedMissingRecording: ({ recordingID }) =>
        M.value(model.playback).pipe(
          withUpdateReturn,
          M.tag('OpeningPlayback', opening =>
            opening.recordingID === recordingID
              ? [
                  evo(model, {
                    playback: () => MissingRecording({ recordingID }),
                  }),
                  [],
                ]
              : [model, []],
          ),
          M.orElse(() => [model, []]),
        ),
      ConfirmedRecordingExists: () => [model, []],
      ObservedFileUrls: ({ fileUrls }) =>
        evolveReady(model, ready =>
          withAudioUrl(evo(ready, { fileUrls: () => fileUrls })),
        ),
      FailedObserveFileUrls: () => [model, []],

      AcquiredAudioPlayer: () =>
        updateReady(model, ready => {
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
        evolveReady(model, ready =>
          evo(ready, {
            audioPlayer: () => NoAudioPlayer(),
            transport: () => 'Paused',
          }),
        ),
      FailedAcquireAudioPlayer: ({ reason }) =>
        evolveReady(model, ready =>
          evo(ready, {
            audioPlayer: () => AudioPlayerFailed({ reason }),
            transport: () => 'Paused',
          }),
        ),
      HeardAudioPosition: ({ seconds }) =>
        updateReady(model, ready => {
          if (ready.scrub._tag === 'Scrubbing') {
            return [ready, []]
          } else {
            const moved = evo(ready, { positionSeconds: () => seconds })
            return [moved, followCommands(ready, moved)]
          }
        }),
      HeardAudioDuration: ({ seconds }) =>
        evolveReady(model, ready =>
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
        updateReady(model, ready => [
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
        evolveReady(model, ready => evo(ready, { transport: () => 'Paused' })),
      HeardAudioEnded: () =>
        evolveReady(model, ready => evo(ready, { transport: () => 'Paused' })),
      HeardAudioError: ({ reason }) =>
        evolveReady(model, ready =>
          evo(ready, {
            audioPlayer: () => AudioPlayerFailed({ reason }),
            transport: () => 'Paused',
          }),
        ),
      HeardMediaSessionAction: ({ action }) =>
        M.value(action).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            MediaSessionPlay: () => updateReady(model, play),
            MediaSessionPause: () => updateReady(model, pause),
            MediaSessionSkip: ({ deltaSeconds }) =>
              updateReady(model, ready => skipBy(ready, deltaSeconds)),
            MediaSessionSeek: ({ seconds }) =>
              updateReady(model, ready =>
                seekFollowing(
                  ready,
                  Math.min(durationOf(ready), Math.max(0, seconds)),
                ),
              ),
          }),
        ),
      ClickedRetryAudio: () =>
        evolveReady(model, ready =>
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
        evolveReady(model, ready => evo(ready, { transport: () => 'Paused' })),
      CompletedPauseAudio: () => [model, []],
      CompletedSeekAudio: () => [model, []],
      CompletedPublishNowPlaying: () => [model, []],

      ClickedPlay: () => updateReady(model, play),
      ClickedPause: () => updateReady(model, pause),
      ClickedSkip: ({ deltaSeconds }) =>
        updateReady(model, ready => skipBy(ready, deltaSeconds)),
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
      ScrolledTranscriptAway: () =>
        evolveReady(model, ready => evo(ready, { follow: () => 'Detached' })),
      ClickedReturnToPlayhead: () => updateReady(model, returnToFollowed),
      CompletedScrollToSection: () => [model, []],
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
          M.when('TogglePlayback', () => updateReady(model, togglePlayback)),
          M.when('SkipBackward', () =>
            updateReady(model, ready => skipBy(ready, -SKIP_SECONDS)),
          ),
          M.when('SkipForward', () =>
            updateReady(model, ready => skipBy(ready, SKIP_SECONDS)),
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
      ClickedEnterFullScreen: () =>
        updateReady(model, ready => withScreenMode(ready, 'FullScreen')),
      ClickedExitFullScreen: () =>
        updateReady(model, ready => withScreenMode(ready, 'Standard')),
      CompletedRunWallClock: () => [model, []],
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
            scribeRouteToShareUrl(
              PlaybackRoute({
                recordingID: ready.recordingID,
                t: Option.some(
                  formatStartSeconds(
                    shareableStartSeconds(displayedPositionOf(ready)),
                  ),
                ),
                focus: Option.none(),
              }),
            ),
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
        applyShareResult(
          model,
          Share.update(model.share, message, shareContextOf(model)),
        ),
    }),
  )
