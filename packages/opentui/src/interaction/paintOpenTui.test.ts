import { describe, expect, it } from 'bun:test'
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
import { Column, Row, Text, actionButtons } from 'foldkit/renderers'
import { ts } from 'foldkit/schema'

import { createTestRenderer } from '@opentui/core/testing'

import {
  paintOpenTuiFrame,
  paintOpenTuiNavigationFrame,
} from './paintOpenTui.js'

const testScreenSize = { width: 72, height: 18 }

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+'] },
})
const Reset = Catalog.action('Reset', {
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

const App = ActionMenu.compose({
  of: Program.make({
    id: 'opentui-counter',
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
    navigation: Navigation.screens({
      root: Navigation.rootScreen(Counter, Route.here),
    }),
  }),
})

const interaction = Option.getOrThrow(Option.fromNullishOr(App.interaction))

const screenAt = (count: number) =>
  Column(
    {},
    Text(String(count)),
    Row({}, ...actionButtons(Catalog.entries(catalog, { count }))),
  )

const paintFrame = async (
  count: number,
  isMenuOpen: boolean,
): Promise<string> => {
  const { renderer, renderOnce, captureCharFrame } =
    await createTestRenderer(testScreenSize)
  const closed = { ...App.init()[0], count }
  const model = isMenuOpen
    ? App.update(closed, ActionMenu.OpenedActionMenu())[0]
    : closed
  renderer.root.add(
    paintOpenTuiFrame(
      renderer,
      Option.some(screenAt(count)),
      interaction.menu(model),
      {
        onPress: () => {},
        onChoose: () => {},
        onDismiss: () => {},
      },
    ),
  )
  await renderOnce()
  const frame = captureCharFrame()
  renderer.destroy()
  return frame
}

describe('paintOpenTuiFrame', () => {
  it('paints the screen with Catalog-hinted Buttons and disabled sentences', async () => {
    const frame = await paintFrame(0, false)
    expect(frame).toContain('0')
    expect(frame).toContain('+')
    expect(frame).toContain('Reset')
  })

  it('floats the presented action menu over the screen', async () => {
    const frame = await paintFrame(2, true)
    expect(frame).toContain('Actions')
    expect(frame).toContain('> Increment')
    expect(frame).toContain('Reset  Sets the count to 0')
  })
})

type Counter = typeof Counter.Type

const RoutedApp = ActionMenu.compose({
  of: Session.compose({
    of: Program.make({
      id: 'opentui-routed-counter',
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
      screen: (model: Model) => screenAt(model.count),
      navigation: Navigation.screens({
        slug: 'counter',
        root: Navigation.rootScreen(Counter, Route.here),
      }),
    }),
  }),
})

type RoutedModel = typeof RoutedApp.Model.Type
type RoutedMessage = typeof RoutedApp.Message.Type

const bindRouted = () => {
  let model: RoutedModel = RoutedApp.init()[0]
  return Interaction.bind<RoutedModel, RoutedMessage>(RoutedApp, {
    readModel: () => model,
    subscribe: () => () => {},
    send: message => {
      model = RoutedApp.update(model, message)[0]
    },
    stop: () => Promise.resolve(),
  })
}

describe('paintOpenTuiNavigationFrame', () => {
  it('paints where it is, the page beneath, and the menu over it', async () => {
    const bound = bindRouted()
    bound.openUri('/counter/session/menu?menu.q=re', Navigation.Link())
    const { renderer, renderOnce, captureCharFrame } =
      await createTestRenderer(testScreenSize)
    renderer.root.add(
      paintOpenTuiNavigationFrame(
        renderer,
        Option.getOrThrow(Navigation.frameOf(bound)),
        {
          onPress: () => {},
          onChoose: () => {},
          onDismiss: () => {},
        },
      ),
    )
    await renderOnce()
    const frame = captureCharFrame()
    renderer.destroy()
    expect(frame).toContain('/counter/session/menu?menu.q=re')
    expect(frame).toContain('Actions')
    expect(frame).toContain('> Reset')
  })
})
