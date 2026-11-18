import { Array, Option, Schema as S } from 'effect'
import { Catalog } from 'foldkit'
import {
  Box,
  Button,
  type ButtonNode,
  Column,
  List,
  Row,
  Text,
  TextInput,
  actionButtons,
} from 'foldkit/renderers'
import { defaultTheme } from 'foldkit/theme'
import { describe, expect, it, vi } from 'vitest'

import {
  callProp,
  firstOf,
  hostsOf,
  propsOf,
  styleOf,
  wordsOf,
} from '../test/elements.js'
import { TextField, TokenField } from './field.js'
import { Icon } from './icon.js'
import { lookOf } from './look.js'
import { screenPartsOf } from './paint.js'
import { hintOf, paintTree } from './screen.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)
vi.mock('@foldkit/react/interaction', () => ({}))
vi.mock('../theme/themed.js', async () => {
  const { lightLook } = await import('./look.js')
  return { useLook: () => lightLook }
})

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'To count one more',
  meta: { label: '+', keys: ['+'] },
})
const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'To start over',
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
    Text(String(count), {
      label: `count ${String(count)}`,
      emphasis: 'Display',
    }),
    Row({}, ...actionButtons(Catalog.entries(catalog, { count }))),
  )

const pressableNamed = (painted: ReturnType<typeof paintTree>, label: string) =>
  firstOf(
    hostsOf(painted, 'Pressable'),
    element => propsOf(element)['accessibilityLabel'] === label,
  )

describe('paintTree', () => {
  it('announces a Text label and merges the caller style over the default', () => {
    const painted = paintTree(screenAt(3), {
      onPress: () => {},
      styles: { Text: { fontSize: 72 } },
    })
    const count = Option.getOrThrow(Array.head(hostsOf(painted, 'Text')))
    expect(propsOf(count)['accessibilityLabel']).toBe('count 3')
    expect(styleOf(count)['fontSize']).toBe(72)
  })

  it('takes every color from the look it is told, light or dark', () => {
    const light = paintTree(screenAt(3), { onPress: () => {} })
    const dark = paintTree(screenAt(3), {
      onPress: () => {},
      look: lookOf('Dark'),
    })
    const countOf = (painted: ReturnType<typeof paintTree>) =>
      styleOf(Option.getOrThrow(Array.head(hostsOf(painted, 'Text'))))['color']
    expect(countOf(light)).toBe(defaultTheme.Text.light)
    expect(countOf(dark)).toBe(defaultTheme.Text.dark)
    expect(styleOf(pressableNamed(dark, '+'))['backgroundColor']).toBe(
      defaultTheme.Button.dark,
    )
  })

  it('reports the pressed Button node with its Catalog action', () => {
    const pressed: Array<ButtonNode> = []
    const painted = paintTree(screenAt(3), {
      onPress: button => {
        pressed.push(button)
      },
    })
    callProp(pressableNamed(painted, '+'), 'onPress')
    expect(Array.map(pressed, button => button.action)).toEqual(['Increment'])
  })

  it('says what a Button does as its hint, from its Action, with no key on a touch screen', () => {
    const painted = paintTree(screenAt(3), { onPress: () => {} })
    expect(propsOf(pressableNamed(painted, '+'))['accessibilityHint']).toBe(
      'Increments the count by one',
    )
    expect(hintOf({ _tag: 'Button', label: 'Close' })).toBeUndefined()
  })

  it('disables a Disabled Action and says why with what it does', () => {
    const painted = paintTree(screenAt(0), { onPress: () => {} })
    const reset = propsOf(pressableNamed(painted, 'Reset'))
    expect(reset['disabled']).toBe(true)
    expect(reset['accessibilityState']).toEqual({
      disabled: true,
      selected: false,
    })
    expect(reset['accessibilityHint']).toBe(
      'Sets the count to 0. Unavailable: count is already 0',
    )
  })

  it('centers a column that holds the one big figure, and starts others at the edge', () => {
    const counter = paintTree(screenAt(3), { onPress: () => {} })
    expect(styleOf(counter)['alignItems']).toBe('center')
    const library = paintTree(Column({}, Text('Library')), {
      onPress: () => {},
    })
    expect(styleOf(library)['alignItems']).toBe('stretch')
  })
})

