import { init, update } from 'archiver-core-example'
import { Option } from 'effect'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderArchiverScreen } from './host.js'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

const typedUrl = 'https://youtu.be/x'

const screensForKeys = (keys: ReadonlyArray<string>): string => {
  let [model] = init()
  const screens = [renderArchiverScreen(model)]
  for (const key of keys) {
    if (model.urlDraft === '' && key.toLowerCase() === 'q') {
      break
    }
    const maybeMessage = messageForInput(model, key)
    if (Option.isSome(maybeMessage)) {
      ;[model] = update(model, maybeMessage.value)
      screens.push(renderArchiverScreen(model))
    }
  }
  return screens.join('')
}

describe('Archiver TUI process', () => {
  it('types a URL, archives it, opens it, and quits without persistence', () => {
    const keys = [...typedUrl, '\r', '1', 'q']
    const result = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      input: keys.join(''),
      timeout: 5_000,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe(screensForKeys(keys))

    const secondResult = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      input: 'q',
      timeout: 5_000,
    })

    expect(secondResult.status, secondResult.stderr).toBe(0)
    expect(secondResult.stdout).toBe(renderArchiverScreen(init()[0]))
  })
})
