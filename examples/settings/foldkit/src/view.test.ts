import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

describe('Settings Foldkit host', () => {
  it('paints settingsScreen and does not invent GitHub chrome', () => {
    const sources = [
      sourceOf('./view.ts'),
      sourceOf('./entry.ts'),
      sourceOf('./mobile.ts'),
    ]
    for (const source of sources) {
      expect(source).not.toMatch(/github\.com/i)
      expect(source).not.toContain('HostHeader')
      expect(source).not.toContain('formatHostChrome')
    }
    expect(sourceOf('./view.ts')).toContain('paintHtml(settingsScreen(model)')
    expect(sourceOf('./view.ts')).not.toContain('settings.knophy.com')
  })

  it('uses a live HTTP origin, not a product Layer.succeed', () => {
    expect(sourceOf('./entry.ts')).toContain('SettingsOriginHttpLive')
    expect(sourceOf('./entry.ts')).not.toContain('SettingsOriginProduct')
    expect(sourceOf('./mobileEntry.ts')).toContain('SettingsOriginHttpLive')
    expect(sourceOf('./mobileEntry.ts')).not.toContain('SettingsOriginProduct')
  })
})
