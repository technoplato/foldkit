import { Theme } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { wordsOwnRoles, wordsStylesheet, wordsTheme } from './theme.js'

// The colours the words site named for itself before it took the
// library's roles: [role, light, dark], read from its stylesheet.
const colorsBefore: ReadonlyArray<readonly [Theme.Role, string, string]> = [
  ['PageGround', '#f2f2f7', '#000000'],
  ['Surface', '#ffffff', '#1c1c1e'],
  ['RaisedSurface', '#ffffff', '#2c2c2e'],
  ['Field', 'rgb(120 120 128 / 0.12)', 'rgb(120 120 128 / 0.24)'],
  ['FieldStrong', 'rgb(120 120 128 / 0.2)', 'rgb(120 120 128 / 0.36)'],
  ['Text', '#1d1d1f', '#f5f5f7'],
  ['QuietText', 'rgb(60 60 67 / 0.76)', 'rgb(235 235 245 / 0.72)'],
  ['FaintText', 'rgb(60 60 67 / 0.5)', 'rgb(235 235 245 / 0.46)'],
  ['Rule', 'rgb(60 60 67 / 0.14)', 'rgb(84 84 88 / 0.6)'],
  ['Danger', '#ff3b30', '#ff453a'],
  ['DangerStrong', '#d70015', '#ff8a80'],
  ['DangerFill', '#d70015', '#d70015'],
  ['DangerSoft', 'rgb(255 59 48 / 0.12)', 'rgb(255 69 58 / 0.2)'],
  ['Accent', '#0058b0', '#4da3ff'],
  ['Link', '#0058b0', '#4da3ff'],
  ['AccentSoft', 'rgb(0 88 176 / 0.1)', 'rgb(77 163 255 / 0.18)'],
  ['Positive', '#1f7a36', '#30d158'],
  ['PositiveSoft', 'rgb(52 199 89 / 0.16)', 'rgb(48 209 88 / 0.18)'],
  ['Warning', '#b83200', '#ff9f0a'],
  ['WarningSoft', 'rgb(255 149 0 / 0.16)', 'rgb(255 159 10 / 0.18)'],
  [
    'ReadingCurrentWordGround',
    'rgb(255 204 0 / 0.42)',
    'rgb(255 214 10 / 0.32)',
  ],
  ['Focus', 'rgb(255 149 0 / 0.55)', 'rgb(255 159 10 / 0.6)'],
  ['Selected', '#ffffff', '#636366'],
  ['Veil', 'rgb(255 255 255 / 0.9)', 'rgb(44 44 46 / 0.88)'],
  ['BarGround', 'rgb(242 242 247 / 0.92)', 'rgb(0 0 0 / 0.88)'],
  ['Shadow', 'rgb(0 0 0 / 0.14)', 'rgb(0 0 0 / 0.5)'],
  ['ButtonLabel', '#ffffff', '#ffffff'],
]

describe('the words theme', () => {
  it('keeps every colour the site had, light and dark, in the library’s roles', () => {
    colorsBefore.forEach(([role, light, dark]) => {
      expect([role, wordsTheme[role]]).toEqual([role, { light, dark }])
    })
  })

  it('names the recorder’s badges and a device’s tile as roles of its own', () => {
    expect(wordsOwnRoles).toEqual({
      BadgeRecording: { light: '#b50012', dark: '#ffa198' },
      BadgePaused: { light: '#a32c00', dark: '#ffb340' },
      BadgePlaying: { light: '#0058b0', dark: '#8cc4ff' },
      DeviceTile: { light: '#1c1c1e', dark: '#48484a' },
    })
  })

  it('is one stylesheet: every role light by default and dark where the Program says, with no question to the system', () => {
    expect(wordsStylesheet).toContain('--fk-page-ground: #f2f2f7;')
    expect(wordsStylesheet).toContain('--fk-page-ground: #000000;')
    expect(wordsStylesheet).toContain('--fk-own-badge-recording: #ffa198;')
    expect(wordsStylesheet).toContain('[data-fk-mode="Dark"]')
    expect(wordsStylesheet).not.toContain('prefers-color-scheme')
  })
})
