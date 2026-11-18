import { describe, expect, it } from 'vitest'

import { Transcript } from './elements.js'
import { renderScreen } from './render.js'
import { bookmarksInPassage } from './transcriptBookmarks.js'
import type { TranscriptBookmark, TranscriptPassage } from './types.js'

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

const onWick: TranscriptBookmark = {
  startMs: 1_231_200,
  label: 'Bookmark at 20:31',
  note: 'why the lamp',
  action: 'OpenBookmark:b-wick',
}

const onHe: TranscriptBookmark = {
  startMs: 1_230_000,
  label: 'Bookmark at 20:30',
}

const elsewhere: TranscriptBookmark = {
  startMs: 99_000,
  label: 'Bookmark at 1:39',
}

describe('bookmarksInPassage', () => {
  it('pairs each bookmark with the word that starts on its millisecond, in the words’ order', () => {
    expect(bookmarksInPassage(passage, [onWick, elsewhere, onHe])).toEqual([
      { token: 'w0', bookmark: onHe },
      { token: 'w3', bookmark: onWick },
    ])
  })

  it('has none for a passage no bookmark falls in, or whose words carry no times', () => {
    expect(bookmarksInPassage(passage, [elsewhere])).toEqual([])
    expect(
      bookmarksInPassage(
        { key: 'p2', label: '0:00', words: [{ token: 'a', text: 'A' }] },
        [onHe],
      ),
    ).toEqual([])
  })
})

describe('a Transcript with bookmarks in a terminal', () => {
  it('stars a bookmarked word and prints its note under its paragraph', () => {
    const screen = renderScreen(
      Transcript({
        label: 'Transcript',
        action: 'SeekToWord',
        emptyText: 'No words yet',
        passages: [passage],
        bookmarks: [onWick, onHe],
      }),
      60,
    )
    expect(screen).toContain('*He trimmed the *wick')
    expect(screen).toContain('* why the lamp')
  })

  it('prints a Transcript without bookmarks as before', () => {
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
