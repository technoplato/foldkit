import { Fieldset } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { FieldsetFixture } from 'foldkit/test'
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

// NOTE: proves the core Fieldset Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero
// Fieldset-specific painter logic.

const stage = (
  overrides: Partial<Fieldset.Props> = {},
  options: Readonly<{ defaultDisabled?: boolean }> = {},
) => {
  const fixture = FieldsetFixture.start(overrides, options)
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

describe('core Fieldset Part on the React Native generic host', () => {
  it('paints nativeIDs, alert live regions, submit, failure, and reset', () => {
    const staged = stage()

    expect(
      propsOf(staged.viewWithId('fixture-fieldset-fieldset'))['nativeID'],
    ).toBe('fixture-fieldset-fieldset')
    expect(
      propsOf(staged.viewWithId('fixture-fieldset-legend'))['nativeID'],
    ).toBe('fixture-fieldset-legend')
    expect(
      propsOf(staged.viewWithId('fixture-fieldset-description'))['nativeID'],
    ).toBe('fixture-fieldset-description')

    const hiddenEmailError = propsOf(
      staged.viewWithId('fixture-fieldset-field-email-message'),
    )
    expect(hiddenEmailError['accessibilityRole']).toBe('alert')
    expect(hiddenEmailError['accessibilityLiveRegion']).toBe('polite')
    expect(hiddenEmailError['accessibilityElementsHidden']).toBe(true)

    callProp(staged.buttonNamed('Submit'), 'onPress')
    expect(Fieldset.isSubmitting(staged.fixture.fieldsetState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Submit'))['accessibilityState'],
    ).toMatchObject({ disabled: true })

    staged.fixture.send(
      Fieldset.FailedSubmit({
        error: 'Could not save',
        serverErrors: { email: 'Email already taken' },
      }),
    )
    const visibleEmailError = propsOf(
      staged.viewWithId('fixture-fieldset-field-email-message'),
    )
    expect(visibleEmailError['accessibilityElementsHidden']).toBeUndefined()

    callProp(staged.buttonNamed('Reset'), 'onPress')
    expect(Fieldset.submissionStateOf(staged.fixture.fieldsetState())).toBe(
      'Idle',
    )
    expect(Fieldset.isValidOf(staged.fixture.fieldsetState())).toBe(true)
  })

  it('paints disabled accessibilityState on the group and buttons when disabled', () => {
    const staged = stage({}, { defaultDisabled: true })

    expect(
      propsOf(staged.viewWithId('fixture-fieldset-fieldset'))[
        'accessibilityState'
      ],
    ).toMatchObject({ disabled: true })
    expect(
      propsOf(staged.buttonNamed('Submit'))['accessibilityState'],
    ).toMatchObject({ disabled: true })
    expect(
      propsOf(staged.buttonNamed('Reset'))['accessibilityState'],
    ).toMatchObject({ disabled: true })

    staged.fixture.send(Fieldset.AttemptSubmit())
    expect(Fieldset.submissionStateOf(staged.fixture.fieldsetState())).toBe(
      'Idle',
    )
  })
})
