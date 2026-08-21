import { describe, expect, test } from 'vitest'

import {
  CompleteClipPlayback,
  IdleClipPlayback,
  PlayingClipPlayback,
  clipCompleteMs,
  clipConversation,
  isClipComplete,
  playbackAtElapsed,
  revealedCountAt,
  revealedLines,
} from './clip.js'

describe('clip conversation', () => {
  test('is the $14.28 deal with TJ, not a video', () => {
    expect(clipConversation.length).toBe(8)
    expect(clipConversation[0]?.speaker).toBe('Michael')
    expect(clipConversation[5]?.text).toContain('14.28')
    expect(clipConversation[6]?.speaker).toBe('TJ')
    expect(clipConversation[6]?.text).toBe('Okay. Deal.')
    expect(clipConversation[7]?.text).toBe('Peace.')
  })

  test('reveals rows by elapsed state, never all at t=0', () => {
    expect(revealedCountAt(0)).toBe(1)
    expect(revealedCountAt(3_199)).toBe(1)
    expect(revealedCountAt(3_200)).toBe(2)
    expect(revealedCountAt(16_500)).toBe(6)
    expect(revealedCountAt(clipCompleteMs)).toBe(8)
  })

  test('Idle shows nothing; Complete shows every row', () => {
    expect(revealedLines(IdleClipPlayback.make({}))).toEqual([])
    expect(revealedLines(CompleteClipPlayback.make({}))).toHaveLength(8)
    expect(
      revealedLines(PlayingClipPlayback.make({ elapsedMs: 4_800 })).map(
        row => row.id,
      ),
    ).toEqual(['c1', 'c2', 'c3'])
  })

  test('playback completes after the last line plus hold', () => {
    expect(playbackAtElapsed(0)._tag).toBe('Playing')
    expect(playbackAtElapsed(clipCompleteMs)._tag).toBe('Complete')
    expect(isClipComplete(playbackAtElapsed(clipCompleteMs))).toBe(true)
  })
})
