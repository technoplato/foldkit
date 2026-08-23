import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  countFromAndroidUiDump,
  countFromIosDescribe,
  puzzleUriFromDump,
  tapeLengthFromUri,
} from './liveStress.js'

const fortySevenYes = `/puzzle#${'next=y/'.repeat(47)}next`

describe('live Instant surface dumps', () => {
  it('reads tape length from a painted Puzzle URI', () => {
    expect(tapeLengthFromUri('/puzzle#next')).toBe(0)
    expect(tapeLengthFromUri('/puzzle#next=y/next')).toBe(1)
    expect(tapeLengthFromUri('/puzzle#next=y/next=n/next')).toBe(2)
    expect(tapeLengthFromUri(fortySevenYes)).toBe(47)
  })

  it('reads the Expo Android Program screen URI', () => {
    const xml = `<node content-desc="${fortySevenYes}" text="${fortySevenYes}" /><node content-desc="y" />`
    expect(countFromAndroidUiDump(xml)).toEqual(Option.some(47))
    expect(puzzleUriFromDump(xml)).toEqual(Option.some(fortySevenYes))
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

  it('reads the Expo iOS Program screen URI', () => {
    expect(countFromIosDescribe(`label: ${fortySevenYes}`)).toEqual(
      Option.some(47),
    )
    expect(countFromIosDescribe('label: /puzzle#next=y/next')).toEqual(
      Option.some(1),
    )
  })
})
