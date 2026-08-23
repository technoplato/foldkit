import { Array } from 'effect'
import { buttonsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { emptyModel } from './model.js'
import { PuzzleProgram, puzzleScreen, puzzleValid } from './program.js'

describe('PuzzleProgram', () => {
  it('owns valid and screen on Program.make', () => {
    const empty = emptyModel()
    expect(PuzzleProgram.valid).toBe(puzzleValid)
    expect(PuzzleProgram.screen).toBe(puzzleScreen)
    expect(
      Array.map(puzzleValid(empty), item => [item.token, item.valid]),
    ).toEqual([
      ['yes', true],
      ['no', true],
      ['hint', true],
      ['operator', true],
      ['replicate', true],
      ['observe', false],
      ['verify', false],
      ['dispatch', false],
      ['reset', false],
    ])
    expect(
      Array.map(buttonsOf(puzzleScreen(empty)), button => button.token),
    ).toEqual(['yes', 'no', 'hint', 'operator', 'replicate'])
  })
})
