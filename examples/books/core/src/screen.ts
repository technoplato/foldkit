import {
  Array,
  Match as M,
  Option,
  Order,
  Record as Record_,
  String,
  pipe,
} from 'effect'
import { Catalog } from 'foldkit'
import {
  type ButtonNode,
  Column,
  Dock,
  type IconName,
  List,
  type ListItem,
  Progress,
  Row,
  Text,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'

import {
  ImportFromAudible,
  ReconnectAudible,
  ShowAddBooks,
} from './addBooks.js'
import * as Audible from './audible/index.js'
import type { ContributorPage, PublisherPage } from './destination.js'
import {
  type BookmarkId,
  Milliseconds,
  type TitleSlug,
  clockOf,
} from './ids.js'
import { placePathOf } from './links.js'
import {
  AddBookmark,
  CancelDeleteBookmark,
  CollapseControls,
  ConfirmDeleteBookmark,
  DeleteBookmark,
  ExpandControls,
  JumpToChapter,
  Listen,
  Open,
  OpenPlayer,
  Pause,
  Play,
  SetSpeed,
  SharePlace,
  ShowContents,
  ShowLibrary,
  ShowProfile,
  ShowReadAloud,
  ShowSpeeds,
  catalog,
} from './message.js'
import {
  type Chapter,
  type Loaded,
  type Model,
  type Title,
  type Progress as TitleProgress,
  bookmarkOf,
  bookmarksOf,
  chapterAt,
  chapterNameAt,
  loadedTitleOf,
  placeOf,
  progressOf,
  resumePlaceOf,
  shelfOf,
  titleOf,
  titlesOf,
} from './model.js'
import {
  contributorPathOf,
  creditLinks,
  nameOfTag,
  titlePathOf,
} from './routes.js'
import { bookSources, emptyLibraryButtonsOf } from './sources.js'
import { shownTitleOf } from './stack.js'

// VIEW

type AnyAction = Readonly<{ tag: string }>

type Variant = ButtonNode['variant']

const entriesOf = (model: Model): ReadonlyArray<Catalog.Entry> =>
  Catalog.entries(catalog, model)

const withVariant = (
  buttons: ReadonlyArray<ButtonNode>,
  variant: Variant,
): ReadonlyArray<ButtonNode> =>
  Array.map(buttons, button =>
    variant === undefined ? button : { ...button, variant },
  )

const buttonsOf = (
  model: Model,
  actions: ReadonlyArray<AnyAction>,
  variant?: Variant,
): ReadonlyArray<ButtonNode> =>
  withVariant(
    actionButtons(
      Array.filter(entriesOf(model), entry =>
        Array.some(actions, action => action.tag === entry.tag),
      ),
    ),
    variant,
  )

const choiceButtonsOf = (
  model: Model,
  token: string,
  actions: ReadonlyArray<AnyAction>,
  variant?: Variant,
): ReadonlyArray<ButtonNode> =>
  withVariant(
    actionButtons(
      Array.filter(Catalog.entriesFor(entriesOf(model), token), entry =>
        Array.some(actions, action =>
          Option.exists(
            Catalog.parseChoiceTag(entry.tag),
            choice => choice.tag === action.tag,
          ),
        ),
      ),
    ),
    variant,
  )

const isOffered = (
  entries: ReadonlyArray<Catalog.Entry>,
  tag: string,
): boolean =>
  Option.match(Catalog.parseChoiceTag(tag), {
    onNone: () =>
      Array.some(
        entries,
        entry =>
          entry.tag === tag &&
          entry.isPayloadFree &&
          Catalog.isEnabled(entry.availability),
      ),
    onSome: choice =>
      Array.some(
        entries,
        entry =>
          entry.tag === choice.tag &&
          Option.exists(entry.maybeChoices, choices =>
            Array.some(
              choices.choices,
              offered =>
                offered.token === choice.token &&
                Catalog.isEnabled(offered.availability),
            ),
          ),
      ),
  })

const offeredActionOf = (
  entries: ReadonlyArray<Catalog.Entry>,
  tag: string,
): Pick<ListItem, 'action'> => (isOffered(entries, tag) ? { action: tag } : {})

const byline = (title: Title): string => Array.join(title.authors, ', ')

const coverRatio = 1.5

const pageCoverWidth = 200

const playerCoverWidth = 160

const itemImageSize = 112

const coverOf = (title: Title, width: number): ReadonlyArray<UiNode> =>
  Array.fromOption(
    Option.map(title.maybeCoverUrl, src =>
      Text(`${title.name} cover`, {
        image: { src, width, height: Math.round(width * coverRatio) },
      }),
    ),
  )

const imageOf = (title: Title): Pick<ListItem, 'image'> =>
  Option.match(title.maybeCoverUrl, {
    onNone: () => ({}),
    onSome: src => ({
      image: {
        src,
        width: itemImageSize,
        height: itemImageSize,
        alt: `${title.name} cover`,
      },
    }),
  })

const problemLines = (model: Model): ReadonlyArray<UiNode> =>
  Option.match(model.maybeProblem, {
    onNone: () => [],
    onSome: problem => [
      Text(`Your last change was not saved: ${problem}`, { dim: true }),
    ],
  })

const loadedFor = (model: Model, title: Title): Option.Option<Loaded> =>
  Option.filter(
    Option.map(loadedTitleOf(model), ({ loaded }) => loaded),
    loaded => loaded.slug === title.slug,
  )

const placeFor = (model: Model, title: Title): Milliseconds =>
  Option.match(loadedFor(model, title), {
    onNone: () => resumePlaceOf(model, title.slug),
    onSome: placeOf,
  })

const isStarted = (model: Model, title: Title): boolean =>
  Option.isSome(loadedFor(model, title)) ||
  Option.exists(
    progressOf(model, title.slug),
    progress => progress._tag === 'InProgress',
  )

/**
 * Where a title is, in words: its chapter, once the chapters are here,
 * and what is left.
 */
const placeLineOf = (model: Model, title: Title, place: Milliseconds): string =>
  Array.join(
    [
      ...Array.fromOption(chapterNameAt(model, title.slug, place)),
      TranscriptPlayer.leftWordsOf(title.durationMs - place),
    ],
    ' · ',
  )

/**
 * The chapters of a title as a list, the one playing marked, or a word on
 * why there is no list yet.
 */
const contentsOf = (model: Model, title: Title): UiNode =>
  Option.match(Record_.get(model.chapters, title.slug), {
    onNone: () => Text('Loading the chapters…', { dim: true }),
    onSome: state =>
      M.value(state).pipe(
        M.withReturnType<UiNode>(),
        M.tagsExhaustive({
          ChaptersUnavailable: ({ reason }) =>
            Text(`The chapters could not be read: ${reason}`, { dim: true }),
          ChaptersReady: ({ chapters }) => {
            const maybePlayingNumber = Option.map(
              loadedFor(model, title),
              loaded => chapterAt(chapters, placeOf(loaded)).chapterNumber,
            )
            return List({
              label: 'Chapters',
              items: Array.map(chapters, chapter =>
                chapterItemOf(entriesOf(model), maybePlayingNumber, chapter),
              ),
            })
          },
        }),
      ),
  })

const progressText = (model: Model, title: Title): string => {
  const isFinished = Option.exists(
    progressOf(model, title.slug),
    progress => progress._tag === 'Finished',
  )
  if (isFinished && Option.isNone(loadedFor(model, title))) {
    return 'Finished'
  } else if (isStarted(model, title)) {
    return TranscriptPlayer.leftWordsOf(
      title.durationMs - placeFor(model, title),
    )
  } else {
    return `${TranscriptPlayer.leftWordsOf(title.durationMs).replace(' left', '')}, not started`
  }
}

const progressBarOf = (
  model: Model,
  title: Title,
): Pick<ListItem, 'progress'> =>
  isStarted(model, title)
    ? {
        progress: { value: placeFor(model, title), max: title.durationMs },
      }
    : {}

const withIcon = (
  buttons: ReadonlyArray<ButtonNode>,
  icon: IconName,
  isIconOnly: boolean,
): ReadonlyArray<ButtonNode> =>
  Array.map(buttons, button => ({ ...button, icon, isIconOnly }))

const playOrPauseOf = (
  model: Model,
  title: Title,
  variant: Variant,
  isIconOnly: boolean,
): ReadonlyArray<ButtonNode> =>
  Option.match(loadedFor(model, title), {
    onNone: () =>
      withIcon(
        choiceButtonsOf(model, title.slug, [Listen], variant),
        'Play',
        isIconOnly,
      ),
    onSome: loaded =>
      TranscriptPlayer.isSounding(loaded.player)
        ? withIcon(buttonsOf(model, [Pause], variant), 'Pause', isIconOnly)
        : withIcon(buttonsOf(model, [Play], variant), 'Play', isIconOnly),
  })

type Tab = 'Library' | 'Profile' | 'Neither'

const tabs: ReadonlyArray<
  Readonly<{ action: AnyAction; icon: IconName; tab: Tab }>
> = [
  { action: ShowLibrary, icon: 'Library', tab: 'Library' },
  { action: ShowProfile, icon: 'Profile', tab: 'Profile' },
]

const tabsOf = (model: Model, current: Tab): UiNode =>
  Row(
    {},
    ...Array.flatMap(tabs, ({ action, icon, tab }) =>
      Array.map(buttonsOf(model, [action], 'Tab'), button => ({
        ...button,
        icon,
        isCurrent: tab === current,
      })),
    ),
  )

const nowPlayingOf = (model: Model): ReadonlyArray<UiNode> =>
  Option.match(loadedTitleOf(model), {
    onNone: () => [],
    onSome: ({ title, loaded }) => {
      const entries = entriesOf(model)
      return [
        List({
          label: 'Now playing',
          items: [
            {
              key: `now-${title.slug}`,
              title: title.name,
              lines: [placeLineOf(model, title, placeOf(loaded))],
              ...imageOf(title),
              progress: { value: placeOf(loaded), max: title.durationMs },
              ...offeredActionOf(entries, OpenPlayer.tag),
              isCurrent: true,
              trailing: TranscriptPlayer.miniTransportOf(
                loaded.player,
                entries,
              ),
            },
          ],
        }),
      ]
    },
  })

/**
 * The bar pinned under the library and the profile: what is playing, a
 * press away from its player, then the Library and Profile tabs.
 */
const dockOf = (model: Model, current: Tab): UiNode =>
  Dock(...nowPlayingOf(model), tabsOf(model, current))

const inProgressLimit = 3

const bySavedAtDescending = Order.mapInput(
  Order.flip(Order.Number),
  (progress: TitleProgress) => progress.savedAtMs,
)

const continueTitlesOf = (model: Model): ReadonlyArray<Title> => {
  const loaded = Option.toArray(
    Option.map(loadedTitleOf(model), ({ title }) => title),
  )
  const saved = pipe(
    Option.match(shelfOf(model), {
      onNone: () => [],
      onSome: shelf => shelf.progress,
    }),
    Array.sort(bySavedAtDescending),
    Array.dedupeWith((self, that) => self.slug === that.slug),
    Array.filter(progress => progress._tag === 'InProgress'),
    Array.map(progress => titleOf(model, progress.slug)),
    Array.getSomes,
    Array.filter(
      title => !Array.some(loaded, current => current.slug === title.slug),
    ),
  )
  return Array.take([...loaded, ...saved], inProgressLimit)
}

const continueItemOf = (model: Model, title: Title): ListItem => ({
  key: `continue-${title.slug}`,
  title: title.name,
  lines: [byline(title), progressText(model, title)],
  ...imageOf(title),
  ...progressBarOf(model, title),
  action: `${Open.tag}:${title.slug}`,
  isCurrent: Option.isSome(loadedFor(model, title)),
  trailing: playOrPauseOf(model, title, 'Ghost', true),
})

const titleItemOf = (model: Model, title: Title): ListItem => ({
  key: title.slug,
  title: title.name,
  lines: [byline(title), progressText(model, title)],
  ...imageOf(title),
  ...progressBarOf(model, title),
  action: `${Open.tag}:${title.slug}`,
  trailing: playOrPauseOf(model, title, 'Ghost', true),
})

/**
 * The picture book to show on the library's Read aloud row: the one being
 * read aloud now, else the one read most recently. None before any book
 * has been read aloud.
 */
const readAloudBookOf = (model: Model): Option.Option<ReadAloud.Book> =>
  Option.orElse(
    Option.map(ReadAloud.liveTurnOf(model), ({ book }) => book),
    () => Array.head(ReadAloud.booksOf(model)),
  )

const readAloudSectionOf = (model: Model): ReadonlyArray<UiNode> =>
  Option.match(readAloudBookOf(model), {
    onNone: () => [],
    onSome: book => [
      Text('Read aloud', { dim: true }),
      List({
        label: 'Read aloud',
        items: [
          {
            ...ReadAloud.bookRowOf(model, book),
            key: 'read-aloud',
            ...offeredActionOf(entriesOf(model), ShowReadAloud.tag),
          },
        ],
      }),
    ],
  })

/**
 * A Read Aloud screen inside Books: the shelf, a book on its way, or a
 * page, from Read Aloud with Books' own entries, so a page offers Share
 * the way a moment does, then what the last share said, and the dock with
 * what is playing and the Library and Profile tabs. None for any other
 * place.
 *
 * @example
 * ```typescript
 * readAloudScreen(model, ReadAloud.ReadAloudPage({ book, page: 4 }))
 * // Some(Column: the page, Link copied, Dock(now playing, Library | Profile))
 * ```
 */
export const readAloudScreen = (
  model: Model,
  destination: unknown,
): Option.Option<UiNode> =>
  Option.map(
    ReadAloud.readAloudScreenOf(
      model,
      destination,
      entriesOf(model),
      creditLinks,
    ),
    node =>
      Column({ gap: 1 }, node, ...noticeLines(model), dockOf(model, 'Neither')),
  )

const hrefOf = (maybePath: Option.Option<string>): Pick<ListItem, 'href'> =>
  Option.match(maybePath, {
    onNone: () => ({}),
    onSome: href => ({ href }),
  })

const isAuthorTagged =
  (key: ReadAloud.ContributorKey) =>
  (author: string): boolean =>
    Option.contains(ReadAloud.contributorKeyOf(author), key)

const libraryTitlesBy = (
  model: Model,
  key: ReadAloud.ContributorKey,
): ReadonlyArray<Title> =>
  Array.filter(titlesOf(model), title =>
    Array.some(title.authors, isAuthorTagged(key)),
  )

const contributorNameOf = (
  model: Model,
  key: ReadAloud.ContributorKey,
): string =>
  pipe(
    Option.map(
      ReadAloud.contributorOfKey(model, key),
      contributor => contributor.name,
    ),
    Option.orElse(() =>
      pipe(
        titlesOf(model),
        Array.flatMap(title => title.authors),
        Array.findFirst(isAuthorTagged(key)),
      ),
    ),
    Option.getOrElse(() => nameOfTag(key)),
  )

const roleWordOf = (role: ReadAloud.CreditRole): string =>
  String.toLowerCase(role)

const isRoleHeld = (
  model: Model,
  key: ReadAloud.ContributorKey,
  role: ReadAloud.CreditRole,
): boolean =>
  Array.isReadonlyArrayNonEmpty(ReadAloud.booksCreditingOf(model, role, key)) ||
  (role === 'Author' &&
    Array.isReadonlyArrayNonEmpty(libraryTitlesBy(model, key)))

const otherRoleLinksOf = (
  model: Model,
  page: ContributorPage,
): ReadonlyArray<UiNode> =>
  pipe(
    ReadAloud.CreditRole.literals,
    Array.filter(
      role => role !== page.role && isRoleHeld(model, page.contributor, role),
    ),
    Array.map(role =>
      Option.map(contributorPathOf(role, page.contributor), href =>
        Text(`Also an ${roleWordOf(role)}`, { href }),
      ),
    ),
    Array.getSomes,
  )

const booksReadAloudOf = (
  model: Model,
  books: ReadonlyArray<ReadAloud.Book>,
  noneWords: string,
): ReadonlyArray<UiNode> =>
  M.value(model.readings).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      ReadingsLoading: () => [
        Text('Opening the books you read aloud…', { dim: true }),
      ],
      ReadingsUnavailable: ({ reason }) => [
        Text(`The books you read aloud could not be opened: ${reason}`),
      ],
      ReadingsReady: () =>
        Array.match(books, {
          onEmpty: () => [Text(noneWords, { dim: true })],
          onNonEmpty: credited => [
            Text('Books read aloud', { dim: true }),
            List({
              label: 'Books read aloud',
              items: Array.map(credited, book => ({
                ...ReadAloud.bookRowOf(model, book),
                ...hrefOf(ReadAloud.bookPathOf(book.key)),
              })),
            }),
          ],
        }),
    }),
  )

