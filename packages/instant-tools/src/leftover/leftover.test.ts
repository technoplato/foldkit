import { Array, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { makeMemoryLeftoverPresence, quorumFromPeers } from './index.js'

describe('leftover presence', () => {
  it('joins a leftover room and reports quorum from present peers', async () => {
    const presence = makeMemoryLeftoverPresence()
    await Effect.runPromise(
      presence.joinLeftoverRoom({
        agentId: 'issues-245-grok',
        leftoverId: '245',
        origin: 'issues.knophy.com',
        role: 'worker',
      }),
    )
    const quorum = await Effect.runPromise(presence.quorum('245', 1))
    expect(quorum.hasQuorum).toBe(true)
    const maybePeer = Array.head(quorum.present)
    expect(Option.isSome(maybePeer)).toBe(true)
    if (Option.isSome(maybePeer)) {
      expect(maybePeer.value.agentId).toBe('issues-245-grok')
    }
    expect(quorumFromPeers('245', [], 1).hasQuorum).toBe(false)
  })
})
