import { Data, Duration, Effect, Option, Scope, Stream } from 'effect'
import { randomUUID } from 'node:crypto'

import type { InstantCounterDatabase } from '../../../instant.schema.js'
import {
  type Authentication,
  observeAuthentication,
  signInWithMagicCode,
  signOut,
} from '../../client/auth.js'
import {
  type MultipleCountersV3ClientController,
  type MultipleCountersV3ClientSnapshot,
  makeMultipleCountersV3ClientController,
} from '../client/controller.js'
import {
  appendMultipleCountersV3PolicyRequest,
  makeMultipleCountersV3ProcessorConfig,
  resolveMultipleCountersV3PolicyRequest,
} from '../client/instantTransport.js'
import { formatMultipleCountersV3Destination } from '../client/programView.js'
import {
  formatMultipleCountersV3SessionChrome,
  multipleCountersV3SessionChrome,
} from '../client/sessionChrome.js'
import type { MultipleCountersV3DebugLoginIssued } from '../shared/debugLogin.js'
import { multipleCountersV3SessionEpochSeed } from '../shared/identity.js'
import {
  makeNodeMultipleCountersV3Database,
  requireMultipleCountersV3InstantAppId,
} from './database.js'
import { mintMultipleCountersV3NodeDebugLogin } from './debugLogin.js'
import {
  type MultipleCountersV3NodeSurface,
  makeNodeMultipleCountersV3LocalIdentityStore,
  multipleCountersV3NodeClientStateDirectory,
  nodeMultipleCountersV3LocalIdentityEnvironment,
} from './localIdentity.js'

const activeSessionTimeoutMs = 30_000

/** No authenticated Instant subject is available for this Node Client. */
export class MultipleCountersV3NodeSignedOutError extends Data.TaggedError(
  'MultipleCountersV3NodeSignedOutError',
)<Readonly<{ message: string }>> {}

/** The Processor did not become ready before the Client gave up waiting. */
export class MultipleCountersV3NodeSessionTimeoutError extends Data.TaggedError(
  'MultipleCountersV3NodeSessionTimeoutError',
)<Readonly<{ message: string }>> {}

/** One running Node Instant Client plus its controller and database. */
export type MultipleCountersV3NodeSession = Readonly<{
  authentication: Extract<Authentication, { _tag: 'SignedIn' }>
  controller: MultipleCountersV3ClientController
  database: InstantCounterDatabase
}>

const waitForAuthentication = (
  database: InstantCounterDatabase,
): Effect.Effect<Authentication> =>
  Effect.callback<Authentication>(resume => {
    let isSettled = false
    const unsubscribe = observeAuthentication(database, authentication => {
      if (isSettled || authentication._tag === 'LoadingAuthentication') {
        return
      }
      isSettled = true
      unsubscribe()
      resume(Effect.succeed(authentication))
    })
    return Effect.sync(() => {
      if (!isSettled) {
        isSettled = true
        unsubscribe()
      }
    })
  })

const isReadySnapshot = (snapshot: MultipleCountersV3ClientSnapshot): boolean =>
  Option.isSome(snapshot.maybeActiveProgram) &&
  Option.isSome(
    snapshot.maybeActiveProgram.value.processorSnapshot.activeSessionPolicy,
  )

const waitForReadySnapshot = (
  controller: MultipleCountersV3ClientController,
): Effect.Effect<
  MultipleCountersV3ClientSnapshot,
  MultipleCountersV3NodeSessionTimeoutError
> =>
  Stream.merge(
    Stream.fromEffect(controller.readSnapshot),
    controller.snapshots,
  ).pipe(
    Stream.filter(isReadySnapshot),
    Stream.runHead,
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new MultipleCountersV3NodeSessionTimeoutError({
              message: 'The authenticated Processor closed before it was ready.',
            }),
          ),
        onSome: Effect.succeed,
      }),
    ),
    Effect.timeout(Duration.millis(activeSessionTimeoutMs)),
    Effect.mapError(error =>
      error instanceof MultipleCountersV3NodeSessionTimeoutError
        ? error
        : new MultipleCountersV3NodeSessionTimeoutError({
            message:
              'Timed out waiting for the headless authority to confirm this session.',
          }),
    ),
  )

