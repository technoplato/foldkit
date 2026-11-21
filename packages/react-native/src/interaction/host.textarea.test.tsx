import { Option } from 'effect'
import { Textarea } from 'foldkit/behavior'
import type { ButtonNode, TextInputNode } from 'foldkit/renderers'
import { TextareaFixture } from 'foldkit/test'
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

// NOTE: proves the core Textarea Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero
// Textarea-specific painter logic.

const isTextInputNode = (value: unknown): value is TextInputNode =>
  typeof value === 'object' &&
  value !== null &&
  '_tag' in value &&
  value._tag === 'TextInput'

const stage = (overrides: Partial<Textarea.Props> = {}) => {
  const fixture = TextareaFixture.start(overrides)
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

describe('core Textarea Part on the React Native generic host', () => {
  it('paints nativeID and multiline=true, handles multiline typing, Mod+Enter commit, and clear', () => {
    const staged = stage()

    const field = staged.fieldNode()
    const hostProps = textInputPropsOf(Option.fromNullishOr(field.slot))
    expect(hostProps.nativeID).toBe('fixture-textarea-textarea')
    expect(hostProps.multiline).toBe(true)
    expect(hostProps.editable).toBeUndefined()
    expect(field.value).toBe('')
    expect(
      propsOf(staged.viewWithId('fixture-textarea-description'))['nativeID'],
    ).toBe('fixture-textarea-description')

    staged.onInput(field.token ?? '', 'First line\nSecond line')
    expect(Textarea.draftOf(staged.fixture.textareaState())).toBe(
      'First line\nSecond line',
    )
    expect(staged.fieldNode().value).toBe('First line\nSecond line')

    staged.fixture.send(
      Textarea.PressedTextareaKey({ key: 'Enter', isMeta: true }),
    )
    expect(Textarea.isIdle(staged.fixture.textareaState())).toBe(true)
    expect(Textarea.valueOf(staged.fixture.textareaState())).toBe(
      'First line\nSecond line',
    )

    callProp(staged.buttonNamed('Clear'), 'onPress')
    expect(Textarea.valueOf(staged.fixture.textareaState())).toBe('')
    expect(staged.fieldNode().value).toBe('')
  })

  it('sets editable=false and blocks edits when disabled or readOnly', () => {
    const disabled = stage({ isDisabled: true, defaultValue: 'locked' })
    const disabledHost = textInputPropsOf(
      Option.fromNullishOr(disabled.fieldNode().slot),
    )
    expect(disabledHost.multiline).toBe(true)
    expect(disabledHost.editable).toBe(false)
    expect(disabledHost.accessibilityState).toMatchObject({ disabled: true })
    disabled.onInput(disabled.fieldNode().token ?? '', 'nope')
    expect(Textarea.draftOf(disabled.fixture.textareaState())).toBe('locked')

    const readOnly = stage({ isReadOnly: true, defaultValue: 'readonly' })
    const readOnlyHost = textInputPropsOf(
      Option.fromNullishOr(readOnly.fieldNode().slot),
    )
    expect(readOnlyHost.multiline).toBe(true)
    expect(readOnlyHost.editable).toBe(false)
    readOnly.onInput(readOnly.fieldNode().token ?? '', 'nope')
    expect(Textarea.draftOf(readOnly.fixture.textareaState())).toBe('readonly')
  })
})
