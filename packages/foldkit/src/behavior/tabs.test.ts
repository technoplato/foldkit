import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Tabs from './tabs.js'

const sampleItems: ReadonlyArray<Tabs.Item> = [
  { value: 'overview', label: 'Overview' },
  { value: 'details', label: 'Details' },
  { value: 'billing', label: 'Billing', isDisabled: true },
  { value: 'security', label: 'Security' },
]

const baseProps: Tabs.Props = {
  id: 'settings',
  label: 'Settings sections',
  items: sampleItems,
}

const fold = (
  messages: ReadonlyArray<Tabs.Message>,
  props: Tabs.Props = baseProps,
  from: Tabs.State = Tabs.initial,
): Tabs.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Tabs.chart.transition(state, message, props)[0],
  )

describe('core Tabs Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Tabs.part)).toEqual([])
      expect(Part.problemsOf(Tabs.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Tabs.make({ sync: 'OwnView' }))).toEqual([])
      expect(Block.problemsOf({ name: 'Tabs', chart: Tabs.chart })).toEqual([])
      for (const action of Tabs.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })
  })

  describe('initial selection and defaults', () => {
    it('defaults to the first enabled tab and skips leading disabled tabs', () => {
      const leadingDisabled: Tabs.Props = {
        id: 'settings',
        items: [
          { value: 'locked', label: 'Locked', isDisabled: true },
          { value: 'profile', label: 'Profile' },
          { value: 'keys', label: 'Keys' },
        ],
      }
      expect(Tabs.activeIndexOf(Tabs.initial, leadingDisabled)).toEqual(
        Option.some(1),
      )
      expect(Tabs.activeValueOf(Tabs.initial, leadingDisabled)).toEqual(
        Option.some('profile'),
      )
      expect(Tabs.focusedIndexOf(Tabs.initial, leadingDisabled)).toEqual(
        Option.some(1),
      )
    })

    it('honors defaultValue when enabled and falls back when disabled or unknown', () => {
      const withDefault: Tabs.Props = {
        ...baseProps,
        defaultValue: 'security',
      }
      expect(Tabs.activeValueOf(Tabs.initial, withDefault)).toEqual(
        Option.some('security'),
      )

      const disabledDefault: Tabs.Props = {
        ...baseProps,
        defaultValue: 'billing',
      }
      expect(Tabs.activeValueOf(Tabs.initial, disabledDefault)).toEqual(
        Option.some('overview'),
      )

      const missingDefault: Tabs.Props = {
        ...baseProps,
        defaultValue: 'nonexistent',
      }
      expect(Tabs.activeValueOf(Tabs.initial, missingDefault)).toEqual(
        Option.some('overview'),
      )
    })

    it('supports pre-selected state via initialSelected', () => {
      const preselected = Tabs.initialSelected('details')
      expect(Tabs.activeValueOf(preselected, baseProps)).toEqual(
        Option.some('details'),
      )
      expect(Tabs.isTabSelected(preselected, baseProps, 'details')).toBe(true)
      expect(Tabs.isTabSelected(preselected, baseProps, 'overview')).toBe(false)
    })

    it('handles empty or all-disabled tab lists cleanly', () => {
      const allDisabled: Tabs.Props = {
        id: 'empty',
        items: [
          { value: 'a', label: 'A', isDisabled: true },
          { value: 'b', label: 'B', isDisabled: true },
        ],
      }
      expect(Tabs.activeIndexOf(Tabs.initial, allDisabled)).toEqual(
        Option.none(),
      )
      expect(Tabs.focusedIndexOf(Tabs.initial, allDisabled)).toEqual(
        Option.none(),
      )
      expect(
        Tabs.chart.step(
          Tabs.initial,
          Tabs.PressedTabKey({ key: 'ArrowRight' }),
          allDisabled,
        )._tag,
      ).toBe('Ignored')
      expect(
        Tabs.chart.step(
          Tabs.initial,
          Tabs.SelectTab({ value: 'a' }),
          allDisabled,
        )._tag,
      ).toBe('Ignored')
    })
  })

  describe('automatic activation mode (default)', () => {
    it('moves focus and activates immediately on horizontal arrow, Home, End, PageUp, PageDown, skipping disabled tabs', () => {
      // overview (0) -> details (1) -> skips disabled billing (2) -> security (3) -> wraps to overview (0)
      const s1 = fold([Tabs.PressedTabKey({ key: 'ArrowRight' })])
      expect(Tabs.activeValueOf(s1, baseProps)).toEqual(Option.some('details'))
      expect(Tabs.focusedValueOf(s1, baseProps)).toEqual(Option.some('details'))
      expect(Tabs.isFocused(s1)).toBe(true)

      const s2 = fold(
        [Tabs.PressedTabKey({ key: 'ArrowRight' })],
        baseProps,
        s1,
      )
      expect(Tabs.activeValueOf(s2, baseProps)).toEqual(Option.some('security'))

      const wrapped = fold(
        [Tabs.PressedTabKey({ key: 'ArrowRight' })],
        baseProps,
        s2,
      )
      expect(Tabs.activeValueOf(wrapped, baseProps)).toEqual(
        Option.some('overview'),
      )

      const back = fold(
        [Tabs.PressedTabKey({ key: 'ArrowLeft' })],
        baseProps,
        wrapped,
      )
      expect(Tabs.activeValueOf(back, baseProps)).toEqual(
        Option.some('security'),
      )

      const home = fold([Tabs.PressedTabKey({ key: 'Home' })], baseProps, back)
      expect(Tabs.activeValueOf(home, baseProps)).toEqual(
        Option.some('overview'),
      )

      const end = fold([Tabs.PressedTabKey({ key: 'End' })], baseProps, home)
      expect(Tabs.activeValueOf(end, baseProps)).toEqual(
        Option.some('security'),
      )

      const pageUp = fold(
        [Tabs.PressedTabKey({ key: 'PageUp' })],
        baseProps,
        end,
      )
      expect(Tabs.activeValueOf(pageUp, baseProps)).toEqual(
        Option.some('overview'),
      )

      const pageDown = fold(
        [Tabs.PressedTabKey({ key: 'PageDown' })],
        baseProps,
        pageUp,
      )
      expect(Tabs.activeValueOf(pageDown, baseProps)).toEqual(
        Option.some('security'),
      )
    })

    it('ignores PageUp/PageDown when pageKeys is false and ignores unrelated keys', () => {
      const noPageKeys: Tabs.Props = { ...baseProps, pageKeys: false }
      expect(
        Tabs.chart.step(
          Tabs.initial,
          Tabs.PressedTabKey({ key: 'PageDown' }),
          noPageKeys,
        )._tag,
      ).toBe('Ignored')
      expect(
        Tabs.chart.step(
          Tabs.initial,
          Tabs.PressedTabKey({ key: 'ArrowDown' }),
          baseProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Tabs.chart.step(
          Tabs.initial,
          Tabs.PressedTabKey({ key: 'Tab' }),
          baseProps,
        )._tag,
      ).toBe('Ignored')
    })

    it('respects Vertical orientation, RTL direction, and loop: false', () => {
      const verticalProps: Tabs.Props = {
        ...baseProps,
        orientation: 'Vertical',
      }
      expect(
        Tabs.chart.step(
          Tabs.initial,
          Tabs.PressedTabKey({ key: 'ArrowRight' }),
          verticalProps,
        )._tag,
      ).toBe('Ignored')
      const down = fold(
        [Tabs.PressedTabKey({ key: 'ArrowDown' })],
        verticalProps,
      )
      expect(Tabs.activeValueOf(down, verticalProps)).toEqual(
        Option.some('details'),
      )
      const up = fold(
        [Tabs.PressedTabKey({ key: 'ArrowUp' })],
        verticalProps,
        down,
      )
      expect(Tabs.activeValueOf(up, verticalProps)).toEqual(
        Option.some('overview'),
      )

      const rtlProps: Tabs.Props = {
        ...baseProps,
        orientation: 'Horizontal',
        direction: 'Rtl',
      }
      const rtlForward = fold(
        [Tabs.PressedTabKey({ key: 'ArrowLeft' })],
        rtlProps,
      )
      expect(Tabs.activeValueOf(rtlForward, rtlProps)).toEqual(
        Option.some('details'),
      )
      const rtlBackward = fold(
        [Tabs.PressedTabKey({ key: 'ArrowRight' })],
        rtlProps,
        rtlForward,
      )
      expect(Tabs.activeValueOf(rtlBackward, rtlProps)).toEqual(
        Option.some('overview'),
      )

      const noLoopProps: Tabs.Props = { ...baseProps, loop: false }
      const atStartClamped = fold(
        [Tabs.PressedTabKey({ key: 'ArrowLeft' })],
        noLoopProps,
      )
      expect(Tabs.activeValueOf(atStartClamped, noLoopProps)).toEqual(
        Option.some('overview'),
      )
      const atEnd = fold([Tabs.SelectTab({ value: 'security' })], noLoopProps)
      const atEndClamped = fold(
        [Tabs.PressedTabKey({ key: 'ArrowRight' })],
        noLoopProps,
        atEnd,
      )
      expect(Tabs.activeValueOf(atEndClamped, noLoopProps)).toEqual(
        Option.some('security'),
      )
    })
  })

  describe('manual activation mode', () => {
    const manualProps: Tabs.Props = {
      ...baseProps,
      activationMode: 'Manual',
    }

    it('moves focus on arrows without changing active selection until Enter, Space, or SelectTab', () => {
      const moved = fold(
        [Tabs.PressedTabKey({ key: 'ArrowRight' })],
        manualProps,
      )
      expect(Tabs.activeValueOf(moved, manualProps)).toEqual(
        Option.some('overview'),
      )
      expect(Tabs.focusedValueOf(moved, manualProps)).toEqual(
        Option.some('details'),
      )
      expect(Tabs.isTabSelected(moved, manualProps, 'overview')).toBe(true)
      expect(Tabs.isTabSelected(moved, manualProps, 'details')).toBe(false)
      expect(Tabs.isTabFocused(moved, manualProps, 'details')).toBe(true)

      // Arrow again -> skips disabled billing (2) -> focuses security (3), selection still overview (0)
      const movedAgain = fold(
        [Tabs.PressedTabKey({ key: 'ArrowRight' })],
        manualProps,
        moved,
      )
      expect(Tabs.activeValueOf(movedAgain, manualProps)).toEqual(
        Option.some('overview'),
      )
      expect(Tabs.focusedValueOf(movedAgain, manualProps)).toEqual(
        Option.some('security'),
      )

      // Enter activates the focused tab
      const entered = fold(
        [Tabs.PressedTabKey({ key: 'Enter' })],
        manualProps,
        movedAgain,
      )
      expect(Tabs.activeValueOf(entered, manualProps)).toEqual(
        Option.some('security'),
      )
      expect(Tabs.focusedValueOf(entered, manualProps)).toEqual(
        Option.some('security'),
      )

      // Move back to details and activate with Space
      const backToDetails = fold(
        [Tabs.MovedFocus({ move: 'Previous' })],
        manualProps,
        entered,
      )
      expect(Tabs.activeValueOf(backToDetails, manualProps)).toEqual(
        Option.some('security'),
      )
      expect(Tabs.focusedValueOf(backToDetails, manualProps)).toEqual(
        Option.some('details'),
      )

      const spaced = fold(
        [Tabs.PressedTabKey({ key: ' ' })],
        manualProps,
        backToDetails,
      )
      expect(Tabs.activeValueOf(spaced, manualProps)).toEqual(
        Option.some('details'),
      )
    })

    it('clears focus divergence on BlurredTabs and activates via ActivatedFocusedTab or SelectTab', () => {
      const diverged = fold(
        [Tabs.PressedTabKey({ key: 'ArrowRight' })],
        manualProps,
      )
      expect(Tabs.focusedValueOf(diverged, manualProps)).toEqual(
        Option.some('details'),
      )

      const blurred = fold([Tabs.BlurredTabs()], manualProps, diverged)
      expect(Tabs.isFocused(blurred)).toBe(false)
      expect(Tabs.activeValueOf(blurred, manualProps)).toEqual(
        Option.some('overview'),
      )
      expect(Tabs.focusedValueOf(blurred, manualProps)).toEqual(
        Option.some('overview'),
      )

      const activated = fold(
        [Tabs.ActivatedFocusedTab()],
        manualProps,
        diverged,
      )
      expect(Tabs.activeValueOf(activated, manualProps)).toEqual(
        Option.some('details'),
      )

      const clicked = fold(
        [Tabs.SelectTab({ value: 'security' })],
        manualProps,
        blurred,
      )
      expect(Tabs.activeValueOf(clicked, manualProps)).toEqual(
        Option.some('security'),
      )
      expect(Tabs.focusedValueOf(clicked, manualProps)).toEqual(
        Option.some('security'),
      )
    })
  })

  describe('selection actions, disabled tabs, and deselection', () => {
    it('ignores SelectTab and FocusedTab on disabled or unknown tabs', () => {
      expect(
        Tabs.chart.step(
          Tabs.initial,
          Tabs.SelectTab({ value: 'billing' }),
          baseProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Tabs.chart.step(
          Tabs.initial,
          Tabs.SelectTab({ value: 'missing' }),
          baseProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Tabs.chart.step(
          Tabs.initial,
          Tabs.FocusedTab({ value: 'billing' }),
          baseProps,
        )._tag,
      ).toBe('Ignored')
    })

    it('advances and retreats selection via SelectNextTab and SelectPreviousTab skipping disabled tabs', () => {
      const next1 = fold([Tabs.SelectNextTab()])
      expect(Tabs.activeValueOf(next1, baseProps)).toEqual(
        Option.some('details'),
      )

      const next2 = fold([Tabs.SelectNextTab()], baseProps, next1)
      expect(Tabs.activeValueOf(next2, baseProps)).toEqual(
        Option.some('security'),
      )

      const prev1 = fold([Tabs.SelectPreviousTab()], baseProps, next2)
      expect(Tabs.activeValueOf(prev1, baseProps)).toEqual(
        Option.some('details'),
      )
    })

    it('supports deselectable tabs and ignores ClearedTabSelection when not deselectable', () => {
      expect(
        Tabs.chart.step(Tabs.initial, Tabs.ClearedTabSelection(), baseProps)
          ._tag,
      ).toBe('Ignored')

      const deselectableProps: Tabs.Props = {
        ...baseProps,
        deselectable: true,
      }
      expect(Tabs.activeValueOf(Tabs.initial, deselectableProps)).toEqual(
        Option.none(),
      )
      // First enabled tab remains roving focusable even when nothing is selected
      expect(Tabs.focusedValueOf(Tabs.initial, deselectableProps)).toEqual(
        Option.some('overview'),
      )

      const selected = fold(
        [Tabs.SelectTab({ value: 'overview' })],
        deselectableProps,
      )
      expect(Tabs.activeValueOf(selected, deselectableProps)).toEqual(
        Option.some('overview'),
      )

      // Selecting the active tab again deselects it
      const deselected = fold(
        [Tabs.SelectTab({ value: 'overview' })],
        deselectableProps,
        selected,
      )
      expect(Tabs.activeValueOf(deselected, deselectableProps)).toEqual(
        Option.none(),
      )

      // ClearedTabSelection clears explicitly
      const reselected = fold(
        [Tabs.SelectTab({ value: 'details' })],
        deselectableProps,
        deselected,
      )
      const cleared = fold(
        [Tabs.ClearedTabSelection()],
        deselectableProps,
        reselected,
      )
      expect(Tabs.activeValueOf(cleared, deselectableProps)).toEqual(
        Option.none(),
      )
    })
  })

  describe('element IDs, ARIA linkage, and reference-stable projection', () => {
    it('projects full WAI-ARIA tablist, tab, and tabpanel attributes and keeps untouched SlotBindings reference-identical', () => {
      const tabsPart = Tabs.make({ name: 'StableTabs' })
      const v1 = Part.view(tabsPart, Tabs.initial, baseProps)
      const listBefore = v1.slot('List')
      const overviewTabBefore = v1.slot('Tab', 'overview')
      const detailsTabBefore = v1.slot('Tab', 'details')
      const billingTabBefore = v1.slot('Tab', 'billing')
      const securityTabBefore = v1.slot('Tab', 'security')
      const overviewPanelBefore = v1.slot('Panel', 'overview')
      const securityPanelBefore = v1.slot('Panel', 'security')

      // Unchanged state + new props object with identical fields -> same View & bindings
      const v2 = Part.view(tabsPart, Tabs.initial, { ...baseProps })
      expect(v2).toBe(v1)
      expect(v2.slot('List')).toBe(listBefore)
      expect(v2.slot('Tab', 'overview')).toBe(overviewTabBefore)
      expect(v2.slot('Panel', 'overview')).toBe(overviewPanelBefore)

      // Element IDs
      expect(Tabs.listId('settings')).toBe('settings-list')
      expect(Tabs.tabId('settings', 0)).toBe('settings-tab-0')
      expect(Tabs.panelId('settings', 0)).toBe('settings-panel-0')

      // Full ARIA linkage via Slot.ariaOf
      expect(Slot.ariaOf(listBefore)).toEqual({
        role: 'tablist',
        id: 'settings-list',
        'aria-orientation': 'horizontal',
        'aria-label': 'Settings sections',
      })
      expect(Slot.ariaOf(overviewTabBefore)).toEqual({
        role: 'tab',
        id: 'settings-tab-0',
        'aria-selected': 'true',
        'aria-controls': 'settings-panel-0',
        tabindex: '0',
      })
      expect(Slot.ariaOf(detailsTabBefore)).toEqual({
        role: 'tab',
        id: 'settings-tab-1',
        'aria-selected': 'false',
        'aria-controls': 'settings-panel-1',
        tabindex: '-1',
      })
      expect(Slot.ariaOf(billingTabBefore)).toEqual({
        role: 'tab',
        id: 'settings-tab-2',
        'aria-selected': 'false',
        'aria-controls': 'settings-panel-2',
        'aria-disabled': 'true',
        tabindex: '-1',
      })
      expect(Slot.ariaOf(overviewPanelBefore)).toEqual({
        role: 'tabpanel',
        id: 'settings-panel-0',
        'aria-labelledby': 'settings-tab-0',
        tabindex: '0',
      })
      expect(Slot.ariaOf(securityPanelBefore)).toEqual({
        role: 'tabpanel',
        id: 'settings-panel-3',
        'aria-labelledby': 'settings-tab-3',
        tabindex: '-1',
        hidden: '',
      })

      // Selecting 'details' updates overview & details while keeping List, billing, security Tab & Panel identical
      const nextState = fold([Tabs.SelectTab({ value: 'details' })])
      const v3 = Part.view(tabsPart, nextState, baseProps)
      expect(v3).not.toBe(v1)
      expect(v3.slot('List')).toBe(listBefore)
      expect(v3.slot('Tab', 'billing')).toBe(billingTabBefore)
      expect(v3.slot('Tab', 'security')).toBe(securityTabBefore)
      expect(v3.slot('Panel', 'security')).toBe(securityPanelBefore)
      expect(v3.slot('Tab', 'overview')).not.toBe(overviewTabBefore)
      expect(v3.slot('Tab', 'details')).not.toBe(detailsTabBefore)
      expect(v3.slot('Panel', 'overview')).not.toBe(overviewPanelBefore)

      expect(Slot.ariaOf(v3.slot('Tab', 'details'))).toEqual({
        role: 'tab',
        id: 'settings-tab-1',
        'aria-selected': 'true',
        'aria-controls': 'settings-panel-1',
        tabindex: '0',
      })
      expect(Slot.ariaOf(v3.slot('Panel', 'details'))).toEqual({
        role: 'tabpanel',
        id: 'settings-panel-1',
        'aria-labelledby': 'settings-tab-1',
        tabindex: '0',
      })
      expect(Slot.ariaOf(v3.slot('Panel', 'overview'))).toEqual({
        role: 'tabpanel',
        id: 'settings-panel-0',
        'aria-labelledby': 'settings-tab-0',
        tabindex: '-1',
        hidden: '',
      })
    })

    it('projects roving tabindex separately from aria-selected in Manual mode and vertical aria-orientation', () => {
      const manualVerticalProps: Tabs.Props = {
        ...baseProps,
        orientation: 'Vertical',
        activationMode: 'Manual',
      }
      const tabsPart = Tabs.make({ name: 'ManualVerticalTabs' })
      const diverged = fold(
        [Tabs.PressedTabKey({ key: 'ArrowDown' })],
        manualVerticalProps,
      )
      const view = Part.view(tabsPart, diverged, manualVerticalProps)

      expect(Slot.ariaOf(view.slot('List'))['aria-orientation']).toBe(
        'vertical',
      )
      expect(Slot.ariaOf(view.slot('Tab', 'overview'))).toMatchObject({
        'aria-selected': 'true',
        tabindex: '-1',
      })
      expect(Slot.ariaOf(view.slot('Tab', 'details'))).toMatchObject({
        'aria-selected': 'false',
        tabindex: '0',
      })
    })
  })

  describe('synchronization: synced by default with a device-only option', () => {
    const DummyModel = S.Struct({ title: S.String })
    const RenameTitle = Catalog.action('RenameTitle', {
      fields: { title: S.String },
      what: 'Changes the page title',
      why: 'To label the current workspace',
      meta: { label: 'Rename', keys: [] },
    })
    const dummyCatalog = Catalog.make([RenameTitle])
    const BaseProgram = makeProgram({
      id: 'tabs-sync-test',
      version: 1,
      Model: DummyModel,
      Message: dummyCatalog.Message,
      init: () => [{ title: 'Settings' }, []],
      update: (model, message) => [{ ...model, title: message.title }, []],
      catalog: dummyCatalog,
    })

    it('syncs Tabs state and Messages by default (Navigation category)', () => {
      const SyncedApp = Part.compose({
        of: BaseProgram,
        parts: [Part.given(Tabs.part, () => baseProps)],
      })
      const [model] = SyncedApp.init()
      const sync = Option.getOrThrow(
        Option.fromNullishOr(SyncedApp.synchronization),
      )

      expect(sync.messageCategory(Tabs.SelectTab({ value: 'details' }))).toBe(
        'Navigation',
      )
      expect(sync.isLocalOnly?.(Tabs.SelectTab({ value: 'details' }))).toBe(
        false,
      )
      expect(sync.paceOf?.(Tabs.SelectTab({ value: 'details' }))).toEqual(
        Synced(),
      )
      expect(sync.paceOf?.(Tabs.PressedTabKey({ key: 'ArrowRight' }))).toEqual(
        Synced(),
      )

      const encoded = S.encodeUnknownSync(SyncedApp.Model)(model)
      expect(encoded).toMatchObject({
        title: 'Settings',
        parts: { Tabs: { _tag: 'Idle' } },
      })

      // projectLocal keeps selected tab while resting focus divergence to Idle
      const [selected] = SyncedApp.update(
        model,
        Tabs.SelectTab({ value: 'details' }),
      )
      const rested = sync.projectLocal?.(selected)
      expect(rested?.parts['Tabs']).toEqual(
        Tabs.Idle({ maybeSelectedValue: Option.some('details') }),
      )
    })

    it('keeps Tabs device-only when configured with Tabs.deviceOnly() or Tabs.make({ sync: "OwnView" })', () => {
      const LocalTabs = Tabs.deviceOnly({ name: 'LocalTabs' })
      const LocalApp = Part.compose({
        of: BaseProgram,
        parts: [Part.given(LocalTabs, () => baseProps)],
      })
      const [model] = LocalApp.init()
      const sync = Option.getOrThrow(
        Option.fromNullishOr(LocalApp.synchronization),
      )

      expect(sync.isLocalOnly?.(Tabs.SelectTab({ value: 'details' }))).toBe(
        true,
      )
      expect(sync.paceOf?.(Tabs.SelectTab({ value: 'details' }))).toEqual(
        Device({ because: 'OwnView' }),
      )

      // Omitted from encoded Model when all parts are device-only
      const encoded = S.encodeUnknownSync(LocalApp.Model)(model)
      expect(JSON.stringify(encoded)).not.toContain('LocalTabs')

      // Preserved across refolds
      const [selected] = LocalApp.update(
        model,
        Tabs.SelectTab({ value: 'details' }),
      )
      const kept = sync.keepOnRefold?.(selected, model)
      expect(kept?.parts['LocalTabs']).toEqual(selected.parts['LocalTabs'])
    })
  })
})
