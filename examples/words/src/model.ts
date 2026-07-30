import { Array, Match as M, Option, Schema as S } from 'effect'

import { WordsRoute } from './route.js'

/** A finite non-negative audio timestamp measured in seconds. */
export const AudioSeconds = S.Finite.check(S.isGreaterThanOrEqualTo(0))
/** A finite non-negative audio timestamp measured in seconds. */
export type AudioSeconds = typeof AudioSeconds.Type

/** One stable transcript word and its audio interval. */
export const Word = S.Struct({
  id: S.String.check(S.isNonEmpty()),
  text: S.String.check(S.isNonEmpty()),
  start: AudioSeconds,
  end: AudioSeconds,
  speaker: S.optionalKey(S.Union([S.String.check(S.isNonEmpty()), S.Finite])),
})
/** One stable transcript word and its audio interval. */
export type Word = typeof Word.Type

/** The audio asset described by a Words payload. */
export const AudioSource = S.Struct({
  url: S.String.check(S.isNonEmpty()),
  duration: S.optionalKey(AudioSeconds),
  mimeType: S.optionalKey(S.String.check(S.isNonEmpty())),
})
/** The audio asset described by a Words payload. */
export type AudioSource = typeof AudioSource.Type

/** The transcript segment endpoints represented by this public clip. */
export const SegmentRange = S.Struct({
  firstSegmentID: S.String.check(S.isNonEmpty()),
  lastSegmentID: S.String.check(S.isNonEmpty()),
})
/** The transcript segment endpoints represented by this public clip. */
export type SegmentRange = typeof SegmentRange.Type

/** The version 1 payload returned by the route-local data endpoint. */
export const WordsData = S.Struct({
  version: S.Literals([1]),
  recordingID: S.String.check(S.isNonEmpty()),
  segmentRangeID: S.String.check(S.isNonEmpty()),
  range: SegmentRange,
  words: S.Array(Word),
  audio: AudioSource,
})
/** The version 1 payload returned by the route-local data endpoint. */
export type WordsData = typeof WordsData.Type

/** The route-local data request could not reach the server. */
export const NetworkWordsDataFailure = S.TaggedStruct(
  'NetworkWordsDataFailure',
  { reason: S.String },
)
/** The route-local data endpoint returned a non-success status. */
export const HttpWordsDataFailure = S.TaggedStruct('HttpWordsDataFailure', {
  status: S.Int,
  statusText: S.String,
})
/** The route-local data endpoint did not return valid version 1 data. */
export const InvalidWordsDataFailure = S.TaggedStruct(
  'InvalidWordsDataFailure',
  { reason: S.String },
)
/** The decoded payload identifies a different route than the request. */
export const MismatchedWordsDataFailure = S.TaggedStruct(
  'MismatchedWordsDataFailure',
  {
    expectedRecordingID: S.String,
    expectedSegmentRangeID: S.String,
    actualRecordingID: S.String,
    actualSegmentRangeID: S.String,
  },
)
/** The browser path does not satisfy the public route contract. */
export const InvalidWordsRouteFailure = S.TaggedStruct(
  'InvalidWordsRouteFailure',
  { path: S.String },
)
/** Every typed failure that can prevent Words data from loading. */
export const WordsDataFailure = S.Union([
  NetworkWordsDataFailure,
  HttpWordsDataFailure,
  InvalidWordsDataFailure,
  MismatchedWordsDataFailure,
  InvalidWordsRouteFailure,
])
/** Every typed failure that can prevent Words data from loading. */
export type WordsDataFailure = typeof WordsDataFailure.Type

/** The Words Program is waiting for the current route request. */
export const LoadingWordsData = S.TaggedStruct('LoadingWordsData', {})
/** The Words Program has decoded the current route payload. */
export const LoadedWordsData = S.TaggedStruct('LoadedWordsData', {
  data: WordsData,
})
/** The current route failed with a typed data error. */
export const FailedWordsData = S.TaggedStruct('FailedWordsData', {
  failure: WordsDataFailure,
})
/** Every route-local data state. */
export const WordsLoad = S.Union([
  LoadingWordsData,
  LoadedWordsData,
  FailedWordsData,
])
/** Every route-local data state. */
export type WordsLoad = typeof WordsLoad.Type

