import { Array, Option, Schema as S, pipe } from 'effect'
import { Catalog } from 'foldkit'
import {
  type ButtonNode,
  Column,
  Row,
  Text,
  actionButtons,
} from 'foldkit/renderers'
import { type ReactElement, isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { paintTree } from './screen.js'

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn() },
  Pressable: 'Pressable',
  Text: 'Text',
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

const screenAt = (count: number) =>
  Column(
    {},
    Text(String(count), { label: `count ${String(count)}` }),
    Row({}, ...actionButtons(Catalog.entries(catalog, { count }))),
  )

type Props = Readonly<Record<string, unknown>>

const propsOf = (element: ReactElement): Props =>
  typeof element.props === 'object' && element.props !== null
    ? { ...element.props }
    : {}

const descendants = (element: ReactElement): ReadonlyArray<ReactElement> =>
  pipe(
    Array.ensure(propsOf(element)['children']),
    Array.filter(isValidElement),
    Array.flatMap(child => [child, ...descendants(child)]),
  )

const hostsOf = (
  element: ReactElement,
  type: string,
): ReadonlyArray<ReactElement> =>
  Array.filter([element, ...descendants(element)], child => child.type === type)

const pressAll = (elements: ReadonlyArray<ReactElement>): void => {
  Array.forEach(elements, element => {
    const onPress = propsOf(element)['onPress']
    if (typeof onPress === 'function') {
      onPress()
    }
  })
}

describe('paintTree', () => {
  it('announces a Text label and merges the caller style over the default', () => {
    const painted = paintTree(screenAt(3), {
      onPress: () => {},
      styles: { Text: { fontSize: 72 } },
    })
    const count = propsOf(
      Option.getOrThrow(Array.head(hostsOf(painted, 'Text'))),
    )
    expect(count['accessibilityLabel']).toBe('count 3')
    expect(count['children']).toBe('3')
    expect(count['style']).toEqual([
      { color: '#111827', fontSize: 17, textAlign: 'center' },
      { fontSize: 72 },
    ])
  })

  it('reports the pressed Button node with its Catalog action', () => {
    const pressed: Array<ButtonNode> = []
    const buttons = hostsOf(
      paintTree(screenAt(2), {
        onPress: button => {
          pressed.push(button)
        },
      }),
      'Pressable',
    )
    expect(
      Array.map(buttons, button => propsOf(button)['accessibilityLabel']),
    ).toEqual(['+', 'Reset'])
    pressAll(buttons)
    expect(Array.map(pressed, button => button.action)).toEqual([
      'Increment',
      'Reset',
    ])
  })

  it('disables a Disabled Action and reads its sentence as the hint', () => {
    const reset = propsOf(
      Option.getOrThrow(
        Array.findFirst(
          hostsOf(paintTree(screenAt(0), { onPress: () => {} }), 'Pressable'),
          button => propsOf(button)['accessibilityLabel'] === 'Reset',
        ),
      ),
    )
    expect(reset['disabled']).toBe(true)
    expect(reset['accessibilityHint']).toBe('count is already 0')
    expect(reset['accessibilityState']).toEqual({ disabled: true })
  })
})
