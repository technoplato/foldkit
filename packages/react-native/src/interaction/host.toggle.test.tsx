import { Toggle } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { ToggleFixture } from 'foldkit/test'
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

// NOTE: proves the core Toggle Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Toggle- or
// Button-specific painter logic.

const stage = (overrides: Partial<Toggle.Props> = {}) => {
  const fixture = ToggleFixture.start(overrides)
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

describe('core Toggle Part on the React Native generic host', () => {
  it('paints button accessibilityRole and pressed accessibilityState and toggles on button/label press', () => {
    const staged = stage()

    const button = staged.buttonNamed('Mute audio')
    expect(propsOf(button)['accessibilityRole']).toBe('button')
    expect(propsOf(button)['accessibilityState']).toMatchObject({
      selected: false,
      disabled: false,
    })
    expect(
      propsOf(staged.viewWithId('fixture-toggle-description'))['nativeID'],
    ).toBe('fixture-toggle-description')

    callProp(button, 'onPress')
    expect(Toggle.isPressed(staged.fixture.toggleState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Mute audio'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    callProp(staged.buttonNamed('Mute audio label'), 'onPress')
    expect(Toggle.isPressed(staged.fixture.toggleState())).toBe(false)
    expect(
      propsOf(staged.buttonNamed('Mute audio'))['accessibilityState'],
    ).toMatchObject({ selected: false })

    staged.fixture.send(Toggle.SetButtonPressed({ isPressed: true }))
    expect(
      propsOf(staged.buttonNamed('Mute audio'))['accessibilityState'],
    ).toMatchObject({ selected: true })
  })

  it('reflects disabled accessibilityState and blocks toggles when disabled or readOnly', () => {
    const disabled = stage({ isDisabled: true })
    expect(
      propsOf(disabled.buttonNamed('Mute audio'))['accessibilityState'],
    ).toMatchObject({ selected: false, disabled: true })

    callProp(disabled.buttonNamed('Mute audio'), 'onPress')
    expect(Toggle.isPressed(disabled.fixture.toggleState())).toBe(false)

    const readOnly = stage({ isReadOnly: true, defaultPressed: true })
    expect(
      propsOf(readOnly.buttonNamed('Mute audio'))['accessibilityState'],
    ).toMatchObject({ selected: true, disabled: true })

    callProp(readOnly.buttonNamed('Mute audio'), 'onPress')
    expect(Toggle.isPressed(readOnly.fixture.toggleState())).toBe(true)
  })
})