const inLibraryOf = (
  model: Model,
  page: ContributorPage,
): ReadonlyArray<UiNode> =>
  page.role === 'Author'
    ? Array.match(libraryTitlesBy(model, page.contributor), {
        onEmpty: () => [],
        onNonEmpty: titles => [
          Text('In your library', { dim: true }),
          List({
            label: 'In your library',
            items: Array.map(titles, title => ({
              key: title.slug,
              title: title.name,
              lines: [byline(title), progressText(model, title)],
              ...imageOf(title),
              ...progressBarOf(model, title),
              ...hrefOf(titlePathOf(title.slug)),
            })),
          }),
        ],
      })
    : []

/**
 * One person's page in one role: their name, the role, links to their
 * pages in the other roles books credit them in, the books read aloud that
 * credit them in this role, each a link to the book, and for an author,
 * their audiobooks in the library. What is playing stays pinned at the
 * bottom.
 *
 * @example
 * ```typescript
 * contributorScreen(model, ContributorPage({ role: 'Author', contributor: 'ada-quill' }))
 * // Column: Ada Quill, Author, Also an illustrator, List('Books read aloud'), List('In your library'), Dock
 * ```
 */
export const contributorScreen = (
  model: Model,
  page: ContributorPage,
): UiNode => {
  const name = contributorNameOf(model, page.contributor)
  return Column(
    { gap: 1 },
    Text(name, { emphasis: 'Headline' }),
    Text(page.role, { dim: true }),
    ...otherRoleLinksOf(model, page),
    ...booksReadAloudOf(
      model,
      ReadAloud.booksCreditingOf(model, page.role, page.contributor),
      `No book read aloud names ${name} as an ${roleWordOf(page.role)}.`,
    ),
    ...inLibraryOf(model, page),
    ...noticeLines(model),
    dockOf(model, 'Neither'),
  )
}

