import { Array, Match as M, Option } from 'effect'
import { Catalog, type Command, Navigation } from 'foldkit'

import * as Audible from './audible/index.js'
import {
  AddBooksSheet,
  type Destination,
  isAddBooksSheet,
  isProfilePage,
} from './destination.js'
import type { Model } from './model.js'
import { isAsking } from './stack.js'

// AUDIBLE

const answerFirst = 'answer the question first'

const unlessAsking = (model: Model): Catalog.Availability =>
  isAsking(model)
    ? Catalog.Disabled({ because: answerFirst })
    : Catalog.Enabled()

const topPageOf = (model: Model): Option.Option<Destination> =>
  Array.last(model.navigation.pages)

const isOnHome = (model: Model): boolean =>
  Option.match(topPageOf(model), {
    onNone: () => true,
    onSome: isProfilePage,
  })

const isOnLibrary = (model: Model): boolean => Option.isNone(topPageOf(model))

const isAddBooksOpen = (model: Model): boolean =>
  Option.exists(model.navigation.maybeModal, modal =>
    isAddBooksSheet(modal.destination),
  )

/**
 * The Audible import as its Actions read it: the page on top and the
 * import's state. None while neither of its pages is on top, so none of
 * its Actions is offered elsewhere.
 *
 * @example
 * ```typescript
 * audibleViewOf(model) // Some({ page: 'Connect', audible }) on `/books/audible/connect`
 * ```
 */
export const audibleViewOf = (
  model: Model,
): Option.Option<Audible.AudibleView> =>
  Option.flatMap(topPageOf(model), page => {
    if (Audible.isAudibleConnectPage(page)) {
      return Option.some({ page: 'Connect', audible: model.audible })
    } else if (Audible.isAudibleTitlesPage(page)) {
      return Option.some({ page: 'Titles', audible: model.audible })
    } else {
      return Option.none()
    }
  })

/**
 * Shows where more books can come from, a Sheet at `/books/add`. The
 * "Add more of your books" row under the library presses it.
 */
export const ShowAddBooks = Catalog.action('ShowAddBooks', {
  what: 'Shows where more of your books can come from',
  why: 'The person wants to add books they already own',
  enabled: (model: Model) => {
    if (isAsking(model)) {
      return Catalog.Disabled({ because: answerFirst })
    } else if (isAddBooksOpen(model)) {
      return Catalog.Disabled({ because: 'it is open' })
    } else if (isOnLibrary(model)) {
      return Catalog.Enabled()
    } else {
      return Catalog.Disabled({ because: 'the library is not open' })
    }
  },
  meta: { label: 'Add more of your books', keys: [], title: 'Add books' },
})

/**
 * Opens the Audible import: the family member's titles at
 * `/books/audible`, or the sign-in when Books has no Audible login for
 * them yet. The empty library, the Add books Sheet, and the profile all
 * offer it.
 */
export const ImportFromAudible = Catalog.action('ImportFromAudible', {
  what: 'Imports the books you own on Audible',
  why: 'The person wants their Audible books in the library',
  enabled: (model: Model) =>
    isOnHome(model)
      ? unlessAsking(model)
      : Catalog.Disabled({ because: 'open the library or the profile first' }),
  meta: {
    label: 'Import from Audible',
    keys: [],
    title: 'Import from Audible',
  },
})

/**
 * Connects Audible again after its login stopped working: the sign-in
 * takes the titles page's place, so Back still leads where the import
 * started.
 */
export const ReconnectAudible = Catalog.action('ReconnectAudible', {
  what: 'Connects your Audible account again',
  why: 'Audible no longer accepts the login Books saved',
  enabled: (model: Model) =>
    Option.exists(
      audibleViewOf(model),
      view =>
        view.page === 'Titles' &&
        view.audible.titles._tag === 'TitlesUnreadable' &&
        view.audible.titles.problem._tag === 'LoginExpired',
    )
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'the Audible login works' }),
  meta: { label: 'Connect again', keys: [], title: 'Connect Audible again' },
})

/**
 * The Audible import's own Actions, offered while one of its pages is on
 * top. They keep their tags, so `ToggleAudibleTitle:B002V0RAUU` means the
 * same in Books and in the import.
 */
export const audibleActions = Catalog.within(Audible.catalog, {
  childOf: audibleViewOf,
  nothing: 'the Audible import is not open',
  enabled: unlessAsking,
})

const withStack = (
  model: Model,
  navigation: Navigation.NavigationStack<Destination>,
): Model => ({ ...model, navigation })

/** The library with the Add books Sheet over it. */
export const presentedAddBooks = (model: Model): Model =>
  withStack(
    model,
    Navigation.pushed(
      model.navigation,
      Navigation.presented<Destination>(AddBooksSheet(), Navigation.Sheet()),
    ),
  )

/**
 * The titles page above the library or the profile, wherever the import
 * started, with the Add books Sheet closed and the titles to be read
 * afresh: `/books/audible` or `/books/profile/audible`.
 */
export const openedAudibleImport = (model: Model): Model => {
  const closed = Navigation.withoutDestinations(
    model.navigation,
    isAddBooksSheet,
  )
  return {
    ...model,
    audible: Audible.reopened(model.audible),
    navigation: {
      ...closed,
      pages: [
        ...Array.filter(closed.pages, isProfilePage),
        Audible.AudibleTitlesPage(),
      ],
    },
  }
}

const swappedTop = (
  model: Model,
  isOnTop: (destination: Destination) => boolean,
  page: Destination,
): Model =>
  Option.exists(topPageOf(model), isOnTop)
    ? withStack(model, {
        ...model.navigation,
        pages: [...Array.dropRight(model.navigation.pages, 1), page],
      })
    : model

/** The sign-in in place of the titles page, with a new sign-in to open. */
export const reconnectedAudible = (model: Model): Model =>
  swappedTop(
    { ...model, audible: Audible.reconnecting(model.audible) },
    Audible.isAudibleTitlesPage,
    Audible.AudibleConnectPage(),
  )

/**
 * Applies one Audible import Message and does what it asks of the stack:
 * the sign-in in place of the titles page when there is no login, the
 * titles in place of the sign-in once connected. A page the person left
 * meanwhile stays as it is.
 */
export const audibleUpdated = (
  model: Model,
  message: Audible.Message,
): readonly [Model, ReadonlyArray<Command.Command<Audible.Message>>] => {
  const [audible, commands, maybeOutMessage] = Audible.update(
    model.audible,
    message,
  )
  const next = { ...model, audible }
  return [
    Option.match(maybeOutMessage, {
      onNone: () => next,
      onSome: M.type<Audible.OutMessage>().pipe(
        M.tagsExhaustive({
          NeededSignIn: () =>
            swappedTop(
              next,
              Audible.isAudibleTitlesPage,
              Audible.AudibleConnectPage(),
            ),
          Connected: () =>
            swappedTop(
              next,
              Audible.isAudibleConnectPage,
              Audible.AudibleTitlesPage(),
            ),
        }),
      ),
    }),
    commands,
  ]
}
