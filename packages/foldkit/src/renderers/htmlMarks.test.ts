import { describe, expect, it } from 'vitest'

import { List, Transcript } from './elements.js'
import { paintHtml } from './html.js'

const painted = (node: Parameters<typeof paintHtml>[0]): string =>
  JSON.stringify(paintHtml(node, tag => tag))

describe('what a search found, in the Foldkit HTML painter', () => {
  it('marks a found word and the match a person is on, as the React painter does', () => {
    const html = painted(
      Transcript({
        label: 'Words',
        action: 'SeekToWord',
        emptyText: 'No words yet.',
        passages: [
          {
            key: 'p1',
            label: '0:08',
            words: [
              { token: 'w1', text: 'the' },
              { token: 'w2', text: 'lamp', mark: 'Found' },
              { token: 'w3', text: 'lamp,', mark: 'Selected' },
            ],
          },
        ],
      }),
    )
    expect(html).toContain('"data-mark":"Found"')
    expect(html).toContain('"data-mark":"Selected"')
    expect(html.match(/data-mark/g)?.length).toBe(2)
  })

  it('names each word by its token, so a page can find the word a match is on', () => {
    const html = painted(
      Transcript({
        label: 'Words',
        action: 'SeekToWord',
        emptyText: 'No words yet.',
        passages: [
          { key: 'p1', label: '0:08', words: [{ token: 'w7', text: 'lamp' }] },
        ],
      }),
    )
    expect(html).toContain('"data-token":"w7"')
  })

  it('sets the found part of a row’s title apart', () => {
    const html = painted(
      List({
        label: 'Matches',
        items: [
          {
            key: 'm1',
            title: '... lit the lamp before the light',
            titleMark: { start: 12, end: 16 },
          },
        ],
      }),
    )
    expect(html).toContain('fk-item-mark')
    expect(html).toContain('"lamp"')
    expect(html).toContain('"... lit the "')
  })
})
