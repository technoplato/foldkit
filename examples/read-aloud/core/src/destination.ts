import { Schema as S } from 'effect'
import { Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'

import { BookKey, PageNumber } from './ids.js'

// DESTINATION

/**
 * The books read aloud, the one being read now first:
 * `/books/read-aloud`. The root.
 */
export const ReadAloudShelf = ts('ReadAloudShelf')
/** The books read aloud. */
export type ReadAloudShelf = typeof ReadAloudShelf.Type

/**
 * One book open at one page, its preview turned to that page:
 * `/books/read-aloud/9780063342705/page/4`. The page follows the reader:
 * each page Scribe hears them turn to turns it, so the address is always a
 * link to the page being read.
 */
export const ReadAloudPage = ts('ReadAloudPage', {
  book: BookKey,
  page: PageNumber,
})
/** One book open at one page. */
export type ReadAloudPage = typeof ReadAloudPage.Type

/**
 * One book with no page in its address: `/books/read-aloud/9780063342705`.
 * It opens at the page being read, or the first page, and becomes a
 * ReadAloudPage at once.
 */
export const ReadAloudBook = ts('ReadAloudBook', { book: BookKey })
/** One book with no page in its address. */
export type ReadAloudBook = typeof ReadAloudBook.Type

/**
 * Every place Read Aloud can show, wherever it is mounted: the shelf, a
 * book at a page, and a book with no page yet. A Program that holds Read
 * Aloud, such as Books, lists these in its own Destinations.
 */
export const ReadAloudPlace = S.Union([
  ReadAloudShelf,
  ReadAloudPage,
  ReadAloudBook,
])
/** Every place Read Aloud can show, wherever it is mounted. */
export type ReadAloudPlace = typeof ReadAloudPlace.Type

/** Every place Read Aloud can show, and the URI no route matched. */
export const Destination = S.Union([
  ReadAloudShelf,
  ReadAloudPage,
  ReadAloudBook,
  Navigation.NotFound,
])
/** Every place Read Aloud can show. */
export type Destination = typeof Destination.Type

/** True for the books read aloud. */
export const isReadAloudShelf = S.is(ReadAloudShelf)
/** True for a book open at a page. */
export const isReadAloudPage = S.is(ReadAloudPage)
/** True for a book with no page in its address. */
export const isReadAloudBook = S.is(ReadAloudBook)
