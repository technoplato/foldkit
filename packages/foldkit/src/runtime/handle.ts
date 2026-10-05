import { Cause, Effect, Exit, type Layer, Option, Scope } from 'effect'

import type { ProgramHandle } from '../interaction/bind.js'
import type { Host } from '../processor/host.js'
import type { MessageOf, ModelOf } from '../program/program.js'
import type {
  SyncChild,
  SyncProgram,
  SyncedMessage,
  SyncedModel,
} from '../program/sync.js'
import type { SessionPolicy } from '../synchronization/synchronization.js'
import type { LocalSnapshotStore } from './localSnapshot.js'
import type {
  ProgramRuntimeObservation,
  ProgramRuntimeObserver,
} from './programRuntime.js'
import { type StartedProgram, start } from './start.js'
import type { SyncEngine } from './syncEngine.js'

/**
 * Connects one observer to the runtime behind a handle and returns the
 * function that disconnects it. Disconnecting closes the observer's Scope
 * and resolves once its finalizers have run, such as a telemetry sink's
 * last flush.
 */
export type ObserveRuntime<Model, Message> = (
  observer: ProgramRuntimeObserver<Model, Message>,
) => () => Promise<void>

type HostOfHandle<OnHost extends Host | undefined> = [OnHost] extends [Host]
  ? Readonly<{ host: OnHost }>
  : unknown

/**
 * The handle {@link startHandle} returns for one synced Program.
 *
 * `OnHost` is the Host it was started on, when the start named one. A
 * handle from `startHandle({ ..., host: Processor.Host.Tui() })` is a
 * `SyncedHandle<typeof App, Processor.Host.Tui>`, and its `host` is always
 * there. The default, `undefined`, makes no such promise, for a handle
 * started without a Host. Telemetry needs the promise, so it can name the
 * surface a session runs on and never guess one.
 *
 * `observeRuntime` connects an observer to the runtime the handle starts.
 * An observer connected before the runtime boots, such as one connected on
 * the line after `startHandle`, sees its first transition, its first
 * diagnostic, and its first Command span. One connected later sees what
 * happens from then on. Every observer disconnects when the handle stops.
 *
 * @example
 * ```typescript
 * const handle = Runtime.startHandle({ program: SyncedCounter, sync, host: Processor.Host.Tui() })
 * const disconnect = handle.observeRuntime(observation =>
 *   Effect.acquireRelease(
 *     Effect.sync(() => observation.journal.observe(transition => {
 *       console.log(transition.message._tag)
 *     })),
 *     stopObserving => Effect.sync(stopObserving),
 *   ),
 * )
 * await disconnect()
 * ```
 */
export type SyncedHandle<
  Child extends SyncChild,
  OnHost extends Host | undefined = undefined,
> = ProgramHandle<
  SyncedModel<ModelOf<Child>, MessageOf<Child>>,
  SyncedMessage<ModelOf<Child>, MessageOf<Child>> & Readonly<{ _tag: string }>
> &
  Readonly<{
    observeRuntime: ObserveRuntime<
      SyncedModel<ModelOf<Child>, MessageOf<Child>>,
      SyncedMessage<ModelOf<Child>, MessageOf<Child>> &
        Readonly<{ _tag: string }>
    >
  }> &
  HostOfHandle<OnHost>

type ObserverConnection<Model, Message> = Readonly<{
  observation: ProgramRuntimeObservation<Model, Message>
  scope: Scope.Scope
}>

type ObserverRegistration<Model, Message> = Readonly<{
  observer: ProgramRuntimeObserver<Model, Message>
}>

const reportObserverFailure = (
  cause: Cause.Cause<unknown>,
): Effect.Effect<void> =>
  Effect.sync(() => {
    console.error(
      '[foldkit] A Program runtime observer failed:',
      Cause.pretty(cause),
    )
  })

/**
 * Holds the observers connected to one handle before and after its
 * runtime exists. The runtime connects the registry before it boots, and
 * the registry connects every observer it holds then, and each one added
 * later at once.
 */
const makeObserverRegistry = <Model, Message>(): Readonly<{
  connect: ProgramRuntimeObserver<Model, Message>
  observe: ObserveRuntime<Model, Message>
}> => {
  const registrations = new Set<ObserverRegistration<Model, Message>>()
  const registrationScopes = new Map<
    ObserverRegistration<Model, Message>,
    Scope.Closeable
  >()
  let maybeConnection = Option.none<ObserverConnection<Model, Message>>()

  const connectRegistration = (
    connection: ObserverConnection<Model, Message>,
    registration: ObserverRegistration<Model, Message>,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const registrationScope = yield* Scope.fork(connection.scope)
      registrationScopes.set(registration, registrationScope)
      yield* registration
        .observer(connection.observation)
        .pipe(
          Scope.provide(registrationScope),
          Effect.catchCause(reportObserverFailure),
        )
    })

  const connect: ProgramRuntimeObserver<Model, Message> = observation =>
    Effect.gen(function* () {
      const connection = { observation, scope: yield* Scope.Scope }
      maybeConnection = Option.some(connection)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          maybeConnection = Option.none()
        }),
      )
      yield* Effect.forEach(
        registrations,
        registration => connectRegistration(connection, registration),
        { discard: true },
      )
    })

  const observe: ObserveRuntime<Model, Message> = observer => {
    const registration = { observer }
    registrations.add(registration)
    if (Option.isSome(maybeConnection)) {
      Effect.runFork(connectRegistration(maybeConnection.value, registration))
    }
    return async () => {
      registrations.delete(registration)
      const maybeRegistrationScope = Option.fromNullishOr(
        registrationScopes.get(registration),
      )
      registrationScopes.delete(registration)
      if (Option.isSome(maybeRegistrationScope)) {
        await Effect.runPromise(
          Scope.close(maybeRegistrationScope.value, Exit.void),
        )
      }
    }
  }

  return { connect, observe }
}

