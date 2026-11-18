import { describe, expect, it } from 'vitest'

import { defaultTheme } from '../theme/theme.js'
import { hintStylesheet } from './hintStyles.js'
import { menuStylesheet } from './menuStyles.js'

const rawColor =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![-\w])(?:white|black|red|blue|green|gray|grey|orange)(?![-\w])/

const withoutFallbacks = (sheet: string): string =>
  sheet.replace(/var\((--fk-[a-z-]+), [^)]+\)/g, 'var($1)')

const ruleOf = (sheet: string, selector: string): string => {
  const start = sheet.indexOf(selector)
  return start === -1 ? '' : sheet.slice(start, sheet.indexOf('}', start))
}

describe('the look of hints and echoes', () => {
  it('names roles of the theme and never a color of its own', () => {
    expect(
      withoutFallbacks(hintStylesheet)
        .split('\n')
        .filter(line => rawColor.test(line)),
    ).toEqual([])
    expect(hintStylesheet).toContain('var(--fk-text, ')
    expect(hintStylesheet).toContain('var(--fk-page-ground, ')
  })

  it("falls back to the default theme's own color where no theme is declared", () => {
    expect(hintStylesheet).toContain(
      `var(--fk-text, ${defaultTheme.Text.light})`,
    )
  })

  it('never asks the system which mode it is in', () => {
    expect(hintStylesheet).not.toContain('prefers-color-scheme')
  })
})

describe('the look of a menu row number', () => {
  it('is a key drawn from roles, like the other keys', () => {
    const rule = ruleOf(menuStylesheet, ':where(.fk-action-menu-pick)')
    expect(rule).toContain('border')
    expect(rule.split('\n').filter(line => rawColor.test(line))).toEqual([])
  })
})