/**
 * A publisher's page: its name, and the books read aloud it published,
 * each a link to the book. What is playing stays pinned at the bottom.
 *
 * @example
 * ```typescript
 * publisherScreen(model, PublisherPage({ publisher: 'harbor-house' }))
 * // Column: Harbor House, Publisher, List('Books read aloud'), Dock
 * ```
 */
export const publisherScreen = (model: Model, page: PublisherPage): UiNode => {
  const name = Option.getOrElse(
    Option.map(
      ReadAloud.publisherOfKey(model, page.publisher),
      publisher => publisher.name,
    ),
    () => nameOfTag(page.publisher),
  )
  return Column(
    { gap: 1 },
    Text(name, { emphasis: 'Headline' }),
    Text('Publisher', { dim: true }),
    ...booksReadAloudOf(
      model,
      ReadAloud.booksPublishedByOf(model, page.publisher),
      `No book read aloud names ${name} as its publisher.`,
    ),
    ...noticeLines(model),
    dockOf(model, 'Neither'),
  )
}

const emptyLibraryOf = (model: Model): ReadonlyArray<UiNode> => [
  Text('Your library is empty'),
  Text('Bring in the audiobooks you already own.', { dim: true }),
  Row({}, ...emptyLibraryButtonsOf(model)),
]

