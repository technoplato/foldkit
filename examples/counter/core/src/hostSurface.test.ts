import { describe, expect, test } from 'vitest'

import {
  formatHostChrome,
  githubBranch,
  githubOwner,
  githubRepo,
  hostSurfaces,
  surfaceFor,
} from './hostSurface.js'

const renderedBy = (host: string): string =>
  `all business logic and sync logic are written in Foldkit; consumed and rendered by ${host}.`

describe('hostSurface', () => {
  test('points every host at Michael GitHub on this branch', () => {
    expect(githubOwner).toBe('technoplato')
    expect(githubRepo).toBe('foldkit')
    expect(githubBranch).toBe('ml/exploring-view-agnosticism')
    expect(surfaceFor('svelte').sourceUrl).toBe(
      'https://github.com/technoplato/foldkit/blob/ml/exploring-view-agnosticism/examples/counter/svelte/src/App.svelte',
    )
  })

  test('owns Foldkit - Host Counter titles on the Program', () => {
    expect(surfaceFor('opentui').title).toBe('Foldkit - OpenTUI Counter')
    expect(surfaceFor('react').title).toBe('Foldkit - React Counter')
    expect(surfaceFor('react-screen').title).toBe(
      'Foldkit - React screen Counter',
    )
    expect(surfaceFor('svelte').title).toBe('Foldkit - Svelte Counter')
    expect(surfaceFor('expo').title).toBe('Foldkit - Expo Counter')
    expect(surfaceFor('foldkit').title).toBe('Foldkit - Foldkit Counter')
    expect(surfaceFor('tui').title).toBe('Foldkit - TUI Counter')
    expect(surfaceFor('tui-screen').title).toBe('Foldkit - TUI screen Counter')
    expect(surfaceFor('cli').title).toBe('Foldkit - CLI Counter')
    expect(surfaceFor('cli-screen').title).toBe('Foldkit - CLI screen Counter')
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
  })

  test('stacks title, sentence, and source for terminal paint', () => {
    const chrome = formatHostChrome(surfaceFor('opentui'))

    expect(chrome).toContain('Foldkit - OpenTUI Counter')
    expect(chrome).toContain(renderedBy('OpenTUI'))
    expect(chrome).toContain(surfaceFor('opentui').sourceUrl)
  })
})
