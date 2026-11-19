import {
  Array,
  Cause,
  Effect,
  Function,
  Match as M,
  Option,
  Order,
  Queue,
  Record as Record_,
  Ref,
  Schema as S,
  Stream,
  String,
  pipe,
} from 'effect'
import { addressKeyOf, keptAddress } from 'foldkit/synchronization'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'
import { id } from '@instantdb/core'

import {
  BookmarkId,
  ChapterNumber,
  MediaId,
  Milliseconds,
  TitleSlug,
} from './ids.js'
import {
  LibraryStore,
  LibraryStoreError,
  type LibraryWrite,
} from './library.js'
import {
  type Bookmark,
  BookmarkExcerpt,
  type Chapter,
  Finished,
  InProgress,
  type Progress,
  type Shelf,
  type Title,
  wholeBookChapters,
} from './model.js'
import { titleTagStands } from './nameTags.js'

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
  id: S.String,
  title: S.String,
  authors: LinkOf(NameRow),
  narrators: LinkOf(NameRow),
  cover: LinkOf(CoverRow),
})
const RenditionRow = S.Struct({
  id: S.String,
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
  note: S.optionalKey(S.NullOr(S.String)),
  excerptJSON: S.optionalKey(S.NullOr(S.String)),
  item: LinkOf(ItemLink),
})

const ExcerptJson = S.fromJsonString(BookmarkExcerpt)

/**
 * The words a bookmark row keeps, read from its `excerptJSON`. None for a
 * row with none, or one this build cannot read.
 */
const excerptOfRow = (
  excerptJSON: string | null | undefined,
): Option.Option<BookmarkExcerpt> =>
  Option.flatMap(
    Option.fromNullishOr(excerptJSON),
    S.decodeUnknownOption(ExcerptJson),
  )

const noteOfRow = (note: string | null | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(note), String.isNonEmpty)
const LibraryData = S.Struct({
  libraryItems: S.optionalKey(S.Array(S.Unknown)),
  libraryProgress: S.optionalKey(S.Array(S.Unknown)),
  libraryBookmarks: S.optionalKey(S.Array(S.Unknown)),
})
const ChaptersData = S.Struct({
  libraryChapters: S.optionalKey(S.Array(S.Unknown)),
})

const rowsLimit = 500

const chapterRowsLimit = 2_000

/**
 * The one bounded query Books reads its shelf with: every title with its
 * people, cover, and audio, and the listener's progress and bookmarks.
 * Never the chapters: Instant answers a reactive query within 5 s or
 * fails it with "Operation timed out: handle-receive", and the chapters
 * joined through each title's book (`book: { chapters: {} }`) took it
 * 11 s for 107 titles and 4,665 chapters. They are read one title at a
 * time with {@link chaptersQueryOf}.
 */
export const titlesQuery = {
  libraryItems: {
    $: { limit: rowsLimit },
    book: {
      authors: {},
      narrators: {},
      cover: { blob: {} },
    },
    preferredAudio: { files: { blob: {} } },
  },
}

/**
 * The query for the listener's places. A place is saved about every ten
 * seconds while a title plays, and a live query hands its whole result
 * over each time a row in it changes, so the places are a query of their
 * own: a saved place sends the places, never the titles.
 */
export const placesQuery = {
  libraryProgress: { $: { limit: rowsLimit }, item: {} },
}

/** The query for the listener's bookmarks, which change when one is made. */
export const bookmarksQuery = {
  libraryBookmarks: { $: { limit: rowsLimit }, item: {} },
}

/**
 * The whole library as one query, for a read that is asked once and not
 * followed, such as a link preview's. A store that follows the library
 * asks {@link titlesQuery}, {@link placesQuery} and
 * {@link bookmarksQuery} apart.
 */
export const libraryQuery = {
  ...titlesQuery,
  ...placesQuery,
  ...bookmarksQuery,
}

