import { Option } from 'effect'
import { Processor } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  formatHostChrome,
  githubBranch,
  githubOwner,
  githubRepo,
  hostSurfaces,
  parseHostId,
  processorHostFor,
  surfaceFor,
  tweetPainterIds,
  tweetShowPainterIds,
  usesOwnPainterProcessor,
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

  test('names the tweet painters Dave live-pokes', () => {
    expect(tweetPainterIds).toEqual([
      'foldkit',
      'svelte',
      'react',
      'react-screen',
      'expo',
      'cli',
      'tui',
      'opentui',
    ])
    expect(tweetShowPainterIds).toEqual([
      'foldkit',
      'svelte',
      'react',
      'react-screen',
      'expo',
      'cli',
      'opentui',
    ])
    expect(parseHostId('svelte')).toEqual(Option.some('svelte'))
    expect(parseHostId('2e')).toEqual(Option.none())
  })

  test('maps each surface to a Processor Host', () => {
    expect(processorHostFor('foldkit')).toEqual(Processor.Host.Foldkit())
    expect(processorHostFor('svelte')).toEqual(Processor.Host.Svelte())
    expect(processorHostFor('react')).toEqual(Processor.Host.React())
    expect(processorHostFor('react-screen')).toEqual(Processor.Host.React())
    expect(processorHostFor('expo')).toEqual(Processor.Host.ExpoIos())
    expect(processorHostFor('cli')).toEqual(Processor.Host.Cli())
    expect(processorHostFor('cli-screen')).toEqual(Processor.Host.Cli())
    expect(processorHostFor('opentui')).toEqual(Processor.Host.OpenTui())
    expect(processorHostFor('tui')).toEqual(Processor.Host.Tui())
    expect(processorHostFor('tui-screen')).toEqual(Processor.Host.Tui())
    expect(usesOwnPainterProcessor('svelte')).toBe(true)
    expect(usesOwnPainterProcessor('react-screen')).toBe(true)
    expect(usesOwnPainterProcessor('cli')).toBe(true)
    expect(usesOwnPainterProcessor('cli-screen')).toBe(false)
  })
})
