import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  describeCountersHostError,
  paintCountersHostFailure,
} from './instantHost'

describe('Multiple Counters Foldkit Instant host chrome', () => {
  it('paints Instant and attach failures on the page', () => {
    const container = document.createElement('div')
    paintCountersHostFailure(
      container,
      new Error('Instant has no Multiple Counters demo session.'),
    )
    expect(container.textContent).toBe(
      'Instant has no Multiple Counters demo session.',
    )
    expect(describeCountersHostError('nope')).toBe(
      'Instant could not open the Multiple Counters tape.',
    )
  })

  it('does not start Instant with a fire-and-forget Effect', () => {
    const source = readFileSync('src/instantHost.ts', 'utf8')
    expect(source).not.toContain('void Effect.runPromise')
    expect(source).toContain('paintCountersHostFailure')
  })
})
