import { Processor } from 'foldkit'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadInstantDemoEnv, resolveInstantSyncEngine } from './demoEnv.js'
import { FoldkitCounterV01 } from './fromTransport.js'

const managedKeys = [
  'FOLDKIT_INSTANT_DEMO_ENV_FILE',
  'COUNTER_TAPE',
  'COUNTER_TAPE_PATH',
  'DEMO_ENV_TEST_FRESH',
  'DEMO_ENV_TEST_QUOTED',
  'DEMO_ENV_TEST_TAKEN',
  'DEMO_ENV_TEST_BLANK',
] as const

const savedEnv = new Map<string, string | undefined>()
for (const key of managedKeys) {
  savedEnv.set(key, process.env[key])
}

const writeDemoEnvFile = (contents: string): string => {
  const directory = mkdtempSync(join(tmpdir(), 'instant-demo-env-'))
  const path = join(directory, 'counter-v01.env')
  writeFileSync(path, contents)
  return path
}

afterEach(() => {
  for (const key of managedKeys) {
    const value = savedEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('Instant demo env', () => {
  it('fills only missing keys and strips surrounding quotes', () => {
    delete process.env['DEMO_ENV_TEST_FRESH']
    delete process.env['DEMO_ENV_TEST_QUOTED']
    process.env['DEMO_ENV_TEST_TAKEN'] = 'kept'
    process.env['DEMO_ENV_TEST_BLANK'] = ''
    process.env['FOLDKIT_INSTANT_DEMO_ENV_FILE'] = writeDemoEnvFile(
      [
        '# comment',
        '',
        'DEMO_ENV_TEST_FRESH=plain',
        "DEMO_ENV_TEST_QUOTED='wrapped'",
        'DEMO_ENV_TEST_TAKEN=ignored',
        'DEMO_ENV_TEST_BLANK=ignored',
      ].join('\n'),
    )

    loadInstantDemoEnv()

    expect(process.env['DEMO_ENV_TEST_FRESH']).toBe('plain')
    expect(process.env['DEMO_ENV_TEST_QUOTED']).toBe('wrapped')
    expect(process.env['DEMO_ENV_TEST_TAKEN']).toBe('kept')
    expect(process.env['DEMO_ENV_TEST_BLANK']).toBe('')
  })

  it('isolates the process when COUNTER_TAPE is memory', () => {
    process.env['COUNTER_TAPE'] = 'memory'
    delete process.env['COUNTER_TAPE_PATH']

    const engine = resolveInstantSyncEngine({
      app: FoldkitCounterV01,
      processor: Processor.Host.Cli(),
    })

    expect(engine.processor).toBe('cli')
  })

  it('syncs on a local file tape when COUNTER_TAPE_PATH is set', () => {
    delete process.env['COUNTER_TAPE']
    const directory = mkdtempSync(join(tmpdir(), 'instant-demo-tape-'))
    process.env['COUNTER_TAPE_PATH'] = join(directory, 'tape.json')

    const engine = resolveInstantSyncEngine({
      app: FoldkitCounterV01,
      processor: Processor.Host.Tui(),
    })

    expect(engine.processor).toBe('tui')
  })

  it('disambiguates two OpenTUI engines with instance', () => {
    delete process.env['COUNTER_TAPE']
    delete process.env['COUNTER_TAPE_PATH']
    process.env['FOLDKIT_INSTANT_DEMO_ENV_FILE'] = writeDemoEnvFile('')

    const engine = resolveInstantSyncEngine({
      app: FoldkitCounterV01,
      processor: Processor.Host.OpenTui(),
      instance: 'tab-one',
    })

    expect(engine.processor).toBe('opentui-tab-one')
  })

  it('defaults to the shared live Instant tape', () => {
    delete process.env['COUNTER_TAPE']
    delete process.env['COUNTER_TAPE_PATH']
    process.env['FOLDKIT_INSTANT_DEMO_ENV_FILE'] = writeDemoEnvFile('')

    const engine = resolveInstantSyncEngine({
      app: FoldkitCounterV01,
      processor: Processor.Host.Cli(),
    })

    expect(engine.processor).toBe('cli')
  })

  it('keeps demoEnv and readFileSync out of the browser entry', () => {
    const source = readFileSync(
      new URL('../browser.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toContain('demoEnv')
    expect(source).not.toContain('readFileSync')
    expect(source).not.toContain('loadInstantDemoEnv')
    expect(source).not.toContain('resolveInstantSyncEngine')
  })

  it('points browser and react-native at the browser Instant entry', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    )
    expect(manifest.exports['.'].browser).toBe('./dist/browser.js')
    expect(manifest.exports['.']['react-native']).toBe('./dist/browser.js')
    expect(manifest.exports['.'].import).toBe('./dist/index.js')
  })
})
