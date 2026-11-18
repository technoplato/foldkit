import { defaultTheme, withRoles } from 'foldkit/theme'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { groundStyleOf, lookOf } from './look.js'

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const sourcesIn = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) {
      return sourcesIn(join(directory, entry.name))
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      return [join(directory, entry.name)]
    } else {
      return []
    }
  })

describe('the look a painter reads', () => {
  it('takes every color from the theme, by mode', () => {
    expect(lookOf('Light').colors.Text).toBe(defaultTheme.Text.light)
    expect(lookOf('Dark').colors.Text).toBe(defaultTheme.Text.dark)
    expect(lookOf('Dark').colors.ReadingCurrentWord).toBe(
      defaultTheme.ReadingCurrentWord.dark,
    )
  })

  it('takes a stronger color under More Contrast where a role names one', () => {
    const theme = withRoles(defaultTheme, {
      QuietText: { light: '#6b7280', dark: '#9aa1aa', lightMore: '#1f2937' },
    })
    expect(lookOf('Light', 'Standard', theme).colors.QuietText).toBe('#6b7280')
    expect(lookOf('Light', 'More', theme).colors.QuietText).toBe('#1f2937')
    expect(lookOf('Dark', 'More', theme).colors.QuietText).toBe('#9aa1aa')
  })

  it('says its mode and contrast, so a host can set the status bar', () => {
    expect(lookOf('Dark', 'More').mode).toBe('Dark')
    expect(lookOf('Dark', 'More').contrast).toBe('More')
  })

  it('paints a ground as a color, a gradient, or nothing', () => {
    expect(groundStyleOf('#161a18')).toEqual({ backgroundColor: '#161a18' })
    expect(groundStyleOf('transparent')).toEqual({})
    expect(groundStyleOf('linear-gradient(#12301d, #060907 42%)')).toEqual({
      experimental_backgroundImage: 'linear-gradient(#12301d, #060907 42%)',
    })
  })
})

describe('the React Native adapter', () => {
  it('writes no color of its own: every color is a role', () => {
    for (const file of sourcesIn(sourceRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(source, file).not.toMatch(/\brgba?\(/)
    }
  })

  it('asks the system for its appearance in one host adapter only', () => {
    const askers = sourcesIn(sourceRoot).filter(file =>
      /useColorScheme|\bAppearance\.(get|add)|AccessibilityInfo\.(is|add)/.test(
        readFileSync(file, 'utf8'),
      ),
    )
    expect(askers.map(file => file.slice(sourceRoot.length + 1))).toEqual([
      'theme/systemAppearance.ts',
    ])
  })
})
