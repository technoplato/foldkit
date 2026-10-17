import { Array, Option, Schema as S, Struct } from 'effect'
import { describe, expect, it } from 'vitest'

import { contributorKeyOf, publisherKeyOf } from './ids.js'
import { ReadingsJson } from './reading.js'
import {
  readingsOfRows,
  recognitionRowsOf,
  relationRowsOf,
  rowsOfLines,
  thingRowsOf,
} from './scribe.js'

const heardWords = 'page four said aloud'

const lineOf = (row: Readonly<Record<string, unknown>>): string =>
  JSON.stringify(row)

const bookLine = (overrides: Readonly<Record<string, unknown>> = {}) =>
  lineOf({
    id: 'thing-feeling-happy',
    kind: 'book',
    status: 'active',
    title: 'Little Blue Truck Feeling Happy: a Touch-And-Feel Book',
    subtitle: 'Alice Schertle · 2024',
    imageURL: 'https://covers.openlibrary.org/b/id/15154333-M.jpg',
    url: 'https://openlibrary.org/books/OL50729385M',
    ownerUserID: 'owner-made-up',
    metadataJSON: JSON.stringify({
      authors: ['Alice Schertle'],
      publishers: ['HarperCollins Publishers'],
      publishDate: '2024',
      pageCount: 14,
      whereToBuy: [
        {
          kind: 'bookshop',
          label: 'Bookshop.org (independent bookstores)',
          url: 'https://bookshop.org/book/9780063342705',
          verified: false,
          rank: 3,
        },
        {
          kind: 'openLibrary',
          label: 'Open Library',
          url: 'https://openlibrary.org/books/OL50729385M',
          verified: true,
          rank: 1,
        },
      ],
    }),
    externalIDsJSON: JSON.stringify({ isbn13: '9780063342705' }),
    updatedAtMs: 100,
    lastRecognizedAtMs: 100,
    ...overrides,
  })

const readingLine = (overrides: Readonly<Record<string, unknown>> = {}) =>
  lineOf({
    id: 'reading-tonight',
    thingID: 'thing-feeling-happy',
    thingKind: 'book',
    thingRangeStart: 1,
    thingRangeEnd: 4,
    thingRangeUnit: 'page',
    isOngoing: true,
    startedAtMs: 1_000,
    updatedAtMs: 1_400,
    recordingID: 'recording-made-up',
    evidenceJSON: JSON.stringify({ heard: heardWords }),
    detailJSON: JSON.stringify({
      pageMarks: [
        { page: '1', segmentIndex: 10 },
        { page: '4', segmentIndex: 40 },
      ],
      reached: { index: 40, seconds: 400, atMs: 4_000 },
    }),
    ...overrides,
  })

const pageLine = (
  page: number,
  overrides: Readonly<Record<string, unknown>> = {},
) =>
  lineOf({
    id: `page-${page.toString()}`,
    thingID: 'thing-feeling-happy',
    thingKind: 'book',
    thingRangeStart: page,
    thingRangeEnd: page,
    thingRangeUnit: 'page',
    isOngoing: false,
    startedAtMs: page * 1_000,
    updatedAtMs: page * 1_000 + 500,
    recordingID: 'recording-made-up',
    detailJSON: JSON.stringify({
      kind: 'page',
      page,
      readingID: 'reading-tonight',
      method: 'spoken',
      heard: heardWords,
    }),
    ...overrides,
  })

const readingsOfLines = (
  thingLines: ReadonlyArray<string>,
  recognitionLines: ReadonlyArray<string>,
) =>
  readingsOfRows(
    thingRowsOf(rowsOfLines(Array.join(thingLines, '\n'))),
    recognitionRowsOf(rowsOfLines(Array.join(recognitionLines, '\n'))),
  )

