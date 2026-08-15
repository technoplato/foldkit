import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const expoSrc = dirname(fileURLToPath(import.meta.url))

describe('Expo Metro config', () => {
  it('does not forward the demo Instant mint to port 5213', () => {
    const source = readFileSync(join(expoSrc, '../metro.config.js'), 'utf8')
    expect(source).not.toContain('5213')
    expect(source).not.toContain('counters-demo-session')
    expect(source).not.toContain('__foldkit')
  })
})

describe('Expo window', () => {
  it('does not open Instant or send on a store', () => {
    const source = readFileSync(join(expoSrc, 'App.tsx'), 'utf8')
    expect(source).not.toContain('store.send')
    expect(source).not.toContain('store.observe')
    expect(source).not.toContain('Effect.runPromise')
    expect(source).not.toContain('@instantdb')
    expect(source).not.toContain('openNativeCountersTape')
    expect(source).toContain('useModel')
    expect(source).toContain('useActions')
  })
})
