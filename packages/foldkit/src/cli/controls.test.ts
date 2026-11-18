import { describe, expect, it } from 'vitest'

import { collisionsOf, pathsOf, problemsOf } from '../declaration/plain.js'
import { programControls } from './controls.js'
import { toggleFlagsOf, usageOf } from './declared.js'

describe('the controls every Program’s terminal has', () => {
  it('are sound declarations: a what and a why about the user, one subject', () => {
    expect(
      pathsOf(programControls).flatMap(({ declaration }) =>
        problemsOf(declaration),
      ),
    ).toEqual([])
    expect(collisionsOf(programControls)).toEqual([])
  })

  it('spell their usage from what they take', () => {
    expect(
      pathsOf(programControls).map(({ path, declaration }) =>
        usageOf(path, declaration),
      ),
    ).toEqual([
      'show',
      'menu open',
      'menu close',
      'menu type <text>',
      'menu next',
      'menu previous',
      'menu enter',
      'menu choose <action>',
      'key <key> [--meta] [--ctrl] [--shift]',
      'open <uri>',
      'back',
      'where',
      'watch',
      'follow [topic]',
      'tail',
      'help',
    ])
  })

  it('name the flags that are on or off, for the argv reader', () => {
    expect(toggleFlagsOf(programControls)).toEqual(['meta', 'ctrl', 'shift'])
  })
})
