import { Option } from 'effect'
import { LoadedCatalog, seedIdeas } from 'ideas-core-example'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderIdeasScreen } from './host.js'

const model = {
  catalog: LoadedCatalog.make({ ideas: seedIdeas }),
  query: '',
  selectedId: Option.none(),
  source: 'Instant' as const,
}

describe('Ideas TUI', () => {
  it('renders Knophy ideas and maps number keys', () => {
    const screen = renderIdeasScreen(model)
    expect(screen).toContain('Knophy ideas')
    expect(messageForInput('1', model)._tag).toBe('Some')
    expect(messageForInput('q', model)._tag).toBe('None')
  })
})
