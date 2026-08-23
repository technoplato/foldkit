import { describe, expect, test } from 'vitest'

import {
  formatHostChrome,
  formatLiveHosts,
  grokLiveUrl,
  hostSurfaces,
  liveHosts,
  puzzleLiveUrl,
  replicateLiveUrl,
  surfaceFor,
} from './hostSurface.js'

const renderedBy = (host: string): string =>
  `all business logic and sync logic are written in Foldkit; consumed and rendered by ${host}.`

const hostIds = [
  'opentui',
  'react',
  'react-screen',
  'svelte',
  'expo',
  'foldkit',
  'tui',
  'tui-screen',
  'cli',
  'cli-screen',
  'headless',
] as const

describe('hostSurface', () => {
  test('points every host at the live Puzzle page, not GitHub', () => {
    expect(puzzleLiveUrl).toBe('https://puzzle.knophy.com')
    expect(replicateLiveUrl).toBe('https://replicate.knophy.com')
    expect(grokLiveUrl).toBe('https://grok.knophy.com')
    expect(liveHosts).toEqual({
      puzzle: puzzleLiveUrl,
      replicate: replicateLiveUrl,
      grok: grokLiveUrl,
    })
    for (const id of hostIds) {
      const surface = surfaceFor(id)
      expect(surface.sourceUrl).toBe(puzzleLiveUrl)
      expect(surface.sourceUrl).not.toContain('github.com')
      expect(surface.live).toEqual(liveHosts)
      expect(JSON.stringify(surface)).not.toContain('github.com')
    }
  })

  test('owns Foldkit - Host Puzzle titles on the Program', () => {
    expect(surfaceFor('opentui').title).toBe('Foldkit - OpenTUI Puzzle')
    expect(surfaceFor('react').title).toBe('Foldkit - React Puzzle')
    expect(surfaceFor('react-screen').title).toBe(
      'Foldkit - React screen Puzzle',
    )
    expect(surfaceFor('svelte').title).toBe('Foldkit - Svelte Puzzle')
    expect(surfaceFor('expo').title).toBe('Foldkit - Expo Puzzle')
    expect(surfaceFor('foldkit').title).toBe('Foldkit - Foldkit Puzzle')
    expect(surfaceFor('tui').title).toBe('Foldkit - TUI Puzzle')
    expect(surfaceFor('tui-screen').title).toBe('Foldkit - TUI screen Puzzle')
    expect(surfaceFor('cli').title).toBe('Foldkit - CLI Puzzle')
    expect(surfaceFor('cli-screen').title).toBe('Foldkit - CLI screen Puzzle')
    expect(surfaceFor('headless').title).toBe('Foldkit - Headless Puzzle')
    expect(hostSurfaces.svelte).toEqual(surfaceFor('svelte'))
  })

  test('uses the Foldkit-logic sentence for every host', () => {
    expect(surfaceFor('svelte').description).toBe(renderedBy('Svelte'))
    expect(surfaceFor('react').description).toBe(renderedBy('React'))
    expect(surfaceFor('react-screen').description).toBe(renderedBy('React'))
    expect(surfaceFor('opentui').description).toBe(renderedBy('OpenTUI'))
    expect(surfaceFor('expo').description).toBe(renderedBy('Expo'))
    expect(surfaceFor('foldkit').description).toBe(renderedBy('Foldkit'))
    expect(surfaceFor('tui').description).toBe(renderedBy('TUI'))
    expect(surfaceFor('tui-screen').description).toBe(renderedBy('TUI'))
    expect(surfaceFor('cli').description).toBe(renderedBy('CLI'))
    expect(surfaceFor('cli-screen').description).toBe(renderedBy('CLI'))
    expect(surfaceFor('headless').description).toBe(renderedBy('Headless'))
  })

  test('stacks title and sentence without URL decisions', () => {
    const chrome = formatHostChrome(surfaceFor('opentui'))

    expect(chrome).toContain('Foldkit - OpenTUI Puzzle')
    expect(chrome).toContain(renderedBy('OpenTUI'))
    expect(chrome).not.toContain('https://')
    expect(chrome).not.toContain('github.com')
  })

  test('lists the three live hosts on the Foldkit surface', () => {
    const listed = formatLiveHosts(surfaceFor('foldkit'))

    expect(listed).toContain(puzzleLiveUrl)
    expect(listed).toContain(replicateLiveUrl)
    expect(listed).toContain(grokLiveUrl)
    expect(listed).not.toContain('github.com')
  })
})
