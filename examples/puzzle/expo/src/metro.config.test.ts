import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const expoSrc = dirname(fileURLToPath(import.meta.url))

describe('Expo Metro config', () => {
  it('does not forward the demo Instant mint to a local port', () => {
    const source = readFileSync(join(expoSrc, '../metro.config.js'), 'utf8')
    expect(source).not.toContain('5213')
    expect(source).not.toContain('5216')
    expect(source).not.toContain('puzzle-demo-session')
    expect(source).not.toContain('__foldkit')
  })

  it('does not stub Instant admin or Node fs as empty', () => {
    const source = readFileSync(join(expoSrc, '../metro.config.js'), 'utf8')
    expect(source).not.toContain('@instantdb/admin')
    expect(source).not.toContain("type: 'empty'")
    expect(source).not.toContain('type: "empty"')
    expect(source).not.toContain('resolveRequest')
    expect(source).toContain('watchFolders')
    expect(source).toContain('workspaceRoot')
    expect(source).toContain('extraNodeModules')
    expect(source).toContain('packages/foldkit')
  })
})

describe('Expo Instant imports', () => {
  it('loads Instant through ExpoLive, not Instant in the window', () => {
    const host = readFileSync(join(expoSrc, 'instantHost.ts'), 'utf8')
    const expoLive = readFileSync(join(expoSrc, 'expoLive.ts'), 'utf8')
    expect(host).toContain('startLivePuzzle')
    expect(host).toContain('ExpoLive')
    expect(host).not.toContain('@foldkit/instant')
    expect(host).not.toContain('@instantdb/admin')
    expect(expoLive).toContain('puzzle-core-example')
    expect(expoLive).not.toContain('@foldkit/instant')
    expect(expoLive).not.toContain('@instantdb/admin')
  })
})
