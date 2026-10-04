import { Array, Option, Order, pipe } from 'effect'
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
import * as TranscriptPlayer from 'transcript-player-core-example'

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
  loadedTitleOf,
  placeOf,
  progressOf,
  resumePlaceOf,
  shelfOf,
  titleOf,
  titlesOf,
} from './model.js'
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

const isOffered = (model: Model, tag: string): boolean =>
  Option.isSome(Catalog.messageFor(catalog, model, tag))

const offeredActionOf = (
  model: Model,
  tag: string,
): Pick<ListItem, 'action'> => (isOffered(model, tag) ? { action: tag } : {})

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
    onSome: ({ title, loaded }) => [
      List({
        label: 'Now playing',
        items: [
          {
            key: `now-${title.slug}`,
            title: title.name,
            lines: [
              `${chapterAt(title, placeOf(loaded)).name} · ${TranscriptPlayer.leftWordsOf(title.durationMs - placeOf(loaded))}`,
            ],
            ...imageOf(title),
            progress: { value: placeOf(loaded), max: title.durationMs },
            ...offeredActionOf(model, OpenPlayer.tag),
            isCurrent: true,
            trailing: TranscriptPlayer.miniTransportOf(
              loaded.player,
              entriesOf(model),
            ),
          },
        ],
      }),
    ],
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
 * The library, the home: up to three books to continue, the one playing
 * first, then every other book with who wrote it and how far along it is.
 * Pressing a row opens the book; its round button plays it. What is
 * playing and the tabs stay pinned at the bottom.
 *
 * @example
 * ```typescript
 * libraryScreen(model)
 * // Column: Library, Continue listening, Your books, Dock(now playing, Library | Profile)
 * ```
 */
export const libraryScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    Text('Library', { emphasis: 'Headline' }),
    ...problemLines(model),
    ...pipe(model.library, library => {
      if (library._tag === 'ShelfLoading') {
        return [Text('Opening your library…', { dim: true })]
      } else if (library._tag === 'ShelfUnavailable') {
        return [Text(`Your library could not be opened: ${library.reason}`)]
      } else {
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
        ]
      }
    }),
    dockOf(model, 'Library'),
  )

/**
 * Who is signed in, through Cloudflare Access, and how the library stands:
 * how many books, how many started and finished.
 *
 * @example
 * ```typescript
 * profileScreen(model)
 * // Column: Profile, Account (you@example.com), Listening (5 books), Dock(Library | Profile)
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
    dockOf(model, 'Profile'),
  )
}

const bookmarkItemOf = (
  model: Model,
  title: Title,
  bookmark: Readonly<{ bookmarkId: BookmarkId; atMs: Milliseconds }>,
): ListItem => ({
  key: bookmark.bookmarkId,
  href: placePathOf(title.slug, bookmark.atMs),
  title: clockOf(bookmark.atMs),
  lines: [chapterAt(title, bookmark.atMs).name],
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

const narratorLines = (title: Title): ReadonlyArray<UiNode> =>
  Array.match(title.narrators, {
    onEmpty: () => [],
    onNonEmpty: narrators => [
      Text(`Read by ${Array.join(narrators, ', ')}`, { dim: true }),
    ],
  })

/**
 * One book's page: its cover, who wrote and reads it, how far the
 * listener is, Play and Contents, and its bookmarks, each a link to its
 * moment. What is playing stays pinned at the bottom.
 */
export const titleScreen = (model: Model, title: Title): UiNode =>
  Column(
    { gap: 1 },
    ...coverOf(title, pageCoverWidth),
    Text(title.name, { emphasis: 'Headline' }),
    Text(byline(title)),
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
        title: chapterAt(title, placeOf(loaded)).name,
        lines: [
          TranscriptPlayer.leftWordsOf(title.durationMs - placeOf(loaded)),
        ],
        ...imageOf(title),
        progress: { value: placeOf(loaded), max: title.durationMs },
        ...offeredActionOf(model, ExpandControls.tag),
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
              Text(chapterAt(title, placeFor(model, title)).name, {
                dim: true,
              }),
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
  model: Model,
  title: Title,
  chapter: Chapter,
): ListItem => {
  const token = chapter.chapterNumber.toString()
  return {
    key: token,
    title: chapter.name,
    lines: [
      `${clockOf(chapter.startMs)} · ${clockOf(Milliseconds.make(chapter.endMs - chapter.startMs))}`,
    ],
    ...offeredActionOf(model, `${JumpToChapter.tag}:${token}`),
    isCurrent: Option.exists(
      loadedFor(model, title),
      loaded =>
        chapterAt(title, placeOf(loaded)).chapterNumber ===
        chapter.chapterNumber,
    ),
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
          List({
            label: 'Chapters',
            items: Array.map(title.chapters, chapter =>
              chapterItemOf(model, title, chapter),
            ),
          }),
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
