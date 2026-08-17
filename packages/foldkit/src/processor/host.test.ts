import { describe, expect, it } from 'vitest'

import * as Host from './host.js'

describe('Processor.Host', () => {
  it('prints Instant from strings in lowercase', () => {
    expect(Host.print(Host.Cli())).toBe('cli')
    expect(Host.print(Host.Tui())).toBe('tui')
    expect(Host.print(Host.Headless())).toBe('headless')
    expect(Host.print(Host.Foldkit())).toBe('foldkit')
    expect(Host.print(Host.React())).toBe('react')
    expect(Host.print(Host.Svelte())).toBe('svelte')
    expect(Host.print(Host.ExpoIos())).toBe('expoios')
    expect(Host.print(Host.ExpoAndroid())).toBe('expoandroid')
  })
})
