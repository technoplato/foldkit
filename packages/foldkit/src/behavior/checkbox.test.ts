import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Checkbox from './checkbox.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const defaultProps: Checkbox.Props = {
  id: 'accept-terms',
  hasLabel: true,
  hasDescription: true,
}

const fold = (
  messages: ReadonlyArray<Checkbox.Message>,
  props: Checkbox.Props = defaultProps,
  from: Checkbox.State = Checkbox.initial,
): Checkbox.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Checkbox.chart.transition(state, message, props)[0],
  )

describe('core Checkbox Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Checkbox.part)).toEqual([])
      expect(Part.problemsOf(Checkbox.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Checkbox.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Part.problemsOf(Checkbox.make({ initial: Checkbox.Checked() })),
      ).toEqual([])
      expect(
        Part.problemsOf(Checkbox.make({ initial: Checkbox.Indeterminate() })),
      ).toEqual([])

      expect(
        Block.problemsOf({ name: 'Checkbox', chart: Checkbox.chart }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'CheckedCheckbox',
          chart: Checkbox.make({ initial: Checkbox.Checked() }).chart,
        }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'IndeterminateCheckbox',
          chart: Checkbox.make({ initial: Checkbox.Indeterminate() }).chart,
        }),
      ).toEqual([])

      for (const action of Checkbox.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })
  })

  describe('tri-state transitions', () => {
    it('toggles Unchecked -> Checked -> Unchecked and Indeterminate -> Checked', () => {
      expect(Checkbox.initial).toEqual(Checkbox.Unchecked())

      const checked = fold([Checkbox.ToggleCheckbox()])
      expect(checked).toEqual(Checkbox.Checked())

      const unchecked = fold([Checkbox.ToggleCheckbox()], defaultProps, checked)
      expect(unchecked).toEqual(Checkbox.Unchecked())

      const fromIndeterminate = fold(
        [Checkbox.ToggleCheckbox()],
        defaultProps,
        Checkbox.Indeterminate(),
      )
      expect(fromIndeterminate).toEqual(Checkbox.Checked())
    })

    it('handles CheckCheckbox, UncheckCheckbox, SetCheckboxChecked, and SetCheckboxIndeterminate', () => {
      const checked = fold([Checkbox.CheckCheckbox()])
      expect(checked).toEqual(Checkbox.Checked())
      expect(
        Checkbox.chart.step(checked, Checkbox.CheckCheckbox(), defaultProps)
          ._tag,
      ).toBe('Ignored')

      const indeterminateFromChecked = fold(
        [Checkbox.SetCheckboxIndeterminate()],
        defaultProps,
        checked,
      )
      expect(indeterminateFromChecked).toEqual(Checkbox.Indeterminate())
      expect(
        Checkbox.chart.step(
          indeterminateFromChecked,
          Checkbox.SetCheckboxIndeterminate(),
          defaultProps,
        )._tag,
      ).toBe('Ignored')

      const uncheckedFromIndeterminate = fold(
        [Checkbox.UncheckCheckbox()],
        defaultProps,
        indeterminateFromChecked,
      )
      expect(uncheckedFromIndeterminate).toEqual(Checkbox.Unchecked())
      expect(
        Checkbox.chart.step(
          uncheckedFromIndeterminate,
          Checkbox.UncheckCheckbox(),
          defaultProps,
        )._tag,
      ).toBe('Ignored')

      const indeterminateFromUnchecked = fold([
        Checkbox.SetCheckboxIndeterminate(),
      ])
      expect(indeterminateFromUnchecked).toEqual(Checkbox.Indeterminate())

      const checkedFromIndeterminate = fold(
        [Checkbox.CheckCheckbox()],
        defaultProps,
        indeterminateFromUnchecked,
      )
      expect(checkedFromIndeterminate).toEqual(Checkbox.Checked())

      // SetCheckboxChecked across all three states
      expect(
        fold(
          [Checkbox.SetCheckboxChecked({ isChecked: true })],
          defaultProps,
          Checkbox.Unchecked(),
        ),
      ).toEqual(Checkbox.Checked())
      expect(
        Checkbox.chart.step(
          Checkbox.Unchecked(),
          Checkbox.SetCheckboxChecked({ isChecked: false }),
          defaultProps,
        )._tag,
      ).toBe('Ignored')

      expect(
        fold(
          [Checkbox.SetCheckboxChecked({ isChecked: false })],
          defaultProps,
          Checkbox.Checked(),
        ),
      ).toEqual(Checkbox.Unchecked())
      expect(
        Checkbox.chart.step(
          Checkbox.Checked(),
          Checkbox.SetCheckboxChecked({ isChecked: true }),
          defaultProps,
        )._tag,
      ).toBe('Ignored')

      expect(
        fold(
          [Checkbox.SetCheckboxChecked({ isChecked: true })],
          defaultProps,
          Checkbox.Indeterminate(),
        ),
      ).toEqual(Checkbox.Checked())
      expect(
        fold(
          [Checkbox.SetCheckboxChecked({ isChecked: false })],
          defaultProps,
          Checkbox.Indeterminate(),
        ),
      ).toEqual(Checkbox.Unchecked())
    })
  })

  describe('disabled and readOnly guards', () => {
    const blockedCases: ReadonlyArray<readonly [string, Checkbox.Props]> = [
      ['isDisabled', { ...defaultProps, isDisabled: true }],
      ['isReadOnly', { ...defaultProps, isReadOnly: true }],
      [
        'isDisabled and isReadOnly',
        { ...defaultProps, isDisabled: true, isReadOnly: true },
      ],
    ]

    for (const [label, guardedProps] of blockedCases) {
      it(`blocks state changes when ${label} is set`, () => {
        expect(Checkbox.isInteractiveOf(guardedProps)).toBe(false)

        for (const start of [
          Checkbox.Unchecked(),
          Checkbox.Checked(),
          Checkbox.Indeterminate(),
        ]) {
          for (const message of [
            Checkbox.ToggleCheckbox(),
            Checkbox.CheckCheckbox(),
            Checkbox.UncheckCheckbox(),
            Checkbox.SetCheckboxChecked({ isChecked: true }),
            Checkbox.SetCheckboxChecked({ isChecked: false }),
            Checkbox.SetCheckboxIndeterminate(),
            Checkbox.PressedCheckboxKey({ key: ' ' }),
          ]) {
            expect(Checkbox.chart.step(start, message, guardedProps)._tag).toBe(
              'Ignored',
            )
          }
        }
      })
    }
  })

  describe('keyboard rules', () => {
    it('toggles only on Space and ignores Enter and other keys per WAI-ARIA', () => {
      expect(Checkbox.isToggleKey(' ')).toBe(true)
      expect(Checkbox.isToggleKey('Enter')).toBe(false)
      expect(Checkbox.isToggleKey('Escape')).toBe(false)

      expect(
        Checkbox.resolveKeyToggle({ key: ' ', state: Checkbox.Unchecked() }),
      ).toEqual(Option.some(true))
      expect(
        Checkbox.resolveKeyToggle({
          key: ' ',
          state: Checkbox.Indeterminate(),
        }),
      ).toEqual(Option.some(true))
      expect(
        Checkbox.resolveKeyToggle({ key: ' ', state: Checkbox.Checked() }),
      ).toEqual(Option.some(false))
      expect(
        Checkbox.resolveKeyToggle({
          key: 'Enter',
          state: Checkbox.Unchecked(),
        }),
      ).toEqual(Option.none())
      expect(
        Checkbox.resolveKeyToggle({
          key: ' ',
          state: Checkbox.Unchecked(),
          isDisabled: true,
        }),
      ).toEqual(Option.none())
      expect(
        Checkbox.resolveKeyToggle({
          key: ' ',
          state: Checkbox.Unchecked(),
          isReadOnly: true,
        }),
      ).toEqual(Option.none())

      // Through chart
      const checked = fold([Checkbox.PressedCheckboxKey({ key: ' ' })])
      expect(checked).toEqual(Checkbox.Checked())

      const stillChecked = fold(
        [Checkbox.PressedCheckboxKey({ key: 'Enter' })],
        defaultProps,
        checked,
      )
      expect(stillChecked).toEqual(Checkbox.Checked())
      expect(
        Checkbox.chart.step(
          checked,
          Checkbox.PressedCheckboxKey({ key: 'Enter' }),
          defaultProps,
        )._tag,
      ).toBe('Ignored')

      const unchecked = fold(
        [Checkbox.PressedCheckboxKey({ key: ' ' })],
        defaultProps,
        checked,
      )
      expect(unchecked).toEqual(Checkbox.Unchecked())

      const checkedFromMixed = fold(
        [Checkbox.PressedCheckboxKey({ key: ' ' })],
        defaultProps,
        Checkbox.Indeterminate(),
      )
      expect(checkedFromMixed).toEqual(Checkbox.Checked())
    })
  })

  describe('element IDs, form values, and pure readings', () => {
    it('derives element IDs, ariaCheckedOf, dataStateOf, formValueOf, and stateFrom', () => {
      expect(Checkbox.controlId('terms')).toBe('terms-control')
      expect(Checkbox.labelId('terms')).toBe('terms-label')
      expect(Checkbox.descriptionId('terms')).toBe('terms-description')
      expect(Checkbox.hiddenInputId('terms')).toBe('terms-input')

      expect(Checkbox.defaultValue).toBe('on')
      expect(Checkbox.valueOf()).toBe('on')
      expect(Checkbox.valueOf({ value: 'accepted' })).toBe('accepted')

      expect(Checkbox.isUnchecked(Checkbox.Unchecked())).toBe(true)
      expect(Checkbox.isChecked(Checkbox.Checked())).toBe(true)
      expect(Checkbox.isIndeterminate(Checkbox.Indeterminate())).toBe(true)

      expect(Checkbox.stateFrom({ isChecked: false })).toEqual(
        Checkbox.Unchecked(),
      )
      expect(Checkbox.stateFrom({ isChecked: true })).toEqual(
        Checkbox.Checked(),
      )
      expect(
        Checkbox.stateFrom({ isChecked: false, isIndeterminate: true }),
      ).toEqual(Checkbox.Indeterminate())
      expect(
        Checkbox.stateFrom({ isChecked: true, isIndeterminate: true }),
      ).toEqual(Checkbox.Indeterminate())

      expect(Checkbox.ariaCheckedOf(Checkbox.Unchecked())).toBe(false)
      expect(Checkbox.ariaCheckedOf(Checkbox.Checked())).toBe(true)
      expect(Checkbox.ariaCheckedOf(Checkbox.Indeterminate())).toBe('mixed')

      expect(Checkbox.dataStateOf(Checkbox.Unchecked())).toBe('unchecked')
      expect(Checkbox.dataStateOf(Checkbox.Checked())).toBe('checked')
      expect(Checkbox.dataStateOf(Checkbox.Indeterminate())).toBe(
        'indeterminate',
      )

      expect(Checkbox.formValueOf(Checkbox.Unchecked())).toBe('')
      expect(Checkbox.formValueOf(Checkbox.Indeterminate())).toBe('')
      expect(Checkbox.formValueOf(Checkbox.Checked())).toBe('on')
      expect(
        Checkbox.formValueOf(Checkbox.Checked(), { value: 'agreed' }),
      ).toBe('agreed')
      expect(
        Checkbox.formValueOf(Checkbox.Indeterminate(), { value: 'agreed' }),
      ).toBe('')
    })

    it('serializes and decodes all three State variants cleanly via Schema', () => {
      for (const state of [
        Checkbox.Unchecked(),
        Checkbox.Checked(),
        Checkbox.Indeterminate(),
      ]) {
        const encoded = S.encodeSync(Checkbox.State)(state)
        const roundTripped = S.decodeUnknownSync(Checkbox.State)(
          JSON.parse(JSON.stringify(encoded)),
        )
        expect(roundTripped).toEqual(state)
      }
    })
  })

  describe('slot projection and referential stability', () => {
    it('projects Control, Label, and Description ARIA attributes and preserves unchanged bindings by reference', () => {
      const part = Checkbox.make({ name: 'TermsCheckbox' })
      const props: Checkbox.Props = {
        id: 'terms',
        hasLabel: true,
        hasDescription: true,
        isRequired: true,
        isInvalid: true,
      }

      const uncheckedState = Checkbox.Unchecked()
      const firstView = Part.view(part, uncheckedState, props)
      const secondView = Part.view(part, uncheckedState, { ...props })
      expect(secondView).toBe(firstView)

      const controlUnchecked = firstView.slot('Control')
      const labelBefore = firstView.slot('Label')
      const descriptionBefore = firstView.slot('Description')

      expect(Slot.ariaOf(controlUnchecked)).toEqual({
        role: 'checkbox',
        id: 'terms-control',
        'aria-checked': 'false',
        'aria-labelledby': 'terms-label',
        'aria-describedby': 'terms-description',
        'aria-required': 'true',
        'aria-invalid': 'true',
        tabindex: '0',
      })
      expect(Slot.ariaOf(labelBefore)).toEqual({ id: 'terms-label' })
      expect(Slot.ariaOf(descriptionBefore)).toEqual({
        id: 'terms-description',
      })

      // State transitions to Checked -> Control changes, Label and Description keep exact references
      const checkedView = Part.view(part, Checkbox.Checked(), props)
      expect(checkedView.slot('Control')).not.toBe(controlUnchecked)
      expect(Slot.ariaOf(checkedView.slot('Control'))['aria-checked']).toBe(
        'true',
      )
      expect(checkedView.slot('Label')).toBe(labelBefore)
      expect(checkedView.slot('Description')).toBe(descriptionBefore)

      // State transitions to Indeterminate -> aria-checked is 'mixed', Label & Description still identical
      const mixedView = Part.view(part, Checkbox.Indeterminate(), props)
      expect(Slot.ariaOf(mixedView.slot('Control'))['aria-checked']).toBe(
        'mixed',
      )
      expect(mixedView.slot('Label')).toBe(labelBefore)
      expect(mixedView.slot('Description')).toBe(descriptionBefore)
    })

    it('projects isDisabled, isReadOnly, aria-label, and optional description cleanly', () => {
      const part = Checkbox.make({ name: 'ReadOnlyCheckbox' })
      const props: Checkbox.Props = {
        id: 'locked',
        label: 'Locked consent',
        hasLabel: false,
        hasDescription: false,
        isDisabled: true,
        isReadOnly: true,
      }

      const view = Part.view(part, Checkbox.Checked(), props)
      expect(Slot.ariaOf(view.slot('Control'))).toEqual({
        role: 'checkbox',
        id: 'locked-control',
        'aria-checked': 'true',
        'aria-label': 'Locked consent',
        'aria-disabled': 'true',
        'aria-readonly': 'true',
        tabindex: '0',
      })
      expect(Slot.ariaOf(view.slot('Label'))).toEqual({
        id: 'locked-label',
        'aria-disabled': 'true',
      })
    })
  })

  describe('Part.compose synchronization (synced default vs deviceOnly)', () => {
    const BaseModel = S.Struct({ count: S.Number })
    const Increment = Catalog.action('Increment', {
      what: 'Raises the count by one',
      why: 'To count one more',
      meta: { label: 'Increment', keys: [] },
    })
    const baseCatalog = Catalog.make([Increment])
    const BaseProgram = makeProgram({
      id: 'checkbox-sync-test',
      version: 1,
      Model: BaseModel,
      Message: baseCatalog.Message,
      init: () => [{ count: 0 }, []],
      update: model => [{ count: model.count + 1 }, []],
      catalog: baseCatalog,
    })

    it('syncs Checkbox state by default under Domain category and preserves state on atRest', () => {
      const part = Checkbox.make()
      expect(part.category).toBe('Domain')
      expect(part.sync.ToggleCheckbox).toEqual(Synced())
      expect(part.sync.SetCheckboxChecked).toEqual(Synced())
      expect(part.sync.SetCheckboxIndeterminate).toEqual(Synced())

      const App = Part.compose({
        of: BaseProgram,
        parts: [Part.given(part, () => defaultProps)],
      })
      const [initialModel] = App.init()
      const [checkedModel] = App.update(initialModel, Checkbox.CheckCheckbox())
      expect(checkedModel.parts['Checkbox']).toEqual(Checkbox.Checked())

      // Synced part is encoded in Model and preserved by projectLocal / atRest
      const encoded = S.encodeSync(App.Model)(checkedModel)
      const decoded = S.decodeUnknownSync(App.Model)(encoded)
      expect(decoded.parts['Checkbox']).toEqual(Checkbox.Checked())
      expect(
        App.synchronization?.isLocalOnly?.(Checkbox.ToggleCheckbox()),
      ).toBe(false)
      expect(
        App.synchronization?.messageCategory(Checkbox.ToggleCheckbox()),
      ).toBe('Domain')
      expect(
        App.synchronization?.projectLocal?.(checkedModel).parts['Checkbox'],
      ).toEqual(Checkbox.Checked())
    })

    it('keeps deviceOnly Checkbox local to one device and omits it from encoded Model', () => {
      const localPart = Checkbox.deviceOnly({ name: 'LocalCheckbox' })
      expect(localPart.sync.ToggleCheckbox).toEqual(
        Device({ because: 'OwnView' }),
      )

      const App = Part.compose({
        of: BaseProgram,
        parts: [Part.given(localPart, () => defaultProps)],
      })
      const [initialModel] = App.init()
      const [checkedModel] = App.update(initialModel, Checkbox.CheckCheckbox())
      expect(checkedModel.parts['LocalCheckbox']).toEqual(Checkbox.Checked())
      expect(
        App.synchronization?.isLocalOnly?.(Checkbox.ToggleCheckbox()),
      ).toBe(true)

      // Omitted from encoded Model; decodes back to initial Unchecked
      const encoded = S.encodeSync(App.Model)(checkedModel)
      expect(encoded).toEqual({ count: 0 })
      const decoded = S.decodeUnknownSync(App.Model)(encoded)
      expect(decoded.parts['LocalCheckbox']).toEqual(Checkbox.Unchecked())

      // Preserved across keepOnRefold
      const refolded = App.synchronization?.keepOnRefold?.(
        checkedModel,
        initialModel,
      )
      expect(refolded?.parts['LocalCheckbox']).toEqual(Checkbox.Checked())
    })
  })
})
