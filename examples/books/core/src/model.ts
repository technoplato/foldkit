import { Array, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { newEarthChapters } from './new-earth-chapters.js'

/** Preferred packaging on a shelf row. */
export const Preferred = S.Literals(['None', 'Audio', 'Text', 'Both'])
export type Preferred = typeof Preferred.Type

/** One spoken token on the audio timeline. */
export const Word = S.Struct({
  id: S.String,
  text: S.String,
  start: S.Number,
  end: S.Number,
})
export type Word = typeof Word.Type

/** Ordered spine section of a work, with rendition-relative times. */
export const Chapter = S.Struct({
  id: S.String,
  index: S.Number,
  title: S.String,
  start: S.Number,
  end: S.Number,
})
export type Chapter = typeof Chapter.Type

/** One shelf row the Program can open. */
export const Item = S.Struct({
  id: S.String,
  title: S.String,
  authorLabel: S.String,
  preferred: Preferred,
  textId: S.Option(S.String),
  audioId: S.Option(S.String),
  audioUrl: S.Option(S.String),
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
  relative: S.Number,
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
  relative: S.Option(S.Number),
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
  relative: S.Number,
  finished: S.Boolean,
  hidden: S.Boolean,
  startedAt: S.Number,
  updatedAt: S.Number,
})
export type Progress = typeof Progress.Type

export const PlayIdle = ts('PlayIdle')
export const PlayPlaying = ts('PlayPlaying', {
  itemId: S.String,
  renditionId: S.String,
  mediaPosition: S.Number,
})
export const PlayPaused = ts('PlayPaused', {
  itemId: S.String,
  renditionId: S.String,
  mediaPosition: S.Number,
})
export const Play = S.Union([PlayIdle, PlayPlaying, PlayPaused])
export type Play = typeof Play.Type

export const SignedOut = ts('SignedOut')
export const ShelfEmpty = ts('ShelfEmpty')
export const ShelfBrowse = ts('ShelfBrowse')
export const ReaderText = ts('ReaderText', { itemId: S.String })
export const ReaderAudio = ts('ReaderAudio', { itemId: S.String })
export const ReaderBoth = ts('ReaderBoth', { itemId: S.String })
export const ImportIdle = ts('ImportIdle')
export const ImportScanning = ts('ImportScanning')
export const Settings = ts('Settings')
export const Accounts = ts('Accounts')
export const Search = ts('Search', { query: S.String })
export const Screen = S.Union([
  SignedOut,
  ShelfEmpty,
  ShelfBrowse,
  ReaderText,
  ReaderAudio,
  ReaderBoth,
  ImportIdle,
  ImportScanning,
  Settings,
  Accounts,
  Search,
])
export type Screen = typeof Screen.Type

/** Session-only note visibility. Not stored on Instant Note. */
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
  screen: Screen,
  play: Play,
  items: S.Array(Item),
  speechRate: S.Number,
  accountId: S.Option(S.String),
  bookmarks: S.Array(Bookmark),
  notes: S.Array(Note),
  noteDraft: S.String,
  noteAudience: NoteAudience,
  appearance: Appearance,
  follow: Follow,
  progress: S.Array(Progress),
})
export type Model = typeof Model.Type

export const dune: Item = {
  id: 'i1',
  title: 'Dune',
  authorLabel: 'Frank Herbert',
  preferred: 'Both',
  textId: Option.some('r-text-1'),
  audioId: Option.some('r-audio-1'),
  audioUrl: Option.none(),
  coverUrl: Option.none(),
  body: 'A beginning is the time for taking the most delicate care that the balances are correct.',
  words: [],
  chapters: [],
}

export const kindred: Item = {
  id: 'i2',
  title: 'Kindred',
  authorLabel: 'Octavia E. Butler',
  preferred: 'Text',
  textId: Option.some('r-text-2'),
  audioId: Option.none(),
  audioUrl: Option.none(),
  coverUrl: Option.none(),
  body: 'I lost an arm on my last trip home.',
  words: [],
  chapters: [],
}

export const newEarth: Item = {
  id: 'i3',
  title: 'A New Earth',
  authorLabel: 'Eckhart Tolle',
  preferred: 'Both',
  textId: Option.some('r-text-3'),
  audioId: Option.some('r-audio-3'),
  audioUrl: Option.some('/media/a-new-earth.mp3'),
  coverUrl: Option.some('/media/a-new-earth.jpg'),
  body: 'Chapter One. Evocation.',
  words: [],
  chapters: newEarthChapters,
}

export const initialModel: Model = {
  screen: SignedOut(),
  play: PlayIdle(),
  items: [newEarth, dune, kindred],
  speechRate: 1,
  accountId: Option.none(),
  bookmarks: [],
  notes: [],
  noteDraft: '',
  noteAudience: 'private',
  appearance: 'light',
  follow: FollowLive(),
  progress: [],
}

export const itemById = (
  items: ReadonlyArray<Item>,
  itemId: string,
): Item | undefined => items.find(item => item.id === itemId)

export const readerForItem = (item: Item): Screen => {
  if (item.preferred === 'Both') {
    return ReaderBoth({ itemId: item.id })
  }
  if (item.preferred === 'Audio') {
    return ReaderAudio({ itemId: item.id })
  }
  return ReaderText({ itemId: item.id })
}

export const shelfForItems = (items: ReadonlyArray<Item>): Screen =>
  items.length === 0 ? ShelfEmpty() : ShelfBrowse()

/** Finds the word whose half-open interval contains an audio time. */
export const wordAt = (
  words: ReadonlyArray<Word>,
  seconds: number,
): Option.Option<Word> =>
  Array.findFirst(words, word => seconds >= word.start && seconds < word.end)

/** Finds the chapter whose half-open interval contains an audio time. */
export const chapterAt = (
  chapters: ReadonlyArray<Chapter>,
  seconds: number,
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
