import {
  gateScreen,
  readModel,
  readingModel,
  unreadModel,
} from 'gate-core-example'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { printGate } from './print.js'

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

describe('printGate', () => {
  it('paints the Program screen tree', () => {
    expect(printGate(gateScreen(unreadModel))).toContain('Unread')
    expect(printGate(gateScreen(readingModel))).toContain('Reading')
    expect(printGate(gateScreen(readModel))).toContain(
      'Rate remaining 40 of 60 resets 60000',
    )
    expect(printGate(gateScreen(readModel))).not.toContain('gate.grok.me')
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
