import { Array, Option, Schema as S } from 'effect'
import { Catalog, Navigation } from 'foldkit'
import { ModelPath } from 'foldkit/declaration'
import * as Theme from 'foldkit/theme'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'

import {
  ImportFromAudible,
  ReconnectAudible,
  ShowAddBooks,
  audibleActions,
} from './addBooks.js'
import * as Audible from './audible/index.js'
import { excerptLineOf } from './bookmarks.js'
import {
  CopyLink,
  ReadMoment,
  ReportStretch,
  ShareLink,
  WriteLibrary,
} from './command.js'
import {
  CompletedCloseUnendedPlays,
  CompletedReportStretch,
  CompletedWriteLibrary,
  FailedCloseUnendedPlays,
  FailedReadChapters,
  FailedReadShelf,
  FailedReportStretch,
  FailedShareLink,
  FailedWriteLibrary,
  MarkedMoment,
  OpenedPlace,
  ReceivedChapters,
  ReceivedMember,
  ReceivedShelf,
  ReceivedUnendedPlays,
  SharedLink,
} from './fact.js'
import {
  BookmarkId,
  ChapterNumber,
  ChapterNumberSegment,
  TitleSlug,
  clockOf,
} from './ids.js'
import {
  BookmarkNote,
  Model,
  type Title,
  bookmarkOf,
  bookmarksOf,
  chapterNumberAt,
  chaptersOf,
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
  openBookmarkOf,
  shownTitleOf,
  titlePageSlugOf,
} from './stack.js'

export * from './fact.js'

// MESSAGE

const answerFirst = 'answer the question first'

const at = ModelPath.of(Model)

const mutatedByEndingStretch = [at.listening.stretch, at.unsentReports]

const mutatedByMoving = [...mutatedByEndingStretch, at.navigation.pages]

const mutatedByPlayingTitle = [
  at.listening,
  at.unsentReports,
  at.navigation.pages,
]

const savesAndReports = [WriteLibrary, ReportStretch]

const movesWhileSounding: Catalog.Touched = {
  mutates: mutatedByMoving,
  triggers: [ReportStretch],
}

const movesPlace: Catalog.Touched = {
  mutates: [at.listening.savedPlaceMs, ...mutatedByMoving],
  triggers: savesAndReports,
}

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
  noun: 'title',
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
    Option.match(
      Option.flatMap(titleOfModel(model), title =>
        Option.map(chaptersOf(model, title.slug), chapters => ({
          title,
          chapters,
        })),
      ),
      {
        onNone: () => [],
        onSome: ({ title, chapters }) =>
          Array.map(chapters, chapter => ({
            value: chapter.chapterNumber,
            title: chapter.name,
            detail: clockOf(chapter.startMs),
            availability: availabilityOf(model, title, chapter.chapterNumber),
          })),
      },
    ),
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
          ...Option.match(bookmark.maybeExcerpt, {
            onNone: () => ({}),
            onSome: excerpt => ({ detail: excerptLineOf(excerpt) }),
          }),
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
  what: "Opens this book's page, with its chapters and bookmarks",
  why: 'To see its chapters and bookmarks',
  enabled: unlessAsking,
  mutates: [at.navigation.pages],
  meta: { label: 'Open', keys: ['o'], title: 'Open title' },
})

/**
 * Plays one title from where the listener stopped, and shows its player.
 * `p` plays the title on screen. While the title is in the player, the
 * player's own Play and Pause take `p`.
 */
