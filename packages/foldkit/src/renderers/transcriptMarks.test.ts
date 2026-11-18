import { describe, expect, it } from 'vitest'

import { Transcript } from './elements.js'
import { renderScreen } from './render.js'
import { marksInPassage } from './transcriptMarks.js'
import type { TranscriptMark, TranscriptPassage } from './types.js'

const passage: TranscriptPassage = {
  key: 'p1',
  label: '20:30',
  words: [
    { token: 'w0', text: 'He', startMs: 1_230_000 },
    { token: 'w1', text: 'trimmed', startMs: 1_230_400 },
    { token: 'w2', text: 'the', startMs: 1_230_800 },
    { token: 'w3', text: 'wick', startMs: 1_231_200 },
  ],
}

const onWick: TranscriptMark = {
  startMs: 1_231_200,
  label: 'Bookmark at 20:31',
  note: 'why the lamp',
  action: 'OpenBookmark:b-wick',
}

const onHe: TranscriptMark = { startMs: 1_230_000, label: 'Bookmark at 20:30' }

const elsewhere: TranscriptMark = { startMs: 99_000, label: 'Bookmark at 1:39' }

describe('marksInPassage', () => {
  it('pairs each mark with the word that starts on its millisecond, in the words’ order', () => {
    expect(marksInPassage(passage, [onWick, elsewhere, onHe])).toEqual([
      { token: 'w0', mark: onHe },
      { token: 'w3', mark: onWick },
    ])
  })

  it('has none for a passage no mark falls in, or whose words carry no times', () => {
    expect(marksInPassage(passage, [elsewhere])).toEqual([])
    expect(
      marksInPassage(
        { key: 'p2', label: '0:00', words: [{ token: 'a', text: 'A' }] },
        [onHe],
      ),
    ).toEqual([])
  })
})

describe('a Transcript with marks in a terminal', () => {
  it('stars a marked word and prints its note under its paragraph', () => {
    const screen = renderScreen(
      Transcript({
        label: 'Transcript',
        action: 'SeekToWord',
        emptyText: 'No words yet',
        passages: [passage],
        marks: [onWick, onHe],
      }),
      60,
    )
    expect(screen).toContain('*He trimmed the *wick')
    expect(screen).toContain('* why the lamp')
  })

  it('prints a Transcript without marks as before', () => {
    const screen = renderScreen(
      Transcript({
        label: 'Transcript',
        action: 'SeekToWord',
        emptyText: 'No words yet',
        passages: [passage],
      }),
      60,
    )
    expect(screen).toContain('He trimmed the wick')
    expect(screen).not.toContain('*')
  })
})
