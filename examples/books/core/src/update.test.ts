import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  PlayIdle,
  PlayPlaying,
  PressedGoBack,
  PressedOpenBook,
  PressedPausePlayback,
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
  restore,
  update,
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
