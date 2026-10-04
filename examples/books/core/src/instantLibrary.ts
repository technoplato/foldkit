import {
  Array,
  Cause,
  Effect,
  Match as M,
  Option,
  Order,
  Queue,
  Ref,
  Schema as S,
  Stream,
  String,
  pipe,
} from 'effect'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'
import { id } from '@instantdb/core'

import { BookmarkId, ChapterNumber, Milliseconds, TitleSlug } from './ids.js'
import {
  LibraryStore,
  LibraryStoreError,
  type LibraryWrite,
} from './library.js'
import {
  type Bookmark,
  type Chapter,
  Finished,
  InProgress,
  type Progress,
  type Shelf,
  type Title,
} from './model.js'

// ROWS

const LinkOf = <A extends S.Top>(row: A) =>
  S.optionalKey(S.Union([S.Array(row), row]))

const linkedOf = <A>(
  link: A | ReadonlyArray<A> | undefined,
): ReadonlyArray<A> => (link === undefined ? [] : Array.ensure(link))

const NameRow = S.Struct({ name: S.String })
const BlobRow = S.Struct({ url: S.String })
const ChapterRow = S.Struct({
  index: S.Number,
  title: S.String,
  startMs: S.Number,
  endMs: S.Number,
})
const FileRow = S.Struct({ blob: LinkOf(BlobRow) })
const CoverRow = S.Struct({ blob: LinkOf(BlobRow) })
const BookRow = S.Struct({
  title: S.String,
  authors: LinkOf(NameRow),
  narrators: LinkOf(NameRow),
  chapters: LinkOf(ChapterRow),
  cover: LinkOf(CoverRow),
})
const RenditionRow = S.Struct({
  durationMs: S.optionalKey(S.Number),
  files: LinkOf(FileRow),
})
const ItemRow = S.Struct({
  id: S.String,
  addedAtMs: S.Number,
  book: LinkOf(BookRow),
  preferredAudio: LinkOf(RenditionRow),
})
const ItemLink = S.Struct({ id: S.String })
const ProgressRow = S.Struct({
  id: S.String,
  relativeMs: S.Number,
  finishedKind: S.String,
  startedAtMs: S.Number,
  updatedAtMs: S.Number,
  item: LinkOf(ItemLink),
})
const BookmarkRow = S.Struct({
  id: S.String,
  relativeMs: S.optionalKey(S.Number),
  createdAtMs: S.Number,
  item: LinkOf(ItemLink),
})
const LibraryData = S.Struct({
  libraryItems: S.optionalKey(S.Array(S.Unknown)),
  libraryProgress: S.optionalKey(S.Array(S.Unknown)),
  libraryBookmarks: S.optionalKey(S.Array(S.Unknown)),
})

const rowsLimit = 500

/** The one bounded query Books reads its library with. */
export const libraryQuery = {
  libraryItems: {
    $: { limit: rowsLimit },
    book: {
      authors: {},
      narrators: {},
      chapters: {},
      cover: { blob: {} },
    },
    preferredAudio: { files: { blob: {} } },
  },
  libraryProgress: { $: { limit: rowsLimit }, item: {} },
  libraryBookmarks: { $: { limit: rowsLimit }, item: {} },
}

/** Where the library store's writes land for one title. */
type IndexEntry = Readonly<{
  itemId: string
  maybeProgress: Option.Option<
    Readonly<{ progressId: string; startedAtMs: number }>
  >
}>

/** A decoded shelf and how to find each title's rows again. */
type Decoded = Readonly<{
  shelf: Shelf
  index: ReadonlyMap<TitleSlug, IndexEntry>
}>

const decodeAll = <A>(
  schema: S.Decoder<A>,
  rows: ReadonlyArray<unknown> | undefined,
): ReadonlyArray<A> =>
  Array.getSomes(
    Array.map(rows ?? [], row => S.decodeUnknownOption(schema)(row)),
  )

const slugOfName = (name: string): string =>
  pipe(
    name.toLowerCase().normalize('NFKD'),
    String.replace(/[^a-z0-9]+/g, '-'),
    String.replace(/^-+|-+$/g, ''),
  )

