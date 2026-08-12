import { MultipleCountersProgram } from 'counters-core-example'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  MultipleCountersV3ActionTokenError,
  MultipleCountersV3NavigationFollowsLeaderError,
  resolveMultipleCountersV3ActionToken,
  resolveMultipleCountersV3EnabledActionToken,
} from './actions.js'

const [model] = MultipleCountersProgram.init()

describe('Multiple Counters v3 action tokens', () => {
  it('rejects tokens that are not valid in the current Model', () => {
    const resolved = resolveMultipleCountersV3ActionToken(
      model,
      'increment:missing',
    )

    expect(Result.isFailure(resolved)).toBe(true)
    if (Result.isFailure(resolved)) {
      expect(resolved.failure).toBeInstanceOf(MultipleCountersV3ActionTokenError)
    }
  })

  it('resolves domain tokens for Observe followers and refuses navigation', () => {
    const increment = resolveMultipleCountersV3EnabledActionToken(
      model,
      'increment:counter-1',
      false,
    )
    const open = resolveMultipleCountersV3EnabledActionToken(
      model,
      'open:counter-1',
      false,
    )

    expect(Result.isSuccess(increment)).toBe(true)
    expect(Result.isFailure(open)).toBe(true)
    if (Result.isFailure(open)) {
      expect(open.failure).toBeInstanceOf(
        MultipleCountersV3NavigationFollowsLeaderError,
      )
    }
  })
})
