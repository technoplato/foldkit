import { describe, expect, it } from 'vitest'

import { Transcript } from '../renderers/elements.js'
import { layoutTree } from '../renderers/layout.js'
import type { LayoutBox } from '../renderers/types.js'
import { anchorRowsOf } from './terminalScreen.js'

// Made-up words: nothing here is from a real recording or book.
const reader = (isFollowing: boolean, focusToken?: string) =>
  Transcript({
    label: 'Words',
    action: 'SeekToWord',
    emptyText: 'No words yet.',
    isFollowing,
    ...(focusToken === undefined ? {} : { focusToken }),
    passages: [
      {
        key: 'p1',
        label: '0:00',
        isCurrent: true,
        words: [
          { token: 'w1', text: 'The', isCurrent: true },
          { token: 'w2', text: 'keeper' },
        ],
      },
      {
        key: 'p2',
        label: '0:20',
        words: [
          { token: 'w3', text: 'Far' },
          { token: 'w4', text: 'out' },
        ],
      },
      {
        key: 'p3',
        label: '0:40',
        words: [
          { token: 'w5', text: 'the', mark: 'Selected' },
          { token: 'w6', text: 'lamp' },
        ],
      },
    ],
  })

const boxes = (box: LayoutBox): ReadonlyArray<LayoutBox> => [
  box,
  ...box.children.flatMap(boxes),
]

const laid = (isFollowing: boolean, focusToken?: string): LayoutBox =>
  layoutTree(reader(isFollowing, focusToken), 0, 0, 60)

describe('a terminal goes to the match a search shows', () => {
  it('keeps the line being read in view while the words follow the voice', () => {
    const tree = laid(true, 'w5')
    expect(boxes(tree).filter(box => box.isShown === true)).toEqual([])
    expect(anchorRowsOf(tree)).toEqual([0])
  })

  it('keeps the line of the word it is told to show in view once the words do not follow the voice', () => {
    const tree = laid(false, 'w5')
    const shown = boxes(tree).filter(box => box.isShown === true)
    expect(shown.map(box => box.text?.trim())).toEqual(['0:40   «the» lamp'])
    expect(anchorRowsOf(tree)).toEqual([2])
  })

  it('stays with the line being read when it is told to show nothing', () => {
    expect(anchorRowsOf(laid(false))).toEqual([0])
  })
})