const sourcesLine = Array.match(bookSources, {
  onEmpty: () => 'Bring in the audiobooks you own',
  onNonEmpty: sources =>
    sources.length === 1
      ? `${Array.headNonEmpty(sources).line} on ${Array.headNonEmpty(sources).name}`
      : `From ${Array.join(
          Array.map(sources, source => source.name),
          ', ',
        )}`,
})

const addMoreOf = (model: Model): UiNode =>
  List({
    label: 'Add books',
    items: [
      {
        key: 'add-books',
        title: 'Add more of your books',
        lines: [sourcesLine],
        ...offeredActionOf(entriesOf(model), ShowAddBooks.tag),
      },
    ],
  })

const shelfSectionsOf = (model: Model): ReadonlyArray<UiNode> => {
  const continuing = continueTitlesOf(model)
  const others = Array.filter(
    titlesOf(model),
    title => !Array.some(continuing, kept => kept.slug === title.slug),
  )
  return [
    ...Array.match(continuing, {
      onEmpty: () => [],
      onNonEmpty: titles => [
        Text('Continue listening', { dim: true }),
        List({
          label: 'Continue listening',
          items: Array.map(titles, title => continueItemOf(model, title)),
        }),
      ],
    }),
    ...readAloudSectionOf(model),
    ...Array.match(others, {
      onEmpty: () => [],
      onNonEmpty: titles => [
        Text('Your books', { dim: true }),
        List({
          label: 'Your books',
          items: Array.map(titles, title => titleItemOf(model, title)),
        }),
      ],
    }),
    addMoreOf(model),
  ]
}

