import {
  Array,
  Function,
  Match as M,
  Option,
  Order,
  Record,
  Schema as S,
  String,
  pipe,
} from 'effect'

import {
  BookId,
  BookKey,
  Isbn13,
  PageNumber,
  ReadingId,
  TurnId,
  contributorKeyOf,
  publisherKeyOf,
} from './ids.js'
import {
  type Book,
  type BookLink,
  type Credit,
  CreditRole,
  type PageTurn,
  type Publisher,
  type Readings,
} from './model.js'

// SCRIBE

const maybe = <Value extends S.Top>(schema: Value) =>
  S.optionalKey(S.NullOr(schema))

/**
 * One line of Scribe's `things` log, or one `things` row in Instant: a
 * thing someone has, such as a book, or a person or publisher its things
 * graph keeps, with what Scribe found about it. Only the fields Read Aloud
 * reads; the rest, such as the owner and a person's contact points, are
 * dropped on decode.
 */
export const ThingRow = S.Struct({
  id: S.String,
  kind: S.String,
  status: maybe(S.String),
  scope: maybe(S.String),
  title: S.String,
  imageURL: maybe(S.String),
  metadataJSON: maybe(S.String),
  externalIDsJSON: maybe(S.String),
  updatedAtMs: S.Number,
  lastRecognizedAtMs: maybe(S.Number),
})
/** One line of Scribe's `things` log. */
export type ThingRow = typeof ThingRow.Type

/**
 * One line of Scribe's `recognitions` log, or one `recordingRecognitions`
 * row in Instant: Scribe recognizing a thing in a recording, such as a
 * book being read, with the pages it spans. Only the fields Read Aloud
 * reads; what was heard, the evidence, and the recording are dropped on
 * decode.
 */
export const RecognitionRow = S.Struct({
  id: S.String,
  thingID: S.String,
  thingKind: S.String,
  thingRangeStart: maybe(S.Number),
  thingRangeEnd: maybe(S.Number),
  thingRangeUnit: maybe(S.String),
  isOngoing: S.Boolean,
  startedAtMs: S.Number,
  updatedAtMs: S.Number,
  review: maybe(S.String),
  detailJSON: maybe(S.String),
})
/** One line of Scribe's `recognitions` log. */
export type RecognitionRow = typeof RecognitionRow.Type

/**
 * One line of Scribe's things graph `relations` log, or one
 * `thingRelations` row in Instant: one thing's tie to another, such as a
 * person who illustrated a book (`illustratorOf`). Only the fields Read
 * Aloud reads; the evidence, the lines it came from, and who wrote it are
 * dropped on decode.
 */
export const RelationRow = S.Struct({
  id: S.String,
  subjectID: S.String,
  predicate: S.String,
  objectID: S.String,
  qualifiersJSON: maybe(S.String),
  certainty: S.String,
  status: S.String,
  review: maybe(S.String),
  scope: maybe(S.String),
  updatedAtMs: S.Number,
})
/** One line of Scribe's things graph `relations` log. */
export type RelationRow = typeof RelationRow.Type

const ThingMetadata = S.Struct({
  authors: maybe(S.Array(S.String)),
  publishers: maybe(S.Array(S.String)),
  publishDate: maybe(S.String),
  pageCount: maybe(S.Number),
  whereToBuy: maybe(S.Array(S.Unknown)),
})

const noMetadata: typeof ThingMetadata.Type = {}

const RelationQualifiers = S.Struct({ role: maybe(S.String) })

const WhereToBuy = S.Struct({
  label: S.String,
  url: S.String,
  verified: maybe(S.Boolean),
  rank: maybe(S.Number),
})
type WhereToBuy = typeof WhereToBuy.Type

const ThingExternalIds = S.Struct({ isbn13: maybe(S.String) })

const PageDetail = S.Struct({
  kind: S.Literal('page'),
  page: S.Number,
  readingID: S.String,
})
type PageDetail = typeof PageDetail.Type

const ReadingDetail = S.Struct({
  pageMarks: maybe(S.Array(S.Struct({ page: S.String }))),
  reached: maybe(S.Struct({ atMs: maybe(S.Number) })),
})
type ReadingDetail = typeof ReadingDetail.Type

