import {
  Array,
  Effect,
  Layer,
  Match as M,
  Option,
  Stream,
  SubscriptionRef,
} from 'effect'
import * as ReadAloud from 'read-aloud-core-example'

import {
  BookmarkId,
  ChapterNumber,
  MediaId,
  Milliseconds,
  TitleSlug,
} from './ids.js'
import { LibraryStore, type LibraryWrite } from './library.js'
import { Finished, InProgress, type Shelf, type Title } from './model.js'

// SAMPLE

const minuteMs = 60_000

const chaptersOf = (
  names: Array.NonEmptyReadonlyArray<string>,
  minutesEach: number,
): Title['chapters'] =>
  Array.map(names, (name, index) => ({
    chapterNumber: ChapterNumber.make(index + 1),
    name,
    startMs: Milliseconds.make(index * minutesEach * minuteMs),
    endMs: Milliseconds.make((index + 1) * minutesEach * minuteMs),
  }))

const titleOf = (
  fields: Readonly<{
    slug: string
    name: string
    authors: ReadonlyArray<string>
    narrators: ReadonlyArray<string>
    chapterNames: Array.NonEmptyReadonlyArray<string>
    minutesEach: number
  }>,
): Title => ({
  slug: TitleSlug.make(fields.slug),
  mediaId: MediaId.make(fields.slug),
  name: fields.name,
  authors: fields.authors,
  narrators: fields.narrators,
  durationMs: Milliseconds.make(
    fields.chapterNames.length * fields.minutesEach * minuteMs,
  ),
  chapters: chaptersOf(fields.chapterNames, fields.minutesEach),
  maybeCoverUrl: Option.none(),
  maybeAudioUrl: Option.some(`https://audio.invalid/${fields.slug}.m4a`),
})

/**
 * A made-up library for tests and the throwaway Instant app: three titles
 * by people who do not exist, with no audio, so nothing real is copied.
 */
export const sampleTitles: ReadonlyArray<Title> = [
  titleOf({
    slug: 'the-lantern-keeper',
    name: 'The Lantern Keeper',
    authors: ['Ada Quill'],
    narrators: ['Sam Reed'],
    chapterNames: ['The Tide', 'The Light', 'The Storm', 'The Keeper'],
    minutesEach: 20,
  }),
  titleOf({
    slug: 'small-hours',
    name: 'Small Hours',
    authors: ['Noor Vale'],
    narrators: ['Noor Vale'],
    chapterNames: ['Midnight', 'One', 'Two', 'Three', 'Dawn'],
    minutesEach: 12,
  }),
  titleOf({
    slug: 'a-field-guide-to-weather',
    name: 'A Field Guide to Weather',
    authors: ['Iris Penn', 'Tomas Hale'],
    narrators: ['Lee Archer'],
    chapterNames: ['Clouds', 'Wind', 'Rain'],
    minutesEach: 30,
  }),
]

/** The made-up shelf: three titles, nothing started, no bookmarks. */
export const sampleShelf: Shelf = {
  titles: sampleTitles,
  progress: [],
  bookmarks: [],
}

const firstBookmarkNumber = 1

const appliedWrite = (
  shelf: Shelf,
  write: LibraryWrite,
  nowMs: number,
  bookmarkNumber: number,
): Shelf =>
  M.value(write).pipe(
    M.withReturnType<Shelf>(),
    M.tagsExhaustive({
      SavePlace: ({ slug, placeMs }) => ({
        ...shelf,
        progress: [
          InProgress({ slug, placeMs, savedAtMs: nowMs }),
          ...Array.filter(shelf.progress, progress => progress.slug !== slug),
        ],
      }),
      FinishTitle: ({ slug }) => ({
        ...shelf,
        progress: [
          Finished({ slug, savedAtMs: nowMs }),
          ...Array.filter(shelf.progress, progress => progress.slug !== slug),
        ],
      }),
      AddBookmarkAt: ({ slug, atMs }) => ({
        ...shelf,
        bookmarks: Array.append(shelf.bookmarks, {
          bookmarkId: BookmarkId.make(`bookmark-${bookmarkNumber.toString()}`),
          slug,
          atMs,
          createdAtMs: nowMs,
        }),
      }),
      RemoveBookmark: ({ bookmarkId }) => ({
        ...shelf,
        bookmarks: Array.filter(
          shelf.bookmarks,
          bookmark => bookmark.bookmarkId !== bookmarkId,
        ),
      }),
    }),
  )

/** The made-up member a test library store says is signed in. */
export const sampleMemberEmail = 'listener@example.invalid'

/**
 * A library store held in memory, for tests only: it starts from `shelf`,
 * applies each write to it, sends every new shelf, and records the writes
 * in order. Every example ships on the Instant store.
 *
 * @example
 * ```typescript
 * const store = yield* makeTestLibraryStore(sampleShelf)
 * Runtime.startHandle({ program: SyncedBooks, sync, resources: Layer.mergeAll(store.layer, virtualAudioOutput, noTranscripts) })
 * ```
 */
export const makeTestLibraryStore = (
  shelf: Shelf,
  nowMs: () => number = Date.now,
) =>
  Effect.gen(function* () {
    const current = yield* SubscriptionRef.make(shelf)
    const writes = yield* SubscriptionRef.make<ReadonlyArray<LibraryWrite>>([])
    const layer = Layer.succeed(LibraryStore, {
      shelf: SubscriptionRef.changes(current),
      member: Stream.make(Option.some(sampleMemberEmail)),
      write: write =>
        Effect.gen(function* () {
          const written = yield* SubscriptionRef.get(writes)
          yield* SubscriptionRef.set(writes, Array.append(written, write))
          const before = yield* SubscriptionRef.get(current)
          yield* SubscriptionRef.set(
            current,
            appliedWrite(
              before,
              write,
              nowMs(),
              firstBookmarkNumber + written.length,
            ),
          )
        }),
    })
    return {
      layer,
      writes: SubscriptionRef.get(writes),
      shelf: SubscriptionRef.get(current),
      changes: Stream.drop(SubscriptionRef.changes(current), 1),
    }
  })

/**
 * No books read aloud and no previews, for tests of Books that do not
 * read aloud: Read Aloud's empty sources as one Layer.
 *
 * @example
 * ```typescript
 * Runtime.startHandle({ program: SyncedBooks, sync, resources: Layer.mergeAll(store.layer, virtualAudioOutput, noTranscripts, noReadAloud) })
 * ```
 */
export const noReadAloud = Layer.mergeAll(
  ReadAloud.noReadings,
  ReadAloud.noPreviews,
)
