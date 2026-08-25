import { type Program, type ProgramCommand } from './program.js'
import type { Ports } from '../port/port.js'

// PROGRAM DECORATORS
//
// Higher-order functions that accept a Program and return a decorated
// Program. Decoration never changes the Message protocol, Model schema,
// or version: the wire contract is untouchable from the outside. What
// decorators may do is observe transitions or adjust commands leaving
// the composition.

/**
 * A pure transformation of one Program into another with identical
 * Model/Message types.
 */
export type ProgramDecorator<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = (
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
) => Program<Model, Message, Resources, ManagedResourceServices, P>

/** Everything one update transition produced, for observers. */
export interface UpdateTransition<
  Model,
  Message extends Readonly<{ _tag: string }>,
> {
  readonly model: Model
  readonly message: Message
  readonly nextModel: Model
}

/**
 * Observes every update transition without changing it.
 */
export const onUpdate =
  <
    Model,
    Message extends Readonly<{ _tag: string }>,
    Resources = never,
    ManagedResourceServices = never,
    P extends Ports | undefined = undefined,
  >(
    observe: (transition: UpdateTransition<Model, Message>) => void,
  ): ProgramDecorator<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  > =>
  program => ({
    ...program,
    update: (model, message) => {
      const next = program.update(model, message)
      observe({ model, message, nextModel: next[0] })
      return next
    },
  })

/**
 * Adjusts the Commands each transition emits — e.g. filtering in
 * resource-poor hosts, appending host-owned side effects, or tagging
 * commands for a specific surface. The Model transition is unchanged.
 */
export const mapCommands =
  <
    Model,
    Message extends Readonly<{ _tag: string }>,
    Resources = never,
    ManagedResourceServices = never,
    P extends Ports | undefined = undefined,
  >(
    adjust: (
      commands: ReadonlyArray<ProgramCommand<Message, Resources>>,
      nextModel: Model,
    ) => ReadonlyArray<ProgramCommand<Message, Resources>>,
  ): ProgramDecorator<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  > =>
  program => ({
    ...program,
    update: (model, message) => {
      const [nextModel, commands] = program.update(model, message)
      const adjusted = adjust(
        commands as ReadonlyArray<ProgramCommand<Message, Resources>>,
        nextModel,
      )
      return [nextModel, adjusted] as [
        Model,
        ReadonlyArray<ProgramCommand<Message, Resources>>,
      ]
    },
  })

/** Derives identity for hosting several instances of one Program shape. */
export const renamed =
  <
    Model,
    Message extends Readonly<{ _tag: string }>,
    Resources = never,
    ManagedResourceServices = never,
    P extends Ports | undefined = undefined,
  >(
    id: string,
  ): ProgramDecorator<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  > =>
  program => ({ ...program, id })

/**
 * Applies decorators left to right: decorate(program, a, b) === b(a(program)).
 */
export const decorate = <
  Model,
  Message extends Readonly<{ _tag: string }>,
>(
  program: Program<Model, Message>,
  ...decorators: ReadonlyArray<ProgramDecorator<Model, Message>>
): Program<Model, Message> =>
  decorators.reduce((acc, decorator) => decorator(acc), program)