describe('Scribe rows', () => {
  it('skips a line Scribe is still writing', () => {
    expect(rowsOfLines('{"id":"a"}\n\n{"id":')).toEqual([{ id: 'a' }])
  })

  it('reads a book with its ISBN as its key, its cover, and where to find it, most open first', () => {
    const { books } = readingsOfLines([bookLine()], [])
    expect(books).toEqual([
      {
        bookId: 'thing-feeling-happy',
        key: '9780063342705',
        maybeIsbn13: Option.some('9780063342705'),
        title: 'Little Blue Truck Feeling Happy: a Touch-And-Feel Book',
        credits: [
          {
            role: 'Author',
            contributor: { key: 'alice-schertle', name: 'Alice Schertle' },
          },
        ],
        publishedBy: [
          {
            key: 'harpercollins-publishers',
            name: 'HarperCollins Publishers',
          },
        ],
        maybePublishYear: Option.some('2024'),
        maybePageCount: Option.some(14),
        maybeCoverUrl: Option.some(
          'https://covers.openlibrary.org/b/id/15154333-M.jpg',
        ),
        links: [
          {
            label: 'Open Library',
            url: 'https://openlibrary.org/books/OL50729385M',
            isVerified: true,
          },
          {
            label: 'Bookshop.org (independent bookstores)',
            url: 'https://bookshop.org/book/9780063342705',
            isVerified: false,
          },
        ],
      },
    ])
  })

  it('counts each row once, as its newest line', () => {
    const { books } = readingsOfLines(
      [bookLine(), bookLine({ title: 'Renamed', updatedAtMs: 200 })],
      [],
    )
    expect(Array.map(books, book => book.title)).toEqual(['Renamed'])
  })

  it('keeps active books only, and names a book without an ISBN by its id', () => {
    const { books } = readingsOfLines(
      [
        bookLine({ id: 'thing-archived', status: 'archived' }),
        bookLine({ id: 'thing-mug', kind: 'object' }),
        bookLine({
          id: 'thing-no-isbn',
          externalIDsJSON: JSON.stringify({}),
          imageURL: 'http://covers.example/plain.jpg',
        }),
      ],
      [],
    )
    expect(
      Array.map(books, book => ({
        key: book.key,
        maybeCoverUrl: book.maybeCoverUrl,
      })),
    ).toEqual([{ key: 'thing-no-isbn', maybeCoverUrl: Option.none() }])
  })

  it('reads every page Scribe heard, the newest first, ongoing while the reader is on it', () => {
    const { turns } = readingsOfLines(
      [bookLine()],
      [
        readingLine(),
        pageLine(1),
        pageLine(2),
        pageLine(3),
        pageLine(4, { isOngoing: true }),
      ],
    )
    expect(
      Array.map(turns, turn => ({
        page: turn.page,
        isOngoing: turn.isOngoing,
      })),
    ).toEqual([
      { page: 4, isOngoing: true },
      { page: 3, isOngoing: false },
      { page: 2, isOngoing: false },
      { page: 1, isOngoing: false },
    ])
  })

  it('ends the last page when its reading ends', () => {
    const { turns } = readingsOfLines(
      [bookLine()],
      [
        readingLine({ isOngoing: false, updatedAtMs: 9_000 }),
        pageLine(4, { isOngoing: true }),
      ],
    )
    expect(Array.map(turns, turn => turn.isOngoing)).toEqual([false])
  })

  it('counts a reading logged before Scribe logged each page as one turn, to its last mark', () => {
    const { turns } = readingsOfLines([bookLine()], [readingLine()])
    expect(
      Array.map(turns, turn => ({
        page: turn.page,
        turnedAtMs: turn.turnedAtMs,
        isOngoing: turn.isOngoing,
      })),
    ).toEqual([{ page: 4, turnedAtMs: 4_000, isOngoing: true }])
  })

  it('never counts a recognition a person rejected, or one of another thing', () => {
    const { turns } = readingsOfLines(
      [bookLine()],
      [
        pageLine(1),
        pageLine(2, { review: 'rejected' }),
        pageLine(3, { thingID: 'thing-somebody-else' }),
      ],
    )
    expect(Array.map(turns, turn => turn.page)).toEqual([1])
  })

  it('keeps book information and pages only, never what was heard or who owns it', () => {
    const text = S.encodeSync(ReadingsJson)(
      readingsOfLines(
        [bookLine()],
        [readingLine(), pageLine(1), pageLine(2, { isOngoing: true })],
      ),
    )
    expect(text).not.toContain(heardWords)
    expect(text).not.toContain('owner-made-up')
    expect(text).not.toContain('recording-made-up')
  })
})

const contactEmail = 'made-up@example.invalid'

