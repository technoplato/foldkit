import { Match as M, Option, Schema as S } from 'effect'
import {
  ActionMenu,
  Catalog,
  Declaration,
  Interaction,
  Navigation,
  Program,
  Route,
} from 'foldkit'
import { Text } from 'foldkit/renderers'
import { ts } from 'foldkit/schema'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'

import { act, cleanup, render, screen } from '@testing-library/react'

import { type CallsOf, ProgramProvider, useCalls } from './interaction.js'

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const countLimit = 100

const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'To start over',
  meta: { label: 'Reset', keys: ['r'] },
})

const SetCount = Catalog.action('SetCount', {
  fields: { count: S.Number },
  choose: {
    field: 'count',
    prompt: 'Which number?',
    token: S.FiniteFromString,
    choicesOf: () => [],
    accepts: (_model: Model, count: number) =>
      count <= countLimit
        ? Catalog.Enabled()
        : Catalog.Disabled({ because: 'that is past 100' }),
    nothingToChoose: 'type a number',
  },
  what: 'Sets the count to a chosen number',
  why: 'To start from a number the user has in mind',
  enabled: (model: Model) =>
    model.count < 0
      ? Catalog.Disabled({ because: 'the count is broken' })
      : Catalog.Enabled(),
  meta: { label: 'Set', keys: [], title: 'Set the count' },
})

const catalog = Catalog.make([Reset, SetCount])
type CounterMessage = typeof catalog.Message.Type

const Counter = ts('Counter')

const makeProgram = (startAt: number) =>
  ActionMenu.compose({
    of: Program.make({
      id: 'react-calls',
      version: 1,
      Model,
      Message: catalog.Message,
      init: () => [{ count: startAt }, []],
      update: (_model: Model, message: CounterMessage) =>
        M.value(message).pipe(
          M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
          M.tagsExhaustive({
            Reset: () => [{ count: 0 }, []],
            SetCount: ({ count }) => [{ count }, []],
          }),
        ),
      catalog,
      navigation: Navigation.screens({
        root: Navigation.rootScreen(Counter, Route.here),
      }),
      screen: (model: Model) => Text(String(model.count)),
    }),
  })

const App = makeProgram(0)
type AppModel = typeof App.Model.Type
type AppMessage = typeof App.Message.Type

const makeHandle = (
  program: typeof App,
): Interaction.ProgramHandle<AppModel, AppMessage> => {
  const listeners = new Set<() => void>()
  let model = program.init()[0]
  return {
    readModel: () => model,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: message => {
      model = program.update(model, message)[0]
      listeners.forEach(listener => {
        listener()
      })
    },
    stop: () => Promise.resolve(),
  }
}

type Calls = CallsOf<typeof App>

const mount = (program: typeof App = App) => {
  const bound = Interaction.bind(program, makeHandle(program))
  const seen: Array<Calls> = []
  const Form = () => {
    const calls = useCalls(program)
    seen.push(calls)
    return (
      <input
        {...calls.setCount.props}
        onChange={() => {}}
        value={String(bound.readModel().count)}
      />
    )
  }
  render(
    <ProgramProvider bound={bound}>
      <Form />
    </ProgramProvider>,
  )
  return {
    bound,
    calls: (): Calls => {
      const newest = seen.at(-1)
      if (newest === undefined) {
        throw new Error('The form never rendered')
      }
      return newest
    },
  }
}

afterEach(cleanup)

describe('useCalls', () => {
  it('types each Action that takes fields by those fields, from the Catalog', () => {
    expectTypeOf<keyof Calls>().toEqualTypeOf<'setCount'>()
    expectTypeOf<Parameters<Calls['setCount']['call']>[0]>().toEqualTypeOf<
      Readonly<{ count: number }>
    >()
  })

  it('sends the Action with the typed fields', () => {
    const { bound, calls } = mount()
    act(() => {
      expect(calls().setCount.call({ count: 7 })).toBe(true)
    })
    expect(bound.readModel().count).toBe(7)
  })

  it('is held to the Action’s own rule, as a menu and a terminal are', () => {
    const { bound, calls } = mount()
    act(() => {
      expect(calls().setCount.call({ count: 101 })).toBe(false)
    })
    expect(bound.readModel().count).toBe(0)
  })

  it('checks what a form holds with the sentence every Client gives', () => {
    const { calls } = mount()
    const declaration = Catalog.declarationOf(SetCount)
    const sentenceOf = (said: Readonly<Record<string, unknown>>) => {
      const parsed = Declaration.parse(declaration, said)
      return parsed._tag === 'Refused'
        ? Option.some(parsed.sentence)
        : Option.none()
    }
    expect(calls().setCount.check({ count: 7 })).toEqual(Option.none())
    expect(Option.isSome(calls().setCount.check({}))).toBe(true)
    expect(calls().setCount.check({})).toEqual(sentenceOf({}))
    expect(calls().setCount.check({ count: 'seven' })).toEqual(
      sentenceOf({ count: 'seven' }),
    )
    expect(calls().setCount.check({ total: 7 })).toEqual(
      sentenceOf({ total: 7 }),
    )
  })

  it('names and describes its control from the declaration', () => {
    mount()
    const input = screen.getByRole('textbox', { name: 'Set the count' })
    expect(input.getAttribute('aria-description')).toBe(SetCount.what)
    expect(input.getAttribute('data-hint-why')).toBe(SetCount.why)
    expect(input.getAttribute('data-action')).toBe('SetCount')
    expect(input.hasAttribute('disabled')).toBe(false)
  })

  it('disables its control with the reason while the Action is unavailable', () => {
    const { calls } = mount(makeProgram(-1))
    const input = screen.getByRole('textbox', { name: 'Set the count' })
    expect(input.hasAttribute('disabled')).toBe(true)
    expect(input.getAttribute('data-hint-because')).toBe('the count is broken')
    expect(calls().setCount.maybeBecause).toEqual(
      Option.some('the count is broken'),
    )
    expect(calls().setCount.isEnabled).toBe(false)
  })
})
