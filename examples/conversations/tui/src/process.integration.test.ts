import {
  ClickedOpenProject,
  initialModel,
  scribeProject,
  update,
} from 'conversations-core-example'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { renderConversationsScreen } from './host.js'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

describe('Conversations TUI process', () => {
  it('opens the first project and quits without persistence', () => {
    const [opened] = update(
      initialModel,
      ClickedOpenProject({ projectId: scribeProject.id }),
    )
    const result = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      input: '1q',
      timeout: 5_000,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe(
      renderConversationsScreen(initialModel) +
        renderConversationsScreen(opened),
    )
  })
})