describe('buttons', () => {
  it('draws an icon from the shared set, alone when the Button says so, and keeps its name for a screen reader', () => {
    const painted = paintTree(
      Button({
        label: 'Play',
        action: 'Play',
        icon: 'Play',
        isIconOnly: true,
        variant: 'Primary',
      }),
      { onPress: () => {} },
    )
    expect(propsOf(painted)['accessibilityLabel']).toBe('Play')
    expect(
      Array.map(hostsOf(painted, Icon), icon => propsOf(icon)['name']),
    ).toEqual(['Play'])
    expect(hostsOf(painted, 'Text')).toEqual([])
    expect(styleOf(painted)['borderRadius']).toBe(
      Number(styleOf(painted)['width']) / 2,
    )
  })

  it('marks the current tab selected and inks it with the accent', () => {
    const painted = paintTree(
      Row(
        {},
        Button({
          label: 'Library',
          action: 'ShowLibrary',
          variant: 'Tab',
          isCurrent: true,
        }),
        Button({
          label: 'Profile',
          action: 'ShowProfile',
          variant: 'Tab',
          isCurrent: false,
        }),
      ),
      { onPress: () => {} },
    )
    const library = pressableNamed(painted, 'Library')
    const profile = pressableNamed(painted, 'Profile')
    expect(propsOf(library)['accessibilityRole']).toBe('tab')
    expect(propsOf(library)['accessibilityState']).toMatchObject({
      selected: true,
    })
    expect(propsOf(profile)['accessibilityState']).toMatchObject({
      selected: false,
    })
    expect(
      styleOf(firstOf(hostsOf(library, 'Text'), () => true))['color'],
    ).toBe(defaultTheme.Accent.light)
  })

  it('leaves out a Button that only repeats what the platform offers there', () => {
    const page = Column(
      {},
      Row({}, Button({ label: 'Back', action: 'GoBack', variant: 'Ghost' })),
      Text('The Lantern Keeper'),
    )
    const underHeader = paintTree(page, {
      onPress: () => {},
      platformActions: ['GoBack'],
    })
    expect(hostsOf(underHeader, 'Pressable')).toEqual([])
    expect(wordsOf(underHeader)).toBe('The Lantern Keeper')
    const alone = paintTree(page, { onPress: () => {} })
    expect(hostsOf(alone, 'Pressable')).toHaveLength(1)
  })
})

describe('what the platform already shows', () => {
  it('leaves out a headline that only repeats the title in the native header', () => {
    const page = Column(
      {},
      Text('Library', { emphasis: 'Headline' }),
      Text('Your books', { dim: true }),
    )
    const underHeader = paintTree(page, {
      onPress: () => {},
      platformTitle: 'Library',
    })
    expect(wordsOf(underHeader)).toBe('Your books')
    expect(wordsOf(paintTree(page, { onPress: () => {} }))).toBe(
      'LibraryYour books',
    )
    const other = paintTree(page, {
      onPress: () => {},
      platformTitle: 'Profile',
    })
    expect(wordsOf(other)).toBe('LibraryYour books')
  })

  it('centers rows of controls where a host says so, as a bar at the bottom edge does', () => {
    const row = Row({}, Button({ label: 'Play', action: 'Play' }))
    expect(
      styleOf(paintTree(row, { onPress: () => {}, isCentered: true }))[
        'justifyContent'
      ],
    ).toBe('center')
    expect(
      styleOf(paintTree(row, { onPress: () => {} }))['justifyContent'],
    ).toBe('flex-start')
  })
})

describe('docks', () => {
  it('lifts a dock out of the body, so it stays at the bottom edge while the body scrolls', () => {
    const tabs = Box(
      { isDock: true },
      Row({}, Button({ label: 'Library', action: 'ShowLibrary' })),
    )
    const parts = screenPartsOf(Column({}, Text('Library'), Column({}, tabs)))
    expect(parts.docks).toEqual([tabs])
    expect(parts.maybeBody).toEqual(Column({}, Text('Library'), Column()))
  })

  it('keeps a screen with no dock whole', () => {
    const screen = Column({}, Text('Library'))
    expect(screenPartsOf(screen)).toEqual({ maybeBody: screen, docks: [] })
  })
})

describe('fields', () => {
  it('paints a field that presses as a field that holds a draft, and a keystroke field as one that sends each', () => {
    const adds = paintTree(
      TextInput({ value: '', action: 'AddReminder', label: 'New reminder' }),
      {
        onPress: () => {},
      },
    )
    expect(adds.type).toBe(TextField)
    const types = paintTree(TextInput({ value: 're', token: 'menu.q:' }), {
      onPress: () => {},
    })
    expect(types.type).toBe(TokenField)
  })

  it('paints the rows of a list through the row painter', () => {
    const painted = paintTree(
      List({
        label: 'Your books',
        items: [{ key: 'a', title: 'The Lantern Keeper', action: 'Open:a' }],
      }),
      { onPress: () => {} },
    )
    expect(propsOf(painted)['accessibilityLabel']).toBe('Your books')
    expect(wordsOf(painted)).toContain('The Lantern Keeper')
  })
})
