import { Option } from 'effect'
import { Combobox } from 'foldkit/behavior'
import type { ButtonNode, TextInputNode } from 'foldkit/renderers'
import { ComboboxFixture } from 'foldkit/test'
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

// NOTE: proves the core Combobox Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Combobox-
// specific painter logic.

const isTextInputNode = (value: unknown): value is TextInputNode =>
  typeof value === 'object' &&
  value !== null &&
  '_tag' in value &&
  value._tag === 'TextInput'

const stage = (overrides: Partial<Combobox.Props> = {}) => {
  const fixture = ComboboxFixture.start(overrides)
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
    firstOf(
      hostsOf(painted(), 'Pressable'),
      element => propsOf(element)['accessibilityLabel'] === label,
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, fieldNode, buttonNamed, viewWithId, onInput }
}

describe('core Combobox Part on the React Native generic host', () => {
  it('paints combobox input nativeID/expanded state, filters options on typing, and selects through generic RN host', () => {
    const staged = stage({ label: 'Favorite fruit' })

    const input = staged.fieldNode()
    const closedHostProps = textInputPropsOf(Option.fromNullishOr(input.slot))
    expect(closedHostProps.nativeID).toBe('fixture-combobox-input')
    expect(closedHostProps.accessibilityState).toMatchObject({
      expanded: false,
    })
    expect(
      propsOf(staged.viewWithId('fixture-combobox-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    // Typing 'creme' opens popup and filters to Crème Brûlée
    staged.onInput(input.token ?? '', 'creme')
    expect(Combobox.isOpen(staged.fixture.comboboxState())).toBe(true)
    const openHostProps = textInputPropsOf(
      Option.fromNullishOr(staged.fieldNode().slot),
    )
    expect(openHostProps.accessibilityState).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.viewWithId('fixture-combobox-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    // Tap Crème Brûlée option -> selects and closes popup
    callProp(staged.buttonNamed('Crème Brûlée'), 'onPress')
    expect(Combobox.isClosed(staged.fixture.comboboxState())).toBe(true)
    expect(Combobox.selectedValuesOf(staged.fixture.comboboxState())).toEqual([
      'creme',
    ])
    expect(staged.fieldNode().value).toBe('Crème Brûlée')
  })

  it('supports Multiple mode toggling, disabled option guards, and backdrop dismissal on the RN generic host', () => {
    const multi = stage({ selectionMode: 'Multiple' })

    callProp(multi.buttonNamed('Toggle options'), 'onPress')
    expect(Combobox.isOpen(multi.fixture.comboboxState())).toBe(true)

    // Disabled Banana option reports disabled: true and ignores press
    expect(
      propsOf(multi.buttonNamed('Banana'))['accessibilityState'],
    ).toMatchObject({ selected: false, disabled: true })
    multi.fixture.press('SelectComboboxOption:banana')
    expect(Combobox.isSelectionEmpty(multi.fixture.comboboxState())).toBe(true)

    // Select Apple and Cherry; stays open
    callProp(multi.buttonNamed('Apple'), 'onPress')
    callProp(multi.buttonNamed('Cherry'), 'onPress')
    expect(Combobox.isOpen(multi.fixture.comboboxState())).toBe(true)
    expect(Combobox.selectedValuesOf(multi.fixture.comboboxState())).toEqual([
      'apple',
      'cherry',
    ])

    // Tap backdrop dismiss -> closes while preserving selections
    callProp(multi.buttonNamed('Dismiss combobox'), 'onPress')
    expect(Combobox.isClosed(multi.fixture.comboboxState())).toBe(true)
    expect(Combobox.selectedValuesOf(multi.fixture.comboboxState())).toEqual([
      'apple',
      'cherry',
    ])
  })
})
