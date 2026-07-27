import {
  Array,
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  Option,
  Record as Record_,
  Schema as S,
  Scope,
} from 'effect'
import type {
  ProgramRuntime,
  ProgramRuntimeEvent,
  ProgramRuntimeTimeline,
  SendOptions,
} from 'foldkit/program-runtime'

/** A named dependency implementation could not be acquired. */
export class DependencyStartupError extends S.TaggedErrorClass<DependencyStartupError>()(
  'DependencyStartupError',
  {
    cause: S.Defect(),
    dependency: S.String,
    implementation: S.String,
  },
) {}

/** The observable lifecycle of one host-selected dependency implementation. */
export type DependencyLifecycle<ImplementationName extends string> =
  | Readonly<{ _tag: 'Idle' }>
  | Readonly<{ _tag: 'Starting'; attempted: ImplementationName }>
  | Readonly<{ _tag: 'Ready'; current: ImplementationName }>
  | Readonly<{
      _tag: 'Switching'
      from: ImplementationName
      to: ImplementationName
    }>
  | Readonly<{
      _tag: 'Failed'
      current: Option.Option<ImplementationName>
      attempted: ImplementationName
      error: DependencyStartupError
    }>

/** A stable React-facing dependency selection snapshot. */
export type DependencySelection<ImplementationName extends string> = Readonly<{
  current: DependencyLifecycle<ImplementationName>
  switchTo: (implementation: ImplementationName) => void
}>

type AcquiredImplementation<
  ImplementationName extends string,
  Service,
> = Readonly<{
  name: ImplementationName
  scope: Scope.Closeable
  service: Service
}>

type DependencyActivity = Readonly<{
  attachTimeline: (timeline: ProgramRuntimeTimeline) => void
  isIdle: () => boolean
  observeIdle: (listener: () => void) => () => void
  recordSelection: (dependency: string, implementation: string) => void
  track: <Value, Error>(effect: Effect.Effect<Value, Error>) => void
}>

type DependencyStore<ImplementationName extends string> = Readonly<{
  read: () => DependencySelection<ImplementationName>
  subscribe: (listener: () => void) => () => void
}>

type ReplaySynchronizedDependency = Readonly<{
  name: string
  restore: (implementation: Option.Option<string>) => void
}>

/** One Provider-owned runtime for a named dependency choice. */
export type DependencyChoiceRuntime<
  ImplementationName extends string,
  ServiceIdentifier,
> = DependencyStore<ImplementationName> &
  Readonly<{
    layer: Layer.Layer<ServiceIdentifier, DependencyStartupError>
    name: string
    restore: (implementation: Option.Option<string>) => void
  }>

/** A typed catalog of Effect Layer implementations for one service. */
export type DependencyChoice<
  ImplementationName extends string,
  ServiceIdentifier,
> = Readonly<{
  initial: ImplementationName
  name: string
  makeRuntime: (
    owner: object,
    activity: DependencyActivity,
    onLifecycleChanged?: (
      lifecycle: DependencyLifecycle<ImplementationName>,
    ) => void,
  ) => DependencyChoiceRuntime<ImplementationName, ServiceIdentifier>
  storeFor: (owner: object) => DependencyStore<ImplementationName>
}>

/** The implementation names accepted by one dependency choice. */
export type DependencyChoiceName<Choice> =
  Choice extends DependencyChoice<infer ImplementationName, infer _Service>
    ? ImplementationName
    : never

/** One composed set of dependency choices owned by a Program client. */
export type DependencySet<ServiceIdentifier, Choices> = Readonly<{
  add: <ImplementationName extends string, AddedServiceIdentifier>(
    dependency: DependencyChoice<ImplementationName, AddedServiceIdentifier>,
  ) => DependencySet<
    ServiceIdentifier | AddedServiceIdentifier,
    Choices | DependencyChoice<ImplementationName, AddedServiceIdentifier>
  >
  makeRuntime: () => DependencySetRuntime<ServiceIdentifier>
  choices: ReadonlyArray<Choices>
}>

