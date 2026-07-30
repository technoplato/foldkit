import { Schema as S } from 'effect'

import {
  AudioFailure,
  AudioSeconds,
  WordsData,
  WordsDataFailure,
} from './model.js'
import { RecordingSegmentRoute, WordsRoute } from './route.js'

/** The browser opened a new Words route. */
export const OpenedRoute = S.TaggedStruct('OpenedRoute', { route: WordsRoute })
/** The route-local data Command decoded a version 1 payload. */
export const SucceededFetchWordsData = S.TaggedStruct(
  'SucceededFetchWordsData',
  { route: RecordingSegmentRoute, data: WordsData },
)
/** The route-local data Command returned a typed failure. */
export const FailedFetchWordsData = S.TaggedStruct('FailedFetchWordsData', {
  route: RecordingSegmentRoute,
  failure: WordsDataFailure,
})
/** The audio lifecycle adapter mounted successfully. */
export const MountedAudioPlayer = S.TaggedStruct('MountedAudioPlayer', {
  maybeDuration: S.Option(AudioSeconds),
})
/** The audio element reported a new current time. */
export const ObservedAudioTime = S.TaggedStruct('ObservedAudioTime', {
  seconds: AudioSeconds,
})
/** The audio element reported a new duration. */
export const ObservedAudioDuration = S.TaggedStruct('ObservedAudioDuration', {
  duration: AudioSeconds,
})
/** The audio element entered its playing state. */
export const ObservedAudioPlaying = S.TaggedStruct('ObservedAudioPlaying', {})
/** The audio element entered its paused state. */
export const ObservedAudioPaused = S.TaggedStruct('ObservedAudioPaused', {})
/** The audio element reached its end. */
export const ObservedAudioEnded = S.TaggedStruct('ObservedAudioEnded', {
  seconds: AudioSeconds,
})
/** The audio element emitted a typed media failure. */
export const ObservedAudioFailure = S.TaggedStruct('ObservedAudioFailure', {
  failure: AudioFailure,
})
/** Every fact emitted by the browser audio event adapter. */
export const AudioEvent = S.Union([
  MountedAudioPlayer,
  ObservedAudioTime,
  ObservedAudioDuration,
  ObservedAudioPlaying,
  ObservedAudioPaused,
  ObservedAudioEnded,
  ObservedAudioFailure,
])
/** Every fact emitted by the browser audio event adapter. */
export type AudioEvent = typeof AudioEvent.Type
/** The user clicked one stable transcript word. */
export const ClickedWord = S.TaggedStruct('ClickedWord', { wordID: S.String })
/** The user moved the playback scrubber. */
export const ScrubbedPlayback = S.TaggedStruct('ScrubbedPlayback', {
  seconds: AudioSeconds,
})
/** The user requested a ten-second rewind. */
export const ClickedJumpBackward = S.TaggedStruct('ClickedJumpBackward', {})
/** The user requested a ten-second advance. */
export const ClickedJumpForward = S.TaggedStruct('ClickedJumpForward', {})
/** The user toggled the primary play/pause control. */
export const ClickedPlayPause = S.TaggedStruct('ClickedPlayPause', {})
/** The browser completed a play operation. */
export const CompletedPlayAudio = S.TaggedStruct('CompletedPlayAudio', {})
/** The browser completed a pause operation. */
export const CompletedPauseAudio = S.TaggedStruct('CompletedPauseAudio', {})
/** The browser completed a seek operation. */
export const CompletedSeekAudio = S.TaggedStruct('CompletedSeekAudio', {
  seconds: AudioSeconds,
})
/** The browser rejected an imperative playback operation. */
export const FailedAudioControl = S.TaggedStruct('FailedAudioControl', {
  failure: AudioFailure,
})

/** Every fact accepted by the Words Program. */
export const Message = S.Union([
  OpenedRoute,
  SucceededFetchWordsData,
  FailedFetchWordsData,
  MountedAudioPlayer,
  ObservedAudioTime,
  ObservedAudioDuration,
  ObservedAudioPlaying,
  ObservedAudioPaused,
  ObservedAudioEnded,
  ObservedAudioFailure,
  ClickedWord,
  ScrubbedPlayback,
  ClickedJumpBackward,
  ClickedJumpForward,
  ClickedPlayPause,
  CompletedPlayAudio,
  CompletedPauseAudio,
  CompletedSeekAudio,
  FailedAudioControl,
])
/** Every fact accepted by the Words Program. */
export type Message = typeof Message.Type
