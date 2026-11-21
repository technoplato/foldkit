import { Option } from 'effect'
import { DateGrid, DatePicker } from 'foldkit/behavior'
import type { ButtonNode, TextInputNode } from 'foldkit/renderers'
import { DatePickerFixture } from 'foldkit/test'
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

// NOTE: proves the core DatePicker Part on the React Native painter through
// the existing generic RN host (`interaction/host.ts`), with zero DatePicker-
// specific painter logic.

const isTextInputNode = (value: unknown): value is TextInputNode =>
  typeof value === 'object' &&
  value !== null &&
  '_tag' in value &&
  value._tag === 'TextInput'

const stage = (overrides: Partial<DatePicker.Props> = {}) => {
  const fixture = DatePickerFixture.start(overrides)
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

describe('core DatePicker Part on the React Native generic host', () => {
  it('paints trigger expanded state, hidden/visible dialog content, input field, day cells, and clear button through generic RN host', () => {
    const staged = stage({ label: 'Departure date' })

    expect(
      propsOf(staged.viewWithId('fixture-date-picker-label'))['nativeID'],
    ).toBe('fixture-date-picker-label')
    expect(
      propsOf(staged.viewWithId('fixture-date-picker-description'))['nativeID'],
    ).toBe('fixture-date-picker-description')

    const input = staged.fieldNode()
    const inputHost = textInputPropsOf(Option.fromNullishOr(input.slot))
    expect(inputHost.nativeID).toBe('fixture-date-picker-input')
    expect(input.value).toBe('')

    // Closed initially: trigger expanded=false, content hidden from accessibility
    expect(
      propsOf(staged.buttonNamed('Pick a date'))['accessibilityState'],
    ).toMatchObject({ expanded: false, disabled: false })
    expect(
      propsOf(staged.viewWithId('fixture-date-picker-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    // Tap trigger -> opens dialog exposing Calendar grid
    callProp(staged.buttonNamed('Pick a date'), 'onPress')
    expect(DatePicker.isOpen(staged.fixture.datePickerState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Pick a date'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.viewWithId('fixture-date-picker-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    // Disabled April 15 reports disabled: true and ignores press
    expect(
      propsOf(staged.buttonNamed('2026-04-15'))['accessibilityState'],
    ).toMatchObject({ selected: false, disabled: true })
    staged.fixture.press('SelectDatePickerDate:2026-04-15')
    expect(DatePicker.isSelectionEmpty(staged.fixture.datePickerState())).toBe(
      true,
    )

    // Tap April 14 -> selects date, auto-closes dialog, updates input & trigger
    callProp(staged.buttonNamed('2026-04-14'), 'onPress')
    expect(DatePicker.isClosed(staged.fixture.datePickerState())).toBe(true)
    expect(DatePicker.selectedDateOf(staged.fixture.datePickerState())).toEqual(
      Option.some(DateGrid.makeDate(2026, 4, 14)),
    )
    expect(staged.fieldNode().value).toBe('2026-04-14')
    expect(
      propsOf(staged.buttonNamed('2026-04-14'))['accessibilityState'],
    ).toMatchObject({ expanded: false })

    // Type a new ISO date into TokenField and commit
    staged.onInput(staged.fieldNode().token ?? '', '2026-05-06')
    staged.fixture.send(DatePicker.CommitDateInput())
    expect(DatePicker.selectedDateOf(staged.fixture.datePickerState())).toEqual(
      Option.some(DateGrid.makeDate(2026, 5, 6)),
    )

    // Clear selection
    callProp(staged.buttonNamed('Clear date'), 'onPress')
    expect(DatePicker.isSelectionEmpty(staged.fixture.datePickerState())).toBe(
      true,
    )
    expect(staged.fieldNode().value).toBe('')
  })

  it('supports Range mode selection and backdrop dismissal on the RN generic host', () => {
    const ranged = stage({ selectionMode: 'Range' })

    callProp(ranged.buttonNamed('Pick a date'), 'onPress')
    callProp(ranged.buttonNamed('2026-04-10'), 'onPress')
    expect(DatePicker.isOpen(ranged.fixture.datePickerState())).toBe(true)

    callProp(ranged.buttonNamed('2026-04-14'), 'onPress')
    expect(DatePicker.isClosed(ranged.fixture.datePickerState())).toBe(true)
    expect(
      DatePicker.selectedRangeOf(ranged.fixture.datePickerState()),
    ).toEqual(
      Option.some({
        start: DateGrid.makeDate(2026, 4, 10),
        end: DateGrid.makeDate(2026, 4, 14),
      }),
    )

    // Reopen and dismiss via backdrop
    callProp(ranged.buttonNamed('2026-04-10 - 2026-04-14'), 'onPress')
    expect(DatePicker.isOpen(ranged.fixture.datePickerState())).toBe(true)
    callProp(ranged.buttonNamed('Dismiss date picker'), 'onPress')
    expect(DatePicker.isClosed(ranged.fixture.datePickerState())).toBe(true)
  })
})
