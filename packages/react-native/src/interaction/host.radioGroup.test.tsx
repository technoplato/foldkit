import { Option } from 'effect'
import { RadioGroup } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { RadioGroupFixture } from 'foldkit/test'
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

// NOTE: proves the core RadioGroup Part on the React Native painter through
// the existing generic RN host (`interaction/host.ts`), with zero RadioGroup-
// specific painter logic.

const stage = (overrides: Partial<RadioGroup.Props> = {}) => {
  const fixture = RadioGroupFixture.start(overrides)
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

describe('core RadioGroup Part on the React Native generic host', () => {
  it('paints radiogroup and radio accessibilityRoles and checked/disabled states through generic RN host', () => {
    const staged = stage()

    const group = staged.viewWithId('fixture-radio-group')
    expect(propsOf(group)['accessibilityRole']).toBe('radiogroup')
    expect(propsOf(group)['accessibilityLabel']).toBe('Drawing tool')

    expect(propsOf(staged.buttonNamed('Brush'))['accessibilityRole']).toBe(
      'radio',
    )
    expect(
      propsOf(staged.buttonNamed('Brush'))['accessibilityState'],
    ).toMatchObject({ checked: false, disabled: false })
    expect(
      propsOf(staged.buttonNamed('Eraser'))['accessibilityState'],
    ).toMatchObject({ checked: false, disabled: true })
    expect(
      propsOf(staged.viewWithId('fixture-radio-option-0-description'))[
        'nativeID'
      ],
    ).toBe('fixture-radio-option-0-description')

    // Tap Fill option -> selects Fill
    callProp(staged.buttonNamed('Fill'), 'onPress')
    expect(
      RadioGroup.selectedValueOf(
        staged.fixture.radioGroupState(),
        staged.fixture.props,
      ),
    ).toEqual(Option.some('fill'))
    expect(
      propsOf(staged.buttonNamed('Fill'))['accessibilityState'],
    ).toMatchObject({ checked: true })
    expect(
      propsOf(staged.buttonNamed('Brush'))['accessibilityState'],
    ).toMatchObject({ checked: false })

    // ArrowDown skips disabled Eraser -> selects Lasso
    staged.fixture.send(RadioGroup.PressedRadioKey({ key: 'ArrowDown' }))
    expect(
      propsOf(staged.buttonNamed('Lasso'))['accessibilityState'],
    ).toMatchObject({ checked: true })

    // Tap Brush label -> selects Brush
    callProp(staged.buttonNamed('Brush label'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Brush'))['accessibilityState'],
    ).toMatchObject({ checked: true })
  })

  it('respects disabled group and readOnly guards on the RN generic host', () => {
    const disabled = stage({ isDisabled: true, defaultValue: 'brush' })
    expect(
      propsOf(disabled.viewWithId('fixture-radio-group'))['accessibilityState'],
    ).toMatchObject({ disabled: true })
    expect(
      propsOf(disabled.buttonNamed('Fill'))['accessibilityState'],
    ).toMatchObject({ checked: false, disabled: true })
    disabled.fixture.press('SelectRadioOption:fill')
    expect(
      RadioGroup.selectedValueOf(
        disabled.fixture.radioGroupState(),
        disabled.fixture.props,
      ),
    ).toEqual(Option.some('brush'))

    const readOnly = stage({ isReadOnly: true, defaultValue: 'brush' })
    callProp(readOnly.buttonNamed('Fill'), 'onPress')
    expect(
      RadioGroup.selectedValueOf(
        readOnly.fixture.radioGroupState(),
        readOnly.fixture.props,
      ),
    ).toEqual(Option.some('brush'))
  })
})
