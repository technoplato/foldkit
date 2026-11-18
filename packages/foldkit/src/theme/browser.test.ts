import { describe, expect, it } from 'vitest'

import { firstPaintScript, modeStorageKey, paintModeOnPage } from './browser.js'

const fakePage = () => {
  const attributes = new Map<string, string>()
  const stored = new Map<string, string>()
  return {
    attributes,
    stored,
    page: {
      root: {
        setAttribute: (name: string, value: string) => {
          attributes.set(name, value)
        },
      },
      storage: {
        setItem: (key: string, value: string) => {
          stored.set(key, value)
        },
      },
    },
  }
}

describe('the mode on a page', () => {
  it('is set on the page from the mode the Program resolved, and mirrored for the next first paint', () => {
    const { attributes, stored, page } = fakePage()
    paintModeOnPage('Dark', page)
    expect(attributes.get('data-fk-mode')).toBe('Dark')
    expect(stored.get(modeStorageKey)).toBe('Dark')
    paintModeOnPage('Light', page)
    expect(attributes.get('data-fk-mode')).toBe('Light')
    expect(stored.get(modeStorageKey)).toBe('Light')
  })

  it('still sets the page when the mirror cannot be written', () => {
    const { attributes, page } = fakePage()
    paintModeOnPage('Dark', {
      root: page.root,
      storage: {
        setItem: () => {
          throw new Error('storage is full')
        },
      },
    })
    expect(attributes.get('data-fk-mode')).toBe('Dark')
  })

  it('has a first-paint script that only reads the mirror the Program wrote', () => {
    const script = firstPaintScript()
    expect(script).toContain(`getItem(${JSON.stringify(modeStorageKey)})`)
    expect(script).toContain('data-fk-mode')
    expect(script).not.toContain('setItem')
    expect(script).not.toContain('prefers-color-scheme')
  })
})
