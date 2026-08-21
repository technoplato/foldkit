import { Option, Schema as S } from 'effect'
import { describe, expect, expectTypeOf, test } from 'vitest'

import {
  Away,
  Bookmark,
  BoundPlaying,
  Chapter,
  Item,
  Model,
  NonNegativeNumber,
  Packaging,
  PackagingAudio,
  PackagingBoth,
  PackagingNone,
  PackagingText,
  PlayIdle,
  PlayPlaying,
  Progress,
  ReaderAudio,
  ReaderBoth,
  ReaderText,
  Reading,
  Session,
  SignedIn,
  SignedOut,
  TitlePage,
  Word,
  accountIdOf,
  chapterDuration,
  dune,
  formatClock,
  initialModel,
  itemById,
  kindred,
  newEarth,
  playOf,
  readerForItem,
  screenOf,
  withPlay,
  withView,
} from './model.js'

const isFailure = <A, I>(schema: S.Codec<A, I>, value: unknown): boolean =>
  S.decodeUnknownExit(schema)(value)._tag === 'Failure'

const isSuccess = <A, I>(schema: S.Codec<A, I>, value: unknown): boolean =>
  S.decodeUnknownExit(schema)(value)._tag === 'Success'

const validWord = {
  id: 'w1',
  text: 'A',
  start: 0,
  end: 1.5,
}

const validChapter = {
  id: 'ch-1',
  index: 0,
  title: 'Opening',
  start: 0,
  end: 15.669,
}

const validBookmark = {
  id: 'b1',
  itemId: 'i1',
  chapterId: 'ch-1',
  renditionId: 'r1',
  relative: 0,
  createdAt: 1,
}

const validProgress = {
  id: 'p1',
  itemId: 'i1',
  chapterId: 'ch-1',
  renditionId: 'r1',
  relative: 0,
  finished: false,
  hidden: false,
  startedAt: 1,
  updatedAt: 1,
}

describe('books clocks', () => {
  test('negative word start and end fail decode', () => {
    expect(isSuccess(Word, validWord)).toBe(true)
    expect(isFailure(Word, { ...validWord, start: -0.1 })).toBe(true)
    expect(isFailure(Word, { ...validWord, end: -1 })).toBe(true)
  })

  test('negative chapter start, end, and index fail decode', () => {
    expect(isSuccess(Chapter, validChapter)).toBe(true)
    expect(isFailure(Chapter, { ...validChapter, start: -1 })).toBe(true)
    expect(isFailure(Chapter, { ...validChapter, end: -1 })).toBe(true)
    expect(isFailure(Chapter, { ...validChapter, index: -1 })).toBe(true)
  })

  test('negative bookmark and progress relative fail decode', () => {
    expect(isSuccess(Bookmark, validBookmark)).toBe(true)
    expect(isSuccess(Progress, validProgress)).toBe(true)
    expect(isFailure(Bookmark, { ...validBookmark, relative: -1 })).toBe(true)
    expect(isFailure(Progress, { ...validProgress, relative: -1 })).toBe(true)
  })

  test('negative speechRate fails decode', () => {
    expect(isSuccess(NonNegativeNumber, 1)).toBe(true)
    expect(isFailure(NonNegativeNumber, -1)).toBe(true)
  })

  test('zero-length chapters decode and have zero duration', () => {
    const chapter = Chapter.make({
      id: 'ch-empty',
      index: 0,
      title: 'Empty',
      start: 0,
      end: 0,
    })
    expect(chapterDuration(chapter)).toBe(0)
    expect(formatClock(chapterDuration(chapter))).toBe('0:00')

    const laterEmpty = Chapter.make({
      id: 'ch-later',
      index: 2,
      title: 'Later empty',
      start: 15.669,
      end: 15.669,
    })
    expect(chapterDuration(laterEmpty)).toBe(0)
    expect(formatClock(laterEmpty.start)).toBe('0:15')
  })

  test('formatClock labels trusted non-negative seconds', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(3661)).toBe('1:01:01')
  })
})

const unpackaged: Item = {
  id: 'i0',
  title: 'Empty',
  authorLabel: 'Anon',
  packaging: PackagingNone(),
  coverUrl: Option.none(),
  body: '',
  words: [],
  chapters: [],
}

const audioOnly: Item = {
  ...unpackaged,
  id: 'i-audio',
  packaging: PackagingAudio({
    audioId: 'r-audio',
    audioUrl: Option.none(),
  }),
}

