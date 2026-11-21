import { Switch } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { SwitchFixture } from 'foldkit/test'
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

// NOTE: proves the core Switch Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Switch-specific
// painter logic.

const stage = (overrides: Partial<Switch.Props> = {}) => {
  const fixture = SwitchFixture.start(overrides)
  const onPress = (button: ButtonNode): void => {
    const tag = button.action ?? button.token
    if (tag !== undefined) {
      fixture.press(tag)
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

describe('core Switch Part on the React Native generic host', () => {
  it('paints switch accessibilityRole and accessibilityState.checked and toggles on control/label press', () => {
    const staged = stage()

    const control = staged.buttonNamed('Notifications')
    expect(propsOf(control)['accessibilityRole']).toBe('switch')
    expect(propsOf(control)['accessibilityState']).toMatchObject({
      checked: false,
      disabled: false,
    })
    expect(
      propsOf(staged.viewWithId('fixture-switch-description'))['nativeID'],
    ).toBe('fixture-switch-description')

    // Tap control -> turns On
    callProp(control, 'onPress')
    expect(Switch.isChecked(staged.fixture.switchState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Notifications'))['accessibilityState'],
    ).toMatchObject({ checked: true })

    // Tap label -> turns Off
    callProp(staged.buttonNamed('Notifications label'), 'onPress')
    expect(Switch.isChecked(staged.fixture.switchState())).toBe(false)
    expect(
      propsOf(staged.buttonNamed('Notifications'))['accessibilityState'],
    ).toMatchObject({ checked: false })

    // Explicit SetSwitchChecked -> turns On
    staged.fixture.send(Switch.SetSwitchChecked({ isChecked: true }))
    expect(
      propsOf(staged.buttonNamed('Notifications'))['accessibilityState'],
    ).toMatchObject({ checked: true })
  })

  it('reflects disabled accessibilityState and blocks toggles when disabled or readOnly', () => {
    const disabled = stage({ isDisabled: true })
    expect(
      propsOf(disabled.buttonNamed('Notifications'))['accessibilityState'],
    ).toMatchObject({ checked: false, disabled: true })

    callProp(disabled.buttonNamed('Notifications'), 'onPress')
    expect(Switch.isChecked(disabled.fixture.switchState())).toBe(false)

    const readOnly = stage({ isReadOnly: true })
    callProp(readOnly.buttonNamed('Notifications'), 'onPress')
    expect(Switch.isChecked(readOnly.fixture.switchState())).toBe(false)
  })
})
