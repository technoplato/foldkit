import { Array, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { App } from './app.js'
import { CounterId } from './counterId.js'
import { Add, Decrement, Increment, Reset } from './message.js'
import { SyncedCounters } from './synced.js'

/**
 * Golden-fold gate for `SyncedCounters.foldRevision`.
 *
 * If a change to `update` alters the folded Model for this canonical sequence
 * of Messages without bumping `SyncedCounters.foldRevision`, this test fails so
 * old shared snapshots cannot be painted against changed fold semantics.
 */
describe('Multiple Counters golden fold', () => {
  it('matches the committed golden Model for foldRevision multiple-counters-fold-v1', () => {
    expect(SyncedCounters.foldRevision).toBe('multiple-counters-fold-v1')

    const c1 = CounterId.make(1)
    const c2 = CounterId.make(2)
    const messages = [
      Add(),
      Increment({ counterId: c1 }),
      Increment({ counterId: c1 }),
      Add(),
      Increment({ counterId: c2 }),
      Decrement({ counterId: c1 }),
      Reset({ counterId: c2 }),
    ]

    const [initial] = App.init()
    const folded = Array.reduce(messages, initial, (model, message) => {
      const [next] = App.update(model, message)
      return next
    })

    const encoded = S.encodeSync(S.toCodecJson(App.Model))(folded)
    expect(JSON.stringify(encoded)).toMatchSnapshot()
  })
})
