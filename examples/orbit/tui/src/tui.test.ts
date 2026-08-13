import { emptyModel, runIndex } from 'orbit-core-example'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderOrbitScreen } from './host.js'

describe('Orbit TUI', () => {
  it('renders tortoise/achilles and maps mint', () => {
    const { model } = runIndex(emptyModel())
    const screen = renderOrbitScreen(model)
    expect(screen).toContain('Orbit agent index')
    expect(screen).toContain('tortoise')
    expect(messageForInput('m')._tag).toBe('Some')
    expect(messageForInput('q')._tag).toBe('None')
  })
})