const harborLightsLine = (overrides: Readonly<Record<string, unknown>> = {}) =>
  lineOf({
    id: 'thing-harbor-lights',
    kind: 'book',
    status: 'active',
    title: 'Harbor Lights',
    ownerUserID: 'owner-made-up',
    metadataJSON: JSON.stringify({
      authors: ['Ada Quill', 'Noor Vale'],
      publishers: ['Harbor House Publishing', 'Harbor House'],
      publishDate: '2019',
      pageCount: 32,
    }),
    externalIDsJSON: JSON.stringify({ isbn13: '9780000000019' }),
    updatedAtMs: 100,
    lastRecognizedAtMs: 100,
    ...overrides,
  })

const graphThingLine = (
  id: string,
  kind: 'person' | 'organization',
  title: string,
  overrides: Readonly<Record<string, unknown>> = {},
) =>
  lineOf({
    id,
    kind,
    status: 'active',
    title,
    key: `described:${id}`,
    identification: 'described',
    ownerUserID: 'owner-made-up',
    metadataJSON: JSON.stringify({
      contactPoints: [{ kind: 'email', value: contactEmail, asOf: '2019' }],
    }),
    updatedAtMs: 100,
    ...overrides,
  })

const relationLine = (
  id: string,
  subjectID: string,
  predicate: string,
  overrides: Readonly<Record<string, unknown>> = {},
) =>
  lineOf({
    id,
    ownerUserID: 'owner-made-up',
    formatVersion: 1,
    subjectID,
    subjectKind: 'person',
    predicate,
    objectID: 'thing-harbor-lights',
    objectKind: 'book',
    basis: 'printed',
    section: 'copyrightPage',
    certainty: 'exact',
    status: 'active',
    evidenceJSON: JSON.stringify({ heard: heardWords }),
    writer: 'mirror:made-up-agent',
    createdAtMs: 100,
    updatedAtMs: 100,
    ...overrides,
  })

const peopleLines = [
  graphThingLine('person-ada', 'person', 'Ada Quill'),
  graphThingLine('person-noor', 'person', 'Noor Vale'),
  graphThingLine('person-iris', 'person', 'Iris Penn'),
  graphThingLine('org-harbor', 'organization', 'Harbor House'),
]

const editorLine = relationLine(
  'relation-editor',
  'person-iris',
  'contributedTo',
  {
    qualifiersJSON: JSON.stringify({ role: 'editor' }),
  },
)

const publisherLine = relationLine(
  'relation-publisher',
  'org-harbor',
  'publisherOf',
  {
    subjectKind: 'organization',
  },
)

const illustratorLine = relationLine(
  'relation-illustrator',
  'person-noor',
  'illustratorOf',
)

const authorLine = relationLine('relation-author', 'person-ada', 'authorOf')

const readingsWithGraph = (
  thingLines: ReadonlyArray<string>,
  relationLines: ReadonlyArray<string>,
) =>
  readingsOfRows(
    thingRowsOf(rowsOfLines(Array.join(thingLines, '\n'))),
    [],
    relationRowsOf(rowsOfLines(Array.join(relationLines, '\n'))),
  )

const harborLightsOf = (
  thingLines: ReadonlyArray<string>,
  relationLines: ReadonlyArray<string>,
) =>
  Option.getOrThrow(
    Array.head(readingsWithGraph(thingLines, relationLines).books),
  )