/** The Provider-owned runtime for a composed dependency set. */
export type DependencySetRuntime<ServiceIdentifier> = Readonly<{
  attachTimeline: (timeline: ProgramRuntimeTimeline) => void
  layer: Layer.Layer<ServiceIdentifier, DependencyStartupError>
  owner: object
  send: <Model, Message>(
    runtime: ProgramRuntime<Model, Message>,
    message: Message,
    options?: SendOptions,
  ) => void
  trackInitialization: <Model, Message>(
    runtime: ProgramRuntime<Model, Message>,
  ) => void
  track: <Value, Error>(effect: Effect.Effect<Value, Error>) => void
  synchronizeReplay: (
    runtimeEvents: ReadonlyArray<ProgramRuntimeEvent>,
    frame: number,
  ) => void
}>

const selectedImplementation = (
  runtimeEvents: ReadonlyArray<ProgramRuntimeEvent>,
  frame: number,
  dependency: string,
): Option.Option<string> =>
  Array.reduce(runtimeEvents, Option.none<string>(), (selected, event) => {
    if (
      event.name !== 'SelectedDependencyImplementation' ||
      event.afterFrame > frame ||
      event.attributes === undefined
    ) {
      return selected
    }
    const maybeDependency = Record_.get(event.attributes, 'dependency')
    const maybeImplementation = Record_.get(event.attributes, 'implementation')
    if (
      Option.isSome(maybeDependency) &&
      maybeDependency.value === dependency &&
      Option.isSome(maybeImplementation) &&
      typeof maybeImplementation.value === 'string'
    ) {
      return Option.some(maybeImplementation.value)
    }
    return selected
  })

const makeDependencyActivity = (): DependencyActivity => {
  const idleListeners = new Set<() => void>()
  let activeOperationCount = 0
  let maybeTimeline = Option.none<ProgramRuntimeTimeline>()
  let pendingSelections: ReadonlyArray<
    Readonly<{ dependency: string; implementation: string }>
  > = []

  const publishSelection = (
    timeline: ProgramRuntimeTimeline,
    dependency: string,
    implementation: string,
  ): void => {
    timeline.record({
      name: 'SelectedDependencyImplementation',
      attributes: { dependency, implementation },
    })
  }

  const recordSelection = (
    dependency: string,
    implementation: string,
  ): void => {
    if (Option.isSome(maybeTimeline)) {
      publishSelection(maybeTimeline.value, dependency, implementation)
    } else {
      pendingSelections = Array.append(pendingSelections, {
        dependency,
        implementation,
      })
    }
  }

  const attachTimeline = (timeline: ProgramRuntimeTimeline): void => {
    maybeTimeline = Option.some(timeline)
    Array.forEach(pendingSelections, selection => {
      publishSelection(timeline, selection.dependency, selection.implementation)
    })
    pendingSelections = []
  }

  const finishOperation = (): void => {
    activeOperationCount -= 1
    if (activeOperationCount === 0) {
      idleListeners.forEach(listener => listener())
    }
  }

  const track = <Value, Error>(effect: Effect.Effect<Value, Error>): void => {
    activeOperationCount += 1
    Effect.runCallback(effect, { onExit: finishOperation })
  }

  return {
    attachTimeline,
    isIdle: () => activeOperationCount === 0,
    observeIdle: listener => {
      idleListeners.add(listener)
      return () => {
        idleListeners.delete(listener)
      }
    },
    recordSelection,
    track,
  }
}

