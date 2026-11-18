import { describe, expect, it } from 'vitest'

import { screenStylesheet } from '../interaction/screenStyles.js'
import { Text, Transcript } from './elements.js'
import { paintHtml } from './html.js'
import { layoutTree } from './layout.js'
import { paintAscii } from './paint.js'
import { transcriptEntriesOf } from './transcriptEntries.js'

// Made-up words and speakers: nothing here is from a real recording.
const timeline = Transcript({
  label: 'Transcript',
  action: 'ClickedWord',
  emptyText: 'This recording has no transcript.',
  passages: [
    {
      key: 's1',
      label: '0:00',
      speaker: 'Speaker 1',
      words: [
        { token: 'w1', text: 'The' },
        { token: 'w2', text: 'keeper' },
      ],
    },
    {
      key: 's2',
      label: '0:05',
      words: [
        { token: 'w3', text: 'trimmed' },
        { token: 'w4', text: 'the' },
        { token: 'w5', text: 'wick.' },
      ],
    },
    {
      key: 's3',
      label: '0:10',
      speaker: 'Speaker 2',
      isCurrent: true,
      words: [
        { token: 'w6', text: 'Far', isCurrent: true },
        { token: 'w7', text: 'out.' },
      ],
    },
  ],
  items: [
    {
      key: 'c1',
      label: '0:08',
      beforePassage: 's3',
      node: Text('Copied: a bell answered the lamp'),
    },
    {
      key: 'c0',
      label: '0:03',
      beforePassage: 's2',
      node: Text('Copied: dusk'),
    },
    {
      key: 'c2',
      label: '0:14',
      node: Text('Copied: the tide'),
    },
    {
      key: 'c3',
      label: '0:15',
      beforePassage: 'gone',
      node: Text('Copied: after a section that is not here'),
    },
  ],
})

describe('a Transcript’s timeline: who speaks, and what sits between the passages', () => {
  it('orders the passages and the items between them: an item before the passage it names, the rest after the last', () => {
    expect(
      transcriptEntriesOf(timeline).map(entry =>
        entry._tag === 'PassageEntry' ? entry.passage.key : entry.item.key,
      ),
    ).toEqual(['s1', 'c0', 's2', 'c1', 's3', 'c2', 'c3'])
  })

  it('is its passages alone when it has no items', () => {
    const { items: _items, ...wordsOnly } = timeline
    expect(transcriptEntriesOf(wordsOnly).map(entry => entry._tag)).toEqual([
      'PassageEntry',
      'PassageEntry',
      'PassageEntry',
    ])
  })

  it('prints a terminal a line for who speaks, once where a Program names them, and each item at its time between the passages', () => {
    expect(
      paintAscii(layoutTree(timeline, 0, 0, 60)).lines.map(line =>
        line.trimEnd(),
      ),
    ).toEqual([
      '        Speaker 1',
      ' 0:00   The keeper',
      ' 0:03   Copied: dusk',
      ' 0:05   trimmed the wick.',
      ' 0:08   Copied: a bell answered the lamp',
      '        Speaker 2',
      '›0:10   [Far] out.',
      ' 0:14   Copied: the tide',
      ' 0:15   Copied: after a section that is not here',
    ])
  })

  it('keeps the line being read marked for a terminal to keep in view, with items above it', () => {
    const laid = layoutTree(timeline, 0, 0, 60)
    expect(
      laid.children
        .filter(child => child.isCurrent === true)
        .map(child => child.y),
    ).toEqual([6])
  })

  it('draws both in the Foldkit HTML painter, in the timeline’s order, an item holding the screen part it shows', () => {
    const html = JSON.stringify(paintHtml(timeline, tag => tag))
    const places = [
      '"Speaker 1"',
      '"0:03"',
      '"Copied: dusk"',
      '"0:08"',
      '"Speaker 2"',
      '"Copied: the tide"',
    ].map(text => html.indexOf(text))
    expect(places.every(place => place >= 0)).toBe(true)
    expect([...places].sort((first, second) => first - second)).toEqual(places)
    expect(html.match(/fk-passage-speaker/g)?.length).toBe(2)
    expect(html.match(/fk-transcript-item/g)?.length).toBe(4)
    expect(html).toContain('"data-key":"c1"')
  })

  it('shows what it shows while empty, then any items', () => {
    const lines = paintAscii(
      layoutTree(
        Transcript({
          label: 'Transcript',
          action: 'ClickedWord',
          emptyText: 'This recording has no transcript.',
          passages: [],
          items: [
            {
              key: 'c1',
              label: '0:08',
              node: Text('Copied: dusk'),
            },
          ],
        }),
        0,
        0,
        60,
      ),
    ).lines.map(line => line.trimEnd())
    expect(lines).toEqual([
      'This recording has no transcript.',
      ' 0:08   Copied: dusk',
    ])
  })

  it('lays an item out with its time in the passages’ column and what it shows beside it, from the start edge', () => {
    const ruleOf = (selector: string): string => {
      const start = screenStylesheet.indexOf(`${selector} {`)
      return screenStylesheet.slice(start, screenStylesheet.indexOf('}', start))
    }
    expect(ruleOf(':where(.fk-transcript-item)')).toContain(
      'grid-template-columns: auto minmax(0, 1fr)',
    )
    expect(ruleOf(':where(.fk-transcript-item)')).toContain(
      'justify-items: start',
    )
    expect(ruleOf(':where(.fk-transcript-item .fk-column)')).toContain(
      'align-items: flex-start',
    )
    expect(ruleOf(':where(.fk-transcript-item .fk-row)')).toContain(
      'justify-content: flex-start',
    )
    expect(ruleOf(':where(.fk-passage-speaker)')).toContain('font-weight')
  })
})
