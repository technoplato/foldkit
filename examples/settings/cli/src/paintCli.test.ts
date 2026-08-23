import { readFileSync } from 'node:fs'
import {
  type Model,
  readModel,
  readingModel,
  settingsScreen,
  unreadModel,
  whatForToken,
} from 'settings-core-example'
import { describe, expect, it } from 'vitest'

import { paintCli } from './paintCli.js'

const paint = (model: Model) =>
  paintCli(settingsScreen(model), {
    binaryName: 'foldkit-settings',
    whatFor: whatForToken,
  })

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

describe('paintCli', () => {
  it('paints the Settings tree as text with Button tokens', () => {
    const painting = paint(unreadModel)

    expect(painting.screen).toContain('Settings')
    expect(painting.screen).toContain('Empty')
    expect(painting.screen).toContain('[refresh]')
    expect(painting.commands.map(command => command.token)).toEqual(['refresh'])
    expect(painting.usage).toContain('refresh')
    expect(painting.usage).toContain('run: foldkit-settings <command>')
  })

  it('hides refresh from the tree and usage while Reading', () => {
    const painting = paint(readingModel)

    expect(painting.screen).toContain('Applying')
    expect(painting.screen).not.toContain('refresh')
    expect(painting.commands).toEqual([])
    expect(painting.usage).toContain('(none)')
  })

  it('paints sample Read quotas', () => {
    const painting = paint(readModel)

    expect(painting.screen).toContain('ingest.knophy.com')
    expect(painting.screen).toContain('Public')
    expect(painting.screen).toContain('[refresh]')
  })

  it('does not invent GitHub chrome or host URL lists', () => {
    const sources = [sourceOf('./paintCli.ts'), sourceOf('./host.ts')]
    for (const source of sources) {
      expect(source).not.toMatch(/github\.com/i)
      expect(source).not.toContain('HostHeader')
      expect(source).not.toContain('formatHostChrome')
    }
  })
})
