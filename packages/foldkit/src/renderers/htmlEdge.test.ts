import { describe, expect, it } from 'vitest'

import { Transcript } from './elements.js'
import { paintHtml } from './html.js'
import { markSpokenWord, transcriptClockMountName } from './htmlEdge.js'

const painted = (node: Parameters<typeof paintHtml>[0]): string =>
  JSON.stringify(paintHtml(node, tag => tag))

// Made-up words: nothing here is from a real recording or book.
const transcript = (rate: number) =>
  Transcript({
    label: 'Words',
    action: 'SeekToWord',
    emptyText: 'No words yet.',
    clock: { placeMs: 1_000, atMs: 50_000, rate },
    passages: [
      {
        key: 'p1',
        label: '0:00',
        isCurrent: true,
        words: [
          { token: 'w1', text: 'The', startMs: 400 },
          { token: 'w2', text: 'keeper', startMs: 900, isCurrent: true },
          { token: 'w3', text: 'lit', startMs: 1_400 },
        ],
      },
      {
        key: 'p2',
        label: '0:02',
        words: [
          { token: 'w4', text: 'the', startMs: 2_000 },
          { token: 'w5', text: 'lamp.', startMs: 2_500 },
        ],
      },
    ],
  })

/** The page a painter would make of that Transcript, built by hand. */
const page = (rate: number): HTMLElement => {
  const root = document.createElement('section')
  root.className = 'fk-transcript'
  root.setAttribute('data-clock-place-ms', '1000')
  root.setAttribute('data-clock-at-ms', '50000')
  root.setAttribute('data-clock-rate', rate.toString())
  const passages: ReadonlyArray<ReadonlyArray<readonly [string, number]>> = [
    [
      ['w1', 400],
      ['w2', 900],
      ['w3', 1_400],
    ],
    [
      ['w4', 2_000],
      ['w5', 2_500],
    ],
  ]
  passages.forEach((words, at) => {
    const passage = document.createElement('article')
    passage.className = 'fk-passage'
    if (at === 0) {
      passage.setAttribute('data-current', 'true')
    }
    words.forEach(([token, startMs]) => {
      const word = document.createElement('span')
      word.className = 'fk-word'
      word.setAttribute('data-token', token)
      word.setAttribute('data-start-ms', startMs.toString())
      if (token === 'w2') {
        word.setAttribute('data-current', 'true')
      }
      passage.append(word)
    })
    root.append(passage)
  })
  return root
}

const currentTokens = (root: Element): ReadonlyArray<string> =>
  [...root.querySelectorAll('.fk-word[data-current]')].map(
    word => word.getAttribute('data-token') ?? '',
  )

const currentPassages = (root: Element): number =>
  [...root.querySelectorAll('.fk-passage')].findIndex(passage =>
    passage.hasAttribute('data-current'),
  )

describe('the Foldkit HTML painter tells its edge the clock', () => {
  it('puts the clock on the Transcript and each word’s start on the word', () => {
    const html = painted(transcript(1))
    expect(html).toContain('"data-clock-place-ms":"1000"')
    expect(html).toContain('"data-clock-at-ms":"50000"')
    expect(html).toContain('"data-clock-rate":"1"')
    expect(html).toContain('"data-start-ms":"1400"')
    expect(html).toContain(transcriptClockMountName)
  })

  it('paints no clock for a Transcript that has none', () => {
    const html = JSON.stringify(
      paintHtml(
        Transcript({
          label: 'Words',
          action: 'SeekToWord',
          emptyText: 'No words yet.',
          passages: [
            { key: 'p1', label: '0:00', words: [{ token: 'w1', text: 'The' }] },
          ],
        }),
        tag => tag,
      ),
    )
    expect(html).not.toContain('data-clock')
    expect(html).not.toContain(transcriptClockMountName)
  })
})

describe('the word being spoken, moved on at the edge', () => {
  it('marks the word the clock has reached and its passage, and no other', () => {
    const root = page(1)
    markSpokenWord(root, 50_000)
    expect(currentTokens(root)).toEqual(['w2'])
    markSpokenWord(root, 50_450)
    expect(currentTokens(root)).toEqual(['w3'])
    expect(currentPassages(root)).toBe(0)
    markSpokenWord(root, 51_100)
    expect(currentTokens(root)).toEqual(['w4'])
    expect(currentPassages(root)).toBe(1)
  })

  it('stays on the reported word while paused, and never reads more than a second and a half on', () => {
    const paused = page(0)
    markSpokenWord(paused, 53_000)
    expect(currentTokens(paused)).toEqual(['w2'])
    const stalled = page(1)
    markSpokenWord(stalled, 90_000)
    expect(currentTokens(stalled)).toEqual(['w5'])
  })

  it('leaves a Transcript without a clock as the view painted it', () => {
    const root = page(1)
    root.removeAttribute('data-clock-rate')
    root.removeAttribute('data-clock-place-ms')
    root.removeAttribute('data-clock-at-ms')
    markSpokenWord(root, 51_100)
    expect(currentTokens(root)).toEqual(['w2'])
  })
})
