import {
  Array,
  Duration,
  Effect,
  Match as M,
  Option,
  Order,
  Record,
  Schema as S,
  pipe,
} from 'effect'
import { Command } from 'foldkit'
import { load, pushUrl } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'

import { AudioPlayer, type AudioPlayerService } from './audioPlayer.js'
import { ClipboardWriter } from './clipboard.js'
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
  CompletedLoadExternal,
  CompletedNavigate,
  CompletedPauseAudio,
  CompletedPlayAudio,
  CompletedSeekAudio,
  ConfirmedMissingRecording,
  ConfirmedRecordingExists,
  ElapsedCopyNotice,
  ElapsedFocusHighlight,
  FailedCopy,
  FailedObserveRecording,
  FailedPlayAudio,
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
  type PlaybackRequest,
  ReadyPlayback,
  Scrubbing,
  SignedOut,
} from './model.js'
import type { RecordingDetail, Section } from './recording.js'
import { WordsStore } from './store.js'
import { exportTranscript, sectionAt } from './transcript.js'

/** How many recordings the list shows at first, and adds per Show More. */
export const RECORDING_LIST_PAGE_SIZE = 100

const FOCUS_HIGHLIGHT_DURATION = Duration.seconds(4)
const COPY_NOTICE_DURATION = Duration.seconds(2)

type Services = WordsStore | ClipboardWriter | AudioPlayerService
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
  return Option.match(startForRequest(ready.detail, request), {
    onNone: () => [focused, highlightCommands],
    onSome: seconds => {
      const [sought, seekCommands] = seekTo(focused, seconds)
      return [sought, [...seekCommands, ...highlightCommands]]
    },
  })
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
    scrub: NotScrubbing(),
    audioPlayer: NoAudioPlayer(),
    maybeAudioUrl: Option.none(),
    audioAttempt: 0,
    maybePendingSeekSeconds: Option.none(),
    maybeFocusedSectionID: Option.none(),
    focusRevision: 0,
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

const applyRoute = (model: Model, route: ScribeRoute): UpdateReturn => {
  const routed = evo(model, { route: () => route })
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
      recordings: LoadingRecordings(),
      recordingListLimit: RECORDING_LIST_PAGE_SIZE,
      playback: NoPlayback(),
      maybeCopyNotice: Option.none(),
      copyRevision: 0,
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
            onSome: detail => [
              evo(model, {
                playback: () =>
                  withAudioUrl(
                    evo(ready, {
                      detail: () => detail,
                      skippedCount: () => skippedCount,
                      maybeSkippedReason: () => maybeSkippedReason,
                    }),
                  ),
              }),
              [],
            ],
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

      ObservedIdentity: ({ identity }) => [
        evo(model, { identity: () => identity }),
        [],
      ],
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
        evolveReady(model, ready =>
          ready.scrub._tag === 'Scrubbing'
            ? ready
            : evo(ready, { positionSeconds: () => seconds }),
        ),
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
        evolveReady(model, ready => evo(ready, { transport: () => 'Playing' })),
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

      ClickedPlay: () =>
        updateReady(model, ready =>
          isAudioPlayerReady(ready)
            ? [evo(ready, { transport: () => 'Playing' }), [PlayAudio()]]
            : [ready, []],
        ),
      ClickedPause: () =>
        updateReady(model, ready => [
          evo(ready, { transport: () => 'Paused' }),
          [PauseAudio()],
        ]),
      ClickedSkip: ({ deltaSeconds }) =>
        updateReady(model, ready =>
          seekTo(
            ready,
            Math.min(
              durationOf(ready),
              Math.max(0, ready.positionSeconds + deltaSeconds),
            ),
          ),
        ),
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
        updateReady(model, ready =>
          seekTo(
            evo(ready, {
              scrub: () => NotScrubbing(),
              follow: () => 'Following',
            }),
            seconds,
          ),
        ),
      ScrolledTranscriptAway: () =>
        evolveReady(model, ready => evo(ready, { follow: () => 'Detached' })),
      ClickedReturnToPlayhead: () =>
        evolveReady(model, ready =>
          evo(ready, {
            follow: () => 'Following',
            maybeFocusedSectionID: () => Option.none(),
          }),
        ),
      CompletedScrollToSection: () => [model, []],
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
    }),
  )
