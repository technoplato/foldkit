import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as ToggleGroup from './toggleGroup.js'

const baseProps: ToggleGroup.Props = {
  id: 'align-group',
  label: 'Text alignment',
  mode: 'Single',
  items: [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'justify', label: 'Justify', isDisabled: true },
    { value: 'right', label: 'Right' },
  ],
}

const fold = (
  messages: ReadonlyArray<ToggleGroup.Message>,
  props: ToggleGroup.Props = baseProps,
  from: ToggleGroup.State = ToggleGroup.initial,
): ToggleGroup.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => ToggleGroup.chart.transition(state, message, props)[0],
  )

describe('core ToggleGroup Part', () => {
  describe('declaration, chart integrity, IDs, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(ToggleGroup.part)).toEqual([])
      expect(
        Part.problemsOf(ToggleGroup.make({ defaultValue: ['left'] })),
      ).toEqual([])
      expect(Part.problemsOf(ToggleGroup.deviceOnly())).toEqual([])
      expect(
        Block.problemsOf({ name: 'ToggleGroup', chart: ToggleGroup.chart }),
      ).toEqual([])

      for (const action of ToggleGroup.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and round-trips Idle and Focused states through Effect Schema JSON encoding', () => {
      expect(ToggleGroup.rootId('align-group')).toBe('align-group-root')
      expect(ToggleGroup.itemId('align-group', 1)).toBe('align-group-item-1')

      const pressed = fold([ToggleGroup.ToggleGroupItem({ value: 'center' })])
      for (const state of [ToggleGroup.initial, pressed]) {
        const encoded = S.encodeUnknownSync(ToggleGroup.State)(state)
        const decoded = S.decodeUnknownSync(ToggleGroup.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('Single/Multiple selection, deselectable guard, roving focus, and disabled/readOnly guards', () => {
    it('toggles single items with deselectable default true, and blocks unpressing when deselectable is false', () => {
      const pressedLeft = fold([ToggleGroup.ToggleGroupItem({ value: 'left' })])
      expect(ToggleGroup.valuesOf(pressedLeft)).toEqual(['left'])
      expect(ToggleGroup.isItemPressed(pressedLeft, 'left')).toBe(true)
      expect(ToggleGroup.itemDataStateOf(pressedLeft, 'left')).toBe('on')
      expect(ToggleGroup.itemDataStateOf(pressedLeft, 'center')).toBe('off')

      // Switching in Single mode replaces the pressed item
      const pressedCenter = fold(
        [ToggleGroup.ToggleGroupItem({ value: 'center' })],
        baseProps,
        pressedLeft,
      )
      expect(ToggleGroup.valuesOf(pressedCenter)).toEqual(['center'])

      // Toggling the pressed item again deselects it (deselectable: true default)
      const unpressed = fold(
        [ToggleGroup.ToggleGroupItem({ value: 'center' })],
        baseProps,
        pressedCenter,
      )
      expect(ToggleGroup.valuesOf(unpressed)).toEqual([])

      // deselectable: false keeps the active item pressed
      const mandatoryProps: ToggleGroup.Props = {
        ...baseProps,
        deselectable: false,
      }
      const stayedPressed = fold(
        [
          ToggleGroup.ToggleGroupItem({ value: 'center' }),
          ToggleGroup.ClearToggleGroup(),
        ],
        mandatoryProps,
        pressedCenter,
      )
      expect(ToggleGroup.valuesOf(stayedPressed)).toEqual(['center'])
    })

    it('supports Multiple mode, roving focus across orientations, Space/Enter toggle, and readOnly/disabled guards', () => {
      const multiProps: ToggleGroup.Props = {
        ...baseProps,
        mode: 'Multiple',
        orientation: 'Vertical',
      }
      const both = fold(
        [
          ToggleGroup.ToggleGroupItem({ value: 'left' }),
          ToggleGroup.ToggleGroupItem({ value: 'right' }),
        ],
        multiProps,
      )
      expect(ToggleGroup.valuesOf(both)).toEqual(['left', 'right'])

      // Vertical arrow keys rove without toggling selection; Space toggles focused item
      const rovedToLeft = fold(
        [
          ToggleGroup.PressedToggleGroupKey({ key: 'ArrowDown' }),
          ToggleGroup.PressedToggleGroupKey({ key: ' ' }),
        ],
        multiProps,
        both,
      )
      expect(ToggleGroup.focusedValueOf(rovedToLeft, multiProps)).toEqual(
        Option.some('left'),
      )
      expect(ToggleGroup.valuesOf(rovedToLeft)).toEqual(['right'])

      // Disabled item is skipped by roving focus and ignored by ToggleGroupItem
      const skippedJustify = fold(
        [
          ToggleGroup.FocusToggleGroupItem({ value: 'center' }),
          ToggleGroup.PressedToggleGroupKey({ key: 'ArrowDown' }),
        ],
        multiProps,
        rovedToLeft,
      )
      expect(ToggleGroup.focusedValueOf(skippedJustify, multiProps)).toEqual(
        Option.some('right'),
      )
      const ignoredDisabledItem = fold(
        [ToggleGroup.ToggleGroupItem({ value: 'justify' })],
        multiProps,
        skippedJustify,
      )
      expect(ToggleGroup.valuesOf(ignoredDisabledItem)).toEqual(['right'])

      // readOnly allows roving focus but blocks pressing/unpressing
      const readOnlyProps: ToggleGroup.Props = {
        ...baseProps,
        isReadOnly: true,
      }
      const rovedReadOnly = fold(
        [
          ToggleGroup.PressedToggleGroupKey({ key: 'ArrowRight' }),
          ToggleGroup.PressedToggleGroupKey({ key: ' ' }),
          ToggleGroup.ToggleGroupItem({ value: 'center' }),
        ],
        readOnlyProps,
        ToggleGroup.initialSelected(['left']),
      )
      expect(ToggleGroup.focusedValueOf(rovedReadOnly, readOnlyProps)).toEqual(
        Option.some('center'),
      )
      expect(ToggleGroup.valuesOf(rovedReadOnly)).toEqual(['left'])

      // Disabled group blocks both focus and toggling
      const disabledProps: ToggleGroup.Props = {
        ...baseProps,
        isDisabled: true,
      }
      const blocked = fold(
        [
          ToggleGroup.PressedToggleGroupKey({ key: 'ArrowRight' }),
          ToggleGroup.ToggleGroupItem({ value: 'left' }),
        ],
        disabledProps,
      )
      expect(ToggleGroup.isFocused(blocked)).toBe(false)
      expect(ToggleGroup.valuesOf(blocked)).toEqual([])

      // atRest keeps pressed values and clears transient focus
      const rested = ToggleGroup.atRest(both)
      expect(ToggleGroup.isFocused(rested)).toBe(false)
      expect(ToggleGroup.valuesOf(rested)).toEqual(['left', 'right'])
    })
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects Root and Item slots with aria-pressed, roving tabindex, and reference stability', () => {
      const idleView1 = Part.view(
        ToggleGroup.part,
        ToggleGroup.initial,
        baseProps,
      )
      const idleView2 = Part.view(
        ToggleGroup.part,
        ToggleGroup.initial,
        baseProps,
      )
      expect(idleView1).toBe(idleView2)

      expect(Slot.ariaOf(idleView1.slot('Root'))).toMatchObject({
        role: 'group',
        id: 'align-group-root',
        'aria-orientation': 'horizontal',
        'aria-label': 'Text alignment',
      })
      const leftIdle = idleView1.slot('Item', 'left')
      const rightIdle = idleView1.slot('Item', 'right')
      expect(Slot.ariaOf(leftIdle)).toMatchObject({
        role: 'button',
        id: 'align-group-item-0',
        'aria-pressed': 'false',
        tabindex: '0',
      })
      expect(Slot.ariaOf(rightIdle)).toMatchObject({
        'aria-pressed': 'false',
        tabindex: '-1',
      })

      const pressedLeft = fold([ToggleGroup.ToggleGroupItem({ value: 'left' })])
      const pressedView = Part.view(ToggleGroup.part, pressedLeft, baseProps)
      expect(pressedView.slot('Item', 'right')).toBe(rightIdle)
      expect(Slot.ariaOf(pressedView.slot('Item', 'left'))).toMatchObject({
        'aria-pressed': 'true',
        tabindex: '0',
      })
    })

    it('syncs by default under Domain and supports deviceOnly omission', () => {
      expect(ToggleGroup.synced.ToggleGroupItem).toEqual(Synced())
      expect(ToggleGroup.deviceSync('OwnView').ToggleGroupItem).toEqual(
        Device({ because: 'OwnView' }),
      )

      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'toggle-group-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(ToggleGroup.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [pressedSynced] = SyncedApp.update(
        initSynced,
        ToggleGroup.ToggleGroupItem({ value: 'center' }),
      )
      expect(
        SyncedApp.synchronization?.messageCategory(
          ToggleGroup.ToggleGroupItem({ value: 'center' }),
        ),
      ).toBe('Domain')
      expect(
        S.encodeUnknownSync(SyncedApp.Model)(pressedSynced),
      ).toHaveProperty('parts.ToggleGroup._tag', 'Focused')

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(ToggleGroup.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [pressedLocal] = LocalApp.update(
        initLocal,
        ToggleGroup.ToggleGroupItem({ value: 'center' }),
      )
      expect(
        S.encodeUnknownSync(LocalApp.Model)(pressedLocal),
      ).not.toHaveProperty('parts')
    })
  })
})
