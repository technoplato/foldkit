import {
  type Model,
  gateScreen,
  keysForToken,
  readModel,
  readingModel,
  unreadModel,
} from 'gate-core-example'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { paintTui } from './paintTui.js'

const stripAnsi = (painted: string): string =>
  painted.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

const paint = (model: Model): string =>
  stripAnsi(paintTui(gateScreen(model), { keysForToken }))

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

describe('paintTui', () => {
  it('paints Buttons with key hints from the Action keys metadata', () => {
    const painted = paint(unreadModel)

    expect(painted).toContain('Gate')
    expect(painted).toContain('Unread')
    expect(painted).toContain('[r] refresh')
  })

  it('hides refresh while Reading', () => {
    const painted = paint(readingModel)

    expect(painted).toContain('Reading')
    expect(painted).not.toContain('refresh')
  })

  it('paints sample Read quotas', () => {
    const painted = paint(readModel)

    expect(painted).toContain('Rate remaining 40 of 60 resets 60000')
    expect(painted).toContain('Messages remaining 10 of 20 resets 86400000')
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
