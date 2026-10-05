import { Array, Option, Schema as S } from 'effect'
import { Catalog } from 'foldkit'
import { m } from 'foldkit/message'

import {
  type AudiblePage,
  type AudibleView,
  type TitlesRead,
  readTitlesOf,
} from './model.js'
import { AudibleProblem } from './problem.js'
import {
  Asin,
  AudibleTitle,
  ImportProgress,
  ImportSummary,
  SkippedCount,
} from './title.js'

// MESSAGE

const notOpenBecause = (page: AudiblePage): string =>
  page === 'Connect'
    ? 'the Audible sign-in is not open'
    : 'the Audible titles are not open'

const onPage = (
  view: AudibleView,
  page: AudiblePage,
  availabilityOf: () => Catalog.Availability,
): Catalog.Availability =>
  view.page === page
    ? availabilityOf()
    : Catalog.Disabled({ because: notOpenBecause(page) })

const connectAvailabilityOf = (view: AudibleView): Catalog.Availability =>
  onPage(view, 'Connect', () => {
    const signIn = view.audible.signIn
    if (signIn._tag === 'SignInReady') {
      return Catalog.Enabled()
    } else if (signIn._tag === 'SignInConnecting') {
      return Catalog.Disabled({ because: 'Books is connecting to Audible' })
    } else if (signIn._tag === 'SignInStuck') {
      return Catalog.Disabled({ because: 'the Amazon sign-in could not start' })
    } else {
      return Catalog.Disabled({
        because: 'the Amazon sign-in is not ready yet',
      })
    }
  })

const withTitles = (
  view: AudibleView,
  availabilityOf: (read: TitlesRead) => Catalog.Availability,
): Catalog.Availability =>
  onPage(view, 'Titles', () =>
    Option.match(readTitlesOf(view.audible.titles), {
      onNone: () => Catalog.Disabled({ because: 'no titles are listed' }),
      onSome: availabilityOf,
    }),
  )

/**
 * The address a person pasted, carried hidden: it prints as `<redacted>`,
 * and no Schema can write it as JSON.
 */
export const PastedAddress = S.Redacted(S.String, { disallowJsonEncode: true })

const PastedAddressToken = S.RedactedFromValue(S.String, {
  disallowEncode: true,
})

/**
 * Connects the family member's Audible account with the address Amazon
 * showed after they signed in, pasted into the field: pressing Return in
 * it presses `ConnectAudible:https://www.amazon.com/ap/maplanding?…`. The
 * address goes only to the Books server, which holds the sign-in's
 * verifier, and never into the log.
 */
export const ConnectAudible = Catalog.action('ConnectAudible', {
  fields: { address: PastedAddress },
  choose: {
    field: 'address',
    prompt: 'Which address did Amazon show after you signed in?',
    token: PastedAddressToken,
    choicesOf: () => [],
    accepts: connectAvailabilityOf,
    nothingToChoose: 'paste the address Amazon showed',
  },
  what: 'Connects your Audible account with the address Amazon showed after you signed in',
  why: 'The person signed in on Amazon and wants Books to read their library',
  enabled: connectAvailabilityOf,
  meta: { label: 'Connect', keys: [], title: 'Connect Audible' },
})

/** Starts another Amazon sign-in after one could not start. */
export const TryAudibleSignInAgain = Catalog.action('TryAudibleSignInAgain', {
  what: 'Starts the Amazon sign-in again',
  why: 'The last one could not start',
  enabled: (view: AudibleView) =>
    onPage(view, 'Connect', () =>
      view.audible.signIn._tag === 'SignInStuck'
        ? Catalog.Enabled()
        : Catalog.Disabled({ because: 'the Amazon sign-in has started' }),
    ),
  meta: { label: 'Try again', keys: [], title: 'Try the Amazon sign-in again' },
})

/**
 * Selects one Audible title to import, or clears it: its row's check
 * presses `ToggleAudibleTitle:B002V0RAUU`.
 */
export const ToggleAudibleTitle = Catalog.action('ToggleAudibleTitle', {
  fields: { asin: Asin },
  choose: {
    field: 'asin',
    prompt: 'Which title?',
    token: Asin,
    choicesOf: (view: AudibleView) =>
      view.page === 'Titles'
        ? Option.match(readTitlesOf(view.audible.titles), {
            onNone: () => [],
            onSome: read =>
              Array.map(read.titles, title => ({
                value: title.asin,
                title: title.name,
                detail: Array.join(title.authors, ', '),
              })),
          })
        : [],
    nothingToChoose: 'no titles are listed',
  },
  what: 'Selects or clears one title to import',
  why: 'The person chooses which of their books come into the library',
  enabled: (view: AudibleView) => withTitles(view, () => Catalog.Enabled()),
  meta: { label: 'Select', keys: [], title: 'Select title' },
})

