import { Array, Console, Effect, Option, Result } from 'effect'

import { SignedIn } from '../../client/auth.js'
import { resolveMultipleCountersV3EnabledActionToken } from '../client/actions.js'
import {
  formatMultipleCountersV3AvailableActions,
  multipleCountersV3ProgramActions,
} from '../client/programView.js'
import {
  isMultipleCountersV3ObserveFollower,
  multipleCountersV3ModeRequestLabel,
  multipleCountersV3SessionChrome,
  parseMultipleCountersV3ModeCommand,
} from '../client/sessionChrome.js'
import { parseMultipleCountersV3DebugSubjectToken } from '../shared/debugLogin.js'
import {
  type MultipleCountersV3NodeSession,
  formatMultipleCountersV3NodeScreen,
  loginMultipleCountersV3NodeDebugSubject,
  makeMultipleCountersV3NodeSession,
} from '../node/host.js'

const canonicalListDestinationUri = '/counters'
const nodeSurface = 'cli' as const

const accountForSession = (authentication: typeof SignedIn.Type): string =>
  Option.getOrElse(authentication.maybeEmail, () => authentication.subjectId)

/** Signs the CLI Instant Client in as Alice or Bob through debug login. */
export const runMultipleCountersV3CliLogin = (
  subjectToken: string,
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const parsed = parseMultipleCountersV3DebugSubjectToken(subjectToken)
    if (Result.isFailure(parsed)) {
      return yield* Effect.fail(
        new Error('Login subject must be alice or bob.'),
      )
    }
    const authentication = yield* loginMultipleCountersV3NodeDebugSubject(
      nodeSurface,
      parsed.success.email,
    )
    if (authentication._tag !== 'SignedIn') {
      return yield* Effect.fail(
        new Error('Instant debug login did not sign in.'),
      )
    }
    yield* Console.log(
      `Signed in as ${parsed.success.label} (${Option.getOrElse(authentication.maybeEmail, () => authentication.subjectId)}).`,
    )
  })

const withReadySession = (
  use: (session: MultipleCountersV3NodeSession) => Effect.Effect<void, unknown>,
): Effect.Effect<void, unknown> =>
  Effect.scoped(
    Effect.gen(function* () {
      const session = yield* makeMultipleCountersV3NodeSession(nodeSurface)
      yield* session.controller.open(canonicalListDestinationUri)
      return yield* use(session)
    }),
  )

const printScreen = (
  session: MultipleCountersV3NodeSession,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const snapshot = yield* session.controller.readSnapshot
    const account = accountForSession(session.authentication)
    const chrome = multipleCountersV3SessionChrome(snapshot, account)
    const projected = multipleCountersV3ProgramActions(
      snapshot.model,
      !chrome.isObserveFollower,
    )
    const actionLines = Result.isFailure(projected)
      ? [`Available actions unavailable: ${projected.failure._tag}`]
      : formatMultipleCountersV3AvailableActions(projected.success)
    yield* Console.log(
      Array.join(
        [
          ...formatMultipleCountersV3NodeScreen(snapshot, account),
          '',
          'Available actions',
          ...actionLines,
        ],
        '\n',
      ),
    )
  })

/** Prints session chrome and the current Program destination. */
export const runMultipleCountersV3CliShow = (): Effect.Effect<void, unknown> =>
  withReadySession(printScreen)

/** Runs valid Program action tokens through the authenticated Processor. */
export const runMultipleCountersV3CliActions = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<void, unknown> =>
  withReadySession(session =>
    Effect.gen(function* () {
      yield* Effect.forEach(tokens, token =>
        Effect.gen(function* () {
          const snapshot = yield* session.controller.readSnapshot
          const resolved = resolveMultipleCountersV3EnabledActionToken(
            snapshot.model,
            token,
            !isMultipleCountersV3ObserveFollower(snapshot),
          )
          if (Result.isFailure(resolved)) {
            return yield* Effect.fail(resolved.failure)
          }
          return yield* session.controller.perform(resolved.success)
        }),
      )
      yield* printScreen(session)
    }),
  )

const requestModeTokens = (
  session: MultipleCountersV3NodeSession,
  tokens: ReadonlyArray<string>,
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const parsed = parseMultipleCountersV3ModeCommand(tokens)
    if (Result.isFailure(parsed)) {
      return yield* Effect.fail(parsed.failure)
    }
    const resolution = yield* session.controller.requestMode(parsed.success)
    const label = multipleCountersV3ModeRequestLabel(parsed.success)
    const notice =
      resolution.resolutionState === 'Accepted'
        ? `The authority accepted ${label} as policy generation ${resolution.resolvedPolicyGeneration.toString()}.`
        : `The authority rejected ${label}: ${resolution.rejectionReason}.`
    yield* Console.log(notice)
    yield* printScreen(session)
  })

/** Requests Independent, Mirror, or Follow from the session authority. */
export const runMultipleCountersV3CliMode = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<void, unknown> =>
  withReadySession(session => requestModeTokens(session, tokens))

/** Requests Follow using this Processor as the default follower. */
export const runMultipleCountersV3CliFollow = (
  leaderProcessorId: string,
  maybeFollowerProcessorId: Option.Option<string>,
  control: string,
): Effect.Effect<void, unknown> =>
  withReadySession(session =>
    Effect.gen(function* () {
      const snapshot = yield* session.controller.readSnapshot
      const followerProcessorId = Option.getOrElse(
        maybeFollowerProcessorId,
        () =>
          Option.match(snapshot.maybeActiveProgram, {
            onNone: () => '',
            onSome: active => active.processorId,
          }),
      )
      return yield* requestModeTokens(session, [
        'follow',
        leaderProcessorId,
        followerProcessorId,
        control,
      ])
    }),
  )

/** Signs the persisted Instant Client out. */
export const runMultipleCountersV3CliLogout = (): Effect.Effect<void, unknown> =>
  Effect.scoped(
    Effect.gen(function* () {
      const session = yield* makeMultipleCountersV3NodeSession(nodeSurface)
      yield* session.controller.signOut
      yield* Console.log('Signed out.')
    }),
  )