/** Starts one authenticated Node Instant Client for a named surface. */
export const makeMultipleCountersV3NodeSession = (
  surface: MultipleCountersV3NodeSurface,
): Effect.Effect<MultipleCountersV3NodeSession, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const instantAppId = yield* requireMultipleCountersV3InstantAppId()
    const stateDirectory = multipleCountersV3NodeClientStateDirectory(surface)
    const database = makeNodeMultipleCountersV3Database(
      instantAppId,
      stateDirectory,
    )
    const store = makeNodeMultipleCountersV3LocalIdentityStore(stateDirectory)
    const environment = nodeMultipleCountersV3LocalIdentityEnvironment()
    const controller = yield* makeMultipleCountersV3ClientController({
      policyRequests: {
        append: request =>
          appendMultipleCountersV3PolicyRequest(database, request),
        nextPolicyRequestId: () => randomUUID(),
        now: Date.now,
        resolve: request =>
          resolveMultipleCountersV3PolicyRequest(database, request),
      },
      processorConfig: subjectId =>
        makeMultipleCountersV3ProcessorConfig({
          database,
          environment,
          instantAppId,
          sessionEpochSeed: multipleCountersV3SessionEpochSeed,
          store,
          subjectId,
        }),
      signOut: () => Effect.promise(() => signOut(database)).pipe(Effect.asVoid),
    })
    const authentication = yield* waitForAuthentication(database)
    if (authentication._tag !== 'SignedIn') {
      return yield* new MultipleCountersV3NodeSignedOutError({
        message: `Sign in first with ${surface} login alice or ${surface} login bob.`,
      })
    }
    yield* controller.reconcileAuthenticatedSubject(
      Option.some(authentication.subjectId),
    )
    yield* waitForReadySnapshot(controller)
    return { authentication, controller, database }
  })

/** Mints a debug code and signs the Node Instant Client in as Alice or Bob. */
export const loginMultipleCountersV3NodeSubject = (
  surface: MultipleCountersV3NodeSurface,
  issued: MultipleCountersV3DebugLoginIssued,
): Effect.Effect<
  Authentication,
  | import('./database.js').MultipleCountersV3NodeConfigurationError
  | import('./debugLogin.js').MultipleCountersV3NodeDebugLoginError
> =>
  Effect.gen(function* () {
    const instantAppId = yield* requireMultipleCountersV3InstantAppId()
    const stateDirectory = multipleCountersV3NodeClientStateDirectory(surface)
    const database = makeNodeMultipleCountersV3Database(
      instantAppId,
      stateDirectory,
    )
    yield* Effect.promise(() =>
      signInWithMagicCode(database, issued.email, issued.code),
    )
    return yield* waitForAuthentication(database)
  })

/** Mints Alice or Bob through the headless loopback server, then signs in. */
export const loginMultipleCountersV3NodeDebugSubject = (
  surface: MultipleCountersV3NodeSurface,
  email: MultipleCountersV3DebugLoginIssued['email'],
): Effect.Effect<
  Authentication,
  | import('./database.js').MultipleCountersV3NodeConfigurationError
  | import('./debugLogin.js').MultipleCountersV3NodeDebugLoginError
> =>
  Effect.gen(function* () {
    const issued = yield* mintMultipleCountersV3NodeDebugLogin(email)
    return yield* loginMultipleCountersV3NodeSubject(surface, issued)
  })

/** Formats the current session chrome and Program destination for a Node host. */
export const formatMultipleCountersV3NodeScreen = (
  snapshot: MultipleCountersV3ClientSnapshot,
  account: string,
): ReadonlyArray<string> => {
  const chrome = formatMultipleCountersV3SessionChrome(
    multipleCountersV3SessionChrome(snapshot, account),
  )
  return [
    ...chrome,
    '',
    ...formatMultipleCountersV3Destination(snapshot.model),
  ]
}
