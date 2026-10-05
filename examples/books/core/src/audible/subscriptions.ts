import { Effect, Match as M, Option, Stream } from 'effect'

import {
  AdvancedAudibleImport,
  FailedImportAudibleTitles,
  FailedReadAudibleLibrary,
  FailedStartAudibleSignIn,
  ImportedAudibleTitles,
  type Message,
  ReceivedAudibleLibrary,
  StartedAudibleSignIn,
} from './message.js'
import type { AudibleModel, AudibleView } from './model.js'
import { AudibleImport, type ImportUpdate } from './service.js'
import type { Asin } from './title.js'

// SUBSCRIPTION

/**
 * True while the sign-in page shows with no sign-in open: one starts. The
 * server gives back the same one while it is fresh, so opening the page
 * again keeps the Amazon tab a person already signed in on.
 */
export const isStartingSignIn = (
  maybeView: Option.Option<AudibleView>,
): boolean =>
  Option.exists(
    maybeView,
    view =>
      view.page === 'Connect' && view.audible.signIn._tag === 'SignInWaiting',
  )

/** True while the titles page shows and the titles are not read yet. */
export const isReadingTitles = (
  maybeView: Option.Option<AudibleView>,
): boolean =>
  Option.exists(
    maybeView,
    view =>
      view.page === 'Titles' && view.audible.titles._tag === 'TitlesUnread',
  )

/**
 * The ASINs being imported, while an import runs, on any page: leaving the
 * titles page does not stop it.
 */
export const importingAsinsOf = (
  audible: AudibleModel,
): Option.Option<ReadonlyArray<Asin>> =>
  audible.titles._tag === 'TitlesImporting'
    ? Option.some(audible.titles.selected)
    : Option.none()

/** Starts an Amazon sign-in while `isStarting`, and reports its address. */
export const signInStream = (isStarting: boolean): Stream.Stream<Message> =>
  isStarting
    ? Stream.unwrap(
        Effect.gen(function* () {
          const audible = yield* AudibleImport
          return Stream.fromEffect(
            audible.startSignIn.pipe(
              Effect.map(({ loginUrl }) => StartedAudibleSignIn({ loginUrl })),
              Effect.catch(error =>
                Effect.succeed(
                  FailedStartAudibleSignIn({ problem: error.problem }),
                ),
              ),
            ),
          )
        }),
      )
    : Stream.empty

/** Reads the family member's Audible titles while `isReading`. */
export const libraryStream = (isReading: boolean): Stream.Stream<Message> =>
  isReading
    ? Stream.unwrap(
        Effect.gen(function* () {
          const audible = yield* AudibleImport
          return Stream.fromEffect(
            audible.readLibrary.pipe(
              Effect.map(({ titles, skipped }) =>
                ReceivedAudibleLibrary({ titles, skipped }),
              ),
              Effect.catch(error =>
                Effect.succeed(
                  FailedReadAudibleLibrary({ problem: error.problem }),
                ),
              ),
            ),
          )
        }),
      )
    : Stream.empty

const messageOfUpdate = (update: ImportUpdate): Message =>
  M.value(update).pipe(
    M.withReturnType<Message>(),
    M.tagsExhaustive({
      ImportAdvanced: ({ progress }) => AdvancedAudibleImport({ progress }),
      ImportFinished: ({ summary }) => ImportedAudibleTitles({ summary }),
    }),
  )

/**
 * Imports the ASINs while an import runs, and reports each step of it,
 * then the summary or why it stopped.
 */
export const importStream = (
  maybeAsins: Option.Option<ReadonlyArray<Asin>>,
): Stream.Stream<Message> =>
  Option.match(maybeAsins, {
    onNone: () => Stream.empty,
    onSome: asins =>
      Stream.unwrap(
        Effect.gen(function* () {
          const audible = yield* AudibleImport
          return audible.importTitles(asins).pipe(
            Stream.map(messageOfUpdate),
            Stream.catch(error =>
              Stream.make(
                FailedImportAudibleTitles({ problem: error.problem }),
              ),
            ),
          )
        }),
      ),
  })
