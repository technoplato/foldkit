import { readModel } from 'gate-core-example'
import { describe, expect, it } from 'vitest'

import { paintGateTui } from './host.js'

const stripAnsi = (painted: string): string =>
  painted.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

describe('Gate TUI host chrome', () => {
  it('appends process quit chrome after the screen tree', () => {
    const painted = stripAnsi(paintGateTui(readModel))

    expect(painted).toContain('Rate remaining 40 of 60 resets 60000')
    expect(painted).toContain('[q] quit')
    expect(painted).not.toContain('gate.grok.me')
  })
})
