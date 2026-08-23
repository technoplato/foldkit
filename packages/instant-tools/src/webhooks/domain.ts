import { Context, Data, Effect, Schema as S, Stream } from 'effect'

/** One message on an agent queue. Instant webhook create should ping this agent. */
export const AgentQueueMessage = S.Struct({
  agentId: S.String,
  createdAtMs: S.Number,
  id: S.String,
  leftoverId: S.String,
  payloadJson: S.String,
  status: S.Literals(['Queued', 'Pinged', 'Failed']),
})
export type AgentQueueMessage = typeof AgentQueueMessage.Type

/** Agent queue transport failed. */
export class AgentQueueError extends Data.TaggedError('AgentQueueError')<{
  readonly cause: unknown
  readonly operation: 'Enqueue' | 'Observe' | 'Ping'
}> {}

/** Transport-neutral agent queue. */
export type AgentQueueService = Readonly<{
  enqueue: (message: AgentQueueMessage) => Effect.Effect<void, AgentQueueError>
  observe: (
    agentId: string,
  ) => Stream.Stream<ReadonlyArray<AgentQueueMessage>, AgentQueueError>
}>

/** Injected agent queue. */
export class AgentQueue extends Context.Service<
  AgentQueue,
  AgentQueueService
>()('@foldkit/instant-tools/AgentQueue') {}

/** Topic payload Instant leftover rooms publish when a queue message lands. */
export const QueuePing = S.Struct({
  agentId: S.String,
  leftoverId: S.String,
  queueMessageId: S.String,
})
export type QueuePing = typeof QueuePing.Type