const causeOf = (error: unknown): string => {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  if (typeof error === 'object' && error !== null && '_tag' in error) {
    return String(error._tag)
  }
  return 'Runtime.start failed.'
}

/**
 * What {@link startHandle} starts, and on which Host. Name the `host`, such
 * as `Processor.Host.Tui()`, and the handle carries it in its type.
 */
export type StartHandleConfig<Child extends SyncChild, Resources> = Readonly<{
  program: SyncProgram<Child>
  sync: SyncEngine
  resources?: Layer.Layer<Resources>
  policy?: SessionPolicy
  localSnapshot?: LocalSnapshotStore
  host?: Host
}>

/**
 * Starts a synced Program for a long-lived Client and returns a plain
 * handle. The Model is Starting until the first snapshot, then Ready. If
 * the runtime cannot start, the Model becomes Failed with the cause. It
 * never invents a count.
 *
 * Call `stop` when the Client goes away; it closes the runtime's Scope.
 * Pass the `host` it runs on, so a bound window is titled by it and
 * telemetry names its surface, and the `resources` its Commands and
 * Subscriptions use, such as a browser audio output Layer. A handle
 * started with a `host` carries it in its type; see {@link SyncedHandle}.
 * `observeRuntime` connects observers such as telemetry. The runtime
 * starts on the next microtask, so an observer connected on the line after
 * `startHandle` sees it boot.
 *
 * @example
 * ```typescript
 * const handle = Runtime.startHandle({
 *   program: SyncedCounter,
 *   sync: Runtime.Memory({ processor: 'react-4f2a' }),
 *   host: Processor.Host.React(),
 * })
 * handle.subscribe(() => paint(handle.readModel()))
 * ```
 */
export function startHandle<
  Child extends SyncChild,
  Resources = never,
  OnHost extends Host = Host,
>(
  config: StartHandleConfig<Child, Resources> & Readonly<{ host: OnHost }>,
): SyncedHandle<Child, OnHost>
export function startHandle<Child extends SyncChild, Resources = never>(
  config: StartHandleConfig<Child, Resources>,
): SyncedHandle<Child>
export function startHandle<Child extends SyncChild, Resources = never>(
  config: StartHandleConfig<Child, Resources>,
): SyncedHandle<Child> {
  type Model = SyncedModel<ModelOf<Child>, MessageOf<Child>>
  type Message = SyncedMessage<ModelOf<Child>, MessageOf<Child>> &
    Readonly<{ _tag: string }>

  const program = config.program
  const scope = Effect.runSync(Scope.make())
  const listeners = new Set<() => void>()
  const writesInFlight = new Set<Promise<unknown>>()
  const observerRegistry = makeObserverRegistry<Model, Message>()
  let cachedModel: Model = program.init()[0]
  let maybeStarted: Option.Option<StartedProgram<Model, Message>> =
    Option.none()
  let isStopped = false

  const notify = (): void => {
    listeners.forEach(listener => {
      listener()
    })
  }

  const opening = Promise.resolve().then(() =>
    isStopped
      ? Promise.reject(new Error('The handle stopped before it started.'))
      : Effect.runPromise(
          start({
            program,
            sync: config.sync,
            ...(config.resources === undefined
              ? {}
              : { resources: config.resources }),
            ...(config.policy === undefined ? {} : { policy: config.policy }),
            ...(config.localSnapshot === undefined
              ? {}
              : { localSnapshot: config.localSnapshot }),
            observers: [observerRegistry.connect],
          }).pipe(Effect.provideService(Scope.Scope, scope)),
        ),
  )

  opening.then(
    started => {
      if (isStopped) {
        return
      }
      maybeStarted = Option.some(started)
      cachedModel = started.readModel()
      started.observeModel(next => {
        cachedModel = next
        notify()
      })
      notify()
    },
    error => {
      if (isStopped) {
        return
      }
      cachedModel = program.Failed({
        error: program.TransportFailed({
          what: 'This Processor could not start.',
          meaning: 'Runtime.start failed before the first snapshot.',
          fix: 'Check the sync engine and the session policy, then try again.',
          cause: causeOf(error),
        }),
      })
      notify()
    },
  )

  return {
    ...(config.host === undefined ? {} : { host: config.host }),
    readModel: () => cachedModel,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: message => {
      if (Option.isSome(maybeStarted)) {
        const started = maybeStarted.value
        const write = Effect.runPromise(started.run(message)).finally(() => {
          writesInFlight.delete(write)
        })
        writesInFlight.add(write)
        cachedModel = started.readModel()
        notify()
      }
    },
    observeRuntime: observerRegistry.observe,
    stop: async () => {
      if (isStopped) {
        return
      }
      isStopped = true
      listeners.clear()
      await Promise.allSettled([...writesInFlight])
      await Effect.runPromise(Scope.close(scope, Exit.void))
    },
  }
}