const uniqueSlugs = (names: ReadonlyArray<string>): ReadonlyArray<TitleSlug> =>
  Array.reduce(names, Array.empty<TitleSlug>(), (taken, name) => {
    const base = slugOfName(name) || 'title'
    const isTaken = (candidate: string) =>
      Array.some(taken, slug => slug === candidate)
    const next = isTaken(base)
      ? Option.getOrElse(
          Array.findFirst(
            Array.range(2, taken.length + 2),
            number => !isTaken(`${base}-${number.toString()}`),
          ),
          () => taken.length + 2,
        )
      : 0
    return Array.append(
      taken,
      TitleSlug.make(next === 0 ? base : `${base}-${next.toString()}`),
    )
  })

const firstUrlOf = (
  blobs: ReadonlyArray<typeof BlobRow.Type>,
): Option.Option<string> => Option.map(Array.head(blobs), blob => blob.url)

const titleOfItem = (
  item: typeof ItemRow.Type,
  slug: TitleSlug,
): Option.Option<Title> =>
  Option.flatMap(Array.head(linkedOf(item.book)), book => {
    const chapters = pipe(
      linkedOf(book.chapters),
      Array.sort(
        Order.mapInput(
          Order.Number,
          (chapter: typeof ChapterRow.Type) => chapter.index,
        ),
      ),
      Array.map((chapter, position) => ({
        chapterNumber: ChapterNumber.make(position + 1),
        name: chapter.title,
        startMs: Milliseconds.make(Math.max(0, Math.round(chapter.startMs))),
        endMs: Milliseconds.make(Math.max(0, Math.round(chapter.endMs))),
      })),
    )
    const maybeRendition = Array.head(linkedOf(item.preferredAudio))
    const durationMs = Option.getOrElse(
      Option.flatMap(maybeRendition, rendition =>
        Option.fromNullishOr(rendition.durationMs),
      ),
      () =>
        Option.getOrElse(
          Option.map(Array.last(chapters), chapter => chapter.endMs),
          () => 0,
        ),
    )
    const maybeChapters = Array.match(chapters, {
      onEmpty: () => Option.none<Array.NonEmptyReadonlyArray<Chapter>>(),
      onNonEmpty: Option.some,
    })
    return pipe(
      maybeChapters,
      Option.map(nonEmptyChapters => ({
        slug,
        name: book.title,
        authors: Array.map(linkedOf(book.authors), author => author.name),
        narrators: Array.map(
          linkedOf(book.narrators),
          narrator => narrator.name,
        ),
        durationMs: Milliseconds.make(Math.max(0, Math.round(durationMs))),
        chapters: nonEmptyChapters,
        maybeCoverUrl: Option.flatMap(Array.head(linkedOf(book.cover)), cover =>
          firstUrlOf(linkedOf(cover.blob)),
        ),
        maybeAudioUrl: Option.flatMap(maybeRendition, rendition =>
          Option.flatMap(Array.head(linkedOf(rendition.files)), file =>
            firstUrlOf(linkedOf(file.blob)),
          ),
        ),
      })),
    )
  })

const finishedKind = 'Finished'

/**
 * The shelf one library query gives: every title with chapters, the
 * listener's newest progress per title, and their bookmarks. A row that
 * does not decode is left out instead of breaking the shelf.
 */
