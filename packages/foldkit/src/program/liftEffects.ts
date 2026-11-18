import { Option, Record, Schema, Stream } from 'effect'

import type { ManagedResources } from '../managedResource/managedResource.js'
import type {
  Subscription,
  Subscriptions,
} from '../subscription/subscription.js'

// LIFT

/** The Subscriptions and ManagedResources a Program declares. */
export type ProgramEffects<Model> = Readonly<{
  subscriptions?: Subscriptions<Model, any, any>
  managedResources?: ManagedResources<Model, any, any>
}>

const liftSubscription = <ParentModel, ChildModel>(
  subscription: Subscription<ChildModel, any, any, any>,
  maybeChildOf: (model: ParentModel) => Option.Option<ChildModel>,
): Subscription<ParentModel, any, any, any> => {
  const modelToDependencies = (model: ParentModel) =>
    Option.map(maybeChildOf(model), subscription.modelToDependencies)
  const toStream = (
    maybeDependencies: Option.Option<unknown>,
    readDependencies: () => Option.Option<unknown>,
  ) =>
    Option.match(maybeDependencies, {
      onNone: () => Stream.empty,
      onSome: dependencies =>
        subscription.keepAliveEquivalence === undefined
          ? subscription.dependenciesToStream(dependencies)
          : subscription.dependenciesToStream(dependencies, () =>
              Option.getOrElse(readDependencies(), () => dependencies),
            ),
    })
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  return {
    dependenciesSchema: Schema.Struct({
      maybeDependencies: Schema.Option(subscription.dependenciesSchema),
    }),
    modelToDependencies: (model: ParentModel) => ({
      maybeDependencies: modelToDependencies(model),
    }),
    ...(subscription.keepAliveEquivalence === undefined
      ? {
          dependenciesToStream: (
            lifted: Readonly<{ maybeDependencies: Option.Option<unknown> }>,
          ) =>
            toStream(lifted.maybeDependencies, () => lifted.maybeDependencies),
        }
      : {
          keepAliveEquivalence: (
            self: Readonly<{ maybeDependencies: Option.Option<unknown> }>,
            that: Readonly<{ maybeDependencies: Option.Option<unknown> }>,
          ) =>
            Option.makeEquivalence(subscription.keepAliveEquivalence)(
              self.maybeDependencies,
              that.maybeDependencies,
            ),
          dependenciesToStream: (
            lifted: Readonly<{ maybeDependencies: Option.Option<unknown> }>,
            readLifted: () => Readonly<{
              maybeDependencies: Option.Option<unknown>
            }>,
          ) =>
            toStream(
              lifted.maybeDependencies,
              () => readLifted().maybeDependencies,
            ),
        }),
    ...(subscription.source === undefined
      ? {}
      : { source: subscription.source }),
  } as unknown as Subscription<ParentModel, any, any, any>
}

/**
 * A child Program's Subscriptions and ManagedResources, read through the
 * Model a combinator wraps it in, so a child keeps its clock or socket
 * inside `Session.compose`, `ActionMenu.compose`, and `compose.sync`. While
 * `maybeChildOf` is None, such as a synced Program still Starting, the
 * child's Subscriptions run nothing and its resources stay released, so
 * nothing it sends is dropped before the child exists. The child's
 * Messages pass through unchanged, because every combinator's Message
 * union already holds them.
 *
 * @example
 * ```typescript
 * make({ ...fields, ...liftEffects(child, model => Option.some(childOf(model))) })
 * // a Player's `tick` Subscription keeps running inside Session.compose
 * ```
 */
export const liftEffects = <ParentModel, ChildModel>(
  child: ProgramEffects<ChildModel>,
  maybeChildOf: (model: ParentModel) => Option.Option<ChildModel>,
): ProgramEffects<ParentModel> => ({
  ...(child.subscriptions === undefined
    ? {}
    : {
        subscriptions: Record.map(child.subscriptions, subscription =>
          liftSubscription(subscription, maybeChildOf),
        ),
      }),
  ...(child.managedResources === undefined
    ? {}
    : {
        managedResources: Record.map(child.managedResources, resource => ({
          ...resource,
          modelToMaybeRequirements: (model: ParentModel) =>
            Option.flatMap(maybeChildOf(model), childModel =>
              resource.modelToMaybeRequirements(childModel),
            ),
        })),
      }),
})
