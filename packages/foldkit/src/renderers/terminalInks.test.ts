import { describe, expect, it } from 'vitest'

import { Button, Column, Transcript } from './elements.js'
import { layoutTree } from './layout.js'
import { paintAscii } from './paint.js'

// Made-up words: nothing here is from a real recording or book.
const reader = Transcript({
  label: 'Words',
  action: 'SeekToWord',
  emptyText: 'No words yet.',
  passages: [
    {
      key: 'p1',
      label: '0:30',
      words: [
        { token: 'w1', text: 'The' },
        { token: 'w2', text: 'keeper', mark: 'Found' },
      ],
    },
    {
      key: 'p2',
      label: '0:35',
      heading: 'The Tide',
      isCurrent: true,
      words: [
        { token: 'w3', text: 'He' },
        { token: 'w4', text: 'trimmed', isCurrent: true },
        { token: 'w5', text: 'the', mark: 'Selected' },
        { token: 'w6', text: 'wick' },
      ],
    },
  ],
})

const painted = paintAscii(layoutTree(reader, 0, 0, 60))

const partsOf = (row: number): ReadonlyArray<readonly [string, string]> =>
  (painted.inks[row] ?? []).map(run => [
    (painted.lines[row] ?? '').slice(run.col, run.col + run.width),
    run.role,
  ])

describe('the roles a painted screen says its parts play, for a terminal to ink', () => {
  it('says a role for every line it paints', () => {
    expect(painted.inks.length).toBe(painted.lines.length)
  })

  it('rests a paragraph that is not being read, and marks a word a search found', () => {
    expect(partsOf(0)).toEqual([
      [' 0:30', 'QuietText'],
      ['The', 'QuietText'],
      ['‹keeper›', 'Mark'],
    ])
  })

  it('keeps a heading uncolored and bold so headings never share the pressable color', () => {
    expect(partsOf(2)).toEqual([['THE TIDE', 'Text']])
  })

  it('keeps hour-long timestamps in their own column with space before words', () => {
    const longReader = Transcript({
      label: 'Words',
      action: 'SeekToWord',
      emptyText: 'No words yet.',
      passages: [
        {
          key: 'p1',
          label: '1:59:46',
          words: [
            { token: 'w1', text: 'They' },
            { token: 'w2', text: 'are' },
          ],
        },
        {
          key: 'p2',
          label: '10:00:00',
          isCurrent: true,
          words: [
            { token: 'w3', text: 'Still' },
            { token: 'w4', text: 'here', isCurrent: true },
          ],
        },
      ],
    })
    const longPainted = paintAscii(layoutTree(longReader, 0, 0, 60))
    expect(longPainted.lines[0]?.trimEnd()).toMatch(/^ 1:59:46 {2,}They are$/)
    expect(longPainted.lines[1]?.trimEnd()).toMatch(
      /^›10:00:00 {2,}Still \[here\]$/,
    )
  })

  it('reads the paragraph being read: what was spoken, the word being spoken, the match a person is on, and what is to come', () => {
    expect(partsOf(3)).toEqual([
      ['›0:35', 'QuietText'],
      ['He', 'ReadingSpoken'],
      ['[trimmed]', 'ReadingCurrentWord'],
      ['«the»', 'SelectedMark'],
      ['wick', 'ReadingToCome'],
    ])
  })

  it('colors every pressable button with Accent, focused with Focus, and disabled with QuietText', () => {
    const buttons = paintAscii(
      layoutTree(
        Column(
          {},
          { ...Button({ label: 'Play', action: 'Play' }), focused: true },
          Button({ label: 'Contents', action: 'Contents', isCurrent: true }),
          Button({ label: 'Search', action: 'Search' }),
          Button({ label: 'Next', action: 'Next', disabled: true }),
        ),
        0,
        0,
        40,
      ),
    )
    expect(
      buttons.inks.map((runs, row) =>
        runs.map(run => [
          (buttons.lines[row] ?? '').slice(run.col, run.col + run.width),
          run.role,
        ]),
      ),
    ).toEqual([
      [['[>Play<]', 'Focus']],
      [['[*Contents*]', 'Accent']],
      [['[ Search ]', 'Accent']],
      [['[ Next ]', 'QuietText']],
    ])
  })
})
