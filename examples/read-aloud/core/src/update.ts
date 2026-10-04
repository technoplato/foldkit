import { Array, Match as M, Option, Schema as S } from 'effect'
import { type Command, Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'

import {
  type Destination,
  ReadAloudPage,
  ReadAloudPlace,
  ReadAloudShelf,
  isReadAloudBook,
  isReadAloudPage,
  isReadAloudShelf,
} from './destination.js'
import { type BookKey, PageNumber } from './ids.js'
import type { Message, ReadAloudMessage } from './message.js'
import {
  type Model,
  PreviewCheck,
  PreviewChecked,
  PreviewUnchecked,
  type ReadAloudView,
  type Readings,
  ReadingsReady,
  ReadingsState,
  ReadingsUnavailable,
  bookOfKey,
  isNewTurn,
  liveTurnOf,
  newestTurnOf,
  openingPageOf,
} from './model.js'
import { navigation } from './navigation.js'
import type { ReadAloudServices } from './services.js'
import { settledEntryOf, shownBookOf, shownPageOf } from './stack.js'

// UPDATE

/** Puts a place on top of the stack instead of the one there. */
export const ReplaceTop = ts('ReplaceTop', { place: ReadAloudPlace })
/** Opens a book's page right above the shelf. */
export const OpenAboveShelf = ts('OpenAboveShelf', { page: ReadAloudPage })
/** The one change Read Aloud makes to the stack that holds it. */
export const StackEdit = S.Union([ReplaceTop, OpenAboveShelf])
/** The one change Read Aloud makes to the stack that holds it. */
export type StackEdit = typeof StackEdit.Type

/**
 * What one Message does to Read Aloud: its readings and preview checks
 * after it, and the change it makes to the stack, if any. It reads only
 * Read Aloud's part of the Model, so it is the same wherever Read Aloud
 * is mounted.
 */
export const ReadAloudStep = S.Struct({
  readings: ReadingsState,
  previewChecks: S.Array(PreviewCheck),
  maybeEdit: S.Option(StackEdit),
})
/** What one Message does to Read Aloud. */
export type ReadAloudStep = typeof ReadAloudStep.Type

const unchangedStep = (view: ReadAloudView): ReadAloudStep => ({
  readings: view.readings,
  previewChecks: view.previewChecks,
  maybeEdit: Option.none(),
})

const withEdit = (
  view: ReadAloudView,
  maybeEdit: Option.Option<StackEdit>,
): ReadAloudStep => ({ ...unchangedStep(view), maybeEdit })

const clampedPage = (view: ReadAloudView, page: number): PageNumber => {
  const maybeLast = Option.flatMap(
    shownBookOf(view),
    book => book.maybePageCount,
  )
  return PageNumber.make(
    Math.max(
      1,
      Option.match(maybeLast, {
        onNone: () => page,
        onSome: last => Math.min(last, page),
      }),
    ),
  )
}

const turnedTo = (view: ReadAloudView, page: number): ReadAloudStep =>
  withEdit(
    view,
    Option.map(shownPageOf(view), shown =>
      ReplaceTop({
        place: ReadAloudPage({
          book: shown.book,
          page: clampedPage(view, page),
        }),
      }),
    ),
  )

const steppedBy = (view: ReadAloudView, step: number): ReadAloudStep =>
  Option.match(shownPageOf(view), {
    onNone: () => unchangedStep(view),
    onSome: shown => turnedTo(view, shown.page + step),
  })

const openedBook = (view: ReadAloudView, key: BookKey): ReadAloudStep =>
  withEdit(
    view,
    Option.map(bookOfKey(view, key), book =>
      OpenAboveShelf({
        page: ReadAloudPage({ book: key, page: openingPageOf(view, book) }),
      }),
    ),
  )

const followedReading = (view: ReadAloudView): ReadAloudStep =>
  withEdit(
    view,
    Option.map(liveTurnOf(view), ({ book, turn }) =>
      OpenAboveShelf({
        page: ReadAloudPage({ book: book.key, page: turn.page }),
      }),
    ),
  )

const settledTopOf = (view: ReadAloudView): Option.Option<ReadAloudPage> =>
  Option.flatMap(
    Option.filter(Array.last(view.navigation.pages), isReadAloudBook),
    top => Option.liftPredicate(settledEntryOf(view, top), isReadAloudPage),
  )

const shownPlaceOf = (view: ReadAloudView): Option.Option<ReadAloudPage> =>
  Option.map(shownPageOf(view), ({ book, page }) =>
    ReadAloudPage({ book, page }),
  )

const followedTopOf = (
  earlier: ReadingsState,
  view: ReadAloudView,
  shown: ReadAloudPage,
): Option.Option<ReadAloudPage> =>
  Option.flatMap(bookOfKey(view, shown.book), book =>
    Option.flatMap(
      Option.filter(newestTurnOf(view, book), turn => isNewTurn(earlier, turn)),
      turn => Option.some(ReadAloudPage({ book: shown.book, page: turn.page })),
    ),
  )

/**
 * The readings arrive: a placeless book on top settles to the page it
 * opens at, and the book on screen turns to the newest page Scribe heard
 * when the earlier readings did not have it. So a link to page 3, or a
 * page turned by hand, holds until Scribe hears the reader turn another.
 */
const receivedReadings = (
  view: ReadAloudView,
  readings: Readings,
): ReadAloudStep => {
  const next: ReadAloudView = { ...view, readings: ReadingsReady({ readings }) }
  const maybeSettled = settledTopOf(next)
  const maybeFollowed = Option.flatMap(
    Option.orElse(maybeSettled, () => shownPlaceOf(next)),
    shown => followedTopOf(view.readings, next, shown),
  )
  return {
    ...unchangedStep(next),
    maybeEdit: Option.map(
      Option.orElse(maybeFollowed, () => maybeSettled),
      place => ReplaceTop({ place }),
    ),
  }
}

const withPreviewCheck = (
  view: ReadAloudView,
  check: PreviewCheck,
): ReadAloudStep => ({
  ...unchangedStep(view),
  previewChecks: [
    check,
    ...Array.filter(
      view.previewChecks,
      existing => existing.isbn13 !== check.isbn13,
    ),
  ],
})

/**
 * What one Read Aloud Message does, read from Read Aloud's part of any
 * Model: opening a book, turning a page, following the reading, the
 * readings arriving, and a preview's answer.
 *
 * @example
 * ```typescript
 * stepOf(model, NextPage()).maybeEdit // Some(ReplaceTop({ place: ReadAloudPage({ book, page: 5 }) }))
 * ```
 */
export const stepOf = (
  view: ReadAloudView,
  message: ReadAloudMessage,
): ReadAloudStep =>
  M.value(message).pipe(
    M.withReturnType<ReadAloudStep>(),
    M.tagsExhaustive({
      OpenBook: ({ book }) => openedBook(view, book),
      PreviousPage: () => steppedBy(view, -1),
      NextPage: () => steppedBy(view, 1),
      TurnToPage: ({ page }) => turnedTo(view, page),
      FollowReading: () => followedReading(view),
      ReceivedReadings: ({ readings }) => receivedReadings(view, readings),
      FailedReadReadings: ({ reason }) => ({
        ...unchangedStep(view),
        readings: ReadingsUnavailable({ reason }),
      }),
      ReceivedPreview: ({ isbn13, preview }) =>
        withPreviewCheck(view, PreviewChecked({ isbn13, preview })),
      FailedCheckPreview: ({ isbn13, reason }) =>
        withPreviewCheck(view, PreviewUnchecked({ isbn13, reason })),
    }),
  )

/**
 * How a Program that holds Read Aloud keeps Read Aloud's places: the lens
 * to its stack, and how a Read Aloud place sits in that stack's
 * Destinations. Read Aloud's own Program places them as they are, and so
 * does Books once its Destinations list Read Aloud's places.
 *
 * @example
 * ```typescript
 * const hold: ReadAloudHold<BooksModel, BooksDestination> = {
 *   stack: Navigation.fieldLens<BooksModel, BooksDestination>(),
 *   place: place => place,
 * }
 * ```
 */
export type ReadAloudHold<HostModel, HostDestination> = Readonly<{
  stack: Navigation.StackLens<HostModel, HostDestination>
  place: (place: ReadAloudPlace) => HostDestination
}>

const isReplaceTop = S.is(ReplaceTop)

const editedPages = <HostDestination>(
  place: (place: ReadAloudPlace) => HostDestination,
  stack: Navigation.NavigationStack<HostDestination>,
  edit: StackEdit,
): ReadonlyArray<HostDestination> => {
  if (isReplaceTop(edit)) {
    return [...Array.dropRight(stack.pages, 1), place(edit.place)]
  } else if (isReadAloudShelf(stack.root)) {
    return [place(edit.page)]
  } else {
    return [
      ...Option.match(Array.findLastIndex(stack.pages, isReadAloudShelf), {
        onNone: () => [place(ReadAloudShelf())],
        onSome: index => Array.take(stack.pages, index + 1),
      }),
      place(edit.page),
    ]
  }
}

/**
 * Read Aloud's update for any Model that holds it: the step a Message
 * takes, written through the hold. The page on screen lives in the
 * holder's stack, so its address is always a link to it. A book opens
 * right above the shelf, pushing the shelf first where the stack has none.
 *
 * @example
 * ```typescript
 * const updateBooksReadAloud = updateReadAloud(hold)
 * updateBooksReadAloud(model, NextPage()) // the top of the stack moves from page 4 to page 5
 * ```
 */
export const updateReadAloud =
  <HostModel extends ReadAloudView, HostDestination>(
    hold: ReadAloudHold<HostModel, HostDestination>,
  ) =>
  (model: HostModel, message: ReadAloudMessage): HostModel => {
    const step = stepOf(model, message)
    const stepped: HostModel = {
      ...model,
      readings: step.readings,
      previewChecks: step.previewChecks,
    }
    return Option.match(
      Option.all({ edit: step.maybeEdit, stack: hold.stack.get(stepped) }),
      {
        onNone: () => stepped,
        onSome: ({ edit, stack }) =>
          hold.stack.set(stepped, {
            ...stack,
            pages: editedPages(hold.place, stack, edit),
          }),
      },
    )
  }

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, ReadAloudServices>>,
]

const updatedReadAloud = updateReadAloud<Model, Destination>({
  stack: Navigation.fieldLens<Model, Destination>(),
  place: place => place,
})

/**
 * The Read Aloud Program's update: Read Aloud's Messages through
 * `updateReadAloud` on its own stack, and the carrier facts folded by its
 * navigation, which settles a link to a book with no page to its page.
 *
 * @example
 * ```typescript
 * update(model, NextPage()) // [the Model with page 5 on top, []]
 * ```
 */
export const update = (model: Model, message: Message): UpdateReturn =>
  Navigation.isMessage(message)
    ? [Navigation.foldMessage(navigation, model, message), []]
    : [updatedReadAloud(model, message), []]
