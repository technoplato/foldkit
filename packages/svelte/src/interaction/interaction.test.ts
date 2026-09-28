import { Match as M, Option, Schema as S } from 'effect'
import { ActionMenu, Catalog, Interaction, Program } from 'foldkit'
import {
  Column,
  Row,
  Text,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'
import { ts } from 'foldkit/schema'
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'

import ActionMenuDialog from './ActionMenuDialog.svelte'
import Screen from './Screen.svelte'
import { reactive } from './reactive.js'

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
    id: 'svelte-counter',
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
    screen: (model: Model): UiNode =>
      Column(
        {},
        Text(String(model.count)),
        Row({}, ...actionButtons(Catalog.entries(catalog, model))),
      ),
  }),
})
type AppModel = typeof App.Model.Type
type AppMessage = typeof App.Message.Type

const startCounter = (): Interaction.BoundInteraction<AppModel, AppMessage> => {
  const listeners = new Set<() => void>()
  let model: AppModel = App.init()[0]
  return Interaction.bind(App, {
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
  })
}

describe('reactive', () => {
  it('reads the bound Program and presses through it', () => {
    const counter = reactive(startCounter())
    expect(counter.status).toEqual(Interaction.Ready())
    expect(counter.bound.press('Increment')).toBe(true)
    expect(counter.model.count).toBe(1)
    counter.bound.openMenu()
    expect(Option.isSome(counter.menu)).toBe(true)
  })
})

describe('Screen', () => {
  it('paints the screen tree with a disabled Action and its sentence', () => {
    const { body } = render(Screen, {
      props: { program: reactive(startCounter()) },
    })
    expect(body).toContain('<div class="fk-text">0</div>')
    expect(body).toContain('data-action="Increment"')
    expect(body).toMatch(
      /<button[^>]*data-action="Reset"[^>]*disabled[^>]*title="count is already 0"/,
    )
  })

  it('appends caller classes after the fk-* base class', () => {
    const { body } = render(Screen, {
      props: {
        program: reactive(startCounter()),
        classNames: { Text: 'text-7xl' },
      },
    })
    expect(body).toContain('<div class="fk-text text-7xl">0</div>')
  })
})

describe('ActionMenuDialog', () => {
  it('renders nothing while the Model presents no menu', () => {
    const { body } = render(ActionMenuDialog, {
      props: { program: reactive(startCounter()) },
    })
    expect(body).not.toContain('role="dialog"')
  })

  it('renders the presented menu as a combo box of Catalog rows', () => {
    const counter = reactive(startCounter())
    counter.bound.openMenu()
    const { body } = render(ActionMenuDialog, { props: { program: counter } })
    expect(body).toContain('role="dialog"')
    expect(body).toContain('role="combobox"')
    expect(body).toContain('Increments the count by one')
    expect(body).toContain('count is already 0')
  })
})
