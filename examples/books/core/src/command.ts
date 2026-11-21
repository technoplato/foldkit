import { Clock, Effect, Schema as S } from 'effect'
import { Command } from 'foldkit'
import * as ReadAloud from 'read-aloud-core-example'

import {
  CompletedCloseUnendedPlays,
  CompletedReportStretch,
  CompletedWriteLibrary,
  FailedCloseUnendedPlays,
  FailedReportStretch,
  FailedShareLink,
  FailedWriteLibrary,
  FollowedReadAloudPage,
  MarkedMoment,
  NeededAudibleSignIn,
  OpenedPlace,
  SharedLink,
} from './fact.js'
import { Milliseconds, TitleSlug } from './ids.js'
import { LibraryStore, LibraryWrite } from './library.js'
import { Title } from './model.js'
import { PlayClosing, ScribeTimeline } from './scribeTimeline.js'
import { LinkSharing } from './share.js'
import { StretchEvent } from './stretch.js'

// COMMAND

/**
 * Asks the library store to save a place, a finish, or a bookmark change.
 * A refusal becomes FailedWriteLibrary with the store's reason, so a lost
 * connection never crashes the player.
 */
export const WriteLibrary = Command.define(
  'WriteLibrary',
  { write: LibraryWrite },
  CompletedWriteLibrary,
  FailedWriteLibrary,
)(({ write }) =>
  Effect.gen(function* () {
    const store = yield* LibraryStore
    yield* store.write(write)
    return CompletedWriteLibrary()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedWriteLibrary({ reason: error.reason })),
    ),
  ),
)

/**
 * Reads the clock for a bookmark, so the word being spoken at the moment
 * the person asked is the one marked.
 */
export const ReadMoment = Command.define(
  'ReadMoment',
  { maybeNote: S.OptionFromOptionalKey(S.String) },
  MarkedMoment,
)(({ maybeNote }) =>
  Effect.map(Clock.currentTimeMillis, wallClockMs =>
    MarkedMoment({ wallClockMs, maybeNote }),
  ),
)

/**
 * Shares a link to a moment through the host's link sharing. A refusal
 * becomes FailedShareLink with its reason, so a blocked clipboard never
 * crashes the player.
 */
export const ShareLink = Command.define(
  'ShareLink',
  { path: S.String, title: S.String },
  SharedLink,
  FailedShareLink,
)(({ path, title }) =>
  Effect.gen(function* () {
    const sharing = yield* LinkSharing
    const how = yield* sharing.share({ path, title })
    return SharedLink({ how })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedShareLink({ reason: error.reason })),
    ),
  ),
)

/**
 * Puts a link in the clipboard through the host's link sharing, as `Copy
 * link to this word` promises, where sharing would open a share sheet. A
 * refusal becomes FailedShareLink with its reason.
 */
export const CopyLink = Command.define(
  'CopyLink',
  { path: S.String, title: S.String },
  SharedLink,
  FailedShareLink,
)(({ path, title }) =>
  Effect.gen(function* () {
    const sharing = yield* LinkSharing
    yield* sharing.copy({ path, title })
    return SharedLink({ how: 'Copied' })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedShareLink({ reason: error.reason })),
    ),
  ),
)

/**
 * Tells Scribe's timeline that a stretch of `title` began or ended. A
 * refusal becomes FailedReportStretch with its reason, so a lost
 * connection never stops the player.
 */
export const ReportStretch = Command.define(
  'ReportStretch',
  { title: Title, event: StretchEvent },
  CompletedReportStretch,
  FailedReportStretch,
)(({ title, event }) =>
  Effect.gen(function* () {
    const timeline = yield* ScribeTimeline
    const recordingCount = yield* timeline.report(title, event)
    return CompletedReportStretch({ recordingCount })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedReportStretch({
          report: { title, event },
          reason: error.reason,
        }),
      ),
    ),
  ),
)

/**
 * Writes the ends of plays a closed page left open on Scribe's timeline.
 * A refusal becomes FailedCloseUnendedPlays; the next check finds the
 * plays again.
 */
export const CloseUnendedPlays = Command.define(
  'CloseUnendedPlays',
  { closings: S.Array(PlayClosing) },
  CompletedCloseUnendedPlays,
  FailedCloseUnendedPlays,
)(({ closings }) =>
  Effect.gen(function* () {
    const timeline = yield* ScribeTimeline
    const closedCount = yield* timeline.closePlays(closings)
    return CompletedCloseUnendedPlays({ closedCount })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedCloseUnendedPlays({ reason: error.reason })),
    ),
  ),
)

/**
 * Moves the player to the place the address names after the shelf arrives
 * or an address link opens.
 */
export const ResolveAddressCue = Command.define(
  'ResolveAddressCue',
  { slug: TitleSlug, atMs: Milliseconds },
  OpenedPlace,
)(({ slug, atMs }) => Effect.succeed(OpenedPlace({ slug, atMs })))

/**
 * Swaps the Audible titles page for the sign-in page when the library store
 * reports no saved Audible login.
 */
export const OpenAudibleSignIn = Command.define(
  'OpenAudibleSignIn',
  NeededAudibleSignIn,
)(Effect.succeed(NeededAudibleSignIn()))

/**
 * Moves the Read Aloud page on top of the stack when live readings settle
 * or turn the page.
 */
export const FollowReadAloudPage = Command.define(
  'FollowReadAloudPage',
  { place: ReadAloud.ReadAloudPlace },
  FollowedReadAloudPage,
)(({ place }) => Effect.succeed(FollowedReadAloudPage({ place })))
