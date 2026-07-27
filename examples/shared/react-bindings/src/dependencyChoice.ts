import {
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
import type { ProgramRuntime, SendOptions } from 'foldkit/program-runtime'

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

/** One Provider-owned runtime for a named dependency choice. */
export type DependencyChoiceRuntime<
  ImplementationName extends string,
  ServiceIdentifier,
> = Readonly<{
  layer: Layer.Layer<ServiceIdentifier, DependencyStartupError>
  read: () => DependencySelection<ImplementationName>
  send: <Model, Message>(
    runtime: ProgramRuntime<Model, Message>,
    message: Message,
    options?: SendOptions,
  ) => void
  subscribe: (listener: () => void) => () => void
  trackInitialization: <Model, Message>(
    runtime: ProgramRuntime<Model, Message>,
  ) => void
}>

/** A typed catalog of Effect Layer implementations for one service. */
export type DependencyChoice<
  ImplementationName extends string,
  ServiceIdentifier,
> = Readonly<{
  initial: ImplementationName
  name: string
  makeRuntime: (
    onLifecycleChanged?: (
      lifecycle: DependencyLifecycle<ImplementationName>,
    ) => void,
  ) => DependencyChoiceRuntime<ImplementationName, ServiceIdentifier>
}>

/** The implementation names accepted by one dependency choice. */
export type DependencyChoiceName<Choice> =
  Choice extends DependencyChoice<infer ImplementationName, infer _Service>
    ? ImplementationName
    : never

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
> => ({
  initial: config.initial,
  name: config.service.key,
  makeRuntime: onLifecycleChanged => {
    type ImplementationName = Extract<keyof Implementations, string>
    const listeners = new Set<() => void>()
    let maybeCurrentImplementation =
      Option.none<AcquiredImplementation<ImplementationName, Service>>()
    let maybePendingImplementation = Option.none<ImplementationName>()
    let activeOperationCount = 0
    let isSwitching = false
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

    const finishOperation = (): void => {
      activeOperationCount -= 1
      maybeStartSwitch()
    }

    const track = <Value, Error>(effect: Effect.Effect<Value, Error>): void => {
      activeOperationCount += 1
      Effect.runCallback(effect, {
        onExit: finishOperation,
      })
    }

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
        lifecycle = { _tag: 'Ready', current: exit.value.name }
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
        {
          onExit: exit => completeSwitch(to, exit),
        },
      )
    }

    function maybeStartSwitch(): void {
      if (
        isSwitching ||
        activeOperationCount !== 0 ||
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
      maybePendingImplementation = Option.some(implementation)
      if (
        activeOperationCount !== 0 &&
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

    const layer = Layer.effect(
      config.service,
      Effect.gen(function* () {
        lifecycle = { _tag: 'Starting', attempted: config.initial }
        notify()
        const initialImplementation = yield* acquireImplementation(
          config.initial,
        ).pipe(
          Effect.tapError(error =>
            Effect.sync(() => {
              lifecycle = {
                _tag: 'Failed',
                current: Option.none(),
                attempted: config.initial,
                error,
              }
              notify()
            }),
          ),
        )
        maybeCurrentImplementation = Option.some(initialImplementation)
        lifecycle = { _tag: 'Ready', current: config.initial }
        notify()
        yield* Effect.addFinalizer(exit =>
          Option.match(maybeCurrentImplementation, {
            onNone: () => Effect.void,
            onSome: implementation => Scope.close(implementation.scope, exit),
          }),
        )
        return service
      }),
    )

    return {
      layer,
      read: () => selection,
      send: (runtime, message, options) => {
        track(runtime.run(message, options))
      },
      subscribe: listener => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      trackInitialization: runtime => {
        track(runtime.initialization)
      },
    }
  },
})
