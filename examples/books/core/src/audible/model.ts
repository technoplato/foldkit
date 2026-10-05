import { Array, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { AudibleProblem } from './problem.js'
import {
  Asin,
  AudibleTitle,
  ImportProgress,
  ImportSummary,
  SkippedCount,
} from './title.js'

// MODEL

/**
 * No Amazon sign-in is open yet: one starts when the sign-in page shows.
 * `maybeProblem` is why the last one ended, such as an expired sign-in,
 * shown above the new one.
 */
export const SignInWaiting = ts('SignInWaiting', {
  maybeProblem: S.Option(AudibleProblem),
})
/** Amazon's sign-in is ready to open at `loginUrl`; the address comes next. */
export const SignInReady = ts('SignInReady', {
  loginUrl: S.String,
  maybeProblem: S.Option(AudibleProblem),
})
/** The server is finishing the sign-in with the pasted address. */
export const SignInConnecting = ts('SignInConnecting', { loginUrl: S.String })
/** The sign-in could not start, and why. Try again starts another. */
export const SignInStuck = ts('SignInStuck', { problem: AudibleProblem })
/** Where the Amazon sign-in stands on this device. */
export const SignIn = S.Union([
  SignInWaiting,
  SignInReady,
  SignInConnecting,
  SignInStuck,
])
/** Where the Amazon sign-in stands on this device. */
export type SignIn = typeof SignIn.Type

/** The titles are not read yet: they are read when the titles page shows. */
export const TitlesUnread = ts('TitlesUnread')
/**
 * The family member's titles, what the importer leaves out, the ASINs
 * selected to import, and why the last import stopped, if it did.
 */
export const TitlesRead = ts('TitlesRead', {
  titles: S.Array(AudibleTitle),
  skipped: S.Array(SkippedCount),
  selected: S.Array(Asin),
  maybeProblem: S.Option(AudibleProblem),
})
/** The family member's titles and the ones selected to import. */
export type TitlesRead = typeof TitlesRead.Type
/** Importing the selected titles, and how far along it is. */
export const TitlesImporting = ts('TitlesImporting', {
  titles: S.Array(AudibleTitle),
  skipped: S.Array(SkippedCount),
  selected: S.Array(Asin),
  progress: ImportProgress,
})
/** The import finished, what it did, and what the importer left out. */
export const TitlesImported = ts('TitlesImported', {
  summary: ImportSummary,
  skipped: S.Array(SkippedCount),
})
/** The titles could not be read, and why. */
export const TitlesUnreadable = ts('TitlesUnreadable', {
  problem: AudibleProblem,
})
/** Where the family member's Audible titles stand on this device. */
export const Titles = S.Union([
  TitlesUnread,
  TitlesRead,
  TitlesImporting,
  TitlesImported,
  TitlesUnreadable,
])
/** Where the family member's Audible titles stand on this device. */
export type Titles = typeof Titles.Type

/**
 * The Audible import on this device: the Amazon sign-in and the titles.
 * It never comes from the log, so a refold keeps it as it is.
 */
export const AudibleModel = S.Struct({ signIn: SignIn, titles: Titles })
/** The Audible import on this device. */
export type AudibleModel = typeof AudibleModel.Type

/** Which page of the Audible import is showing. */
export const AudiblePage = S.Literals(['Connect', 'Titles'])
/** Which page of the Audible import is showing. */
export type AudiblePage = typeof AudiblePage.Type

/**
 * What the Audible Actions read: the page showing and the import's state,
 * so ConnectAudible is offered only on the sign-in page and
 * ToggleAudibleTitle only on the titles page.
 */
export const AudibleView = S.Struct({
  page: AudiblePage,
  audible: AudibleModel,
})
/** What the Audible Actions read. */
export type AudibleView = typeof AudibleView.Type

// INIT

/** No sign-in open and no titles read, the way every device starts. */
export const init = (): AudibleModel => ({
  signIn: SignInWaiting({ maybeProblem: Option.none() }),
  titles: TitlesUnread(),
})

// READ

/** The titles read so far, while there is a list to show. */
export const readTitlesOf = (titles: Titles): Option.Option<TitlesRead> =>
  titles._tag === 'TitlesRead' ? Option.some(titles) : Option.none()

/** True when `asin` is selected to import. */
export const isSelected = (read: TitlesRead, asin: Asin): boolean =>
  Array.contains(read.selected, asin)

/**
 * The ASINs selected when the titles arrive: every title not on the shelf
 * yet, so the books already there start unchecked.
 *
 * @example
 * ```typescript
 * newAsinsOf(titles) // ['B0FAKE0001', 'B0FAKE0003'] when B0FAKE0002 is in the library
 * ```
 */
export const newAsinsOf = (
  titles: ReadonlyArray<AudibleTitle>,
): ReadonlyArray<Asin> =>
  Array.map(
    Array.filter(titles, title => title.match === 'New'),
    title => title.asin,
  )
