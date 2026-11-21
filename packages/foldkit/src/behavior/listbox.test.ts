import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Listbox from './listbox.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Typeahead from './typeahead.js'

const sampleItems: ReadonlyArray<Listbox.Item> = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana', isDisabled: true },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
]

const singleProps: Listbox.Props = {
  id: 'fruit',
  label: 'Favorite fruit',
  name: 'fruit',
  items: sampleItems,
}

const multiProps: Listbox.Props = {
  ...singleProps,
  selectionMode: 'Multiple',
}

const fold = (
  messages: ReadonlyArray<Listbox.Message>,
  props: Listbox.Props = singleProps,
  from: Listbox.State = Listbox.initial,
): Listbox.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Listbox.chart.transition(state, message, props)[0],
  )

describe('core Listbox Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Listbox.part)).toEqual([])
      expect(Part.problemsOf(Listbox.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Listbox.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Part.problemsOf(Listbox.make({ defaultValue: ['apple'] })),
      ).toEqual([])
      expect(
        Block.problemsOf({ name: 'Listbox', chart: Listbox.chart }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'ListboxSelected',
          chart: Listbox.chartOf(Listbox.initialSelected(['apple'])),
        }),
      ).toEqual([])
      for (const action of Listbox.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and default config readings', () => {
      expect(Listbox.buttonId('fruit')).toBe('fruit-button')
      expect(Listbox.listboxId('fruit')).toBe('fruit-items')
      expect(Listbox.optionId('fruit', 2)).toBe('fruit-item-2')
      expect(Listbox.labelId('fruit')).toBe('fruit-label')
      expect(Listbox.groupId('fruit', 'citrus')).toBe('fruit-group-citrus')
      expect(Listbox.headingId('fruit', 'citrus')).toBe('fruit-heading-citrus')

      expect(Listbox.orientationOf({})).toBe('Vertical')
      expect(Listbox.directionOf({})).toBe('Ltr')
      expect(Listbox.selectionModeOf({})).toBe('Single')
      expect(Listbox.isMultipleOf({})).toBe(false)
      expect(Listbox.isDeselectableOf({})).toBe(false)
      expect(Listbox.isDeselectableOf({ selectionMode: 'Multiple' })).toBe(true)
      expect(Listbox.loopOf({})).toBe(true)
      expect(Listbox.isMessage(Listbox.SelectAllListboxOptions())).toBe(true)
    })
  })

  describe('single selection, focus, active-descendant, and keyboard navigation', () => {
    it('focuses the first enabled item or first selected item, navigates skipping disabled items, and selects with Space/Enter', () => {
      const focused = fold([Listbox.FocusListbox()])
      expect(Listbox.isFocused(focused)).toBe(true)
      expect(Listbox.activeIndexOf(focused, singleProps)).toEqual(
        Option.some(0),
      )
      expect(Listbox.activeValueOf(focused, singleProps)).toEqual(
        Option.some('apple'),
      )
      expect(Listbox.activeDescendantIdOf(focused, singleProps)).toEqual(
        Option.some('fruit-item-0'),
      )

      // ArrowDown to apricot (1), then ArrowDown skips disabled banana (2) -> cherry (3)
      const atCherry = fold(
        [
          Listbox.PressedListboxKey({ key: 'ArrowDown' }),
          Listbox.PressedListboxKey({ key: 'ArrowDown' }),
        ],
        singleProps,
        focused,
      )
      expect(Listbox.activeIndexOf(atCherry, singleProps)).toEqual(
        Option.some(3),
      )
      expect(Listbox.activeDescendantIdOf(atCherry, singleProps)).toEqual(
        Option.some('fruit-item-3'),
      )

      // Space selects cherry
      const selectedCherry = fold(
        [Listbox.PressedListboxKey({ key: ' ' })],
        singleProps,
        atCherry,
      )
      expect(Listbox.selectedValuesOf(selectedCherry)).toEqual(['cherry'])
      expect(Listbox.isOptionSelected(selectedCherry, 'cherry')).toBe(true)
      expect(Listbox.optionDataStateOf(selectedCherry, 'cherry')).toBe(
        'checked',
      )
      expect(Listbox.optionDataStateOf(selectedCherry, 'apple')).toBe(
        'unchecked',
      )
      expect(Listbox.hiddenInputsOf(selectedCherry, singleProps)).toEqual([
        { name: 'fruit', value: 'cherry' },
      ])

      // Home -> first enabled (apple), End -> last enabled (date), Enter selects date
      const atFirst = fold(
        [Listbox.PressedListboxKey({ key: 'Home' })],
        singleProps,
        selectedCherry,
      )
      expect(Listbox.activeValueOf(atFirst, singleProps)).toEqual(
        Option.some('apple'),
      )

      const selectedLast = fold(
        [
          Listbox.PressedListboxKey({ key: 'End' }),
          Listbox.PressedListboxKey({ key: 'Enter' }),
        ],
        singleProps,
        atFirst,
      )
      expect(Listbox.selectedValuesOf(selectedLast)).toEqual(['date'])

      // Blur returns to Idle, keeping selection; re-focusing after atRest lands on selected item
      const blurred = fold([Listbox.BlurListbox()], singleProps, selectedLast)
      expect(Listbox.isFocused(blurred)).toBe(false)
      const rested = Listbox.atRest(blurred)
      expect(Listbox.activeIndexOf(rested, singleProps)).toEqual(Option.none())
      const refocused = fold([Listbox.FocusListbox()], singleProps, rested)
      expect(Listbox.activeValueOf(refocused, singleProps)).toEqual(
        Option.some('date'),
      )
    })

    it('supports horizontal orientation, RTL arrows, non-looping clamping, selectOnHighlight, and deselectable Escape', () => {
      const horizontalRtl: Listbox.Props = {
        ...singleProps,
        orientation: 'Horizontal',
        direction: 'Rtl',
        loop: false,
        selectOnHighlight: true,
        deselectable: true,
      }

      const focused = fold([Listbox.FocusListbox()], horizontalRtl)
      expect(Listbox.activeValueOf(focused, horizontalRtl)).toEqual(
        Option.some('apple'),
      )

      // ArrowLeft moves forward in Horizontal RTL and selects when selectOnHighlight is true
      const next = fold(
        [Listbox.PressedListboxKey({ key: 'ArrowLeft' })],
        horizontalRtl,
        focused,
      )
      expect(Listbox.activeValueOf(next, horizontalRtl)).toEqual(
        Option.some('apricot'),
      )
      expect(Listbox.selectedValuesOf(next)).toEqual(['apricot'])

      // Vertical ArrowDown is ignored in Horizontal orientation
      const ignored = Listbox.chart.step(
        next,
        Listbox.PressedListboxKey({ key: 'ArrowDown' }),
        horizontalRtl,
      )
      expect(ignored).toMatchObject({
        _tag: 'Ignored',
        reason: 'ExplicitlyIgnored',
      })

      // Escape clears selection when deselectable
      const cleared = fold(
        [Listbox.PressedListboxKey({ key: 'Escape' })],
        horizontalRtl,
        next,
      )
      expect(Listbox.isSelectionEmpty(cleared)).toBe(true)

      // Clamps at ends when loop is false
      const atEnd = fold(
        [
          Listbox.PressedListboxKey({ key: 'End' }),
          Listbox.PressedListboxKey({ key: 'ArrowLeft' }),
        ],
        horizontalRtl,
        cleared,
      )
      expect(Listbox.activeValueOf(atEnd, horizontalRtl)).toEqual(
        Option.some('date'),
      )
    })
  })

  describe('multiple selection: toggle, Shift+Arrow, Shift+Click range, and Mod+A select all', () => {
    it('toggles multiple options, extends ranges via Shift+Arrow and SelectListboxRange, and selects all via Mod+A', () => {
      // Click apple, then click date -> both selected
      const twoSelected = fold(
        [
          Listbox.SelectListboxOption({ value: 'apple' }),
          Listbox.SelectListboxOption({ value: 'date' }),
        ],
        multiProps,
      )
      expect(Listbox.selectedValuesOf(twoSelected)).toEqual(['apple', 'date'])
      expect(Listbox.selectedCountOf(twoSelected)).toBe(2)

      // Toggle apple off
      const onlyDate = fold(
        [Listbox.SelectListboxOption({ value: 'apple' })],
        multiProps,
        twoSelected,
      )
      expect(Listbox.selectedValuesOf(onlyDate)).toEqual(['date'])

      // Shift+Click (SelectListboxRange) from date anchor back to apple -> selects apple, apricot, cherry, date (skipping disabled banana)
      const rangeSelected = fold(
        [Listbox.SelectListboxRange({ value: 'apple' })],
        multiProps,
        onlyDate,
      )
      expect(Listbox.selectedValuesOf(rangeSelected)).toEqual([
        'apple',
        'apricot',
        'cherry',
        'date',
      ])
      expect(Listbox.isAllSelected(rangeSelected, multiProps)).toBe(true)

      // Clear selection, then use Shift+ArrowDown from apple
      const cleared = fold(
        [Listbox.ClearListboxSelection()],
        multiProps,
        rangeSelected,
      )
      expect(Listbox.isSelectionEmpty(cleared)).toBe(true)

      const shiftExtended = fold(
        [
          Listbox.SelectListboxOption({ value: 'apple' }),
          Listbox.PressedListboxKey({ key: 'ArrowDown', isShift: true }),
          Listbox.PressedListboxKey({ key: 'ArrowDown', isShift: true }),
        ],
        multiProps,
        cleared,
      )
      expect(Listbox.selectedValuesOf(shiftExtended)).toEqual([
        'apple',
        'apricot',
        'cherry',
      ])
      expect(Listbox.activeValueOf(shiftExtended, multiProps)).toEqual(
        Option.some('cherry'),
      )

      // Shift+ArrowUp shrinks range back to [apple, apricot]
      const shiftShrunk = fold(
        [Listbox.PressedListboxKey({ key: 'ArrowUp', isShift: true })],
        multiProps,
        shiftExtended,
      )
      expect(Listbox.selectedValuesOf(shiftShrunk)).toEqual([
        'apple',
        'apricot',
      ])

      // Mod+A selects all enabled items
      const modA = fold(
        [Listbox.PressedListboxKey({ key: 'a', isMeta: true })],
        multiProps,
        shiftShrunk,
      )
      expect(Listbox.isAllSelected(modA, multiProps)).toBe(true)
      expect(Listbox.selectedValuesOf(modA)).toEqual([
        'apple',
        'apricot',
        'cherry',
        'date',
      ])

      // Ctrl+A also selects all; Mod+A is ignored when disallowSelectAll is true
      const disallowProps: Listbox.Props = {
        ...multiProps,
        disallowSelectAll: true,
      }
      const noSelectAll = Listbox.chart.step(
        shiftShrunk,
        Listbox.PressedListboxKey({ key: 'a', isControl: true }),
        disallowProps,
      )
      expect(noSelectAll).toMatchObject({
        _tag: 'Ignored',
        reason: 'ExplicitlyIgnored',
      })
    })
  })

  describe('typeahead via Typeahead block and Command.answerAfter', () => {
    it('jumps to matching enabled options, refines multi-character queries, emits WaitToClearListboxSearch, and ignores stale versions', () => {
      const focused = fold([Listbox.FocusListbox()])

      // Typing 'c' jumps to Cherry (index 3) and schedules WaitToClearListboxSearch(version: 1, afterMs: 350)
      const [afterC, cmdsC] = Listbox.chart.transition(
        focused,
        Listbox.PressedListboxKey({ key: 'c' }),
        singleProps,
      )
      expect(Listbox.activeValueOf(afterC, singleProps)).toEqual(
        Option.some('cherry'),
      )
      expect(Listbox.searchQueryOf(afterC)).toBe('c')
      expect(cmdsC).toHaveLength(1)
      expect(cmdsC[0]?.name).toBe('WaitToClearListboxSearch')

      // Typing 'a' while query is 'c' -> 'ca' matches nothing, stays on cherry, bumps version to 2
      const [afterCa, cmdsCa] = Listbox.chart.transition(
        afterC,
        Listbox.PressedListboxKey({ key: 'a' }),
        singleProps,
      )
      expect(Listbox.searchQueryOf(afterCa)).toBe('ca')
      expect(Listbox.activeValueOf(afterCa, singleProps)).toEqual(
        Option.some('cherry'),
      )
      expect(cmdsCa).toHaveLength(1)

      // Stale ClearedListboxSearch(version: 1) is ignored
      const staleStep = Listbox.chart.step(
        afterCa,
        Listbox.ClearedListboxSearch({ version: 1 }),
        singleProps,
      )
      expect(staleStep).toMatchObject({
        _tag: 'Ignored',
        reason: 'ExplicitlyIgnored',
      })

      // Matching ClearedListboxSearch(version: 2) resets query to ''
      const [afterReset] = Listbox.chart.transition(
        afterCa,
        Listbox.ClearedListboxSearch({ version: 2 }),
        singleProps,
      )
      expect(Listbox.searchQueryOf(afterReset)).toBe('')

      // Fresh 'a' -> Apple (0), refinement 'p' -> stays Apple, 'r' -> Apricot (1)
      const afterApr = fold(
        [
          Listbox.PressedListboxKey({ key: 'a' }),
          Listbox.PressedListboxKey({ key: 'p' }),
          Listbox.PressedListboxKey({ key: 'r' }),
        ],
        singleProps,
        afterReset,
      )
      expect(Listbox.activeValueOf(afterApr, singleProps)).toEqual(
        Option.some('apricot'),
      )
      expect(Typeahead.resetMs).toBe(350)
    })
  })

  describe('pointer hover deduplication, leave behavior, reconciliation, and reset', () => {
    it('deduplicates same-coordinate pointer moves, clears pointer highlight on leave while keeping keyboard highlight, reconciles removed items, and resets to defaultValue', () => {
      const hovered = fold([
        Listbox.MovedPointerOverListboxItem({
          index: 1,
          screenX: 100,
          screenY: 200,
        }),
      ])
      expect(Listbox.activeIndexOf(hovered, singleProps)).toEqual(
        Option.some(1),
      )

      // Same coordinates ignored
      const samePos = Listbox.chart.step(
        hovered,
        Listbox.MovedPointerOverListboxItem({
          index: 3,
          screenX: 100,
          screenY: 200,
        }),
        singleProps,
      )
      expect(samePos).toMatchObject({
        _tag: 'Ignored',
        reason: 'ExplicitlyIgnored',
      })

      // Leaving clears pointer-activated highlight
      const left = fold([Listbox.LeftListboxItem()], singleProps, hovered)
      expect(Listbox.activeIndexOf(left, singleProps)).toEqual(Option.none())

      // Keyboard-activated highlight stays put on LeftListboxItem
      const keyboardHighlighted = fold([
        Listbox.HighlightListboxItem({
          index: 3,
          activationTrigger: 'Keyboard',
        }),
      ])
      expect(
        Listbox.chart.step(
          keyboardHighlighted,
          Listbox.LeftListboxItem(),
          singleProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Reconcile drops removed selected items and invalid active indices
      const selectedDate = fold([
        Listbox.SelectListboxOption({ value: 'date' }),
      ])
      const shrunkProps: Listbox.Props = {
        ...singleProps,
        items: [{ value: 'apple', label: 'Apple' }],
      }
      const reconciled = fold(
        [Listbox.ReconcileListboxItems()],
        shrunkProps,
        selectedDate,
      )
      expect(Listbox.isSelectionEmpty(reconciled)).toBe(true)
      expect(Listbox.activeIndexOf(reconciled, shrunkProps)).toEqual(
        Option.none(),
      )

      // Reset restores defaultValue and returns to Idle
      const withDefault: Listbox.Props = {
        ...singleProps,
        defaultValue: ['apricot'],
      }
      const reset = fold([Listbox.ResetListbox()], withDefault, selectedDate)
      expect(Listbox.isFocused(reset)).toBe(false)
      expect(Listbox.selectedValuesOf(reset)).toEqual(['apricot'])
    })
  })

  describe('reference-stable SlotBinding projection and Part.compose synchronization', () => {
    it('projects Listbox, Option, and Label slots with WAI-ARIA and preserves unchanged binding references', () => {
      const part = Listbox.make({ name: 'FruitListbox' })
      const state1 = fold(
        [Listbox.SelectListboxOption({ value: 'apple' })],
        multiProps,
      )

      const view1 = Part.view(part, state1, multiProps)
      const view1Again = Part.view(part, state1, multiProps)
      expect(view1Again).toBe(view1)

      const listboxSlot = view1.slot('Listbox')
      expect(Slot.ariaOf(listboxSlot)).toEqual({
        role: 'listbox',
        id: 'fruit-items',
        'aria-activedescendant': 'fruit-item-0',
        'aria-orientation': 'vertical',
        'aria-multiselectable': 'true',
        'aria-label': 'Favorite fruit',
        tabindex: '0',
      })

      const appleSlot = view1.slot('Option', 'apple')
      const bananaSlot = view1.slot('Option', 'banana')
      const cherrySlot = view1.slot('Option', 'cherry')
      const labelSlot = view1.slot('Label')

      expect(Slot.ariaOf(appleSlot)).toEqual({
        role: 'option',
        id: 'fruit-item-0',
        'aria-current': 'true',
        'aria-selected': 'true',
      })
      expect(appleSlot.gestures).toEqual([
        { gesture: 'Pressed', press: 'SelectListboxOption:apple' },
      ])
      expect(Slot.ariaOf(bananaSlot)).toEqual({
        role: 'option',
        id: 'fruit-item-2',
        'aria-current': 'false',
        'aria-selected': 'false',
        'aria-disabled': 'true',
      })
      expect(Slot.ariaOf(labelSlot)).toEqual({
        id: 'fruit-label',
      })

      // Single mode omits aria-multiselectable
      const singleView = Part.view(Listbox.part, state1, singleProps)
      expect(
        Slot.ariaOf(singleView.slot('Listbox'))['aria-multiselectable'],
      ).toBeUndefined()

      // Reference stability: selecting apricot leaves cherry's Option slot object identical
      const state2 = fold(
        [Listbox.SelectListboxOption({ value: 'apricot' })],
        multiProps,
        state1,
      )
      const view2 = Part.view(part, state2, multiProps)
      expect(view2.slot('Option', 'cherry')).toBe(cherrySlot)
      expect(view2.slot('Option', 'apricot')).not.toBe(
        view1.slot('Option', 'apricot'),
      )
    })

    it('syncs under Domain by default and supports deviceOnly() omitting state from encoded Model', () => {
      const BaseModel = S.Struct({ count: S.Number })
      const BaseMessage = S.Union([])
      const Base = makeProgram({
        id: 'listbox-sync-test',
        version: 1,
        Model: BaseModel,
        Message: BaseMessage,
        init: () => [{ count: 0 }, []],
        update: (model: typeof BaseModel.Type) => [model, []],
      })

      const syncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Listbox.make(), () => singleProps)],
      })
      expect(
        syncedApp.synchronization?.messageCategory(
          Listbox.SelectListboxOption({ value: 'apple' }),
        ),
      ).toBe('Domain')
      expect(
        syncedApp.synchronization?.paceOf?.(
          Listbox.SelectListboxOption({ value: 'apple' }),
        ),
      ).toEqual(Synced())

      const localApp = Part.compose({
        of: Base,
        parts: [Part.given(Listbox.deviceOnly(), () => singleProps)],
      })
      expect(
        localApp.synchronization?.paceOf?.(
          Listbox.SelectListboxOption({ value: 'apple' }),
        ),
      ).toEqual(Device({ because: 'OwnView' }))
      const [localInit] = localApp.init()
      expect(S.encodeSync(localApp.Model)(localInit)).toEqual({ count: 0 })
    })
  })
})
