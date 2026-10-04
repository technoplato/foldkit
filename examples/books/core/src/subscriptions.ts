import { Effect, Option, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { Milliseconds, TitleSlug } from './ids.js'
import { LibraryStore } from './library.js'
import {
  FailedReadShelf,
  type Message,
  OpenedPlace,
  ReceivedMember,
  ReceivedShelf,
} from './message.js'
import {
  type Model,
  loadedPlayerOf,
  placeOf,
  resumePlaceOf,
  titleOf,
} from './model.js'
import type { BooksServices } from './services.js'
import { addressCueOf } from './stack.js'

// SUBSCRIPTION

/**
 * The place the player's address asks for, when the player is not there.
 *
 * @example
 * ```typescript
 * addressCueOfModel(model) // Some({ slug: 'small-hours', atMs: 723000 }) after opening /books/small-hours/listen/12m03s
 * ```
 */
export const addressCueOfModel = (
  model: Model,
): Option.Option<Readonly<{ slug: TitleSlug; atMs: Milliseconds }>> =>
  addressCueOf(
    model,
    slug => Option.isSome(titleOf(model, slug)),
    slug =>
      model.listening._tag === 'Loaded' && model.listening.slug === slug
        ? placeOf(model.listening)
        : resumePlaceOf(model, slug),
  )

/**
 * What Books listens to: the shelf from the library store for as long as
 * the Program runs, the player's address when it names a place the player
 * is not at, and the loaded player's audio and words, built from
 * the Transcript Player's own entries. A new place or title restarts the
 * audio; a new speed does not, the clock reads it every step. The words
 * are read again only when the place crosses into another window. The
 * books read aloud come from the reading source for as long as the
 * Program runs, so the library's Read aloud row and an open page follow
 * the reader, and each book read aloud is asked once for a preview.
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
    member: entry(
      {},
      {
        modelToDependencies: () => ({}),
        dependenciesToStream: () =>
          Stream.unwrap(
            Effect.gen(function* () {
              const store = yield* LibraryStore
              return Stream.map(store.member, maybeEmail =>
                ReceivedMember({ maybeEmail }),
              )
            }),
          ),
      },
    ),
    addressCue: entry(
      {
        maybeCue: S.Option(S.Struct({ slug: TitleSlug, atMs: Milliseconds })),
      },
      {
        modelToDependencies: model => ({ maybeCue: addressCueOfModel(model) }),
        dependenciesToStream: ({ maybeCue }) =>
          Option.match(maybeCue, {
            onNone: () => Stream.empty,
            onSome: ({ slug, atMs }) =>
              Stream.make(OpenedPlace({ slug, atMs })),
          }),
      },
    ),
    transcript: entry(TranscriptPlayer.TranscriptDependencies.fields, {
      modelToDependencies: model =>
        TranscriptPlayer.transcriptDependenciesOf(loadedPlayerOf(model)),
      dependenciesToStream: TranscriptPlayer.transcriptStream,
    }),
    readings: entry(
      {},
      {
        modelToDependencies: () => ({}),
        dependenciesToStream: ReadAloud.readingsStream,
      },
    ),
    readAloudPreview: entry(
      { maybeIsbn13: S.Option(ReadAloud.Isbn13) },
      {
        modelToDependencies: model => ({
          maybeIsbn13: ReadAloud.uncheckedIsbnOf(model),
        }),
        dependenciesToStream: ReadAloud.previewStream,
      },
    ),
  }),
)