/**
 * The library, the home: up to three books to continue, the one playing
 * first, the picture book being read aloud, or the last one read, then
 * every other book with who wrote it and how far along it is, and "Add
 * more of your books" last. Pressing a row opens the book; its round
 * button plays it; the Read aloud row opens the books read aloud. An
 * empty shelf says so and offers "Import from Audible" instead. What is
 * playing and the tabs stay pinned at the bottom.
 *
 * @example
 * ```typescript
 * libraryScreen(model)
 * // Column: Library, Continue listening, Read aloud, Your books, Add more of your books, Dock(now playing, Library | Profile)
 * ```
 */
export const libraryScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    Text('Library', { emphasis: 'Headline' }),
    ...problemLines(model),
    ...pipe(model.library, library => {
      if (library._tag === 'ShelfLoading') {
        return [
          Text('Opening your library…', { dim: true }),
          ...readAloudSectionOf(model),
        ]
      } else if (library._tag === 'ShelfUnavailable') {
        return [
          Text(`Your library could not be opened: ${library.reason}`),
          ...readAloudSectionOf(model),
        ]
      } else if (Array.isReadonlyArrayEmpty(titlesOf(model))) {
        return [...emptyLibraryOf(model), ...readAloudSectionOf(model)]
      } else {
        return shelfSectionsOf(model)
      }
    }),
    dockOf(model, 'Library'),
  )

