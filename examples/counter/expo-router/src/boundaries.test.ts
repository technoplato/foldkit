import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '../app')
const read = (file: string): string => readFileSync(join(appDir, file), 'utf8')

describe('Counter Expo Router boundaries', () => {
  it('renders every route through the one generic screen', () => {
    expect(read('[...path].tsx')).toContain('FoldkitRouterScreen as default')
    expect(read('index.tsx')).toContain('FoldkitRouterScreen as default')
  })

  it('keeps the layout generic: no Instant, no Actions, no routes', () => {
    const layout = read('_layout.tsx')
    expect(layout).not.toContain('@instantdb')
    expect(layout).not.toMatch(/\b(Increment|Decrement|Reset)\(/)
    expect(layout).not.toContain("'/counter")
    expect(layout).toContain('FoldkitRouterStack')
    expect(layout).toContain('counter-expo-example/start')
  })
})
