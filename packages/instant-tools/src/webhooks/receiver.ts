import { Effect } from 'effect'

import { AgentQueueError, type QueuePing } from './domain.js'

/** Minimal Instant webhook record used by the leftover queue receiver. */
export type AgentQueueWebhookRecord = Readonly<{
  action: 'create' | 'update' | 'delete'
  after: null | Readonly<{
    agentId?: string
    leftoverId?: string
    id?: string
  }>
  id: string
  namespace: string
}>

/** Pings one agent when a queue message is created. Host supplies the ping. */
export const pingAgentFromQueueRecord = (
  record: AgentQueueWebhookRecord,
  ping: (event: QueuePing) => Effect.Effect<void, AgentQueueError>,
): Effect.Effect<void, AgentQueueError> => {
  if (record.namespace !== 'instantToolsAgentQueueMessages') {
    return Effect.void
  }
  if (record.action !== 'create' || record.after === null) {
    return Effect.void
  }
  const agentId = record.after.agentId
  const leftoverId = record.after.leftoverId
  if (agentId === undefined || leftoverId === undefined) {
    return Effect.fail(
      new AgentQueueError({
        cause: 'Queue create missing agentId or leftoverId',
        operation: 'Ping',
      }),
    )
  }
  return ping({
    agentId,
    leftoverId,
    queueMessageId: record.after.id ?? record.id,
  })
}
