import {
  Context,
  Data,
  Effect,
  Layer,
  Match as M,
  Option,
  Record,
  Schema as S,
  String,
  pipe,
} from 'effect'

import type { Isbn13 } from './ids.js'
import {
  GooglePreview,
  NoPreview,
  type Preview,
  type PreviewExtent,
} from './model.js'

// PREVIEW

/** The preview source could not answer, and why, safe to show. */
export class PreviewSourceError extends Data.TaggedError('PreviewSourceError')<{
  readonly reason: string
}> {}

/**
 * Where Read Aloud asks whether a book has a preview another site may
 * embed: Google Books' Dynamic Links, which answers per ISBN with the
 * preview the publisher allows, or none. In a browser it answers through
 * a script tag, as Google designed it; in Node, through `fetch`.
 */
export class PreviewSource extends Context.Service<
  PreviewSource,
  Readonly<{
    previewOf: (isbn13: Isbn13) => Effect.Effect<Preview, PreviewSourceError>
  }>
>()('read-aloud/PreviewSource') {}

/**
 * The Dynamic Links address that asks Google whether a book has a preview,
 * answering with a call to `callback`.
 *
 * @example
 * ```typescript
 * dynamicLinksUrl(isbn13, 'readAloudPreview')
 * // 'https://books.google.com/books?jscmd=viewapi&bibkeys=ISBN:9780544553729&callback=readAloudPreview'
 * ```
 */
export const dynamicLinksUrl = (isbn13: Isbn13, callback: string): string =>
  `https://books.google.com/books?jscmd=viewapi&bibkeys=ISBN:${isbn13}&callback=${callback}`

const DynamicLinksBook = S.Struct({
  preview: S.String,
  embeddable: S.Boolean,
  preview_url: S.String,
})

const DynamicLinksAnswer = S.Record(S.String, S.Unknown)

const decodeAnswer = S.decodeUnknownOption(DynamicLinksAnswer)

const decodeBook = S.decodeUnknownOption(DynamicLinksBook)

const extentOf = (preview: string): Option.Option<PreviewExtent> =>
  M.value(preview).pipe(
    M.withReturnType<Option.Option<PreviewExtent>>(),
    M.when('partial', () => Option.some('Partial')),
    M.when('full', () => Option.some('Full')),
    M.orElse(() => Option.none()),
  )

const volumeIdOf = (previewUrl: string): Option.Option<string> =>
  Option.filter(
    Option.fromNullishOr(URL.parse(previewUrl)?.searchParams.get('id')),
    String.isNonEmpty,
  )

/**
 * The preview Google's Dynamic Links answer describes for `isbn13`: an
 * embeddable preview of some or all pages, or none when the publisher
 * allows none or Google does not know the book.
 *
 * @example
 * ```typescript
 * previewOfDynamicLinks({ 'ISBN:9780544553729': { preview: 'partial', embeddable: true, preview_url: 'https://books.google.com/books?id=l2WMBAAAQBAJ&source=gbs_ViewAPI' } }, isbn13)
 * // GooglePreview({ volumeId: 'l2WMBAAAQBAJ', extent: 'Partial', ... })
 * ```
 */
export const previewOfDynamicLinks = (
  answer: unknown,
  isbn13: Isbn13,
): Preview =>
  pipe(
    decodeAnswer(answer),
    Option.flatMap(books => Record.get(books, `ISBN:${isbn13}`)),
    Option.flatMap(book => decodeBook(book)),
    Option.filter(book => book.embeddable),
    Option.flatMap(book =>
      Option.map(
        Option.all({
          extent: extentOf(book.preview),
          volumeId: volumeIdOf(book.preview_url),
        }),
        ({ extent, volumeId }) =>
          GooglePreview({ volumeId, extent, previewUrl: book.preview_url }),
      ),
    ),
    Option.getOrElse((): Preview => NoPreview()),
  )

/**
 * A source answering from a table of previews by ISBN, and NoPreview for
 * any other book: what tests use.
 *
 * @example
 * ```typescript
 * previewsInMemory(new Map([[isbn13, GooglePreview({ ... })]]))
 * ```
 */
export const previewsInMemory = (
  byIsbn: ReadonlyMap<Isbn13, Preview>,
): Layer.Layer<PreviewSource> =>
  Layer.succeed(PreviewSource, {
    previewOf: isbn13 =>
      Effect.succeed(
        Option.getOrElse(
          Option.fromNullishOr(byIsbn.get(isbn13)),
          (): Preview => NoPreview(),
        ),
      ),
  })

/** A source that finds no preview for any book: what tests of a holder use. */
export const noPreviews = previewsInMemory(new Map())

const fetchCallback = 'readAloudPreview'

const callbackPrefix = `${fetchCallback}(`

const callbackSuffix = /\);?\s*$/u

const answerOfScript = (script: string): Option.Option<unknown> => {
  const trimmed = String.trim(script)
  return trimmed.startsWith(callbackPrefix)
    ? S.decodeUnknownOption(S.UnknownFromJsonString)(
        trimmed.slice(callbackPrefix.length).replace(callbackSuffix, ''),
      )
    : Option.none()
}

const unreachable = 'Google Books could not be reached'

/**
 * A source that asks Google Books' Dynamic Links over `fetch`: what Node
 * and the terminal use. A browser uses the script-tag source, since
 * Google's answer carries no CORS header.
 */
export const fetchPreviewSource: Layer.Layer<PreviewSource> = Layer.succeed(
  PreviewSource,
  {
    previewOf: isbn13 =>
      Effect.tryPromise({
        try: () =>
          globalThis
            .fetch(dynamicLinksUrl(isbn13, fetchCallback))
            .then(response => response.text()),
        catch: () => new PreviewSourceError({ reason: unreachable }),
      }).pipe(
        Effect.flatMap(script =>
          Option.match(answerOfScript(script), {
            onNone: () =>
              Effect.fail(
                new PreviewSourceError({
                  reason: 'Google Books answered with something unreadable',
                }),
              ),
            onSome: answer =>
              Effect.succeed(previewOfDynamicLinks(answer, isbn13)),
          }),
        ),
      ),
  },
)
