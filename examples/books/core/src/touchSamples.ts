import { Array, Option, Record as Record_, Redacted, Schema as S } from 'effect'
import * as ReadAloud from 'read-aloud-core-example'
import {
  ReachedPlace,
  ReceivedMatches,
  ReceivedPassages,
  SearchQuery,
  WordId,
} from 'transcript-player-core-example'

import { ImportFromAudible, ShowAddBooks } from './addBooks.js'
import * as Audible from './audible/index.js'
import { BookmarkId, Milliseconds, TitleSlug } from './ids.js'
import { init } from './init.js'
import {
  AddNotedBookmark,
  BookmarkWord,
  ConfirmDeleteBookmark,
  ConnectAudible,
  CopyWordLink,
  DeleteBookmark,
  ExpandControls,
  FailedReportStretch,
  LeavePlayhead,
  Listen,
  type Message,
  Open,
  OpenBookmark,
  Pause,
  PlayFrom,
  ReceivedChapters,
  ReceivedShelf,
  SearchFor,
  SeekTo,
  SeekToWord,
  SetBookmarkNote,
  SharedLink,
  ShowBookmarks,
  ShowContents,
  ShowLibrary,
  ShowProfile,
  ShowReadAloud,
  ShowSpeeds,
  ShowTitleMenu,
  ShowWordMenu,
  type catalog,
} from './message.js'
import {
  type Bookmark,
  BookmarkNote,
  type Model,
  type Shelf,
  StretchReport,
} from './model.js'
import { sampleChapters, sampleShelf } from './sample.js'
import { update } from './update.js'

// SAMPLES

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

const fieldGuide = TitleSlug.make('a-field-guide-to-weather')

const wordMs = 400

const laterMs = 20_000

const heardAtMs = Date.UTC(2026, 9, 18, 19, 0, 0)

const words = Array.map(
  'She set the plane table on the one flat stone and waited for the light'.split(
    ' ',
  ),
  (text, at) => ({
    wordId: WordId.make(`w-${at.toString()}`),
    text,
    startMs: Milliseconds.make(at * wordMs),
    endMs: Milliseconds.make(at * wordMs + wordMs - 40),
  }),
)

const laterWords = Array.map(
  'The snow had closed the lower road'.split(' '),
  (text, at) => ({
    wordId: WordId.make(`v-${at.toString()}`),
    text,
    startMs: Milliseconds.make(laterMs + at * wordMs),
    endMs: Milliseconds.make(laterMs + at * wordMs + wordMs - 40),
  }),
)

const passages = [
  {
    passageId: 'p-0',
    startMs: Milliseconds.make(0),
    endMs: Milliseconds.make(laterMs),
    words: [...words, ...laterWords],
  },
]

const bookmarkOf = (
  id: string,
  atMs: number,
  maybeNote: Option.Option<string>,
): Bookmark => ({
  bookmarkId: BookmarkId.make(id),
  slug: lanternKeeper,
  atMs: Milliseconds.make(atMs),
  createdAtMs: heardAtMs,
  maybeNote,
  maybeExcerpt: Option.none(),
})

const noted = bookmarkOf('bookmark-1', 60_000, Option.some('The pass'))

const plain = bookmarkOf('bookmark-2', 120_000, Option.none())

const shelf: Shelf = { ...sampleShelf, bookmarks: [noted, plain] }

const after = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  Array.reduce(messages, model, (state, message) => update(state, message)[0])

/** Before the shelf arrives. */
const waiting = init()[0]

/** On the library, the shelf and every title's chapters in. */
const onLibrary = Array.reduce(
  Record_.toEntries(sampleChapters),
  after(waiting, ReceivedShelf({ shelf })),
  (model, [slug, chapters]) =>
    after(model, ReceivedChapters({ slug: TitleSlug.make(slug), chapters })),
)

/** On one title's page, nothing in the player. */
const onTitle = after(onLibrary, Open({ slug: lanternKeeper }))

/** One book's menu open on the shelf. */
const withTitleMenu = after(onLibrary, ShowTitleMenu({ slug: lanternKeeper }))

/** The title's page with its chapters beside it. */
const withContents = after(onTitle, ShowContents())

/** The title's page with its bookmarks beside it. */
const withBookmarks = after(onTitle, ShowBookmarks())

/** One bookmark open, the one with a note. */
const withBookmarkOpen = after(
  onTitle,
  OpenBookmark({ bookmarkId: noted.bookmarkId }),
)

/** Asked whether to delete a bookmark. */
const asking = after(onTitle, DeleteBookmark({ bookmarkId: plain.bookmarkId }))

/** Just after a bookmark was deleted. */
const afterDelete = after(
  asking,
  ConfirmDeleteBookmark({ bookmarkId: plain.bookmarkId }),
)

const heard = (model: Model, placeMs: number): Model =>
  after(
    model,
    ReachedPlace({
      placeMs: Milliseconds.make(placeMs),
      wallClockMs: heardAtMs + placeMs,
    }),
  )

