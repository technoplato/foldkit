import { Match as M, Option, Schema as S } from 'effect'

import * as ActionMenu from '../../actionMenu/actionMenu.js'
import * as Catalog from '../../catalog/catalog.js'
import { type ProgramHandle, bind } from '../../interaction/bind.js'
import * as Declaration from '../../navigation/declaration.js'
import { make } from '../../program/program.js'
import { Text } from '../../renderers/elements.js'
import * as Route from '../../route/parser.js'
import { ts } from '../../schema/index.js'
import * as Session from '../../session/session.js'

// PROGRAM

const CounterModel = S.Struct({ count: S.Number })
type CounterModel = typeof CounterModel.Type

/** Increments the count. Pressed with `+`. */
export const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+'] },
})

/** Resets the count. Pressed with `r`. */
export const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'The person wants to start over',
  meta: { label: 'Reset', keys: ['r'] },
})

const catalog = Catalog.make([Increment, Reset])
type CounterMessage = typeof catalog.Message.Type

/** The Counter page, the root at `/counter`. */
export const Counter = ts('Counter')
/** The Counter page. */
export type Counter = typeof Counter.Type

const counterNavigation = Declaration.screens({
  slug: 'counter',
  root: Declaration.rootScreen(Counter, Route.here, {
    title: () => 'Counter',
  }),
})

/** A Counter that declares its route at `/counter`. */
export const CounterProgram = make({
  id: 'navigable-counter',
  version: 1,
  Model: CounterModel,
  Message: catalog.Message,
  init: () => [{ count: 0 }, []],
  update: (model: CounterModel, message: CounterMessage) =>
    M.value(message).pipe(
      M.withReturnType<readonly [CounterModel, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        Increment: () => [{ count: model.count + 1 }, []],
        Reset: () => [{ count: 0 }, []],
      }),
    ),
  catalog,
  navigation: counterNavigation,
  screen: (model: CounterModel) => Text(String(model.count)),
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
  },
})

/** The routed Counter inside Session, with the action menu over both. */
export const App = ActionMenu.compose({
  of: Session.compose({ of: CounterProgram }),
})
/** The composed App Message. */
export type AppMessage = typeof App.Message.Type

/**
 * An in-memory handle that folds each sent Message synchronously and drops
 * Commands.
 */
export const handleOf = <Model, Message>(
  program: Readonly<{
    init: () => readonly [Model, ReadonlyArray<unknown>]
    update: (
      model: Model,
      message: Message,
    ) => readonly [Model, ReadonlyArray<unknown>]
  }>,
): ProgramHandle<Model, Message> => {
  let current = program.init()[0]
  const listeners = new Set<() => void>()
  return {
    readModel: () => current,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: message => {
      current = program.update(current, message)[0]
      listeners.forEach(listener => listener())
    },
    stop: () => Promise.resolve(),
  }
}

/** The App bound to a fresh in-memory handle. */
export const bindApp = () => bind(App, handleOf(App))

/** The URI the bound App's plan shows, or `no plan`. */
export const uriOf = (bound: ReturnType<typeof bindApp>): string =>
  Option.match(bound.navigation(), {
    onNone: () => 'no plan',
    onSome: plan => plan.uri,
  })
