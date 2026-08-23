import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { type QueuePing, pingAgentFromQueueRecord } from './index.js'

describe('agent queue webhook receiver', () => {
  it('pings the named agent on instantToolsAgentQueueMessages create', async () => {
    const pings: Array<QueuePing> = []
    await Effect.runPromise(
      pingAgentFromQueueRecord(
        {
          action: 'create',
          after: { agentId: 'issues-245-grok', leftoverId: '245', id: 'q-1' },
          id: 'q-1',
          namespace: 'instantToolsAgentQueueMessages',
        },
        event =>
          Effect.sync(() => {
            pings.push(event)
          }),
      ),
    )
    expect(pings).toEqual([
      {
        agentId: 'issues-245-grok',
        leftoverId: '245',
        queueMessageId: 'q-1',
      },
    ])
  })

  it('does not invent a ping for other namespaces', async () => {
    const pings: Array<QueuePing> = []
    await Effect.runPromise(
      pingAgentFromQueueRecord(
        {
          action: 'create',
          after: { agentId: 'x', leftoverId: '1' },
          id: 'other',
          namespace: 'instantToolsIssues',
        },
        event =>
          Effect.sync(() => {
            pings.push(event)
          }),
      ),
    )
    expect(pings).toEqual([])
  })
})
