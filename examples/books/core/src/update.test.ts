import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { Option } from 'effect'

import {
  HeardFollowAlong,
  HeardPlaybackPosition,
  PlayIdle,
  PlayPlaying,
  PressedGoBack,
  PressedOpenBook,
  PressedPausePlayback,
  PressedSeekWord,
  PressedShowAudio,
  PressedSignIn,
  PressedSignOut,
  PressedStartPlayback,
  ReaderAudio,
  ReaderBoth,
  ShelfBrowse,
  SignedOut,
  dune,
  init,
  initialModel,
  newEarth,
  restore,
  update,
  wordAt,
} from './index.js'

describe('books update', () => {
  test('init uses signedOut and playIdle', () => {
    const [model, commands] = init()
    expect(model.screen._tag).toBe('SignedOut')
    expect(model.play._tag).toBe('PlayIdle')
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
        expect(model.screen).toEqual(ShelfBrowse())
      }),
    )
  })

  test('open Dune goes to reader both', () => {
    Story.story(
      update,
      Story.with({ ...initialModel, screen: ShelfBrowse() }),
      Story.message(PressedOpenBook({ itemId: dune.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(ReaderBoth({ itemId: dune.id }))
      }),
    )
  })

  test('show audio from both keeps the same item', () => {
    Story.story(
      update,
      Story.with({
        ...initialModel,
        screen: ReaderBoth({ itemId: dune.id }),
      }),
      Story.message(PressedShowAudio()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(ReaderAudio({ itemId: dune.id }))
      }),
    )
  })

  test('start playback then pause', () => {
    Story.story(
      update,
      Story.with({ ...initialModel, screen: ShelfBrowse() }),
      Story.message(PressedStartPlayback({ itemId: dune.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.play._tag).toBe('PlayPlaying')
      }),
      Story.message(PressedPausePlayback()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.play._tag).toBe('PlayPaused')
      }),
    )
  })

  test('go back returns to the shelf', () => {
    Story.story(
      update,
      Story.with({
        ...initialModel,
        screen: ReaderBoth({ itemId: dune.id }),
      }),
      Story.message(PressedGoBack()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(ShelfBrowse())
      }),
    )
  })

  test('open A New Earth goes to reader both', () => {
    Story.story(
      update,
      Story.with({ ...initialModel, screen: ShelfBrowse() }),
      Story.message(PressedOpenBook({ itemId: newEarth.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(ReaderBoth({ itemId: newEarth.id }))
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
      Story.with({
        ...initialModel,
        play: PlayPlaying({
          itemId: newEarth.id,
          renditionId: 'r-audio-3',
          mediaPosition: 0,
        }),
      }),
      Story.message(HeardPlaybackPosition({ mediaPosition: 0.5 })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.play).toEqual(
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
      Story.with({
        ...initialModel,
        play: PlayPlaying({
          itemId: newEarth.id,
          renditionId: 'r-audio-3',
          mediaPosition: 0,
        }),
      }),
      Story.message(PressedSeekWord({ start: 12.5 })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.play).toEqual(
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
      Story.with({
        ...initialModel,
        screen: ShelfBrowse(),
        play: PlayPlaying({
          itemId: dune.id,
          renditionId: 'r-audio-1',
          mediaPosition: 12,
        }),
      }),
      Story.message(PressedSignOut()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(SignedOut())
        expect(model.play).toEqual(PlayIdle())
      }),
    )
  })
})
