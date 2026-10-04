import { Effect, Match as M, Option, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { type AudioEvent, AudioOutput, Track } from './audio.js'
import { Speed } from './ids.js'
import { LibraryStore } from './library.js'
import {
  FailedPlayAudio,
  FailedReadShelf,
  type Message,
  ReachedEnd,
  ReachedPlace,
  ReceivedShelf,
} from './message.js'
import { type Model, loadedTitleOf } from './model.js'
import type { BooksServices } from './services.js'

// SUBSCRIPTION

/**
 * The track this device should be sounding: the loaded title from its
 * place, while it plays. None while paused or idle, so the clock stops.
 */
export const trackOf = (model: Model): Option.Option<Track> =>
  Option.flatMap(loadedTitleOf(model), ({ title, loaded }) =>
    loaded.transport._tag === 'Playing'
      ? Option.some(
          Track.make({
            slug: title.slug,
            cue: loaded.transport.cue,
            fromMs: loaded.placeMs,
            durationMs: title.durationMs,
            maybeAudioUrl: title.maybeAudioUrl,
          }),
        )
      : Option.none(),
  )

const messageOfAudioEvent = (event: AudioEvent): Message =>
  M.value(event).pipe(
    M.withReturnType<Message>(),
    M.tagsExhaustive({
      Advanced: ({ placeMs }) => ReachedPlace({ placeMs }),
      Ended: () => ReachedEnd(),
      Failed: ({ reason }) => FailedPlayAudio({ reason }),
    }),
  )

const isSameCue = Option.makeEquivalence<Track>(
  (self, that) => self.slug === that.slug && self.cue === that.cue,
)

/**
 * What Books listens to: the shelf from the library store for as long as
 * the Program runs, and the player's clock while a track plays. A new
 * place or title restarts the clock; a new speed does not, the clock reads
 * it every step.
 */
export const subscriptions = Subscription.make<Model, Message, BooksServices>()(
  entry => ({
    shelf: entry(
      {},
      {
        modelToDependencies: () => ({}),
        dependenciesToStream: () =>
          Stream.unwrap(
            Effect.gen(function* () {
              const store = yield* LibraryStore
              return store.shelf.pipe(
                Stream.map(shelf => ReceivedShelf({ shelf })),
                Stream.catch(error =>
                  Stream.make(FailedReadShelf({ reason: error.reason })),
                ),
              )
            }),
          ),
      },
    ),
    clock: entry(
      { maybeTrack: S.Option(Track), speed: Speed },
      {
        modelToDependencies: model => ({
          maybeTrack: trackOf(model),
          speed: model.speed,
        }),
        keepAliveEquivalence: (self, that) =>
          isSameCue(self.maybeTrack, that.maybeTrack),
        dependenciesToStream: ({ maybeTrack }, readDependencies) =>
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
          }),
      },
    ),
  }),
)
