import { Array, Option, pipe } from 'effect'
import { Catalog } from 'foldkit'
import {
  type ButtonNode,
  Column,
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
  Listen,
  Open,
  OpenChapter,
  OpenPlayer,
  Pause,
  Play,
  PlayBookmark,
  SetSpeed,
  ShowContents,
  ShowSpeeds,
  catalog,
} from './message.js'
import {
  type Chapter,
  type Loaded,
  type Model,
  type Title,
  bookmarkOf,
  bookmarksOf,
  chapterAt,
  continueOf,
  loadedTitleOf,
  placeOf,
  progressOf,
  resumePlaceOf,
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

const leftOf = (title: Title, placeMs: Milliseconds): string =>
  `${clockOf(Milliseconds.make(Math.max(0, title.durationMs - placeMs)))} left`

const progressText = (model: Model, title: Title): string =>
  Option.match(progressOf(model, title.slug), {
    onNone: () => `${clockOf(title.durationMs)}, not started`,
    onSome: progress =>
      progress._tag === 'Finished'
        ? 'Finished'
        : leftOf(title, progress.placeMs),
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

const progressBarOf = (
  model: Model,
  title: Title,
): Pick<ListItem, 'progress'> =>
  Option.match(progressOf(model, title.slug), {
    onNone: () => ({}),
    onSome: progress => ({
      progress: {
        value:
          progress._tag === 'Finished'
            ? title.durationMs
            : placeFor(model, title),
        max: title.durationMs,
      },
    }),
  })

const playOrPauseOf = (
  model: Model,
  title: Title,
  variant: Variant,
): ReadonlyArray<ButtonNode> =>
  Option.match(loadedFor(model, title), {
    onNone: () => choiceButtonsOf(model, title.slug, [Listen], variant),
    onSome: loaded =>
      buttonsOf(
        model,
        [TranscriptPlayer.isSounding(loaded.player) ? Pause : Play],
        variant,
      ),
  })

const continueActionOf = (
  model: Model,
  title: Title,
): Pick<ListItem, 'action'> =>
  Option.isSome(loadedFor(model, title))
    ? offeredActionOf(model, OpenPlayer.tag)
    : offeredActionOf(model, `${Listen.tag}:${title.slug}`)

const continueItemOf = (model: Model, title: Title): ListItem => ({
  key: `continue-${title.slug}`,
  title: title.name,
  lines: [
    chapterAt(title, placeFor(model, title)).name,
    leftOf(title, placeFor(model, title)),
  ],
  ...imageOf(title),
  progress: { value: placeFor(model, title), max: title.durationMs },
  ...continueActionOf(model, title),
  isCurrent: Option.isSome(loadedFor(model, title)),
  trailing: playOrPauseOf(model, title, 'Primary'),
})

const continueOfModel = (model: Model): Option.Option<Title> =>
  Option.orElse(
    Option.map(loadedTitleOf(model), ({ title }) => title),
    () =>
      Option.flatMap(continueOf(model), progress =>
        titleOf(model, progress.slug),
      ),
  )

const titleItemOf = (model: Model, title: Title): ListItem => ({
  key: title.slug,
  title: title.name,
  lines: [byline(title), progressText(model, title)],
  ...imageOf(title),
  ...progressBarOf(model, title),
  action: `${Open.tag}:${title.slug}`,
  isCurrent: Option.isSome(loadedFor(model, title)),
  trailing: playOrPauseOf(model, title, 'Ghost'),
})

/**
 * The library: the title to continue, or the one in the player, then
 * every title with who wrote it, how far the listener is, and Play.
 * Pressing a row opens the title.
 *
 * @example
 * ```typescript
 * libraryScreen(model)
 * // Column: Library, List('Continue listening'), List('Your books')
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
        return Array.match(titlesOf(model), {
          onEmpty: () => [Text('Your library is empty.', { dim: true })],
          onNonEmpty: titles => [
            ...Array.fromOption(
              Option.map(continueOfModel(model), title =>
                List({
                  label: 'Continue listening',
                  items: [continueItemOf(model, title)],
                }),
              ),
            ),
            List({
              label: 'Your books',
              items: Array.map(titles, title => titleItemOf(model, title)),
            }),
          ],
        })
      }
    }),
  )

const bookmarkItemOf = (
  model: Model,
  title: Title,
  bookmark: Readonly<{ bookmarkId: BookmarkId; atMs: Milliseconds }>,
): ListItem => ({
  key: bookmark.bookmarkId,
  title: clockOf(bookmark.atMs),
  lines: [chapterAt(title, bookmark.atMs).name],
  ...offeredActionOf(model, `${PlayBookmark.tag}:${bookmark.bookmarkId}`),
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
 * One title's page: its cover, who wrote and reads it, how far the
 * listener is, Play and Contents, and its bookmarks.
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
      { gap: 1 },
      ...playOrPauseOf(model, title, 'Primary'),
      ...buttonsOf(model, [ShowContents], 'Ghost'),
    ),
    ...bookmarkLists(model, title),
  )

/**
 * The player for the title its address names. With that title in this
 * device's player: the cover, the chapter, the seek bar and times, the
 * transport, Contents, Speed, and Bookmark, and the words to read along
 * with. Otherwise it offers to play the title from the listener's place.
 *
 * @example
 * ```typescript
 * playerScreen(model)
 * // Column: cover, A New Earth, Evocation, Seek, 3:18 −9:09:43, [−30s] [Pause] [+30s], Transcript
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
              Row({}, ...playOrPauseOf(model, title, 'Primary')),
            ),
          onSome: loaded =>
            Column(
              { gap: 1 },
              List({
                label: 'Now playing',
                items: [
                  {
                    key: title.slug,
                    title: title.name,
                    lines: [
                      byline(title),
                      chapterAt(title, placeOf(loaded)).name,
                    ],
                    ...imageOf(title),
                  },
                ],
              }),
              TranscriptPlayer.seekBarOf(loaded.player),
              TranscriptPlayer.timesOf(loaded.player),
              TranscriptPlayer.transportOf(loaded.player, entriesOf(model)),
              ...TranscriptPlayer.problemOf(loaded.player),
              ...problemLines(model),
              Row(
                { gap: 1 },
                ...buttonsOf(
                  model,
                  [ShowContents, ShowSpeeds, AddBookmark],
                  'Ghost',
                ),
                Text(`${model.speed.toString()}×`, { dim: true }),
              ),
              TranscriptPlayer.transcriptOf(loaded.player),
            ),
        }),
    },
  )

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
    { gap: 1 },
    Text(title.name, { dim: true }),
    Text(chapter.name, { emphasis: 'Headline' }),
    Text(
      `Starts at ${clockOf(chapter.startMs)}, runs ${clockOf(Milliseconds.make(chapter.endMs - chapter.startMs))}`,
      { dim: true },
    ),
    Row(
      {},
      ...choiceButtonsOf(
        model,
        chapter.chapterNumber.toString(),
        [JumpToChapter],
        'Primary',
      ),
    ),
    ...Array.fromOption(
      Option.map(maybeUri, uri => Text(uri, { mono: true, copyable: true })),
    ),
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
    trailing: choiceButtonsOf(model, token, [OpenChapter], 'Ghost'),
  }
}

/**
 * The chapters of the title on screen: pressing one plays from its start,
 * and Open shows its own page, the link to share. The one playing is
 * marked.
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

/** The speeds, each a button; the one playing now is greyed out. */
export const speedScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    Text('Speed', { emphasis: 'Headline' }),
    Row(
      { gap: 1 },
      ...withVariant(
        actionButtons(
          Array.flatMap(
            Array.filter(entriesOf(model), entry => entry.tag === SetSpeed.tag),
            Catalog.choicesAsEntries,
          ),
        ),
        'Ghost',
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

/** The page for a chapter the title does not have. */
export const missingChapterScreen = (chapterNumber: ChapterNumber): UiNode =>
  Column(
    {},
    Text(`This title has no chapter ${chapterNumber.toString()}`),
    Text('Go back to the title.', { dim: true }),
  )
