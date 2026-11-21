import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as RadioGroup from './radioGroup.js'
import * as Slot from './slot.js'

const sampleOptions: ReadonlyArray<RadioGroup.Item> = [
  { value: 'brush', label: 'Brush' },
  { value: 'fill', label: 'Fill' },
  { value: 'eraser', label: 'Eraser', isDisabled: true },
  { value: 'lasso', label: 'Lasso' },
]

const baseProps: RadioGroup.Props = {
  id: 'tool',
  label: 'Drawing tool',
  name: 'tool',
  options: sampleOptions,
}

const fold = (
  messages: ReadonlyArray<RadioGroup.Message>,
  props: RadioGroup.Props = baseProps,
  from: RadioGroup.State = RadioGroup.initial,
): RadioGroup.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => RadioGroup.chart.transition(state, message, props)[0],
  )

describe('core RadioGroup Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(RadioGroup.part)).toEqual([])
      expect(Part.problemsOf(RadioGroup.deviceOnly())).toEqual([])
      expect(Part.problemsOf(RadioGroup.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Part.problemsOf(RadioGroup.make({ defaultValue: 'brush' })),
      ).toEqual([])
      expect(
        Block.problemsOf({ name: 'RadioGroup', chart: RadioGroup.chart }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'RadioGroupSelected',
          chart: RadioGroup.chartOf(RadioGroup.initialSelected('brush')),
        }),
      ).toEqual([])
      for (const action of RadioGroup.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })
  })

  describe('selection, focus, blur, clear, and reset transitions', () => {
    it('starts unselected with roving focus on the first enabled option', () => {
      expect(RadioGroup.selectedValueOf(RadioGroup.initial, baseProps)).toEqual(
        Option.none(),
      )
      expect(RadioGroup.selectedIndexOf(RadioGroup.initial, baseProps)).toEqual(
        Option.none(),
      )
      expect(RadioGroup.selectedItemOf(RadioGroup.initial, baseProps)).toEqual(
        Option.none(),
      )
      expect(RadioGroup.focusedIndexOf(RadioGroup.initial, baseProps)).toEqual(
        Option.some(0),
      )
      expect(RadioGroup.focusedValueOf(RadioGroup.initial, baseProps)).toEqual(
        Option.some('brush'),
      )
      expect(RadioGroup.isFocused(RadioGroup.initial)).toBe(false)
      expect(
        RadioGroup.optionDataStateOf(RadioGroup.initial, baseProps, 'brush'),
      ).toBe('unchecked')
      expect(RadioGroup.hiddenInputOf(RadioGroup.initial, baseProps)).toEqual(
        Option.none(),
      )
    })

    it('selects enabled options, ignores disabled/unknown options, and handles FocusRadioOption and BlurRadioGroup', () => {
      const selected = fold([RadioGroup.SelectRadioOption({ value: 'fill' })])
      expect(selected).toEqual(
        RadioGroup.Focused({
          maybeSelectedValue: Option.some('fill'),
          focusedValue: 'fill',
        }),
      )
      expect(RadioGroup.isFocused(selected)).toBe(true)
      expect(RadioGroup.selectedValueOf(selected, baseProps)).toEqual(
        Option.some('fill'),
      )
      expect(RadioGroup.isOptionSelected(selected, baseProps, 'fill')).toBe(
        true,
      )
      expect(RadioGroup.isOptionFocused(selected, baseProps, 'fill')).toBe(true)
      expect(RadioGroup.optionDataStateOf(selected, baseProps, 'fill')).toBe(
        'checked',
      )
      expect(RadioGroup.hiddenInputOf(selected, baseProps)).toEqual(
        Option.some({ id: 'tool-input', name: 'tool', value: 'fill' }),
      )

      // Disabled and unknown options are ignored
      expect(
        RadioGroup.chart.step(
          selected,
          RadioGroup.SelectRadioOption({ value: 'eraser' }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        RadioGroup.chart.step(
          selected,
          RadioGroup.SelectRadioOption({ value: 'unknown' }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Focusing another option updates focus without changing selection
      const focusedLasso = fold(
        [RadioGroup.FocusRadioOption({ value: 'lasso' })],
        baseProps,
        selected,
      )
      expect(RadioGroup.selectedValueOf(focusedLasso, baseProps)).toEqual(
        Option.some('fill'),
      )
      expect(RadioGroup.focusedValueOf(focusedLasso, baseProps)).toEqual(
        Option.some('lasso'),
      )

      // Blurring returns to Idle, keeping selection and moving focus back to selected
      const blurred = fold(
        [RadioGroup.BlurRadioGroup()],
        baseProps,
        focusedLasso,
      )
      expect(blurred).toEqual(
        RadioGroup.Idle({ maybeSelectedValue: Option.some('fill') }),
      )
      expect(RadioGroup.isFocused(blurred)).toBe(false)
      expect(RadioGroup.focusedValueOf(blurred, baseProps)).toEqual(
        Option.some('fill'),
      )

      // Blurring while Idle is NotApplicable
      expect(
        RadioGroup.chart.step(blurred, RadioGroup.BlurRadioGroup(), baseProps),
      ).toMatchObject({ _tag: 'Ignored', reason: 'NotApplicable' })
    })

    it('clears selection on ClearRadioSelection and restores defaultValue on ResetRadioGroup', () => {
      const withDefault: RadioGroup.Props = {
        ...baseProps,
        defaultValue: 'brush',
        form: 'canvas-form',
      }
      const selected = fold(
        [RadioGroup.SelectRadioOption({ value: 'lasso' })],
        withDefault,
      )
      expect(RadioGroup.hiddenInputOf(selected, withDefault)).toEqual(
        Option.some({
          id: 'tool-input',
          name: 'tool',
          value: 'lasso',
          form: 'canvas-form',
        }),
      )

      // Clear while Focused keeps focus and clears selection
      const clearedFocused = fold(
        [RadioGroup.ClearRadioSelection()],
        withDefault,
        selected,
      )
      expect(clearedFocused).toEqual(
        RadioGroup.Focused({
          maybeSelectedValue: Option.none(),
          focusedValue: 'lasso',
        }),
      )

      // Clearing again when already unselected is ignored
      expect(
        RadioGroup.chart.step(
          clearedFocused,
          RadioGroup.ClearRadioSelection(),
          withDefault,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // ResetRadioGroup restores defaultValue and returns to Idle
      const resetFromFocused = fold(
        [RadioGroup.ResetRadioGroup()],
        withDefault,
        clearedFocused,
      )
      expect(resetFromFocused).toEqual(
        RadioGroup.Idle({ maybeSelectedValue: Option.some('brush') }),
      )

      // ResetRadioGroup when already at defaultValue is ignored
      expect(
        RadioGroup.chart.step(
          resetFromFocused,
          RadioGroup.ResetRadioGroup(),
          withDefault,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Clear while Idle
      const clearedIdle = fold(
        [RadioGroup.ClearRadioSelection()],
        withDefault,
        resetFromFocused,
      )
      expect(clearedIdle).toEqual(
        RadioGroup.Idle({ maybeSelectedValue: Option.none() }),
      )

      // Reset without defaultValue resets back to Option.none()
      const selectedNoDefault = RadioGroup.initialSelected('fill')
      expect(
        fold([RadioGroup.ResetRadioGroup()], baseProps, selectedNoDefault),
      ).toEqual(RadioGroup.Idle({ maybeSelectedValue: Option.none() }))
    })
  })

  describe('roving tabindex invariant and disabled/readOnly guards', () => {
    it('falls back to the first enabled option when the selected option is disabled', () => {
      const disabledSelectedProps: RadioGroup.Props = {
        ...baseProps,
        options: [
          { value: 'brush', label: 'Brush', isDisabled: true },
          { value: 'fill', label: 'Fill' },
          { value: 'lasso', label: 'Lasso' },
        ],
      }
      const state = RadioGroup.initialSelected('brush')

      expect(RadioGroup.selectedIndexOf(state, disabledSelectedProps)).toEqual(
        Option.some(0),
      )
      expect(RadioGroup.selectedValueOf(state, disabledSelectedProps)).toEqual(
        Option.some('brush'),
      )
      // Crucial invariant: tab stop cannot be stranded on disabled index 0
      expect(RadioGroup.focusedIndexOf(state, disabledSelectedProps)).toEqual(
        Option.some(1),
      )
      expect(RadioGroup.focusedValueOf(state, disabledSelectedProps)).toEqual(
        Option.some('fill'),
      )

      const view = Part.view(RadioGroup.part, state, disabledSelectedProps)
      expect(Slot.ariaOf(view.slot('Option', 'brush'))).toMatchObject({
        'aria-checked': 'true',
        'aria-disabled': 'true',
        tabindex: '-1',
      })
      expect(Slot.ariaOf(view.slot('Option', 'fill'))).toMatchObject({
        'aria-checked': 'false',
        tabindex: '0',
      })
      expect(Slot.ariaOf(view.slot('Option', 'lasso'))).toMatchObject({
        'aria-checked': 'false',
        tabindex: '-1',
      })

      // Space selects the enabled roving stop (fill), not the disabled selection
      const afterSpace = fold(
        [RadioGroup.PressedRadioKey({ key: ' ' })],
        disabledSelectedProps,
        state,
      )
      expect(
        RadioGroup.selectedValueOf(afterSpace, disabledSelectedProps),
      ).toEqual(Option.some('fill'))
    })

    it('blocks all interaction and leaves no roving tab stop when the whole group is disabled', () => {
      const disabledGroup: RadioGroup.Props = {
        ...baseProps,
        isDisabled: true,
      }
      const started = RadioGroup.initialSelected('brush')

      expect(RadioGroup.focusedIndexOf(started, disabledGroup)).toEqual(
        Option.none(),
      )
      expect(RadioGroup.isOptionDisabled(disabledGroup, 'brush')).toBe(true)

      expect(
        fold(
          [RadioGroup.SelectRadioOption({ value: 'fill' })],
          disabledGroup,
          started,
        ),
      ).toBe(started)
      expect(
        fold(
          [RadioGroup.FocusRadioOption({ value: 'fill' })],
          disabledGroup,
          started,
        ),
      ).toBe(started)
      expect(
        fold(
          [RadioGroup.PressedRadioKey({ key: 'ArrowDown' })],
          disabledGroup,
          started,
        ),
      ).toBe(started)
      expect(
        fold([RadioGroup.ClearRadioSelection()], disabledGroup, started),
      ).toBe(started)

      const view = Part.view(RadioGroup.part, started, disabledGroup)
      expect(Slot.ariaOf(view.slot('Group'))).toMatchObject({
        role: 'radiogroup',
        'aria-disabled': 'true',
      })
      expect(Slot.ariaOf(view.slot('Option', 'brush'))).toMatchObject({
        'aria-disabled': 'true',
        tabindex: '-1',
      })
      expect(Slot.ariaOf(view.slot('Option', 'fill'))).toMatchObject({
        'aria-disabled': 'true',
        tabindex: '-1',
      })
    })

    it('allows roving focus navigation without changing selection when isReadOnly is true', () => {
      const readOnlyProps: RadioGroup.Props = {
        ...baseProps,
        isReadOnly: true,
      }
      const started = RadioGroup.initialSelected('brush')

      // Click/select/clear/Space do not change selection
      expect(
        fold(
          [RadioGroup.SelectRadioOption({ value: 'fill' })],
          readOnlyProps,
          started,
        ),
      ).toBe(started)
      expect(
        fold([RadioGroup.ClearRadioSelection()], readOnlyProps, started),
      ).toBe(started)
      expect(
        fold(
          [RadioGroup.PressedRadioKey({ key: ' ' })],
          readOnlyProps,
          started,
        ),
      ).toBe(started)

      // ArrowDown moves focus to Fill while preserving selection on Brush
      const moved = fold(
        [RadioGroup.PressedRadioKey({ key: 'ArrowDown' })],
        readOnlyProps,
        started,
      )
      expect(RadioGroup.selectedValueOf(moved, readOnlyProps)).toEqual(
        Option.some('brush'),
      )
      expect(RadioGroup.focusedValueOf(moved, readOnlyProps)).toEqual(
        Option.some('fill'),
      )
      // ArrowDown again skips disabled Eraser -> focuses Lasso, still selected Brush
      const movedPastDisabled = fold(
        [RadioGroup.PressedRadioKey({ key: 'ArrowDown' })],
        readOnlyProps,
        moved,
      )
      expect(
        RadioGroup.selectedValueOf(movedPastDisabled, readOnlyProps),
      ).toEqual(Option.some('brush'))
      expect(
        RadioGroup.focusedValueOf(movedPastDisabled, readOnlyProps),
      ).toEqual(Option.some('lasso'))
    })
  })

  describe('keyboard navigation: orientation, LTR/RTL, loop, pageKeys, and Space vs Enter', () => {
    it('navigates vertically by default, skips disabled options, wraps when loop is true, and clamps when loop is false', () => {
      // Vertical default: ArrowDown from Brush -> Fill -> skips Eraser -> Lasso -> wraps to Brush
      const atFill = fold(
        [RadioGroup.PressedRadioKey({ key: 'ArrowDown' })],
        baseProps,
        RadioGroup.initialSelected('brush'),
      )
      expect(RadioGroup.selectedValueOf(atFill, baseProps)).toEqual(
        Option.some('fill'),
      )

      const atLasso = fold(
        [RadioGroup.PressedRadioKey({ key: 'ArrowDown' })],
        baseProps,
        atFill,
      )
      expect(RadioGroup.selectedValueOf(atLasso, baseProps)).toEqual(
        Option.some('lasso'),
      )

      const wrappedToBrush = fold(
        [RadioGroup.PressedRadioKey({ key: 'ArrowDown' })],
        baseProps,
        atLasso,
      )
      expect(RadioGroup.selectedValueOf(wrappedToBrush, baseProps)).toEqual(
        Option.some('brush'),
      )

      // ArrowUp wraps backwards to Lasso
      const wrappedBack = fold(
        [RadioGroup.PressedRadioKey({ key: 'ArrowUp' })],
        baseProps,
        wrappedToBrush,
      )
      expect(RadioGroup.selectedValueOf(wrappedBack, baseProps)).toEqual(
        Option.some('lasso'),
      )

      // Clamped (loop: false): ArrowDown at Lasso stays on Lasso
      const clampedProps: RadioGroup.Props = { ...baseProps, loop: false }
      const clamped = fold(
        [RadioGroup.PressedRadioKey({ key: 'ArrowDown' })],
        clampedProps,
        wrappedBack,
      )
      expect(RadioGroup.selectedValueOf(clamped, clampedProps)).toEqual(
        Option.some('lasso'),
      )

      // Horizontal keys ignored when Vertical
      expect(
        RadioGroup.chart.step(
          atFill,
          RadioGroup.PressedRadioKey({ key: 'ArrowRight' }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('supports Horizontal orientation in LTR and RTL, Home/End/PageUp/PageDown, Space, and ignores Enter', () => {
      const horizontalLtr: RadioGroup.Props = {
        ...baseProps,
        orientation: 'Horizontal',
        direction: 'Ltr',
      }
      const nextLtr = fold(
        [RadioGroup.PressedRadioKey({ key: 'ArrowRight' })],
        horizontalLtr,
        RadioGroup.initialSelected('brush'),
      )
      expect(RadioGroup.selectedValueOf(nextLtr, horizontalLtr)).toEqual(
        Option.some('fill'),
      )

      const horizontalRtl: RadioGroup.Props = {
        ...baseProps,
        orientation: 'Horizontal',
        direction: 'Rtl',
      }
      // In RTL, ArrowLeft advances forward (Brush -> Fill)
      const nextRtl = fold(
        [RadioGroup.PressedRadioKey({ key: 'ArrowLeft' })],
        horizontalRtl,
        RadioGroup.initialSelected('brush'),
      )
      expect(RadioGroup.selectedValueOf(nextRtl, horizontalRtl)).toEqual(
        Option.some('fill'),
      )

      // Home / End / PageUp / PageDown
      expect(
        RadioGroup.selectedValueOf(
          fold([RadioGroup.PressedRadioKey({ key: 'End' })], baseProps),
          baseProps,
        ),
      ).toEqual(Option.some('lasso'))
      expect(
        RadioGroup.selectedValueOf(
          fold(
            [RadioGroup.PressedRadioKey({ key: 'Home' })],
            baseProps,
            RadioGroup.initialSelected('lasso'),
          ),
          baseProps,
        ),
      ).toEqual(Option.some('brush'))
      expect(
        RadioGroup.selectedValueOf(
          fold([RadioGroup.PressedRadioKey({ key: 'PageDown' })], baseProps),
          baseProps,
        ),
      ).toEqual(Option.some('lasso'))
      expect(
        RadioGroup.selectedValueOf(
          fold(
            [RadioGroup.PressedRadioKey({ key: 'PageUp' })],
            baseProps,
            RadioGroup.initialSelected('lasso'),
          ),
          baseProps,
        ),
      ).toEqual(Option.some('brush'))

      // pageKeys: false ignores PageUp/PageDown
      const noPageKeys: RadioGroup.Props = { ...baseProps, pageKeys: false }
      expect(
        RadioGroup.chart.step(
          RadioGroup.initial,
          RadioGroup.PressedRadioKey({ key: 'PageDown' }),
          noPageKeys,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Space selects currently focused option; Enter does NOT per WAI-ARIA
      expect(
        RadioGroup.selectedValueOf(
          fold([RadioGroup.PressedRadioKey({ key: ' ' })], baseProps),
          baseProps,
        ),
      ).toEqual(Option.some('brush'))
      expect(
        RadioGroup.chart.step(
          RadioGroup.initial,
          RadioGroup.PressedRadioKey({ key: 'Enter' }),
          baseProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('exposes resolveKeyOutcome and resolveFocusedIndex directly for thin painters', () => {
      expect(
        RadioGroup.resolveKeyOutcome({
          key: 'ArrowDown',
          count: 3,
          current: Option.some(0),
        }),
      ).toEqual(Option.some(RadioGroup.SelectIndex({ index: 1 })))

      expect(
        RadioGroup.resolveKeyOutcome({
          key: ' ',
          count: 3,
          current: Option.some(2),
        }),
      ).toEqual(Option.some(RadioGroup.SelectIndex({ index: 2 })))

      expect(
        RadioGroup.resolveKeyOutcome({
          key: 'ArrowDown',
          count: 3,
          current: Option.some(0),
          isReadOnly: true,
        }),
      ).toEqual(Option.some(RadioGroup.FocusIndex({ index: 1 })))

      expect(
        RadioGroup.resolveKeyOutcome({
          key: ' ',
          count: 3,
          current: Option.some(0),
          isReadOnly: true,
        }),
      ).toEqual(Option.none())

      expect(
        RadioGroup.resolveKeyOutcome({
          key: 'Enter',
          count: 3,
          current: Option.some(0),
        }),
      ).toEqual(Option.none())

      expect(
        RadioGroup.resolveFocusedIndex({
          count: 3,
          maybeSelectedIndex: Option.some(0),
          isDisabled: index => index === 0,
        }),
      ).toEqual(Option.some(1))
    })
  })

  describe('element IDs, JSON codecs, slot projection, and reference stability', () => {
    it('derives element IDs consistently from the base id', () => {
      expect(RadioGroup.groupId('tool')).toBe('tool-group')
      expect(RadioGroup.optionId('tool', 1)).toBe('tool-option-1')
      expect(RadioGroup.labelId('tool', 1)).toBe('tool-option-1-label')
      expect(RadioGroup.descriptionId('tool', 1)).toBe(
        'tool-option-1-description',
      )
      expect(RadioGroup.hiddenInputId('tool')).toBe('tool-input')
    })

    it('round-trips State and Message through Schema JSON codecs', () => {
      for (const state of [
        RadioGroup.initial,
        RadioGroup.initialSelected('brush'),
        RadioGroup.Focused({
          maybeSelectedValue: Option.some('fill'),
          focusedValue: 'lasso',
        }),
      ]) {
        const encoded = S.encodeSync(RadioGroup.State)(state)
        expect(S.decodeUnknownSync(RadioGroup.State)(encoded)).toEqual(state)
      }
      for (const message of [
        RadioGroup.SelectRadioOption({ value: 'brush' }),
        RadioGroup.ClearRadioSelection(),
        RadioGroup.FocusRadioOption({ value: 'fill' }),
        RadioGroup.BlurRadioGroup(),
        RadioGroup.PressedRadioKey({ key: 'ArrowDown' }),
        RadioGroup.ResetRadioGroup(),
      ]) {
        const encoded = S.encodeSync(RadioGroup.Message)(message)
        expect(S.decodeUnknownSync(RadioGroup.Message)(encoded)).toEqual(
          message,
        )
        expect(RadioGroup.isMessage(message)).toBe(true)
      }
    })

    it('projects full WAI-ARIA across Group, Option, Label, and Description slots', () => {
      const state = RadioGroup.initialSelected('fill')
      const propsWithFlags: RadioGroup.Props = {
        ...baseProps,
        orientation: 'Horizontal',
        isRequired: true,
        isReadOnly: true,
        isInvalid: true,
        options: [
          { value: 'brush', label: 'Brush', hasDescription: false },
          { value: 'fill', label: 'Fill' },
          { value: 'eraser', label: 'Eraser', isDisabled: true },
        ],
      }
      expect(RadioGroup.isInvalidOf(propsWithFlags)).toBe(true)
      const view = Part.view(RadioGroup.part, state, propsWithFlags)

      expect(Slot.ariaOf(view.slot('Group'))).toEqual({
        role: 'radiogroup',
        id: 'tool-group',
        'aria-orientation': 'horizontal',
        'aria-label': 'Drawing tool',
        'aria-readonly': 'true',
        'aria-required': 'true',
      })
      expect(Slot.ariaOf(view.slot('Option', 'brush'))).toEqual({
        role: 'radio',
        id: 'tool-option-0',
        'aria-checked': 'false',
        'aria-labelledby': 'tool-option-0-label',
        'aria-readonly': 'true',
        tabindex: '-1',
      })
      expect(Slot.ariaOf(view.slot('Option', 'fill'))).toEqual({
        role: 'radio',
        id: 'tool-option-1',
        'aria-checked': 'true',
        'aria-labelledby': 'tool-option-1-label',
        'aria-describedby': 'tool-option-1-description',
        'aria-readonly': 'true',
        tabindex: '0',
      })
      expect(Slot.ariaOf(view.slot('Option', 'eraser'))).toEqual({
        role: 'radio',
        id: 'tool-option-2',
        'aria-checked': 'false',
        'aria-labelledby': 'tool-option-2-label',
        'aria-describedby': 'tool-option-2-description',
        'aria-disabled': 'true',
        'aria-readonly': 'true',
        tabindex: '-1',
      })
      expect(Slot.ariaOf(view.slot('Label', 'eraser'))).toEqual({
        id: 'tool-option-2-label',
        'aria-disabled': 'true',
      })
      expect(Slot.ariaOf(view.slot('Description', 'fill'))).toEqual({
        id: 'tool-option-1-description',
      })
      expect(view.slot('Option', 'fill').gestures).toEqual([
        { gesture: 'Pressed', press: 'SelectRadioOption:fill' },
      ])
      expect(view.slot('Label', 'fill').gestures).toEqual([
        { gesture: 'Pressed', press: 'SelectRadioOption:fill' },
      ])
      expect(view.slot('Description', 'fill').gestures).toEqual([])
    })

    it('keeps view and unaffected option slot bindings referentially stable', () => {
      const part = RadioGroup.make({ name: 'StabilityRadioGroup' })
      const first = Part.view(part, RadioGroup.initial, { ...baseProps })
      const second = Part.view(part, RadioGroup.initial, { ...baseProps })
      expect(second).toBe(first)
      expect(second.slot('Group')).toBe(first.slot('Group'))
      expect(second.slot('Option', 'brush')).toBe(first.slot('Option', 'brush'))

      const groupBefore = first.slot('Group')
      const brushBefore = first.slot('Option', 'brush')
      const fillBefore = first.slot('Option', 'fill')
      const lassoBefore = first.slot('Option', 'lasso')
      const labelBefore = first.slot('Label', 'fill')
      const descriptionBefore = first.slot('Description', 'fill')

      // Selecting fill changes brush (tabIndex 0 -> -1) and fill (checked + tabIndex),
      // while Group, untouched Lasso, Label, and Description keep exact references.
      const selectedFill = fold([
        RadioGroup.SelectRadioOption({ value: 'fill' }),
      ])
      const after = Part.view(part, selectedFill, { ...baseProps })
      expect(after).not.toBe(first)
      expect(after.slot('Group')).toBe(groupBefore)
      expect(after.slot('Option', 'brush')).not.toBe(brushBefore)
      expect(after.slot('Option', 'fill')).not.toBe(fillBefore)
      expect(after.slot('Option', 'lasso')).toBe(lassoBefore)
      expect(after.slot('Label', 'fill')).toBe(labelBefore)
      expect(after.slot('Description', 'fill')).toBe(descriptionBefore)
    })
  })

  describe('Part.compose and synchronization', () => {
    const BaseModel = S.Struct({ title: S.String })
    const Rename = Catalog.action('Rename', {
      fields: { title: S.String },
      what: 'Renames the tool panel',
      why: 'To identify the drawing tools',
      meta: { label: 'Rename', keys: [] },
    })
    const baseCatalog = Catalog.make([Rename])
    const BaseProgram = makeProgram({
      id: 'radio-group-compose-test',
      version: 1,
      Model: BaseModel,
      Message: baseCatalog.Message,
      init: () => [{ title: 'Tools' }, []],
      update: (
        model: typeof BaseModel.Type,
        message: typeof baseCatalog.Message.Type,
      ) => [{ ...model, title: message.title }, []],
      catalog: baseCatalog,
    })

    it('syncs RadioGroup state by default under Domain, preserves selection atRest on projectLocal, and joins the Catalog', () => {
      const App = Part.compose({
        of: BaseProgram,
        parts: [Part.given(RadioGroup.part, () => baseProps)],
      })
      const [model] = App.init()
      expect(model.parts['RadioGroup']).toEqual(RadioGroup.initial)

      const [selected] = App.update(
        model,
        RadioGroup.SelectRadioOption({ value: 'fill' }),
      )
      expect(selected.parts['RadioGroup']).toEqual(
        RadioGroup.Focused({
          maybeSelectedValue: Option.some('fill'),
          focusedValue: 'fill',
        }),
      )

      const encoded = S.encodeUnknownSync(App.Model)(selected)
      expect(encoded).toMatchObject({
        title: 'Tools',
        parts: {
          RadioGroup: {
            _tag: 'Focused',
            focusedValue: 'fill',
          },
        },
      })

      const synchronization = Option.getOrThrow(
        Option.fromNullishOr(App.synchronization),
      )
      expect(
        synchronization.messageCategory(
          RadioGroup.SelectRadioOption({ value: 'fill' }),
        ),
      ).toBe('Domain')
      expect(
        synchronization.isLocalOnly?.(
          RadioGroup.SelectRadioOption({ value: 'fill' }),
        ),
      ).toBe(false)
      expect(
        synchronization.paceOf?.(
          RadioGroup.SelectRadioOption({ value: 'fill' }),
        ),
      ).toEqual(Synced())

      // projectLocal applies atRest: returns to Idle while preserving selection
      expect(
        synchronization.projectLocal?.(selected).parts['RadioGroup'],
      ).toEqual(RadioGroup.Idle({ maybeSelectedValue: Option.some('fill') }))

      const entryTags = Array.map(
        App.interaction?.entries(model) ?? [],
        entry => entry.tag,
      )
      expect(entryTags).toEqual([
        'Rename',
        'SelectRadioOption',
        'ClearRadioSelection',
      ])
    })

    it('supports RadioGroup.deviceOnly and defaultValue in Part.compose', () => {
      const localRadioGroup = RadioGroup.deviceOnly({
        name: 'LocalRadioGroup',
        because: 'OwnChoice',
        defaultValue: 'brush',
      })
      const App = Part.compose({
        of: BaseProgram,
        parts: [Part.given(localRadioGroup, () => baseProps)],
      })
      const [model] = App.init()
      expect(model.parts['LocalRadioGroup']).toEqual(
        RadioGroup.initialSelected('brush'),
      )

      const [selectedLasso] = App.update(
        model,
        RadioGroup.SelectRadioOption({ value: 'lasso' }),
      )
      expect(selectedLasso.parts['LocalRadioGroup']).toEqual(
        RadioGroup.Focused({
          maybeSelectedValue: Option.some('lasso'),
          focusedValue: 'lasso',
        }),
      )

      const encoded = S.encodeUnknownSync(App.Model)(selectedLasso)
      expect(JSON.stringify(encoded)).not.toContain('LocalRadioGroup')

      const synchronization = Option.getOrThrow(
        Option.fromNullishOr(App.synchronization),
      )
      expect(
        synchronization.isLocalOnly?.(
          RadioGroup.SelectRadioOption({ value: 'lasso' }),
        ),
      ).toBe(true)
      expect(
        synchronization.paceOf?.(
          RadioGroup.SelectRadioOption({ value: 'lasso' }),
        ),
      ).toEqual(Device({ because: 'OwnChoice' }))

      const kept = synchronization.keepOnRefold?.(selectedLasso, model)
      expect(kept?.parts['LocalRadioGroup']).toEqual(
        selectedLasso.parts['LocalRadioGroup'],
      )
    })
  })
})
