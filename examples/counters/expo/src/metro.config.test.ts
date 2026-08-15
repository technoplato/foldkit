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

  it('does not stub Instant admin or Node fs as empty', () => {
    const source = readFileSync(join(expoSrc, '../metro.config.js'), 'utf8')
    expect(source).not.toContain('@instantdb/admin')
    expect(source).not.toContain("type: 'empty'")
    expect(source).not.toContain('type: "empty"')
    expect(source).not.toContain('resolveRequest')
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

describe('Expo Instant imports', () => {
  it('loads Instant through the browser entry, not the Node barrel', () => {
    const access = readFileSync(join(expoSrc, 'access.ts'), 'utf8')
    const adapter = readFileSync(join(expoSrc, 'adapter.ts'), 'utf8')
    const nativeDatabase = readFileSync(
      join(expoSrc, 'nativeDatabase.ts'),
      'utf8',
    )
    expect(access).toContain('@foldkit/instant/browser')
    expect(access).not.toMatch(/from ['"]@foldkit\/instant['"]/)
    expect(access).not.toContain('@instantdb/admin')
    expect(nativeDatabase).toContain('@foldkit/instant/browser')
    expect(nativeDatabase).not.toMatch(/from ['"]@foldkit\/instant['"]/)
    expect(nativeDatabase).not.toContain('@instantdb/admin')
    expect(adapter).not.toMatch(/from ['"]@foldkit\/instant['"]/)
    expect(adapter).not.toContain('@instantdb/admin')
  })
})