export const decodeLibrary = (data: unknown): Decoded => {
  const tables: typeof LibraryData.Type = Option.getOrElse(
    S.decodeUnknownOption(LibraryData)(data),
    () => ({}),
  )
  const items = pipe(
    decodeAll(ItemRow, tables.libraryItems),
    Array.sort(
      Order.mapInput(
        Order.Number,
        (item: typeof ItemRow.Type) => item.addedAtMs,
      ),
    ),
  )
  const names = Array.map(items, item =>
    Option.getOrElse(
      Option.map(Array.head(linkedOf(item.book)), book => book.title),
      () => 'title',
    ),
  )
  const slugs = uniqueSlugs(names)
  const titled = Array.getSomes(
    Array.map(Array.zip(items, slugs), ([item, slug]) =>
      Option.map(titleOfItem(item, slug), title => ({ item, title })),
    ),
  )
  const slugOfItem = new Map(
    Array.map(titled, ({ item, title }) => [item.id, title.slug] as const),
  )
  const itemIdOf = (link: (typeof ProgressRow.Type)['item']) =>
    Array.head(linkedOf(link)).pipe(Option.map(item => item.id))
  const progressRows = pipe(
    decodeAll(ProgressRow, tables.libraryProgress),
    Array.sort(
      Order.mapInput(
        Order.flip(Order.Number),
        (row: typeof ProgressRow.Type) => row.updatedAtMs,
      ),
    ),
  )
  const newestProgress = Array.dedupeWith(
    Array.getSomes(
      Array.map(progressRows, row =>
        Option.flatMap(itemIdOf(row.item), itemId =>
          Option.map(Option.fromNullishOr(slugOfItem.get(itemId)), slug => ({
            row,
            slug,
          })),
        ),
      ),
    ),
    (self, that) => self.slug === that.slug,
  )
  const progress: ReadonlyArray<Progress> = Array.map(
    newestProgress,
    ({ row, slug }) =>
      row.finishedKind === finishedKind
        ? Finished({ slug, savedAtMs: row.updatedAtMs })
        : InProgress({
            slug,
            placeMs: Milliseconds.make(Math.max(0, Math.round(row.relativeMs))),
            savedAtMs: row.updatedAtMs,
          }),
  )
  const bookmarks: ReadonlyArray<Bookmark> = Array.getSomes(
    Array.map(decodeAll(BookmarkRow, tables.libraryBookmarks), row =>
      Option.flatMap(itemIdOf(row.item), itemId =>
        Option.map(Option.fromNullishOr(slugOfItem.get(itemId)), slug => ({
          bookmarkId: BookmarkId.make(row.id),
          slug,
          atMs: Milliseconds.make(Math.max(0, Math.round(row.relativeMs ?? 0))),
          createdAtMs: row.createdAtMs,
        })),
      ),
    ),
  )
  const index = new Map(
    Array.map(titled, ({ item, title }) => {
      const maybeProgress = Option.map(
        Array.findFirst(newestProgress, ({ slug }) => slug === title.slug),
        ({ row }) => ({ progressId: row.id, startedAtMs: row.startedAtMs }),
      )
      return [title.slug, { itemId: item.id, maybeProgress }] as const
    }),
  )
  return {
    shelf: {
      titles: Array.map(titled, ({ title }) => title),
      progress,
      bookmarks,
    },
    index,
  }
}

// STORE

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : 'the library store refused it'

const ownerOf = (database: ProgramLogDatabase) =>
  Effect.flatMap(
    Effect.tryPromise({
      try: () => database.getAuth(),
      catch: cause => new LibraryStoreError({ reason: reasonOf(cause) }),
    }),
    maybeUser =>
      Option.match(Option.fromNullishOr(maybeUser), {
        onNone: () =>
          Effect.fail(
            new LibraryStoreError({ reason: 'sign in to save your library' }),
          ),
        onSome: user => Effect.succeed(user.id),
      }),
  )

type TransactionStep = Parameters<ProgramLogDatabase['transact']>[0]

const transacted = (
  database: ProgramLogDatabase,
  steps: Extract<TransactionStep, ReadonlyArray<unknown>>,
) =>
  Effect.tryPromise({
    try: () => database.transact(steps),
    catch: cause => new LibraryStoreError({ reason: reasonOf(cause) }),
  })

const entryFor = (decoded: Decoded, slug: TitleSlug) =>
  Option.match(Option.fromNullishOr(decoded.index.get(slug)), {
    onNone: () =>
      Effect.fail(
        new LibraryStoreError({ reason: 'that title is not in the library' }),
      ),
    onSome: entry => Effect.succeed(entry),
  })

const tableOf = (database: ProgramLogDatabase, table: string, rowId: string) =>
  Option.match(Option.fromNullishOr(database.tx[table]?.[rowId]), {
    onNone: () =>
      Effect.fail(
        new LibraryStoreError({ reason: `the library has no ${table} table` }),
      ),
    onSome: row => Effect.succeed(row),
  })

