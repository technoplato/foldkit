import { Disclosure } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { DisclosureFixture } from 'foldkit/test'
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

// NOTE: proves the core Disclosure / Accordion Part on the React Native
// painter through the existing generic RN host (`interaction/host.ts`), with
// zero Disclosure-specific painter logic.

const stageRunning = (fixture: DisclosureFixture.Running) => {
  const onPress = (button: ButtonNode): void => {
    if (button.action !== undefined) {
      fixture.press(button.action)
    }
  }
  const painted = (): ReactElement => paintTree(fixture.tree(), { onPress })
  const buttonNamed = (label: string): ReactElement =>
    firstOf(hostsOf(painted(), 'Pressable'), element =>
      String(propsOf(element)['accessibilityLabel']).endsWith(label),
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, buttonNamed, viewWithId }
}

describe('core Disclosure / Accordion Part on the React Native generic host', () => {
  it('paints single disclosure accessibilityState.expanded and animated panel visibility via generic RN hostPropsOf and containerPropsOf', () => {
    const staged = stageRunning(
      DisclosureFixture.startSingle({ isAnimated: true }),
    )

    expect(
      propsOf(staged.buttonNamed('Shipping details'))['accessibilityState'],
    ).toMatchObject({ expanded: false, disabled: false })
    expect(
      propsOf(staged.viewWithId('fixture-disclosure-panel'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    // Tap trigger -> enters EnterStart (expanded: true, panel visible)
    callProp(staged.buttonNamed('Shipping details'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Shipping details'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.viewWithId('fixture-disclosure-panel'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    staged.fixture.send(Disclosure.AdvancedDisclosureFrame({}))
    staged.fixture.send(Disclosure.EndedDisclosureAnimation({}))

    // Tap again -> LeaveStart keeps panel visible until EndAnimation settles
    callProp(staged.buttonNamed('Shipping details'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Shipping details'))['accessibilityState'],
    ).toMatchObject({ expanded: false })
    expect(
      propsOf(staged.viewWithId('fixture-disclosure-panel'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    staged.fixture.send(Disclosure.AdvancedDisclosureFrame({}))
    staged.fixture.send(Disclosure.EndedDisclosureAnimation({}))
    expect(
      propsOf(staged.viewWithId('fixture-disclosure-panel'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)
  })

  it('paints accordion sections, disabled states, single/multiple expansion, and keyboard roving via the generic RN host', () => {
    const staged = stageRunning(DisclosureFixture.startAccordion())

    expect(
      propsOf(staged.viewWithId('fixture-accordion-root'))[
        'accessibilityLabel'
      ],
    ).toBe('Frequently asked questions')
    expect(
      propsOf(staged.buttonNamed('Overview'))['accessibilityState'],
    ).toMatchObject({ expanded: true, disabled: true })
    expect(
      propsOf(staged.buttonNamed('Shipping'))['accessibilityState'],
    ).toMatchObject({ expanded: false, disabled: false })
    expect(
      propsOf(staged.buttonNamed('Billing'))['accessibilityState'],
    ).toMatchObject({ expanded: false, disabled: true })
    expect(
      propsOf(staged.viewWithId('fixture-accordion-panel-overview'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()
    expect(
      propsOf(staged.viewWithId('fixture-accordion-panel-shipping'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    // Tap Shipping -> opens shipping, collapses overview
    callProp(staged.buttonNamed('Shipping'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Shipping'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.viewWithId('fixture-accordion-panel-shipping'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()
    expect(
      propsOf(staged.viewWithId('fixture-accordion-panel-overview'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    // ArrowDown skips disabled Billing -> Enter expands Returns
    staged.fixture.send(Disclosure.PressedDisclosureKey({ key: 'ArrowDown' }))
    staged.fixture.send(Disclosure.PressedDisclosureKey({ key: 'Enter' }))
    expect(
      propsOf(staged.buttonNamed('Returns'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.viewWithId('fixture-accordion-panel-returns'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    // Multiple mode keeps both panels visible
    const multi = stageRunning(
      DisclosureFixture.startAccordion({ isMultiple: true }),
    )
    callProp(multi.buttonNamed('Shipping'), 'onPress')
    expect(
      propsOf(multi.viewWithId('fixture-accordion-panel-overview'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()
    expect(
      propsOf(multi.viewWithId('fixture-accordion-panel-shipping'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()
  })
})
