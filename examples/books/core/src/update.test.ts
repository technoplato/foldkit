import { Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  BookBothTarget,
  HeardCatalog,
  HeardFollowAlong,
  HeardPlaybackPosition,
  HeardSignedIn,
  HeardUserData,
  OpenedNavigation,
  PlayIdle,
  PlayPaused,
  PlayPlaying,
  PressedAddBookmark,
  PressedAddNote,
  PressedFollowLive,
  PressedGoBack,
  PressedOpenBook,
  PressedOpenChapter,
  PressedPausePlayback,
  PressedSeekWord,
  PressedSetChapterSort,
  PressedSetNoteAudience,
  PressedShowAudio,
  PressedSignIn,
  PressedSignOut,
  PressedStartPlayback,
  PressedToggleAppearance,
  ReaderAudio,
  ReaderBoth,
  ScrolledAway,
  ShelfBrowse,
  SignedOut,
  TitlePage,
  UpdatedNoteDraft,
  accountIdOf,
  dune,
  formatSpokenTail,
  init,
  initialModel,
  newEarth,
  playOf,
  restore,
  screenOf,
  sortedChapters,
  spokenTail,
  update,
  withView,
  wordAt,
} from './index.js'

describe('books update', () => {
  test('init uses signedOut and playIdle', () => {
    const [model, commands] = init()
    expect(screenOf(model)._tag).toBe('SignedOut')
    expect(playOf(model)._tag).toBe('PlayIdle')
    expect(model.noteDraft).toBe('')
    expect(commands).toEqual([])
  })

  test('restore preserves the Model', () => {
    expect(restore(initialModel)).toStrictEqual([initialModel, []])
  })

  test('sign in opens the populated shelf', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(PressedSignIn()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(screenOf(model)).toEqual(ShelfBrowse())
      }),
    )
  })

  test('open Dune goes to the title page', () => {
    Story.story(
      update,
      Story.with(withView(initialModel, { screen: ShelfBrowse() })),
      Story.message(PressedOpenBook({ itemId: dune.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(screenOf(model)).toEqual(TitlePage({ itemId: dune.id }))
      }),
    )
  })

  test('show audio from both keeps the same item', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ReaderBoth({ itemId: dune.id }),
        }),
      ),
      Story.message(PressedShowAudio()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(screenOf(model)).toEqual(ReaderAudio({ itemId: dune.id }))
      }),
    )
  })

  test('start playback then pause', () => {
    Story.story(
      update,
      Story.with(withView(initialModel, { screen: ShelfBrowse() })),
      Story.message(PressedStartPlayback({ itemId: dune.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(playOf(model)._tag).toBe('PlayPlaying')
      }),
      Story.message(PressedPausePlayback()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(playOf(model)._tag).toBe('PlayPaused')
      }),
    )
  })

  test('go back from the reader returns to the title page', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ReaderBoth({ itemId: dune.id }),
        }),
      ),
      Story.message(PressedGoBack()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(screenOf(model)).toEqual(TitlePage({ itemId: dune.id }))
      }),
      Story.message(PressedGoBack()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(screenOf(model)).toEqual(ShelfBrowse())
      }),
    )
  })

  test('open A New Earth goes to the title page', () => {
    Story.story(
      update,
      Story.with(withView(initialModel, { screen: ShelfBrowse() })),
      Story.message(PressedOpenBook({ itemId: newEarth.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(screenOf(model)).toEqual(TitlePage({ itemId: newEarth.id }))
        expect(
          model.items.find(item => item.id === newEarth.id)?.chapters,
        ).toHaveLength(114)
      }),
    )
  })

  test('open a New Earth chapter parks the reader at that start', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, { screen: TitlePage({ itemId: newEarth.id }) }),
      ),
      Story.message(
        PressedOpenChapter({ itemId: newEarth.id, chapterId: 'ch-002' }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(screenOf(model)).toEqual(ReaderBoth({ itemId: newEarth.id }))
        expect(playOf(model)).toEqual(
          PlayPaused({
            itemId: newEarth.id,
            renditionId: 'r-audio-3',
            mediaPosition: 483.955,
          }),
        )
        expect(model.progress[0]?.chapterId).toBe('ch-002')
      }),
    )
  })

  test('wordAt uses a half-open interval', () => {
    const words = [
      { id: 'w0', text: 'A', start: 0, end: 0.2 },
      { id: 'w1', text: 'beginning', start: 0.2, end: 0.7 },
    ]
    expect(wordAt(words, 0).pipe(Option.map(word => word.id))).toEqual(
      Option.some('w0'),
    )
    expect(wordAt(words, 0.2).pipe(Option.map(word => word.id))).toEqual(
      Option.some('w1'),
    )
    expect(wordAt(words, 0.7)).toEqual(Option.none())
  })

  test('heard playback position updates the playing clock', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ShelfBrowse(),
          play: PlayPlaying({
            itemId: newEarth.id,
            renditionId: 'r-audio-3',
            mediaPosition: 0,
          }),
        }),
      ),
      Story.message(HeardPlaybackPosition({ mediaPosition: 0.5 })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(playOf(model)).toEqual(
          PlayPlaying({
            itemId: newEarth.id,
            renditionId: 'r-audio-3',
            mediaPosition: 0.5,
          }),
        )
      }),
    )
  })

  test('heard follow-along fills New Earth words', () => {
    const words = [
      { id: 'w0', text: 'Earth', start: 0, end: 0.4 },
      { id: 'w1', text: 'emerged', start: 0.4, end: 0.9 },
    ]
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(
        HeardFollowAlong({
          itemId: newEarth.id,
          body: 'Earth emerged',
          words,
        }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        const item = model.items.find(row => row.id === newEarth.id)
        expect(item?.body).toBe('Earth emerged')
        expect(item?.words).toEqual(words)
      }),
    )
  })

  test('seek word updates the playing position', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ShelfBrowse(),
          play: PlayPlaying({
            itemId: newEarth.id,
            renditionId: 'r-audio-3',
            mediaPosition: 0,
          }),
        }),
      ),
      Story.message(PressedSeekWord({ start: 12.5 })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(playOf(model)).toEqual(
          PlayPlaying({
            itemId: newEarth.id,
            renditionId: 'r-audio-3',
            mediaPosition: 12.5,
          }),
        )
      }),
    )
  })

  test('sign out clears play', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ShelfBrowse(),
          play: PlayPlaying({
            itemId: dune.id,
            renditionId: 'r-audio-1',
            mediaPosition: 12,
          }),
        }),
      ),
      Story.message(PressedSignOut()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(screenOf(model)).toEqual(SignedOut())
        expect(playOf(model)).toEqual(PlayIdle())
      }),
    )
  })

  test('pause writes progress and play resumes from it', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ReaderBoth({ itemId: newEarth.id }),
          play: PlayPlaying({
            itemId: newEarth.id,
            renditionId: 'r-audio-3',
            mediaPosition: 18.669,
          }),
        }),
      ),
      Story.message(PressedPausePlayback()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(playOf(model)._tag).toBe('PlayPaused')
        expect(model.progress[0]?.relative).toBe(18.669)
        expect(model.progress[0]?.chapterId).toBe('ch-001')
      }),
      Story.message(PressedStartPlayback({ itemId: newEarth.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(playOf(model)).toEqual(
          PlayPlaying({
            itemId: newEarth.id,
            renditionId: 'r-audio-3',
            mediaPosition: 18.669,
          }),
        )
      }),
    )
  })

  test('add bookmark and note at the playing place', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ReaderBoth({ itemId: newEarth.id }),
          play: PlayPlaying({
            itemId: newEarth.id,
            renditionId: 'r-audio-3',
            mediaPosition: 18.669,
          }),
        }),
      ),
      Story.message(PressedAddBookmark()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.bookmarks).toHaveLength(1)
        expect(model.bookmarks[0]?.chapterId).toBe('ch-001')
        expect(model.bookmarks[0]?.relative).toBe(18.669)
      }),
      Story.message(UpdatedNoteDraft({ value: 'first flower' })),
      Story.Command.expectNone(),
      Story.message(PressedAddNote()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.notes).toHaveLength(1)
        expect(model.notes[0]?.body).toBe('first flower')
        expect(model.notes[0]?.itemId).toBe(newEarth.id)
        expect(model.noteDraft).toBe('')
      }),
    )
  })

  test('heard catalog replaces items and signed-in opens the shelf', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(HeardCatalog({ items: [dune] })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(screenOf(model)).toEqual(SignedOut())
        expect(model.items).toEqual([dune])
      }),
      Story.message(HeardSignedIn({ accountId: 'acct-1' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(accountIdOf(model)).toEqual(Option.some('acct-1'))
        expect(screenOf(model)).toEqual(ShelfBrowse())
      }),
    )
  })

  test('heard user data replaces bookmarks notes and progress', () => {
    Story.story(
      update,
      Story.with(withView(initialModel, { screen: ShelfBrowse() })),
      Story.message(
        HeardUserData({
          bookmarks: [
            {
              id: 'b1',
              itemId: newEarth.id,
              chapterId: 'ch-001',
              renditionId: 'r-audio-3',
              relative: 20,
              createdAt: 1,
            },
          ],
          notes: [],
          progress: [
            {
              id: 'p1',
              itemId: newEarth.id,
              chapterId: 'ch-001',
              renditionId: 'r-audio-3',
              relative: 20,
              finished: false,
              hidden: false,
              startedAt: 1,
              updatedAt: 1,
            },
          ],
        }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.bookmarks).toHaveLength(1)
        expect(model.progress[0]?.relative).toBe(20)
      }),
    )
  })

  test('empty note draft is a no-op', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ReaderBoth({ itemId: newEarth.id }),
        }),
      ),
      Story.message(PressedAddNote()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.notes).toEqual([])
        expect(model.noteDraft).toBe('')
      }),
      Story.message(UpdatedNoteDraft({ value: '   ' })),
      Story.Command.expectNone(),
      Story.message(PressedAddNote()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.notes).toEqual([])
        expect(model.noteDraft).toBe('   ')
      }),
    )
  })

  test('seek while idle parks on the chapter', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ReaderBoth({ itemId: newEarth.id }),
        }),
      ),
      Story.message(PressedSeekWord({ start: 483.955 })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(playOf(model)).toEqual(
          PlayPaused({
            itemId: newEarth.id,
            renditionId: 'r-audio-3',
            mediaPosition: 483.955,
          }),
        )
        expect(model.progress[0]?.chapterId).toBe('ch-002')
      }),
    )
  })
  test('appearance toggle updates Model', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(PressedToggleAppearance()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.appearance).toBe('dark')
      }),
      Story.message(PressedToggleAppearance()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.appearance).toBe('light')
      }),
    )
  })

  test('opened navigation makes destinations data', () => {
    Story.story(
      update,
      Story.with(withView(initialModel, { screen: ShelfBrowse() })),
      Story.message(
        OpenedNavigation({
          target: BookBothTarget.make({ itemId: newEarth.id }),
        }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(screenOf(model)).toEqual(ReaderBoth({ itemId: newEarth.id }))
      }),
    )
  })

  test('follow live and scrolled away', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ReaderBoth({ itemId: newEarth.id }),
        }),
      ),
      Story.message(ScrolledAway()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.follow._tag).toBe('FollowAway')
      }),
      Story.message(PressedFollowLive()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.follow._tag).toBe('FollowLive')
      }),
    )
  })

  test('sort by index lists New Earth 0 through 113', () => {
    const sorted = sortedChapters(newEarth, 'Index')
    expect(sorted).toHaveLength(114)
    expect(sorted.map(chapter => chapter.index)).toEqual(
      Array.from({ length: 114 }, (_, index) => index),
    )
    expect(sorted[0]?.title).toBe('Opening Credits')
    expect(sorted[113]?.title).toBe('THE NEW EARTH IS NO UTOPIA')
  })

  test('at Evocation start the current word is the first Evocation token', () => {
    const first = newEarth.words[0]
    expect(first?.text).toBe('Evocation')
    expect(first).toBeDefined()
    if (first === undefined) {
      return
    }
    const tail = spokenTail(newEarth, first.start, 4)
    expect(wordAt(newEarth.words, first.start)).toEqual(Option.some(first))
    expect(tail.current).toEqual(Option.some(first))
    expect(formatSpokenTail(tail)).toContain('*Evocation*')
  })

  test('set chapter sort is a Model fact', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, { screen: TitlePage({ itemId: newEarth.id }) }),
      ),
      Story.message(PressedSetChapterSort({ sort: 'Title' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.chapterSort).toBe('Title')
        const sorted = sortedChapters(newEarth, model.chapterSort)
        expect(sorted[0]?.title).not.toBe('Opening Credits')
      }),
    )
  })

  test('note audience stays on the session draft', () => {
    Story.story(
      update,
      Story.with(
        withView(initialModel, {
          screen: ReaderBoth({ itemId: newEarth.id }),
        }),
      ),
      Story.message(PressedSetNoteAudience({ audience: 'public' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.noteAudience).toBe('public')
      }),
    )
  })
})
