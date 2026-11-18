import { describe, expect, it } from 'vitest'

import { Column, Text, Transcript } from './elements.js'
import { type LiveFrame, liveFrameOf } from './liveFrame.js'

// Made-up words: nothing here is from a real recording or book.
const sentence =
  'The keeper climbed the long stairs at dusk and trimmed the wick while far out a bell answered the lamp, slow and patient, over the dark water, and nobody on the shore was awake to see it.'

const words = sentence.split(' ')

const passageOf = (key: string, label: string, currentAt?: number) => ({
  key,
  label,
  ...(currentAt === undefined ? {} : { isCurrent: true }),
  words: words.map((text, index) => ({
    token: `${key}.${index.toString()}`,
    text,
    ...(index === currentAt ? { isCurrent: true } : {}),
  })),
})

const header = Column(
  {},
  Text('The Lantern Keeper', { emphasis: 'Headline' }),
  Text('The Tide · 0:36 of 1:20:00 · playing', { dim: true }),
)

const part = (currentAt: number) =>
  Transcript({
    label: 'Words',
    action: 'SeekToWord',
    emptyText: 'No words yet.',
    passages: [
      passageOf('p1', '0:00'),
      passageOf('p2', '0:20'),
      passageOf('p3', '0:40', currentAt),
      passageOf('p4', '1:00'),
      passageOf('p5', '1:20'),
    ],
  })

const footer = {
  commands: ['books pause', 'books skip-back', 'books bookmark', 'books link'],
  more: 'books actions',
}

const inked = { header, footer, marks: 'Ink' } as const

const widths = [40, 60, 100, 120]

const partsOf = (
  frame: LiveFrame,
  row: number,
): ReadonlyArray<readonly [string, string]> =>
  (frame.inks[row] ?? []).map(run => [
    (frame.lines[row] ?? '').slice(run.col, run.col + run.width),
    run.role,
  ])

const rowsWith = (frame: LiveFrame, text: string): ReadonlyArray<number> =>
  frame.lines.flatMap((line, row) => (line.includes(text) ? [row] : []))

