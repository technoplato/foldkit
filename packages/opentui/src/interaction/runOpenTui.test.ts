import { describe, expect, it } from 'bun:test'
import { Array, Match as M, Option, Schema as S } from 'effect'
import {
  ActionMenu,
  Catalog,
  Interaction,
  Navigation,
  Program,
  Route,
  type Telemetry,
} from 'foldkit'
import { Column, Row, Text, actionButtons } from 'foldkit/renderers'
import { ts } from 'foldkit/schema'

import { createTestRenderer } from '@opentui/core/testing'

import { runOpenTui } from './runOpenTui.js'

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

const App = ActionMenu.compose({
  of: Program.make({
    id: 'opentui-painted-counter',
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
        Text(String(model.count)),
        Row({}, ...actionButtons(Catalog.entries(catalog, model))),
      ),
    navigation: Navigation.screens({
      root: Navigation.rootScreen(Counter, Route.here),
    }),
  }),
})

type AppModel = typeof App.Model.Type
type AppMessage = typeof App.Message.Type

const inMemoryHandle = (): Interaction.ProgramHandle<AppModel, AppMessage> => {
  const listeners = new Set<() => void>()
  const state = { model: App.init()[0] }
  return {
    readModel: () => state.model,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: message => {
      state.model = App.update(state.model, message)[0]
      listeners.forEach(listener => {
        listener()
      })
    },
    stop: () => Promise.resolve(),
  }
}

const eventually = async (isDone: () => boolean): Promise<void> => {
  const startedAt = Date.now()
  while (!isDone()) {
    if (Date.now() - startedAt > 4_000) {
      throw new Error('never happened')
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe('runOpenTui', () => {
  it('tells onPainted how long each frame took to build and what caused it', async () => {
    const setup = await createTestRenderer({ width: 72, height: 18 })
    const bound = Interaction.bind(App, inMemoryHandle())
    const reports: Array<Telemetry.RenderReport> = []
    const phases = () => Array.map(reports, report => report.phase)
    const finished = runOpenTui(bound, setup.renderer, {
      onPainted: report => {
        reports.push(report)
      },
    })
    setup.mockInput.pressKey('+')
    await eventually(() => Array.contains(phases(), 'key'))
    setup.mockInput.pressKey('q')
    await finished
    setup.renderer.destroy()
    expect(bound.readModel()).toMatchObject({ count: 1 })
    expect(Array.head(phases())).toEqual(Option.some('mount'))
    expect(Array.contains(phases(), 'update')).toBe(true)
    expect(
      Array.every(
        reports,
        report => report.painter === 'OpenTUI' && report.durationMs >= 0,
      ),
    ).toBe(true)
  })
})
