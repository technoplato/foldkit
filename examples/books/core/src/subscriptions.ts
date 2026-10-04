import { Effect, Stream } from 'effect'
import { Subscription } from 'foldkit'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { LibraryStore } from './library.js'
import { FailedReadShelf, type Message, ReceivedShelf } from './message.js'
import { type Model, loadedPlayerOf } from './model.js'
import type { BooksServices } from './services.js'

// SUBSCRIPTION

/**
 * What Books listens to: the shelf from the library store for as long as
 * the Program runs, and the loaded player's audio and words, built from
 * the Transcript Player's own entries. A new place or title restarts the
 * audio; a new speed does not, the clock reads it every step. The words
 * are read again only when the place crosses into another window.
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
    clock: entry(TranscriptPlayer.ClockDependencies.fields, {
      modelToDependencies: model =>
        TranscriptPlayer.clockDependenciesOf(loadedPlayerOf(model)),
      keepAliveEquivalence: TranscriptPlayer.isSameClock,
      dependenciesToStream: TranscriptPlayer.clockStream,
    }),
    transcript: entry(TranscriptPlayer.TranscriptDependencies.fields, {
      modelToDependencies: model =>
        TranscriptPlayer.transcriptDependenciesOf(loadedPlayerOf(model)),
      dependenciesToStream: TranscriptPlayer.transcriptStream,
    }),
  }),
)
