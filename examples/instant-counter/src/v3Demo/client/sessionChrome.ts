import { Array, Data, Match as M, Option, Result, Schema as S } from 'effect'
import * as Synchronization from 'foldkit/synchronization'

import type { MultipleCountersV3ClientSnapshot } from './controller.js'

/** Client-local Follow form values bound to one active Processor occurrence. */
export const MultipleCountersV3FollowDraft = S.Struct({
  control: Synchronization.FollowControl,
  followerProcessorId: S.String,
  leaderProcessorId: S.String,
})

/** Client-local Follow form values bound to one active Processor occurrence. */
export type MultipleCountersV3FollowDraft =
  typeof MultipleCountersV3FollowDraft.Type

/** Follow aligns when authority accepts the next typed Navigation Message. */
export const multipleCountersV3FollowAlignmentExplanation =
  "Follow aligns on the next accepted Navigation Message. It does not immediately jump to the leader's current destination."

/** Empty Follow fields before the operator names a leader and follower. */
export const emptyMultipleCountersV3FollowDraft =
  (): MultipleCountersV3FollowDraft => ({
    control: 'Observe',
    followerProcessorId: '',
    leaderProcessorId: '',
  })

/** Constructs one valid single-follower Follow mode from Client form fields. */
export const multipleCountersV3FollowMode = (
  leaderProcessorId: string,
  followerProcessorId: string,
  control: string,
): Option.Option<Synchronization.Mode> => {
  const nextLeaderProcessorId = leaderProcessorId.trim()
  const nextFollowerProcessorId = followerProcessorId.trim()
  if (
    nextLeaderProcessorId.length === 0 ||
    nextFollowerProcessorId.length === 0 ||
    nextLeaderProcessorId === nextFollowerProcessorId ||
    (control !== 'Observe' && control !== 'RemoteControl')
  ) {
    return Option.none()
  }
  return S.decodeUnknownOption(Synchronization.Follow)({
    _tag: 'Follow',
    followers: [
      {
        control,
        processorId: nextFollowerProcessorId,
      },
    ],
    leaderProcessorId: nextLeaderProcessorId,
  })
}

/** A CLI or TUI mode token could not be turned into a session policy. */
export class MultipleCountersV3ModeCommandError extends Data.TaggedError(
  'MultipleCountersV3ModeCommandError',
)<Readonly<{ message: string }>> {}

const followControlFromToken = (
  token: string,
): Option.Option<Synchronization.FollowControl> => {
  if (token === 'observe' || token === 'Observe') {
    return Option.some('Observe')
  }
  if (
    token === 'remote' ||
    token === 'remote-control' ||
    token === 'RemoteControl'
  ) {
    return Option.some('RemoteControl')
  }
  return Option.none()
}

/** Parses Independent, Mirror, or Follow from host command tokens. */
export const parseMultipleCountersV3ModeCommand = (
  tokens: ReadonlyArray<string>,
): Result.Result<Synchronization.Mode, MultipleCountersV3ModeCommandError> => {
  const maybeHead = Array.head(tokens)
  if (Option.isNone(maybeHead)) {
    return Result.fail(
      new MultipleCountersV3ModeCommandError({
        message:
          'Mode needs independent, mirror, or follow <leader> <follower> observe|remote.',
      }),
    )
  }
  const head = maybeHead.value
  if (head === 'independent' || head === 'shared-domain') {
    if (Option.isSome(Array.get(tokens, 1))) {
      return Result.fail(
        new MultipleCountersV3ModeCommandError({
          message: 'Independent does not take further arguments.',
        }),
      )
    }
    return Result.succeed(Synchronization.SharedDomain.make({}))
  }
  if (head === 'mirror') {
    if (Option.isSome(Array.get(tokens, 1))) {
      return Result.fail(
        new MultipleCountersV3ModeCommandError({
          message: 'Mirror does not take further arguments.',
        }),
      )
    }
    return Result.succeed(Synchronization.Mirror.make({}))
  }
  if (head !== 'follow') {
    return Result.fail(
      new MultipleCountersV3ModeCommandError({
        message: `Unknown mode "${head}". Use independent, mirror, or follow.`,
      }),
    )
  }
  const maybeLeader = Array.get(tokens, 1)
  const maybeFollower = Array.get(tokens, 2)
  const maybeControl = Array.get(tokens, 3)
  if (
    Option.isNone(maybeLeader) ||
    Option.isNone(maybeFollower) ||
    Option.isNone(maybeControl) ||
    Option.isSome(Array.get(tokens, 4))
  ) {
    return Result.fail(
      new MultipleCountersV3ModeCommandError({
        message:
          'Follow needs <leaderProcessorId> <followerProcessorId> observe|remote.',
      }),
    )
  }
  const maybeFollowControl = followControlFromToken(maybeControl.value)
  if (Option.isNone(maybeFollowControl)) {
    return Result.fail(
      new MultipleCountersV3ModeCommandError({
        message: 'Follow control must be observe or remote.',
      }),
    )
  }
  const maybeMode = multipleCountersV3FollowMode(
    maybeLeader.value,
    maybeFollower.value,
    maybeFollowControl.value,
  )
  if (Option.isNone(maybeMode)) {
    return Result.fail(
      new MultipleCountersV3ModeCommandError({
        message:
          'Follow needs different non-empty leader and follower Processor ids.',
      }),
    )
  }
  return Result.succeed(maybeMode.value)
}

