import { navigationToPath } from 'counters-core-example'
import {
  Array,
  Cause,
  Effect,
  Option,
  Pull,
  Queue,
  Result,
  Stream,
  Terminal,
} from 'effect'
import * as Synchronization from 'foldkit/synchronization'

import { SignedIn } from '../../client/auth.js'
import { resolveMultipleCountersV3EnabledActionToken } from '../client/actions.js'
import type { MultipleCountersV3ClientSnapshot } from '../client/controller.js'
import {
  type MultipleCountersV3ProgramAction,
  formatMultipleCountersV3NumberedActions,
  multipleCountersV3ProgramActions,
} from '../client/programView.js'
import {
  isMultipleCountersV3ObserveFollower,
  multipleCountersV3FollowMode,
  multipleCountersV3SessionChrome,
} from '../client/sessionChrome.js'
import {
  type MultipleCountersV3NodeSession,
  formatMultipleCountersV3NodeScreen,
  makeMultipleCountersV3NodeSession,
} from '../node/host.js'

const clearScreen = '\u001b[2J\u001b[H'
const canonicalListDestinationUri = '/counters'
const nodeSurface = 'tui' as const

const programActionsForSnapshot = (
  snapshot: MultipleCountersV3ClientSnapshot,
  account: string,
) => {
  const chrome = multipleCountersV3SessionChrome(snapshot, account)
  return multipleCountersV3ProgramActions(
    snapshot.model,
    !chrome.isObserveFollower,
  )
}

const accountForSession = (authentication: typeof SignedIn.Type): string =>
  Option.getOrElse(authentication.maybeEmail, () => authentication.subjectId)

/** Renders Instant session chrome, the Program screen, and numbered actions. */
export const renderMultipleCountersV3Tui = (
  snapshot: MultipleCountersV3ClientSnapshot,
  account: string,
): string => {
  const projected = programActionsForSnapshot(snapshot, account)
  const actionLines = Result.isFailure(projected)
    ? [`  Interaction graph unavailable: ${projected.failure._tag}`]
    : formatMultipleCountersV3NumberedActions(projected.success)
  return Array.join(
    [
      clearScreen,
      'Foldkit Multiple Counters | Instant TUI',
      navigationToPath(snapshot.model.navigation),
      '',
      ...formatMultipleCountersV3NodeScreen(snapshot, account),
      '',
      'Available actions',
      ...actionLines,
      '',
      '[i] Independent  [m] Mirror  [q] Quit',
    ],
    '\n',
  )
}

const actionForInput = (
  actions: ReadonlyArray<MultipleCountersV3ProgramAction>,
  input: string,
): Option.Option<MultipleCountersV3ProgramAction> => {
  const maybeIndex = Number.parseInt(input, 10)
  return Number.isNaN(maybeIndex)
    ? Option.none()
    : Array.get(actions, maybeIndex - 1)
}

/** Launch options for Follow from another surface's Processor id. */
export type MultipleCountersV3TuiFollowLaunch = Readonly<{
  control: string
  leaderProcessorId: string
}>

/** Runs the interactive Instant TUI over one authenticated Processor. */
export const runMultipleCountersV3Tui = (
  maybeFollow: Option.Option<MultipleCountersV3TuiFollowLaunch>,
): Effect.Effect<void, unknown, Terminal.Terminal> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const session = yield* makeMultipleCountersV3NodeSession(nodeSurface)
      yield* session.controller.open(canonicalListDestinationUri)
      if (Option.isSome(maybeFollow)) {
        const snapshot = yield* session.controller.readSnapshot
        const followerProcessorId = Option.match(snapshot.maybeActiveProgram, {
          onNone: () => '',
          onSome: active => active.processorId,
        })
        const maybeMode = multipleCountersV3FollowMode(
          maybeFollow.value.leaderProcessorId,
          followerProcessorId,
          maybeFollow.value.control === 'remote' ||
            maybeFollow.value.control === 'RemoteControl'
            ? 'RemoteControl'
            : 'Observe',
        )
        if (Option.isSome(maybeMode)) {
          yield* session.controller.requestMode(maybeMode.value)
        }
      }
      const account = accountForSession(session.authentication)
      const display = (snapshot: MultipleCountersV3ClientSnapshot) =>
        terminal.display(renderMultipleCountersV3Tui(snapshot, account))
      yield* display(yield* session.controller.readSnapshot)
      const scope = yield* Effect.scope
      yield* Effect.forkIn(
        Stream.runForEach(session.controller.snapshots, snapshot =>
          display(snapshot),
        ),
        scope,
      )
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, session, terminal, account).pipe(
        Pull.catchDone(() => Effect.void),
      )
    }),
  )

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  session: MultipleCountersV3NodeSession,
  terminal: Terminal.Terminal,
  account: string,
): Effect.Effect<void, unknown> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const keyName = input.key.name.toLowerCase()
      const key = Option.getOrElse(input.input, () => keyName).toLowerCase()
      const isControlQuit =
        input.key.ctrl && (keyName === 'c' || keyName === 'd')
      if (key === 'q' || isControlQuit) {
        return Effect.void
      }
      return Effect.gen(function* () {
        if (key === 'i') {
          yield* session.controller.requestMode(
            Synchronization.SharedDomain.make({}),
          )
        } else if (key === 'm') {
          yield* session.controller.requestMode(Synchronization.Mirror.make({}))
        } else {
          const snapshot = yield* session.controller.readSnapshot
          const projected = programActionsForSnapshot(snapshot, account)
          if (Result.isSuccess(projected)) {
            const maybeAction = actionForInput(projected.success, key)
            if (Option.isSome(maybeAction) && maybeAction.value.isEnabled) {
              const resolved = resolveMultipleCountersV3EnabledActionToken(
                snapshot.model,
                maybeAction.value.token,
                !isMultipleCountersV3ObserveFollower(snapshot),
              )
              if (Result.isSuccess(resolved)) {
                yield* session.controller.perform(resolved.success)
              }
            }
          }
        }
        yield* terminal.display(
          renderMultipleCountersV3Tui(
            yield* session.controller.readSnapshot,
            account,
          ),
        )
        return yield* runInputLoop(inputQueue, session, terminal, account)
      })
    }),
  )