const dependencySetRuntime = <ServiceIdentifier>(
  owner: object,
  layer: Layer.Layer<ServiceIdentifier, DependencyStartupError>,
  activity: DependencyActivity,
  choices: ReadonlyArray<ReplaySynchronizedDependency>,
): DependencySetRuntime<ServiceIdentifier> => ({
  attachTimeline: activity.attachTimeline,
  layer,
  owner,
  send: (runtime, message, options) => {
    activity.track(runtime.run(message, options))
  },
  trackInitialization: runtime => {
    activity.attachTimeline(runtime.timeline)
    activity.track(runtime.initialization)
  },
  track: activity.track,
  synchronizeReplay: (runtimeEvents, frame) => {
    Array.forEach(choices, choice => {
      choice.restore(selectedImplementation(runtimeEvents, frame, choice.name))
    })
  },
})

type DependencySetBuild<ServiceIdentifier> = Readonly<{
  choices: ReadonlyArray<ReplaySynchronizedDependency>
  layer: Layer.Layer<ServiceIdentifier, DependencyStartupError>
}>

const makeDependencySet = <ServiceIdentifier, Choices>(
  choices: ReadonlyArray<Choices>,
  build: (
    owner: object,
    activity: DependencyActivity,
  ) => DependencySetBuild<ServiceIdentifier>,
): DependencySet<ServiceIdentifier, Choices> => ({
  add: dependency =>
    makeDependencySet(Array.append(choices, dependency), (owner, activity) => {
      const current = build(owner, activity)
      const added = dependency.makeRuntime(owner, activity)
      return {
        choices: Array.append(current.choices, added),
        layer: Layer.merge(current.layer, added.layer),
      }
    }),
  choices,
  makeRuntime: () => {
    const owner = {}
    const activity = makeDependencyActivity()
    const built = build(owner, activity)
    return dependencySetRuntime(owner, built.layer, activity, built.choices)
  },
})

/** Creates a dependency set from one switchable service. */
export const defineSingleDependencySet = <
  ImplementationName extends string,
  ServiceIdentifier,
>(
  dependency: DependencyChoice<ImplementationName, ServiceIdentifier>,
  onLifecycleChanged?: (
    lifecycle: DependencyLifecycle<ImplementationName>,
  ) => void,
): DependencySet<
  ServiceIdentifier,
  DependencyChoice<ImplementationName, ServiceIdentifier>
> =>
  makeDependencySet([dependency], (owner, activity) => {
    const runtime = dependency.makeRuntime(owner, activity, onLifecycleChanged)
    return { choices: [runtime], layer: runtime.layer }
  })

/** Creates one dependency set from two independently switchable services. */
export const defineDependencySet = <
  FirstImplementationName extends string,
  FirstServiceIdentifier,
  SecondImplementationName extends string,
  SecondServiceIdentifier,
>(
  first: DependencyChoice<FirstImplementationName, FirstServiceIdentifier>,
  second: DependencyChoice<SecondImplementationName, SecondServiceIdentifier>,
): DependencySet<
  FirstServiceIdentifier | SecondServiceIdentifier,
  | DependencyChoice<FirstImplementationName, FirstServiceIdentifier>
  | DependencyChoice<SecondImplementationName, SecondServiceIdentifier>
> => ({
  ...defineSingleDependencySet(first).add(second),
})

/** Declares the finite Effect Layers available for one host dependency. */
export const defineDependencyChoice = <
  ServiceIdentifier,
  Service extends object,
  const Implementations extends Readonly<
    Record<string, Layer.Layer<ServiceIdentifier, unknown>>
  >,
  Initial extends Extract<keyof Implementations, string>,
>(config: {
  readonly service: Context.Key<ServiceIdentifier, Service>
  readonly initial: Initial
  readonly implementations: Implementations
}): DependencyChoice<
  Extract<keyof Implementations, string>,
  ServiceIdentifier