const importRowsOf = (model: Model): ReadonlyArray<UiNode> => [
  Text('Add books', { dim: true }),
  List({
    label: 'Add books',
    items: [
      {
        key: 'import-from-audible',
        title: 'Import from Audible',
        lines: ['Bring in the audiobooks you own'],
        ...offeredActionOf(entriesOf(model), ImportFromAudible.tag),
      },
    ],
  }),
]

/**
 * Who is signed in, through Cloudflare Access, how the library stands:
 * how many books, how many started and finished, and Import from Audible.
 *
 * @example
 * ```typescript
 * profileScreen(model)
 * // Column: Profile, Account (you@example.com), Listening (5 books), Add books (Import from Audible), Dock(Library | Profile)
 * ```
 */
export const profileScreen = (model: Model): UiNode => {
  const titles = titlesOf(model)
  const finished = Array.filter(titles, title =>
    Option.exists(
      progressOf(model, title.slug),
      progress => progress._tag === 'Finished',
    ),
  ).length
  const started = Array.filter(titles, title => isStarted(model, title)).length
  return Column(
    { gap: 1 },
    Text('Profile', { emphasis: 'Headline' }),
    ...Option.match(model.maybeMember, {
      onNone: () => [Text('Signing in…', { dim: true })],
      onSome: email => [
        Text('Account', { dim: true }),
        List({
          label: 'Account',
          items: [
            {
              key: 'member',
              title: email,
              lines: ['Signed in with Cloudflare Access'],
            },
          ],
        }),
      ],
    }),
    Text('Listening', { dim: true }),
    List({
      label: 'Listening',
      items: [
        {
          key: 'counts',
          title: `${titles.length.toString()} books`,
          lines: [
            `${started.toString()} in progress · ${finished.toString()} finished`,
          ],
        },
      ],
    }),
    ...importRowsOf(model),
    dockOf(model, 'Profile'),
  )
}

/**
 * Connecting Audible, at `/books/audible/connect`: open Amazon's sign-in,
 * then paste the address it lands on.
 */
export const audibleConnectScreen = (model: Model): UiNode =>
  Audible.connectScreen(
    { page: 'Connect', audible: model.audible },
    entriesOf(model),
  )

/**
 * The family member's Audible titles, at `/books/audible`: choose, import,
 * and go back to the library with them on it.
 */
export const audibleTitlesScreen = (model: Model): UiNode =>
  Audible.titlesScreen(
    { page: 'Titles', audible: model.audible },
    entriesOf(model),
    {
      reconnect: buttonsOf(model, [ReconnectAudible], 'Primary'),
      openLibrary: Array.map(
        buttonsOf(model, [ShowLibrary], 'Primary'),
        button => ({ ...button, label: 'Go to your library' }),
      ),
    },
  )

const bookmarkItemOf = (
  model: Model,
  title: Title,
  bookmark: Readonly<{ bookmarkId: BookmarkId; atMs: Milliseconds }>,
): ListItem => ({
  key: bookmark.bookmarkId,
  href: placePathOf(title.slug, bookmark.atMs),
  title: clockOf(bookmark.atMs),
  lines: Array.fromOption(chapterNameAt(model, title.slug, bookmark.atMs)),
  trailing: choiceButtonsOf(
    model,
    bookmark.bookmarkId,
    [DeleteBookmark],
    'Ghost',
  ),
})

const bookmarkLists = (model: Model, title: Title): ReadonlyArray<UiNode> =>
  Array.match(bookmarksOf(model, title.slug), {
    onEmpty: () => [],
    onNonEmpty: bookmarks => [
      Text('Bookmarks', { dim: true }),
      List({
        label: 'Bookmarks',
        items: Array.map(bookmarks, bookmark =>
          bookmarkItemOf(model, title, bookmark),
        ),
      }),
    ],
  })

const authorLinksOf = (title: Title): ReadonlyArray<UiNode> =>
  Array.match(title.authors, {
    onEmpty: () => [],
    onNonEmpty: authors => [
      Row(
        { gap: 1 },
        ...Array.map(authors, author =>
          Option.match(
            Option.flatMap(ReadAloud.contributorKeyOf(author), key =>
              contributorPathOf('Author', key),
            ),
            {
              onNone: () => Text(author),
              onSome: href => Text(author, { href }),
            },
          ),
        ),
      ),
    ],
  })

