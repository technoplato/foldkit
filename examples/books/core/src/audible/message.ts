import { Array, Option, Schema as S } from 'effect'
import { Catalog } from 'foldkit'
import { ModelPath } from 'foldkit/declaration'

import { PastedAddress, PastedAddressToken } from './address.js'
import {
  AdvancedAudibleImport,
  ConnectedAudible,
  FailedConnectAudible,
  FailedImportAudibleTitles,
  FailedQueueAudiobookAudio,
  FailedReadAudibleLibrary,
  FailedReadAudiobookAudio,
  FailedStartAudibleSignIn,
  ImportedAudibleTitles,
  QueuedAudiobookAudio,
  ReceivedAudibleLibrary,
  ReceivedAudiobookAudio,
  StartedAudibleSignIn,
} from './fact.js'
import {
  type AudiblePage,
  AudibleView,
  type TitlesRead,
  canGetAudioOf,
  readAudioOf,
  readTitlesOf,
} from './model.js'
import { Asin } from './title.js'
import { FinishAudibleSignIn, QueueAudiobookAudio } from './update.js'

export * from './address.js'
export * from './fact.js'

// MESSAGE

const at = ModelPath.of(AudibleView).audible

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
  what: 'Connects the Audible account with the address Amazon showed after sign-in',
  why: 'To let Books read the Audible library, after signing in on Amazon',
  enabled: connectAvailabilityOf,
  mutates: [at.signIn],
  triggers: [FinishAudibleSignIn],
  meta: { label: 'Connect', keys: [], title: 'Connect Audible' },
})

/** Starts another Amazon sign-in after one could not start. */
export const TryAudibleSignInAgain = Catalog.action('TryAudibleSignInAgain', {
  what: 'Starts the Amazon sign-in again',
  why: 'To try once more after the sign-in could not start',
  enabled: (view: AudibleView) =>
    onPage(view, 'Connect', () =>
      view.audible.signIn._tag === 'SignInStuck'
        ? Catalog.Enabled()
        : Catalog.Disabled({ because: 'the Amazon sign-in has started' }),
    ),
  mutates: [at.signIn],
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
  why: 'To choose which books come into the library',
  enabled: (view: AudibleView) => withTitles(view, () => Catalog.Enabled()),
  mutates: [at.titles.selected],
  meta: { label: 'Select', keys: [], title: 'Select title' },
})

/** Selects every Audible title, those already in the library too. */
export const SelectAllAudibleTitles = Catalog.action('SelectAllAudibleTitles', {
  what: 'Selects every title to import',
  why: 'To bring in every book',
  enabled: (view: AudibleView) =>
    withTitles(view, read =>
      read.selected.length === read.titles.length
        ? Catalog.Disabled({ because: 'every title is selected' })
        : Catalog.Enabled(),
    ),
  mutates: [at.titles.selected],
  meta: { label: 'Select all', keys: [], title: 'Select all titles' },
})

/** Clears every selected Audible title. */
export const DeselectAudibleTitles = Catalog.action('DeselectAudibleTitles', {
  what: 'Clears every selected title',
  why: 'To pick a few books one by one',
  enabled: (view: AudibleView) =>
    withTitles(view, read =>
      Array.isReadonlyArrayEmpty(read.selected)
        ? Catalog.Disabled({ because: 'no title is selected' })
        : Catalog.Enabled(),
    ),
  mutates: [at.titles.selected],
  meta: { label: 'Select none', keys: [], title: 'Select no titles' },
})

/**
 * Imports the selected titles into the library: their titles, authors,
 * narrators, series, covers, runtimes, and chapters. Never their audio.
 */
export const ImportAudibleTitles = Catalog.action('ImportAudibleTitles', {
  what: 'Imports the selected titles into the library, without their audio',
  why: 'To have the Audible books on the shelf',
  enabled: (view: AudibleView) =>
    withTitles(view, read =>
      Array.isReadonlyArrayEmpty(read.selected)
        ? Catalog.Disabled({ because: 'no title is selected' })
        : Catalog.Enabled(),
    ),
  mutates: [at.titles],
  meta: { label: 'Import', keys: [], title: 'Import the selected titles' },
})

/** Reads the Audible titles again after Amazon or the server refused. */
export const ReadAudibleLibraryAgain = Catalog.action(
  'ReadAudibleLibraryAgain',
  {
    what: 'Reads the Audible titles again',
    why: 'To try once more after the titles could not be read',
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
    mutates: [at.titles],
    meta: {
      label: 'Try again',
      keys: [],
      title: 'Read your Audible titles again',
    },
  },
)

const getAudioAvailabilityOf = (view: AudibleView): Catalog.Availability =>
  onPage(view, 'Titles', () =>
    Option.match(readAudioOf(view.audible.audio), {
      onNone: () =>
        Catalog.Disabled({
          because: 'the audio of your books is not read yet',
        }),
      onSome: read =>
        Option.isSome(read.maybeAsking)
          ? Catalog.Disabled({ because: 'Books is asking for a book already' })
          : Array.some(read.status.titles, title =>
                canGetAudioOf(view.audible.audio, title.asin),
              )
            ? Catalog.Enabled()
            : Catalog.Disabled({
                because: 'every book with audio to get has it',
              }),
    }),
  )

/**
 * Brings one owned book's audio in now, ahead of the queue: its license,
 * download, words, read-along passages, and catalog entry. Its row's
 * button presses `GetAudiobookAudio:B0FAKE0007`. The CLI offers the same
 * Action.
 */
export const GetAudiobookAudio = Catalog.action('GetAudiobookAudio', {
  fields: { asin: Asin },
  choose: {
    field: 'asin',
    prompt: 'Which book?',
    token: Asin,
    choicesOf: (view: AudibleView) =>
      view.page === 'Titles'
        ? Option.match(readAudioOf(view.audible.audio), {
            onNone: () => [],
            onSome: read =>
              Array.map(
                Array.filter(read.status.titles, title =>
                  canGetAudioOf(view.audible.audio, title.asin),
                ),
                title => ({ value: title.asin, title: title.name }),
              ),
          })
        : [],
    nothingToChoose: 'no book is waiting for its audio',
  },
  what: "Brings one book's audio in now, ahead of the queue",
  why: 'To listen to this book with its read-along soon',
  enabled: getAudioAvailabilityOf,
  mutates: [at.audio.maybeAsking, at.audio.maybeProblem],
  triggers: [QueueAudiobookAudio],
  meta: { label: 'Get audio now', keys: [], title: 'Get audio now' },
})

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
  GetAudiobookAudio,
])

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
  ReceivedAudiobookAudio,
  FailedReadAudiobookAudio,
  QueuedAudiobookAudio,
  FailedQueueAudiobookAudio,
])
/** An Audible import Message. */
export type Message = typeof Message.Type

/**
 * True for an Audible import Message. Books keeps them off the log: they
 * act on this device's import only, and one carries a pasted address.
 */
export const isMessage = S.is(Message)
