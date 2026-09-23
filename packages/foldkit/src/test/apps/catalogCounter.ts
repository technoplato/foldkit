import { Match as M, Option, Schema as S } from 'effect'

import * as ActionMenu from '../../actionMenu/actionMenu.js'
import * as Catalog from '../../catalog/catalog.js'
import { type ProgramHandle, bind } from '../../interaction/bind.js'
import { make } from '../../program/program.js'
import { Column, Row, Text, actionButtons } from '../../renderers/elements.js'
import { ts } from '../../schema/index.js'

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

/** Increments the count. Pressed with `+`. */
export const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+'] },
})

/** Resets the count. Disabled at 0 with the sentence `count is already 0`. */
export const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'The person wants to start over',
  enabled: (model: Model) =>
    model.count === 0
      ? Catalog.Disabled({ because: 'count is already 0' })
      : Catalog.Enabled(),
  meta: { label: 'Reset', keys: ['r'] },
})

const catalog = Catalog.make([Increment, Reset])
type CounterMessage = typeof catalog.Message.Type

const Counter = ts('Counter')

/** A two-Action Counter with the action menu composed over it. */
export const App = ActionMenu.compose({
  of: make({
    id: 'catalog-counter',
    version: 1,
    Model,
    Message: catalog.Message,
    init: () => [{ count: 0 }, []],
    update: (model: Model, message: CounterMessage) =>
      M.value(message).pipe(
        M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
        M.tagsExhaustive({
          Increment: () => [{ count: model.count + 1 }, []],
          Reset: () => [{ count: 0 }, []],
        }),
      ),
    catalog,
    navigation: { Destination: Counter, root: Counter() },
    screen: (model: Model) =>
      Column(
        {},
        Text(String(model.count)),
        Row({}, ...actionButtons(Catalog.entries(catalog, model))),
      ),
  }),
})
/** The composed Counter Model: the count plus its navigation stack. */
export type AppModel = typeof App.Model.Type
/** The composed Counter Message: Actions plus action menu Messages. */
export type AppMessage = typeof App.Message.Type

/** The composed Counter's interaction. */
export const appInteraction = Option.getOrThrowWith(
  Option.fromNullishOr(App.interaction),
  () => new Error('ActionMenu.compose must produce an interaction'),
)

/**
 * An in-memory handle that folds each sent Message synchronously, starting
 * at `count`.
 */
export const makeHandle = (count = 0): ProgramHandle<AppModel, AppMessage> => {
  const listeners = new Set<() => void>()
  let model: AppModel = { ...App.init()[0], count }
  return {
    readModel: () => model,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: message => {
      model = App.update(model, message)[0]
      listeners.forEach(listener => {
        listener()
      })
    },
    stop: () => Promise.resolve(),
  }
}

/** A bound Counter starting at `count`. */
export const bindCounter = (count = 0) => bind(App, makeHandle(count))