describe('books item packaging', () => {
  test('Both without textId or audioId fails decode', () => {
    expect(
      isSuccess(
        Packaging,
        S.encodeSync(Packaging)(
          PackagingBoth({
            textId: 't1',
            audioId: 'a1',
            audioUrl: Option.none(),
          }),
        ),
      ),
    ).toBe(true)
    expect(isFailure(Packaging, { _tag: 'Both', audioId: 'a1' })).toBe(true)
    expect(isFailure(Packaging, { _tag: 'Both', textId: 't1' })).toBe(true)
  })

  test('Audio without audioId and Text without textId fail decode', () => {
    expect(isFailure(Packaging, { _tag: 'Audio' })).toBe(true)
    expect(isFailure(Packaging, { _tag: 'Text' })).toBe(true)
    expect(isSuccess(Packaging, { _tag: 'None' })).toBe(true)
    expect(
      isSuccess(
        Packaging,
        S.encodeSync(Packaging)(PackagingText({ textId: 't1' })),
      ),
    ).toBe(true)
  })

  test('independent preferred and optional ids are not an Item', () => {
    const encoded = S.encodeSync(Item)(kindred)
    expect('packaging' in encoded).toBe(true)
    expect('preferred' in encoded).toBe(false)
    expect(
      isFailure(Item, {
        id: 'i-bad',
        title: 'Bad',
        authorLabel: 'Anon',
        preferred: 'None',
        textId: { _tag: 'Some', value: 't1' },
        audioId: { _tag: 'Some', value: 'a1' },
        audioUrl: { _tag: 'None' },
        coverUrl: { _tag: 'None' },
        body: '',
        words: [],
        chapters: [],
      }),
    ).toBe(true)
  })

  test('readerForItem is exhaustive and None opens TitlePage not ReaderText', () => {
    expect(readerForItem(unpackaged)).toEqual(
      TitlePage({ itemId: unpackaged.id }),
    )
    expect(readerForItem(unpackaged)._tag).not.toBe('ReaderText')
    expect(readerForItem(kindred)).toEqual(ReaderText({ itemId: kindred.id }))
    expect(readerForItem(audioOnly)).toEqual(
      ReaderAudio({ itemId: audioOnly.id }),
    )
    expect(
      readerForItem({
        ...unpackaged,
        packaging: PackagingBoth({
          textId: 't1',
          audioId: 'a1',
          audioUrl: Option.none(),
        }),
      }),
    ).toEqual(ReaderBoth({ itemId: unpackaged.id }))
  })
})

