import { Array, Option, Schema as S } from 'effect'
import { Catalog, Navigation } from 'foldkit'
import { m } from 'foldkit/message'
import * as TranscriptPlayer from 'transcript-player-core-example'

import {
  BookmarkId,
  ChapterNumber,
  ChapterNumberSegment,
  TitleSlug,
  clockOf,
} from './ids.js'
import {
  type Model,
  Shelf,
  type Title,
  bookmarkOf,
  bookmarksOf,
  chapterAt,
  loadedPlayerOf,
  loadedTitleOf,
  placeOf,
  titleOf,
  titlesOf,
} from './model.js'
import {
  askedBookmarkOf,
  isAsking,
  isOnOtherPlayer,
  isOnPlayer,
  loadedSlugOf,
  shownTitleOf,
  titlePageSlugOf,
} from './stack.js'

// MESSAGE

const answerFirst = 'answer the question first'

const unlessAsking = (model: Model): Catalog.Availability =>
  isAsking(model)
    ? Catalog.Disabled({ because: answerFirst })
    : Catalog.Enabled()

const whenLoaded = (model: Model): Catalog.Availability => {
  if (isAsking(model)) {
    return Catalog.Disabled({ because: answerFirst })
  } else if (model.listening._tag === 'Idle') {
    return Catalog.Disabled({ because: 'nothing is in the player' })
  } else if (isOnOtherPlayer(model)) {
    return Catalog.Disabled({ because: 'this title is not in the player' })
  } else {
    return Catalog.Enabled()
  }
}

const authorsOf = (title: Title): string => Array.join(title.authors, ', ')

const noAudio = 'its audio is not in the library yet'

const audioOf = (title: Title): Catalog.Availability =>
  Option.isSome(title.maybeAudioUrl)
    ? Catalog.Enabled()
    : Catalog.Disabled({ because: noAudio })

const whichTitle = (
  availabilityOf: (model: Model, title: Title) => Catalog.Availability,
  preferredOf?: (model: Model) => Option.Option<TitleSlug>,
): Catalog.Choose<Model, 'slug', TitleSlug> => ({
  field: 'slug',
  prompt: 'Which title?',
  token: TitleSlug,
  choicesOf: model =>
    Array.map(titlesOf(model), title => ({
      value: title.slug,
      title: title.name,
      detail: authorsOf(title),
      availability: availabilityOf(model, title),
    })),
  ...(preferredOf === undefined ? {} : { preferredOf }),
  nothingToChoose: 'the library has no titles yet',
})

const shownTitle = (model: Model): Option.Option<Title> =>
  Option.flatMap(shownTitleOf(model), slug => titleOf(model, slug))

const whichChapter = (
  titleOfModel: (model: Model) => Option.Option<Title>,
  availabilityOf: (
    model: Model,
    title: Title,
    chapterNumber: ChapterNumber,
  ) => Catalog.Availability,
): Catalog.Choose<Model, 'chapterNumber', ChapterNumber> => ({
  field: 'chapterNumber',
  prompt: 'Which chapter?',
  token: ChapterNumberSegment,
  choicesOf: model =>
    Option.match(titleOfModel(model), {
      onNone: () => [],
      onSome: title =>
        Array.map(title.chapters, chapter => ({
          value: chapter.chapterNumber,
          title: chapter.name,
          detail: clockOf(chapter.startMs),
          availability: availabilityOf(model, title, chapter.chapterNumber),
        })),
    }),
  nothingToChoose: 'no title is open',
})

const whichBookmark = (
  prompt: string,
  availabilityOf: (title: Title) => Catalog.Availability = () =>
    Catalog.Enabled(),
): Catalog.Choose<Model, 'bookmarkId', BookmarkId> => ({
  field: 'bookmarkId',
  prompt,
  token: BookmarkId,
  choicesOf: model =>
    Option.match(shownTitle(model), {
      onNone: () => [],
      onSome: title =>
        Array.map(bookmarksOf(model, title.slug), bookmark => ({
          value: bookmark.bookmarkId,
          title: clockOf(bookmark.atMs),
          availability: availabilityOf(title),
        })),
    }),
  nothingToChoose: 'this title has no bookmarks',
})

/** Opens one title's page. `o` presses it on a highlighted row. */
export const Open = Catalog.action('Open', {
  fields: { slug: TitleSlug },
  choose: whichTitle((model, title) =>
    Option.contains(titlePageSlugOf(model), title.slug)
      ? Catalog.Disabled({ because: 'its page is open' })
      : Catalog.Enabled(),
  ),
  what: 'Opens the title on its own page',
  why: 'The person wants its chapters and bookmarks',
  enabled: unlessAsking,
  meta: { label: 'Open', keys: ['o'], title: 'Open title' },
})

