import { describe, expect, it } from 'vitest'

import { menuStylesheet } from '../interaction/menuStyles.js'
import { screenStylesheet } from '../interaction/screenStyles.js'
import { defaultTheme, themeStylesheet } from './theme.js'

const rawColor =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![-\w])(?:white|black|red|blue|green|gray|grey|orange)(?![-\w])/

// NOTE: A mask is an alpha channel, not a color a person sees: its
// gradient runs from transparent to opaque, and opaque has to be written
// as some color.
const isMask = (line: string): boolean => line.includes('mask-image')

const rawColorLinesOf = (sheet: string): ReadonlyArray<string> =>
  sheet
    .replace(themeStylesheet(defaultTheme), '')
    .split('\n')
    .filter(line => !isMask(line) && rawColor.test(line))

describe('the shared look', () => {
  it('names roles and never a color of its own, in the screen stylesheet', () => {
    expect(rawColorLinesOf(screenStylesheet)).toEqual([])
  })

  it('names roles and never a color of its own, in the menu stylesheet', () => {
    expect(rawColorLinesOf(menuStylesheet)).toEqual([])
  })

  it('never asks the system which mode it is in: the Program tells the painter', () => {
    expect(screenStylesheet).not.toContain('prefers-color-scheme')
    expect(menuStylesheet).not.toContain('prefers-color-scheme')
  })

  it('declares the theme once, at the top of the screen stylesheet', () => {
    expect(screenStylesheet).toContain(themeStylesheet(defaultTheme))
  })
})
