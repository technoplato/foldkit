import { describe, expect, it } from 'vitest'

import { localTimeLabel } from './clock.js'

describe("a time on the reader's clock", () => {
  it('reads each date in the offset its own day had, across a change of the clocks', () => {
    expect(
      localTimeLabel(Date.parse('2026-10-11T14:10:00Z'), 'America/New_York'),
    ).toBe('2026-10-11 10:10')
    expect(
      localTimeLabel(Date.parse('2026-11-01T14:00:00Z'), 'America/New_York'),
    ).toBe('2026-11-01 09:00')
  })

  it('reads UTC when the zone is not one the platform knows', () => {
    expect(
      localTimeLabel(Date.parse('2026-10-11T14:10:00Z'), 'Not/A_Zone'),
    ).toBe('2026-10-11 14:10')
  })
})