/** Playback is waiting for its audio element to mount. */
export const WaitingPlayback = S.TaggedStruct('WaitingPlayback', {})
/** Audio is ready and paused. */
export const PausedPlayback = S.TaggedStruct('PausedPlayback', {})
/** Audio is actively playing. */
export const PlayingPlayback = S.TaggedStruct('PlayingPlayback', {})
/** Audio reached its end. */
export const EndedPlayback = S.TaggedStruct('EndedPlayback', {})

/** A non-audio element was supplied to the lifecycle adapter. */
export const InvalidAudioElement = S.TaggedStruct('InvalidAudioElement', {
  elementName: S.String,
})
/** The browser rejected one imperative audio operation. */
export const RejectedAudioOperation = S.TaggedStruct('RejectedAudioOperation', {
  operation: S.Literals(['Play', 'Pause', 'Seek']),
  reason: S.String,
})
/** The media element emitted a playback error. */
export const MediaAudioFailure = S.TaggedStruct('MediaAudioFailure', {
  code: S.Int,
  reason: S.String,
})
/** Every typed failure from the browser audio boundary. */
export const AudioFailure = S.Union([
  InvalidAudioElement,
  RejectedAudioOperation,
  MediaAudioFailure,
])
/** Every typed failure from the browser audio boundary. */
export type AudioFailure = typeof AudioFailure.Type

/** Playback failed at the browser audio boundary. */
export const FailedPlayback = S.TaggedStruct('FailedPlayback', {
  failure: AudioFailure,
})
/** Every representable audio playback state. */
export const Playback = S.Union([
  WaitingPlayback,
  PausedPlayback,
  PlayingPlayback,
  EndedPlayback,
  FailedPlayback,
])
/** Every representable audio playback state. */
export type Playback = typeof Playback.Type

/** The complete renderer-independent Words Model. */
export const Model = S.Struct({
  route: WordsRoute,
  load: WordsLoad,
  playback: Playback,
  currentTime: AudioSeconds,
  maybeDuration: S.Option(AudioSeconds),
})
/** The complete renderer-independent Words Model. */
export type Model = typeof Model.Type

/** Finds the word whose half-open interval contains an audio time. */
export const activeWordAt = (
  words: ReadonlyArray<Word>,
  seconds: number,
): Option.Option<Word> =>
  Array.findFirst(words, word => seconds >= word.start && seconds < word.end)

/** Formats a typed data failure for the human-facing error state. */
export const wordsDataFailureMessage = (failure: WordsDataFailure): string =>
  M.value(failure).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      NetworkWordsDataFailure: ({ reason }) =>
        `The transcript request could not reach the server. ${reason}`,
      HttpWordsDataFailure: ({ status, statusText }) =>
        `The transcript request failed with HTTP ${status.toString()}${statusText === '' ? '' : ` ${statusText}`}.`,
      InvalidWordsDataFailure: ({ reason }) =>
        `The transcript response was invalid. ${reason}`,
      MismatchedWordsDataFailure: () =>
        'The transcript response identified a different recording or segment range.',
      InvalidWordsRouteFailure: () =>
        'Use /:recordingID/:segmentRangeID to open a transcript.',
    }),
  )

/** Formats a typed audio failure for the human-facing playback state. */
export const audioFailureMessage = (failure: AudioFailure): string =>
  M.value(failure).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      InvalidAudioElement: () =>
        'The playback adapter mounted on a non-audio element.',
      RejectedAudioOperation: ({ operation, reason }) =>
        `${operation} was rejected by the browser. ${reason}`,
      MediaAudioFailure: ({ reason }) => reason,
    }),
  )
