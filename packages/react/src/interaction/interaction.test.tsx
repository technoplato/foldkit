import { Array, Match as M, Schema as S } from 'effect'
import {
  ActionMenu,
  Catalog,
  Interaction,
  Navigation,
  Program,
  Route,
} from 'foldkit'
import { Column, Row, Text, actionButtons } from 'foldkit/renderers'
import { ts } from 'foldkit/schema'
import { Profiler, type ReactNode } from 'react'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  ActionButton,
  ActionButtons,
  ActionMenuDialog,
  type ActionsOf,
  ProgramProvider,
  Screen,
  useActions,
  useFeature,
  useKeyBindings,
  useModel,
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
  navigation: Navigation.screens({
    root: Navigation.rootScreen(Counter, Route.here),
  }),
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

  it('paints the menu the Program describes: marks, summary, keys, and hints', () => {
    renderApp()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const search = screen.getByRole('combobox', { name: 'Search actions' })
    fireEvent.change(search, { target: { value: 'e' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(
      Array.map(options, option =>
        Array.map(
          Array.fromIterable(option.querySelectorAll('mark')),
          mark => mark.textContent,
        ),
      ),
    ).toEqual([['e'], ['e']])
    expect(screen.getByRole('status').textContent).toBe('2 actions')
    expect(search.getAttribute('aria-activedescendant')).toBe(
      'fk-action-menu-Increment',
    )
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(search.getAttribute('aria-activedescendant')).toBe(
      'fk-action-menu-Reset',
    )
    expect(
      document.querySelector('.fk-action-menu-footer')?.textContent,
    ).toContain('back to search')
    expect(
      Array.some(
        Array.fromIterable(document.head.querySelectorAll('style')),
        style => (style.textContent ?? '').includes('.fk-action-menu'),
      ),
    ).toBe(true)
  })

  it('closes the menu on a click outside it', () => {
    renderApp()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const backdrop = document.querySelector('.fk-action-menu-backdrop')
    if (backdrop === null) {
      throw new Error('The menu has no backdrop')
    }
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders typed Action buttons with key hints', () => {
    const bound = Interaction.bind(App, makeHandle())
    const Standalone = () => {
      const actions = useActions(App)
      return (
        <>
          <ActionButton action={actions.increment}>Add one</ActionButton>
          <ActionButtons className="all" />
        </>
      )
    }
    render(
      <ProgramProvider bound={bound}>
        <Standalone />
      </ProgramProvider>,
    )
    const addOne = screen.getByRole('button', { name: 'Add one' })
    expect(addOne.getAttribute('aria-keyshortcuts')).toBe('+')
    act(() => {
      fireEvent.click(addOne)
    })
    expect(bound.readModel().count).toBe(1)
  })

  it('types Actions from the Catalog the Program declares', () => {
    expectTypeOf<keyof ActionsOf<typeof App>>().toEqualTypeOf<
      'increment' | 'reset'
    >()
  })

  it('refuses a provider bound to a different Program', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ReadsCounterProgram = () => {
      useModel(CounterProgram)
      return null
    }
    expect(() =>
      render(
        <ProgramProvider bound={Interaction.bind(App, makeHandle())}>
          <ReadsCounterProgram />
        </ProgramProvider>,
      ),
    ).toThrow(
      'The nearest ProgramProvider binds actionMenu:react-counter, not react-counter',
    )
    quiet.mockRestore()
  })
})

describe('referential integrity', () => {
  const renderCounted = (children: ReactNode) => {
    const bound = Interaction.bind(App, makeHandle())
    render(<ProgramProvider bound={bound}>{children}</ProgramProvider>)
    return bound
  }

  it('re-renders a selection only when its value changes', () => {
    const counts: Array<number> = []
    const Count = () => {
      counts.push(useModel(App, model => model.count))
      return null
    }
    const bound = renderCounted(<Count />)
    act(() => {
      bound.openMenu()
    })
    act(() => {
      bound.typeInMenu('res')
    })
    expect(counts).toEqual([0])
    act(() => {
      bound.press('Increment')
    })
    expect(counts).toEqual([0, 1])
  })

  it('keeps the typed Actions until an availability changes', () => {
    const seen: Array<ActionsOf<typeof App>> = []
    const Actions = () => {
      seen.push(useActions(App))
      return null
    }
    const bound = renderCounted(<Actions />)
    act(() => {
      bound.openMenu()
    })
    expect(seen).toHaveLength(1)
    act(() => {
      bound.dismissMenu()
      bound.press('Increment')
    })
    expect(seen).toHaveLength(2)
    expect(seen.at(-1)?.reset.isEnabled).toBe(true)
    act(() => {
      bound.press('Increment')
    })
    expect(seen).toHaveLength(2)
  })

  it('does not repaint the Screen when only the menu moves', () => {
    const commits: Array<string> = []
    const bound = renderCounted(
      <Profiler
        id="screen"
        onRender={(_id, phase) => {
          commits.push(phase)
        }}
      >
        <Screen />
      </Profiler>,
    )
    act(() => {
      bound.openMenu()
    })
    act(() => {
      bound.typeInMenu('incr')
    })
    expect(commits).toEqual(['mount'])
    act(() => {
      bound.dismissMenu()
      bound.press('Increment')
    })
    expect(commits).toEqual(['mount', 'update'])
  })

  it('returns the selection and the Actions together', () => {
    const features: Array<
      Readonly<{ count: number; isResetEnabled: boolean }>
    > = []
    const Feature = () => {
      const { model, actions } = useFeature(App, model => model.count)
      features.push({ count: model, isResetEnabled: actions.reset.isEnabled })
      return null
    }
    const bound = renderCounted(<Feature />)
    act(() => {
      bound.press('Increment')
    })
    expect(features).toEqual([
      { count: 0, isResetEnabled: false },
      { count: 1, isResetEnabled: true },
    ])
  })
})