/**
 * The query for one book's chapters, in the four fields a chapter reads
 * as. A hundred rows answer in well under a second. The row's `book` link
 * is not asked for: the browser's store does not return a link as a field,
 * and the query already names the book.
 *
 * @example
 * ```typescript
 * chaptersQueryOf('1202837f-801f-5351-9997-ed544c007093')
 * ```
 */
export const chaptersQueryOf = (bookId: string) => ({
  libraryChapters: {
    $: {
      where: { book: bookId },
      limit: chapterRowsLimit,
      fields: ['index', 'title', 'startMs', 'endMs'],
    },
  },
})

/** Where the library store's reads and writes land for one title. */
type IndexEntry = Readonly<{
  itemId: string
  bookId: string
  title: Title
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

// NOTE: A name tag is taken when another title has it, and when it cannot
// be a title's at all: `menu`, `session` and `profile` are Books' own
// screens' words, and the exact word opens the screen. Such a title gets
// a number, as a second title of the same name does, so its own link
// opens it.
const uniqueSlugs = (names: ReadonlyArray<string>): ReadonlyArray<TitleSlug> =>
  Array.reduce(names, Array.empty<TitleSlug>(), (taken, name) => {
    const base = slugOfName(name) || 'title'
    const isTaken = (candidate: string) =>
      Array.some(taken, slug => slug === candidate) ||
      !titleTagStands(candidate)
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

// The address this store holds for each file, by the file it names.
type HeldAddresses = ReadonlyMap<string, string>

const keptIn = (
  held: HeldAddresses,
  maybeArrived: Option.Option<string>,
  nowMs: number,
): Option.Option<string> =>
  Option.map(maybeArrived, arrived =>
    keptAddress(
      Option.fromNullishOr(held.get(addressKeyOf(arrived))),
      arrived,
      nowMs,
    ),
  )

/**
 * A decoded library whose cover and audio addresses are the ones already
 * held for those files while they still work, and the addresses now held.
 * A file store renews the signature on an address now and then; taking
 * each renewal would make every cover load again.
 */
const withKeptAddresses = (
  decoded: Decoded,
  held: HeldAddresses,
  nowMs: number,
): Readonly<{ decoded: Decoded; addresses: HeldAddresses }> => {
  const keep = (title: Title): Title => ({
    ...title,
    maybeCoverUrl: keptIn(held, title.maybeCoverUrl, nowMs),
    maybeAudioUrl: keptIn(held, title.maybeAudioUrl, nowMs),
  })
  const titles = Array.map(decoded.shelf.titles, keep)
  return {
    decoded: {
      shelf: { ...decoded.shelf, titles },
      index: new Map(
        Array.map([...decoded.index], ([slug, entry]) => [
          slug,
          { ...entry, title: keep(entry.title) },
        ]),
      ),
    },
    addresses: new Map(
      Array.map(
        Array.getSomes(
          Array.flatMap(titles, title => [
            title.maybeCoverUrl,
            title.maybeAudioUrl,
          ]),
        ),
        address => [addressKeyOf(address), address] as const,
      ),
    ),
  }
}

const firstUrlOf = (
  blobs: ReadonlyArray<typeof BlobRow.Type>,
): Option.Option<string> => Option.map(Array.head(blobs), blob => blob.url)

/**
 * One title's chapters as one chapters query gives them: in index order,
 * numbered from one, or the whole book as one section when the title has
 * none. A row that does not decode is left out.
 *
 * @example
 * ```typescript
 * decodeChapters(data, title) // [{ chapterNumber: 1, name: 'The Tide', startMs: 0, endMs: 1_200_000 }, …]
 * ```
 */
export const decodeChapters = (
  data: unknown,
  title: Title,
): Array.NonEmptyReadonlyArray<Chapter> => {
  const tables: typeof ChaptersData.Type = Option.getOrElse(
    S.decodeUnknownOption(ChaptersData)(data),
    () => ({}),
  )
  const chapters = pipe(
    decodeAll(ChapterRow, tables.libraryChapters),
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
  return Array.match(chapters, {
    onEmpty: () => wholeBookChapters(title.name, title.durationMs),
    onNonEmpty: Function.identity,
  })
}

const titleOfItem = (
  item: typeof ItemRow.Type,
  slug: TitleSlug,
): Option.Option<Readonly<{ title: Title; bookId: string }>> =>
  Option.flatMap(Array.head(linkedOf(item.book)), book => {
    const maybeRendition = Array.head(linkedOf(item.preferredAudio))
    const durationMs = Option.getOrElse(
      Option.flatMap(maybeRendition, rendition =>
        Option.fromNullishOr(rendition.durationMs),
      ),
      () => 0,
    )
    return Option.some({
      bookId: book.id,
      title: {
        slug,
        mediaId: MediaId.make(
          Option.getOrElse(
            Option.map(maybeRendition, rendition => rendition.id),
            () => slug,
          ),
        ),
        name: book.title,
        authors: Array.map(linkedOf(book.authors), author => author.name),
        narrators: Array.map(
          linkedOf(book.narrators),
          narrator => narrator.name,
        ),
        durationMs: Milliseconds.make(Math.max(0, Math.round(durationMs))),
        maybeCoverUrl: Option.flatMap(Array.head(linkedOf(book.cover)), cover =>
          firstUrlOf(linkedOf(cover.blob)),
        ),
        maybeAudioUrl: Option.flatMap(maybeRendition, rendition =>
          Option.flatMap(Array.head(linkedOf(rendition.files)), file =>
            firstUrlOf(linkedOf(file.blob)),
          ),
        ),
      },
    })
  })

const finishedKind = 'finished'

const unfinishedKind = 'unfinished'

const isFinishedKind = (kind: string): boolean =>
  kind.toLowerCase() === finishedKind

/**
 * The shelf one library query gives: every title, the listener's newest
 * progress per title, and their bookmarks. A row that does not decode is
 * left out instead of breaking the shelf.
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
      Option.map(titleOfItem(item, slug), ({ title, bookId }) => ({
        item,
        title,
        bookId,
      })),
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
      isFinishedKind(row.finishedKind)
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
          maybeNote: noteOfRow(row.note),
          maybeExcerpt: excerptOfRow(row.excerptJSON),
        })),
      ),
    ),
  )
  const index = new Map(
    Array.map(titled, ({ item, title, bookId }) => {
      const maybeProgress = Option.map(
        Array.findFirst(newestProgress, ({ slug }) => slug === title.slug),
        ({ row }) => ({ progressId: row.id, startedAtMs: row.startedAtMs }),
      )
      return [
        title.slug,
        { itemId: item.id, bookId, title, maybeProgress },
      ] as const
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

const QueryError = S.Struct({ message: S.String })

const unreadable = 'the library could not be read'

const queryErrorReason = (error: unknown): string =>
  Option.match(S.decodeUnknownOption(QueryError)(error), {
    onNone: () => unreadable,
    onSome: ({ message }) => `${unreadable}: ${message}`,
  })

type QueryResponse = Readonly<{ error?: unknown; data?: unknown }>

/**
 * One reactive query on the database as a Stream of what it decodes to:
 * it fails with Instant's own words when the query cannot be answered.
 */
const observed = <A>(
  database: ProgramLogDatabase,
  query: Parameters<ProgramLogDatabase['subscribeQuery']>[0],
  decode: (data: unknown) => A,
): Stream.Stream<A, LibraryStoreError> =>
  Stream.callback<A, LibraryStoreError>(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        database.subscribeQuery(query, (response: QueryResponse) => {
          if (response.error !== undefined) {
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(
                new LibraryStoreError({
                  reason: queryErrorReason(response.error),
                }),
              ),
            )
          } else {
            Queue.offerUnsafe(queue, decode(response.data))
          }
        }),
      ),
      unsubscribe => Effect.sync(unsubscribe),
    ),
  )

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
        hiddenKind: 'visible',
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
 * device, a title's chapters are one small query while asked for, and
 * each write is one transaction owned by the signed-in member. The app's
 * rules decide what the member reads: their own library and the ones they
 * were invited to, never anyone else's progress.
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
      // NOTE: Three live queries, by how often each changes, joined into
      // the one shelf: the first shelf is sent once all three have
      // answered, then again whenever one of them does. Each title's
      // cover and audio address is the one this store already holds for
      // that file while it still works, so a renewed signature changes
      // nothing a Client sees and loads nothing again.
      const held = Effect.runSync(Ref.make<HeldAddresses>(new Map()))
      const rowsIn = (table: string) => (data: unknown) =>
        Option.getOrElse(
          Option.flatMap(
            S.decodeUnknownOption(S.Record(S.String, S.Unknown))(data),
            tables => Record_.get(tables, table),
          ),
          (): unknown => [],
        )
      const shelf = Stream.zipLatestAll(
        observed(database, titlesQuery, rowsIn('libraryItems')),
        observed(database, placesQuery, rowsIn('libraryProgress')),
        observed(database, bookmarksQuery, rowsIn('libraryBookmarks')),
      ).pipe(
        Stream.map(([libraryItems, libraryProgress, libraryBookmarks]) =>
          decodeLibrary({ libraryItems, libraryProgress, libraryBookmarks }),
        ),
        Stream.mapEffect(decoded =>
          Ref.modify(held, addresses => {
            const kept = withKeptAddresses(decoded, addresses, Date.now())
            return [kept.decoded, kept.addresses]
          }),
        ),
        Stream.tap(decoded => Ref.set(latest, decoded)),
        Stream.map(decoded => decoded.shelf),
      )

      const chapters = (slug: TitleSlug) =>
        Stream.unwrap(
          Effect.map(
            Effect.flatMap(Ref.get(latest), decoded => entryFor(decoded, slug)),
            entry =>
              observed(database, chaptersQueryOf(entry.bookId), data =>
                decodeChapters(data, entry.title),
              ),
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
                    finishedKind: unfinishedKind,
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
            AddBookmarkAt: ({
              slug,
              atMs,
              maybeNote,
              maybeExcerpt,
              maybeCreatedAtMs,
            }) =>
              Effect.flatMap(entryFor(decoded, slug), entry =>
                Effect.map(tableOf(database, 'libraryBookmarks', id()), row => [
                  row
                    .update({
                      ownerUserID: owner,
                      formatVersion: 1,
                      markKind: 'place',
                      relativeMs: atMs,
                      createdAtMs: Option.getOrElse(maybeCreatedAtMs, () =>
                        Date.now(),
                      ),
                      ...Option.match(maybeNote, {
                        onNone: () => ({}),
                        onSome: note => ({ note }),
                      }),
                      ...Option.match(maybeExcerpt, {
                        onNone: () => ({}),
                        onSome: excerpt => ({
                          excerptJSON: S.encodeSync(ExcerptJson)(excerpt),
                        }),
                      }),
                    })
                    .link({ item: entry.itemId }),
                ]),
              ),
            NoteBookmark: ({ bookmarkId, maybeNote }) =>
              Effect.map(
                tableOf(database, 'libraryBookmarks', bookmarkId),
                row => [
                  row.update({ note: Option.getOrElse(maybeNote, () => '') }),
                ],
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

      const member = Stream.callback<Option.Option<string>>(queue =>
        Effect.acquireRelease(
          Effect.sync(() =>
            database.subscribeAuth(auth => {
              Queue.offerUnsafe(
                queue,
                Option.fromNullishOr(auth.user?.email ?? undefined),
              )
            }),
          ),
          unsubscribe => Effect.sync(unsubscribe),
        ),
      )
      return LibraryStore.of({ shelf, chapters, member, write })
    },
  )
