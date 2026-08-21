import { initialModel } from 'advocacy-core-example'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderAdvocacyScreen } from './host.js'

describe('Advocacy TUI', () => {
  it('renders meetings and maps admit and person keys', () => {
    const screen = renderAdvocacyScreen(initialModel)
    expect(screen).toContain('Advocacy meetings')
    expect(screen).toContain('StaticFallback')
    expect(messageForInput('a', initialModel)._tag).toBe('Some')
    expect(messageForInput('p', initialModel)._tag).toBe('Some')
    expect(messageForInput('q', initialModel)._tag).toBe('None')
  })
})
