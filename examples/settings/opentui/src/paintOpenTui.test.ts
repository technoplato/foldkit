import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

describe('paintOpenTui', () => {
  it('paints a UiNode tree and does not export Frame chrome', () => {
    const source = sourceOf('./paintOpenTui.ts')

    expect(source).toContain('export const paintOpenTui')
    expect(source).toContain('node: UiNode')
    expect(source).not.toContain('paintOpenTuiFrame')
    expect(source).not.toContain('PaintOpenTuiMenu')
    expect(source).not.toMatch(/github\.com/i)
    expect(source).not.toContain('HostHeader')
    expect(source).not.toContain('formatHostChrome')
    expect(source).not.toContain('settings.knophy.com')
  })

  it('hosts paint settingsScreen through paintOpenTui', () => {
    const source = sourceOf('./client.ts')

    expect(source).toContain('paintOpenTui(')
    expect(source).toContain('settingsScreen(')
    expect(source).toContain('[q] quit')
    expect(source).not.toContain('paintOpenTuiFrame')
    expect(source).not.toMatch(/github\.com/i)
    expect(source).not.toContain('HostHeader')
    expect(source).not.toContain('formatHostChrome')
  })
})
