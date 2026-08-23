import { readFileSync } from 'node:fs'
import {
  type Model,
  keysForToken,
  readModel,
  readingModel,
  settingsScreen,
  unreadModel,
} from 'settings-core-example'
import { describe, expect, it } from 'vitest'

import { paintTui } from './paintTui.js'

const stripAnsi = (painted: string): string =>
  painted.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

const paint = (model: Model): string =>
  stripAnsi(paintTui(settingsScreen(model), { keysForToken }))

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

describe('paintTui', () => {
  it('paints Buttons with key hints from the Action keys metadata', () => {
    const painted = paint(unreadModel)

    expect(painted).toContain('Settings')
    expect(painted).toContain('Empty')
    expect(painted).toContain('[r] refresh')
  })

  it('hides refresh while Reading', () => {
    const painted = paint(readingModel)

    expect(painted).toContain('Applying')
    expect(painted).not.toContain('refresh')
  })

  it('paints sample Read quotas', () => {
    const painted = paint(readModel)

    expect(painted).toContain('ingest.knophy.com')
    expect(painted).toContain('Public')
    expect(painted).toContain('[r] refresh')
  })

  it('does not invent GitHub chrome or host URL lists', () => {
    const sources = [sourceOf('./paintTui.ts'), sourceOf('./host.ts')]
    for (const source of sources) {
      expect(source).not.toMatch(/github\.com/i)
      expect(source).not.toContain('HostHeader')
      expect(source).not.toContain('formatHostChrome')
    }
  })
})