const ofJsonText =
  <Value>(decode: (input: unknown) => Option.Option<Value>) =>
  (text: string | null | undefined): Option.Option<Value> =>
    Option.flatMap(Option.fromNullishOr(text), decode)

const metadataOf = ofJsonText(
  S.decodeUnknownOption(S.fromJsonString(ThingMetadata)),
)
const externalIdsOf = ofJsonText(
  S.decodeUnknownOption(S.fromJsonString(ThingExternalIds)),
)
const pageDetailOf = ofJsonText(
  S.decodeUnknownOption(S.fromJsonString(PageDetail)),
)
const readingDetailOf = ofJsonText(
  S.decodeUnknownOption(S.fromJsonString(ReadingDetail)),
)
const qualifiersOf = ofJsonText(
  S.decodeUnknownOption(S.fromJsonString(RelationQualifiers)),
)

const decodeJsonLine = S.decodeUnknownOption(S.UnknownFromJsonString)

const decodeThingRow = S.decodeUnknownOption(ThingRow)

const decodeRecognitionRow = S.decodeUnknownOption(RecognitionRow)

const decodeRelationRow = S.decodeUnknownOption(RelationRow)

const decodeWhereToBuy = S.decodeUnknownOption(WhereToBuy)

/**
 * The rows of a JSON Lines log: one value per line that parses, so a line
 * Scribe is still writing, or any line that is not JSON, is skipped.
 *
 * @example
 * ```typescript
 * rowsOfLines('{"id":"a"}\n{"id":\n') // [{ id: 'a' }]
 * ```
 */
export const rowsOfLines = (text: string): ReadonlyArray<unknown> =>
  pipe(
    String.split(text, '\n'),
    Array.map(line => String.trim(line)),
    Array.filter(String.isNonEmpty),
    Array.map(line => decodeJsonLine(line)),
    Array.getSomes,
  )

/** The rows that decode as things, in log order. */
export const thingRowsOf = (
  values: ReadonlyArray<unknown>,
): ReadonlyArray<ThingRow> =>
  Array.getSomes(Array.map(values, value => decodeThingRow(value)))

/** The rows that decode as recognitions, in log order. */
export const recognitionRowsOf = (
  values: ReadonlyArray<unknown>,
): ReadonlyArray<RecognitionRow> =>
  Array.getSomes(Array.map(values, value => decodeRecognitionRow(value)))

/** The rows that decode as relations, in log order. */
export const relationRowsOf = (
  values: ReadonlyArray<unknown>,
): ReadonlyArray<RelationRow> =>
  Array.getSomes(Array.map(values, value => decodeRelationRow(value)))

/**
 * The newest version of every row: Scribe appends a whole row each time it
 * changes one, so the row with the latest `updatedAtMs` wins, and a later
 * line wins a tie.
 */
export const newestById = <
  Row extends Readonly<{ id: string; updatedAtMs: number }>,
>(
  rows: ReadonlyArray<Row>,
): ReadonlyArray<Row> =>
  pipe(
    Array.groupBy(rows, row => row.id),
    Record.values,
    Array.map(group =>
      Array.reduce(group, Array.headNonEmpty(group), (newest, row) =>
        row.updatedAtMs >= newest.updatedAtMs ? row : newest,
      ),
    ),
  )

const yearPattern = /\b(\d{4})\b/u

const yearOf = (publishDate: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(yearPattern.exec(publishDate)), match =>
    Array.get(match, 1),
  )

const isSecureUrl = (url: string): boolean => url.startsWith('https://')

const byRank = Order.mapInput(
  Order.Number,
  (entry: WhereToBuy) => entry.rank ?? Number.MAX_SAFE_INTEGER,
)

const linksOf = (whereToBuy: ReadonlyArray<unknown>): ReadonlyArray<BookLink> =>
  pipe(
    whereToBuy,
    Array.map(entry => decodeWhereToBuy(entry)),
    Array.getSomes,
    Array.filter(entry => isSecureUrl(entry.url)),
    Array.sort(byRank),
    Array.map(entry => ({
      label: entry.label,
      url: entry.url,
      isVerified: entry.verified === true,
    })),
  )

const isActive = (row: ThingRow): boolean =>
  row.status === undefined || row.status === null || row.status === 'active'

