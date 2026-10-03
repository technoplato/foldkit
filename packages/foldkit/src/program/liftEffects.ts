import { Record } from 'effect'

import type { ManagedResources } from '../managedResource/managedResource.js'
import * as Subscription from '../subscription/subscription.js'
import type { Subscriptions } from '../subscription/subscription.js'

// LIFT

/** The Subscriptions and ManagedResources a Program declares. */
export type ProgramEffects<Model> = Readonly<{
  subscriptions?: Subscriptions<Model, any, any>
  managedResources?: ManagedResources<Model, any, any>
}>

/**
 * A child Program's Subscriptions and ManagedResources, read through the
 * Model a combinator wraps it in, so a child keeps its clock or socket
 * inside `Session.compose`, `ActionMenu.compose`, and `compose.sync`. The
 * child's Messages pass through unchanged, because every combinator's
 * Message union already holds them.
 *
 * @example
 * ```typescript
 * make({ ...fields, ...liftEffects(child, childOf) })
 * // a Player's `tick` Subscription keeps running inside Session.compose
 * ```
 */
export const liftEffects = <ParentModel, ChildModel>(
  child: ProgramEffects<ChildModel>,
  childOf: (model: ParentModel) => ChildModel,
): ProgramEffects<ParentModel> => ({
  ...(child.subscriptions === undefined
    ? {}
    : {
        subscriptions: Subscription.lift(child.subscriptions)<
          ParentModel,
          unknown
        >({
          toChildModel: childOf,
          toParentMessage: message => message,
        }),
      }),
  ...(child.managedResources === undefined
    ? {}
    : {
        managedResources: Record.map(child.managedResources, resource => ({
          ...resource,
          modelToMaybeRequirements: (model: ParentModel) =>
            resource.modelToMaybeRequirements(childOf(model)),
        })),
      }),
})