/**
 * Plays one title from where the listener stopped, and shows its player.
 * `p` plays the title on screen. While the title is in the player, the
 * player's own Play and Pause take `p`.
 */
export const Listen = Catalog.action('Listen', {
  fields: { slug: TitleSlug },
  choose: whichTitle(
    (model, title) =>
      Option.contains(loadedSlugOf(model), title.slug)
        ? Catalog.Disabled({ because: 'it is in the player' })
        : audioOf(title),
    shownTitleOf,
  ),
  what: 'Plays the title from where the listener stopped',
  why: 'The person wants to listen',
  enabled: unlessAsking,
  meta: { label: 'Play', keys: ['p'], title: 'Play title' },
})

/**
 * The Transcript Player's own Actions, offered for the title in this
 * device's player: Play and Pause on `p`, skips on `[` and `]`, a seek to
 * any place, playing from a word, and the speed. They keep the player's
 * tags, so `SeekToWord:w4012` means the same in Books and on its own.
 */
export const playerActions = Catalog.within(TranscriptPlayer.catalog, {
  childOf: loadedPlayerOf,
  nothing: 'nothing is in the player',
  enabled: unlessAsking,
})

/** The player's Actions, each reading the loaded player. */
export const [
  Play,
  Pause,
  SkipBack,
  SkipForward,
  SeekTo,
  SeekToWord,
  SetSpeed,
] = playerActions.actions

/** Shows the player, whatever this device has loaded. */
export const OpenPlayer = Catalog.action('OpenPlayer', {
  what: 'Shows the player',
  why: 'The person wants the controls for what is playing',
  enabled: (model: Model) => {
    if (isAsking(model)) {
      return Catalog.Disabled({ because: answerFirst })
    } else if (isOnPlayer(model) && !isOnOtherPlayer(model)) {
      return Catalog.Disabled({ because: 'the player is open' })
    } else if (model.listening._tag === 'Idle') {
      return Catalog.Disabled({ because: 'nothing is in the player' })
    } else {
      return Catalog.Enabled()
    }
  },
  meta: { label: 'Now playing', keys: [], title: 'Open the player' },
})

/** Shows the chapters of the title on screen. `c` presses it. */
export const ShowContents = Catalog.action('ShowContents', {
  what: 'Shows the chapters of the title on screen',
  why: 'The person wants to find a chapter',
  enabled: (model: Model) =>
    Option.isSome(shownTitle(model))
      ? unlessAsking(model)
      : Catalog.Disabled({ because: 'no title is open' }),
  meta: { label: 'Contents', keys: ['c'] },
})

/**
 * Plays the title on screen from the start of one chapter, and closes
 * the contents.
 */
export const JumpToChapter = Catalog.action('JumpToChapter', {
  fields: { chapterNumber: ChapterNumber },
  choose: whichChapter(shownTitle, (model, title, chapterNumber) => {
    if (Option.isNone(title.maybeAudioUrl)) {
      return Catalog.Disabled({ because: noAudio })
    } else if (
      Option.exists(
        loadedTitleOf(model),
        ({ title: loaded, loaded: player }) =>
          loaded.slug === title.slug &&
          chapterAt(loaded, placeOf(player)).chapterNumber === chapterNumber,
      )
    ) {
      return Catalog.Disabled({ because: 'it is playing now' })
    } else {
      return Catalog.Enabled()
    }
  }),
  what: 'Plays the title from the start of the chapter',
  why: 'The person wants to listen to that part',
  enabled: unlessAsking,
  meta: { label: 'Play', keys: [], title: 'Jump to chapter' },
})

/**
 * Opens one chapter's page, a link to that section someone can share:
 * `/books/the-lantern-keeper/chapter/3`.
 */
export const OpenChapter = Catalog.action('OpenChapter', {
  fields: { chapterNumber: ChapterNumber },
  choose: whichChapter(
    model =>
      Option.flatMap(titlePageSlugOf(model), slug => titleOf(model, slug)),
    () => Catalog.Enabled(),
  ),
  what: 'Opens the chapter on its own page',
  why: 'The person wants a link to that section',
  enabled: unlessAsking,
  meta: { label: 'Open', keys: [], title: 'Open chapter' },
})

/** Shows the speeds to choose from. `x` presses it on the player. */
export const ShowSpeeds = Catalog.action('ShowSpeeds', {
  what: 'Shows the playback speeds',
  why: 'The person wants it faster or slower',
  enabled: (model: Model) =>
    isOnPlayer(model)
      ? unlessAsking(model)
      : Catalog.Disabled({ because: 'the player is not open' }),
  meta: { label: 'Speed', keys: ['x'] },
})

