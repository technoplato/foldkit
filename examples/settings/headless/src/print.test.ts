import { readFileSync } from 'node:fs'
import {
  readModel,
  readingModel,
  settingsScreen,
  unreadModel,
} from 'settings-core-example'
import { describe, expect, it } from 'vitest'

import { printSettings } from './print.js'

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

describe('printSettings', () => {
  it('paints the Program screen tree', () => {
    expect(printSettings(settingsScreen(unreadModel))).toContain('Empty')
    expect(printSettings(settingsScreen(readingModel))).toContain('Applying')
    expect(printSettings(settingsScreen(readModel))).toContain(
      'ingest.knophy.com',
    )
    expect(printSettings(settingsScreen(readModel))).toContain('Settings')
  })

  it('does not invent GitHub chrome or host URL lists', () => {
    const sources = [sourceOf('./print.ts'), sourceOf('./host.ts')]
    for (const source of sources) {
      expect(source).not.toMatch(/github\.com/i)
      expect(source).not.toContain('HostHeader')
      expect(source).not.toContain('formatHostChrome')
    }
  })
})