export const Listen = Catalog.action('Listen', {
  aliases: ['Play', 'PlayTitle'],
  fields: { slug: TitleSlug },
  choose: whichTitle(
    (model, title) =>
      Option.contains(loadedSlugOf(model), title.slug)
        ? Catalog.Disabled({ because: 'it is in the player' })
        : audioOf(title),
    shownTitleOf,
  ),
  what: 'Plays this book from where it was last stopped',
  why: 'To hear this book',
  enabled: unlessAsking,
  mutates: mutatedByPlayingTitle,
  triggers: savesAndReports,
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
  under: at.listening.player,
  also: {
    Play: { mutates: [at.navigation.pages] },
    Pause: {
      mutates: [at.listening.savedPlaceMs, ...mutatedByEndingStretch],
      triggers: savesAndReports,
    },
    SkipBack: movesPlace,
    SkipForward: movesPlace,
    PreviousSection: movesPlace,
    NextSection: movesPlace,
    SeekTo: movesPlace,
    PreviousParagraph: movesPlace,
    NextParagraph: movesPlace,
    SeekToWord: movesWhileSounding,
    PlayFrom: movesWhileSounding,
    SetSpeed: {
      mutates: [at.speed, ...mutatedByEndingStretch, at.navigation.maybeModal],
      triggers: [ReportStretch],
    },
  },
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
  PreviousParagraph,
  NextParagraph,
  ShowSearch,
  CloseSearch,
  SearchFor,
  ClearSearch,
  NextMatch,
  PreviousMatch,
  ShowMatch,
  PlayFrom,
  LeavePlayhead,
  BackToPlayhead,
  ShowWordMenu,
  CloseWordMenu,
] = playerActions.actions

const currentWordChoiceOf = (model: Model) =>
  Array.fromOption(
    Option.map(
      Option.flatMap(loadedPlayerOf(model), TranscriptPlayer.currentWordOf),
      word => ({
        value: word.wordId,
        title: word.text,
        detail: clockOf(word.startMs),
      }),
    ),
  )

/**
 * Copies a link that opens the title on one word, the time the word
 * starts in the player's own address:
 * `/books/the-lantern-keeper/listen/12m03.45s`. A word's menu presses it
 * with that word, `CopyWordLink:w4012`; the menu of Actions offers the
 * word being read. It takes any word near the place.
 */
export const CopyWordLink = Catalog.action('CopyWordLink', {
  fields: { wordId: TranscriptPlayer.WordId },
  choose: {
    field: 'wordId',
    prompt: 'Which word?',
    token: TranscriptPlayer.WordId,
    choicesOf: currentWordChoiceOf,
    accepts: (model: Model, wordId: TranscriptPlayer.WordId) =>
      Option.isSome(
        Option.flatMap(loadedPlayerOf(model), player =>
          TranscriptPlayer.wordOf(player, wordId),
        ),
      )
        ? Catalog.Enabled()
        : Catalog.Disabled({ because: 'that word is not near the place' }),
    nothingToChoose: 'there are no words yet',
  },
  what: 'Copies a link that opens this book on the chosen word',
  why: 'To come back to that word, or send it to someone',
  enabled: whenLoaded,
  mutates: [at.listening.player.maybeWordMenu, at.maybeNotice],
  triggers: [CopyLink],
  meta: {
    label: 'Copy link to this word',
    keys: [],
    title: 'Copy link to a word',
  },
})

/**
 * The look: light, dark, or following the system, `SetAppearance:Dark`.
 * Foldkit's own Action, reading this Model's appearance, so the menu, a
 * hover description, and `books set-appearance dark` all come from it.
 */
export const [SetAppearance] = Catalog.within(Theme.catalog, {
  childOf: (model: Model) => Option.some(model.appearance),
  under: at.appearance,
  nothing: 'the look cannot change here',
}).actions

/** Shows the player, whatever this device has loaded. */
export const OpenPlayer = Catalog.action('OpenPlayer', {
  what: 'Shows what is playing, with its words and controls',
  why: 'To reach the controls for what is playing',
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
  mutates: [at.navigation.pages],
  meta: { label: 'Now playing', keys: [], title: 'Open the player' },
})

/**
 * Shows the chapters of the title on screen, beside its page, and closes
 * them when they are showing. `c` presses it.
 */
export const ShowContents = Catalog.action('ShowContents', {
  what: "Lists this book's chapters",
  why: 'To find a chapter',
  enabled: (model: Model) =>
    Option.isSome(shownTitle(model))
      ? unlessAsking(model)
      : Catalog.Disabled({ because: 'no title is open' }),
  mutates: [at.navigation.maybeModal],
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
          Option.contains(
            chapterNumberAt(model, loaded.slug, placeOf(player)),
            chapterNumber,
          ),
      )
    ) {
      return Catalog.Disabled({ because: 'it is playing now' })
    } else {
      return Catalog.Enabled()
    }
  }),
  what: 'Plays this book from the start of the chapter',
  why: 'To listen to that part',
  enabled: unlessAsking,
  mutates: [...mutatedByPlayingTitle, at.navigation.maybeModal],
  triggers: savesAndReports,
  meta: { label: 'Play', keys: [], title: 'Jump to chapter' },
})

