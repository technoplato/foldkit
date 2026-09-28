import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const expoSrc = dirname(fileURLToPath(import.meta.url))
const read = (file: string): string => readFileSync(join(expoSrc, file), 'utf8')

describe('Counter Expo boundaries', () => {
  it('keeps the window generic: no Instant, no Counter Actions', () => {
    const window = read('App.tsx')
    expect(window).not.toContain('@instantdb')
    expect(window).not.toContain('@foldkit/instant')
    expect(window).not.toContain('counter-core-example')
    expect(window).not.toMatch(/\b(Increment|Decrement|Reset)\(/)
    expect(window).toContain('@foldkit/react-native/interaction')
  })

  it('paints through the package, not a painter of its own', () => {
    expect(existsSync(join(expoSrc, 'paintScreen.tsx'))).toBe(false)
    expect(existsSync(join(expoSrc, 'ActionMenuModal.tsx'))).toBe(false)
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
