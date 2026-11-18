import { describe, expect, it } from 'vitest'

import { Column, Text, Transcript } from './elements.js'
import { liveFrameOf } from './liveFrame.js'

// Made-up words: nothing here is from a real recording or book.
const sentence =
  'The keeper climbed the long stairs at dusk and trimmed the wick while far out a bell answered the lamp, slow and patient, over the dark water.'

const passageOf = (key: string, label: string, currentAt?: number) => ({
  key,
  label,
  ...(currentAt === undefined ? {} : { isCurrent: true }),
  words: sentence.split(' ').map((text, index) => ({
    token: `${key}.${index.toString()}`,
    text,
    ...(index === currentAt ? { isCurrent: true } : {}),
  })),
})

const header = Column(
  {},
  Text('The Lantern Keeper · The Tide'),
  Text('0:36 of 1:20:00 · playing'),
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

const footer = [
  '  books pause      Pauses and keeps your place',
  '  books skip-back  Goes back 30 seconds',
  '  books actions    Lists every command',
]

const widths = [40, 60, 120]

describe('a part of the view fitted to a terminal of any size', () => {
  it.each(widths)(
    'is never wider than %i columns nor taller than the rows it is given',
    columns => {
      for (const rows of [8, 14, 30]) {
        const frame = liveFrameOf(
          part(12),
          { columns, rows },
          { header, footer },
        )
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
    'keeps the line of the word being read in view at %i columns, wherever the word is in a long paragraph',
    columns => {
      for (const currentAt of [0, 12, 25]) {
        const word = sentence.split(' ')[currentAt] ?? ''
        const frame = liveFrameOf(
          part(currentAt),
          { columns, rows: 12 },
          { header, footer },
        )
        expect(
          frame.lines.some(line => line.includes(`[${word}]`)),
          frame.lines.join('\n'),
        ).toBe(true)
      }
    },
  )

  it.each(widths)(
    'breaks a paragraph between words at %i columns, never inside one',
    columns => {
      const frame = liveFrameOf(part(12), { columns, rows: 200 }, { header })
      const spoken = frame.lines
        .slice(2)
        .map(line => line.slice(8).trim())
        .join(' ')
      expect(spoken.replace(/[[\]]/g, '')).toBe(
        Array.from({ length: 5 }, () => sentence).join(' '),
      )
    },
  )

  it('trims the paragraphs before and after to what fits, the one being read first', () => {
    const frame = liveFrameOf(
      part(12),
      { columns: 60, rows: 9 },
      { header, footer },
    )
    const body = frame.lines.slice(0, -footer.length).join('\n')
    expect(frame.lines.slice(0, 2)).toEqual([
      'The Lantern Keeper · The Tide',
      '0:36 of 1:20:00 · playing',
    ])
    expect(body).toContain('›0:40')
    expect(body).not.toContain(' 0:00 ')
    expect(body).not.toContain('1:20')
  })

  it('ends with what can be run now, each line whole or cut to the width, resting', () => {
    const frame = liveFrameOf(
      part(12),
      { columns: 40, rows: 14 },
      { header, footer },
    )
    expect(frame.lines.slice(-3)).toEqual(footer.map(line => line.slice(0, 40)))
    expect(frame.inks.at(-1)).toEqual([
      { col: 0, width: 40, role: 'QuietText' },
    ])
  })

  it('leaves the footer out when there is no room for it under the words', () => {
    const frame = liveFrameOf(
      part(12),
      { columns: 60, rows: 4 },
      { header, footer },
    )
    expect(frame.lines.length).toBeLessThanOrEqual(4)
    expect(frame.lines.join('\n')).not.toContain('books pause')
    expect(frame.lines.some(line => line.includes('[while]'))).toBe(true)
  })

  it('says the role of each part of each line, so a terminal inks it from the theme', () => {
    const frame = liveFrameOf(part(12), { columns: 60, rows: 14 })
    const row = frame.lines.findIndex(line => line.includes('[while]'))
    const line = frame.lines[row] ?? ''
    expect(
      (frame.inks[row] ?? []).some(
        run =>
          run.role === 'ReadingCurrentWord' &&
          line.slice(run.col, run.col + run.width) === '[while]',
      ),
    ).toBe(true)
  })
})