/** Returns the leader Processor id when this Processor is an Observe follower. */
export const multipleCountersV3ObserveLeaderProcessorId = (
  snapshot: MultipleCountersV3ClientSnapshot,
): Option.Option<string> => {
  const maybeActive = snapshot.maybeActiveProgram
  if (Option.isNone(maybeActive)) {
    return Option.none()
  }
  const maybePolicy = maybeActive.value.processorSnapshot.activeSessionPolicy
  if (Option.isNone(maybePolicy) || maybePolicy.value.mode._tag !== 'Follow') {
    return Option.none()
  }
  const followMode = maybePolicy.value.mode
  const maybeFollower = Array.findFirst(
    followMode.followers,
    follower => follower.processorId === maybeActive.value.processorId,
  )
  return Option.flatMap(maybeFollower, follower =>
    follower.control === 'Observe'
      ? Option.some(followMode.leaderProcessorId)
      : Option.none(),
  )
}

/** Returns whether the current Processor follows navigation without control. */
export const isMultipleCountersV3ObserveFollower = (
  snapshot: MultipleCountersV3ClientSnapshot,
): boolean => Option.isSome(multipleCountersV3ObserveLeaderProcessorId(snapshot))

/** Host-neutral session chrome shared by CLI, React, Foldkit, and TUI Clients. */
export type MultipleCountersV3SessionChrome = Readonly<{
  account: string
  connection: string
  isObserveFollower: boolean
  mode: string
  pendingCount: number
  processorId: string
}>

const connectionLabel = (
  snapshot: MultipleCountersV3ClientSnapshot,
): string => {
  const maybeActive = snapshot.maybeActiveProgram
  if (Option.isNone(maybeActive)) {
    return 'Starting'
  }
  const connection = maybeActive.value.processorSnapshot.connection
  return connection._tag === 'Attached' ? connection.transportStatus : 'Offline'
}

const followRoleLabel = (
  snapshot: MultipleCountersV3ClientSnapshot,
  mode: typeof Synchronization.Follow.Type,
): string => {
  const maybeActive = snapshot.maybeActiveProgram
  if (Option.isNone(maybeActive)) {
    return 'Follow'
  }
  const processorId = maybeActive.value.processorId
  if (mode.leaderProcessorId === processorId) {
    return 'Follow (leader)'
  }
  const maybeFollower = Array.findFirst(
    mode.followers,
    follower => follower.processorId === processorId,
  )
  if (Option.isNone(maybeFollower)) {
    return 'Follow'
  }
  return maybeFollower.value.control === 'RemoteControl'
    ? 'Follow (remote control)'
    : 'Follow (observe)'
}

/** User-facing label for the active session policy, including Follow role. */
export const multipleCountersV3ModeLabel = (
  snapshot: MultipleCountersV3ClientSnapshot,
): string => {
  const maybeActive = snapshot.maybeActiveProgram
  if (Option.isNone(maybeActive)) {
    return 'Starting'
  }
  const maybePolicy = maybeActive.value.processorSnapshot.activeSessionPolicy
  if (Option.isNone(maybePolicy)) {
    return 'Awaiting authority'
  }
  return M.value(maybePolicy.value.mode).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Follow: mode => followRoleLabel(snapshot, mode),
      Mirror: () => 'Mirror',
      SharedDomain: () => 'Independent',
    }),
  )
}

/** User-facing label for a mode the operator is requesting. */
export const multipleCountersV3ModeRequestLabel = (
  mode: Synchronization.Mode,
): string =>
  M.value(mode).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Follow: follow =>
        Array.some(
          follow.followers,
          follower => follower.control === 'RemoteControl',
        )
          ? 'Follow (remote control)'
          : 'Follow (observe)',
      Mirror: () => 'Mirror',
      SharedDomain: () => 'Independent',
    }),
  )

const pendingCount = (snapshot: MultipleCountersV3ClientSnapshot): number => {
  const maybeActive = snapshot.maybeActiveProgram
  if (Option.isNone(maybeActive)) {
    return 0
  }
  return maybeActive.value.processorSnapshot.pendingClaims.length
}

/** Projects one Client snapshot into chrome every surface can render. */
export const multipleCountersV3SessionChrome = (
  snapshot: MultipleCountersV3ClientSnapshot,
  account: string,
): MultipleCountersV3SessionChrome => ({
  account,
  connection: connectionLabel(snapshot),
  isObserveFollower: isMultipleCountersV3ObserveFollower(snapshot),
  mode: multipleCountersV3ModeLabel(snapshot),
  pendingCount: pendingCount(snapshot),
  processorId: Option.match(snapshot.maybeActiveProgram, {
    onNone: () => 'Starting',
    onSome: active => active.processorId,
  }),
})

/** Formats session chrome as CLI and TUI lines. */
export const formatMultipleCountersV3SessionChrome = (
  chrome: MultipleCountersV3SessionChrome,
): ReadonlyArray<string> => [
  `Account: ${chrome.account}`,
  `Connection: ${chrome.connection}`,
  `Mode: ${chrome.mode}`,
  `Processor: ${chrome.processorId}`,
  `Pending: ${chrome.pendingCount.toString()}`,
  ...(chrome.isObserveFollower
    ? ['Navigation follows the leader. Domain actions stay available.']
    : []),
]