> => {
  type ImplementationName = Extract<keyof Implementations, string>
  const runtimeByOwner = new WeakMap<
    object,
    DependencyChoiceRuntime<ImplementationName, ServiceIdentifier>
  >()
  const isImplementationName = (value: string): value is ImplementationName =>
    Object.hasOwn(config.implementations, value)

  const storeFor = (owner: object): DependencyStore<ImplementationName> => {
    const runtime = runtimeByOwner.get(owner)
    if (runtime === undefined) {
      throw new Error(
        `${config.service.key} is not part of the current dependency set`,
      )
    }
    return runtime
  }

  return {
    initial: config.initial,
    name: config.service.key,
    storeFor,
    makeRuntime: (owner, activity, onLifecycleChanged) => {
      const listeners = new Set<() => void>()
      let maybeCurrentImplementation =
        Option.none<AcquiredImplementation<ImplementationName, Service>>()
      let maybePendingImplementation = Option.none<ImplementationName>()
      let isSwitching = false
      let preferredImplementation: ImplementationName = config.initial
      let isRestoredSelection = false
      let lifecycle: DependencyLifecycle<ImplementationName> = { _tag: 'Idle' }
      let selection: DependencySelection<ImplementationName>

      const notify = (): void => {
        selection = { current: lifecycle, switchTo }
        listeners.forEach(listener => listener())
        try {
          onLifecycleChanged?.(lifecycle)
        } catch (error) {
          console.error(
            `[foldkit] ${config.service.key} lifecycle observer threw:`,
            error,
          )
        }
      }

      const implementationLayer = (
        name: ImplementationName,
      ): Layer.Layer<ServiceIdentifier, unknown> =>
        Option.getOrThrow(Record_.get(config.implementations, name))

      const startupError = (
        implementation: ImplementationName,
        cause: Cause.Cause<unknown>,
      ): DependencyStartupError =>
        new DependencyStartupError({
          cause: Cause.squash(cause),
          dependency: config.service.key,
          implementation,
        })

      const acquireImplementation = (
        name: ImplementationName,
      ): Effect.Effect<
        AcquiredImplementation<ImplementationName, Service>,
        DependencyStartupError
      > =>
        Effect.gen(function* () {
          const scope = yield* Scope.make()
          const context = yield* Layer.buildWithScope(
            implementationLayer(name),
            scope,
          ).pipe(
            Effect.catchCause(cause =>
              Cause.hasInterruptsOnly(cause)
                ? Effect.interrupt
                : Effect.fail(startupError(name, cause)),
            ),
            Effect.onExit(exit =>
              Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void,
            ),
          )
          return {
            name,
            scope,
            service: Context.get(context, config.service),
          }
        })

      const service = new Proxy<Service>(Object.create(null), {
        get: (_target, property, receiver) =>
          Reflect.get(
            Option.getOrThrow(maybeCurrentImplementation).service,
            property,
            receiver,
          ),
      })

      const completeSwitch = (
        attempted: ImplementationName,
        exit: Exit.Exit<
          AcquiredImplementation<ImplementationName, Service>,
          DependencyStartupError
        >,
      ): void => {
        isSwitching = false
        if (Exit.isSuccess(exit)) {
          maybeCurrentImplementation = Option.some(exit.value)
          preferredImplementation = exit.value.name
          lifecycle = { _tag: 'Ready', current: exit.value.name }
          activity.recordSelection(config.service.key, exit.value.name)
        } else if (!Cause.hasInterruptsOnly(exit.cause)) {
          const error = Cause.squash(exit.cause)
          lifecycle = {
            _tag: 'Failed',
            current: Option.map(
              maybeCurrentImplementation,
              implementation => implementation.name,
            ),
            attempted,
            error:
              error instanceof DependencyStartupError
                ? error
                : startupError(attempted, exit.cause),
          }
        }
        notify()
        maybeStartSwitch()
      }

      const performSwitch = (
        from: AcquiredImplementation<ImplementationName, Service>,
        to: ImplementationName,
      ): void => {
        isSwitching = true
        lifecycle = { _tag: 'Switching', from: from.name, to }
        notify()
        Effect.runCallback(
          Effect.gen(function* () {
            const nextImplementation = yield* acquireImplementation(to)
            yield* Scope.close(from.scope, Exit.void).pipe(
              Effect.onExit(exit =>
                Exit.isFailure(exit)
                  ? Scope.close(nextImplementation.scope, exit)
                  : Effect.void,
              ),
            )
            return nextImplementation
          }),
          { onExit: exit => completeSwitch(to, exit) },
        )
      }

      function maybeStartSwitch(): void {
        if (
          isSwitching ||
          !activity.isIdle() ||
          Option.isNone(maybePendingImplementation) ||
          Option.isNone(maybeCurrentImplementation)
        ) {
          return
        }
        const nextImplementation = maybePendingImplementation.value
        maybePendingImplementation = Option.none()
        if (nextImplementation === maybeCurrentImplementation.value.name) {
          lifecycle = {
            _tag: 'Ready',
            current: maybeCurrentImplementation.value.name,
          }
          notify()
        } else {
          performSwitch(maybeCurrentImplementation.value, nextImplementation)
        }
      }

      function switchTo(implementation: ImplementationName): void {
        preferredImplementation = implementation
        isRestoredSelection = false
        if (Option.isNone(maybeCurrentImplementation)) {
          maybePendingImplementation = Option.none()
          notify()
          return
        }
        maybePendingImplementation = Option.some(implementation)
        if (
          !activity.isIdle() &&
          Option.isSome(maybeCurrentImplementation) &&
          implementation !== maybeCurrentImplementation.value.name
        ) {
          lifecycle = {
            _tag: 'Switching',
            from: maybeCurrentImplementation.value.name,
            to: implementation,
          }
          notify()
        }
        maybeStartSwitch()
      }

      selection = { current: lifecycle, switchTo }
      activity.observeIdle(maybeStartSwitch)
      const layer = Layer.effect(
        config.service,
        Effect.gen(function* () {
          const implementation = preferredImplementation
          lifecycle = { _tag: 'Starting', attempted: implementation }
          notify()
          const initialImplementation = yield* acquireImplementation(
            implementation,
          ).pipe(
            Effect.tapError(error =>
              Effect.sync(() => {
                lifecycle = {
                  _tag: 'Failed',
                  current: Option.none(),
                  attempted: implementation,
                  error,
                }
                notify()
              }),
            ),
          )
          maybeCurrentImplementation = Option.some(initialImplementation)
          lifecycle = { _tag: 'Ready', current: implementation }
          if (!isRestoredSelection) {
            activity.recordSelection(config.service.key, implementation)
          }
          isRestoredSelection = false
          notify()
          maybeStartSwitch()
          yield* Effect.addFinalizer(exit =>
            Option.match(maybeCurrentImplementation, {
              onNone: () => Effect.void,
              onSome: implementation =>
                Scope.close(implementation.scope, exit).pipe(
                  Effect.ensuring(
                    Effect.sync(() => {
                      maybeCurrentImplementation = Option.none()
                      isSwitching = false
                      lifecycle = { _tag: 'Idle' }
                      notify()
                    }),
                  ),
                ),
            }),
          )
          return service
        }),
      )
      const runtime: DependencyChoiceRuntime<
        ImplementationName,
        ServiceIdentifier
      > = {
        layer,
        name: config.service.key,
        read: () => selection,
        restore: implementation => {
          if (Option.isSome(maybeCurrentImplementation)) {
            return
          }
          if (Option.isSome(implementation)) {
            if (isImplementationName(implementation.value)) {
              preferredImplementation = implementation.value
              isRestoredSelection = true
              maybePendingImplementation = Option.none()
            }
          } else {
            preferredImplementation = config.initial
            isRestoredSelection = false
            maybePendingImplementation = Option.none()
          }
        },
        subscribe: listener => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      }
      runtimeByOwner.set(owner, runtime)
      return runtime
    },
  }
}
