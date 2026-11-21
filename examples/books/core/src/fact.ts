import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import * as ReadAloud from 'read-aloud-core-example'

import { BookmarkId, Milliseconds, TitleSlug } from './ids.js'
import { Bookmark, Chapter, Progress, Shelf, StretchReport } from './model.js'
import { UnendedPlay } from './scribeTimeline.js'
import { SharedHow } from './share.js'

// FACT

/**
 * The library store sent the shelf, whole: when it first opens, and when
 * its titles change. What changes often comes as {@link ReceivedPlaces}
 * and {@link ReceivedBookmarks}.
 */
export const ReceivedShelf = m('ReceivedShelf', { shelf: Shelf })
/**
 * Places were saved on the shelf: the places that are new or moved, and
 * the titles whose place is gone. One saved place is one row, however
 * long the shelf is.
 */
export const ReceivedPlaces = m('ReceivedPlaces', {
  changed: S.Array(Progress),
  removed: S.Array(TitleSlug),
})
/** Bookmarks changed on the shelf: the new or changed ones, and the removed. */
export const ReceivedBookmarks = m('ReceivedBookmarks', {
  changed: S.Array(Bookmark),
  removed: S.Array(BookmarkId),
})
/** The library store said who is signed in, or that no one is. */
export const ReceivedMember = m('ReceivedMember', {
  maybeEmail: S.Option(S.String),
})
/** The library store could not be read, and why, safe to show. */
export const FailedReadShelf = m('FailedReadShelf', { reason: S.String })
/** The library store sent one title's chapters. */
export const ReceivedChapters = m('ReceivedChapters', {
  slug: TitleSlug,
  chapters: S.NonEmptyArray(Chapter),
})
/** One title's chapters could not be read, and why, safe to show. */
export const FailedReadChapters = m('FailedReadChapters', {
  slug: TitleSlug,
  reason: S.String,
})
/**
 * The player's address names a place the player is not at: someone opened
 * a link to a moment, went back or forward to one, or the shelf arrived
 * after the link did.
 */
export const OpenedPlace = m('OpenedPlace', {
  slug: TitleSlug,
  atMs: Milliseconds,
})
/** The address-cue watcher observed a player address asking for another place. */
export const DetectedAddressCue = m('DetectedAddressCue', {
  slug: TitleSlug,
  atMs: Milliseconds,
})
/** The link to a moment went out, through a share sheet or a clipboard. */
export const SharedLink = m('SharedLink', { how: SharedHow })
/** The link to a moment could not go out, and why, safe to show. */
export const FailedShareLink = m('FailedShareLink', { reason: S.String })
/**
 * The clock was read for a bookmark: `wallClockMs` is the moment the
 * person asked for one, so the word being spoken then is the one marked,
 * with the note they gave, if any. It stays on the device that asked: the
 * bookmark itself reaches every device through the library store.
 */
export const MarkedMoment = m('MarkedMoment', {
  wallClockMs: S.Number,
  maybeNote: S.OptionFromOptionalKey(S.String),
})
/** The library store saved a place, a finish, or a bookmark change. */
export const CompletedWriteLibrary = m('CompletedWriteLibrary')
/** The library store refused a write, and why, safe to show. */
export const FailedWriteLibrary = m('FailedWriteLibrary', {
  reason: S.String,
})
/**
 * Scribe's timeline took a stretch's start or end, on `recordingCount`
 * recordings: 0 when none was live while it played.
 */
export const CompletedReportStretch = m('CompletedReportStretch', {
  recordingCount: S.Int,
})
/**
 * Scribe's timeline could not take a stretch's report, and why, safe to
 * show, so Books can send it again.
 */
export const FailedReportStretch = m('FailedReportStretch', {
  report: StretchReport,
  reason: S.String,
})
/**
 * Scribe's timeline has these Books plays with a start and no end, as of
 * `checkedAtMs`: pages closed while they played.
 */
export const ReceivedUnendedPlays = m('ReceivedUnendedPlays', {
  plays: S.Array(UnendedPlay),
  checkedAtMs: S.Number,
})
/** Scribe's timeline took the ends of `closedCount` unended plays. */
export const CompletedCloseUnendedPlays = m('CompletedCloseUnendedPlays', {
  closedCount: S.Int,
})
/** Scribe's timeline could not take the unended plays' ends, and why. */
export const FailedCloseUnendedPlays = m('FailedCloseUnendedPlays', {
  reason: S.String,
})
/** Audible reported no saved login, so Books swaps the titles page to sign-in. */
export const NeededAudibleSignIn = m('NeededAudibleSignIn')
/** Readings settled or turned the Read Aloud page on top of the stack. */
export const FollowedReadAloudPage = m('FollowedReadAloudPage', {
  place: ReadAloud.ReadAloudPlace,
})
