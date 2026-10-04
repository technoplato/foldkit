import { Schema as S } from 'effect'
import { Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'

import { BookmarkId, ChapterNumber, TitleSlug } from './ids.js'

// DESTINATION

/** The library: every title, and the one to continue. The root. */
export const LibraryPage = ts('LibraryPage')
/** The library. */
export type LibraryPage = typeof LibraryPage.Type

/**
 * One title's page, pushed above the library:
 * `/books/the-lantern-keeper`.
 */
export const TitlePage = ts('TitlePage', { slug: TitleSlug })
/** One title's page. */
export type TitlePage = typeof TitlePage.Type

/**
 * The player for the title beneath, so its address names the book:
 * `/books/the-lantern-keeper/listen`. It plays the title when this device
 * has it loaded, and offers to play it from the listener's place when not.
 */
export const PlayerPage = ts('PlayerPage')
/** The player. */
export type PlayerPage = typeof PlayerPage.Type

/**
 * One chapter of the title beneath, a deep link to a section:
 * `/books/the-lantern-keeper/chapter/3`.
 */
export const ChapterPage = ts('ChapterPage', { chapterNumber: ChapterNumber })
/** One chapter's page. */
export type ChapterPage = typeof ChapterPage.Type

/**
 * The chapters of the title beneath, or of the one in the player: a
 * Sheet at `…/contents`.
 */
export const ContentsSheet = ts('ContentsSheet')
/** The chapters of the title beneath. */
export type ContentsSheet = typeof ContentsSheet.Type

/** The speeds to choose from, a Sheet over the player at `…/speed`. */
export const SpeedSheet = ts('SpeedSheet')
/** The speeds to choose from. */
export type SpeedSheet = typeof SpeedSheet.Type

/**
 * The question "Delete the bookmark at 12:03?", a Dialog. It names the
 * bookmark it asks about, so answering can only delete that one.
 */
export const DeleteBookmarkQuestion = ts('DeleteBookmarkQuestion', {
  bookmarkId: BookmarkId,
})
/** The question "Delete the bookmark at 12:03?". */
export type DeleteBookmarkQuestion = typeof DeleteBookmarkQuestion.Type

/**
 * Every place Books can show, and the URI no route matched. A stack holds
 * only these.
 */
export const Destination = S.Union([
  LibraryPage,
  TitlePage,
  PlayerPage,
  ChapterPage,
  ContentsSheet,
  SpeedSheet,
  DeleteBookmarkQuestion,
  Navigation.NotFound,
])
/** Every place Books can show. */
export type Destination = typeof Destination.Type

/** True for the library. */
export const isLibraryPage = S.is(LibraryPage)
/** True for a title's page. */
export const isTitlePage = S.is(TitlePage)
/** True for the player. */
export const isPlayerPage = S.is(PlayerPage)
/** True for a chapter's page. */
export const isChapterPage = S.is(ChapterPage)
/** True for a title's contents. */
export const isContentsSheet = S.is(ContentsSheet)
/** True for the speeds. */
export const isSpeedSheet = S.is(SpeedSheet)
/** True for the delete-bookmark question. */
export const isDeleteBookmarkQuestion = S.is(DeleteBookmarkQuestion)
