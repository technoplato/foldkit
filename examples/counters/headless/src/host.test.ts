import { Array, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { executeHeadless } from './host.js'

describe('Multiple Counters headless Processor', () => {
  it('prints the initial list without a Message', async () => {
    const snapshot = await Effect.runPromise(executeHeadless([]))
    expect(snapshot.destination).toBe('CounterListDestination')
    expect(Array.map(snapshot.counters, counter => counter.id)).toStrictEqual([
      'counter-1',
      'counter-2',
    ])
  })

  it('increments one identified Counter through the Program', async () => {
    const snapshot = await Effect.runPromise(
      executeHeadless(['increment', 'counter-1']),
    )
    const maybeFirst = Array.findFirst(
      snapshot.counters,
      counter => counter.id === 'counter-1',
    )
    expect(Option.isSome(maybeFirst)).toBe(true)
    if (Option.isSome(maybeFirst)) {
      expect(maybeFirst.value.count).toBe(1)
    }
  })
})
