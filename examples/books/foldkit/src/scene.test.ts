import {
  CompletedScrollCurrentWord,
  HeardPlaybackPosition,
  PlayPlaying,
  ReaderBoth,
  dune,
  initialModel,
  newEarth,
  update,
  withView,
} from 'books-core-example'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { ObserveReaderAudio, ScrollCurrentWord } from './audio-clock.js'
import { view } from './index.js'

const followAlongWords = [
  { id: 'w0', text: 'A', start: 0, end: 0.2 },
  { id: 'w1', text: 'beginning', start: 0.2, end: 0.7 },
  { id: 'w2', text: 'is', start: 0.7, end: 0.9 },
  { id: 'w3', text: 'the', start: 0.9, end: 1.05 },
  { id: 'w4', text: 'time', start: 1.05, end: 1.4 },
]

describe('view', () => {
  test('renders signed out', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.expect(Scene.text('Books')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Sign in' })).toExist(),
    )
  })

  test('signing in shows the shelf', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: 'Sign in' })),
      Scene.expect(Scene.text('Shelf')).toExist(),
      Scene.expect(Scene.role('link', { name: /A New Earth/ })).toExist(),
      Scene.expect(Scene.role('link', { name: /Dune/ })).toExist(),
      Scene.expect(Scene.role('link', { name: /Kindred/ })).toExist(),
    )
  })

  test('opening Dune shows the title page', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: 'Sign in' })),
      Scene.click(Scene.role('link', { name: /Dune/ })),
      Scene.expect(Scene.text('Frank Herbert')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Play' })).toExist(),
      Scene.expect(
        Scene.text(
          'A beginning is the time for taking the most delicate care that the balances are correct.',
        ),
      ).not.toExist(),
    )
  })

  test('opening a New Earth chapter lands in the reader', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: 'Sign in' })),
      Scene.click(Scene.role('link', { name: /A New Earth/ })),
      Scene.expect(Scene.text('Opening Credits')).toExist(),
      Scene.expect(Scene.text('THE NEW EARTH IS NO UTOPIA')).toExist(),
      Scene.click(Scene.role('button', { name: /EVOCATION/ })),
      Scene.Mount.resolveAll([
        ObserveReaderAudio,
        HeardPlaybackPosition({ mediaPosition: 18.669 }),
      ]),
      Scene.expect(Scene.role('button', { name: 'Play' })).toExist(),
      Scene.expect(Scene.text('EVOCATION')).toExist(),
    )
  })

  test('playing New Earth highlights the current word', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        withView(
          {
            ...initialModel,
            items: [
              {
                ...newEarth,
                body: 'A beginning is the time',
                words: followAlongWords,
              },
              dune,
            ],
          },
          {
            screen: ReaderBoth({ itemId: newEarth.id }),
            play: PlayPlaying({
              itemId: newEarth.id,
              renditionId: 'r-audio-3',
              mediaPosition: 0.5,
            }),
          },
        ),
      ),
      Scene.Mount.resolveAll(
        [ScrollCurrentWord, CompletedScrollCurrentWord()],
        [ObserveReaderAudio, HeardPlaybackPosition({ mediaPosition: 0.5 })],
      ),
      Scene.expect(Scene.role('button', { name: 'beginning' })).toHaveAttr(
        'aria-current',
        'true',
      ),
      Scene.expect(Scene.role('button', { name: 'A' })).not.toHaveAttr(
        'aria-current',
      ),
    )
  })

  test('settings names the highlight contract', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: 'Sign in' })),
      Scene.click(Scene.role('link', { name: 'Settings' })),
      Scene.expect(Scene.text('Speech rate 1 · highlight ≤ 50 ms')).toExist(),
    )
  })
})
