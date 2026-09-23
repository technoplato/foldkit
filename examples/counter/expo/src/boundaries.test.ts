import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const expoSrc = dirname(fileURLToPath(import.meta.url))
const read = (file: string): string => readFileSync(join(expoSrc, file), 'utf8')

describe('Counter Expo boundaries', () => {
  it('keeps the window generic: no Instant, no Counter Actions', () => {
    const windowSources = [read('App.tsx'), read('ActionMenuModal.tsx')]
    for (const source of windowSources) {
      expect(source).not.toContain('@instantdb')
      expect(source).not.toContain('@foldkit/instant')
      expect(source).not.toContain('counter-core-example')
      expect(source).not.toMatch(/\b(Increment|Decrement|Reset)\(/)
    }
    expect(read('App.tsx')).toContain('@foldkit/react/interaction')
    expect(read('ActionMenuModal.tsx')).toContain('onRequestClose')
  })

  it('opens Instant once, at the composition root', () => {
    const root = read('startExpoCounter.ts')
    expect(root).toContain("import './polyfill'")
    expect(root).toContain('@instantdb/react-native')
    expect(root).toContain('startCounter(')
    expect(root).toContain('newProcessorInstance()')
    expect(readFileSync(join(expoSrc, '../App.tsx'), 'utf8')).toContain(
      'ProgramProvider',
    )
  })
})
