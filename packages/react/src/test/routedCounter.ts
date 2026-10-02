import { Match as M, Schema as S } from 'effect'
import {
  ActionMenu,
  Catalog,
  Interaction,
  Navigation,
  Program,
  Route,
  Session,
} from 'foldkit'
import { Column, Row, Text, actionButtons } from 'foldkit/renderers'
import { ts } from 'foldkit/schema'

// PROGRAM

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+'] },
})
const catalog = Catalog.make([Increment])
type CounterMessage = typeof catalog.Message.Type

const Counter = ts('Counter')
type Counter = typeof Counter.Type

/** A Counter at `/counter`, inside Session, with the action menu over it. */
export const RoutedApp = ActionMenu.compose({
  of: Session.compose({
    of: Program.make({
      id: 'react-routed-counter',
      version: 1,
      Model,
      Message: catalog.Message,
      init: () => [{ count: 0 }, []],
      update: (model: Model, message: CounterMessage) =>
        M.value(message).pipe(
          M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
          M.tagsExhaustive({
            Increment: () => [{ count: model.count + 1 }, []],
          }),
        ),
      catalog,
      screen: (model: Model) =>
        Column(
          {},
          Text(`count ${model.count}`),
          Text('Session settings', { href: '/counter/session' }),
          Row({}, ...actionButtons(Catalog.entries(catalog, model))),
        ),
      navigation: Navigation.make<Model, Counter>({
        slug: Navigation.Slug.make('counter'),
        Destination: Counter,
        root: Counter(),
        routes: [
          Navigation.rootRoute(
            Route.caseOf(
              Route.here,
              Navigation.tagCase<Counter, Counter>(S.is(Counter), Counter),
            ),
          ),
        ],
      }),
    }),
  }),
})
type RoutedModel = typeof RoutedApp.Model.Type
type RoutedMessage = typeof RoutedApp.Message.Type

/** The routed App bound to an in-memory handle that notifies on every send. */
export const bindRouted = (): Interaction.BoundInteraction<
  RoutedModel,
  RoutedMessage
> => {
  const listeners = new Set<() => void>()
  let model: RoutedModel = RoutedApp.init()[0]
  return Interaction.bind<RoutedModel, RoutedMessage>(RoutedApp, {
    readModel: () => model,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: message => {
      model = RoutedApp.update(model, message)[0]
      listeners.forEach(listener => listener())
    },
    stop: () => Promise.resolve(),
  })
}