/** Selects every Audible title, those already in the library too. */
export const SelectAllAudibleTitles = Catalog.action('SelectAllAudibleTitles', {
  what: 'Selects every title to import',
  why: 'The person wants all of their books',
  enabled: (view: AudibleView) =>
    withTitles(view, read =>
      read.selected.length === read.titles.length
        ? Catalog.Disabled({ because: 'every title is selected' })
        : Catalog.Enabled(),
    ),
  meta: { label: 'Select all', keys: [], title: 'Select all titles' },
})

/** Clears every selected Audible title. */
export const DeselectAudibleTitles = Catalog.action('DeselectAudibleTitles', {
  what: 'Clears every selected title',
  why: 'The person wants to pick a few books one by one',
  enabled: (view: AudibleView) =>
    withTitles(view, read =>
      Array.isReadonlyArrayEmpty(read.selected)
        ? Catalog.Disabled({ because: 'no title is selected' })
        : Catalog.Enabled(),
    ),
  meta: { label: 'Select none', keys: [], title: 'Select no titles' },
})

/**
 * Imports the selected titles into the library: their titles, authors,
 * narrators, series, covers, runtimes, and chapters. Never their audio.
 */
export const ImportAudibleTitles = Catalog.action('ImportAudibleTitles', {
  what: 'Imports the selected titles into the library, without their audio',
  why: 'The person wants their Audible books on the shelf',
  enabled: (view: AudibleView) =>
    withTitles(view, read =>
      Array.isReadonlyArrayEmpty(read.selected)
        ? Catalog.Disabled({ because: 'no title is selected' })
        : Catalog.Enabled(),
    ),
  meta: { label: 'Import', keys: [], title: 'Import the selected titles' },
})

/** Reads the Audible titles again after Amazon or the server refused. */
export const ReadAudibleLibraryAgain = Catalog.action(
  'ReadAudibleLibraryAgain',
  {
    what: 'Reads your Audible titles again',
    why: 'The last read failed',
    enabled: (view: AudibleView) =>
      onPage(view, 'Titles', () => {
        const titles = view.audible.titles
        if (titles._tag !== 'TitlesUnreadable') {
          return Catalog.Disabled({ because: 'the titles are not stuck' })
        } else if (titles.problem._tag === 'LoginExpired') {
          return Catalog.Disabled({ because: 'connect again first' })
        } else {
          return Catalog.Enabled()
        }
      }),
    meta: {
      label: 'Try again',
      keys: [],
      title: 'Read your Audible titles again',
    },
  },
)

/**
 * The Audible import's Actions, in the order surfaces list them. Books
 * offers them only while one of its pages is showing.
 */
export const catalog = Catalog.make([
  ConnectAudible,
  TryAudibleSignInAgain,
  ToggleAudibleTitle,
  SelectAllAudibleTitles,
  DeselectAudibleTitles,
  ImportAudibleTitles,
  ReadAudibleLibraryAgain,
])

/** The server started an Amazon sign-in, to open at `loginUrl`. */
export const StartedAudibleSignIn = m('StartedAudibleSignIn', {
  loginUrl: S.String,
})
/** The Amazon sign-in could not start, and why. */
export const FailedStartAudibleSignIn = m('FailedStartAudibleSignIn', {
  problem: AudibleProblem,
})
/** The server saved the family member's Audible login. */
export const ConnectedAudible = m('ConnectedAudible')
/** The pasted address did not connect, and why. */
export const FailedConnectAudible = m('FailedConnectAudible', {
  problem: AudibleProblem,
})
/** The family member's Audible titles arrived, and what the importer leaves out. */
export const ReceivedAudibleLibrary = m('ReceivedAudibleLibrary', {
  titles: S.Array(AudibleTitle),
  skipped: S.Array(SkippedCount),
})
/** The Audible titles could not be read, and why. */
export const FailedReadAudibleLibrary = m('FailedReadAudibleLibrary', {
  problem: AudibleProblem,
})
/** The import moved on. */
export const AdvancedAudibleImport = m('AdvancedAudibleImport', {
  progress: ImportProgress,
})
/** The import finished, and what it did. */
export const ImportedAudibleTitles = m('ImportedAudibleTitles', {
  summary: ImportSummary,
})
/** The import stopped before it was done, and why. */
export const FailedImportAudibleTitles = m('FailedImportAudibleTitles', {
  problem: AudibleProblem,
})

/**
 * Every Message the Audible import accepts: its Actions, and the facts its
 * Commands and Subscriptions report.
 */
export const Message = S.Union([
  ...catalog.Message.members,
  StartedAudibleSignIn,
  FailedStartAudibleSignIn,
  ConnectedAudible,
  FailedConnectAudible,
  ReceivedAudibleLibrary,
  FailedReadAudibleLibrary,
  AdvancedAudibleImport,
  ImportedAudibleTitles,
  FailedImportAudibleTitles,
])
/** An Audible import Message. */
export type Message = typeof Message.Type

/**
 * True for an Audible import Message. Books keeps them off the log: they
 * act on this device's import only, and one carries a pasted address.
 */
export const isMessage = S.is(Message)
