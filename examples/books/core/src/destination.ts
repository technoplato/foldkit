import { Schema as S } from 'effect'
import { Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'

import { BookmarkId, Milliseconds, TitleSlug } from './ids.js'

// DESTINATION

/** The library: every title, and the one to continue. The root. */
export const LibraryPage = ts('LibraryPage')
/** The library. */
export type LibraryPage = typeof LibraryPage.Type

/**
 * Who is signed in, and how their library stands, above the library:
 * `/books/profile`.
 */
export const ProfilePage = ts('ProfilePage')
/** Who is signed in. */
export type ProfilePage = typeof ProfilePage.Type

/**
 * One title's page, pushed above the library:
 * `/books/the-lantern-keeper`.
 */
export const TitlePage = ts('TitlePage', { slug: TitleSlug })
/** One title's page. */
export type TitlePage = typeof TitlePage.Type

/**
 * The player for the title beneath, at a place, so its address names the
 * book and the second being heard: `/books/the-lantern-keeper/listen/12:03`.
 * The place follows the player as it plays, so the address is always a
 * link back to this moment.
 */
export const PlayerPage = ts('PlayerPage', { atMs: Milliseconds })
/** The player, at a place. */
export type PlayerPage = typeof PlayerPage.Type

/**
 * The player for the title beneath, with no place in its address:
 * `/books/the-lantern-keeper/listen`, as older links read. It opens on
 * the listener's place and becomes a PlayerPage at once.
 */
export const ListenPage = ts('ListenPage')
/** The player with no place in its address. */
export type ListenPage = typeof ListenPage.Type

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
  ProfilePage,
  TitlePage,
  PlayerPage,
  ListenPage,
  ContentsSheet,
  SpeedSheet,
  DeleteBookmarkQuestion,
  Navigation.NotFound,
])
/** Every place Books can show. */
export type Destination = typeof Destination.Type

/** True for the library. */
export const isLibraryPage = S.is(LibraryPage)
/** True for the profile. */
export const isProfilePage = S.is(ProfilePage)
/** True for a title's page. */
export const isTitlePage = S.is(TitlePage)
/** True for the player at a place. */
export const isPlayerPage = S.is(PlayerPage)
/** True for the player with no place in its address. */
export const isListenPage = S.is(ListenPage)
/** True for either way of showing the player. */
export const isPlayerScreen = (destination: unknown): boolean =>
  isPlayerPage(destination) || isListenPage(destination)
/** True for a title's contents. */
export const isContentsSheet = S.is(ContentsSheet)
/** True for the speeds. */
export const isSpeedSheet = S.is(SpeedSheet)
/** True for the delete-bookmark question. */
export const isDeleteBookmarkQuestion = S.is(DeleteBookmarkQuestion)
