import { describe, expect, it } from 'vitest'

import { Path, pathRouter } from './path.js'

describe('Counter Path', () => {
  it('prints /counter from the Path printer', () => {
    expect(pathRouter()).toBe('/counter')
    expect(pathRouter(Path())).toBe('/counter')
  })
})
