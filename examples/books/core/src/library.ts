import { Context, Data, Effect, Schema as S, Stream } from 'effect'
import { ts } from 'foldkit/schema'

import { BookmarkId, Milliseconds, TitleSlug } from './ids.js'
import type { Shelf } from './model.js'

// LIBRARY

/** Saves where the listener is in a title. */
export const SavePlace = ts('SavePlace', {
  slug: TitleSlug,
  placeMs: Milliseconds,
})
/** Marks a title finished. */
export const FinishTitle = ts('FinishTitle', { slug: TitleSlug })
/** Adds a bookmark at a place in a title. */
export const AddBookmarkAt = ts('AddBookmarkAt', {
  slug: TitleSlug,
  atMs: Milliseconds,
})
/** Removes one bookmark. */
export const RemoveBookmark = ts('RemoveBookmark', { bookmarkId: BookmarkId })

/** One change the library store makes for the listener. */
export const LibraryWrite = S.Union([
  SavePlace,
  FinishTitle,
  AddBookmarkAt,
  RemoveBookmark,
])
/** One change the library store makes for the listener. */
export type LibraryWrite = typeof LibraryWrite.Type

/** The library store could not do what was asked, and why, safe to show. */
export class LibraryStoreError extends Data.TaggedError('LibraryStoreError')<{
  readonly reason: string
}> {}

/**
 * Where the listener's library lives: the shelf, sent again whenever it
 * changes on any device, and the writes that change it. The live store
 * reads and writes the library tables in Instant; tests use one in memory.
 */
export class LibraryStore extends Context.Service<
  LibraryStore,
  Readonly<{
    shelf: Stream.Stream<Shelf, LibraryStoreError>
    write: (write: LibraryWrite) => Effect.Effect<void, LibraryStoreError>
  }>
>()('books/LibraryStore') {}