describe('books session and reader play', () => {
  test('SignedOut cannot carry an account', () => {
    expect(isSuccess(Session, { _tag: 'SignedOut' })).toBe(true)
    expect(
      S.decodeUnknownSync(Session)({
        _tag: 'SignedOut',
        accountId: { _tag: 'Some', value: 'acct-1' },
      }),
    ).toEqual(SignedOut())
    expect('accountId' in SignedOut()).toBe(false)
    expect(accountIdOf(initialModel)).toEqual(Option.none())
    expectTypeOf(SignedOut()).not.toHaveProperty('accountId')

    const encoded = S.encodeSync(Model)(initialModel)
    expect(
      isFailure(Model, {
        screen: { _tag: 'SignedOut' },
        play: { _tag: 'PlayIdle' },
        accountId: { _tag: 'Some', value: 'acct-1' },
        items: encoded.items,
        speechRate: encoded.speechRate,
        bookmarks: encoded.bookmarks,
        notes: encoded.notes,
        noteDraft: encoded.noteDraft,
        noteAudience: encoded.noteAudience,
        lastSharePath: encoded.lastSharePath,
        sharedNote: encoded.sharedNote,
        appearance: encoded.appearance,
        follow: encoded.follow,
        chapterSort: encoded.chapterSort,
        progress: encoded.progress,
      }),
    ).toBe(true)
  })

  test('reader play cannot name a foreign item', () => {
    expectTypeOf<typeof BoundPlaying.Type>().not.toHaveProperty('itemId')

    const reading = withView(initialModel, {
      screen: ReaderBoth({ itemId: newEarth.id }),
      play: PlayPlaying({
        itemId: newEarth.id,
        renditionId: 'r-audio-3',
        mediaPosition: 1,
      }),
    })
    expect(screenOf(reading)).toEqual(ReaderBoth({ itemId: newEarth.id }))
    expect(playOf(reading)).toEqual(
      PlayPlaying({
        itemId: newEarth.id,
        renditionId: 'r-audio-3',
        mediaPosition: 1,
      }),
    )
    expect(reading.session._tag).toBe('SignedIn')
    if (reading.session._tag === 'SignedIn') {
      expect(reading.session.location._tag).toBe('Reading')
      if (reading.session.location._tag === 'Reading') {
        expect(reading.session.location.play._tag).toBe('BoundPlaying')
        expect('itemId' in reading.session.location.play).toBe(false)
      }
    }

    const disagreed = withView(initialModel, {
      screen: ReaderBoth({ itemId: newEarth.id }),
      play: PlayPlaying({
        itemId: dune.id,
        renditionId: 'r-audio-1',
        mediaPosition: 9,
      }),
    })
    expect(screenOf(disagreed)).toEqual(ReaderBoth({ itemId: newEarth.id }))
    expect(playOf(disagreed)).toEqual(PlayIdle())

    const encoded = S.encodeSync(Model)(reading)
    expect(
      isFailure(Model, {
        ...encoded,
        session: {
          _tag: 'SignedIn',
          accountId: { _tag: 'None' },
          location: {
            _tag: 'Reading',
            screen: S.encodeSync(ReaderBoth)(
              ReaderBoth({ itemId: newEarth.id }),
            ),
            play: S.encodeSync(PlayPlaying)(
              PlayPlaying({
                itemId: dune.id,
                renditionId: 'r-audio-1',
                mediaPosition: 9,
              }),
            ),
          },
        },
      }),
    ).toBe(true)

    expect(
      isFailure(Away, {
        _tag: 'Away',
        screen: S.encodeSync(ReaderBoth)(ReaderBoth({ itemId: newEarth.id })),
        play: S.encodeSync(PlayPlaying)(
          PlayPlaying({
            itemId: dune.id,
            renditionId: 'r-audio-1',
            mediaPosition: 9,
          }),
        ),
      }),
    ).toBe(true)
    expect(
      isFailure(Reading, {
        _tag: 'Reading',
        screen: S.encodeSync(ReaderBoth)(ReaderBoth({ itemId: newEarth.id })),
        play: S.encodeSync(PlayPlaying)(
          PlayPlaying({
            itemId: dune.id,
            renditionId: 'r-audio-1',
            mediaPosition: 9,
          }),
        ),
      }),
    ).toBe(true)
  })

  test('title page may name a different playing item than the open book', () => {
    const model = withView(initialModel, {
      screen: TitlePage({ itemId: dune.id }),
      play: PlayPlaying({
        itemId: newEarth.id,
        renditionId: 'r-audio-3',
        mediaPosition: 1,
      }),
    })
    expect(screenOf(model)).toEqual(TitlePage({ itemId: dune.id }))
    expect(playOf(model)).toEqual(
      PlayPlaying({
        itemId: newEarth.id,
        renditionId: 'r-audio-3',
        mediaPosition: 1,
      }),
    )
  })

  test('withPlay switches the reader when play names another item', () => {
    const reading = withView(initialModel, {
      screen: ReaderBoth({ itemId: newEarth.id }),
    })
    const switched = withPlay(
      reading,
      PlayPlaying({
        itemId: dune.id,
        renditionId: 'r-audio-1',
        mediaPosition: 3,
      }),
    )
    expect(screenOf(switched)).toEqual(ReaderBoth({ itemId: dune.id }))
    expect(playOf(switched)).toEqual(
      PlayPlaying({
        itemId: dune.id,
        renditionId: 'r-audio-1',
        mediaPosition: 3,
      }),
    )
  })

  test('itemById returns Option', () => {
    expect(itemById(initialModel.items, newEarth.id)).toEqual(
      Option.some(newEarth),
    )
    expect(itemById(initialModel.items, 'missing')).toEqual(Option.none())
    expectTypeOf(itemById(initialModel.items, 'x')).toEqualTypeOf<
      Option.Option<Item>
    >()
  })

  test('SignedIn with an account cannot be SignedOut', () => {
    const signedIn = SignedIn({
      accountId: Option.some('acct-1'),
      location: Away({
        screen: TitlePage({ itemId: dune.id }),
        play: PlayIdle(),
      }),
    })
    expect(signedIn._tag).toBe('SignedIn')
    expect(signedIn.accountId).toEqual(Option.some('acct-1'))
    expect('accountId' in SignedOut()).toBe(false)
    expectTypeOf(signedIn).toHaveProperty('accountId')
    expectTypeOf(SignedOut()).not.toHaveProperty('accountId')
  })
})
