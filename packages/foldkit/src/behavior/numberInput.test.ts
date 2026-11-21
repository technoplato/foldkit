import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as Block from './block.js'
import * as NumberInput from './numberInput.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const defaultProps: NumberInput.Props = {
  id: 'qty',
  min: 0,
  max: 100,
  step: 5,
  largeStep: 20,
  defaultValue: 10,
  hasLabel: true,
}

const step = (
  state: NumberInput.State,
  message: NumberInput.Message,
  props: NumberInput.Props = defaultProps,
): NumberInput.State => NumberInput.chart.transition(state, message, props)[0]

describe('NumberInput Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'NumberInput', chart: NumberInput.chart }),
    ).toEqual([])
    expect(Part.problemsOf(NumberInput.part)).toEqual([])
    expect(
      Part.problemsOf(
        NumberInput.make({
          name: 'PriceInput',
          defaultValue: 25,
          precision: 2,
          settleMs: 150,
          sampleMs: 40,
        }),
      ),
    ).toEqual([])
    expect(Part.problemsOf(NumberInput.deviceOnly())).toEqual([])

    NumberInput.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('derives element IDs and pure numeric parse, round, format, and clamp helpers', () => {
    expect(NumberInput.inputId('qty')).toBe('qty-input')
    expect(NumberInput.incrementButtonId('qty')).toBe('qty-increment')
    expect(NumberInput.decrementButtonId('qty')).toBe('qty-decrement')
    expect(NumberInput.scrubberId('qty')).toBe('qty-scrubber')
    expect(NumberInput.labelId('qty')).toBe('qty-label')

    expect(NumberInput.parseNumber('42.5')).toEqual(Option.some(42.5))
    expect(NumberInput.parseNumber('  -0  ')).toEqual(Option.some(0))
    expect(NumberInput.parseNumber('1e2')).toEqual(Option.some(100))
    expect(NumberInput.parseNumber('')).toEqual(Option.none())
    expect(NumberInput.parseNumber('-')).toEqual(Option.none())
    expect(NumberInput.parseNumber('abc')).toEqual(Option.none())

    expect(NumberInput.roundNumber(0.1 + 0.2, { step: 0.1 })).toBe(0.3)
    expect(NumberInput.roundNumber(3.14159, { precision: 2 })).toBe(3.14)
    expect(NumberInput.formatNumber(5, { precision: 2 })).toBe('5.00')
    expect(NumberInput.formatNumber(-0)).toBe('0')

    expect(NumberInput.clampToBounds(150, { min: 0, max: 100 })).toBe(100)
    expect(NumberInput.clampToBounds(-5, { min: 0, max: 100 })).toBe(0)
    expect(NumberInput.clampToBounds(50, {})).toBe(50)
  })

  it('handles FieldDraft typing, precision formatting, clampOnBlur, allowOverflow, and cancel', () => {
    const start = NumberInput.initialValue(10)
    const editing = step(start, NumberInput.BeginNumberEdit())
    expect(NumberInput.isEditing(editing)).toBe(true)

    const typed = step(editing, NumberInput.ChangeNumberInput({ value: '150' }))
    expect(NumberInput.textOf(typed)).toBe('150')
    expect(NumberInput.valueOf(typed)).toEqual(Option.some(150))
    expect(NumberInput.isOutOfRange(typed, defaultProps)).toBe(true)

    // Blur clamps to max by default (clampOnBlur = !allowOverflow)
    const blurred = step(typed, NumberInput.EndNumberEdit())
    expect(NumberInput.isIdle(blurred)).toBe(true)
    expect(NumberInput.valueOf(blurred)).toEqual(Option.some(100))
    expect(NumberInput.textOf(blurred)).toBe('100')

    // With allowOverflow: true and clampOnBlur omitted, overflow stays unclamped
    const overflowProps: NumberInput.Props = {
      ...defaultProps,
      allowOverflow: true,
      precision: 2,
    }
    const overflowCommitted = step(
      step(
        start,
        NumberInput.ChangeNumberInput({ value: '123.456' }),
        overflowProps,
      ),
      NumberInput.CommitNumberInput(),
      overflowProps,
    )
    expect(NumberInput.valueOf(overflowCommitted)).toEqual(Option.some(123.46))
    expect(NumberInput.textOf(overflowCommitted)).toBe('123.46')
    expect(NumberInput.isOutOfRange(overflowCommitted, overflowProps)).toBe(
      true,
    )

    // Invalid text reverts to previously committed value on commit
    const invalidDraft = step(
      NumberInput.initialValue(25),
      NumberInput.ChangeNumberInput({ value: 'not-a-number' }),
    )
    expect(NumberInput.valueOf(invalidDraft)).toEqual(Option.none())
    const reverted = step(invalidDraft, NumberInput.CommitNumberInput())
    expect(NumberInput.isIdle(reverted)).toBe(true)
    expect(NumberInput.valueOf(reverted)).toEqual(Option.some(25))
    expect(NumberInput.textOf(reverted)).toBe('25')

    // Empty draft commits to Option.none()
    const clearedDraft = step(
      NumberInput.initialValue(25),
      NumberInput.ChangeNumberInput({ value: '' }),
    )
    const committedEmpty = step(clearedDraft, NumberInput.CommitNumberInput())
    expect(NumberInput.isEmpty(committedEmpty)).toBe(true)
    expect(NumberInput.valueOf(committedEmpty)).toEqual(Option.none())

    // Escape cancels active draft back to committed baseline
    const cancelled = step(
      step(
        NumberInput.initialValue(30),
        NumberInput.ChangeNumberInput({ value: '99' }),
      ),
      NumberInput.PressedNumberKey({ key: 'Escape' }),
    )
    expect(NumberInput.isIdle(cancelled)).toBe(true)
    expect(NumberInput.valueOf(cancelled)).toEqual(Option.some(30))
  })

  it('handles increment, decrement, min, max, keyboard stepping, clear, and reset', () => {
    const fromEmpty = step(NumberInput.initial, NumberInput.IncrementNumber())
    expect(NumberInput.valueOf(fromEmpty)).toEqual(Option.some(5))

    const up = step(fromEmpty, NumberInput.PressedNumberKey({ key: 'ArrowUp' }))
    expect(NumberInput.valueOf(up)).toEqual(Option.some(10))

    const shiftUp = step(
      up,
      NumberInput.PressedNumberKey({ key: 'ArrowUp', isShift: true }),
    )
    expect(NumberInput.valueOf(shiftUp)).toEqual(Option.some(30))

    const pageUp = step(
      shiftUp,
      NumberInput.PressedNumberKey({ key: 'PageUp' }),
    )
    expect(NumberInput.valueOf(pageUp)).toEqual(Option.some(50))

    const pageDown = step(
      pageUp,
      NumberInput.PressedNumberKey({ key: 'PageDown' }),
    )
    expect(NumberInput.valueOf(pageDown)).toEqual(Option.some(30))

    const down = step(
      pageDown,
      NumberInput.PressedNumberKey({ key: 'ArrowDown' }),
    )
    expect(NumberInput.valueOf(down)).toEqual(Option.some(25))

    const atMax = step(down, NumberInput.PressedNumberKey({ key: 'End' }))
    expect(NumberInput.valueOf(atMax)).toEqual(Option.some(100))
    expect(NumberInput.isAtMax(atMax, defaultProps)).toBe(true)
    expect(NumberInput.canIncrement(atMax, defaultProps)).toBe(false)

    const atMin = step(atMax, NumberInput.PressedNumberKey({ key: 'Home' }))
    expect(NumberInput.valueOf(atMin)).toEqual(Option.some(0))
    expect(NumberInput.isAtMin(atMin, defaultProps)).toBe(true)
    expect(NumberInput.canDecrement(atMin, defaultProps)).toBe(false)

    const direct = step(atMin, NumberInput.SetNumberValue({ value: 45 }))
    expect(NumberInput.valueOf(direct)).toEqual(Option.some(45))

    const cleared = step(direct, NumberInput.ClearNumberInput())
    expect(NumberInput.isEmpty(cleared)).toBe(true)

    const reset = step(cleared, NumberInput.ResetNumberInput())
    expect(NumberInput.valueOf(reset)).toEqual(Option.some(10))
  })

  it('handles PointerDrag scrubber dragging, RTL direction, commit, and Escape/CancelScrub restore', () => {
    const start = NumberInput.initialValue(40)
    const scrubbing = step(
      start,
      NumberInput.BeginScrub({ pointerId: 1, x: 100, y: 20 }),
    )
    expect(NumberInput.isScrubbing(scrubbing)).toBe(true)

    // 12 px delta / 4 px per step = 3 steps * step(5) = +15 -> 55
    const moved = step(
      scrubbing,
      NumberInput.MoveScrub({ pointerId: 1, x: 112, y: 20 }),
    )
    expect(NumberInput.valueOf(moved)).toEqual(Option.some(55))
    expect(NumberInput.textOf(moved)).toBe('55')

    // Wrong pointerId is ignored
    const wrongPointer = step(
      moved,
      NumberInput.MoveScrub({ pointerId: 99, x: 200, y: 20 }),
    )
    expect(NumberInput.valueOf(wrongPointer)).toEqual(Option.some(55))

    // Escape cancels scrub and restores originValue (40)
    const escaped = step(moved, NumberInput.PressedNumberKey({ key: 'Escape' }))
    expect(NumberInput.isIdle(escaped)).toBe(true)
    expect(NumberInput.valueOf(escaped)).toEqual(Option.some(40))

    // EndScrub commits scrubbed value
    const scrubbedAgain = step(
      step(start, NumberInput.BeginScrub({ pointerId: 2, x: 100, y: 20 })),
      NumberInput.MoveScrub({ pointerId: 2, x: 108, y: 20 }),
    )
    const committed = step(
      scrubbedAgain,
      NumberInput.EndScrub({ pointerId: 2 }),
    )
    expect(NumberInput.isIdle(committed)).toBe(true)
    expect(NumberInput.valueOf(committed)).toEqual(Option.some(50))

    // RTL flips horizontal drag sign
    const rtlProps: NumberInput.Props = { ...defaultProps, direction: 'Rtl' }
    const rtlScrub = step(
      step(
        start,
        NumberInput.BeginScrub({ pointerId: 3, x: 100, y: 20 }),
        rtlProps,
      ),
      NumberInput.MoveScrub({ pointerId: 3, x: 108, y: 20 }),
      rtlProps,
    )
    expect(NumberInput.valueOf(rtlScrub)).toEqual(Option.some(30))
  })

  it('blocks edits when disabled or readOnly', () => {
    const start = NumberInput.initialValue(20)
    const disabledProps: NumberInput.Props = {
      ...defaultProps,
      isDisabled: true,
    }
    expect(step(start, NumberInput.IncrementNumber(), disabledProps)).toEqual(
      start,
    )
    expect(
      step(
        start,
        NumberInput.ChangeNumberInput({ value: '99' }),
        disabledProps,
      ),
    ).toEqual(start)
    expect(
      step(
        start,
        NumberInput.BeginScrub({ pointerId: 1, x: 0, y: 0 }),
        disabledProps,
      ),
    ).toEqual(start)

    const readOnlyProps: NumberInput.Props = {
      ...defaultProps,
      isReadOnly: true,
    }
    expect(step(start, NumberInput.DecrementNumber(), readOnlyProps)).toEqual(
      start,
    )
    expect(
      step(start, NumberInput.SetNumberValue({ value: 50 }), readOnlyProps),
    ).toEqual(start)
  })

  it('declares Settled typing sync, Sampled scrub sync, atRest, JSON round-trip, and reference-stable SlotBindings', () => {
    expect(NumberInput.synced.ChangeNumberInput).toEqual(
      Pace.Settled({ afterMs: 200 }),
    )
    expect(NumberInput.synced.MoveScrub).toEqual(Pace.Sampled({ everyMs: 50 }))
    expect(NumberInput.synced.IncrementNumber).toEqual(Pace.Synced())
    expect(NumberInput.deviceSync('OwnView').MoveScrub).toEqual(
      Pace.Device({ because: 'OwnView' }),
    )

    const scrubbing = step(
      step(
        NumberInput.initialValue(10),
        NumberInput.BeginScrub({ pointerId: 1, x: 0, y: 0 }),
      ),
      NumberInput.MoveScrub({ pointerId: 1, x: 8, y: 0 }),
    )
    const rested = NumberInput.atRest(scrubbing)
    expect(NumberInput.isIdle(rested)).toBe(true)
    expect(NumberInput.valueOf(rested)).toEqual(Option.some(20))

    const encoded = S.encodeSync(NumberInput.State)(scrubbing)
    const decoded = S.decodeUnknownSync(NumberInput.State)(encoded)
    expect(decoded).toEqual(scrubbing)

    const view1 = Part.view(NumberInput.part, rested, defaultProps)
    const view2 = Part.view(NumberInput.part, rested, { ...defaultProps })
    expect(view1).toBe(view2)
    expect(view1.slot('Input')).toBe(view2.slot('Input'))

    const inputAria = Slot.ariaOf(view1.slot('Input'))
    expect(inputAria['role']).toBe('textbox')
    expect(inputAria['aria-valuemin']).toBe('0')
    expect(inputAria['aria-valuemax']).toBe('100')
    expect(inputAria['aria-valuenow']).toBe('20')
    expect(inputAria['aria-valuetext']).toBe('20')
    expect(inputAria['aria-labelledby']).toBe('qty-label')

    const label1 = view1.slot('Label')
    const input1 = view1.slot('Input')
    const updated = step(rested, NumberInput.IncrementNumber())
    const view3 = Part.view(NumberInput.part, updated, defaultProps)
    expect(view3.slot('Label')).toBe(label1)
    expect(view3.slot('Input')).not.toBe(input1)
    expect(Slot.ariaOf(view3.slot('Input'))['aria-valuenow']).toBe('25')
  })

  it('composes cleanly into a Program with Part.compose', () => {
    const Base = make({
      id: 'number-test',
      version: 1,
      Model: S.Struct({ title: S.String }),
      Message: S.Union([
        Catalog.action('Rename', {
          what: 'Renames',
          why: 'To title the panel',
          meta: { label: 'Rename', keys: [] },
        }),
      ]),
      init: () => [{ title: 'Qty' }, []],
      update: model => [model, []],
    })
    const App = Part.compose({
      of: Base,
      parts: [
        Part.given(NumberInput.make({ defaultValue: 10 }), () => defaultProps),
      ],
    })
    const [m0] = App.init()
    const messages = App.interaction?.press(m0, 'IncrementNumber') ?? []
    expect(messages).toHaveLength(1)
    const maybeFirst = Array.head(messages)
    expect(Option.isSome(maybeFirst)).toBe(true)
    if (Option.isSome(maybeFirst)) {
      const [m1] = App.update(m0, maybeFirst.value)
      expect(NumberInput.valueOf(m1.parts['NumberInput'])).toEqual(
        Option.some(15),
      )
    }
  })
})
