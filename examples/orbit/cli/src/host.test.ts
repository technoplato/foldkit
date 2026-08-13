import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { executeIndex } from './host.js'

describe('Orbit CLI', () => {
  it('runs the index through the Program runtime', async () => {
    const result = await Effect.runPromise(executeIndex())
    expect(result.ok).toBe(true)
    expect(result.tortoise).toBe(1000)
    expect(result.achilles).toBe(428)
  })
})
