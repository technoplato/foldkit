import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcDir = dirname(fileURLToPath(import.meta.url))

const readSrc = (name: string): string =>
  readFileSync(join(srcDir, name), 'utf8')

const phoneHostFiles = [
  'attach.ts',
  'browser.ts',
  'fold.ts',
  'hostActions.ts',
  'identity.ts',
  'ids.ts',
  'launch.ts',
  'makeTape.ts',
  'native.ts',
  'session.ts',
  'window.ts',
] as const

describe('native Instant host import graph', () => {
  it('does not import Instant admin, Node fs, or the Node mint server', () => {
    for (const name of phoneHostFiles) {
      const source = readSrc(name)
      expect(source).not.toContain('@instantdb/admin')
      expect(source).not.toContain("from 'fs'")
      expect(source).not.toContain('from "fs"')
      expect(source).not.toContain('node:fs')
      expect(source).not.toContain("from './mint.js'")
      expect(source).not.toContain('from "./mint.js"')
      expect(source).not.toContain("from './demoSession.js'")
      expect(source).not.toContain('from "./demoSession.js"')
      expect(source).not.toContain("from './node.js'")
      expect(source).not.toContain('from "./node.js"')
      expect(source).not.toMatch(/from ['"]@foldkit\/instant['"]/)
    }
  })

  it('keeps Instant admin on Node-only modules', () => {
    expect(readSrc('node.ts')).toContain('@instantdb/admin')
    expect(readSrc('demoSession.ts')).toContain('@instantdb/admin')
  })

  it('does not fire-and-forget Instant writes or Scope.close', () => {
    expect(readSrc('attach.ts')).not.toContain('void Effect.runPromise')
    expect(readSrc('native.ts')).not.toContain('void Effect.runPromise')
    expect(readSrc('launch.ts')).not.toContain('makeInMemoryProgramStore')
    expect(readSrc('launch.ts')).not.toContain('local-counters')
  })
})
