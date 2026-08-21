import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { countFromAndroidUiDump, countFromIosDescribe } from './liveStress.js'

describe('live Instant surface dumps', () => {
  it('reads the Expo Android count accessibility label', () => {
    const xml =
      '<node content-desc="count 47" text="47" /><node content-desc="+" />'
    expect(countFromAndroidUiDump(xml)).toEqual(Option.some(47))
  })

  it('refuses an Expo Android redbox dump', () => {
    expect(() =>
      countFromAndroidUiDump(
        '<node text="[runtime not ready]: Error: effect/match/Match/exhaustive: absurd" />',
      ),
    ).toThrow('redbox')
    expect(() =>
      countFromAndroidUiDump(
        '<node content-desc="Failed to get the SHA-1 for: /tmp/public.js" />',
      ),
    ).toThrow('redbox')
  })

  it('reads the Expo iOS count accessibility label', () => {
    expect(countFromIosDescribe('label: count 12')).toEqual(Option.some(12))
  })
})
