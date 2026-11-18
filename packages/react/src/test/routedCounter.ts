import { Match as M, Option, Schema as S } from 'effect'
import {
  ActionMenu,
  Catalog,
  Interaction,
  Navigation,
  Program,
  Route,
  Session,
} from 'foldkit'
import { Column, List, Row, Text, actionButtons } from 'foldkit/renderers'
import { ts } from 'foldkit/schema'

// PROGRAM

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'To count one more',
  meta: { label: '+', keys: ['+'] },
})
const catalog = Catalog.make([Increment])
type CounterMessage = typeof catalog.Message.Type

const Counter = ts('Counter')
type Counter = typeof Counter.Type

/** The count's history, a Drawer from the left at `/counter/history`: a list with a field that narrows it. */
const History = ts('History')
type History = typeof History.Type

/** What the count is for, a Drawer from the right at `/counter/about`: words and one button, no field. */
const About = ts('About')
type About = typeof About.Type

const historyScreen = () =>
  Column(
    {},
    List({
      label: 'History',
      filter: {
        placeholder: 'Find a count',
        label: 'Find a count in the history',
        emptyText: 'No count has that in its name.',
      },
      items: [
        { key: 'one', title: 'One', action: 'Increment' },
        { key: 'two', title: 'Two', action: 'Increment' },
      ],
    }),
  )

const aboutScreen = (model: Model) =>
  Column(
    {},
    Text('A count, for tests.'),
    Row({}, ...actionButtons(Catalog.entries(catalog, model))),
  )

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
      navigation: {
        ...Navigation.screens({
          slug: 'counter',
          root: Navigation.rootScreen(Counter, Route.here),
          screens: [
            Navigation.presentScreen(
              History,
              Route.literal('history'),
              Navigation.Drawer({ from: 'Left' }),
              { title: () => 'History' },
            ),
            Navigation.presentScreen(
              About,
              Route.literal('about'),
              Navigation.Drawer({ from: 'Right' }),
              { title: () => 'About' },
            ),
          ],
        }),
        viewOf: (model: Model, destination: Counter | History | About) =>
          M.value(destination).pipe(
            M.withReturnType<Option.Option<Navigation.EntryView>>(),
            M.tagsExhaustive({
              Counter: () => Option.none(),
              History: () =>
                Option.some(Navigation.screenView(historyScreen())),
              About: () =>
                Option.some(Navigation.screenView(aboutScreen(model))),
            }),
          ),
      },
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
