import { Array, Effect, Match as M, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'

import { AudioPlayer } from './audioPlayer.js'
import { WordsDataClient } from './dataClient.js'
import {
  CompletedPauseAudio,
  CompletedPlayAudio,
  CompletedSeekAudio,
  FailedAudioControl,
  FailedFetchWordsData,
  type Message,
  SucceededFetchWordsData,
} from './message.js'
import {
  EndedPlayback,
  FailedPlayback,
  FailedWordsData,
  InvalidWordsRouteFailure,
  LoadedWordsData,
  LoadingWordsData,
  Model,
  PausedPlayback,
  PlayingPlayback,
  WaitingPlayback,
  type WordsData,
} from './model.js'
import { RecordingSegmentRoute, type WordsRoute } from './route.js'

const jumpSeconds = 10

/** Requests and validates the current route-local Words payload. */
export const FetchWordsData = Command.define(
  'FetchWordsData',
  { route: RecordingSegmentRoute },
  SucceededFetchWordsData,
  FailedFetchWordsData,
)(({ route }) =>
  Effect.flatMap(WordsDataClient, client => client.fetch(route)).pipe(
    Effect.map(data => SucceededFetchWordsData.make({ route, data })),
    Effect.catch(failure =>
      Effect.succeed(FailedFetchWordsData.make({ route, failure })),
    ),
  ),
)

/** Asks the supplied audio adapter to start playback. */
export const PlayAudio = Command.define(
  'PlayAudio',
  CompletedPlayAudio,
  FailedAudioControl,
)(
  Effect.flatMap(AudioPlayer, player => player.play).pipe(
    Effect.as(CompletedPlayAudio.make({})),
    Effect.catch(failure =>
      Effect.succeed(FailedAudioControl.make({ failure })),
    ),
  ),
)

/** Asks the supplied audio adapter to pause playback. */
export const PauseAudio = Command.define(
  'PauseAudio',
  CompletedPauseAudio,
  FailedAudioControl,
)(
  Effect.flatMap(AudioPlayer, player => player.pause).pipe(
    Effect.as(CompletedPauseAudio.make({})),
    Effect.catch(failure =>
      Effect.succeed(FailedAudioControl.make({ failure })),
    ),
  ),
)

/** Asks the supplied audio adapter to seek to a clip-relative time. */
export const SeekAudio = Command.define(
  'SeekAudio',
  { seconds: S.Finite.check(S.isGreaterThanOrEqualTo(0)) },
  CompletedSeekAudio,
  FailedAudioControl,
)(({ seconds }) =>
  Effect.flatMap(AudioPlayer, player => player.seek(seconds)).pipe(
    Effect.as(CompletedSeekAudio.make({ seconds })),
    Effect.catch(failure =>
      Effect.succeed(FailedAudioControl.make({ failure })),
    ),
  ),
)

/** Every resource required by Words Commands. */
export type WordsResources = WordsDataClient | AudioPlayer
type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WordsResources>>,
]

const routeMatches = (
  current: WordsRoute,
  requested: RecordingSegmentRoute,
): boolean =>
  current._tag === 'RecordingSegmentRoute' &&
  current.recordingID === requested.recordingID &&
  current.segmentRangeID === requested.segmentRangeID

const loadedData = (model: Model): Option.Option<WordsData> =>
  model.load._tag === 'LoadedWordsData'
    ? Option.some(model.load.data)
    : Option.none()

const maybeMaximumTime = (model: Model): Option.Option<number> => {
  if (Option.isSome(model.maybeDuration)) {
    return model.maybeDuration
  }
  const maybeData = loadedData(model)
  if (Option.isNone(maybeData)) {
    return Option.none()
  }
  return Option.map(Array.last(maybeData.value.words), word => word.end)
}

const clampTime = (model: Model, seconds: number): number => {
  const nonNegativeSeconds =
    globalThis.Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const maybeMaximum = maybeMaximumTime(model)
  return Option.isSome(maybeMaximum)
    ? Math.min(nonNegativeSeconds, maybeMaximum.value)
    : nonNegativeSeconds
}

const playbackAfterSeeking = (model: Model) =>
  M.value(model.playback).pipe(
    M.withReturnType<Model['playback']>(),
    M.tagsExhaustive({
      WaitingPlayback: playback => playback,
      PausedPlayback: playback => playback,
      PlayingPlayback: playback => playback,
      EndedPlayback: () => PausedPlayback.make({}),
      FailedPlayback: playback => playback,
    }),
  )

const seek = (model: Model, seconds: number): UpdateReturn => {
  if (model.load._tag !== 'LoadedWordsData') {
    return [model, []]
  }
  const nextCurrentTime = clampTime(model, seconds)
  return [
    Model.make({
      ...model,
      currentTime: nextCurrentTime,
      playback: playbackAfterSeeking(model),
    }),
    [SeekAudio({ seconds: nextCurrentTime })],
  ]
}

/** Creates the loaded Model used by progressive enhancement hosts. */
export const modelForData = (data: WordsData): Model =>
  Model.make({
    route: RecordingSegmentRoute.make({
      recordingID: data.recordingID,
      segmentRangeID: data.segmentRangeID,
    }),
    load: LoadedWordsData.make({ data }),
    playback: WaitingPlayback.make({}),
    currentTime: 0,
    maybeDuration: Option.fromNullishOr(data.audio.duration),
  })