describe('Credits from the things graph', () => {
  it("credits a book's author, illustrator, editor, and publisher from the graph, authors first, each named by a tag of their name", () => {
    const book = harborLightsOf(
      [harborLightsLine(), ...peopleLines],
      [editorLine, publisherLine, illustratorLine, authorLine],
    )
    expect(book.credits).toEqual([
      { role: 'Author', contributor: { key: 'ada-quill', name: 'Ada Quill' } },
      {
        role: 'Illustrator',
        contributor: { key: 'noor-vale', name: 'Noor Vale' },
      },
      { role: 'Editor', contributor: { key: 'iris-penn', name: 'Iris Penn' } },
    ])
    expect(book.publishedBy).toEqual([
      { key: 'harbor-house', name: 'Harbor House' },
    ])
  })

  it('credits the authors and the first publisher the catalog lists while the graph has none', () => {
    const book = harborLightsOf([harborLightsLine(), ...peopleLines], [])
    expect(book.credits).toEqual([
      { role: 'Author', contributor: { key: 'ada-quill', name: 'Ada Quill' } },
      { role: 'Author', contributor: { key: 'noor-vale', name: 'Noor Vale' } },
    ])
    expect(book.publishedBy).toEqual([
      { key: 'harbor-house-publishing', name: 'Harbor House Publishing' },
    ])
  })

  it("never credits a retracted, rejected, candidate, or personal row, or another book's credit", () => {
    const book = harborLightsOf(
      [harborLightsLine(), ...peopleLines],
      [
        authorLine,
        illustratorLine,
        relationLine('relation-illustrator', 'person-noor', 'illustratorOf', {
          status: 'retracted',
          updatedAtMs: 200,
        }),
        relationLine('relation-editor', 'person-iris', 'contributedTo', {
          qualifiersJSON: JSON.stringify({ role: 'editor' }),
          review: 'rejected',
        }),
        relationLine('relation-guess', 'person-iris', 'authorOf', {
          certainty: 'candidate',
        }),
        relationLine('relation-publisher', 'org-harbor', 'publisherOf', {
          subjectKind: 'organization',
          scope: 'personal',
        }),
        relationLine('relation-elsewhere', 'person-noor', 'authorOf', {
          objectID: 'thing-elsewhere',
        }),
      ],
    )
    expect(book.credits).toEqual([
      { role: 'Author', contributor: { key: 'ada-quill', name: 'Ada Quill' } },
    ])
    expect(book.publishedBy).toEqual([
      { key: 'harbor-house-publishing', name: 'Harbor House Publishing' },
    ])
  })

  it('never credits a person the graph keeps only in the personal scope', () => {
    const book = harborLightsOf(
      [
        harborLightsLine(),
        ...peopleLines,
        graphThingLine('person-ollie', 'person', 'Ollie Fern', {
          scope: 'personal',
        }),
      ],
      [
        authorLine,
        relationLine('relation-ollie', 'person-ollie', 'illustratorOf'),
      ],
    )
    expect(book.credits).toEqual([
      { role: 'Author', contributor: { key: 'ada-quill', name: 'Ada Quill' } },
    ])
  })

  it('never sends what the graph keeps about a person, what was heard, or who keeps it', () => {
    const text = S.encodeSync(ReadingsJson)(
      readingsWithGraph(
        [harborLightsLine(), ...peopleLines],
        [authorLine, illustratorLine, editorLine, publisherLine],
      ),
    )
    expect(text).toContain('Iris Penn')
    expect(text).not.toContain(contactEmail)
    expect(text).not.toContain(heardWords)
    expect(text).not.toContain('owner-made-up')
    expect(text).not.toContain('made-up-agent')
  })

  it('reads the readings Scribe sent before books had credits, with no credits', () => {
    const readings = readingsWithGraph([harborLightsLine()], [])
    const before = JSON.parse(S.encodeSync(ReadingsJson)(readings))
    const written = JSON.stringify({
      ...before,
      books: Array.map(
        before.books,
        (book: Readonly<Record<string, unknown>>) => ({
          ...Struct.omit(book, ['credits', 'publishedBy']),
          authors: ['Ada Quill'],
          publishers: ['Harbor House'],
        }),
      ),
    })
    const decoded = S.decodeUnknownSync(ReadingsJson)(written)
    expect(
      Array.map(decoded.books, book => ({
        title: book.title,
        credits: book.credits,
        publishedBy: book.publishedBy,
      })),
    ).toEqual([{ title: 'Harbor Lights', credits: [], publishedBy: [] }])
  })
})

describe('Name tags', () => {
  it('tags a name for an address: lowercase words joined by hyphens, accents and stops dropped', () => {
    expect(contributorKeyOf('Ada Quill')).toEqual(Option.some('ada-quill'))
    expect(contributorKeyOf('  H. G.  Marsh ')).toEqual(
      Option.some('h-g-marsh'),
    )
    expect(contributorKeyOf('Renée Lune')).toEqual(Option.some('renee-lune'))
    expect(publisherKeyOf('Harbor House, Inc.')).toEqual(
      Option.some('harbor-house-inc'),
    )
  })

  it('tags a name with no Latin letters or digits by its code points, so it still has a page', () => {
    expect(contributorKeyOf('宮崎 駿')).toEqual(Option.some('5bae-5d0e-99ff'))
  })

  it('has no tag for a blank name', () => {
    expect(contributorKeyOf('  ')).toEqual(Option.none())
  })
})