const narratorLines = (title: Title): ReadonlyArray<UiNode> =>
  Array.match(title.narrators, {
    onEmpty: () => [],
    onNonEmpty: narrators => [
      Text(`Read by ${Array.join(narrators, ', ')}`, { dim: true }),
    ],
  })

/**
 * One book's page: its cover, who wrote it, each author a link to their
 * page, who reads it, how far the listener is, Play and Contents, and its
 * bookmarks, each a link to its moment. What is playing stays pinned at
 * the bottom.
 */
export const titleScreen = (model: Model, title: Title): UiNode =>
  Column(
    { gap: 1 },
    ...coverOf(title, pageCoverWidth),
    Text(title.name, { emphasis: 'Headline' }),
    ...authorLinksOf(title),
    ...narratorLines(title),
    Progress({
      value: placeFor(model, title),
      max: title.durationMs,
      label: progressText(model, title),
    }),
    Text(progressText(model, title), { dim: true }),
    ...problemLines(model),
    Row(
      {},
      ...playOrPauseOf(model, title, 'Primary', false),
      ...withIcon(buttonsOf(model, [ShowContents], 'Ghost'), 'Chapters', false),
    ),
    ...bookmarkLists(model, title),
    dockOf(model, 'Neither'),
  )

const noticeLines = (model: Model): ReadonlyArray<UiNode> =>
  Array.fromOption(
    Option.map(model.maybeNotice, notice => Text(notice, { dim: true })),
  )

const timelineLines = (model: Model): ReadonlyArray<UiNode> =>
  Array.fromOption(
    Option.map(model.maybeTimelineProblem, problem =>
      Text(`Scribe’s timeline did not get this listen: ${problem}`, {
        dim: true,
      }),
    ),
  )

const collapsedControlsOf = (
  model: Model,
  title: Title,
  loaded: Loaded,
): UiNode =>
  List({
    label: 'Player',
    items: [
      {
        key: `controls-${title.slug}`,
        title: Option.getOrElse(
          chapterNameAt(model, title.slug, placeOf(loaded)),
          () => title.name,
        ),
        lines: [
          TranscriptPlayer.leftWordsOf(title.durationMs - placeOf(loaded)),
        ],
        ...imageOf(title),
        progress: { value: placeOf(loaded), max: title.durationMs },
        ...offeredActionOf(entriesOf(model), ExpandControls.tag),
        trailing: [
          ...TranscriptPlayer.miniTransportOf(loaded.player, entriesOf(model)),
          ...withIcon(
            buttonsOf(model, [ExpandControls], 'Ghost'),
            'Expand',
            true,
          ),
        ],
      },
    ],
  })

const expandedControlsOf = (model: Model, loaded: Loaded): UiNode =>
  Column(
    { gap: 1 },
    Row(
      {},
      ...withIcon(
        buttonsOf(model, [CollapseControls], 'Ghost'),
        'Collapse',
        true,
      ),
    ),
    TranscriptPlayer.seekBarOf(loaded.player),
    TranscriptPlayer.timesOf(loaded.player),
    ...TranscriptPlayer.seekScopeOf(loaded.player, entriesOf(model)),
    TranscriptPlayer.transportOf(loaded.player, entriesOf(model)),
    Row(
      {},
      ...withIcon(buttonsOf(model, [ShowContents], 'Ghost'), 'Chapters', false),
      ...Array.map(
        withIcon(buttonsOf(model, [ShowSpeeds], 'Ghost'), 'Speed', false),
        button => ({ ...button, label: `${model.speed.toString()}×` }),
      ),
      ...withIcon(buttonsOf(model, [AddBookmark], 'Ghost'), 'Bookmark', false),
      ...withIcon(buttonsOf(model, [SharePlace], 'Ghost'), 'Share', false),
    ),
  )

/**
 * The player for the book its address names, read and listen: the words
 * fill the screen, the one sounding marked, and the controls sit pinned
 * under them, folded into a bar with back 30 seconds and Play until
 * opened for the chapter bar, chapters, speed, bookmarks, and sharing.
 * Without that book in the player, it offers to play it from the
 * listener's place.
 *
 * @example
 * ```typescript
 * playerScreen(model)
 * // Column: Transcript, Dock(Chapter 3: Liberty · 10h 1m left [↺30] [▶] [▴])
 * ```
 */
