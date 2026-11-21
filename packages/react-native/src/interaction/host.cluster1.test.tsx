import { Option } from 'effect'
import {
  Drawer,
  HoverCard,
  Menubar,
  RatingGroup,
  ToggleGroup,
  Toolbar,
} from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { Cluster1Fixture } from 'foldkit/test'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { callProp, firstOf, hostsOf, propsOf } from '../test/elements.js'
import { paintTree } from './screen.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)
vi.mock('../theme/themed.js', async () => {
  const { lightLook: look } = await import('./look.js')
  return { useLook: () => look }
})

// NOTE: proves all 6 Cluster 1 core Parts (Drawer, HoverCard, Menubar,
// Toolbar, ToggleGroup, RatingGroup) on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero widget-specific
// painter logic.

const stage = (overrides: Cluster1Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster1Fixture.start(overrides)
  const onPress = (button: ButtonNode): void => {
    const tag = button.action ?? button.token
    if (tag !== undefined) {
      fixture.press(tag)
    }
  }
  const painted = (): ReactElement => paintTree(fixture.tree(), { onPress })
  const buttonNamed = (label: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'Pressable'),
      element => propsOf(element)['accessibilityLabel'] === label,
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, buttonNamed, viewWithId }
}

describe('Cluster 1 core Parts on the React Native generic host', () => {
  it('proves Drawer: opens via trigger press, unhides content view, snaps on drag, and closes via button', () => {
    const staged = stage()
    expect(
      propsOf(staged.buttonNamed('Open drawer'))['accessibilityState'],
    ).toMatchObject({ expanded: false })
    expect(
      propsOf(staged.viewWithId('fixture-drawer-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    callProp(staged.buttonNamed('Open drawer'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Open drawer'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.viewWithId('fixture-drawer-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    staged.fixture.send(Drawer.BeginDrawerDrag({ pointerId: 1, x: 0, y: 0 }))
    staged.fixture.send(Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 190 }))
    staged.fixture.send(Drawer.ReleaseDrawerDrag({ pointerId: 1 }))
    expect(Drawer.activeSnapPointOf(staged.fixture.drawerState())).toEqual(
      Option.some(0.5),
    )

    callProp(staged.buttonNamed('Close drawer'), 'onPress')
    expect(Drawer.isOpen(staged.fixture.drawerState())).toBe(false)
  })

  it('proves HoverCard: opens via long press, unhides region content, and closes on Escape', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-hover-card-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    callProp(staged.buttonNamed('Author link'), 'onLongPress')
    expect(HoverCard.isOpen(staged.fixture.hoverCardState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Author link'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.viewWithId('fixture-hover-card-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    staged.fixture.send(HoverCard.PressHoverCardEscape())
    expect(HoverCard.isOpen(staged.fixture.hoverCardState())).toBe(false)
  })

  it('proves Menubar: paints menu/menuitem roles, opens via trigger, switches via Left/Right, and selects item', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-menubar-bar'))['accessibilityRole'],
    ).toBe('menu')
    expect(propsOf(staged.buttonNamed('File'))['accessibilityRole']).toBe(
      'menuitem',
    )

    callProp(staged.buttonNamed('File'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('File'))['accessibilityState'],
    ).toMatchObject({ expanded: true })

    staged.fixture.send(Menubar.PressedMenubarKey({ key: 'ArrowRight' }))
    expect(Menubar.openMenuValueOf(staged.fixture.menubarState())).toEqual(
      Option.some('edit'),
    )

    callProp(staged.buttonNamed('Undo edit'), 'onPress')
    expect(Menubar.lastSelectedOf(staged.fixture.menubarState())).toEqual(
      Option.some({ menuValue: 'edit', itemValue: 'undo', itemIndex: 0 }),
    )
  })

  it('proves Toolbar: skips disabled item on roving focus and activates items via press', () => {
    const staged = stage()
    expect(
      propsOf(staged.buttonNamed('Copy'))['accessibilityState'],
    ).toMatchObject({ disabled: true })

    staged.fixture.send(Toolbar.PressedToolbarKey({ key: 'ArrowRight' }))
    expect(
      propsOf(staged.buttonNamed('Paste'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    callProp(staged.buttonNamed('Paste'), 'onPress')
    expect(Toolbar.lastActivatedValueOf(staged.fixture.toolbarState())).toEqual(
      Option.some('paste'),
    )
  })

  it('proves ToggleGroup: reflects pressed state in accessibilityState.selected across Single/Multiple toggles', () => {
    const staged = stage({ toggleGroup: { mode: 'Multiple' } })
    expect(
      propsOf(staged.buttonNamed('Align left'))['accessibilityState'],
    ).toMatchObject({ selected: false })

    callProp(staged.buttonNamed('Align left'), 'onPress')
    callProp(staged.buttonNamed('Align right'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Align left'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(staged.buttonNamed('Align center'))['accessibilityState'],
    ).toMatchObject({ selected: false })
    expect(
      propsOf(staged.buttonNamed('Align right'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(ToggleGroup.valuesOf(staged.fixture.toggleGroupState())).toEqual([
      'left',
      'right',
    ])
  })

  it('proves RatingGroup: paints radiogroup/radio roles and updates checked state on star press', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-rating-root'))['accessibilityRole'],
    ).toBe('radiogroup')
    expect(propsOf(staged.buttonNamed('4 stars'))['accessibilityRole']).toBe(
      'radio',
    )

    callProp(staged.buttonNamed('4 stars'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('4 stars'))['accessibilityState'],
    ).toMatchObject({ checked: true })
    expect(RatingGroup.valueOf(staged.fixture.ratingGroupState())).toBe(4)
  })
})
