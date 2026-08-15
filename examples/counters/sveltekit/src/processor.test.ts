import { incrementCounterMessage } from 'counters-instant-example'
import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { startCountersProcessor } from './processor.js'

describe('Multiple Counters SvelteKit processor', () => {
  it('increments one Counter through the shared Program', async () => {
    const processor = await startCountersProcessor()
    processor.send(incrementCounterMessage('counter-1'))
    await new Promise(resolve => setTimeout(resolve, 20))
    const maybeFirst = Array.findFirst(
      processor.readModel().rows,
      row => row.id === 'counter-1',
    )
    expect(Option.isSome(maybeFirst)).toBe(true)
    if (Option.isSome(maybeFirst)) {
      expect(maybeFirst.value.counter.count).toBe(1)
    }
    await processor.stop()
  })
})