/** Shows the speeds to choose from. `x` presses it on the player. */
export const ShowSpeeds = Catalog.action('ShowSpeeds', {
  what: 'Shows the speeds the book can play at',
  why: 'To hear it faster or slower',
  enabled: (model: Model) =>
    isOnPlayer(model)
      ? unlessAsking(model)
      : Catalog.Disabled({ because: 'the player is not open' }),
  mutates: [at.navigation.maybeModal],
  meta: { label: 'Speed', keys: ['x'] },
})

/**
 * Shares a link to the second the player is at, the player's own address:
 * the share sheet on a phone, the clipboard elsewhere. `l` presses it.
 */
export const SharePlace = Catalog.action('SharePlace', {
  what: 'Shares a link that opens the book at this moment',
  why: 'To let someone hear this part, or to come back to it',
  enabled: whenLoaded,
  mutates: [at.maybeNotice],
  triggers: [ShareLink],
  meta: { label: 'Share', keys: ['l'], title: 'Share this moment' },
})

/** Shows every control of the player under the words. */
export const ExpandControls = Catalog.action('ExpandControls', {
  what: 'Shows every control, with the seek bar, chapters, speed, bookmark and share',
  why: 'To reach the chapter bar, chapters, speed, or sharing',
  enabled: (model: Model) =>
    model.controls === 'Collapsed' && isOnPlayer(model)
      ? whenLoaded(model)
      : Catalog.Disabled({ because: 'the controls are open' }),
  mutates: [at.controls],
  meta: { label: 'More controls', keys: ['e'], title: 'Show every control' },
})

/** Folds the player's controls back into the compact bar. */
export const CollapseControls = Catalog.action('CollapseControls', {
  what: 'Folds the controls into one small bar',
  why: 'To have more room for the words',
  enabled: (model: Model) =>
    model.controls === 'Expanded' && isOnPlayer(model)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'the controls are folded' }),
  mutates: [at.controls],
  meta: { label: 'Fewer controls', keys: ['e'], title: 'Fold the controls' },
})

/** Goes to the library, the home. */
export const ShowLibrary = Catalog.action('ShowLibrary', {
  what: 'Goes to the library of books',
  why: 'To pick a book',
  enabled: unlessAsking,
  mutates: [at.navigation.pages, at.navigation.maybeModal],
  meta: { label: 'Library', keys: [], title: 'Go to the library' },
})

/** Shows who is signed in, and how the library stands. */
export const ShowProfile = Catalog.action('ShowProfile', {
  what: 'Shows who is signed in',
  why: 'To know which account this is',
  enabled: unlessAsking,
  mutates: [at.navigation.pages, at.navigation.maybeModal],
  meta: { label: 'Profile', keys: [], title: 'Show the profile' },
})

/**
 * Shows the picture books read aloud, the one being read now first, at
 * `/books/read-aloud`. The Read aloud row on the library presses it.
 */
export const ShowReadAloud = Catalog.action('ShowReadAloud', {
  what: 'Shows the picture books read aloud',
  why: 'To follow along in a book being read aloud',
  enabled: unlessAsking,
  mutates: [at.navigation.pages, at.navigation.maybeModal],
  meta: { label: 'Read aloud', keys: [], title: 'Show the books read aloud' },
})

/**
 * Marks the word being spoken in the player, on the millisecond it
 * starts, with the words around it. `b` presses it.
 */
