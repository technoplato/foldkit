import { Array, Option } from 'effect'
import { Host, Slot } from 'foldkit/behavior'
import type { ButtonNode, ListNode, UiNode } from 'foldkit/renderers'
import { Shelf } from 'foldkit/test'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { callProp, firstOf, hostsOf, propsOf } from '../test/elements.js'
import { recognizes } from './host.js'
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

// NOTE: this is the phone painter's driver of the gesture test every
// painter runs. It paints the made-up shelf with the phone's painter and
// calls the handlers the platform calls. React Native recognizes a hold
// itself, so a hold here is the one `onLongPress` the host put on the row:
// no finger going down is told to core, and no wait runs. A phone has no
// second button, which its host's table says and this test holds it to.

const partsOf = (
  tree: UiNode,
): Readonly<{ list: ListNode; pin: ButtonNode }> => {
  const children = tree._tag === 'Column' ? tree.children : []
  const maybeList = Array.findFirst(
    children,
    (child): child is ListNode => child._tag === 'List',
  )
  const maybePin = Array.findFirst(
    children,
    (child): child is ButtonNode => child._tag === 'Button',
  )
  if (Option.isSome(maybeList) && Option.isSome(maybePin)) {
    return { list: maybeList.value, pin: maybePin.value }
  }
  throw new Error('the shelf has no list or no pin')
}

const stage = () => {
  const shelf = Shelf.start()
  const onPress = (button: ButtonNode): void => {
    if (button.action !== undefined) {
      shelf.press(button.action)
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
  }
  const pressableNamed = (painted: ReactElement, label: string): ReactElement =>
    firstOf(hostsOf(painted, 'Pressable'), element =>
      String(propsOf(element)['accessibilityLabel']).endsWith(label),
    )
  return {
    shelf,
    row: (): ReactElement => {
      const { list } = partsOf(shelf.tree())
      return pressableNamed(
        paintRows(list, list.items, paint, () => []),
        'Salt Road',
      )
    },
    pin: (): ReactElement =>
      pressableNamed(
        paintTree(partsOf(shelf.tree()).pin, { onPress }),
        'in the shelf',
      ),
  }
}

describe('the gesture test, on the phone’s painter', () => {
  it('hears a hold itself, and has no second button to hear', () => {
    const row = Slot.menuAsk('ShowTitleMenu:salt-road')
    expect(Host.unheard(row, recognizes)).toEqual(['PressedSecondary'])
    expect(Host.plan(row, recognizes)).toEqual({
      maybePressed: Option.none(),
      maybeSecondary: Option.none(),
      maybeHeld: Option.some('ShowTitleMenu:salt-road'),
      maybeHold: Option.none(),
    })
  })

  it.each(Host.personActs)(
    '%s on a title’s row opens that title’s menu, where the phone can hear it',
    personAct => {
      const staged = stage()
      if (Array.contains(recognizes, Host.gestureOf(personAct))) {
        callProp(staged.row(), 'onLongPress')
        expect(staged.shelf.model().parts['TitleMenu']).toEqual(
          Shelf.OpenOn({ key: 'salt-road' }),
        )
        expect(Shelf.actionsOf(staged.shelf)).toEqual(['ShowTitleMenu'])
        expect(staged.shelf.folded()).toEqual(['ShowTitleMenu'])
      } else {
        expect(personAct).toBe('SecondaryPress')
        expect(
          Object.keys(propsOf(staged.row())).filter(name =>
            /context|secondary/iu.test(name),
          ),
        ).toEqual([])
      }
    },
  )

  it('hosts a second part, bound on a button, with no painter code naming it', () => {
    const staged = stage()
    callProp(staged.pin(), 'onLongPress')
    expect(staged.shelf.model().parts['Pin']).toEqual(Shelf.Pinned())
    expect(Shelf.actionsOf(staged.shelf)).toEqual(['TogglePin'])
    expect(propsOf(staged.pin())['accessibilityState']).toMatchObject({
      selected: true,
    })
  })

  it('puts no hold on a row no part bound', () => {
    const staged = stage()
    const { list } = partsOf(staged.shelf.tree())
    const plain = paintRows(
      {
        ...list,
        items: [{ key: 'plain', title: 'Plain', action: 'Open:plain' }],
      },
      [{ key: 'plain', title: 'Plain', action: 'Open:plain' }],
      {
        look: lightLook,
        styles: {},
        onPress: () => {},
        onInput: undefined,
        onLink: () => {},
        platformActions: [],
        maybePlatformTitle: undefined,
        isCentered: false,
      },
      () => [],
    )
    expect(
      propsOf(
        firstOf(
          hostsOf(plain, 'Pressable'),
          element => propsOf(element)['accessibilityLabel'] === 'Plain',
        ),
      )['onLongPress'],
    ).toBeUndefined()
  })
})
