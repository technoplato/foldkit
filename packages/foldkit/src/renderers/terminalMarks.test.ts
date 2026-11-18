import { describe, expect, it } from 'vitest'

import { List, Transcript } from './elements.js'
import { renderScreen } from './render.js'

describe('what a search found, in a terminal', () => {
  it('sets a found word in single marks and the match a person is on in double marks', () => {
    const screen = renderScreen(
      Transcript({
        label: 'Words',
        action: 'SeekToWord',
        emptyText: 'No words yet.',
        passages: [
          {
            key: 'p1',
            label: '0:08',
            words: [
              { token: 'w1', text: 'lit' },
              { token: 'w2', text: 'the' },
              { token: 'w3', text: 'lamp', mark: 'Found' },
              { token: 'w4', text: 'before' },
              { token: 'w5', text: 'the' },
              { token: 'w6', text: 'lamp,', mark: 'Selected' },
              { token: 'w7', text: 'went', isCurrent: true },
            ],
          },
        ],
      }),
    )
    expect(screen).toContain('lit the ‹lamp› before the «lamp,» [went]')
  })

  it('sets the found part of a row’s title in single marks', () => {
    const screen = renderScreen(
      List({
        label: 'Matches',
        items: [
          {
            key: 'm1',
            title: '... wick and lit the lamp before the light',
            titleMark: { start: 21, end: 25 },
            lines: ['0:08 · The Tide'],
          },
        ],
      }),
    )
    expect(screen).toContain('... wick and lit the ‹lamp› before the light')
  })
})
