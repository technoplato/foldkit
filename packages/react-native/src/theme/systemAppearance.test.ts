import { describe, expect, it, vi } from 'vitest'

import { contrastOfSetting, modeOfScheme } from './systemAppearance.js'

vi.mock('react-native', () => ({
  AccessibilityInfo: {},
  Appearance: {},
  Platform: { OS: 'ios' },
}))

describe('what a phone reports of its appearance', () => {
  it('reads a color scheme as a mode, and none as light', () => {
    expect(modeOfScheme('dark')).toBe('Dark')
    expect(modeOfScheme('light')).toBe('Light')
    expect(modeOfScheme(null)).toBe('Light')
    expect(modeOfScheme(undefined)).toBe('Light')
  })

  it('reads Increase Contrast as more contrast', () => {
    expect(contrastOfSetting(true)).toBe('More')
    expect(contrastOfSetting(false)).toBe('Standard')
  })
})
