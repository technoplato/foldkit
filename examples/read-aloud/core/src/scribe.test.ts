import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { ReadingsJson } from './reading.js'
import {
  readingsOfRows,
  recognitionRowsOf,
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
        authors: ['Alice Schertle'],
        publishers: ['HarperCollins Publishers'],
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
