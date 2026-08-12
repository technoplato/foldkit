import {
  PressedOpenBook,
  PressedSignIn,
  initialModel,
  newEarth,
  update,
} from 'books-core-example'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { renderBooksScreen } from './host.js'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

describe('Books TUI process', () => {
  it('signs in, opens A New Earth, and quits without persistence', () => {
    const [signedIn] = update(initialModel, PressedSignIn())
    const [opened] = update(signedIn, PressedOpenBook({ itemId: newEarth.id }))
    const result = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      input: 's1q',
      timeout: 5_000,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe(
      renderBooksScreen(initialModel) +
        renderBooksScreen(signedIn) +
        renderBooksScreen(opened),
    )
  })
})
