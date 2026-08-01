import {
  Array,
  Data,
  Effect,
  HashSet,
  Match as M,
  Option,
  Order,
  Schema as S,
} from 'effect'

import { ProcessorId } from '../processor/processor.js'

const NonNegativeGeneration = S.Int.check(S.isGreaterThanOrEqualTo(0))
const MaximumTargetedProcessors = 256
const isCanonicalOrder = <A>(
  values: ReadonlyArray<A>,
  order: Order.Order<A>,
): boolean =>
  Array.every(
    Array.zip(values, Array.sort(values, order)),
    ([value, sortedValue]) => value === sortedValue,
  )

const ProcessorIds = S.Array(ProcessorId)
  .check(S.isMinLength(1), S.isMaxLength(MaximumTargetedProcessors))
  .check(
    S.makeFilter(processorIds =>
      HashSet.size(HashSet.fromIterable(processorIds)) ===
      Array.length(processorIds)
        ? undefined
        : {
            path: ['processorIds'],
            issue: 'Processor ids must be unique',
          },
    ),
  )
  .check(
    S.makeFilter(processorIds =>
      isCanonicalOrder(processorIds, Order.String)
        ? undefined
        : {
            path: ['processorIds'],
            issue: 'Processor ids must use canonical lexicographic order',
          },
    ),
  )

/** Whether one Program Message changes shared domain state or semantic navigation. */
export const MessageCategory = S.Literals(['Domain', 'Navigation'])
/** Whether one Program Message changes shared domain state or semantic navigation. */
export type MessageCategory = typeof MessageCategory.Type

/** Every Processor in the authenticated Program session receives the occurrence. */
export const SessionAudience = S.TaggedStruct('SessionAudience', {})
/** Only the named Processors receive the occurrence. */
export const ProcessorAudience = S.TaggedStruct('ProcessorAudience', {
  processorIds: ProcessorIds,
})

/** The immutable recipients resolved when a Message occurrence is accepted. */
export const Audience = S.Union([SessionAudience, ProcessorAudience])
/** The immutable recipients resolved when a Message occurrence is accepted. */
export type Audience = typeof Audience.Type

/** Every Processor mirrors domain and navigation Messages. */
export const Mirror = S.TaggedStruct('Mirror', {})
/** Domain Messages are shared while navigation remains Processor-specific. */
export const SharedDomain = S.TaggedStruct('SharedDomain', {})

/** Whether a follower observes its leader or may drive the followed navigation. */
export const FollowControl = S.Literals(['Observe', 'RemoteControl'])
/** Whether a follower observes its leader or may drive the followed navigation. */
export type FollowControl = typeof FollowControl.Type

/** One Processor following another Processor's semantic navigation. */
export const Follower = S.Struct({
  control: FollowControl,
  processorId: ProcessorId,
})
/** One Processor following another Processor's semantic navigation. */
export type Follower = typeof Follower.Type

const Followers = S.Array(Follower)
  .check(S.isMinLength(1), S.isMaxLength(MaximumTargetedProcessors))
  .check(
    S.makeFilter(followers => {
      const processorIds = Array.map(
        followers,
        follower => follower.processorId,
      )
      return HashSet.size(HashSet.fromIterable(processorIds)) ===
        Array.length(processorIds)
        ? undefined
        : {
            path: ['followers'],
            issue: 'A Processor can follow only once',
          }
    }),
  )
  .check(
    S.makeFilter(followers =>
      isCanonicalOrder(
        followers,
        Order.mapInput(Order.String, follower => follower.processorId),
      )
        ? undefined
        : {
            path: ['followers'],
            issue: 'Followers must use canonical Processor id order',
          },
    ),
  )

/** Selected Processors follow one leader while all other navigation stays independent. */
export const Follow = S.TaggedStruct('Follow', {
  followers: Followers,
  leaderProcessorId: ProcessorId,
}).check(
  S.makeFilter(mode =>
    Array.some(
      mode.followers,
      follower => follower.processorId === mode.leaderProcessorId,
    )
      ? {
          path: ['followers'],
          issue: 'A leader cannot follow itself',
        }
      : undefined,
  ),
)

/** How an authenticated Program session distributes semantic navigation. */
export const Mode = S.Union([Mirror, SharedDomain, Follow])
/** How an authenticated Program session distributes semantic navigation. */
export type Mode = typeof Mode.Type

/** One versioned synchronization policy selected by the Program session. */
export const SessionPolicy = S.Struct({
  generation: NonNegativeGeneration,
  mode: Mode,
})
/** One versioned synchronization policy selected by the Program session. */
export type SessionPolicy = typeof SessionPolicy.Type