const keyOf = (
  bookId: BookId,
  maybeIsbn13: Option.Option<Isbn13>,
): Option.Option<BookKey> =>
  Option.orElse(
    Option.flatMap(maybeIsbn13, S.decodeUnknownOption(BookKey)),
    () => S.decodeUnknownOption(BookKey)(bookId),
  )

const isWorld = (scope: string | null | undefined): boolean =>
  scope !== 'personal'

const authorCreditOf = (name: string): Option.Option<Credit> =>
  Option.map(contributorKeyOf(name), key => ({
    role: 'Author',
    contributor: { key, name: String.trim(name) },
  }))

const publisherNamed = (name: string): Option.Option<Publisher> =>
  Option.map(publisherKeyOf(name), key => ({ key, name: String.trim(name) }))

const isSameCredit = (self: Credit, that: Credit): boolean =>
  self.role === that.role && self.contributor.key === that.contributor.key

const isSamePublisher = (self: Publisher, that: Publisher): boolean =>
  self.key === that.key

/**
 * The book a `things` row describes, when it is an active book Read Aloud
 * can name in an address: by its ISBN-13, else by its id. It credits the
 * authors the catalog lists and the first publisher it lists, since the
 * catalog often lists one publisher under several names; the things graph
 * replaces either when it keeps the book's own credits.
 */
export const bookOfThing = (row: ThingRow): Option.Option<Book> => {
  const metadata = Option.getOrElse(
    metadataOf(row.metadataJSON),
    () => noMetadata,
  )
  const maybeIsbn13 = Option.flatMap(
    Option.flatMap(externalIdsOf(row.externalIDsJSON), ids =>
      Option.fromNullishOr(ids.isbn13),
    ),
    S.decodeUnknownOption(Isbn13),
  )
  return pipe(
    Option.liftPredicate(
      row,
      thing => thing.kind === 'book' && isActive(thing),
    ),
    Option.flatMap(thing => S.decodeUnknownOption(BookId)(thing.id)),
    Option.flatMap(bookId =>
      Option.map(keyOf(bookId, maybeIsbn13), key => ({
        bookId,
        key,
        maybeIsbn13,
        title: row.title,
        credits: pipe(
          metadata.authors ?? [],
          Array.map(authorCreditOf),
          Array.getSomes,
          Array.dedupeWith(isSameCredit),
        ),
        publishedBy: pipe(
          metadata.publishers ?? [],
          Array.map(publisherNamed),
          Array.getSomes,
          Array.take(1),
        ),
        maybePublishYear: Option.flatMap(
          Option.fromNullishOr(metadata.publishDate),
          yearOf,
        ),
        maybePageCount: Option.flatMap(
          Option.fromNullishOr(metadata.pageCount),
          S.decodeUnknownOption(PageNumber),
        ),
        maybeCoverUrl: Option.filter(
          Option.fromNullishOr(row.imageURL),
          isSecureUrl,
        ),
        links: linksOf(metadata.whereToBuy ?? []),
      })),
    ),
  )
}

const isCreditedThing = (row: ThingRow): boolean =>
  row.kind === 'person' || row.kind === 'organization'

/**
 * The people and publishers in the things graph's own `things` log: the
 * names its credits point at. Never its books: a book the graph keeps
 * there was mentioned, not read aloud.
 *
 * @example
 * ```typescript
 * creditedThingsOf(thingRowsOf(rowsOfLines(graphThings))) // [Ada Quill (person), Harbor House (organization)]
 * ```
 */
export const creditedThingsOf = (
  rows: ReadonlyArray<ThingRow>,
): ReadonlyArray<ThingRow> => Array.filter(rows, isCreditedThing)

const inCreditsOrder = (
  credits: ReadonlyArray<Credit>,
): ReadonlyArray<Credit> =>
  Array.flatMap(CreditRole.literals, role =>
    Array.filter(credits, credit => credit.role === role),
  )

const editorRole = 'editor'

const isEditing = (relation: RelationRow): boolean =>
  Option.exists(qualifiersOf(relation.qualifiersJSON), qualifiers =>
    Option.exists(
      Option.fromNullishOr(qualifiers.role),
      role => String.toLowerCase(String.trim(role)) === editorRole,
    ),
  )

