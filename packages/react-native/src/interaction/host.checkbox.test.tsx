import { Checkbox } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { CheckboxFixture } from 'foldkit/test'
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

// NOTE: proves the core Checkbox Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Checkbox-specific
// painter logic.

const stageRunning = (fixture: CheckboxFixture.Running) => {
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

describe('core Checkbox Part on the React Native generic host', () => {
  it('paints tri-state accessibilityState.checked (false, true, mixed) and toggles via Control and Label through generic RN hostPropsOf', () => {
    const staged = stageRunning(CheckboxFixture.start())

    expect(
      propsOf(staged.buttonNamed('Accept terms checkbox'))[
        'accessibilityState'
      ],
    ).toMatchObject({ checked: false, disabled: false })
    expect(
      propsOf(staged.viewWithId('fixture-checkbox-description'))['nativeID'],
    ).toBe('fixture-checkbox-description')

    // Tap control -> Checked
    callProp(staged.buttonNamed('Accept terms checkbox'), 'onPress')
    expect(staged.fixture.checkboxState()).toEqual(Checkbox.Checked())
    expect(
      propsOf(staged.buttonNamed('Accept terms checkbox'))[
        'accessibilityState'
      ],
    ).toMatchObject({ checked: true })

    // Tap label -> Unchecked
    callProp(staged.buttonNamed('Accept terms'), 'onPress')
    expect(staged.fixture.checkboxState()).toEqual(Checkbox.Unchecked())
    expect(
      propsOf(staged.buttonNamed('Accept terms checkbox'))[
        'accessibilityState'
      ],
    ).toMatchObject({ checked: false })

    // Indeterminate -> accessibilityState.checked === 'mixed', next tap -> Checked
    staged.fixture.send(Checkbox.SetCheckboxIndeterminate())
    expect(
      propsOf(staged.buttonNamed('Accept terms checkbox'))[
        'accessibilityState'
      ],
    ).toMatchObject({ checked: 'mixed' })

    callProp(staged.buttonNamed('Accept terms checkbox'), 'onPress')
    expect(staged.fixture.checkboxState()).toEqual(Checkbox.Checked())
    expect(
      propsOf(staged.buttonNamed('Accept terms checkbox'))[
        'accessibilityState'
      ],
    ).toMatchObject({ checked: true })
  })

  it('guards disabled and readOnly checkboxes and projects native disabled state', () => {
    const disabled = stageRunning(
      CheckboxFixture.start(
        { id: 'rn-disabled-box', isDisabled: true },
        { initial: Checkbox.Indeterminate() },
      ),
    )

    expect(
      propsOf(disabled.buttonNamed('Accept terms checkbox'))[
        'accessibilityState'
      ],
    ).toMatchObject({ checked: 'mixed', disabled: true })

    disabled.fixture.press(Checkbox.ToggleCheckbox.tag)
    expect(disabled.fixture.checkboxState()).toEqual(Checkbox.Indeterminate())

    const readOnly = stageRunning(
      CheckboxFixture.start(
        { id: 'rn-readonly-box', isReadOnly: true },
        { initial: Checkbox.Checked() },
      ),
    )
    expect(
      propsOf(readOnly.buttonNamed('Accept terms checkbox'))[
        'accessibilityState'
      ],
    ).toMatchObject({ checked: true, disabled: true })

    readOnly.fixture.send(Checkbox.ToggleCheckbox())
    expect(readOnly.fixture.checkboxState()).toEqual(Checkbox.Checked())
  })
})
