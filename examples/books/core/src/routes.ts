import { Array, Option, Schema as S, String, pipe } from 'effect'
import { Navigation, Route } from 'foldkit'
import * as ReadAloud from 'read-aloud-core-example'
import { PlaceSegment } from 'transcript-player-core-example'

import { AudibleConnectPage, AudibleTitlesPage } from './audible/destination.js'
import {
  AddBooksSheet,
  ContentsSheet,
  ContributorPage,
  DeleteBookmarkQuestion,
  LibraryPage,
  ListenPage,
  PlayerPage,
  ProfilePage,
  PublisherPage,
  SpeedSheet,
  TitlePage,
  isLibraryPage,
  isPlayerScreen,
  isProfilePage,
  isTitlePage,
} from './destination.js'
import {
  BookmarkId,
  CreditRoleSegment,
  Milliseconds,
  TitleSlug,
} from './ids.js'

// ROUTES

const slugSegment = Route.schemaSegment('slug', TitleSlug)
const placeSegment = Route.schemaSegment('atMs', PlaceSegment)
const bookmarkSegment = Route.schemaSegment('bookmarkId', BookmarkId)
const roleSegment = Route.schemaSegment('role', CreditRoleSegment)
const contributorSegment = Route.schemaSegment(
  'contributor',
  ReadAloud.ContributorKey,
)
const publisherSegment = Route.schemaSegment(
  'publisher',
  ReadAloud.PublisherKey,
)

const isTopOf =
  (...predicates: ReadonlyArray<(destination: unknown) => boolean>) =>
  (beneath: ReadonlyArray<unknown>): boolean =>
    Option.exists(Array.last(beneath), top =>
      Array.some(predicates, predicate => predicate(top)),
    )

const isHome = (destination: unknown): boolean =>
  isLibraryPage(destination) || isProfilePage(destination)

/**
 * How a name tag reads in words before the data that names it arrives:
 * `Ada Quill` for `ada-quill`.
 */
export const nameOfTag = (tag: string): string =>
  pipe(String.split(tag, '-'), Array.map(String.capitalize), Array.join(' '))

/**
 * How a title reads in a window title before the shelf arrives: its name
 * tag in words, `The Lantern Keeper` for `the-lantern-keeper`.
 */
export const nameOfSlug = (slug: TitleSlug): string => nameOfTag(slug)

/**
 * Books' screens, each with its route, title, and where it may sit:
 *
 * - `/books` is the library, the root, and `/books/profile` who is signed
 *   in, above it.
 * - `/books/read-aloud` is the picture books read aloud, above the
 *   library, and `/books/read-aloud/9780063342705/page/4` one of them at
 *   page 4, above that. A book stays one page while its pages turn, so
 *   its Google viewer turns instead of loading the book again. They come
 *   before a title's page, so `read-aloud` never reads as a title's name
 *   tag.
 * - `/books/add` is a Sheet over the library: where more books can come
 *   from. `/books/audible` is the Audible titles to import and
 *   `/books/audible/connect` the Audible sign-in, above the library or the
 *   profile, `/books/profile/audible` from there. They come before a
 *   title's page too.
 * - `/books/authors/ada-quill` is a person's page as an author, above the
 *   library, and `/books/illustrators/…` and `/books/editors/…` their
 *   pages in the other roles; `/books/publishers/harbor-house` is a
 *   publisher's page. They come before a title's page too, so `authors`
 *   never reads as a title's name tag.
 * - `/books/the-lantern-keeper` is a title's page, only above the library.
 * - `/books/the-lantern-keeper/listen/12:03` is that title's player at
 *   12:03, only above its page: a link to that moment, kept up to date as
 *   it plays. It stays one page while its place moves, so the words,
 *   their scroll, and the cover are never rebuilt.
 *   `/books/the-lantern-keeper/listen` opens it at the listener's place.
 * - `…/contents` and `…/speed` are Sheets; `…/delete-bookmark/<id>` is a
 *   Dialog.
 */