const roleOf = (relation: RelationRow): Option.Option<CreditRole> =>
  M.value(relation.predicate).pipe(
    M.withReturnType<Option.Option<CreditRole>>(),
    M.when('authorOf', () => Option.some('Author')),
    M.when('illustratorOf', () => Option.some('Illustrator')),
    M.when('contributedTo', () =>
      isEditing(relation) ? Option.some('Editor') : Option.none(),
    ),
    M.orElse(() => Option.none()),
  )

const isShown = (relation: RelationRow): boolean =>
  relation.status === 'active' &&
  relation.review !== 'rejected' &&
  relation.certainty !== 'candidate' &&
  isWorld(relation.scope)

type Graph = Readonly<{
  named: ReadonlyArray<ThingRow>
  relations: ReadonlyArray<RelationRow>
}>

const graphOf = (
  thingRows: ReadonlyArray<ThingRow>,
  relationRows: ReadonlyArray<RelationRow>,
): Graph => ({
  named: Array.filter(
    newestById(thingRows),
    row => isCreditedThing(row) && isActive(row) && isWorld(row.scope),
  ),
  relations: Array.filter(newestById(relationRows), isShown),
})

const namedOf = (
  graph: Graph,
  id: string,
  kinds: ReadonlyArray<string>,
): Option.Option<ThingRow> =>
  Array.findFirst(
    graph.named,
    row => row.id === id && Array.contains(kinds, row.kind),
  )

const relationsTo = (graph: Graph, book: Book): ReadonlyArray<RelationRow> =>
  Array.filter(graph.relations, relation => relation.objectID === book.bookId)

const graphCreditsOf = (graph: Graph, book: Book): ReadonlyArray<Credit> =>
  pipe(
    relationsTo(graph, book),
    Array.map(relation =>
      Option.flatMap(roleOf(relation), role =>
        Option.flatMap(
          namedOf(graph, relation.subjectID, ['person', 'organization']),
          named =>
            Option.map(contributorKeyOf(named.title), key => ({
              role,
              contributor: { key, name: named.title },
            })),
        ),
      ),
    ),
    Array.getSomes,
    Array.dedupeWith(isSameCredit),
    inCreditsOrder,
  )

const graphPublishersOf = (
  graph: Graph,
  book: Book,
): ReadonlyArray<Publisher> =>
  pipe(
    relationsTo(graph, book),
    Array.filter(relation => relation.predicate === 'publisherOf'),
    Array.map(relation =>
      Option.flatMap(
        namedOf(graph, relation.subjectID, ['organization']),
        named => publisherNamed(named.title),
      ),
    ),
    Array.getSomes,
    Array.dedupeWith(isSamePublisher),
  )

const orWhenEmpty = <A>(
  kept: ReadonlyArray<A>,
  fallback: ReadonlyArray<A>,
): ReadonlyArray<A> =>
  Array.match(kept, {
    onEmpty: () => fallback,
    onNonEmpty: Function.identity,
  })

const creditedFrom =
  (graph: Graph) =>
  (book: Book): Book => ({
    ...book,
    credits: orWhenEmpty(graphCreditsOf(graph, book), book.credits),
    publishedBy: orWhenEmpty(graphPublishersOf(graph, book), book.publishedBy),
  })

const recognizedAtOf = (row: ThingRow): number =>
  row.lastRecognizedAtMs ?? row.updatedAtMs

const byRecognizedDescending = Order.mapInput(
  Order.flip(Order.Number),
  (row: ThingRow) => recognizedAtOf(row),
)

const byTurnedAtDescending = Order.mapInput(
  Order.flip(Order.Number),
  (turn: PageTurn) => turn.turnedAtMs,
)

type PageRow = Readonly<{ row: RecognitionRow; detail: PageDetail }>

type ReadingRow = Readonly<{ row: RecognitionRow; detail: ReadingDetail }>

const lastMarkedPageOf = (detail: ReadingDetail): Option.Option<number> =>
  Option.flatMap(
    Option.flatMap(Option.fromNullishOr(detail.pageMarks), Array.last),
    mark => S.decodeUnknownOption(S.FiniteFromString)(mark.page),
  )