export const AddBookmark = Catalog.action('AddBookmark', {
  what: 'Saves a bookmark on the word being spoken',
  why: 'To come back to it',
  enabled: whenLoaded,
  triggers: [ReadMoment],
  meta: { label: 'Bookmark', keys: ['b'], title: 'Add bookmark' },
})

/** Marks the word being spoken, with a note: `books bookmark "why"`. */
export const AddNotedBookmark = Catalog.action('AddNotedBookmark', {
  fields: { note: BookmarkNote },
  choose: {
    field: 'note',
    prompt: 'What note?',
    token: BookmarkNote,
    choicesOf: () => [],
    accepts: whenLoaded,
    nothingToChoose: 'type the note',
  },
  what: 'Saves a bookmark on the word being spoken, with a typed note',
  why: 'To come back to it and remember why',
  enabled: whenLoaded,
  triggers: [ReadMoment],
  meta: {
    label: 'Bookmark with a note',
    keys: [],
    title: 'Add bookmark with a note',
  },
})

/**
 * Marks one word near the place. A word's menu presses it with that
 * word, `BookmarkWord:w4012`.
 */
export const BookmarkWord = Catalog.action('BookmarkWord', {
  fields: { wordId: TranscriptPlayer.WordId },
  choose: {
    field: 'wordId',
    prompt: 'Which word?',
    token: TranscriptPlayer.WordId,
    choicesOf: () => [],
    accepts: (model: Model, wordId: TranscriptPlayer.WordId) =>
      Option.isSome(
        Option.flatMap(loadedPlayerOf(model), player =>
          TranscriptPlayer.wordOf(player, wordId),
        ),
      )
        ? Catalog.Enabled()
        : Catalog.Disabled({ because: 'that word is not near the place' }),
    nothingToChoose: 'press a word in the reader',
  },
  what: 'Saves a bookmark on this word',
  why: 'To come back to that word',
  enabled: whenLoaded,
  mutates: [at.listening.player.maybeWordMenu, at.maybeNotice],
  triggers: [WriteLibrary],
  meta: {
    label: 'Bookmark this word',
    keys: [],
    title: 'Bookmark a word',
  },
})

/**
 * Shows the bookmarks of the title on screen, beside its page, and closes
 * them when they are showing. `m` presses it.
 */
export const ShowBookmarks = Catalog.action('ShowBookmarks', {
  what: 'Shows this book’s bookmarks beside the page, or closes them',
  why: 'To find a word the user marked',
  enabled: (model: Model) =>
    Option.isSome(shownTitle(model))
      ? unlessAsking(model)
      : Catalog.Disabled({ because: 'no title is open' }),
  mutates: [at.navigation.maybeModal],
  meta: { label: 'Bookmarks', keys: ['m'] },
})

/** Opens one bookmark beside the page: its words and its note. */
export const OpenBookmark = Catalog.action('OpenBookmark', {
  fields: { bookmarkId: BookmarkId },
  choose: whichBookmark('Open which bookmark?'),
  what: 'Opens this bookmark, with its words and its note',
  why: 'To read or change the note on it',
  enabled: unlessAsking,
  mutates: [at.navigation.maybeModal],
  meta: { label: 'Open bookmark', keys: [], title: 'Open bookmark' },
})

const onOpenBookmark = (model: Model): Catalog.Availability =>
  Option.isSome(
    Option.flatMap(openBookmarkOf(model), bookmarkId =>
      bookmarkOf(model, bookmarkId),
    ),
  )
    ? Catalog.Enabled()
    : Catalog.Disabled({ because: 'no bookmark is open' })

/** Writes the open bookmark's note. */
export const SetBookmarkNote = Catalog.action('SetBookmarkNote', {
  fields: { note: BookmarkNote },
  choose: {
    field: 'note',
    prompt: 'What is the note?',
    token: BookmarkNote,
    choicesOf: () => [],
    accepts: onOpenBookmark,
    nothingToChoose: 'type the note',
  },
  what: 'Writes a note on this bookmark',
  why: 'To remember why it was marked',
  enabled: onOpenBookmark,
  triggers: [WriteLibrary],
  meta: { label: 'Note', keys: [], title: 'Write a bookmark’s note' },
})

