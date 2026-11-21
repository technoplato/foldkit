import { Option } from 'effect'
import { Input } from 'foldkit/behavior'
import type { ButtonNode, TextInputNode } from 'foldkit/renderers'
import { InputFixture } from 'foldkit/test'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { callProp, firstOf, hostsOf, propsOf } from '../test/elements.js'
import { TokenField } from './field.js'
import { textInputPropsOf } from './host.js'
import { paintTree } from './screen.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)
vi.mock('../theme/themed.js', async () => {
  const { lightLook: look } = await import('./look.js')
  return { useLook: () => look }
})

// NOTE: proves the core Input Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Input-specific
// painter logic.

const isTextInputNode = (value: unknown): value is TextInputNode =>
  typeof value === 'object' &&
  value !== null &&
  '_tag' in value &&
  value._tag === 'TextInput'

const stage = (overrides: Partial<Input.Props> = {}) => {
  const fixture = InputFixture.start(overrides)
  const onPress = (button: ButtonNode): void => {
    const tag = button.action ?? button.token
    if (tag !== undefined) {
      fixture.press(tag)
    }
  }
  const onInput = (token: string, value: string): void => {
    fixture.type(token, value)
  }
  const painted = (): ReactElement =>
    paintTree(fixture.tree(), { onPress, onInput })
  const fieldNode = (): TextInputNode => {
    const element = firstOf(hostsOf(painted(), TokenField), candidate =>
      isTextInputNode(propsOf(candidate)['input']),
    )
    const candidate = propsOf(element)['input']
    if (isTextInputNode(candidate)) {
      return candidate
    }
    throw new Error('TokenField missing input node')
  }
  const buttonNamed = (label: string): ReactElement =>
    firstOf(hostsOf(painted(), 'Pressable'), element =>
      String(propsOf(element)['accessibilityLabel']).endsWith(label),
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, fieldNode, buttonNamed, viewWithId, onInput }
}

describe('core Input Part on the React Native generic host', () => {
  it('paints nativeID and accessibility state, handles typing, commit, clear, and password visibility toggle', () => {
    const staged = stage({ type: 'password' })

    const input = staged.fieldNode()
    const hostProps = textInputPropsOf(Option.fromNullishOr(input.slot))
    expect(hostProps.nativeID).toBe('fixture-input-input')
    expect(hostProps.editable).toBeUndefined()
    expect(input.value).toBe('')
    expect(
      propsOf(staged.viewWithId('fixture-input-description'))['nativeID'],
    ).toBe('fixture-input-description')

    staged.onInput(input.token ?? '', 's3cr3t')
    expect(Input.draftOf(staged.fixture.inputState())).toBe('s3cr3t')
    expect(staged.fieldNode().value).toBe('s3cr3t')

    const visibilityButton = staged.buttonNamed('Show password')
    expect(propsOf(visibilityButton)['accessibilityState']).toMatchObject({
      selected: false,
    })
    callProp(visibilityButton, 'onPress')
    expect(Input.isPasswordVisible(staged.fixture.inputState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Hide password'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    callProp(staged.buttonNamed('Clear'), 'onPress')
    expect(Input.valueOf(staged.fixture.inputState())).toBe('')
    expect(staged.fieldNode().value).toBe('')
  })

  it('sets editable=false and blocks edits when disabled or readOnly', () => {
    const disabled = stage({ isDisabled: true, defaultValue: 'locked' })
    const disabledHost = textInputPropsOf(
      Option.fromNullishOr(disabled.fieldNode().slot),
    )
    expect(disabledHost.editable).toBe(false)
    expect(disabledHost.accessibilityState).toMatchObject({ disabled: true })
    disabled.onInput(disabled.fieldNode().token ?? '', 'nope')
    expect(Input.draftOf(disabled.fixture.inputState())).toBe('locked')

    const readOnly = stage({ isReadOnly: true, defaultValue: 'readonly' })
    const readOnlyHost = textInputPropsOf(
      Option.fromNullishOr(readOnly.fieldNode().slot),
    )
    expect(readOnlyHost.editable).toBe(false)
    readOnly.onInput(readOnly.fieldNode().token ?? '', 'nope')
    expect(Input.draftOf(readOnly.fixture.inputState())).toBe('readonly')
  })
})
