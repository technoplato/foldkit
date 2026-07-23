import { Model } from 'counter-core-example'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { renderCounterScreen } from './host.js'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

describe('Counter TUI process', () => {
  it('renders ordered interactions and quits without persistence', () => {
    const result = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      input: '++-Rq',
      timeout: 5_000,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe(
      renderCounterScreen(Model.make({ count: 0 })) +
        renderCounterScreen(Model.make({ count: 1 })) +
        renderCounterScreen(Model.make({ count: 2 })) +
        renderCounterScreen(Model.make({ count: 1 })) +
        renderCounterScreen(Model.make({ count: 0 })),
    )

    const secondResult = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      input: 'q',
      timeout: 5_000,
    })

    expect(secondResult.status, secondResult.stderr).toBe(0)
    expect(secondResult.stdout).toBe(
      renderCounterScreen(Model.make({ count: 0 })),
    )
  })
})
