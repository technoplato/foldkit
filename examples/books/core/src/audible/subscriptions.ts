import { Duration, Effect, Match as M, Option, Schedule, Stream } from 'effect'

import {
  AdvancedAudibleImport,
  FailedImportAudibleTitles,
  FailedReadAudibleLibrary,
  FailedReadAudiobookAudio,
  FailedStartAudibleSignIn,
  ImportedAudibleTitles,
  ReceivedAudibleLibrary,
  ReceivedAudiobookAudio,
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
export const signInStream = (
  isStarting: boolean,
): Stream.Stream<
  typeof StartedAudibleSignIn.Type | typeof FailedStartAudibleSignIn.Type
> =>
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
export const libraryStream = (
  isReading: boolean,
): Stream.Stream<
  typeof ReceivedAudibleLibrary.Type | typeof FailedReadAudibleLibrary.Type
> =>
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

type ImportFact =
  | typeof AdvancedAudibleImport.Type
  | typeof ImportedAudibleTitles.Type
  | typeof FailedImportAudibleTitles.Type

const messageOfUpdate = (update: ImportUpdate): ImportFact =>
  M.value(update).pipe(
    M.withReturnType<ImportFact>(),
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
): Stream.Stream<ImportFact> =>
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

/** True while the titles page shows: the owned books' audio is read again and again. */
export const isWatchingAudio = (
  maybeView: Option.Option<AudibleView>,
): boolean => Option.exists(maybeView, view => view.page === 'Titles')

/** How often the titles page reads the owned books' audio again. */
export const audioEvery = Duration.seconds(20)

/**
 * Reads every owned book's audio while `isWatching`, at once and then
 * every `audioEvery`, so the page shows the queue as it moves.
 */
export const audioStream = (
  isWatching: boolean,
): Stream.Stream<
  typeof ReceivedAudiobookAudio.Type | typeof FailedReadAudiobookAudio.Type
> =>
  isWatching
    ? Stream.unwrap(
        Effect.gen(function* () {
          const audible = yield* AudibleImport
          return Stream.fromEffectSchedule(
            audible.readAudio.pipe(
              Effect.map(status => ReceivedAudiobookAudio({ status })),
              Effect.catch(error =>
                Effect.succeed(
                  FailedReadAudiobookAudio({ problem: error.problem }),
                ),
              ),
            ),
            Schedule.spaced(audioEvery),
          )
        }),
      )
    : Stream.empty
