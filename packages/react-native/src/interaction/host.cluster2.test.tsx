import { Option } from 'effect'
import {
  CascadeSelect,
  NumberInput,
  Part,
  PinInput,
  TagsInput,
  TreeView,
} from 'foldkit/behavior'
import type { ButtonNode, TextInputNode } from 'foldkit/renderers'
import { Cluster2Fixture } from 'foldkit/test'
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

// NOTE: proves all 6 Zag/Radix Cluster 2 core Parts (NumberInput, PinInput,
// TagsInput, CascadeSelect, TreeView, Pagination) on the React Native painter
// through the existing generic RN host (`interaction/host.ts`), with zero
// widget-specific painter logic.

const isTextInputNode = (value: unknown): value is TextInputNode =>
  typeof value === 'object' &&
  value !== null &&
  '_tag' in value &&
  value._tag === 'TextInput'

const stage = (overrides: Cluster2Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster2Fixture.start(overrides)
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
  const fieldWithId = (id: string): TextInputNode => {
    const element = firstOf(hostsOf(painted(), TokenField), candidate => {
      const node = propsOf(candidate)['input']
      return isTextInputNode(node) && node.slot?.id === id
    })
    const candidate = propsOf(element)['input']
    if (isTextInputNode(candidate)) {
      return candidate
    }
    throw new Error(`TokenField missing input node ${id}`)
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

  return { fixture, fieldWithId, buttonNamed, viewWithId, onInput }
}

describe('Cluster 2 core Parts on the React Native generic host', () => {
  it('proves NumberInput, PinInput, and TagsInput accessibility and interactions', () => {
    const staged = stage()

    // NumberInput
    const numField = staged.fieldWithId('c2-number-input')
    expect(textInputPropsOf(Option.fromNullishOr(numField.slot)).nativeID).toBe(
      'c2-number-input',
    )
    expect(
      propsOf(staged.viewWithId('c2-number-scrubber'))['accessibilityRole'],
    ).toBe('adjustable')
    expect(
      propsOf(staged.viewWithId('c2-number-scrubber'))['accessibilityValue'],
    ).toEqual({
      min: 0,
      max: 100,
      now: 20,
      text: '20',
    })
    callProp(staged.buttonNamed('Increment'), 'onPress')
    expect(NumberInput.valueOf(staged.fixture.numberState())).toEqual(
      Option.some(25),
    )
    expect(
      propsOf(staged.viewWithId('c2-number-scrubber'))['accessibilityValue'],
    ).toEqual({
      min: 0,
      max: 100,
      now: 25,
      text: '25',
    })

    // PinInput
    expect(propsOf(staged.viewWithId('c2-pin-root'))['nativeID']).toBe(
      'c2-pin-root',
    )
    const pinSlot0 = staged.fieldWithId('c2-pin-input-0')
    staged.onInput(pinSlot0.token ?? '', '4')
    expect(PinInput.slotValueAt(staged.fixture.pinState(), 0)).toBe('4')
    expect(PinInput.focusedIndexOf(staged.fixture.pinState())).toEqual(
      Option.some(1),
    )

    // TagsInput
    expect(propsOf(staged.viewWithId('c2-tags-root'))['nativeID']).toBe(
      'c2-tags-root',
    )
    const tagsField = staged.fieldWithId('c2-tags-input')
    staged.onInput(tagsField.token ?? '', 'mobile,')
    expect(TagsInput.tagsOf(staged.fixture.tagsState())).toEqual([
      'foldkit',
      'mobile',
    ])
    callProp(staged.buttonNamed('Delete foldkit'), 'onPress')
    expect(TagsInput.tagsOf(staged.fixture.tagsState())).toEqual(['mobile'])
  })

  it('proves CascadeSelect, TreeView, and Pagination accessibility and interactions', () => {
    const staged = stage()

    // CascadeSelect
    const trigger = staged.buttonNamed('Choose location')
    expect(propsOf(trigger)['accessibilityState']).toMatchObject({
      expanded: false,
    })
    callProp(trigger, 'onPress')
    expect(
      propsOf(staged.buttonNamed('Choose location'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    callProp(staged.buttonNamed('California'), 'onPress')
    callProp(staged.buttonNamed('San Francisco'), 'onPress')
    expect(CascadeSelect.selectedIdsOf(staged.fixture.cascadeState())).toEqual([
      'sf',
    ])
    expect(
      propsOf(staged.buttonNamed('United States / California / San Francisco'))[
        'accessibilityState'
      ],
    ).toMatchObject({ expanded: false })

    // TreeView
    expect(propsOf(staged.viewWithId('c2-tree-tree'))['nativeID']).toBe(
      'c2-tree-tree',
    )
    callProp(staged.buttonNamed('Expand src'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Collapse src'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    callProp(staged.buttonNamed('Tree index.ts'), 'onPress')
    expect(TreeView.selectedIdsOf(staged.fixture.treeState())).toEqual([
      'index',
    ])
    expect(
      propsOf(staged.buttonNamed('Tree index.ts'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    // Pagination
    expect(propsOf(staged.viewWithId('c2-pagination-root'))['nativeID']).toBe(
      'c2-pagination-root',
    )
    expect(
      propsOf(staged.buttonNamed('Page 1'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    callProp(staged.buttonNamed('Next page'), 'onPress')
    expect(staged.fixture.paginationState().page).toBe(2)
    expect(
      propsOf(staged.buttonNamed('Page 2'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    callProp(staged.buttonNamed('Page 10'), 'onPress')
    expect(staged.fixture.paginationState().page).toBe(10)
    expect(
      propsOf(staged.buttonNamed('Next page'))['accessibilityState'],
    ).toMatchObject({ disabled: true })
  })

  it('derives React Native inputMode, enterKeyHint, autoComplete, and iOS oneTimeCode textContentType from Core SlotBindings', () => {
    const negNum = Part.view(NumberInput.part, NumberInput.initial, {
      id: 'temp',
      min: -20,
    })
    expect(textInputPropsOf(Option.some(negNum.slot('Input')))).toMatchObject({
      inputMode: 'text',
      enterKeyHint: 'done',
    })

    const otpPin = Part.view(PinInput.part, PinInput.initial, {
      id: 'otp',
      isOtp: true,
    })
    expect(
      textInputPropsOf(Option.some(otpPin.slot('Input', '0'))),
    ).toMatchObject({
      inputMode: 'numeric',
      autoComplete: 'one-time-code',
      textContentType: 'oneTimeCode',
    })
  })
})
