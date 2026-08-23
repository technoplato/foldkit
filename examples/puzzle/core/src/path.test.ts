import { describe, expect, it } from 'vitest'

import { Path, pathRouter } from './path.js'

describe('Puzzle Path', () => {
  it('prints /puzzle from the Path printer', () => {
    expect(pathRouter()).toBe('/puzzle')
    expect(pathRouter(Path())).toBe('/puzzle')
  })
})