export const playerScreen = (model: Model): UiNode =>
  Option.match(
    Option.flatMap(shownTitleOf(model), slug => titleOf(model, slug)),
    {
      onNone: () =>
        Column(
          {},
          Text('Now playing', { emphasis: 'Headline' }),
          Text('This title is not in your library.', { dim: true }),
        ),
      onSome: title =>
        Option.match(loadedFor(model, title), {
          onNone: () =>
            Column(
              { gap: 1 },
              ...coverOf(title, playerCoverWidth),
              Text(title.name, { emphasis: 'Headline' }),
              ...Array.fromOption(
                Option.map(
                  chapterNameAt(model, title.slug, placeFor(model, title)),
                  name => Text(name, { dim: true }),
                ),
              ),
              Progress({
                value: placeFor(model, title),
                max: title.durationMs,
                label: progressText(model, title),
              }),
              Text(progressText(model, title), { dim: true }),
              Row({}, ...playOrPauseOf(model, title, 'Primary', false)),
            ),
          onSome: loaded =>
            Column(
              { gap: 1 },
              Text(title.name, { dim: true }),
              TranscriptPlayer.transcriptOf(loaded.player),
              Dock(
                ...TranscriptPlayer.problemOf(loaded.player),
                ...problemLines(model),
                ...timelineLines(model),
                ...noticeLines(model),
                model.controls === 'Expanded'
                  ? expandedControlsOf(model, loaded)
                  : collapsedControlsOf(model, title, loaded),
              ),
            ),
        }),
    },
  )

const chapterItemOf = (
  entries: ReadonlyArray<Catalog.Entry>,
  maybePlayingNumber: Option.Option<number>,
  chapter: Chapter,
): ListItem => {
  const token = chapter.chapterNumber.toString()
  return {
    key: token,
    title: chapter.name,
    lines: [
      `${clockOf(chapter.startMs)} · ${clockOf(Milliseconds.make(chapter.endMs - chapter.startMs))}`,
    ],
    ...offeredActionOf(entries, `${JumpToChapter.tag}:${token}`),
    isCurrent: Option.contains(maybePlayingNumber, chapter.chapterNumber),
  }
}

/**
 * The chapters of the title on screen: pressing one plays from its start
 * on the player. The one playing is marked.
 */
export const contentsScreen = (model: Model): UiNode =>
  Option.match(
    Option.flatMap(shownTitleOf(model), slug => titleOf(model, slug)),
    {
      onNone: () => Column({}, Text('No title is open.', { dim: true })),
      onSome: title =>
        Column(
          { gap: 1 },
          Text('Contents', {
            emphasis: 'Headline',
            label: `${title.name} contents`,
          }),
          contentsOf(model, title),
        ),
    },
  )

/** The speeds, each a button; the one playing now is marked current. */
export const speedScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    Text('Speed', { emphasis: 'Headline' }),
    Row(
      { gap: 1 },
      ...Array.map(
        withVariant(
          actionButtons(
            Array.flatMap(
              Array.filter(
                entriesOf(model),
                entry => entry.tag === SetSpeed.tag,
              ),
              Catalog.choicesAsEntries,
            ),
          ),
          'Ghost',
        ),
        button => ({
          ...button,
          isCurrent: Option.exists(
            Catalog.parseChoiceTag(button.action ?? ''),
            choice => choice.token === model.speed.toString(),
          ),
        }),
      ),
    ),
  )

/**
 * The question "Delete the bookmark at 12:03?" with Delete and Cancel.
 * Its Delete deletes only the bookmark it names.
 */
export const deleteBookmarkScreen = (
  model: Model,
  bookmarkId: BookmarkId,
): UiNode =>
  Option.match(bookmarkOf(model, bookmarkId), {
    onNone: () =>
      Column(
        {},
        Text('That bookmark is gone.'),
        Row({}, ...buttonsOf(model, [CancelDeleteBookmark], 'Ghost')),
      ),
    onSome: bookmark =>
      Column(
        { gap: 1 },
        Text(`Delete the bookmark at ${clockOf(bookmark.atMs)}?`, {
          emphasis: 'Headline',
        }),
        Row(
          { gap: 1 },
          ...choiceButtonsOf(
            model,
            bookmarkId,
            [ConfirmDeleteBookmark],
            'Destructive',
          ),
          ...buttonsOf(model, [CancelDeleteBookmark], 'Ghost'),
        ),
      ),
  })

/**
 * The page for a title that is not on the shelf, because another device
 * removed it or a URI named one that never existed.
 */
export const missingTitleScreen = (slug: TitleSlug): UiNode =>
  Column(
    {},
    Text(`${slug} is not in your library`),
    Text('Go back to the library.', { dim: true }),
  )
