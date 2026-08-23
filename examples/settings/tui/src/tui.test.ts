import { readModel } from 'settings-core-example'
import { describe, expect, it } from 'vitest'

import { paintSettingsTui } from './host.js'

const stripAnsi = (painted: string): string =>
  painted.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

describe('Settings TUI host chrome', () => {
  it('appends process quit chrome after the screen tree', () => {
    const painted = stripAnsi(paintSettingsTui(readModel))

    expect(painted).toContain('ingest.knophy.com')
    expect(painted).toContain('[q] quit')
    expect(painted).toContain('Settings')
  })
})
