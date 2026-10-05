import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  Cli,
  ExpoAndroid,
  ExpoIos,
  Foldkit,
  Headless,
  type Host,
  OpenTui,
  React,
  Svelte,
  Tui,
  everyHost,
  print,
} from '../processor/host.js'
import { TelemetrySurface, surfaceOf, surfaceOfHostName } from './surface.js'

const surfaceOfEveryHost: ReadonlyArray<readonly [Host, TelemetrySurface]> = [
  [Cli(), 'terminal-cli'],
  [Tui(), 'terminal-tui'],
  [OpenTui(), 'terminal-opentui'],
  [Headless(), 'headless'],
  [Foldkit(), 'web-foldkit'],
  [React(), 'web-react'],
  [Svelte(), 'web-svelte'],
  [ExpoIos(), 'mobile-ios'],
  [ExpoAndroid(), 'mobile-android'],
]

describe('surfaceOf', () => {
  it('names the surface of every Host', () => {
    expect(Array.map(surfaceOfEveryHost, ([host]) => host)).toStrictEqual(
      everyHost,
    )
    Array.forEach(surfaceOfEveryHost, ([host, surface]) => {
      expect(surfaceOf(host)).toBe(surface)
    })
  })

  it('gives every Host its own surface, and every surface a Host', () => {
    const mappedSurfaces = Array.map(surfaceOfEveryHost, ([host]) =>
      surfaceOf(host),
    )
    expect(Array.dedupe(mappedSurfaces)).toHaveLength(surfaceOfEveryHost.length)
    expect([...mappedSurfaces].sort()).toStrictEqual(
      [...TelemetrySurface.literals].sort(),
    )
  })
})

describe('surfaceOfHostName', () => {
  it('reads a Host as the first telemetry release wrote it', () => {
    Array.forEach(surfaceOfEveryHost, ([host, surface]) => {
      expect(surfaceOfHostName(print(host))).toStrictEqual(Option.some(surface))
    })
  })

  it('reads no surface from a word no Host prints', () => {
    expect(surfaceOfHostName('desktop')).toStrictEqual(Option.none())
    expect(surfaceOfHostName('react-ad55df2e')).toStrictEqual(Option.none())
  })
})
