import { Option } from 'effect'
import { Tabs } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { TabsFixture } from 'foldkit/test'
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

// NOTE: proves the core Tabs Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Tabs-specific
// painter logic.

const stage = (overrides: Partial<Tabs.Props> = {}) => {
  const fixture = TabsFixture.start(overrides)
  const onPress = (button: ButtonNode): void => {
    if (button.action !== undefined) {
      fixture.press(button.action)
    }
  }
  const painted = (): ReactElement => paintTree(fixture.tree(), { onPress })
  const tabNamed = (label: string): ReactElement =>
    firstOf(hostsOf(painted(), 'Pressable'), element =>
      String(propsOf(element)['accessibilityLabel']).endsWith(label),
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, tabNamed, viewWithId }
}

describe('core Tabs Part on the React Native generic host', () => {
  it('paints tablist, tabs, and panels through generic RN hostPropsOf and containerPropsOf', () => {
    const staged = stage()

    // Tablist container carries role="tablist" and label
    const tablist = staged.viewWithId('fixture-tabs-list')
    expect(propsOf(tablist)['accessibilityRole']).toBe('tablist')
    expect(propsOf(tablist)['accessibilityLabel']).toBe('Account sections')

    // Overview starts selected; Details unselected; Billing disabled
    expect(propsOf(staged.tabNamed('Overview'))['accessibilityRole']).toBe(
      'tab',
    )
    expect(
      propsOf(staged.tabNamed('Overview'))['accessibilityState'],
    ).toMatchObject({
      selected: true,
      disabled: false,
    })
    expect(
      propsOf(staged.tabNamed('Details'))['accessibilityState'],
    ).toMatchObject({
      selected: false,
      disabled: false,
    })
    expect(
      propsOf(staged.tabNamed('Billing'))['accessibilityState'],
    ).toMatchObject({
      selected: false,
      disabled: true,
    })

    // Active panel visible; inactive panel hidden
    expect(
      propsOf(staged.viewWithId('fixture-tabs-panel-0'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()
    expect(
      propsOf(staged.viewWithId('fixture-tabs-panel-1'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    // Tap Details -> updates selection and swaps panel visibility
    callProp(staged.tabNamed('Details'), 'onPress')
    expect(
      Tabs.activeValueOf(staged.fixture.tabsState(), staged.fixture.props),
    ).toEqual(Option.some('details'))
    expect(
      propsOf(staged.tabNamed('Details'))['accessibilityState'],
    ).toMatchObject({
      selected: true,
    })
    expect(
      propsOf(staged.tabNamed('Overview'))['accessibilityState'],
    ).toMatchObject({
      selected: false,
    })
    expect(
      propsOf(staged.viewWithId('fixture-tabs-panel-1'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()
    expect(
      propsOf(staged.viewWithId('fixture-tabs-panel-0'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    // Keyboard roving skips disabled Billing -> selects Security
    staged.fixture.send(Tabs.PressedTabKey({ key: 'ArrowRight' }))
    expect(
      Tabs.activeValueOf(staged.fixture.tabsState(), staged.fixture.props),
    ).toEqual(Option.some('security'))
    expect(
      propsOf(staged.tabNamed('Security'))['accessibilityState'],
    ).toMatchObject({
      selected: true,
    })
    expect(
      propsOf(staged.viewWithId('fixture-tabs-panel-3'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()
  })

  it('handles manual activation mode and RTL navigation on the RN generic host', () => {
    const manual = stage({ activationMode: 'Manual' })
    manual.fixture.send(Tabs.PressedTabKey({ key: 'ArrowRight' }))
    expect(
      propsOf(manual.tabNamed('Overview'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(manual.tabNamed('Details'))['accessibilityState'],
    ).toMatchObject({ selected: false })

    manual.fixture.send(Tabs.PressedTabKey({ key: 'Enter' }))
    expect(
      propsOf(manual.tabNamed('Details'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    const rtl = stage({ direction: 'Rtl' })
    rtl.fixture.send(Tabs.PressedTabKey({ key: 'ArrowLeft' }))
    expect(
      Tabs.activeValueOf(rtl.fixture.tabsState(), rtl.fixture.props),
    ).toEqual(Option.some('details'))
  })
})