/** The title sounding in its player, two seconds in, its words in. */
const playing = heard(
  after(
    onLibrary,
    Listen({ slug: lanternKeeper }),
    ReceivedPassages({ passages }),
  ),
  2_000,
)

const query = SearchQuery.make('stone')

/**
 * Sounding, with every control showing, a search that found two places,
 * and a word's menu open.
 */
const busy = after(
  playing,
  ExpandControls(),
  SearchFor({ query }),
  ReceivedMatches({
    query,
    total: 2,
    matches: [
      { startMs: Milliseconds.make(800), text: 'the', before: '', after: '' },
      {
        startMs: Milliseconds.make(3_600),
        text: 'stone',
        before: '',
        after: '',
      },
    ],
    partsRead: 1,
    partsTotal: 1,
  }),
  ShowWordMenu({ wordId: WordId.make('w-3') }),
)

/** Paused in the player after sounding. */
const paused = after(playing, Pause())

/** Paused at the end of the title. */
const atEnd = after(
  paused,
  SeekTo({ placeMs: Milliseconds.make(4 * 30 * 60_000) }),
)

/** Sounding with a notice showing, a word's menu still open. */
const withNotice = after(busy, SharedLink({ how: 'Copied' }))

type Sent = Readonly<{ name: string; args?: unknown }>

type Heard = Readonly<{ model: Model; sent: ReadonlyArray<Sent> }>

const heardThrough = (model: Model, seconds: number): Heard =>
  Array.reduce(
    Array.makeBy(seconds, second => (second + 3) * 1_000),
    { model, sent: Array.empty<Sent>() },
    (state: Heard, placeMs): Heard => {
      const [next, more] = update(
        state.model,
        ReachedPlace({
          placeMs: Milliseconds.make(placeMs),
          wallClockMs: heardAtMs + placeMs,
        }),
      )
      return { model: next, sent: [...state.sent, ...more] }
    },
  )

const { model: listening, sent: reported } = heardThrough(playing, 6)

const decodeReport = S.decodeUnknownOption(S.toType(StretchReport))

/**
 * Sounding, ten seconds in, with the report that its stretch began
 * refused by Scribe's timeline and still to send.
 */
const withUnsentReport = Option.match(
  Array.findFirst(reported, command =>
    command.name === 'ReportStretch'
      ? decodeReport(command.args)
      : Option.none(),
  ),
  {
    onNone: () => listening,
    onSome: report =>
      after(listening, FailedReportStretch({ report, reason: 'offline' })),
  },
)

/**
 * Paused eight seconds in, the words scrolled away from the voice and a
 * word's menu open.
 */
const pausedAway = after(
  listening,
  LeavePlayhead(),
  ShowWordMenu({ wordId: WordId.make('w-3') }),
  Pause(),
)

/** Another title's page open while the first sounds in the player. */
const onOtherTitle = after(playing, Open({ slug: fieldGuide }))

/** The speeds to choose from, over the player. */
const withSpeeds = after(playing, ShowSpeeds())

/** The profile. */
const onProfile = after(onLibrary, ShowProfile())

/** Where more books can come from, over the library. */
const addingBooks = after(onLibrary, ShowAddBooks())

const audibleTitleOf = (asin: string, name: string): Audible.AudibleTitle => ({
  asin: Audible.Asin.make(asin),
  name,
  maybeSubtitle: Option.none(),
  authors: ['Mara Linden'],
  narrators: ['Ezra Vale'],
  series: [],
  maybeCoverUrl: Option.none(),
  maybeRuntimeMs: Option.some(Milliseconds.make(36_000_000)),
  match: 'New',
  marks: [],
})

const orchard = audibleTitleOf('B0FAKE0001', 'The Quiet Orchard')

const rivers = audibleTitleOf('B0FAKE0003', 'A Map of Small Rivers')

/** The Audible titles listed, one selected, one waiting for its audio. */
const audibleTitles = after(
  onLibrary,
  ImportFromAudible(),
  Audible.ReceivedAudibleLibrary({ titles: [orchard, rivers], skipped: [] }),
  Audible.ToggleAudibleTitle({ asin: rivers.asin }),
  Audible.ReceivedAudiobookAudio({
    status: {
      titles: [
        { asin: orchard.asin, name: orchard.name, state: Audible.AudioDone() },
        {
          asin: rivers.asin,
          name: rivers.name,
          state: Audible.AudioQueued({ position: 2 }),
        },
      ],
      next: rivers.asin,
      running: null,
    },
  }),
)

/** Back on the library with the Audible titles still listed. */
const audibleLeft = after(audibleTitles, ShowLibrary())

/** Asked for one book's audio, and the queue refused. */
const audibleAudioRefused = after(
  audibleTitles,
  Audible.GetAudiobookAudio({ asin: rivers.asin }),
  Audible.FailedQueueAudiobookAudio({
    problem: Audible.Unavailable({ reason: 'offline' }),
  }),
)

