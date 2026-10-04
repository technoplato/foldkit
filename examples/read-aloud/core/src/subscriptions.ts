import { Effect, Option, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { Isbn13 } from './ids.js'
import {
  FailedCheckPreview,
  FailedReadReadings,
  type Message,
  ReceivedPreview,
  ReceivedReadings,
} from './message.js'
import { type Model, type ReadAloudView, previewCheckOf } from './model.js'
import { PreviewSource } from './preview.js'
import { ReadingSource } from './reading.js'
import type { ReadAloudServices } from './services.js'
import { shownBookKeyOf, shownBookOf } from './stack.js'

// SUBSCRIPTION

/**
 * The ISBN of the book on screen while nobody has asked whether it has a
 * preview: the book's own, or the address's when it names an ISBN the
 * readings do not hold.
 *
 * @example
 * ```typescript
 * uncheckedIsbnOf(model) // Some('9780544553729') right after opening /books/read-aloud/9780544553729/page/3
 * ```
 */
export const uncheckedIsbnOf = (model: ReadAloudView): Option.Option<Isbn13> =>
  Option.filter(
    Option.orElse(
      Option.flatMap(shownBookOf(model), book => book.maybeIsbn13),
      () =>
        Option.flatMap(shownBookKeyOf(model), S.decodeUnknownOption(Isbn13)),
    ),
    isbn13 => Option.isNone(previewCheckOf(model, isbn13)),
  )

/**
 * The readings stream, as Read Aloud's facts: every update the reading
 * source sends, and why it stopped, if it does.
 */
export const readingsStream = (): Stream.Stream<
  Message,
  never,
  ReadingSource
> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const source = yield* ReadingSource
      return source.readings.pipe(
        Stream.map(readings => ReceivedReadings({ readings })),
        Stream.catch(error =>
          Stream.make(FailedReadReadings({ reason: error.reason })),
        ),
      )
    }),
  )

/** The answer for one book's preview, as Read Aloud's facts. */
export const previewStream = ({
  maybeIsbn13,
}: Readonly<{ maybeIsbn13: Option.Option<Isbn13> }>): Stream.Stream<
  Message,
  never,
  PreviewSource
> =>
  Option.match(maybeIsbn13, {
    onNone: () => Stream.empty,
    onSome: isbn13 =>
      Stream.fromEffect(
        Effect.gen(function* () {
          const source = yield* PreviewSource
          return yield* source.previewOf(isbn13)
        }).pipe(
          Effect.map(preview => ReceivedPreview({ isbn13, preview })),
          Effect.catch(error =>
            Effect.succeed(
              FailedCheckPreview({ isbn13, reason: error.reason }),
            ),
          ),
        ),
      ),
  })

/**
 * What Read Aloud listens to: the readings for as long as it runs, so a
 * page Scribe hears turns the screen, and, once per book, whether the
 * book on screen has a preview to embed.
 */
export const subscriptions = Subscription.make<
  Model,
  Message,
  ReadAloudServices
>()(entry => ({
  readings: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: readingsStream,
    },
  ),
  preview: entry(
    { maybeIsbn13: S.Option(Isbn13) },
    {
      modelToDependencies: model => ({ maybeIsbn13: uncheckedIsbnOf(model) }),
      dependenciesToStream: previewStream,
    },
  ),
}))
