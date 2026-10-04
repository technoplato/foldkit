import { Array, Option, pipe } from 'effect'
import { Catalog } from 'foldkit'
import {
  Column,
  Row,
  Text,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'

import {
  type BookmarkId,
  type ChapterNumber,
  Milliseconds,
  type TitleSlug,
  clockOf,
} from './ids.js'
import {
  AddBookmark,
  CancelDeleteBookmark,
  ConfirmDeleteBookmark,
  DeleteBookmark,
  JumpToChapter,
  Open,
  OpenChapter,
  OpenPlayer,
  Pause,
  Play,
  PlayBookmark,
  SetSpeed,
  ShowContents,
  ShowSpeeds,
  SkipBack,
  SkipForward,
  catalog,
} from './message.js'
import {
  type Chapter,
  type Model,
  type Title,
  type Transport,
  bookmarkOf,
  bookmarksOf,
  chapterAt,
  continueOf,
  loadedTitleOf,
  progressOf,
  titleOf,
  titlesOf,
} from './model.js'
import { shownTitleOf } from './stack.js'

// VIEW

type AnyAction = Readonly<{ tag: string }>

const entriesOf = (model: Model): ReadonlyArray<Catalog.Entry> =>
  Catalog.entries(catalog, model)

const buttonsOf = (
  model: Model,
  actions: ReadonlyArray<AnyAction>,
): ReadonlyArray<UiNode> =>
  actionButtons(
    Array.filter(entriesOf(model), entry =>
      Array.some(actions, action => action.tag === entry.tag),
    ),
  )

const choiceButtonsOf = (
  model: Model,
  token: string,
  actions: ReadonlyArray<AnyAction>,
): ReadonlyArray<UiNode> =>
  actionButtons(
    Array.filter(Catalog.entriesFor(entriesOf(model), token), entry =>
      Array.some(actions, action =>
        Option.exists(
          Catalog.parseChoiceTag(entry.tag),
          choice => choice.tag === action.tag,
        ),
      ),
    ),
  )

const byline = (title: Title): string => Array.join(title.authors, ', ')

const coverRatio = 1.5

const coverOf = (title: Title, width: number): ReadonlyArray<UiNode> =>
  Array.fromOption(
    Option.map(title.maybeCoverUrl, src =>
      Text(`${title.name} cover`, {
        image: { src, width, height: Math.round(width * coverRatio) },
      }),
    ),
  )

const rowCoverWidth = 48

const pageCoverWidth = 160

const problemLines = (model: Model): ReadonlyArray<UiNode> =>
  Option.match(model.maybeProblem, {
    onNone: () => [],
    onSome: problem => [
      Text(`Your last change was not saved: ${problem}`, { dim: true }),
    ],
  })

const unplayableLines = (transport: Transport): ReadonlyArray<UiNode> =>
  transport._tag === 'Unplayable'
    ? [Text(`The audio would not play: ${transport.reason}`, { dim: true })]
    : []

const progressText = (model: Model, title: Title): string =>
  Option.match(progressOf(model, title.slug), {
    onNone: () => `${clockOf(title.durationMs)}, not started`,
    onSome: progress =>
      progress._tag === 'Finished'
        ? 'Finished'
        : `${clockOf(Milliseconds.make(Math.max(0, title.durationMs - progress.placeMs)))} left`,
  })

const continueLines = (model: Model): ReadonlyArray<UiNode> =>
  Option.match(
    Option.flatMap(continueOf(model), progress =>
      Option.map(titleOf(model, progress.slug), title => ({ title, progress })),
    ),
    {
      onNone: () => [],
      onSome: ({ title, progress }) => [
        Text('Continue listening', { dim: true }),
        Row(
          {},
          ...coverOf(title, rowCoverWidth),
          Text(title.name),
          Text(
            `${chapterAt(title, progress.placeMs).name}, ${clockOf(progress.placeMs)}`,
            { dim: true },
          ),
          ...choiceButtonsOf(model, title.slug, [Play]),
        ),
      ],
    },
  )

const titleLine = (model: Model, title: Title): UiNode =>
  Row(
    {},
    ...coverOf(title, rowCoverWidth),
    Text(title.name),
    Text(byline(title), { dim: true }),
    Text(progressText(model, title), { dim: true }),
    ...choiceButtonsOf(model, title.slug, [Play, Open]),
  )

const nowPlayingLines = (model: Model): ReadonlyArray<UiNode> =>
  Option.match(loadedTitleOf(model), {
    onNone: () => [],
    onSome: ({ title, loaded }) => [
      Row(
        {},
        Text(`Now playing: ${title.name}`, { dim: true }),
        Text(clockOf(loaded.placeMs), { dim: true }),
        ...buttonsOf(model, [OpenPlayer, Pause]),
      ),
    ],
  })

/**
 * The library: the title to continue, every title with its progress and
 * Play and Open, and what is playing on this device.
 *
 * @example
 * ```typescript
 * libraryScreen(model)
 * // Column: Text('Library'), Continue listening, Row: The Lantern Keeper  Ada Quill  4:12:00 left  [Play] [Open], ...
 * ```
 */
export const libraryScreen = (model: Model): UiNode =>
  Column(
    {},
    Text('Library', { emphasis: 'Display' }),
    ...problemLines(model),
    ...pipe(model.library, library => {
      if (library._tag === 'ShelfLoading') {
        return [Text('Opening your library…', { dim: true })]
      } else if (library._tag === 'ShelfUnavailable') {
        return [Text(`Your library could not be opened: ${library.reason}`)]
      } else {
        return Array.match(titlesOf(model), {
          onEmpty: () => [Text('Your library is empty.', { dim: true })],
          onNonEmpty: titles => [
            ...continueLines(model),
            ...nowPlayingLines(model),
            ...Array.map(titles, title => titleLine(model, title)),
          ],
        })
      }
    }),
  )

const bookmarkLines = (model: Model, title: Title): ReadonlyArray<UiNode> =>
  Array.match(bookmarksOf(model, title.slug), {
    onEmpty: () => [],
    onNonEmpty: bookmarks => [
      Text('Bookmarks', { dim: true }),
      ...Array.map(bookmarks, bookmark =>
        Row(
          {},
          Text(
            `${clockOf(bookmark.atMs)}, ${chapterAt(title, bookmark.atMs).name}`,
          ),
          ...choiceButtonsOf(model, bookmark.bookmarkId, [
            PlayBookmark,
            DeleteBookmark,
          ]),
        ),
      ),
    ],
  })

/**
 * One title's page: who wrote and reads it, how far the listener is, Play
 * and Contents, and its bookmarks.
 */
export const titleScreen = (model: Model, title: Title): UiNode =>
  Column(
    {},
    ...coverOf(title, pageCoverWidth),
    Text(title.name, { emphasis: 'Display' }),
    Text(byline(title)),
    ...Array.match(title.narrators, {
      onEmpty: () => [],
      onNonEmpty: narrators => [
        Text(`Read by ${Array.join(narrators, ', ')}`, { dim: true }),
      ],
    }),
    Text(progressText(model, title), { dim: true }),
    ...problemLines(model),
    Row(
      {},
      ...choiceButtonsOf(model, title.slug, [Play]),
      ...buttonsOf(model, [ShowContents]),
    ),
    ...bookmarkLines(model, title),
  )

const barCells = 20

const progressBar = (place: Milliseconds, duration: Milliseconds): string => {
  const filled = duration === 0 ? 0 : Math.round((place / duration) * barCells)
  return `${'█'.repeat(filled)}${'·'.repeat(barCells - filled)}`
}

/**
 * The player: the title and chapter, where it is of how long, a bar, the
 * transport, and Contents, Speed, and Bookmark. With nothing loaded it
 * says so.
 *
 * @example
 * ```typescript
 * playerScreen(model)
 * // Column: Text('The Lantern Keeper'), Text('Chapter 2: The Tide'), Text('12:03 / 4:12:00'), [−30s] [Pause] [+30s], [Contents] [Speed] [Bookmark]
 * ```
 */
export const playerScreen = (model: Model): UiNode =>
  Option.match(loadedTitleOf(model), {
    onNone: () =>
      Column(
        {},
        Text('Now playing', { emphasis: 'Display' }),
        Text('Nothing is playing. Pick a title in your library.', {
          dim: true,
        }),
      ),
    onSome: ({ title, loaded }) =>
      Column(
        {},
        ...coverOf(title, pageCoverWidth),
        Text(title.name, { emphasis: 'Display' }),
        Text(chapterAt(title, loaded.placeMs).name),
        Text(`${clockOf(loaded.placeMs)} / ${clockOf(title.durationMs)}`, {
          mono: true,
          label: `${clockOf(loaded.placeMs)} of ${clockOf(title.durationMs)}`,
        }),
        Text(progressBar(loaded.placeMs, title.durationMs), {
          mono: true,
          dim: true,
        }),
        ...problemLines(model),
        ...unplayableLines(loaded.transport),
        Row(
          {},
          ...buttonsOf(model, [SkipBack]),
          ...(loaded.transport._tag === 'Playing'
            ? buttonsOf(model, [Pause])
            : choiceButtonsOf(model, title.slug, [Play])),
          ...buttonsOf(model, [SkipForward]),
        ),
        Row(
          {},
          ...buttonsOf(model, [ShowContents, ShowSpeeds, AddBookmark]),
          Text(`${model.speed.toString()}×`, { dim: true }),
        ),
      ),
  })

/**
 * One chapter's page, the link to that section: the title, the chapter,
 * where it starts and how long it runs, Play, and the address to share.
 */
export const chapterScreen = (
  model: Model,
  title: Title,
  chapter: Chapter,
  maybeUri: Option.Option<string>,
): UiNode =>
  Column(
    {},
    Text(title.name, { dim: true }),
    Text(chapter.name, { emphasis: 'Display' }),
    Text(
      `Starts at ${clockOf(chapter.startMs)}, runs ${clockOf(Milliseconds.make(chapter.endMs - chapter.startMs))}`,
      { dim: true },
    ),
    Row(
      {},
      ...choiceButtonsOf(model, chapter.chapterNumber.toString(), [
        JumpToChapter,
      ]),
    ),
    ...Array.fromOption(
      Option.map(maybeUri, uri => Text(uri, { mono: true, copyable: true })),
    ),
  )

/** The chapters of the title on screen, each with Play and Open. */
export const contentsScreen = (model: Model): UiNode =>
  Option.match(
    Option.flatMap(shownTitleOf(model), slug => titleOf(model, slug)),
    {
      onNone: () => Column({}, Text('No title is open.', { dim: true })),
      onSome: title =>
        Column(
          {},
          Text('Contents', { label: `${title.name} contents` }),
          ...Array.map(title.chapters, chapter =>
            Row(
              {},
              Text(chapter.name),
              Text(clockOf(chapter.startMs), { dim: true }),
              ...choiceButtonsOf(model, chapter.chapterNumber.toString(), [
                JumpToChapter,
                OpenChapter,
              ]),
            ),
          ),
        ),
    },
  )

/** The speeds, each a button; the one playing now is greyed out. */
export const speedScreen = (model: Model): UiNode =>
  Column(
    {},
    Text('Speed'),
    Row(
      {},
      ...actionButtons(
        Array.flatMap(
          Array.filter(entriesOf(model), entry => entry.tag === SetSpeed.tag),
          Catalog.choicesAsEntries,
        ),
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
        Row({}, ...buttonsOf(model, [CancelDeleteBookmark])),
      ),
    onSome: bookmark =>
      Column(
        {},
        Text(`Delete the bookmark at ${clockOf(bookmark.atMs)}?`, {
          emphasis: 'Display',
        }),
        Row(
          {},
          ...choiceButtonsOf(model, bookmarkId, [ConfirmDeleteBookmark]),
          ...buttonsOf(model, [CancelDeleteBookmark]),
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

/** The page for a chapter the title does not have. */
export const missingChapterScreen = (chapterNumber: ChapterNumber): UiNode =>
  Column(
    {},
    Text(`This title has no chapter ${chapterNumber.toString()}`),
    Text('Go back to the title.', { dim: true }),
  )
