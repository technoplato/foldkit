import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Host from './host.js'

/** Instant `from` for every Host tag. A new union member must add a key. */
const printedId: { readonly [K in Host.Host['_tag']]: string } = {
  Cli: 'cli',
  Tui: 'tui',
  OpenTui: 'opentui',
  Headless: 'headless',
  Foldkit: 'foldkit',
  React: 'react',
  Svelte: 'svelte',
  ExpoIos: 'expo-ios',
  ExpoAndroid: 'expo-android',
}

describe('Processor.Host', () => {
  it('print is total over the Host union and ids stay distinct', () => {
    const printed = Array.map(Host.Host.members, member => {
      const host = member.make({})
      const id = Host.print(host)
      expect(id).toBe(printedId[host._tag])
      return id
    })
    expect(new Set(printed).size).toBe(Host.Host.members.length)
    expect(Host.Host.members.length).toBe(Object.keys(printedId).length)
  })

  it('prints Instant from strings in lowercase', () => {
    expect(Host.print(Host.Cli())).toBe(printedId.Cli)
    expect(Host.print(Host.Tui())).toBe(printedId.Tui)
    expect(Host.print(Host.OpenTui())).toBe(printedId.OpenTui)
    expect(Host.print(Host.Headless())).toBe(printedId.Headless)
    expect(Host.print(Host.Foldkit())).toBe(printedId.Foldkit)
    expect(Host.print(Host.React())).toBe(printedId.React)
    expect(Host.print(Host.Svelte())).toBe(printedId.Svelte)
    expect(Host.print(Host.ExpoIos())).toBe(printedId.ExpoIos)
    expect(Host.print(Host.ExpoAndroid())).toBe(printedId.ExpoAndroid)
  })
})