/** Creates the initial Model and fetch Command for one browser route. */
export const init = (route: WordsRoute): UpdateReturn =>
  M.value(route).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      RecordingSegmentRoute: currentRoute => [
        Model.make({
          route: currentRoute,
          load: LoadingWordsData.make({}),
          playback: WaitingPlayback.make({}),
          currentTime: 0,
          maybeDuration: Option.none(),
        }),
        [FetchWordsData({ route: currentRoute })],
      ],
      InvalidWordsRoute: ({ path }) => [
        Model.make({
          route,
          load: FailedWordsData.make({
            failure: InvalidWordsRouteFailure.make({ path }),
          }),
          playback: WaitingPlayback.make({}),
          currentTime: 0,
          maybeDuration: Option.none(),
        }),
        [],
      ],
    }),
  )

// UPDATE

/** Applies one Words Message to the Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      OpenedRoute: ({ route }) => init(route),
      SucceededFetchWordsData: ({ route, data }) =>
        routeMatches(model.route, route)
          ? [modelForData(data), []]
          : [model, []],
      FailedFetchWordsData: ({ route, failure }) =>
        routeMatches(model.route, route)
          ? [
              Model.make({
                ...model,
                load: FailedWordsData.make({ failure }),
              }),
              [],
            ]
          : [model, []],
      MountedAudioPlayer: ({ maybeDuration }) => {
        if (model.load._tag !== 'LoadedWordsData') {
          return [model, []]
        }
        const nextMaybeDuration = Option.isSome(maybeDuration)
          ? maybeDuration
          : model.maybeDuration
        return [
          Model.make({
            ...model,
            maybeDuration: nextMaybeDuration,
            playback: PausedPlayback.make({}),
          }),
          [],
        ]
      },
      ObservedAudioTime: ({ seconds }) =>
        model.load._tag === 'LoadedWordsData'
          ? [
              Model.make({ ...model, currentTime: clampTime(model, seconds) }),
              [],
            ]
          : [model, []],
      ObservedAudioDuration: ({ duration }) => {
        if (model.load._tag !== 'LoadedWordsData') {
          return [model, []]
        }
        const nextMaybeDuration = Option.some(duration)
        const nextModel = Model.make({
          ...model,
          maybeDuration: nextMaybeDuration,
        })
        return [
          Model.make({
            ...nextModel,
            currentTime: clampTime(nextModel, model.currentTime),
            playback:
              model.playback._tag === 'WaitingPlayback'
                ? PausedPlayback.make({})
                : model.playback,
          }),
          [],
        ]
      },
      ObservedAudioPlaying: () =>
        model.load._tag === 'LoadedWordsData'
          ? [Model.make({ ...model, playback: PlayingPlayback.make({}) }), []]
          : [model, []],
      ObservedAudioPaused: () => {
        if (
          model.load._tag !== 'LoadedWordsData' ||
          model.playback._tag === 'EndedPlayback'
        ) {
          return [model, []]
        }
        return [Model.make({ ...model, playback: PausedPlayback.make({}) }), []]
      },
      ObservedAudioEnded: ({ seconds }) => {
        if (model.load._tag !== 'LoadedWordsData') {
          return [model, []]
        }
        const nextCurrentTime = Option.getOrElse(model.maybeDuration, () =>
          clampTime(model, seconds),
        )
        return [
          Model.make({
            ...model,
            currentTime: nextCurrentTime,
            playback: EndedPlayback.make({}),
          }),
          [],
        ]
      },
      ObservedAudioFailure: ({ failure }) => [
        Model.make({ ...model, playback: FailedPlayback.make({ failure }) }),
        [],
      ],
      ClickedWord: ({ wordID }) => {
        const maybeData = loadedData(model)
        if (Option.isNone(maybeData)) {
          return [model, []]
        }
        const maybeWord = Array.findFirst(
          maybeData.value.words,
          word => word.id === wordID,
        )
        return Option.isSome(maybeWord)
          ? seek(model, maybeWord.value.start)
          : [model, []]
      },
      ScrubbedPlayback: ({ seconds }) => seek(model, seconds),
      ClickedJumpBackward: () => seek(model, model.currentTime - jumpSeconds),
      ClickedJumpForward: () => seek(model, model.currentTime + jumpSeconds),
      ClickedPlayPause: () => {
        if (model.load._tag !== 'LoadedWordsData') {
          return [model, []]
        }
        return M.value(model.playback).pipe(
          M.withReturnType<UpdateReturn>(),
          M.tagsExhaustive({
            WaitingPlayback: () => [model, []],
            PausedPlayback: () => [model, [PlayAudio()]],
            PlayingPlayback: () => [model, [PauseAudio()]],
            EndedPlayback: () => [
              Model.make({
                ...model,
                currentTime: 0,
                playback: PausedPlayback.make({}),
              }),
              [PlayAudio()],
            ],
            FailedPlayback: () => [model, [PlayAudio()]],
          }),
        )
      },
      CompletedPlayAudio: () => [model, []],
      CompletedPauseAudio: () => [model, []],
      CompletedSeekAudio: () => [model, []],
      FailedAudioControl: ({ failure }) => [
        Model.make({ ...model, playback: FailedPlayback.make({ failure }) }),
        [],
      ],
    }),
  )
