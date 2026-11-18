import { Effect, Match as M, Option, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { type AudioEvent, AudioOutput, Track } from './audio.js'
import { MediaId, Milliseconds, Speed } from './ids.js'
import {
  FailedLoadTranscript,
  FailedPlayAudio,
  FailedReadSearchWords,
  type Message,
  ReachedEnd,
  ReachedPlace,
  ReadSearchWords,
  ReceivedPassages,
} from './message.js'
import { type Model, viewPlaceOf } from './model.js'
import { TranscriptSource, rangeOfWindow, windowOf } from './transcript.js'

// SUBSCRIPTION

/** What the Transcript Player needs from the host: audio and words. */
export type PlayerServices = AudioOutput | TranscriptSource

/**
 * The track the player should be sounding: its recording from its place,
 * while it plays. None while paused, so the audio stops.
 */
export const trackOf = (model: Model): Option.Option<Track> =>
  model.transport._tag === 'Playing'
    ? Option.some(
        Track.make({
          mediaId: model.media.mediaId,
          cue: model.transport.cue,
          fromMs: model.placeMs,
          durationMs: model.media.durationMs,
          maybeAudioUrl: model.media.maybeAudioUrl,
        }),
      )
    : Option.none()

const isSameCue = Option.makeEquivalence<Track>(
  (self, that) => self.mediaId === that.mediaId && self.cue === that.cue,
)

/** What the clock listens to: the track, and the speed it reads live. */
export const ClockDependencies = S.Struct({
  maybeTrack: S.Option(Track),
  speed: Speed,
})
/** What the clock listens to. */
export type ClockDependencies = typeof ClockDependencies.Type

/** The clock's dependencies for a player, or for none. */
export const clockDependenciesOf = (
  maybePlayer: Option.Option<Model>,
): ClockDependencies => ({
  maybeTrack: Option.flatMap(maybePlayer, trackOf),
  speed: Option.match(maybePlayer, {
    onNone: () => 1,
    onSome: player => player.speed,
  }),
})

/**
 * Two clocks are the same while they sound the same cue, so a new speed
 * never restarts the audio; the clock reads it every step.
 */
export const isSameClock = (
  self: ClockDependencies,
  that: ClockDependencies,
): boolean => isSameCue(self.maybeTrack, that.maybeTrack)

const messageOfAudioEvent = (event: AudioEvent): Message =>
  M.value(event).pipe(
    M.withReturnType<Message>(),
    M.tagsExhaustive({
      Advanced: ({ placeMs, wallClockMs }) =>
        ReachedPlace({ placeMs, wallClockMs }),
      Ended: () => ReachedEnd(),
      Failed: ({ reason }) => FailedPlayAudio({ reason }),
    }),
  )

/** The audio for a track, as the player's facts. */
export const clockStream = (
  { maybeTrack }: ClockDependencies,
  readDependencies: () => ClockDependencies,
): Stream.Stream<Message, never, AudioOutput> =>
  Option.match(maybeTrack, {
    onNone: () => Stream.empty,
    onSome: track =>
      Stream.unwrap(
        Effect.gen(function* () {
          const output = yield* AudioOutput
          return output
            .sound(track, () => readDependencies().speed)
            .pipe(Stream.map(messageOfAudioEvent))
        }),
      ),
  })

/** What the transcript listens to: the recording and the window in it. */
export const TranscriptDependencies = S.Struct({
  maybeWindow: S.Option(S.Struct({ mediaId: MediaId, index: S.Int })),
})
/** What the transcript listens to. */
export type TranscriptDependencies = typeof TranscriptDependencies.Type

/**
 * The transcript's dependencies for a player, or for none. They change
 * only when the place the words on screen are around crosses into another
 * window, so the words are read again every 10 minutes of listening, not
 * every second, and at once when the person looks at a match far from
 * the place being heard.
 */
export const transcriptDependenciesOf = (
  maybePlayer: Option.Option<Model>,
): TranscriptDependencies => ({
  maybeWindow: Option.map(maybePlayer, player => ({
    mediaId: player.media.mediaId,
    index: windowOf(viewPlaceOf(player)),
  })),
})

/** The words around the window, as the player's facts. */
export const transcriptStream = ({
  maybeWindow,
}: TranscriptDependencies): Stream.Stream<Message, never, TranscriptSource> =>
  Option.match(maybeWindow, {
    onNone: () => Stream.empty,
    onSome: ({ mediaId, index }) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const source = yield* TranscriptSource
          return source.passagesIn(mediaId, rangeOfWindow(index)).pipe(
            Stream.map(passages => ReceivedPassages({ passages })),
            Stream.catch(error =>
              Stream.make(FailedLoadTranscript({ reason: error.reason })),
            ),
          )
        }),
      ),
  })

