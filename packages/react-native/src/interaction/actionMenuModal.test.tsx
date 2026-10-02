import { Array, Match as M, Option, Schema as S, pipe } from 'effect'
import { ActionMenu, Catalog, Program } from 'foldkit'
import { ts } from 'foldkit/schema'
import { type ReactElement, isValidElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ActionMenuModal, ActionMenuSheet } from './actionMenuModal.js'

const bound = vi.hoisted(() => ({
  chooseFromMenu: vi.fn((_tag: string) => true),
  dismissMenu: vi.fn(() => true),
  typeInMenu: vi.fn((_query: string) => true),
}))
const presented = vi.hoisted(() => new Map<'menu', unknown>())

vi.mock('@foldkit/react/interaction', () => ({
  useBound: () => bound,
  useMenu: () => presented.get('menu'),
}))

vi.mock('react-native', () => ({
  Modal: 'Modal',
  Pressable: 'Pressable',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}))

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
    id: 'react-native-counter',
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
  }),
})

const menuAt = (count: number) => {
  const [closed] = App.init()
  const [open] = App.update({ ...closed, count }, ActionMenu.OpenedActionMenu())
  return Option.getOrThrow(Option.fromNullishOr(App.interaction)).menu(open)
}

type Props = Readonly<Record<string, unknown>>

const propsOf = (element: ReactElement): Props =>
  typeof element.props === 'object' && element.props !== null
    ? { ...element.props }
    : {}

const descendants = (element: ReactElement): ReadonlyArray<ReactElement> =>
  pipe(
    Array.ensure(propsOf(element)['children']),
    Array.flatMap(child => Array.ensure(child)),
    Array.filter(isValidElement),
    Array.flatMap(child => [child, ...descendants(child)]),
  )

const callProp = (
  element: ReactElement,
  name: string,
  ...args: ReadonlyArray<unknown>
): void => {
  const handler = propsOf(element)[name]
  if (typeof handler === 'function') {
    handler(...args)
  }
}

const presentedModal = (): ReactElement =>
  Option.getOrThrow(Option.fromNullishOr(ActionMenuModal()))

const presentedSheet = (): ReactElement => {
  const sheet = Option.getOrThrow(
    Array.findFirst(
      Array.ensure(propsOf(presentedModal())['children']),
      isValidElement,
    ),
  )
  expect(sheet.type).toBe(ActionMenuSheet)
  return ActionMenuSheet({ menu: Option.getOrThrow(menuAt(2)) })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ActionMenuModal', () => {
  it('renders nothing while the Model presents no menu', () => {
    presented.set('menu', Option.none())
    expect(ActionMenuModal()).toBeNull()
  })

  it('dismisses the menu destination on the Android back button', () => {
    presented.set('menu', menuAt(0))
    const modal = presentedModal()
    expect(modal.type).toBe('Modal')
    callProp(modal, 'onRequestClose')
    expect(bound.dismissMenu).toHaveBeenCalledOnce()
  })

  it('types into the query and chooses a row by its Action tag', () => {
    presented.set('menu', menuAt(2))
    const tree = [presentedSheet(), ...descendants(presentedSheet())]
    Array.forEach(
      Array.filter(tree, element => element.type === 'TextInput'),
      input => {
        callProp(input, 'onChangeText', 'res')
      },
    )
    expect(bound.typeInMenu).toHaveBeenCalledWith('res')

    const rows = Array.filter(tree, element => 'row' in propsOf(element))
    expect(rows).toHaveLength(2)
    callProp(Option.getOrThrow(Array.last(rows)), 'onChoose', 'Reset')
    expect(bound.chooseFromMenu).toHaveBeenCalledExactlyOnceWith('Reset')
  })
})
