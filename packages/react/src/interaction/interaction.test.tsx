import { Match as M, Schema as S } from 'effect'
import { ActionMenu, Catalog, Interaction, Program } from 'foldkit'
import { Column, Row, Text, actionButtons } from 'foldkit/renderers'
import { ts } from 'foldkit/schema'
import { afterEach, describe, expect, it } from 'vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  ActionButton,
  ActionButtons,
  ActionMenuDialog,
  ProgramProvider,
  Screen,
  useKeyBindings,
} from './interaction.js'

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

const CounterProgram = Program.make({
  id: 'react-counter',
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
})

const App = ActionMenu.compose({ of: CounterProgram })
type AppModel = typeof App.Model.Type
type AppMessage = typeof App.Message.Type

const makeHandle = (): Interaction.ProgramHandle<AppModel, AppMessage> => {
  const listeners = new Set<() => void>()
  let model = App.init()[0]
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

const KeyBindings = () => {
  useKeyBindings()
  return null
}

const renderApp = () => {
  const bound = Interaction.bind(App, makeHandle())
  render(
    <ProgramProvider bound={bound}>
      <KeyBindings />
      <Screen />
      <ActionMenuDialog />
    </ProgramProvider>,
  )
  return bound
}

afterEach(() => {
  cleanup()
})

describe('@foldkit/react/interaction', () => {
  it('paints the screen and presses Actions from its buttons', () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('shows the disabled sentence on a Disabled Action', () => {
    renderApp()
    const reset = screen.getByRole('button', { name: 'Reset' })
    expect(reset.hasAttribute('disabled')).toBe(true)
    expect(reset.getAttribute('title')).toBe('count is already 0')
  })

  it('opens the action menu on Cmd-K and chooses with Enter', () => {
    const bound = renderApp()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog', { name: 'Actions' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'incr' },
    })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.queryByRole('dialog')).toBeNull()
    const model = bound.readModel()
    expect(model.count).toBe(1)
  })

  it('renders standalone Action buttons with key hints', () => {
    const bound = Interaction.bind(App, makeHandle())
    render(
      <ProgramProvider bound={bound}>
        <ActionButton tag="Increment">Add one</ActionButton>
        <ActionButtons className="all" />
      </ProgramProvider>,
    )
    const addOne = screen.getByRole('button', { name: 'Add one' })
    expect(addOne.getAttribute('aria-keyshortcuts')).toBe('+')
    act(() => {
      fireEvent.click(addOne)
    })
    expect(bound.readModel().count).toBe(1)
  })
})