/** Clears the open bookmark's note. */
export const ClearBookmarkNote = Catalog.action('ClearBookmarkNote', {
  what: 'Clears this bookmark’s note',
  why: 'To take away a note that no longer applies',
  enabled: (model: Model) =>
    Option.match(
      Option.flatMap(openBookmarkOf(model), bookmarkId =>
        bookmarkOf(model, bookmarkId),
      ),
      {
        onNone: () => Catalog.Disabled({ because: 'no bookmark is open' }),
        onSome: bookmark =>
          Option.isSome(bookmark.maybeNote)
            ? Catalog.Enabled()
            : Catalog.Disabled({ because: 'it has no note' }),
      },
    ),
  triggers: [WriteLibrary],
  meta: { label: 'Clear note', keys: [], title: 'Clear a bookmark’s note' },
})

/** Puts back the bookmark that was just removed. `z` presses it. */
export const UndoRemoveBookmark = Catalog.action('UndoRemoveBookmark', {
  what: 'Puts back the bookmark that was just deleted',
  why: 'To undo a delete made by mistake',
  enabled: (model: Model) =>
    Option.isSome(model.maybeRemovedBookmark)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'no bookmark was just removed' }),
  mutates: [at.maybeRemovedBookmark, at.maybeNotice],
  triggers: [WriteLibrary],
  meta: { label: 'Undo', keys: ['z'], title: 'Put the bookmark back' },
})

/** Plays the title on screen from one of its bookmarks. */
export const PlayBookmark = Catalog.action('PlayBookmark', {
  fields: { bookmarkId: BookmarkId },
  choose: whichBookmark('Which bookmark?', audioOf),
  what: 'Plays the book from this bookmark',
  why: 'To go back to that place',
  enabled: unlessAsking,
  mutates: mutatedByPlayingTitle,
  triggers: savesAndReports,
  meta: { label: 'Play', keys: [], title: 'Play bookmark' },
})

/** Asks before deleting one bookmark. */
export const DeleteBookmark = Catalog.action('DeleteBookmark', {
  fields: { bookmarkId: BookmarkId },
  choose: whichBookmark('Delete which bookmark?'),
  what: 'Deletes this bookmark, after asking first',
  why: 'To clear away a bookmark that is no longer needed',
  enabled: unlessAsking,
  mutates: [at.navigation.maybeModal],
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
  what: 'Deletes the bookmark',
  why: 'To delete it, now that the question is answered',
  mutates: [at.navigation.maybeModal, at.maybeRemovedBookmark, at.maybeNotice],
  triggers: [WriteLibrary],
  meta: { label: 'Delete', keys: ['y'] },
})

/** Closes the question and keeps the bookmark. `n` presses it. */
export const CancelDeleteBookmark = Catalog.action('CancelDeleteBookmark', {
  what: 'Keeps the bookmark and closes the question',
  why: 'To keep the bookmark after all',
  enabled: (model: Model) =>
    isAsking(model)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'no delete is waiting for an answer' }),
  mutates: [at.navigation.maybeModal],
  meta: { label: 'Cancel', keys: ['n'] },
})

/**
 * Shares a link to the page of the picture book on screen, Read Aloud's
 * own Action, as Books carries it out: through its link sharing, with
 * its notice.
 */
export const SharePage = Catalog.withTouches(ReadAloud.SharePage, {
  mutates: [at.maybeNotice],
  triggers: [ShareLink],
})

/** The Audible import's Actions, each reading the page on top. */
export const [
  ConnectAudible,
  TryAudibleSignInAgain,
  ToggleAudibleTitle,
  SelectAllAudibleTitles,
  DeselectAudibleTitles,
  ImportAudibleTitles,
  ReadAudibleLibraryAgain,
  GetAudiobookAudio,
] = audibleActions.actions

