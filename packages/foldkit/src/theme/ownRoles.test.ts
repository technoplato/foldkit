import { describe, expect, it } from 'vitest'

import {
  Role,
  cssVariableOf,
  defaultTheme,
  ownRoleVar,
  themeStylesheet,
  withOwnRoles,
} from './theme.js'

describe('roles every Program may need', () => {
  it('has a stronger field, the strong, filled and soft forms of danger, a positive color and its soft ground, a soft warning, and a bar’s ground', () => {
    const added = [
      'FieldStrong',
      'DangerStrong',
      'DangerFill',
      'DangerSoft',
      'Positive',
      'PositiveSoft',
      'WarningSoft',
      'BarGround',
    ] as const
    added.forEach(role => {
      expect(Role.literals).toContain(role)
      expect(defaultTheme[role].light).not.toBe('')
      expect(defaultTheme[role].dark).not.toBe('')
    })
    expect(cssVariableOf('PositiveSoft')).toBe('--fk-positive-soft')
  })
})

describe('roles a domain adds beside the library’s', () => {
  // A made-up domain: a recorder with a badge while it records.
  const own = withOwnRoles({
    BadgeRecording: { light: '#b50012', dark: '#ffa198' },
    BadgePaused: { light: '#a32c00', dark: '#ffb340' },
  })

  it('declares them with the theme, light and dark, as variables of their own', () => {
    const sheet = themeStylesheet(defaultTheme, own)
    expect(sheet).toContain('--fk-own-badge-recording: #b50012;')
    expect(sheet).toContain('--fk-own-badge-recording: #ffa198;')
    expect(sheet).toContain('--fk-own-badge-paused: #ffb340;')
    expect(sheet).toContain('--fk-page-ground: #ffffff;')
    expect(ownRoleVar('BadgeRecording')).toBe('var(--fk-own-badge-recording)')
  })

  it('leaves the stylesheet as it was for a Program with none', () => {
    expect(themeStylesheet(defaultTheme)).toBe(
      themeStylesheet(defaultTheme, withOwnRoles({})),
    )
    expect(themeStylesheet(defaultTheme)).not.toContain('--fk-own-')
  })

  it('refuses a name the library already uses, so a domain cannot shadow a role', () => {
    expect(() =>
      withOwnRoles({ Accent: { light: '#000000', dark: '#ffffff' } }),
    ).toThrow(/Accent/)
  })
})
