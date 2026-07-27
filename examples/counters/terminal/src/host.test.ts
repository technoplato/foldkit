import { modelForNavigation, pathToNavigation } from 'counters-core-example'
import { describe, expect, it } from 'vitest'

import { renderCountersTerminal } from './host.js'

describe('Multiple Counters Effect Terminal host', () => {
  it('renders the canonical portable URI and active destination', () => {
    const model = modelForNavigation(
      pathToNavigation('/counters/counter-1/delete'),
    )
    const screen = renderCountersTerminal(model)

    expect(screen).toContain('/counters/counter-1/delete')
    expect(screen).toContain('Delete counter-1?')
    expect(screen).toContain('[1] Cancel')
    expect(screen).toContain('[2] Delete counter')
  })
})
