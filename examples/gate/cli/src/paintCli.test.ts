import {
  type Model,
  gateScreen,
  readModel,
  readingModel,
  unreadModel,
  whatForToken,
} from 'gate-core-example'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { paintCli } from './paintCli.js'

const paint = (model: Model) =>
  paintCli(gateScreen(model), {
    binaryName: 'foldkit-gate',
    whatFor: whatForToken,
  })

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

describe('paintCli', () => {
  it('paints the Gate tree as text with Button tokens', () => {
    const painting = paint(unreadModel)

    expect(painting.screen).toContain('Gate')
    expect(painting.screen).toContain('Unread')
    expect(painting.screen).toContain('[refresh]')
    expect(painting.commands.map(command => command.token)).toEqual(['refresh'])
    expect(painting.usage).toContain('refresh')
    expect(painting.usage).toContain('run: foldkit-gate <command>')
  })

  it('hides refresh from the tree and usage while Reading', () => {
    const painting = paint(readingModel)

    expect(painting.screen).toContain('Reading')
    expect(painting.screen).not.toContain('refresh')
    expect(painting.commands).toEqual([])
    expect(painting.usage).toContain('(none)')
  })

  it('paints sample Read quotas', () => {
    const painting = paint(readModel)

    expect(painting.screen).toContain('Rate remaining 40 of 60 resets 60000')
    expect(painting.screen).toContain(
      'Messages remaining 10 of 20 resets 86400000',
    )
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
