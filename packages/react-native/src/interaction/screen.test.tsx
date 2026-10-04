import { Array, Option, Schema as S, pipe } from 'effect'
import { Catalog } from 'foldkit'
import {
  type ButtonNode,
  Column,
  List,
  Row,
  Text,
  TextInput,
  actionButtons,
} from 'foldkit/renderers'
import { type ReactElement, isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { paintTree } from './screen.js'

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn() },
  Platform: {
    select: (choices: Readonly<{ default: unknown }>) => choices.default,
  },
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
      { color: '#111827', fontSize: 16, textAlign: 'center' },
      { fontSize: 72 },
    ])
  })

  it('maps Display, dim, and mono text onto the core look', () => {
    const painted = paintTree(
      Column(
        {},
        Text('3', { emphasis: 'Display' }),
        Text('Every device shows the same screen.', { dim: true }),
        Text('/counter', { mono: true }),
      ),
      { onPress: () => {} },
    )
    const [display, dim, mono] = Array.map(
      hostsOf(painted, 'Text'),
      text => propsOf(text)['style'],
    )
    expect(display).toContainEqual(
      expect.objectContaining({ fontSize: 72, fontWeight: '600' }),
    )
    expect(dim).toContainEqual(
      expect.objectContaining({ color: '#6b7280', fontSize: 16 }),
    )
    expect(mono).toContainEqual({ fontFamily: 'monospace' })
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

describe('row checks and fields that press', () => {
  it('paints a row check as a checkbox that reports its own press', () => {
    const pressed: Array<ButtonNode> = []
    const painted = paintTree(
      List({
        label: 'Groceries',
        items: [
          {
            key: 'r1',
            title: 'Oat milk',
            check: {
              isChecked: true,
              label: 'Mark Oat milk not done',
              action: 'Reopen:r1',
            },
          },
        ],
      }),
      {
        onPress: button => {
          pressed.push(button)
        },
      },
    )
    const check = Option.getOrThrow(
      Array.findFirst(
        [painted, ...descendants(painted)],
        element => 'check' in propsOf(element),
      ),
    )
    const render = check.type
    if (typeof render !== 'function') {
      throw new Error('the check paints through its own component')
    }
    const box: unknown = Reflect.apply(render, undefined, [propsOf(check)])
    expect(isValidElement(box)).toBe(true)
    if (isValidElement(box)) {
      expect(propsOf(box)['accessibilityRole']).toBe('checkbox')
      expect(propsOf(box)['accessibilityState']).toEqual({
        checked: true,
        disabled: false,
      })
      pressAll([box])
    }
    expect(Array.map(pressed, button => button.action)).toEqual(['Reopen:r1'])
  })

  it('paints a field that presses as a native text field, and a legacy one as text', () => {
    const field = paintTree(
      TextInput({
        value: '',
        placeholder: 'New reminder',
        action: 'AddReminder',
      }),
      { onPress: () => {} },
    )
    expect(propsOf(field)['input']).toEqual(
      expect.objectContaining({ action: 'AddReminder' }),
    )
    const legacy = paintTree(TextInput({ value: 'hello' }), {
      onPress: () => {},
    })
    expect(legacy.type).toBe('Text')
  })
})
