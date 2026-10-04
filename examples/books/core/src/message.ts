import { Array, Option, Schema as S } from 'effect'
import { Catalog, Navigation } from 'foldkit'
import { m } from 'foldkit/message'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'

import {
  BookmarkId,
  ChapterNumber,
  ChapterNumberSegment,
  Milliseconds,
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
import { SharedHow } from './share.js'
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
  PreviousSection,
  NextSection,
  SeekTo,
  SeekToWord,
  SetSeekScope,
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

/**
 * Shares a link to the second the player is at, the player's own address:
 * the share sheet on a phone, the clipboard elsewhere. `l` presses it.
 */
export const SharePlace = Catalog.action('SharePlace', {
  what: 'Shares a link to this moment in the title',
  why: 'The person wants someone to hear this part, or to come back to it',
  enabled: whenLoaded,
  meta: { label: 'Share', keys: ['l'], title: 'Share this moment' },
})

/** Shows every control of the player under the words. */
export const ExpandControls = Catalog.action('ExpandControls', {
  what: 'Shows every control of the player',
  why: 'The person wants the chapter bar, chapters, speed, or sharing',
  enabled: (model: Model) =>
    model.controls === 'Collapsed' && isOnPlayer(model)
      ? whenLoaded(model)
      : Catalog.Disabled({ because: 'the controls are open' }),
  meta: { label: 'More controls', keys: ['e'], title: 'Show every control' },
})

/** Folds the player's controls back into the compact bar. */
export const CollapseControls = Catalog.action('CollapseControls', {
  what: 'Folds the player back into the compact bar',
  why: 'The person wants more room for the words',
  enabled: (model: Model) =>
    model.controls === 'Expanded' && isOnPlayer(model)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'the controls are folded' }),
  meta: { label: 'Fewer controls', keys: ['e'], title: 'Fold the controls' },
})

/** Goes to the library, the home. */
export const ShowLibrary = Catalog.action('ShowLibrary', {
  what: 'Goes to the library',
  why: 'The person wants to pick a book',
  enabled: unlessAsking,
  meta: { label: 'Library', keys: [], title: 'Go to the library' },
})

/** Shows who is signed in, and how the library stands. */
export const ShowProfile = Catalog.action('ShowProfile', {
  what: 'Shows who is signed in',
  why: 'The person wants to know which account this is',
  enabled: unlessAsking,
  meta: { label: 'Profile', keys: [], title: 'Show the profile' },
})

/**
 * Shows the picture books read aloud, the one being read now first, at
 * `/books/read-aloud`. The Read aloud row on the library presses it.
 */
export const ShowReadAloud = Catalog.action('ShowReadAloud', {
  what: 'Shows the picture books read aloud',
  why: 'The person wants to follow along in a book being read aloud',
  enabled: unlessAsking,
  meta: { label: 'Read aloud', keys: [], title: 'Show the books read aloud' },
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
 * the-lantern-keeper`. Read Aloud's own Actions come last, with Share for
 * a page, so `books turn-to-page 7` turns the book on screen.
 */
export const catalog = Catalog.make([
  Listen,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  PreviousSection,
  NextSection,
  SeekTo,
  SeekToWord,
  SetSeekScope,
  ExpandControls,
  CollapseControls,
  ShowLibrary,
  ShowProfile,
  ShowReadAloud,
  Open,
  OpenPlayer,
  ShowContents,
  JumpToChapter,
  ShowSpeeds,
  SetSpeed,
  SharePlace,
  AddBookmark,
  PlayBookmark,
  DeleteBookmark,
  ConfirmDeleteBookmark,
  CancelDeleteBookmark,
  ...ReadAloud.catalog.actions,
  ReadAloud.SharePage,
])

/** The library store sent the shelf. */
export const ReceivedShelf = m('ReceivedShelf', { shelf: Shelf })
/** The library store said who is signed in, or that no one is. */
export const ReceivedMember = m('ReceivedMember', {
  maybeEmail: S.Option(S.String),
})
/** The library store could not be read, and why, safe to show. */
export const FailedReadShelf = m('FailedReadShelf', { reason: S.String })
/**
 * The player's address names a place the player is not at: someone opened
 * a link to a moment, went back or forward to one, or the shelf arrived
 * after the link did.
 */
export const OpenedPlace = m('OpenedPlace', {
  slug: TitleSlug,
  atMs: Milliseconds,
})
/** The link to a moment went out, through a share sheet or a clipboard. */
export const SharedLink = m('SharedLink', { how: SharedHow })
/** The link to a moment could not go out, and why, safe to show. */
export const FailedShareLink = m('FailedShareLink', { reason: S.String })
/** The library store saved a place, a finish, or a bookmark change. */
export const CompletedWriteLibrary = m('CompletedWriteLibrary')
/** The library store refused a write, and why, safe to show. */
export const FailedWriteLibrary = m('FailedWriteLibrary', {
  reason: S.String,
})

/**
 * Every Message Books accepts: the Catalog's Actions, the facts the
 * library store, the player, and Read Aloud's sources report, and the
 * carrier facts its stack folds.
 */
export const Message = S.Union([
  ...catalog.Message.members,
  ReceivedShelf,
  FailedReadShelf,
  ReceivedMember,
  ReadAloud.ReceivedReadings,
  ReadAloud.FailedReadReadings,
  ReadAloud.ReceivedPreview,
  ReadAloud.FailedCheckPreview,
  OpenedPlace,
  SharedLink,
  FailedShareLink,
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
