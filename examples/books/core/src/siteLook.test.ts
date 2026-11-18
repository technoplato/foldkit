import { firstPaintScript } from 'foldkit/theme'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const siteFile = (name: string): string =>
  readFileSync(join(process.cwd(), '..', 'react', name), 'utf8')

const rawColor =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:bg|text|border|ring|from|to|via)-(?:white|black|gray|slate|zinc|neutral|stone|red|orange|amber|blue|green)(?:-\d+)?\b/

describe('the Books site', () => {
  it('names the roles of the theme and holds no color of its own', () => {
    for (const name of ['src/App.tsx', 'src/styles.css']) {
      const lines = siteFile(name)
        .split('\n')
        .filter(line => rawColor.test(line))
      expect(lines, name).toEqual([])
    }
  })

  it('opens in the mode it was last in: its page runs the first-paint script of Foldkit, and reads nothing else', () => {
    const page = siteFile('index.html')
    expect(page).toContain(firstPaintScript())
    expect(page).not.toContain('prefers-color-scheme')
  })

  it('is told its mode by the host from the Model, never by a component', () => {
    expect(siteFile('src/main.tsx')).toContain('paintModeOnPage(')
    expect(siteFile('src/App.tsx')).not.toMatch(
      /prefers-color-scheme|matchMedia|localStorage|data-fk-mode/,
    )
  })
})