const progressStep = (
  database: ProgramLogDatabase,
  owner: string,
  entry: IndexEntry,
  fields: Readonly<Record<string, unknown>>,
) => {
  const nowMs = Date.now()
  const progressId = Option.match(entry.maybeProgress, {
    onNone: () => id(),
    onSome: progress => progress.progressId,
  })
  const startedAtMs = Option.match(entry.maybeProgress, {
    onNone: () => nowMs,
    onSome: progress => progress.startedAtMs,
  })
  return Effect.map(tableOf(database, 'libraryProgress', progressId), row =>
    row
      .update({
        ownerUserID: owner,
        formatVersion: 1,
        hiddenKind: 'Visible',
        startedAtMs,
        updatedAtMs: nowMs,
        ...fields,
      })
      .link({ item: entry.itemId }),
  )
}

/**
 * The library store on an Instant app with the universal library schema:
 * the shelf is one bounded query, sent again on every change from any
 * device, and each write is one transaction owned by the signed-in
 * member. The app's rules decide what the member reads: their own library
 * and the ones they were invited to, never anyone else's progress.
 *
 * @example
 * ```typescript
 * Layer.effect(LibraryStore, makeInstantLibraryStore(database))
 * ```
 */
export const makeInstantLibraryStore = (database: ProgramLogDatabase) =>
  Effect.map(
    Ref.make<Decoded>({
      shelf: { titles: [], progress: [], bookmarks: [] },
      index: new Map(),
    }),
    latest => {
      const shelf = Stream.callback<Shelf, LibraryStoreError>(queue =>
        Effect.acquireRelease(
          Effect.sync(() =>
            database.subscribeQuery(
              libraryQuery,
              (response: Readonly<{ error?: unknown; data?: unknown }>) => {
                if (response.error !== undefined) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new LibraryStoreError({
                        reason: 'the library could not be read',
                      }),
                    ),
                  )
                } else {
                  const decoded = decodeLibrary(response.data)
                  Effect.runSync(Ref.set(latest, decoded))
                  Queue.offerUnsafe(queue, decoded.shelf)
                }
              },
            ),
          ),
          unsubscribe => Effect.sync(unsubscribe),
        ),
      )

      const stepsFor = (write: LibraryWrite, owner: string, decoded: Decoded) =>
        M.value(write).pipe(
          M.tagsExhaustive({
            SavePlace: ({ slug, placeMs }) =>
              Effect.flatMap(entryFor(decoded, slug), entry =>
                Effect.map(
                  progressStep(database, owner, entry, {
                    relativeMs: placeMs,
                    finishedKind: 'Listening',
                  }),
                  Array.of,
                ),
              ),
            FinishTitle: ({ slug }) =>
              Effect.flatMap(entryFor(decoded, slug), entry =>
                Effect.map(
                  progressStep(database, owner, entry, {
                    relativeMs: 0,
                    finishedKind,
                    finishedAtMs: Date.now(),
                  }),
                  Array.of,
                ),
              ),
            AddBookmarkAt: ({ slug, atMs }) =>
              Effect.flatMap(entryFor(decoded, slug), entry =>
                Effect.map(tableOf(database, 'libraryBookmarks', id()), row => [
                  row
                    .update({
                      ownerUserID: owner,
                      formatVersion: 1,
                      markKind: 'Place',
                      relativeMs: atMs,
                      createdAtMs: Date.now(),
                    })
                    .link({ item: entry.itemId }),
                ]),
              ),
            RemoveBookmark: ({ bookmarkId }) =>
              Effect.map(
                tableOf(database, 'libraryBookmarks', bookmarkId),
                row => [row.delete()],
              ),
          }),
        )

      const write = (libraryWrite: LibraryWrite) =>
        Effect.gen(function* () {
          const owner = yield* ownerOf(database)
          const decoded = yield* Ref.get(latest)
          const steps = yield* stepsFor(libraryWrite, owner, decoded)
          yield* transacted(database, steps)
        })

      return LibraryStore.of({ shelf, write })
    },
  )