/**
 * When a player reads a recording's words for searching: `OnOpen`, as
 * soon as the search opens, so they are usually in before a person has
 * typed; or `OnSearch`, only once there are words to search for, which a
 * Program chooses where the read is costly, such as on a metered link.
 */
export type SearchReadAhead = 'OnOpen' | 'OnSearch'

/** What the read for a search listens to: the recording to read. */
export const SearchWordsDependencies = S.Struct({
  maybeRecording: S.Option(
    S.Struct({ mediaId: MediaId, durationMs: Milliseconds }),
  ),
})
/** What the read for a search listens to. */
export type SearchWordsDependencies = typeof SearchWordsDependencies.Type

/**
 * The read's dependencies for a player, or for none: the recording, while
 * its search is open and, under `OnSearch`, has words to search for. They
 * do not change while the search stays open, so the read is made once;
 * closing the search ends it, and the source keeps what came in.
 *
 * @example
 * ```typescript
 * searchWordsDependenciesOf(Option.some(player), 'OnSearch')
 * // { maybeRecording: None } until a person searches for words
 * ```
 */
export const searchWordsDependenciesOf = (
  maybePlayer: Option.Option<Model>,
  readAhead: SearchReadAhead = 'OnOpen',
): SearchWordsDependencies => ({
  maybeRecording: Option.flatMap(maybePlayer, player =>
    Option.match(player.maybeSearch, {
      onNone: () => Option.none(),
      onSome: search =>
        readAhead === 'OnOpen' || search._tag !== 'SearchIdle'
          ? Option.some({
              mediaId: player.media.mediaId,
              durationMs: player.media.durationMs,
            })
          : Option.none(),
    }),
  ),
})

/** The read of a recording's words for searching, as the player's facts. */
export const searchWordsStream = ({
  maybeRecording,
}: SearchWordsDependencies): Stream.Stream<Message, never, TranscriptSource> =>
  Option.match(maybeRecording, {
    onNone: () => Stream.empty,
    onSome: ({ mediaId, durationMs }) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const source = yield* TranscriptSource
          return source.searchWordsOf(mediaId, durationMs).pipe(
            Stream.map(reading => ReadSearchWords(reading)),
            Stream.catch(error =>
              Stream.make(FailedReadSearchWords({ reason: error.reason })),
            ),
          )
        }),
      ),
  })

/**
 * What the Transcript Player listens to on its own: its audio while it
 * plays, the words around its place, and the words for a search while
 * one is open. A Program that holds a player builds the same entries from
 * the exports above, with its own lens.
 */
export const subscriptions = Subscription.make<
  Model,
  Message,
  PlayerServices
>()(entry => ({
  clock: entry(ClockDependencies.fields, {
    modelToDependencies: model => clockDependenciesOf(Option.some(model)),
    keepAliveEquivalence: isSameClock,
    dependenciesToStream: clockStream,
  }),
  transcript: entry(TranscriptDependencies.fields, {
    modelToDependencies: model => transcriptDependenciesOf(Option.some(model)),
    dependenciesToStream: transcriptStream,
  }),
  searchWords: entry(SearchWordsDependencies.fields, {
    modelToDependencies: model => searchWordsDependenciesOf(Option.some(model)),
    dependenciesToStream: searchWordsStream,
  }),
}))
