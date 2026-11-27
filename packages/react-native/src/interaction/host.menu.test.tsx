import { Array, Option } from 'effect'
import { Menu, Typeahead } from 'foldkit/behavior'
import type { ButtonNode, ListNode, UiNode } from 'foldkit/renderers'
import { MenuFixture } from 'foldkit/test'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { callProp, firstOf, hostsOf, propsOf } from '../test/elements.js'
import { paintRows } from './list.js'
import { lightLook } from './look.js'
import type { Paint } from './paint.js'
import { paintTree } from './screen.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)
vi.mock('../theme/themed.js', async () => {
  const { lightLook: look } = await import('./look.js')
  return { useLook: () => look }
})

// NOTE: proves the core Menu Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Menu-specific
// painter logic.

const listOf = (tree: UiNode): ListNode => {
  const children = tree._tag === 'Column' ? tree.children : []
  const maybeList = Array.findFirst(
    children,
    (child): child is ListNode => child._tag === 'List',
  )
  if (Option.isSome(maybeList)) {
    return maybeList.value
  }
  throw new Error('the menu fixture has no list')
}

const stage = () => {
  const fixture = MenuFixture.start()
  const onPress = (button: ButtonNode): void => {
    if (button.action !== undefined) {
      fixture.press(button.action)
    }
  }
  const paint: Paint = {
    look: lightLook,
    styles: {},
    onPress,
    onInput: undefined,
    onLink: () => {},
    platformActions: [],
    maybePlatformTitle: undefined,
    isCentered: false,
    maybeFocusedAction: undefined,
  }
  const pressableNamed = (painted: ReactElement, label: string): ReactElement =>
    firstOf(hostsOf(painted, 'Pressable'), element =>
      String(propsOf(element)['accessibilityLabel']).endsWith(label),
    )

  return {
    fixture,
    row: (): ReactElement => {
      const list = listOf(fixture.tree())
      return pressableNamed(
        paintRows(list, list.items, paint, () => []),
        'Salt Road',
      )
    },
    buttonNamed: (label: string): ReactElement =>
      pressableNamed(paintTree(fixture.tree(), { onPress }), label),
  }
}

describe('core Menu Part on the React Native generic host', () => {
  it('opens the core Menu Part on a row long press through hostPropsOf', () => {
    const staged = stage()
    callProp(staged.row(), 'onLongPress')
    expect(Menu.isOpen(staged.fixture.menuState())).toBe(true)
    expect(Menu.targetOf(staged.fixture.menuState())).toEqual(
      Option.some('salt-road'),
    )
  })

  it('toggles open, reflects expanded and selected state, runs typeahead, selects an item, and dismisses', async () => {
    const staged = stage()

    expect(
      propsOf(staged.buttonNamed('Menu trigger'))['accessibilityState'],
    ).toMatchObject({ expanded: false })

    // Tap Trigger -> opens Menu
    callProp(staged.buttonNamed('Menu trigger'), 'onPress')
    expect(Menu.isOpen(staged.fixture.menuState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Menu trigger'))['accessibilityState'],
    ).toMatchObject({ expanded: true })

    // Keyboard/typeahead highlight projects onto item accessibilityState.selected
    staged.fixture.send(Menu.PressedMenuKey({ key: 'd' }))
    staged.fixture.send(Menu.PressedMenuKey({ key: 'u' }))
    expect(
      propsOf(staged.buttonNamed('Duplicate'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    await staged.fixture.elapse(Typeahead.resetMs)
    expect(Menu.searchQueryOf(staged.fixture.menuState())).toBe('')

    // Tap item -> selects and closes
    callProp(staged.buttonNamed('Duplicate'), 'onPress')
    expect(Menu.isOpen(staged.fixture.menuState())).toBe(false)
    expect(Menu.lastSelectedOf(staged.fixture.menuState())).toEqual(
      Option.some({ value: 'duplicate', index: 1 }),
    )

    // Reopen and dismiss via backdrop press
    callProp(staged.buttonNamed('Menu trigger'), 'onPress')
    expect(Menu.isOpen(staged.fixture.menuState())).toBe(true)
    callProp(staged.buttonNamed('Dismiss menu'), 'onPress')
    expect(Menu.isOpen(staged.fixture.menuState())).toBe(false)
  })
})
