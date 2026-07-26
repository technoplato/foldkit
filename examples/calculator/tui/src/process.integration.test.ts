import {
  type Model,
  PressedDigit,
  PressedEquals,
  PressedOperation,
  initialModel,
  update,
} from 'calculator-core-example'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { renderCalculatorScreen } from './host.js'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

describe('Calculator TUI process', () => {
  it('renders ordered interactions and quits without persistence', () => {
    const result = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      input: '7x6=q',
      timeout: 5_000,
    })

    let nextModel: Model = initialModel
    const screens = [renderCalculatorScreen(nextModel)]
    for (const message of [
      PressedDigit({ digit: 'Seven' }),
      PressedOperation({ operation: 'Multiply' }),
      PressedDigit({ digit: 'Six' }),
      PressedEquals(),
    ]) {
      const [model] = update(nextModel, message)
      nextModel = model
      screens.push(renderCalculatorScreen(nextModel))
    }

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe(screens.join(''))
  })
})
