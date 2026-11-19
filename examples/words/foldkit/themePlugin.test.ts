import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { wordsStylesheet } from 'words-core-example'

import { wordsThemeHead, wordsThemeTags } from './themePlugin'

const stylesheet = readFileSync(
  path.resolve(import.meta.dirname, 'src/styles.css'),
  'utf8',
)

describe('the words site takes its colours from the theme', () => {
  it('puts the theme and the first-paint script in every page’s head as it is built', () => {
    const tags = wordsThemeTags()
    expect(wordsThemeHead().name).toBe('words-theme-head')
    expect(tags).toEqual([
      expect.objectContaining({
        tag: 'style',
        children: wordsStylesheet,
        injectTo: 'head-prepend',
      }),
      expect.objectContaining({
        tag: 'script',
        children: expect.stringContaining('data-fk-mode'),
      }),
    ])
  })

  it('asks the browser for no colour scheme and no contrast, in its rules or its dark variant', () => {
    expect(stylesheet).not.toContain('prefers-color-scheme')
    expect(stylesheet).not.toContain('prefers-contrast')
    expect(stylesheet).toContain(
      "@custom-variant dark (&:where([data-fk-mode='Dark'], [data-fk-mode='Dark'] *));",
    )
  })

  it('names every colour of its own as a role of the theme', () => {
    const root = stylesheet.slice(
      stylesheet.indexOf(':root {\n  color-scheme: light;'),
      stylesheet.indexOf(":root[data-fk-mode='Dark']"),
    )
    const own = root
      .split('\n')
      .filter(line =>
        /^\s+--(?!display-scale|type-unit|card-shadow)/.test(line),
      )
    expect(own.length).toBeGreaterThan(25)
    own.forEach(line => {
      expect(line).toMatch(/var\(--fk-/)
      expect(line).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    })
  })
})