/**
 * Every Books Action in the order surfaces list them. The action menu
 * shows each once; the ones that act on a title, chapter, speed, or
 * bookmark ask which next. The CLI reads them as `books play
 * the-lantern-keeper`. Read Aloud's own Actions come next, with Share for
 * a page, so `books turn-to-page 7` turns the book on screen. Adding
 * books and the Audible import's Actions come last.
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
  PreviousParagraph,
  NextParagraph,
  ShowSearch,
  CloseSearch,
  SearchFor,
  ClearSearch,
  NextMatch,
  PreviousMatch,
  ShowMatch,
  PlayFrom,
  LeavePlayhead,
  BackToPlayhead,
  ShowWordMenu,
  CloseWordMenu,
  CopyWordLink,
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
  SetAppearance,
  SharePlace,
  AddBookmark,
  AddNotedBookmark,
  BookmarkWord,
  ShowBookmarks,
  OpenBookmark,
  SetBookmarkNote,
  ClearBookmarkNote,
  PlayBookmark,
  DeleteBookmark,
  ConfirmDeleteBookmark,
  CancelDeleteBookmark,
  UndoRemoveBookmark,
  ...ReadAloud.catalog.actions,
  SharePage,
  ShowAddBooks,
  ImportFromAudible,
  ReconnectAudible,
  ConnectAudible,
  TryAudibleSignInAgain,
  ToggleAudibleTitle,
  SelectAllAudibleTitles,
  DeselectAudibleTitles,
  ImportAudibleTitles,
  ReadAudibleLibraryAgain,
  GetAudiobookAudio,
])

const bookmarkEditTags: ReadonlySet<string> = new Set([
  AddNotedBookmark.tag,
  BookmarkWord.tag,
  SetBookmarkNote.tag,
  ClearBookmarkNote.tag,
  UndoRemoveBookmark.tag,
  'MarkedMoment',
])

/**
 * True for a Message that changes a bookmark through the library store
 * and carries the person's own words or a word they pressed: a note, a
 * marked word, the moment one was asked for. It stays on the device that
 * sent it, so the log never holds a note; the bookmark itself reaches
 * every device through the library store.
 */
export const isBookmarkEdit = (message: Readonly<{ _tag: string }>): boolean =>
  bookmarkEditTags.has(message._tag)

/**
 * Every Message Books accepts: the Catalog's Actions, the facts the
 * library store, the player, Read Aloud's sources, and the Audible import
 * report, and the carrier facts its stack folds.
 */
export const Message = S.Union([
  ...catalog.Message.members,
  ReceivedShelf,
  FailedReadShelf,
  ReceivedChapters,
  FailedReadChapters,
  ReceivedMember,
  Theme.ObservedSystemMode,
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
  MarkedMoment,
  TranscriptPlayer.ReceivedMatches,
  TranscriptPlayer.FailedSearch,
  TranscriptPlayer.ReadSearchWords,
  TranscriptPlayer.FailedReadSearchWords,
  CompletedWriteLibrary,
  FailedWriteLibrary,
  CompletedReportStretch,
  FailedReportStretch,
  ReceivedUnendedPlays,
  CompletedCloseUnendedPlays,
  FailedCloseUnendedPlays,
  Audible.StartedAudibleSignIn,
  Audible.FailedStartAudibleSignIn,
  Audible.ConnectedAudible,
  Audible.FailedConnectAudible,
  Audible.ReceivedAudibleLibrary,
  Audible.FailedReadAudibleLibrary,
  Audible.AdvancedAudibleImport,
  Audible.ImportedAudibleTitles,
  Audible.FailedImportAudibleTitles,
  Audible.ReceivedAudiobookAudio,
  Audible.FailedReadAudiobookAudio,
  Audible.QueuedAudiobookAudio,
  Audible.FailedQueueAudiobookAudio,
  Navigation.OpenedUri,
  Navigation.NavigatedBack,
])
/** A Books Message value. */
export type Message = typeof Message.Type
