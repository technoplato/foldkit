import { Array, Record } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  Role,
  cssVariableOf,
  cssVariablesOf,
  defaultTheme,
  modeOf,
  roleColorsOf,
  roleVar,
  themeStylesheet,
  withRoles,
} from './theme.js'

const colorPattern =
  /^(#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, [\d.]+\)|linear-gradient\(.+\)|transparent)$/

describe('a theme', () => {
  it('gives every role a light and a dark value', () => {
    for (const role of Role.literals) {
      expect(defaultTheme[role].light).toMatch(colorPattern)
      expect(defaultTheme[role].dark).toMatch(colorPattern)
    }
    expect(Record.keys(defaultTheme).length).toBe(Role.literals.length)
  })

  it('names the roles a page and words read along with are painted from', () => {
    expect(Role.literals).toEqual(
      expect.arrayContaining([
        'PageGround',
        'Surface',
        'RaisedSurface',
        'Text',
        'QuietText',
        'Accent',
        'Rule',
        'Focus',
        'Danger',
        'ReadingGround',
        'ReadingSpoken',
        'ReadingToCome',
        'ReadingCurrentWord',
      ]),
    )
  })

  it('is composed: a program overrides the roles it wants and keeps the rest', () => {
    const forest = withRoles(defaultTheme, {
      Accent: { light: '#166534', dark: '#86efac' },
    })
    expect(forest.Accent).toEqual({ light: '#166534', dark: '#86efac' })
    expect(forest.Text).toEqual(defaultTheme.Text)
    expect(defaultTheme.Accent.light).not.toBe('#166534')
  })
})

describe('the mode an appearance resolves to', () => {
  it('is the chosen mode, or the one the system is in when the choice is to follow it', () => {
    expect(modeOf('Light', 'Dark')).toBe('Light')
    expect(modeOf('Dark', 'Light')).toBe('Dark')
    expect(modeOf('System', 'Dark')).toBe('Dark')
    expect(modeOf('System', 'Light')).toBe('Light')
  })
})

describe('a theme for a painter', () => {
  it('reads the color of each role for one mode', () => {
    expect(roleColorsOf(defaultTheme, 'Light').PageGround).toBe(
      defaultTheme.PageGround.light,
    )
    expect(roleColorsOf(defaultTheme, 'Dark').PageGround).toBe(
      defaultTheme.PageGround.dark,
    )
  })

  it('names one CSS variable per role, and the reference a rule uses', () => {
    expect(cssVariableOf('PageGround')).toBe('--fk-page-ground')
    expect(cssVariableOf('ReadingCurrentWord')).toBe(
      '--fk-reading-current-word',
    )
    expect(roleVar('QuietText')).toBe('var(--fk-quiet-text)')
  })

  it('declares every role for a mode', () => {
    const declared = cssVariablesOf(defaultTheme, 'Dark')
    expect(Array.length(declared)).toBe(Role.literals.length)
    expect(declared).toContain(
      `--fk-page-ground: ${defaultTheme.PageGround.dark};`,
    )
  })

  it('writes the stylesheet a page needs: light by default, dark where the Program says so, and nothing that asks the system', () => {
    const sheet = themeStylesheet(defaultTheme)
    expect(sheet).toContain(':where(:root) {')
    expect(sheet).toContain(':where([data-fk-mode="Dark"]) {')
    expect(sheet).not.toContain('prefers-color-scheme')
  })
})

describe('the roles of a person’s own mark', () => {
  it('has a color for a mark and a soft ground for it, in both modes, apart from the accent and a selection', () => {
    expect(defaultTheme.Mark.light).not.toBe(defaultTheme.Accent.light)
    expect(defaultTheme.Mark.light).not.toBe(defaultTheme.SelectedMark.light)
    expect(defaultTheme.Mark.dark).not.toBe(defaultTheme.Mark.light)
    expect(defaultTheme.MarkSoft.dark).not.toBe(defaultTheme.MarkSoft.light)
    expect(cssVariableOf('MarkSoft')).toBe('--fk-mark-soft')
  })
})
