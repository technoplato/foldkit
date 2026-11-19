import { Effect, Fiber, Ref, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import { contrastOfMacSetting, contrastsRead } from './systemAppearance.js'

describe('the contrast a Mac asks for, as a terminal host reads it', () => {
  it('is More when Increase Contrast is on, and the usual one otherwise', () => {
    expect(contrastOfMacSetting('1\n')).toBe('More')
    expect(contrastOfMacSetting('0\n')).toBe('Standard')
    // A Mac that never had the setting on answers with no value at all.
    expect(contrastOfMacSetting('')).toBe('Standard')
  })
})

describe('the contrasts a terminal host reports', () => {
  it('are what it read first, then each change it reads, and nothing while it reads the same', async () => {
    const reported = await Effect.runPromise(
      Effect.gen(function* () {
        const readings = yield* Ref.make<ReadonlyArray<'Standard' | 'More'>>([
          'Standard',
          'Standard',
          'More',
          'More',
          'Standard',
        ])
        const read = Ref.modify(readings, left => [
          left[0] ?? 'Standard',
          left.slice(1),
        ])
        const fiber = yield* Effect.forkChild(
          Stream.runCollect(Stream.take(contrastsRead(read, '1 minute'), 3)),
        )
        yield* TestClock.adjust('5 minutes')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect([...reported]).toEqual(['Standard', 'More', 'Standard'])
  })
})