export const declared = Navigation.screens({
  slug: 'books',
  root: Navigation.rootScreen(LibraryPage, Route.here, {
    title: () => 'Library',
  }),
  screens: [
    Navigation.pushScreen(ProfilePage, Route.literal('profile'), {
      title: () => 'Profile',
      isAllowedAbove: beneath => Array.every(beneath, isLibraryPage),
    }),
    Navigation.pushScreen(ReadAloud.ReadAloudShelf, ReadAloud.shelfRoute, {
      title: () => 'Read aloud',
      isAllowedAbove: beneath => Array.every(beneath, isLibraryPage),
    }),
    Navigation.pushScreen(ReadAloud.ReadAloudPage, ReadAloud.pageRoute, {
      title: ReadAloud.pageTitleOf,
      isAllowedAbove: ReadAloud.isAboveShelf,
      identityOf: ReadAloud.pageIdentityOf,
    }),
    Navigation.pushScreen(ReadAloud.ReadAloudBook, ReadAloud.bookRoute, {
      title: () => 'Read aloud',
      isAllowedAbove: ReadAloud.isAboveShelf,
    }),
    Navigation.presentScreen(
      AddBooksSheet,
      Route.literal('add'),
      Navigation.Sheet(),
      {
        title: () => 'Add your books',
        isAllowedAbove: beneath => Array.every(beneath, isLibraryPage),
      },
    ),
    Navigation.pushScreen(
      AudibleConnectPage,
      pipe(Route.literal('audible'), Route.slash(Route.literal('connect'))),
      {
        title: () => 'Connect Audible',
        isAllowedAbove: beneath => Array.every(beneath, isHome),
      },
    ),
    Navigation.pushScreen(AudibleTitlesPage, Route.literal('audible'), {
      title: () => 'Import from Audible',
      isAllowedAbove: beneath => Array.every(beneath, isHome),
    }),
    Navigation.pushScreen(
      ContributorPage,
      pipe(roleSegment, Route.slash(contributorSegment)),
      {
        title: ({ contributor }) => nameOfTag(contributor),
        isAllowedAbove: beneath => Array.every(beneath, isLibraryPage),
      },
    ),
    Navigation.pushScreen(
      PublisherPage,
      pipe(Route.literal('publishers'), Route.slash(publisherSegment)),
      {
        title: ({ publisher }) => nameOfTag(publisher),
        isAllowedAbove: beneath => Array.every(beneath, isLibraryPage),
      },
    ),
    Navigation.pushScreen(TitlePage, slugSegment, {
      title: ({ slug }) => nameOfSlug(slug),
      isAllowedAbove: beneath => Array.every(beneath, isLibraryPage),
    }),
    Navigation.pushScreen(
      PlayerPage,
      pipe(Route.literal('listen'), Route.slash(placeSegment)),
      {
        title: () => 'Now playing',
        isAllowedAbove: beneath =>
          isTopOf(isTitlePage)(beneath) && !Array.some(beneath, isPlayerScreen),
        identityOf: () => PlayerPage({ atMs: Milliseconds.make(0) }),
      },
    ),
    Navigation.pushScreen(ListenPage, Route.literal('listen'), {
      title: () => 'Now playing',
      isAllowedAbove: beneath =>
        isTopOf(isTitlePage)(beneath) && !Array.some(beneath, isPlayerScreen),
    }),
    Navigation.presentScreen(
      ContentsSheet,
      Route.literal('contents'),
      Navigation.Sheet(),
      {
        title: () => 'Contents',
        isAllowedAbove: isTopOf(isTitlePage, isPlayerScreen),
      },
    ),
    Navigation.presentScreen(
      SpeedSheet,
      Route.literal('speed'),
      Navigation.Sheet(),
      {
        title: () => 'Speed',
        isAllowedAbove: isTopOf(isPlayerScreen),
      },
    ),
    Navigation.presentScreen(
      DeleteBookmarkQuestion,
      pipe(Route.literal('delete-bookmark'), Route.slash(bookmarkSegment)),
      Navigation.Dialog(),
      {
        title: () => 'Delete bookmark?',
        isAllowedAbove: isTopOf(isTitlePage, isPlayerScreen),
      },
    ),
  ],
})

const pathAboveLibraryOf = (
  page: ContributorPage | PublisherPage | TitlePage,
): Option.Option<string> =>
  Navigation.printStack(
    declared,
    Navigation.stackWithEntries<
      LibraryPage | ContributorPage | PublisherPage | TitlePage
    >(LibraryPage(), [Navigation.presented(page, Navigation.Push())]),
  )

/**
 * The address of a person's page in one role, printed by the routes
 * above.
 *
 * @example
 * ```typescript
 * contributorPathOf('Author', ContributorKey.make('ada-quill')) // Some('/books/authors/ada-quill')
 * contributorPathOf('Editor', ContributorKey.make('iris-penn')) // Some('/books/editors/iris-penn')
 * ```
 */
export const contributorPathOf = (
  role: ReadAloud.CreditRole,
  contributor: ReadAloud.ContributorKey,
): Option.Option<string> =>
  pathAboveLibraryOf(ContributorPage({ role, contributor }))

/**
 * The address of a publisher's page, printed by the routes above.
 *
 * @example
 * ```typescript
 * publisherPathOf(PublisherKey.make('harbor-house')) // Some('/books/publishers/harbor-house')
 * ```
 */
export const publisherPathOf = (
  publisher: ReadAloud.PublisherKey,
): Option.Option<string> => pathAboveLibraryOf(PublisherPage({ publisher }))

/**
 * The address of a title's page, printed by the routes above.
 *
 * @example
 * ```typescript
 * titlePathOf(TitleSlug.make('the-lantern-keeper')) // Some('/books/the-lantern-keeper')
 * ```
 */
export const titlePathOf = (slug: TitleSlug): Option.Option<string> =>
  pathAboveLibraryOf(TitlePage({ slug }))

/**
 * Books' pages for the credits on a book read aloud, which Read Aloud
 * links each credit to: `/books/authors/ada-quill` for Ada Quill as an
 * author, `/books/publishers/harbor-house` for Harbor House.
 */
export const creditLinks: ReadAloud.CreditLinks = {
  contributorPathOf,
  publisherPathOf,
}

const isCreditPage = S.is(S.Union([ContributorPage, PublisherPage]))

/**
 * The credit page a path is the address of: `/books/authors/ada-quill` is
 * Ada Quill's page as an author. None for any other path, and for any
 * spelling the routes would not print, such as
 * `/books/authors/ada-quill/`, so a public preview answers only the
 * address itself.
 *
 * @example
 * ```typescript
 * creditPageOf('/books/publishers/harbor-house') // Some(PublisherPage({ publisher: 'harbor-house' }))
 * creditPageOf('/books/the-lantern-keeper') // None
 * ```
 */
export const creditPageOf = (
  path: string,
): Option.Option<ContributorPage | PublisherPage> =>
  pipe(
    Array.last(Navigation.parseStack(declared, path).pages),
    Option.filter(isCreditPage),
    Option.filter(page => Option.contains(pathAboveLibraryOf(page), path)),
  )