/** Marks the place in the player. `b` presses it. */
export const AddBookmark = Catalog.action('AddBookmark', {
  what: 'Marks the place in the player',
  why: 'The person wants to come back to it',
  enabled: whenLoaded,
  meta: { label: 'Bookmark', keys: ['b'], title: 'Add bookmark' },
})

/** Plays the title on screen from one of its bookmarks. */
export const PlayBookmark = Catalog.action('PlayBookmark', {
  fields: { bookmarkId: BookmarkId },
  choose: whichBookmark('Which bookmark?', audioOf),
  what: 'Plays the title from the bookmark',
  why: 'The person wants to go back to that place',
  enabled: unlessAsking,
  meta: { label: 'Play', keys: [], title: 'Play bookmark' },
})

/** Asks before deleting one bookmark. */
export const DeleteBookmark = Catalog.action('DeleteBookmark', {
  fields: { bookmarkId: BookmarkId },
  choose: whichBookmark('Delete which bookmark?'),
  what: 'Asks before deleting the bookmark',
  why: 'The person no longer needs it',
  enabled: unlessAsking,
  meta: { label: 'Delete', keys: [], title: 'Delete bookmark' },
})

/**
 * Deletes the bookmark the open question names. Its one choice is that
 * bookmark, so no surface can delete one nobody was asked about. `y`
 * presses it.
 */
export const ConfirmDeleteBookmark = Catalog.action('ConfirmDeleteBookmark', {
  fields: { bookmarkId: BookmarkId },
  choose: {
    field: 'bookmarkId',
    prompt: 'Delete which bookmark?',
    token: BookmarkId,
    choicesOf: (model: Model) =>
      Array.map(
        Option.toArray(
          Option.flatMap(askedBookmarkOf(model), bookmarkId =>
            bookmarkOf(model, bookmarkId),
          ),
        ),
        bookmark => ({
          value: bookmark.bookmarkId,
          title: clockOf(bookmark.atMs),
        }),
      ),
    preferredOf: askedBookmarkOf,
    nothingToChoose: 'no delete is waiting for an answer',
  },
  what: 'Deletes the bookmark the question names',
  why: 'The person is sure they want it gone',
  meta: { label: 'Delete', keys: ['y'] },
})

/** Closes the question and keeps the bookmark. `n` presses it. */
export const CancelDeleteBookmark = Catalog.action('CancelDeleteBookmark', {
  what: 'Closes the question and keeps the bookmark',
  why: 'The person changed their mind',
  enabled: (model: Model) =>
    isAsking(model)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'no delete is waiting for an answer' }),
  meta: { label: 'Cancel', keys: ['n'] },
})

/**
 * Every Books Action in the order surfaces list them. The action menu
 * shows each once; the ones that act on a title, chapter, speed, or
 * bookmark ask which next. The CLI reads them as `books play
 * the-lantern-keeper`.
 */
export const catalog = Catalog.make([
  Listen,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  SeekTo,
  SeekToWord,
  Open,
  OpenPlayer,
  ShowContents,
  JumpToChapter,
  OpenChapter,
  ShowSpeeds,
  SetSpeed,
  AddBookmark,
  PlayBookmark,
  DeleteBookmark,
  ConfirmDeleteBookmark,
  CancelDeleteBookmark,
])

/** The library store sent the shelf. */
export const ReceivedShelf = m('ReceivedShelf', { shelf: Shelf })
/** The library store could not be read, and why, safe to show. */
export const FailedReadShelf = m('FailedReadShelf', { reason: S.String })
/** The library store saved a place, a finish, or a bookmark change. */
export const CompletedWriteLibrary = m('CompletedWriteLibrary')
/** The library store refused a write, and why, safe to show. */
export const FailedWriteLibrary = m('FailedWriteLibrary', {
  reason: S.String,
})

/**
 * Every Message Books accepts: the Catalog's Actions, the facts the
 * library store and the player report, and the carrier facts its stack
 * folds.
 */
export const Message = S.Union([
  ...catalog.Message.members,
  ReceivedShelf,
  FailedReadShelf,
  TranscriptPlayer.ReachedPlace,
  TranscriptPlayer.ReachedEnd,
  TranscriptPlayer.FailedPlayAudio,
  TranscriptPlayer.ReceivedPassages,
  TranscriptPlayer.FailedLoadTranscript,
  CompletedWriteLibrary,
  FailedWriteLibrary,
  Navigation.OpenedUri,
  Navigation.NavigatedBack,
])
/** A Books Message value. */
export type Message = typeof Message.Type
