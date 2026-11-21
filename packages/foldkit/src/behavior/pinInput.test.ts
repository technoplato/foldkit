import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as PinInput from './pinInput.js'
import * as Slot from './slot.js'

const defaultProps: PinInput.Props = {
  id: 'otp',
  length: 6,
  pinType: 'Numeric',
  hasLabel: true,
}

const step = (
  state: PinInput.State,
  message: PinInput.Message,
  props: PinInput.Props = defaultProps,
): PinInput.State => PinInput.chart.transition(state, message, props)[0]

describe('PinInput Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'PinInput', chart: PinInput.chart }),
    ).toEqual([])
    expect(Part.problemsOf(PinInput.part)).toEqual([])
    expect(Part.problemsOf(PinInput.secret())).toEqual([])
    expect(Part.problemsOf(PinInput.deviceOnly())).toEqual([])
    expect(
      Part.problemsOf(
        PinInput.make({ name: 'VerifyPin', length: 4, defaultValue: '12' }),
      ),
    ).toEqual([])

    PinInput.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('derives element IDs, validation rules, and effective input types', () => {
    expect(PinInput.rootId('otp')).toBe('otp-root')
    expect(PinInput.inputId('otp', 0)).toBe('otp-input-0')
    expect(PinInput.labelId('otp')).toBe('otp-label')

    expect(PinInput.isValidPinChar('5', 'Numeric')).toBe(true)
    expect(PinInput.isValidPinChar('a', 'Numeric')).toBe(false)
    expect(PinInput.isValidPinChar('a', 'Alphanumeric')).toBe(true)
    expect(PinInput.isValidPinChar('9', 'Alphanumeric')).toBe(true)
    expect(PinInput.isValidPinChar('!', 'Alphanumeric')).toBe(false)
    expect(PinInput.isValidPinChar('Z', 'Alphabetic')).toBe(true)
    expect(PinInput.isValidPinChar('3', 'Alphabetic')).toBe(false)

    expect(PinInput.sanitizePinText('12-34 56', 'Numeric')).toBe('123456')
    expect(PinInput.sanitizePinText('ab-12!', 'Alphanumeric')).toBe('ab12')
    expect(PinInput.sanitizePinText('a1b2c3', 'Alphabetic')).toBe('abc')

    expect(PinInput.effectiveInputTypeOf({ pinType: 'Numeric' })).toBe('tel')
    expect(PinInput.effectiveInputTypeOf({ pinType: 'Alphanumeric' })).toBe(
      'text',
    )
    expect(
      PinInput.effectiveInputTypeOf({ pinType: 'Numeric', mask: true }),
    ).toBe('password')
  })

  it('auto-advances on entry, rejects invalid characters, and detects completion', () => {
    let state = step(PinInput.initial, PinInput.BeginPinEdit())
    expect(PinInput.isEditing(state)).toBe(true)
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(0))

    // Reject non-numeric in Numeric mode
    const rejected = step(
      state,
      PinInput.ChangePinSlot({ index: 0, value: 'a' }),
    )
    expect(rejected).toEqual(state)

    state = step(state, PinInput.ChangePinSlot({ index: 0, value: '4' }))
    expect(PinInput.slotValueAt(state, 0)).toBe('4')
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(1))
    expect(PinInput.isCompleteOf(state, defaultProps)).toBe(false)

    state = step(state, PinInput.PressedPinKey({ key: '2' }))
    expect(PinInput.valueOf(state, defaultProps)).toBe('42')
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(2))

    // Complete 4-slot pin with blurOnComplete
    const shortProps: PinInput.Props = {
      id: 'short',
      length: 4,
      pinType: 'Alphanumeric',
      blurOnComplete: true,
    }
    let short = PinInput.initialValue('', shortProps)
    short = step(
      short,
      PinInput.ChangePinSlot({ index: 0, value: 'A' }),
      shortProps,
    )
    short = step(
      short,
      PinInput.ChangePinSlot({ index: 1, value: '1' }),
      shortProps,
    )
    short = step(
      short,
      PinInput.ChangePinSlot({ index: 2, value: 'B' }),
      shortProps,
    )
    expect(PinInput.isCompleteOf(short, shortProps)).toBe(false)
    short = step(
      short,
      PinInput.ChangePinSlot({ index: 3, value: '2' }),
      shortProps,
    )
    expect(PinInput.isCompleteOf(short, shortProps)).toBe(true)
    expect(PinInput.valueOf(short, shortProps)).toBe('A1B2')
    expect(PinInput.isIdle(short)).toBe(true)
  })

  it('handles Backspace clear & retreat, Delete, and ArrowLeft/ArrowRight/Home/End navigation', () => {
    let state = step(
      PinInput.initialValue('123', defaultProps),
      PinInput.FocusPinSlot({ index: 3 }),
    )
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(3))

    // Backspace on empty slot 3 retreats to slot 2 and clears '3'
    state = step(state, PinInput.PressedPinKey({ key: 'Backspace' }))
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(2))
    expect(PinInput.valueOf(state, defaultProps)).toBe('12')

    // ArrowLeft moves 2 -> 1
    state = step(state, PinInput.PressedPinKey({ key: 'ArrowLeft' }))
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(1))

    // Backspace on filled slot 1 clears '2' and retreats to slot 0
    state = step(state, PinInput.PressedPinKey({ key: 'Backspace' }))
    expect(PinInput.slotValueAt(state, 1)).toBe('')
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(0))

    // ArrowRight moves 0 -> 1, End moves to 5, Home moves to 0
    state = step(state, PinInput.PressedPinKey({ key: 'ArrowRight' }))
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(1))
    state = step(state, PinInput.PressedPinKey({ key: 'End' }))
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(5))
    state = step(state, PinInput.PressedPinKey({ key: 'Home' }))
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(0))

    // Delete clears slot 0 without retreating
    state = step(state, PinInput.PressedPinKey({ key: 'Delete' }))
    expect(PinInput.slotValueAt(state, 0)).toBe('')
    expect(PinInput.focusedIndexOf(state)).toEqual(Option.some(0))
  })

  it('distributes multi-character pastes across slots and handles Clear/Reset', () => {
    const pasted = step(
      PinInput.initial,
      PinInput.PastePin({ value: '98-76-54' }),
    )
    expect(PinInput.valueOf(pasted, defaultProps)).toBe('987654')
    expect(PinInput.isCompleteOf(pasted, defaultProps)).toBe(true)
    expect(PinInput.focusedIndexOf(pasted)).toEqual(Option.some(5))

    // Multi-char entry on a slot also distributes from that slot
    const partial = step(
      PinInput.initialValue('12', defaultProps),
      PinInput.ChangePinSlot({ index: 2, value: '3456' }),
    )
    expect(PinInput.valueOf(partial, defaultProps)).toBe('123456')

    const cleared = step(partial, PinInput.ClearPin())
    expect(PinInput.isEmptyOf(cleared, defaultProps)).toBe(true)

    const reset = step(cleared, PinInput.ResetPin(), {
      ...defaultProps,
      defaultValue: '007',
    })
    expect(PinInput.isIdle(reset)).toBe(true)
    expect(PinInput.valueOf(reset, defaultProps)).toBe('007')
  })

  it('supports secret() Device(Secret) sync, disabled/readOnly guards, atRest, JSON round-trip, and reference-stable SlotBindings', () => {
    const secretPart = PinInput.secret({ name: 'OtpSecret' })
    expect(secretPart.sync.ChangePinSlot).toEqual(
      Pace.Device({ because: 'Secret' }),
    )
    expect(secretPart.sync.PastePin).toEqual(Pace.Device({ because: 'Secret' }))
    expect(PinInput.synced.ChangePinSlot).toEqual(
      Pace.Settled({ afterMs: 200 }),
    )
    expect(PinInput.synced.PastePin).toEqual(Pace.Synced())

    const disabledProps: PinInput.Props = { ...defaultProps, isDisabled: true }
    expect(
      step(
        PinInput.initial,
        PinInput.ChangePinSlot({ index: 0, value: '1' }),
        disabledProps,
      ),
    ).toEqual(PinInput.initial)

    const editing = step(
      PinInput.initial,
      PinInput.ChangePinSlot({ index: 0, value: '7' }),
    )
    const rested = PinInput.atRest(editing)
    expect(PinInput.isIdle(rested)).toBe(true)
    expect(PinInput.valueOf(rested, defaultProps)).toBe('7')

    const encoded = S.encodeSync(PinInput.State)(editing)
    expect(S.decodeUnknownSync(PinInput.State)(encoded)).toEqual(editing)

    const view1 = Part.view(PinInput.part, editing, defaultProps)
    const view2 = Part.view(PinInput.part, editing, { ...defaultProps })
    expect(view1).toBe(view2)
    expect(view1.slot('Input', '1')).toBe(view2.slot('Input', '1'))

    expect(Slot.ariaOf(view1.slot('Root'))['role']).toBe('group')
    expect(Slot.ariaOf(view1.slot('Input', '1'))['tabindex']).toBe('0')
    expect(Slot.ariaOf(view1.slot('Input', '1'))['aria-current']).toBe('true')
    expect(Slot.ariaOf(view1.slot('Input', '0'))['tabindex']).toBe('-1')
    expect(Slot.ariaOf(view1.slot('Input', '0'))['aria-label']).toBe(
      'PIN character 1 of 6',
    )

    const root1 = view1.slot('Root')
    const slot4 = view1.slot('Input', '4')
    const next = step(editing, PinInput.ChangePinSlot({ index: 1, value: '8' }))
    const view3 = Part.view(PinInput.part, next, defaultProps)
    expect(view3.slot('Root')).toBe(root1)
    expect(view3.slot('Input', '4')).toBe(slot4)
  })
})
