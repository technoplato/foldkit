import { FileDrop, Nav, Presence, VirtualList } from 'foldkit/behavior'
import type { ButtonNode, UiNode } from 'foldkit/renderers'
import {
  FileDropFixture,
  NavFixture,
  PresenceFixture,
  VirtualListFixture,
} from 'foldkit/test'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  callProp,
  firstOf,
  hostsOf,
  propsOf,
  wordsOf,
} from '../test/elements.js'
import { paintTree } from './screen.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)
vi.mock('../theme/themed.js', async () => {
  const { lightLook: look } = await import('./look.js')
  return { useLook: () => look }
})

// NOTE: proves the final four packages/ui core Parts (Nav #2659, FileDrop
// #2662, VirtualList #2663, and Presence #2664) on the React Native painter
// through the existing generic RN host (`interaction/host.ts`), with zero
// widget-specific painter logic.

const mountStage = <
  Fixture extends Readonly<{
    tree: () => UiNode
    press: (tag: string) => void
  }>,
>(
  fixture: Fixture,
) => {
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
  const hasViewWithId = (nativeID: string): boolean =>
    hostsOf(painted(), 'View').some(
      element => propsOf(element)['nativeID'] === nativeID,
    )
  return { fixture, buttonNamed, viewWithId, hasViewWithId }
}

describe('final four core Parts on the React Native generic host', () => {
  describe('Nav Part (#2659)', () => {
    it('paints Nav, Trigger, Link, and Content accessibility state across toggle, hover-switch, and Escape', () => {
      const staged = mountStage(NavFixture.start())

      const dashboard = staged.buttonNamed('Dashboard')
      const products = staged.buttonNamed('Products')
      const productsContent = staged.viewWithId('fixture-nav-content-products')

      expect(propsOf(dashboard)['accessibilityRole']).toBe('menuitem')
      expect(propsOf(dashboard)['accessibilityState']).toMatchObject({
        selected: true,
      })
      expect(propsOf(products)['accessibilityRole']).toBe('button')
      expect(propsOf(products)['accessibilityState']).toMatchObject({
        expanded: false,
      })
      expect(propsOf(productsContent)['accessibilityElementsHidden']).toBe(true)

      callProp(products, 'onPress')
      expect(
        propsOf(staged.buttonNamed('Products'))['accessibilityState'],
      ).toMatchObject({ expanded: true })
      expect(
        propsOf(staged.viewWithId('fixture-nav-content-products'))[
          'accessibilityElementsHidden'
        ],
      ).toBeUndefined()

      staged.fixture.send(Nav.EnterNavTrigger({ value: 'resources' }))
      expect(
        propsOf(staged.buttonNamed('Resources'))['accessibilityState'],
      ).toMatchObject({ expanded: true })

      staged.fixture.send(Nav.PressedNavKey({ key: 'Escape' }))
      expect(
        propsOf(staged.viewWithId('fixture-nav-content-resources'))[
          'accessibilityElementsHidden'
        ],
      ).toBe(true)
    })
  })

  describe('FileDrop Part (#2662)', () => {
    it('paints Dropzone drag state, Item rows, RemoveButton, and ClearButton accessibility state', () => {
      const staged = mountStage(FileDropFixture.start())

      expect(
        propsOf(staged.viewWithId('fixture-file-drop-dropzone'))[
          'accessibilityState'
        ],
      ).toMatchObject({ selected: false })

      staged.fixture.send(FileDrop.EnterDragZone())
      staged.fixture.send(FileDrop.EnterDragZone())
      staged.fixture.send(FileDrop.LeaveDragZone())
      expect(
        propsOf(staged.viewWithId('fixture-file-drop-dropzone'))[
          'accessibilityState'
        ],
      ).toMatchObject({ selected: true })

      staged.fixture.send(
        FileDrop.DropFiles({
          files: [{ name: 'invoice.pdf', size: 800, type: 'application/pdf' }],
        }),
      )
      expect(
        propsOf(staged.viewWithId('fixture-file-drop-dropzone'))[
          'accessibilityState'
        ],
      ).toMatchObject({ selected: false })
      expect(staged.hasViewWithId('fixture-file-drop-item-invoice.pdf')).toBe(
        true,
      )

      callProp(staged.buttonNamed('Remove invoice.pdf'), 'onPress')
      expect(staged.hasViewWithId('fixture-file-drop-item-invoice.pdf')).toBe(
        false,
      )
    })
  })

  describe('VirtualList Part (#2663)', () => {
    it('paints Viewport scroll value bounds, Content visibility, and Item windowing across measurement and ScrollToIndex', () => {
      const staged = mountStage(VirtualListFixture.start())

      expect(
        propsOf(staged.viewWithId('fixture-virtual-list-viewport'))[
          'accessibilityValue'
        ],
      ).toMatchObject({ min: 0, max: 3000, now: 0 })
      expect(
        propsOf(staged.viewWithId('fixture-virtual-list-content'))[
          'accessibilityElementsHidden'
        ],
      ).toBe(true)

      staged.fixture.send(VirtualList.MeasuredViewport({ containerHeight: 90 }))
      expect(
        propsOf(staged.viewWithId('fixture-virtual-list-content'))[
          'accessibilityElementsHidden'
        ],
      ).toBeUndefined()
      expect(staged.hasViewWithId('fixture-virtual-list-item-0')).toBe(true)
      expect(wordsOf(staged.viewWithId('fixture-virtual-list-item-0'))).toBe(
        'Row 0',
      )

      staged.fixture.send(
        VirtualList.ScrollToIndex({ index: 20, align: 'Start' }),
      )
      expect(
        propsOf(staged.viewWithId('fixture-virtual-list-viewport'))[
          'accessibilityValue'
        ],
      ).toMatchObject({ now: 600 })
      expect(
        propsOf(staged.viewWithId('fixture-virtual-list-item-20'))[
          'accessibilityState'
        ],
      ).toMatchObject({ selected: true })
    })
  })

  describe('Presence Part (#2664)', () => {
    it('paints Container mount/expanded state across Show, AdvanceFrame, Hide, and EndAnimation', () => {
      const staged = mountStage(PresenceFixture.start())

      expect(
        propsOf(staged.viewWithId('fixture-presence-container'))[
          'accessibilityElementsHidden'
        ],
      ).toBe(true)

      callProp(staged.buttonNamed('Show banner'), 'onPress')
      expect(
        propsOf(staged.viewWithId('fixture-presence-container'))[
          'accessibilityState'
        ],
      ).toMatchObject({ expanded: true })
      expect(
        propsOf(staged.viewWithId('fixture-presence-container'))[
          'accessibilityElementsHidden'
        ],
      ).toBeUndefined()

      staged.fixture.send(Presence.AdvanceFrame())
      staged.fixture.send(Presence.EndAnimation())
      callProp(staged.buttonNamed('Hide banner'), 'onPress')
      staged.fixture.send(Presence.AdvanceFrame())
      expect(
        propsOf(staged.viewWithId('fixture-presence-container'))[
          'accessibilityState'
        ],
      ).toMatchObject({ expanded: false })
      expect(
        propsOf(staged.viewWithId('fixture-presence-container'))[
          'accessibilityElementsHidden'
        ],
      ).toBeUndefined()

      staged.fixture.send(Presence.EndAnimation())
      expect(
        propsOf(staged.viewWithId('fixture-presence-container'))[
          'accessibilityElementsHidden'
        ],
      ).toBe(true)
    })
  })
})