/** The Audible titles could not be read, for a reason trying again may fix. */
const audibleUnreadable = after(
  onLibrary,
  ImportFromAudible(),
  Audible.FailedReadAudibleLibrary({
    problem: Audible.Unavailable({ reason: 'offline' }),
  }),
)

/** Audible no longer accepts the saved login, after a sign-in ran out. */
const audibleExpired = after(
  onLibrary,
  ImportFromAudible(),
  Audible.FailedConnectAudible({ problem: Audible.SignInExpired() }),
  Audible.FailedReadAudibleLibrary({ problem: Audible.LoginExpired() }),
)

/** The Audible sign-in, not started yet. */
const audibleConnect = after(
  onLibrary,
  ImportFromAudible(),
  Audible.FailedReadAudibleLibrary({ problem: Audible.NotConnected() }),
)

/** The Audible sign-in, ready for the address Amazon shows. */
const audibleSignInReady = after(
  audibleConnect,
  Audible.StartedAudibleSignIn({
    loginUrl: 'https://signin.invalid/ap/signin?openid.mode=checkid_setup',
  }),
)

/** The Audible sign-in could not start. */
const audibleSignInStuck = after(
  audibleConnect,
  Audible.FailedStartAudibleSignIn({
    problem: Audible.Unavailable({ reason: 'offline' }),
  }),
)

const pictureBook: ReadAloud.Book = {
  bookId: ReadAloud.BookId.make('thing-the-red-kite'),
  key: ReadAloud.BookKey.make('the-red-kite'),
  maybeIsbn13: Option.none(),
  title: 'The Red Kite',
  credits: [],
  publishedBy: [],
  maybePublishYear: Option.none(),
  maybePageCount: Option.some(ReadAloud.PageNumber.make(4)),
  maybeCoverUrl: Option.none(),
  links: [],
  aliases: [],
  contents: [],
}

const readings = ReadAloud.ReceivedReadings({
  readings: {
    books: [pictureBook],
    turns: [
      {
        turnId: ReadAloud.TurnId.make('tonight-page-3'),
        bookId: pictureBook.bookId,
        readingId: ReadAloud.ReadingId.make('tonight'),
        page: ReadAloud.PageNumber.make(3),
        turnedAtMs: heardAtMs,
        isOngoing: true,
        maybeMoment: Option.none(),
      },
    ],
    sittings: [],
  },
})

/** The picture books read aloud, one being read now. */
const onReadAloud = after(onLibrary, ShowReadAloud(), readings)

/** One picture book open on its second page, while page 3 is read. */
const onPictureBook = after(
  onReadAloud,
  ReadAloud.OpenBook({ book: pictureBook.key }),
  ReadAloud.TurnToPage({ page: ReadAloud.PageNumber.make(2) }),
)

/** The picture book's page with a notice showing. */
const pictureBookShared = after(onPictureBook, SharedLink({ how: 'Copied' }))

/**
 * Models that between them show every Books Action doing all it says:
 * the library, a title's page and its panels, a bookmark being deleted,
 * the player sounding and paused, the Audible import at each of its
 * stops, and the picture books read aloud.
 */
export const sampleModels: ReadonlyArray<Model> = [
  waiting,
  onLibrary,
  withTitleMenu,
  onTitle,
  withContents,
  withBookmarks,
  withBookmarkOpen,
  asking,
  afterDelete,
  playing,
  busy,
  paused,
  atEnd,
  withNotice,
  pausedAway,
  withUnsentReport,
  onOtherTitle,
  withSpeeds,
  onProfile,
  addingBooks,
  audibleTitles,
  audibleLeft,
  audibleAudioRefused,
  audibleUnreadable,
  audibleExpired,
  audibleConnect,
  audibleSignInReady,
  audibleSignInStuck,
  onReadAloud,
  onPictureBook,
  pictureBookShared,
]

/** The Messages a person types or presses that no menu lists. */
export const sampleMessages: ReadonlyArray<typeof catalog.Message.Type> = [
  SeekTo({ placeMs: Milliseconds.make(60_000) }),
  SeekToWord({ wordId: WordId.make('w-0') }),
  PlayFrom({ placeMs: Milliseconds.make(3_600) }),
  SearchFor({ query: SearchQuery.make('light') }),
  ShowWordMenu({ wordId: WordId.make('w-5') }),
  CopyWordLink({ wordId: WordId.make('w-5') }),
  BookmarkWord({ wordId: WordId.make('w-5') }),
  AddNotedBookmark({ note: BookmarkNote.make('Why she waited') }),
  SetBookmarkNote({ note: BookmarkNote.make('The pass, again') }),
  ConnectAudible({
    address: Redacted.make(
      'https://signin.invalid/ap/maplanding?openid.oa2.authorization_code=made-up',
    ),
  }),
]
