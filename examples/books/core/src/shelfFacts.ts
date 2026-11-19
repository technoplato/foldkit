import { Array, Equal, Option, Stream } from 'effect'
import { hasRowChanges, rowChangesBetween } from 'foldkit/synchronization'

import { ReceivedBookmarks, ReceivedPlaces, ReceivedShelf } from './fact.js'
import type { Bookmark, Progress, Shelf } from './model.js'

// SHELF FACTS

/** What the library store's shelf tells the Program as it changes. */
export type ShelfFact =
  | typeof ReceivedShelf.Type
  | typeof ReceivedPlaces.Type
  | typeof ReceivedBookmarks.Type

const placeKeyOf = (progress: Progress) => progress.slug

const bookmarkKeyOf = (bookmark: Bookmark) => bookmark.bookmarkId

// The keys a change names as removed, as the typed keys the rows held.
const removedFrom = <Row, Key extends string>(
  rows: ReadonlyArray<Row>,
  removed: ReadonlyArray<string>,
  keyOf: (row: Row) => Key,
): ReadonlyArray<Key> =>
  Array.filter(Array.map(rows, keyOf), key => removed.includes(key))

const changesOf = (previous: Shelf, next: Shelf): ReadonlyArray<ShelfFact> => {
  if (!Equal.equals(previous.titles, next.titles)) {
    return [ReceivedShelf({ shelf: next })]
  }
  const places = rowChangesBetween(previous.progress, next.progress, placeKeyOf)
  const bookmarks = rowChangesBetween(
    previous.bookmarks,
    next.bookmarks,
    bookmarkKeyOf,
  )
  return [
    ...(hasRowChanges(places)
      ? [
          ReceivedPlaces({
            changed: places.changed,
            removed: removedFrom(previous.progress, places.removed, placeKeyOf),
          }),
        ]
      : []),
    ...(hasRowChanges(bookmarks)
      ? [
          ReceivedBookmarks({
            changed: bookmarks.changed,
            removed: removedFrom(
              previous.bookmarks,
              bookmarks.removed,
              bookmarkKeyOf,
            ),
          }),
        ]
      : []),
  ]
}

/**
 * The shelves a library store sends, as what a Client is told: the whole
 * shelf once, then for each later shelf only what changed on it, a saved
 * place or a bookmark as its own small fact, and nothing for a shelf that
 * reads the same. The whole shelf comes again only when its titles
 * change. A store can only hand a whole shelf over; this is where it
 * becomes the change.
 *
 * @example
 * ```typescript
 * shelfFacts(store.shelf)
 * // ReceivedShelf once, then ReceivedPlaces({ changed: [the saved place], removed: [] }) every ten seconds of playing
 * ```
 */
export const shelfFacts = <E, R>(
  shelves: Stream.Stream<Shelf, E, R>,
): Stream.Stream<ShelfFact, E, R> =>
  shelves.pipe(
    Stream.mapAccum(
      (): Option.Option<Shelf> => Option.none(),
      (maybePrevious, next) =>
        [
          Option.some(next),
          Option.match(maybePrevious, {
            onNone: (): ReadonlyArray<ShelfFact> => [
              ReceivedShelf({ shelf: next }),
            ],
            onSome: previous => changesOf(previous, next),
          }),
        ] as const,
    ),
  )