const readingTurnOf = ({ row, detail }: ReadingRow): Option.Option<PageTurn> =>
  pipe(
    Option.orElse(lastMarkedPageOf(detail), () =>
      Option.fromNullishOr(row.thingRangeEnd),
    ),
    Option.flatMap(S.decodeUnknownOption(PageNumber)),
    Option.flatMap(page =>
      Option.map(
        Option.all({
          turnId: S.decodeUnknownOption(TurnId)(`${row.id}:${page.toString()}`),
          bookId: S.decodeUnknownOption(BookId)(row.thingID),
          readingId: S.decodeUnknownOption(ReadingId)(row.id),
        }),
        ids => ({
          ...ids,
          page,
          turnedAtMs: Option.getOrElse(
            Option.flatMap(Option.fromNullishOr(detail.reached), reached =>
              Option.fromNullishOr(reached.atMs),
            ),
            () => row.updatedAtMs,
          ),
          isOngoing: row.isOngoing,
        }),
      ),
    ),
  )

/**
 * What Read Aloud knows from Scribe's rows: every active book, the one
 * read most recently first, and every page Scribe heard the reader turn
 * to, the newest first. Each row counts once, as its newest version. A
 * page is ongoing while the reader is on it and its reading goes on. A
 * reading Scribe logged before it logged each page counts as one turn, to
 * the last page it marked. A recognition a person rejected never counts.
 *
 * A book's credits come from the things graph: the people and publishers
 * among `thingRows` and the `relationRows` that tie them to the book.
 * `authorOf` credits an Author, `illustratorOf` an Illustrator,
 * `contributedTo` with the role `editor` an Editor, and `publisherOf` its
 * publisher, authors first. A retracted, rejected, or candidate tie never
 * counts, and nothing kept in the personal scope does. Where the graph
 * keeps none, the catalog's credits stand.
 *
 * @example
 * ```typescript
 * readingsOfRows(thingRowsOf(things), recognitionRowsOf(recognitions), relationRowsOf(relations))
 * // { books: [Little Blue Truck Feeling Happy, credits: Alice Schertle, Author], turns: [page 4 (ongoing), page 3, page 2, page 1] }
 * ```
 */
export const readingsOfRows = (
  thingRows: ReadonlyArray<ThingRow>,
  recognitionRows: ReadonlyArray<RecognitionRow>,
  relationRows: ReadonlyArray<RelationRow> = [],
): Readings => {
  const books = pipe(
    newestById(thingRows),
    Array.sort(byRecognizedDescending),
    Array.map(row => bookOfThing(row)),
    Array.getSomes,
    Array.map(creditedFrom(graphOf(thingRows, relationRows))),
  )
  const recognitions = Array.filter(
    newestById(recognitionRows),
    row =>
      row.thingKind === 'book' &&
      row.review !== 'rejected' &&
      Array.some(books, book => book.bookId === row.thingID),
  )
  const pageRows: ReadonlyArray<PageRow> = Array.getSomes(
    Array.map(recognitions, row =>
      Option.map(pageDetailOf(row.detailJSON), detail => ({ row, detail })),
    ),
  )
  const readingRows: ReadonlyArray<ReadingRow> = Array.getSomes(
    Array.map(recognitions, row =>
      Option.isSome(pageDetailOf(row.detailJSON))
        ? Option.none()
        : Option.map(readingDetailOf(row.detailJSON), detail => ({
            row,
            detail,
          })),
    ),
  )
  const isReadingOngoing = (readingId: string): boolean =>
    Option.match(
      Array.findFirst(readingRows, reading => reading.row.id === readingId),
      { onNone: () => true, onSome: reading => reading.row.isOngoing },
    )
  const pageTurns = Array.getSomes(
    Array.map(pageRows, ({ row, detail }) =>
      Option.map(
        Option.all({
          turnId: S.decodeUnknownOption(TurnId)(row.id),
          bookId: S.decodeUnknownOption(BookId)(row.thingID),
          readingId: S.decodeUnknownOption(ReadingId)(detail.readingID),
          page: S.decodeUnknownOption(PageNumber)(detail.page),
        }),
        ids => ({
          ...ids,
          turnedAtMs: row.startedAtMs,
          isOngoing: row.isOngoing && isReadingOngoing(detail.readingID),
        }),
      ),
    ),
  )
  const readingTurns = pipe(
    readingRows,
    Array.filter(
      reading =>
        !Array.some(pageRows, page => page.detail.readingID === reading.row.id),
    ),
    Array.map(reading => readingTurnOf(reading)),
    Array.getSomes,
  )
  return {
    books,
    turns: Array.sort([...pageTurns, ...readingTurns], byTurnedAtDescending),
  }
}
