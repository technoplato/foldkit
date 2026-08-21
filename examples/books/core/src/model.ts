import { Array, Match as M, Option, Order, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { newEarthChapters } from './new-earth-chapters.js'
import { newEarthEvocationWords } from './new-earth-evocation-words.js'

/** Finite number at or above zero. */
export const NonNegativeNumber = S.Finite.check(S.isGreaterThanOrEqualTo(0))
export type NonNegativeNumber = typeof NonNegativeNumber.Type

/** Rendition-relative clock in seconds. Negatives are not a value. */
export const Seconds = NonNegativeNumber
export type Seconds = NonNegativeNumber

/** Spine position. Negatives are not a value. */
export const ChapterIndex = S.Int.check(S.isGreaterThanOrEqualTo(0))
export type ChapterIndex = typeof ChapterIndex.Type

/** Shelf row with no text or audio rendition. */
export const PackagingNone = ts('None')
/** Text-only packaging. textId is required. */
export const PackagingText = ts('Text', { textId: S.String })
/** Audio-only packaging. audioId is required; audioUrl may be absent. */
export const PackagingAudio = ts('Audio', {
  audioId: S.String,
  audioUrl: S.Option(S.String),
})
/** Text and audio packaging. Both rendition ids are required. */
export const PackagingBoth = ts('Both', {
  textId: S.String,
  audioId: S.String,
  audioUrl: S.Option(S.String),
})
/** Closed packaging sum. Independent preferred + optional ids are not a value. */
export const Packaging = S.Union([
  PackagingNone,
  PackagingText,
  PackagingAudio,
  PackagingBoth,
])
export type Packaging = typeof Packaging.Type

/** One spoken token on the audio timeline. */
export const Word = S.Struct({
  id: S.String,
  text: S.String,
  start: Seconds,
  end: Seconds,
})
export type Word = typeof Word.Type

/** Ordered spine section of a work, with rendition-relative times. */
export const Chapter = S.Struct({
  id: S.String,
  index: ChapterIndex,
  title: S.String,
  start: Seconds,
  end: Seconds,
})
export type Chapter = typeof Chapter.Type

/** Session handle for the title-page chapter list. Ascending only. */
export const ChapterSort = S.Literals(['Index', 'Title'])
export type ChapterSort = typeof ChapterSort.Type

/** One shelf row the Program can open. */
export const Item = S.Struct({
  id: S.String,
  title: S.String,
  authorLabel: S.String,
  packaging: Packaging,
  coverUrl: S.Option(S.String),
  body: S.String,
  words: S.Array(Word),
  chapters: S.Array(Chapter),
})
export type Item = typeof Item.Type

/** Durable saved place in a packaging. */
export const Bookmark = S.Struct({
  id: S.String,
  itemId: S.String,
  chapterId: S.String,
  renditionId: S.String,
  relative: Seconds,
  createdAt: S.Number,
})
export type Bookmark = typeof Bookmark.Type

/** Durable annotation on an item. */
export const Note = S.Struct({
  id: S.String,
  itemId: S.String,
  body: S.String,
  chapterId: S.Option(S.String),
  renditionId: S.Option(S.String),
  relative: S.Option(Seconds),
  createdAt: S.Number,
  updatedAt: S.Number,
})
export type Note = typeof Note.Type

/** One account’s place in one item. */
export const Progress = S.Struct({
  id: S.String,
  itemId: S.String,
  chapterId: S.String,
  renditionId: S.String,
  relative: Seconds,
  finished: S.Boolean,
  hidden: S.Boolean,
  startedAt: S.Number,
  updatedAt: S.Number,
})
export type Progress = typeof Progress.Type

/** Named playback used when the current screen does not own an item. */
export const PlayIdle = ts('PlayIdle')
export const PlayPlaying = ts('PlayPlaying', {
  itemId: S.String,
  renditionId: S.String,
  mediaPosition: Seconds,
})
export const PlayPaused = ts('PlayPaused', {
  itemId: S.String,
  renditionId: S.String,
  mediaPosition: Seconds,
})
export const Play = S.Union([PlayIdle, PlayPlaying, PlayPaused])
export type Play = typeof Play.Type

/** Playback owned by the open reader. No itemId — the reader supplies it. */
export const BoundIdle = ts('BoundIdle')
export const BoundPlaying = ts('BoundPlaying', {
  renditionId: S.String,
  mediaPosition: Seconds,
})
export const BoundPaused = ts('BoundPaused', {
  renditionId: S.String,
  mediaPosition: Seconds,
})
export const BoundPlay = S.Union([BoundIdle, BoundPlaying, BoundPaused])
export type BoundPlay = typeof BoundPlay.Type

export const SignedOut = ts('SignedOut')
export const ShelfEmpty = ts('ShelfEmpty')
export const ShelfBrowse = ts('ShelfBrowse')
export const TitlePage = ts('TitlePage', { itemId: S.String })
export const ReaderText = ts('ReaderText', { itemId: S.String })
export const ReaderAudio = ts('ReaderAudio', { itemId: S.String })
export const ReaderBoth = ts('ReaderBoth', { itemId: S.String })
export const ImportIdle = ts('ImportIdle')
export const ImportScanning = ts('ImportScanning')
export const Settings = ts('Settings')
export const Accounts = ts('Accounts')
export const Search = ts('Search', { query: S.String })
export const SharedNote = ts('SharedNote', {
  noteId: S.String,
  secret: S.Option(S.String),
})

export const ReaderScreen = S.Union([ReaderText, ReaderAudio, ReaderBoth])
export type ReaderScreen = typeof ReaderScreen.Type

export const NonReaderScreen = S.Union([
  ShelfEmpty,
  ShelfBrowse,
  TitlePage,
  ImportIdle,
  ImportScanning,
  Settings,
  Accounts,
  Search,
  SharedNote,
])
export type NonReaderScreen = typeof NonReaderScreen.Type

export const Screen = S.Union([
  ShelfEmpty,
  ShelfBrowse,
  TitlePage,
  ReaderText,
  ReaderAudio,
  ReaderBoth,
  ImportIdle,
  ImportScanning,
  Settings,
  Accounts,
  Search,
  SharedNote,
])
export type Screen = typeof Screen.Type

/** Signed-out landing plus every signed-in destination. */
export type AppScreen = typeof SignedOut.Type | Screen

/** Background play beside a screen that does not own the playing item. */
export const Away = ts('Away', {
  screen: NonReaderScreen,
  play: Play,
})
/** Reader that owns play. Play cannot name a different item. */
export const Reading = ts('Reading', {
  screen: ReaderScreen,
  play: BoundPlay,
})
export const Location = S.Union([Away, Reading])
export type Location = typeof Location.Type

/** Active library session. accountId is None until Instant names the guest. */
export const SignedIn = ts('SignedIn', {
  accountId: S.Option(S.String),
  location: Location,
})
/** Session sum. SignedOut cannot carry an account. */
export const Session = S.Union([SignedOut, SignedIn])
export type Session = typeof Session.Type

/** Instant `notes.audience`. Private prints /n/:id (owner-only). */
export const NoteAudience = S.Literals(['public', 'unlisted', 'private'])
export type NoteAudience = typeof NoteAudience.Type

/** Light Otter mockup is the default presentation. */
export const Appearance = S.Literals(['light', 'dark'])
export type Appearance = typeof Appearance.Type

export const FollowLive = ts('FollowLive')
export const FollowAway = ts('FollowAway')
export const Follow = S.Union([FollowLive, FollowAway])
export type Follow = typeof Follow.Type

export const Model = S.Struct({
  session: Session,
  items: S.Array(Item),
  speechRate: NonNegativeNumber,
  bookmarks: S.Array(Bookmark),
  notes: S.Array(Note),
  noteDraft: S.String,
  noteAudience: NoteAudience,
  lastSharePath: S.Option(S.String),
  sharedNote: S.Option(Note),
  appearance: Appearance,
  follow: Follow,
  chapterSort: ChapterSort,
  progress: S.Array(Progress),
})
export type Model = typeof Model.Type

export const dune: Item = {
  id: 'i1',
  title: 'Dune',
  authorLabel: 'Frank Herbert',
  packaging: PackagingBoth({
    textId: 'r-text-1',
    audioId: 'r-audio-1',
    audioUrl: Option.none(),
  }),
  coverUrl: Option.none(),
  body: 'A beginning is the time for taking the most delicate care that the balances are correct.',
  words: [],
  chapters: [],
}

export const kindred: Item = {
  id: 'i2',
  title: 'Kindred',
  authorLabel: 'Octavia E. Butler',
  packaging: PackagingText({ textId: 'r-text-2' }),
  coverUrl: Option.none(),
  body: 'I lost an arm on my last trip home.',
  words: [],
  chapters: [],
}

export const newEarth: Item = {
  id: 'i3',
  title: 'A New Earth',
  authorLabel: 'Eckhart Tolle',
  packaging: PackagingBoth({
    textId: 'r-text-3',
    audioId: 'r-audio-3',
    audioUrl: Option.some('/media/a-new-earth.mp3'),
  }),
  coverUrl: Option.some('/media/a-new-earth.jpg'),
  body: 'Chapter One. Evocation.',
  words: newEarthEvocationWords,
  chapters: newEarthChapters,
}

export const initialModel: Model = {
  session: SignedOut(),
  items: [newEarth, dune, kindred],
  speechRate: 1,
  bookmarks: [],
  notes: [],
  noteDraft: '',
  noteAudience: 'private',
  lastSharePath: Option.none(),
  sharedNote: Option.none(),
  appearance: 'light',
  follow: FollowLive(),
  chapterSort: 'Index',
  progress: [],
}

export const itemById = (
  items: ReadonlyArray<Item>,
  itemId: string,
): Option.Option<Item> => Array.findFirst(items, item => item.id === itemId)

/** Audio payload when packaging includes a rendition. */
export const audioOfItem = (
  item: Item,
): Option.Option<{
  readonly audioId: string
  readonly audioUrl: Option.Option<string>
}> =>
  M.value(item.packaging).pipe(
    M.withReturnType<
      Option.Option<{
        readonly audioId: string
        readonly audioUrl: Option.Option<string>
      }>
    >(),
    M.tagsExhaustive({
      None: () => Option.none(),
      Text: () => Option.none(),
      Audio: ({ audioId, audioUrl }) => Option.some({ audioId, audioUrl }),
      Both: ({ audioId, audioUrl }) => Option.some({ audioId, audioUrl }),
    }),
  )

export const readerForItem = (item: Item): Screen =>
  M.value(item.packaging).pipe(
    M.withReturnType<Screen>(),
    M.tagsExhaustive({
      None: () => TitlePage({ itemId: item.id }),
      Text: () => ReaderText({ itemId: item.id }),
      Audio: () => ReaderAudio({ itemId: item.id }),
      Both: () => ReaderBoth({ itemId: item.id }),
    }),
  )

export const shelfForItems = (
  items: ReadonlyArray<Item>,
): typeof ShelfEmpty.Type | typeof ShelfBrowse.Type =>
  items.length === 0 ? ShelfEmpty() : ShelfBrowse()

export const isReaderScreen = (screen: AppScreen): screen is ReaderScreen =>
  screen._tag === 'ReaderText' ||
  screen._tag === 'ReaderAudio' ||
  screen._tag === 'ReaderBoth'

const boundPlayOf = (play: Play, itemId: string): BoundPlay =>
  M.value(play).pipe(
    M.withReturnType<BoundPlay>(),
    M.tagsExhaustive({
      PlayIdle: () => BoundIdle(),
      PlayPlaying: active =>
        active.itemId === itemId
          ? BoundPlaying({
              renditionId: active.renditionId,
              mediaPosition: active.mediaPosition,
            })
          : BoundIdle(),
      PlayPaused: active =>
        active.itemId === itemId
          ? BoundPaused({
              renditionId: active.renditionId,
              mediaPosition: active.mediaPosition,
            })
          : BoundIdle(),
    }),
  )

const namedPlayOf = (itemId: string, play: BoundPlay): Play =>
  M.value(play).pipe(
    M.withReturnType<Play>(),
    M.tagsExhaustive({
      BoundIdle: () => PlayIdle(),
      BoundPlaying: active =>
        PlayPlaying({
          itemId,
          renditionId: active.renditionId,
          mediaPosition: active.mediaPosition,
        }),
      BoundPaused: active =>
        PlayPaused({
          itemId,
          renditionId: active.renditionId,
          mediaPosition: active.mediaPosition,
        }),
    }),
  )

const locationFor = (screen: Screen, play: Play): Location => {
  if (isReaderScreen(screen)) {
    return Reading({ screen, play: boundPlayOf(play, screen.itemId) })
  }
  return Away({ screen, play })
}

/** Current destination, including the signed-out landing. */
export const screenOf = (model: Model): AppScreen => {
  if (model.session._tag === 'SignedOut') {
    return SignedOut()
  }
  return model.session.location.screen
}

/** Named playback. Idle while signed out. Reader play takes that reader's itemId. */
export const playOf = (model: Model): Play => {
  if (model.session._tag === 'SignedOut') {
    return PlayIdle()
  }
  return M.value(model.session.location).pipe(
    M.withReturnType<Play>(),
    M.tagsExhaustive({
      Away: ({ play }) => play,
      Reading: ({ screen, play }) => namedPlayOf(screen.itemId, play),
    }),
  )
}

/** Present only on SignedIn. SignedOut cannot carry an account. */
export const accountIdOf = (model: Model): Option.Option<string> =>
  model.session._tag === 'SignedOut' ? Option.none() : model.session.accountId

/** Places a destination. Reader + foreign play becomes idle on that reader. */
export const withView = (
  model: Model,
  patch: {
    readonly screen?: AppScreen
    readonly play?: Play
  },
): Model => {
  const screen = patch.screen ?? screenOf(model)
  const play = patch.play ?? playOf(model)
  const accountId = accountIdOf(model)
  if (screen._tag === 'SignedOut') {
    return { ...model, session: SignedOut() }
  }
  return {
    ...model,
    session: SignedIn({
      accountId,
      location: locationFor(screen, play),
    }),
  }
}

/** Sets named play. A foreign item while reading switches to that item's reader. */
export const withPlay = (model: Model, play: Play): Model => {
  if (model.session._tag === 'SignedOut') {
    if (play._tag === 'PlayIdle') {
      return model
    }
    return {
      ...model,
      session: SignedIn({
        accountId: Option.none(),
        location: Away({ screen: shelfForItems(model.items), play }),
      }),
    }
  }
  const { accountId, location } = model.session
  if (location._tag === 'Away') {
    return {
      ...model,
      session: SignedIn({
        accountId,
        location: Away({ screen: location.screen, play }),
      }),
    }
  }
  if (play._tag === 'PlayIdle') {
    return {
      ...model,
      session: SignedIn({
        accountId,
        location: Reading({ screen: location.screen, play: BoundIdle() }),
      }),
    }
  }
  if (play.itemId === location.screen.itemId) {
    return {
      ...model,
      session: SignedIn({
        accountId,
        location: Reading({
          screen: location.screen,
          play: boundPlayOf(play, play.itemId),
        }),
      }),
    }
  }
  const maybeItem = itemById(model.items, play.itemId)
  if (Option.isNone(maybeItem)) {
    return model
  }
  const nextScreen = readerForItem(maybeItem.value)
  if (!isReaderScreen(nextScreen)) {
    return model
  }
  return {
    ...model,
    session: SignedIn({
      accountId,
      location: Reading({
        screen: nextScreen,
        play: boundPlayOf(play, maybeItem.value.id),
      }),
    }),
  }
}

/** Sets or clears the Instant account on an active session. */
export const withAccount = (
  model: Model,
  accountId: Option.Option<string>,
): Model => {
  if (model.session._tag === 'SignedOut') {
    if (Option.isNone(accountId)) {
      return model
    }
    return {
      ...model,
      session: SignedIn({
        accountId,
        location: Away({
          screen: shelfForItems(model.items),
          play: PlayIdle(),
        }),
      }),
    }
  }
  return {
    ...model,
    session: SignedIn({
      accountId,
      location: model.session.location,
    }),
  }
}

/** Finds the word whose half-open interval contains an audio time. */
export const wordAt = (
  words: ReadonlyArray<Word>,
  seconds: Seconds,
): Option.Option<Word> =>
  Array.findFirst(words, word => seconds >= word.start && seconds < word.end)

/** Finds the chapter whose half-open interval contains an audio time. */
export const chapterAt = (
  chapters: ReadonlyArray<Chapter>,
  seconds: Seconds,
): Option.Option<Chapter> =>
  Array.findFirst(
    chapters,
    chapter => seconds >= chapter.start && seconds < chapter.end,
  )

/** Progress row for one shelf item, if this account has one. */
export const progressForItem = (
  progress: ReadonlyArray<Progress>,
  itemId: string,
): Option.Option<Progress> =>
  Array.findFirst(progress, row => row.itemId === itemId)

/** Last chapter end, or last word end, or zero. */
export const durationOfItem = (item: Item): Seconds => {
  const lastChapter = Array.last(item.chapters)
  if (Option.isSome(lastChapter)) {
    return lastChapter.value.end
  }
  const lastWord = Array.last(item.words)
  if (Option.isSome(lastWord)) {
    return lastWord.value.end
  }
  return 0
}

/** Half-open chapter length on the rendition clock. */
export const chapterDuration = (chapter: Chapter): Seconds =>
  Seconds.make(chapter.end - chapter.start)

/** Clock label for a trusted non-negative position or duration. */
export const formatClock = (seconds: Seconds): string => {
  const rounded = Math.floor(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const rest = rounded % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`
  }
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

const recency = (row: Progress): number =>
  row.updatedAt > 0 ? row.updatedAt : row.startedAt

/** The in-progress title to surface as Continue Listening. */
export const continueListeningItem = (
  items: ReadonlyArray<Item>,
  progress: ReadonlyArray<Progress>,
  play: Play,
): Option.Option<Item> => {
  if (play._tag !== 'PlayIdle') {
    return itemById(items, play.itemId)
  }
  const visible = Array.filter(progress, row => !row.hidden && !row.finished)
  const newest = Array.reduce(
    visible,
    Option.none<Progress>(),
    (maybeBest, row) => {
      if (Option.isNone(maybeBest)) {
        return Option.some(row)
      }
      return recency(row) >= recency(maybeBest.value)
        ? Option.some(row)
        : maybeBest
    },
  )
  if (Option.isNone(newest)) {
    return Option.none()
  }
  return itemById(items, newest.value.itemId)
}

/** Chapter on an item, if the id is on that spine. */
export const chapterById = (
  chapters: ReadonlyArray<Chapter>,
  chapterId: string,
): Option.Option<Chapter> =>
  Array.findFirst(chapters, chapter => chapter.id === chapterId)

const byChapterIndex = Order.mapInput(
  Order.Number,
  (chapter: Chapter) => chapter.index,
)
const byChapterTitle = Order.mapInput(
  Order.String,
  (chapter: Chapter) => chapter.title,
)

/** Title-page chapter list. Views must not sort chapters themselves. */
export const sortedChapters = (
  item: Item,
  sort: ChapterSort,
): ReadonlyArray<Chapter> =>
  sort === 'Title'
    ? Array.sort(item.chapters, byChapterTitle)
    : Array.sort(item.chapters, byChapterIndex)

/** Prior words plus the word whose interval contains mediaPosition. */
export const SpokenTail = S.Struct({
  prior: S.Array(Word),
  current: S.Option(Word),
  following: S.Array(Word),
})
export type SpokenTail = typeof SpokenTail.Type

export const DEFAULT_SPOKEN_TAIL_WINDOW = 4
const DEFAULT_SPOKEN_TAIL_FOLLOWING = 2

/** Spoken-word tail. Current identity is wordAt(play.mediaPosition). */
export const spokenTail = (
  item: Item,
  mediaPosition: Seconds,
  window: number = DEFAULT_SPOKEN_TAIL_WINDOW,
): SpokenTail => {
  const maybeCurrent = wordAt(item.words, mediaPosition)
  if (Option.isNone(maybeCurrent)) {
    return { prior: [], current: Option.none(), following: [] }
  }
  const maybeIndex = Array.findFirstIndex(
    item.words,
    word => word.id === maybeCurrent.value.id,
  )
  if (Option.isNone(maybeIndex)) {
    return { prior: [], current: maybeCurrent, following: [] }
  }
  const currentIndex = maybeIndex.value
  return {
    prior: Array.takeRight(Array.take(item.words, currentIndex), window),
    current: maybeCurrent,
    following: Array.take(
      Array.drop(item.words, currentIndex + 1),
      DEFAULT_SPOKEN_TAIL_FOLLOWING,
    ),
  }
}

/** Marks the current word with asterisks. Highlight identity stays wordAt. */
export const formatSpokenTail = (tail: SpokenTail): string => {
  const prior = Option.isSome(Array.head(tail.prior))
    ? ['…', ...tail.prior.map(word => word.text)]
    : []
  const current = Option.isSome(tail.current)
    ? [`*${tail.current.value.text}*`]
    : []
  const following = Option.isSome(Array.head(tail.following))
    ? [...tail.following.map(word => word.text), '…']
    : []
  return [...prior, ...current, ...following].join(' ')
}

/** Clock used by spoken-tail highlight. Idle or another item is zero. */
export const playMediaPosition = (play: Play, itemId: string): Seconds => {
  if (play._tag === 'PlayIdle' || play.itemId !== itemId) {
    return 0
  }
  return play.mediaPosition
}
