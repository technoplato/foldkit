import { Effect } from 'effect'
import { GateOriginTest } from 'gate-core-example'
import { describe, expect, it } from 'vitest'

import { refreshGate, showGate } from './host.js'

describe('Gate CLI host', () => {
  it('shows the sample Read after init', async () => {
    const painting = await Effect.runPromise(showGate(GateOriginTest))

    expect(painting.screen).toContain('Rate remaining 40 of 60 resets 60000')
    expect(painting.screen).toContain(
      'Messages remaining 10 of 20 resets 86400000',
    )
    expect(painting.screen).toContain('[refresh]')
    expect(painting.screen).not.toContain('gate.grok.me')
  })

  it('refresh re-reads the origin and paints gateScreen', async () => {
    const painting = await Effect.runPromise(refreshGate(GateOriginTest))

    expect(painting.screen).toContain('Rate remaining 40 of 60 resets 60000')
    expect(painting.commands.map(command => command.token)).toEqual(['refresh'])
  })
})
