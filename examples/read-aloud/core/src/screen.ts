import { Array, Match as M, Option, Schema as S } from 'effect'
import { Catalog } from 'foldkit'
import {
  type ButtonNode,
  Column,
  List,
  type ListItem,
  Progress,
  Row,
  Text,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'

import { type BookKey, Isbn13, type PageNumber } from './ids.js'
import {
  FollowReading,
  NextPage,
  OpenBook,
  PreviousPage,
  catalog,
} from './message.js'
import {
  type Book,
  type GooglePreview,
  type PreviewCheck,
  type ReadAloudView,
  booksOf,
  bylineOf,
  liveTurnOf,
  newestTurnOf,
  previewCheckOf,
} from './model.js'
import { pagePathOf } from './routes.js'
import { shownBookOf } from './stack.js'

// VIEW

type AnyAction = Readonly<{ tag: string }>

type Variant = ButtonNode['variant']

const thumbnailSize = 112

const coverWidth = 180

const coverHeight = 180

const previewWidth = 640

const previewHeight = 640

const linksShown = 3

/** The embed kind a host draws as Google Books' Embedded Viewer. */
export const googleBooksPreviewKind = 'GoogleBooksPreview'

const entriesOf = (model: ReadAloudView): ReadonlyArray<Catalog.Entry> =>
  Catalog.entries(catalog, model)

const withVariant = (
  buttons: ReadonlyArray<ButtonNode>,
  variant: Variant,
): ReadonlyArray<ButtonNode> =>
  Array.map(buttons, button =>
    variant === undefined ? button : { ...button, variant },
  )

const buttonsOf = (
  model: ReadAloudView,
  actions: ReadonlyArray<AnyAction>,
  variant: Variant,
): ReadonlyArray<ButtonNode> =>
  withVariant(
    actionButtons(
      Array.filter(entriesOf(model), entry =>
        Array.some(actions, action => action.tag === entry.tag),
      ),
    ),
    variant,
  )

const offeredButtonsOf = (
  model: ReadAloudView,
  actions: ReadonlyArray<AnyAction>,
  variant: Variant,
): ReadonlyArray<ButtonNode> =>
  Array.filter(
    buttonsOf(model, actions, variant),
    button => button.disabled !== true,
  )

const ofPagesText = (book: Book): string =>
  Option.match(book.maybePageCount, {
    onNone: () => '',
    onSome: count => ` of ${count.toString()}`,
  })

const statusOf = (model: ReadAloudView, book: Book): string =>
  Option.match(newestTurnOf(model, book), {
    onNone: () => 'Not read aloud yet',
    onSome: turn =>
      turn.isOngoing
        ? `Reading now · page ${turn.page.toString()}${ofPagesText(book)}`
        : `Read to page ${turn.page.toString()}${ofPagesText(book)}`,
  })

const thumbnailOf = (book: Book): Pick<ListItem, 'image'> =>
  Option.match(book.maybeCoverUrl, {
    onNone: () => ({}),
    onSome: src => ({
      image: {
        src,
        width: thumbnailSize,
        height: thumbnailSize,
        alt: `${book.title} cover`,
      },
    }),
  })

const progressOf = (
  model: ReadAloudView,
  book: Book,
): Pick<ListItem, 'progress'> =>
  Option.match(
    Option.all({
      turn: newestTurnOf(model, book),
      count: book.maybePageCount,
    }),
    {
      onNone: () => ({}),
      onSome: ({ turn, count }) => ({
        progress: { value: Math.min(turn.page, count), max: count },
      }),
    },
  )

const isLive = (model: ReadAloudView, book: Book): boolean =>
  Option.exists(liveTurnOf(model), live => live.book.bookId === book.bookId)

const bookItemOf = (model: ReadAloudView, book: Book): ListItem => ({
  key: book.key,
  title: book.title,
  lines: [bylineOf(book), statusOf(model, book)],
  ...thumbnailOf(book),
  ...progressOf(model, book),
  action: `${OpenBook.tag}:${book.key}`,
  isCurrent: isLive(model, book),
})

const liveLines = (model: ReadAloudView): ReadonlyArray<UiNode> =>
  Option.match(liveTurnOf(model), {
    onNone: () => [],
    onSome: ({ book, turn }) => [
      Text(
        `Reading now: ${book.title}, page ${turn.page.toString()}${ofPagesText(book)}.`,
        { dim: true },
      ),
      Row({ gap: 1 }, ...offeredButtonsOf(model, [FollowReading], 'Primary')),
    ],
  })

/**
 * The books read aloud, the one being read now marked, each with who
 * wrote it, how far the reading got, and its cover. Pressing a book opens
 * it at the page being read, or its first page.
 *
 * @example
 * ```typescript
 * shelfScreen(model)
 * // Column: Read aloud, Reading now: Little Blue Truck Feeling Happy, page 4 of 14., [Follow the reading], List('Books read aloud')
 * ```
 */
export const shelfScreen = (model: ReadAloudView): UiNode =>
  Column(
    { gap: 1 },
    Text('Read aloud', { emphasis: 'Headline' }),
    ...M.value(model.readings).pipe(
      M.withReturnType<ReadonlyArray<UiNode>>(),
      M.tagsExhaustive({
        ReadingsLoading: () => [
          Text('Opening the books you read aloud…', { dim: true }),
        ],
        ReadingsUnavailable: ({ reason }) => [
          Text(`The books you read aloud could not be opened: ${reason}`),
        ],
        ReadingsReady: () =>
          Array.match(booksOf(model), {
            onEmpty: () => [
              Text(
                'No books yet. When Scribe hears you read a book aloud, it shows here, and its page turns as you read.',
                { dim: true },
              ),
            ],
            onNonEmpty: books => [
              ...liveLines(model),
              List({
                label: 'Books read aloud',
                items: Array.map(books, book => bookItemOf(model, book)),
              }),
            ],
          }),
      }),
    ),
  )

const detailsOf = (book: Book): ReadonlyArray<string> =>
  Option.toArray(
    Option.liftPredicate(
      Array.join(
        [
          ...Array.take(book.publishers, 1),
          ...Option.toArray(
            Option.map(
              book.maybePageCount,
              count => `${count.toString()} pages`,
            ),
          ),
        ],
        ' · ',
      ),
      details => details !== '',
    ),
  )

const bookHeaderOf = (book: Book): UiNode =>
  List({
    label: 'Book',
    items: [
      {
        key: book.key,
        title: book.title,
        lines: [bylineOf(book), ...detailsOf(book)],
        ...thumbnailOf(book),
      },
    ],
  })

const isbnHeaderOf = (key: BookKey): UiNode =>
  List({
    label: 'Book',
    items: [
      {
        key,
        title: Option.isSome(S.decodeUnknownOption(Isbn13)(key))
          ? `ISBN ${key}`
          : key,
        lines: ['Not among the books you have read aloud'],
      },
    ],
  })

const pageLineOf = (maybeBook: Option.Option<Book>, page: PageNumber): UiNode =>
  Row(
    { gap: 1 },
    Text(`Page ${page.toString()}`, { emphasis: 'Display' }),
    ...Array.fromOption(
      Option.map(
        Option.flatMap(maybeBook, book => book.maybePageCount),
        count => Text(`of ${count.toString()}`, { dim: true }),
      ),
    ),
  )

const pageProgressOf = (
  maybeBook: Option.Option<Book>,
  page: PageNumber,
): ReadonlyArray<UiNode> =>
  Array.fromOption(
    Option.map(
      Option.flatMap(maybeBook, book => book.maybePageCount),
      count =>
        Progress({
          value: Math.min(page, count),
          max: count,
          label: `Page ${page.toString()} of ${count.toString()}`,
        }),
    ),
  )

const followWordsOf = (
  model: ReadAloudView,
  key: BookKey,
  page: PageNumber,
): string =>
  Option.match(liveTurnOf(model), {
    onNone: () =>
      'Not being read aloud right now. When Scribe hears you read this book, its page turns here as you turn yours.',
    onSome: ({ book, turn }) => {
      if (book.key !== key) {
        return `Scribe hears ${book.title} being read now, at page ${turn.page.toString()}.`
      } else if (turn.page === page) {
        return 'Following along. The page turns here when Scribe hears you turn it.'
      } else {
        return `Scribe heard page ${turn.page.toString()}. The page turns again at the next page Scribe hears.`
      }
    },
  })

const googleUrlOf = (preview: GooglePreview, page: PageNumber): string =>
  `https://books.google.com/books?id=${preview.volumeId}&pg=PA${page.toString()}`

const embeddedPreviewOf = (
  title: string,
  isbn13: Isbn13,
  preview: GooglePreview,
  page: PageNumber,
): UiNode =>
  Column(
    {},
    Text(`${title}, page ${page.toString()}, in Google Books`, {
      href: googleUrlOf(preview, page),
      embed: {
        kind: googleBooksPreviewKind,
        params: {
          volume: `ISBN:${isbn13}`,
          page: page.toString(),
          missingPage: `Google's preview has no page ${page.toString()}. Its own arrows move through the pages it has.`,
          unavailable: `The preview did not open here. Open ${title} in Google Books.`,
        },
        width: previewWidth,
        height: previewHeight,
      },
    }),
    Text(
      preview.extent === 'Full'
        ? 'Preview from Google Books.'
        : 'Preview from Google Books, of the pages the publisher allows.',
      { dim: true },
    ),
  )

const linkRowOf = (book: Book): ReadonlyArray<UiNode> =>
  Array.match(Array.take(book.links, linksShown), {
    onEmpty: () => [],
    onNonEmpty: links => [
      Row(
        { gap: 1 },
        ...Array.map(links, link =>
          Text(link.isVerified ? link.label : `${link.label} (unverified)`, {
            href: link.url,
          }),
        ),
      ),
    ],
  })

const largeCoverOf = (book: Book): ReadonlyArray<UiNode> =>
  Array.fromOption(
    Option.map(book.maybeCoverUrl, src =>
      Text(`${book.title} cover`, {
        image: { src, width: coverWidth, height: coverHeight },
      }),
    ),
  )

const noPreviewOf = (maybeBook: Option.Option<Book>): UiNode =>
  Column(
    { gap: 1 },
    ...Option.match(maybeBook, {
      onNone: () => [],
      onSome: largeCoverOf,
    }),
    Text('No preview available', { emphasis: 'Headline' }),
    Text(
      'The publisher allows no preview of this edition that another site may show, so only its cover and details are here.',
      { dim: true },
    ),
    ...Option.match(maybeBook, {
      onNone: () => [],
      onSome: linkRowOf,
    }),
  )

const checkedPreviewOf = (
  maybeBook: Option.Option<Book>,
  isbn13: Isbn13,
  title: string,
  page: PageNumber,
) =>
  M.type<PreviewCheck>().pipe(
    M.withReturnType<UiNode>(),
    M.tagsExhaustive({
      PreviewChecked: ({ preview }) =>
        M.value(preview).pipe(
          M.withReturnType<UiNode>(),
          M.tagsExhaustive({
            GooglePreview: googlePreview =>
              embeddedPreviewOf(title, isbn13, googlePreview, page),
            NoPreview: () => noPreviewOf(maybeBook),
          }),
        ),
      PreviewUnchecked: ({ reason }) =>
        Text(`Could not look for a preview: ${reason}`, { dim: true }),
    }),
  )

const previewSectionOf = (
  model: ReadAloudView,
  maybeBook: Option.Option<Book>,
  maybeIsbn13: Option.Option<Isbn13>,
  title: string,
  page: PageNumber,
): UiNode =>
  Option.match(maybeIsbn13, {
    onNone: () => noPreviewOf(maybeBook),
    onSome: isbn13 =>
      Option.match(previewCheckOf(model, isbn13), {
        onNone: () => Text('Looking for a preview…', { dim: true }),
        onSome: checkedPreviewOf(maybeBook, isbn13, title, page),
      }),
  })

const linkOf = (key: BookKey, page: PageNumber): ReadonlyArray<UiNode> =>
  Array.fromOption(
    Option.map(pagePathOf(key, page), path =>
      Text(path, {
        href: path,
        mono: true,
        dim: true,
        label: `Link to page ${page.toString()}`,
      }),
    ),
  )

/**
 * One book open at one page: the book, the page in large type, whether
 * the screen is following the reading, Previous and Next page, the
 * preview turned to the page, or a clear "No preview available" with the
 * cover and where to find the book, and the link to this page.
 *
 * @example
 * ```typescript
 * pageScreen(model, key, page)
 * // Column: List(book), Page 4 of 14, Following the reading., [Previous page] [Next page], No preview available, /books/read-aloud/9780063342705/page/4
 * ```
 */
export const pageScreen = (
  model: ReadAloudView,
  key: BookKey,
  page: PageNumber,
): UiNode => {
  const maybeBook = shownBookOf(model)
  const maybeIsbn13 = Option.orElse(
    Option.flatMap(maybeBook, book => book.maybeIsbn13),
    () => S.decodeUnknownOption(Isbn13)(key),
  )
  const title = Option.match(maybeBook, {
    onNone: () => `ISBN ${key}`,
    onSome: book => book.title,
  })
  return Column(
    { gap: 1 },
    Option.match(maybeBook, {
      onNone: () => isbnHeaderOf(key),
      onSome: bookHeaderOf,
    }),
    pageLineOf(maybeBook, page),
    ...pageProgressOf(maybeBook, page),
    Text(followWordsOf(model, key, page), { dim: true }),
    Row(
      { gap: 1 },
      ...buttonsOf(model, [PreviousPage, NextPage], 'Ghost'),
      ...offeredButtonsOf(model, [FollowReading], 'Primary'),
    ),
    previewSectionOf(model, maybeBook, maybeIsbn13, title, page),
    ...linkOf(key, page),
  )
}

/**
 * A book on its way: the readings have not arrived, or its address names
 * no page yet.
 */
export const openingScreen = (): UiNode =>
  Column({}, Text('Opening the book…', { dim: true }))
