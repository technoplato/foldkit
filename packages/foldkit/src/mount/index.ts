import { Context, Effect, Function, Predicate, Schema } from 'effect'

import type { MountResult } from '../html/index.js'

/** Effect service tag that observes Mount lifecycle events. The runtime
 *  provides an implementation that buffers events for DevTools history;
 *  the OnMount snabbdom hooks call `started` synchronously when an element
 *  with an OnMount attribute is inserted and `ended` when it is destroyed.
 *  Test renderers do not provide this service, since snabbdom hooks never
 *  fire in their VNode-only environment. */
export class MountTracker extends Context.Service<
  MountTracker,
  {
    readonly started: (name: string, args?: Record<string, unknown>) => void
    readonly ended: (name: string, args?: Record<string, unknown>) => void
  }
>()('@foldkit/MountTracker') {}

/** Type-level brand for MountDefinition values. */
/* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
export const MountDefinitionTypeId: unique symbol = Symbol.for(
  'foldkit/MountDefinition',
) as unknown as MountDefinitionTypeId

/** Type-level brand for MountDefinition values. */
export type MountDefinitionTypeId = typeof MountDefinitionTypeId

/** A named, type-constrained mount-time side effect with paired cleanup,
 *  optionally carrying the args used to construct it. The runtime invokes `f`
 *  with the live `Element` when the element mounts; the Effect resolves to a
 *  `{ message, cleanup }` record. The Message is dispatched and the cleanup is
 *  invoked automatically when the element unmounts. */
export type MountAction<Message, E = never> = Readonly<{
  name: string
  args?: Record<string, unknown>
  f: (element: Element) => Effect.Effect<MountResult<Message>, E>
}>

/** A Mount definition for a Mount with no declared args. Call as `Definition()` to produce a MountAction. */
export interface MountDefinitionNoArgs<Name extends string, ResultMessage> {
  readonly [MountDefinitionTypeId]: MountDefinitionTypeId
  readonly name: Name;
  (): Readonly<{
    name: Name
    f: (element: Element) => Effect.Effect<MountResult<ResultMessage>>
  }>
}

/** A Mount definition for a Mount with declared args. Call as `Definition(args)` to produce a MountAction. */
export interface MountDefinitionWithArgs<
  Name extends string,
  Fields extends Schema.Struct.Fields,
  ResultMessage,
> {
  readonly [MountDefinitionTypeId]: MountDefinitionTypeId
  readonly name: Name;
  (args: Schema.Schema.Type<Schema.Struct<Fields>>): Readonly<{
    name: Name
    args: Schema.Schema.Type<Schema.Struct<Fields>>
    f: (element: Element) => Effect.Effect<MountResult<ResultMessage>>
  }>
}

/** A Mount definition created with `Mount.define`. Union over the no-args and
 *  with-args shapes; consumers that only need name/identity can accept this. */
export type MountDefinition<
  Name extends string = string,
  ResultMessage = any,
> =
  | MountDefinitionNoArgs<Name, ResultMessage>
  | MountDefinitionWithArgs<Name, any, ResultMessage>

/**
 * Defines a Mount. Two forms, distinguished by whether the second argument is
 * a Schema (a result message) or a record of Schemas (the args declaration).
 *
 * The factory (or factory builder) is bound at definition time. The returned
 * Definition is callable: with no args for a Mount that doesn't declare any,
 * or with the declared args record otherwise.
 *
 * @example No args
 * ```ts
 * const FocusInput = Mount.define('FocusInput', CompletedFocusInput)(element =>
 *   Effect.sync(() => {
 *     if (element instanceof HTMLInputElement) element.focus()
 *     return { message: CompletedFocusInput(), cleanup: Function.constVoid }
 *   }),
 * )
 * // Call site:
 * OnMount(FocusInput())
 * ```
 *
 * @example With args
 * ```ts
 * const AnchorPopover = Mount.define(
 *   'AnchorPopover',
 *   { buttonId: S.String, anchor: AnchorConfig },
 *   CompletedAnchorPopover,
 * )(({ buttonId, anchor }) => element =>
 *   Effect.sync(() => {
 *     const cleanup = anchorSetup({ buttonId, anchor })(element)
 *     return { message: CompletedAnchorPopover(), cleanup }
 *   }),
 * )
 * // Call site:
 * AnchorPopover({ buttonId: `${id}-button`, anchor })
 * ```
 */
export function define<
  const Name extends string,
  Results extends ReadonlyArray<Schema.Top>,
>(
  name: Name,
  ...results: Results
): (
  factory: (
    element: Element,
  ) => Effect.Effect<
    MountResult<Schema.Schema.Type<Results[number]>>,
    never,
    never
  >,
) => MountDefinitionNoArgs<Name, Schema.Schema.Type<Results[number]>>

export function define<
  const Name extends string,
  Fields extends Schema.Struct.Fields,
  Results extends ReadonlyArray<Schema.Top>,
>(
  name: Name,
  args: Fields,
  ...results: Results
): (
  factoryBuilder: (
    args: Schema.Schema.Type<Schema.Struct<Fields>>,
  ) => (
    element: Element,
  ) => Effect.Effect<
    MountResult<Schema.Schema.Type<Results[number]>>,
    never,
    never
  >,
) => MountDefinitionWithArgs<Name, Fields, Schema.Schema.Type<Results[number]>>

export function define(name: string, ...rest: ReadonlyArray<unknown>): unknown {
  const [maybeArgs] = rest

  const isArgsRecord =
    Predicate.isObject(maybeArgs) && !Schema.isSchema(maybeArgs)

  if (isArgsRecord) {
    return (
      factoryBuilder: (
        args: any,
      ) => (element: Element) => Effect.Effect<any, any, any>,
    ): MountDefinitionWithArgs<string, any, any> => {
      const definition = (args: any) => ({
        name,
        args,
        f: factoryBuilder(args),
      })
      Object.defineProperty(definition, 'name', {
        value: name,
        configurable: true,
      })
      Object.defineProperty(definition, MountDefinitionTypeId, {
        value: MountDefinitionTypeId,
      })
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      return definition as MountDefinitionWithArgs<string, any, any>
    }
  }

  return (
    factory: (element: Element) => Effect.Effect<any, any, any>,
  ): MountDefinitionNoArgs<string, any> => {
    const definition = () => ({ name, f: factory })
    Object.defineProperty(definition, 'name', {
      value: name,
      configurable: true,
    })
    Object.defineProperty(definition, MountDefinitionTypeId, {
      value: MountDefinitionTypeId,
    })
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    return definition as MountDefinitionNoArgs<string, any>
  }
}

/** Lifts a `MountAction` from one Message universe to another by mapping its
 *  dispatched Message through a transform. Used by Submodel components to
 *  emit lifecycle action results into the parent's Message union via the
 *  consumer-supplied `toParentMessage` lift. Preserves `name` and `args`. */
export const mapMessage: {
  <A, B>(
    f: (message: A) => B,
  ): <E>(action: MountAction<A, E>) => MountAction<B, E>
  <A, B, E>(action: MountAction<A, E>, f: (message: A) => B): MountAction<B, E>
} = Function.dual(
  2,
  <A, B, E>(
    action: MountAction<A, E>,
    f: (message: A) => B,
  ): MountAction<B, E> => ({
    ...action,
    f: (element: Element) =>
      action.f(element).pipe(
        Effect.map(({ message, cleanup }) => ({
          message: f(message),
          cleanup,
        })),
      ),
  }),
)