/** A Program without synchronization metadata cannot run a partitioned session. */
export class MissingProgramSynchronization extends Data.TaggedError(
  'MissingProgramSynchronization',
)<{
  readonly mode: Exclude<Mode['_tag'], 'Mirror'>
  readonly programId: string
}> {}

/** A read-only follower attempted to originate followed navigation. */
export const ReadOnlyFollowerRejected = S.TaggedStruct(
  'ReadOnlyFollowerRejected',
  { leaderProcessorId: ProcessorId, processorId: ProcessorId },
)

/** A Message was routed to a frozen audience or rejected by session policy. */
export const RoutingDecision = S.Union([Audience, ReadOnlyFollowerRejected])
/** A Message was routed to a frozen audience or rejected by session policy. */
export type RoutingDecision = typeof RoutingDecision.Type

const processorAudience = (
  firstProcessorId: string,
  remainingProcessorIds: ReadonlyArray<string> = [],
): Audience =>
  ProcessorAudience.make({
    processorIds: Array.sort(
      Array.dedupe([firstProcessorId, ...remainingProcessorIds]),
      Order.String,
    ),
  })

const followedProcessorIds = (mode: typeof Follow.Type): Array<string> => [
  mode.leaderProcessorId,
  ...Array.map(mode.followers, follower => follower.processorId),
]

const resolveFollowNavigation = (
  mode: typeof Follow.Type,
  originatingProcessorId: string,
): RoutingDecision => {
  if (originatingProcessorId === mode.leaderProcessorId) {
    return processorAudience(
      mode.leaderProcessorId,
      Array.map(mode.followers, follower => follower.processorId),
    )
  }
  const maybeFollower = Array.findFirst(
    mode.followers,
    follower => follower.processorId === originatingProcessorId,
  )
  if (Option.isNone(maybeFollower)) {
    return processorAudience(originatingProcessorId)
  } else if (maybeFollower.value.control === 'RemoteControl') {
    return processorAudience(
      mode.leaderProcessorId,
      Array.map(mode.followers, follower => follower.processorId),
    )
  } else {
    return ReadOnlyFollowerRejected.make({
      leaderProcessorId: mode.leaderProcessorId,
      processorId: originatingProcessorId,
    })
  }
}

/** Resolves a Program Message to immutable recipients before journal admission. */
export const resolveAudience = (
  policy: SessionPolicy,
  category: MessageCategory,
  originatingProcessorId: string,
): RoutingDecision => {
  if (category === 'Domain') {
    return SessionAudience.make({})
  }
  return M.value(policy.mode).pipe(
    M.withReturnType<RoutingDecision>(),
    M.tagsExhaustive({
      Follow: mode => resolveFollowNavigation(mode, originatingProcessorId),
      Mirror: () => SessionAudience.make({}),
      SharedDomain: () => processorAudience(originatingProcessorId),
    }),
  )
}

/** Returns whether one frozen audience includes a Processor. */
export const includesProcessor = (
  audience: Audience,
  processorId: string,
): boolean =>
  M.value(audience).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      ProcessorAudience: ({ processorIds }) =>
        Array.contains(processorIds, processorId),
      SessionAudience: () => true,
    }),
  )

/** The default for newly allocated authenticated sessions. */
export const defaultSessionPolicy = (): SessionPolicy =>
  SessionPolicy.make({ generation: 0, mode: SharedDomain.make({}) })

/** The legacy policy for accepted occurrences created before audiences existed. */
export const legacyMirrorSessionPolicy = (): SessionPolicy =>
  SessionPolicy.make({ generation: 0, mode: Mirror.make({}) })

/** Returns every Processor explicitly participating in one Follow mode. */
export const processorsInFollowMode = (
  mode: typeof Follow.Type,
): ReadonlyArray<string> =>
  Array.sort(Array.dedupe(followedProcessorIds(mode)), Order.String)

/** Validates that one Program declares the metadata required by its session mode. */
export const validateProgramSynchronization = (
  policy: SessionPolicy,
  program: Readonly<{
    id: string
    synchronization?: unknown
  }>,
): Effect.Effect<void, MissingProgramSynchronization> => {
  if (policy.mode._tag === 'Mirror' || program.synchronization !== undefined) {
    return Effect.void
  } else {
    return Effect.fail(
      new MissingProgramSynchronization({
        mode: policy.mode._tag,
        programId: program.id,
      }),
    )
  }
}