describe('a part of the view fitted to a terminal of any size, to be read', () => {
  it.each(widths)(
    'is never wider than %i columns nor taller than the rows it is given',
    columns => {
      for (const rows of [6, 10, 16, 30]) {
        const frame = liveFrameOf(part(12), { columns, rows }, inked)
        expect(frame.lines.length).toBeLessThanOrEqual(rows)
        expect(frame.inks.length).toBe(frame.lines.length)
        expect(
          frame.lines.every(line => line.length <= columns),
          frame.lines.join('\n'),
        ).toBe(true)
      }
    },
  )

  it.each(widths)(
    'wraps between words at %i columns, never inside one, and shows the whole paragraph being read',
    columns => {
      const frame = liveFrameOf(part(12), { columns, rows: 60 }, inked)
      const bar = frame.lines.filter(line => line.startsWith('  ▎'))
      const spoken = bar
        .map(line => line.slice(line.indexOf('0:40') >= 0 ? 0 : 0))
        .map(line => line.replace(/^ {2}▎ (\d+:\d\d)?\s+/u, ''))
        .join(' ')
      expect(spoken).toBe(sentence)
    },
  )

  it('keeps a reading measure: a margin of two columns, and at most 72 columns of words however wide the window', () => {
    const frame = liveFrameOf(part(12), { columns: 200, rows: 60 }, inked)
    expect(
      frame.lines.every(line => line === '' || line.startsWith('  ')),
    ).toBe(true)
    const textColumn = (
      frame.lines.find(line => line.includes('0:40')) ?? ''
    ).indexOf('The keeper')
    expect(textColumn).toBe(10)
    expect(
      Math.max(...frame.lines.map(line => line.length)),
    ).toBeLessThanOrEqual(textColumn + 72)
  })

  it('opens with the heading on its own short lines, strong then quiet, and a blank line', () => {
    const frame = liveFrameOf(part(12), { columns: 60, rows: 30 }, inked)
    expect(frame.lines.slice(0, 3)).toEqual([
      '  The Lantern Keeper',
      '  The Tide · 0:36 of 1:20:00 · playing',
      '',
    ])
    expect(partsOf(frame, 0)).toEqual([['The Lantern Keeper', 'Text']])
    expect(partsOf(frame, 1)).toEqual([
      ['The Tide · 0:36 of 1:20:00 · playing', 'QuietText'],
    ])
  })

  it('wraps a heading too long for the window between words', () => {
    const long = Column(
      {},
      Text('The Lantern Keeper: A Tide Story of the Northern Shore, Book One', {
        emphasis: 'Headline',
      }),
    )
    const frame = liveFrameOf(
      part(12),
      { columns: 40, rows: 30 },
      { header: long },
    )
    expect(frame.lines.slice(0, 3)).toEqual([
      '  The Lantern Keeper: A Tide Story of',
      '  the Northern Shore, Book One',
      '',
    ])
  })

  it('marks the paragraph being read with a bar in the gutter, its time once, and its lines under its first word', () => {
    const frame = liveFrameOf(part(12), { columns: 60, rows: 30 }, inked)
    const read = frame.lines.filter(line => line.startsWith('  ▎'))
    expect(read).toEqual([
      '  ▎ 0:40  The keeper climbed the long stairs at dusk and',
      '  ▎       trimmed the wick while far out a bell answered the',
      '  ▎       lamp, slow and patient, over the dark water, and',
      '  ▎       nobody on the shore was awake to see it.',
    ])
    const [first = -1] = rowsWith(frame, '▎ 0:40')
    expect(partsOf(frame, first)).toEqual([
      ['▎', 'Accent'],
      ['0:40', 'QuietText'],
      ['The keeper climbed the long stairs at dusk and', 'ReadingSpoken'],
    ])
    expect(partsOf(frame, first + 1)).toEqual([
      ['▎', 'Accent'],
      ['trimmed the wick', 'ReadingSpoken'],
      ['while', 'ReadingCurrentWord'],
    ])
    expect(partsOf(frame, first + 2)).toEqual([['▎', 'Accent']])
  })

  it('shows the word being read by its role alone when the frame is inked, and in brackets when it is not', () => {
    const plain = liveFrameOf(
      part(12),
      { columns: 60, rows: 30 },
      { header, footer },
    )
    expect(rowsWith(plain, '[while]')).toHaveLength(1)
    const ink = liveFrameOf(part(12), { columns: 60, rows: 30 }, inked)
    expect(rowsWith(ink, '[')).toEqual([])
  })

  it('gives the paragraphs around it air and little room: a blank line between, the last two lines before and the first two after, quiet', () => {
    const frame = liveFrameOf(part(12), { columns: 60, rows: 30 }, inked)
    const [first = -1] = rowsWith(frame, '▎ 0:40')
    expect(frame.lines.slice(first - 3, first)).toEqual([
      '    0:20  … the lamp, slow and patient, over the dark water,',
      '          and nobody on the shore was awake to see it.',
      '',
    ])
    expect(frame.lines.slice(first + 4, first + 7)).toEqual([
      '',
      '    1:00  The keeper climbed the long stairs at dusk and',
      '          trimmed the wick while far out a bell answered …',
    ])
    expect(partsOf(frame, first - 3)).toEqual([
      ['0:20', 'QuietText'],
      ['… the lamp, slow and patient, over the dark water,', 'QuietText'],
    ])
    expect(frame.lines.join('\n')).not.toContain('  0:00  ')
    expect(frame.lines.join('\n')).not.toContain('  1:20  ')
  })

  it('ends, after a blank line, with what can be run now on a line or two: the commands as they are typed, the rest named quietly', () => {
    const wide = liveFrameOf(
      part(12),
      { columns: 100, rows: 30 },
      {
        footer: {
          commands: ['books pause', 'books skip-back'],
          more: 'books actions',
        },
      },
    )
    expect(wide.lines.slice(-2)).toEqual([
      '',
      '  books pause   books skip-back   ·   books actions for more',
    ])
    expect(partsOf(wide, wide.lines.length - 1)).toEqual([
      ['·', 'QuietText'],
      ['for more', 'QuietText'],
    ])
    const four = liveFrameOf(part(12), { columns: 100, rows: 30 }, inked)
    expect(four.lines.slice(-3)).toEqual([
      '',
      '  books pause   books skip-back   books bookmark   books link',
      '  books actions for more',
    ])
    const narrow = liveFrameOf(part(12), { columns: 40, rows: 30 }, inked)
    expect(narrow.lines.slice(-3)).toEqual([
      '',
      '  books pause   books skip-back',
      '  books actions for more',
    ])
  })

  it('gives up the commands first, then the paragraphs around, then the heading, and never the line of the word being read', () => {
    const at = (rows: number) =>
      liveFrameOf(part(12), { columns: 60, rows }, inked).lines.join('\n')
    expect(at(12)).toContain('books pause')
    expect(at(8)).not.toContain('books pause')
    expect(at(8)).toContain('The Lantern Keeper')
    expect(at(8)).not.toContain('0:20')
    expect(at(3)).not.toContain('The Lantern Keeper')
    for (const rows of [1, 2, 3, 5, 8, 12]) {
      expect(at(rows), rows.toString()).toContain('while')
    }
  })

  it('lays any other part out in the same margin', () => {
    const frame = liveFrameOf(
      Column({}, Text('Count'), Text('3')),
      { columns: 40, rows: 10 },
      { footer: { commands: ['counter increment'], more: 'counter help' } },
    )
    expect(frame.lines).toEqual([
      '  Count',
      '  3',
      '',
      '  counter increment',
      '  counter help for more',
    ])
  })
})
