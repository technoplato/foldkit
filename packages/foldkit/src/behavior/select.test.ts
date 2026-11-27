import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Layers from './layers.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Select from './select.js'
import * as Slot from './slot.js'
import * as Typeahead from './typeahead.js'

const sampleItems: ReadonlyArray<Select.Item> = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana', isDisabled: true },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
  { value: 'dark-cherry', label: 'Dark Cherry' },
]

const singleProps: Select.Props = {
  id: 'fruit',
  placeholder: 'Choose a fruit',
  hasLabel: true,
  hasDescription: true,
  hasError: true,
  name: 'fruit',
  items: sampleItems,
}

const multiProps: Select.Props = {
  ...singleProps,
  selectionMode: 'Multiple',
}

const fold = (
  messages: ReadonlyArray<Select.Message>,
  props: Select.Props = singleProps,
  from: Select.State = Select.initial,
): Select.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Select.chart.transition(state, message, props)[0],
  )

describe('core Select Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Select.part)).toEqual([])
      expect(Part.problemsOf(Select.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Select.make({ sync: 'OwnView' }))).toEqual([])
      expect(Part.problemsOf(Select.make({ defaultValue: ['apple'] }))).toEqual(
        [],
      )
      expect(Block.problemsOf({ name: 'Select', chart: Select.chart })).toEqual(
        [],
      )
      expect(
        Block.problemsOf({
          name: 'SelectSelected',
          chart: Select.chartOf(Select.initialSelected(['apple'])),
        }),
      ).toEqual([])
      for (const action of Select.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs, config readers, and pure helpers', () => {
      expect(Select.selectId('fruit')).toBe('fruit-select')
      expect(Select.triggerId('fruit')).toBe('fruit-trigger')
      expect(Select.contentId('fruit')).toBe('fruit-content')
      expect(Select.optionId('fruit', 2)).toBe('fruit-option-2')
      expect(Select.labelId('fruit')).toBe('fruit-label')
      expect(Select.descriptionId('fruit')).toBe('fruit-description')
      expect(Select.errorId('fruit')).toBe('fruit-error')
      expect(Select.clearButtonId('fruit')).toBe('fruit-clear')

      expect(Select.selectionModeOf({})).toBe('Single')
      expect(Select.isMultipleOf({})).toBe(false)
      expect(Select.isDeselectableOf({})).toBe(false)
      expect(Select.isDeselectableOf({ selectionMode: 'Multiple' })).toBe(true)
      expect(Select.closeOnSelectOf({})).toBe(true)
      expect(Select.closeOnSelectOf({ selectionMode: 'Multiple' })).toBe(false)
      expect(Select.loopOf({})).toBe(false)
      expect(Select.canSelect({})).toBe(true)
      expect(Select.canSelect({ isDisabled: true })).toBe(false)
      expect(Select.canSelect({ isReadOnly: true })).toBe(false)
      expect(Select.canSelect({ hasHandler: false })).toBe(false)
      expect(Select.isDisabledOf({ isDisabled: true })).toBe(true)
      expect(Select.isInvalidOf({ isInvalid: true })).toBe(true)
      expect(Select.isMessage(Select.ToggleSelect())).toBe(true)

      expect(Select.displayLabelOf(Select.initial, singleProps)).toBe(
        'Choose a fruit',
      )
      const preselected = Select.initialSelected(['cherry', 'apple'])
      expect(Select.selectedOptionsOf(preselected, singleProps)).toEqual([
        { value: 'apple', label: 'Apple' },
        { value: 'cherry', label: 'Cherry' },
      ])
      expect(Select.displayLabelOf(preselected, singleProps)).toBe(
        'Apple, Cherry',
      )
      expect(Select.displayLabelOf(preselected, singleProps, ' / ')).toBe(
        'Apple / Cherry',
      )
    })
  })

  describe('open, close, roving focus, and single selection', () => {
    it('opens via click, Enter, Space, ArrowDown, and ArrowUp; highlights selected or first/last enabled; navigates skipping disabled; selects and closes in single mode', () => {
      // ToggleSelect opens with no active item when nothing is selected
      const clickedOpen = fold([Select.ToggleSelect()])
      expect(Select.isOpen(clickedOpen)).toBe(true)
      expect(Select.activeIndexOf(clickedOpen, singleProps)).toEqual(
        Option.none(),
      )

      // ToggleSelect again closes
      const clickedClosed = fold(
        [Select.ToggleSelect()],
        singleProps,
        clickedOpen,
      )
      expect(Select.isClosed(clickedClosed)).toBe(true)

      // ArrowDown on closed trigger opens and highlights first enabled (apple)
      const openedDown = fold([Select.PressedTriggerKey({ key: 'ArrowDown' })])
      expect(Select.isOpen(openedDown)).toBe(true)
      expect(Select.activeValueOf(openedDown, singleProps)).toEqual(
        Option.some('apple'),
      )
      expect(Select.activeDescendantIdOf(openedDown, singleProps)).toEqual(
        Option.some('fruit-option-0'),
      )

      // ArrowUp on closed trigger opens and highlights last enabled (dark-cherry)
      const openedUp = fold([Select.PressedTriggerKey({ key: 'ArrowUp' })])
      expect(Select.isOpen(openedUp)).toBe(true)
      expect(Select.activeValueOf(openedUp, singleProps)).toEqual(
        Option.some('dark-cherry'),
      )

      // Enter and Space on closed trigger also open on first enabled
      expect(
        Select.isOpen(fold([Select.PressedTriggerKey({ key: 'Enter' })])),
      ).toBe(true)
      expect(
        Select.isOpen(fold([Select.PressedTriggerKey({ key: ' ' })])),
      ).toBe(true)

      // Navigate down from apple -> apricot -> skips disabled banana -> cherry
      const atCherry = fold(
        [
          Select.PressedSelectKey({ key: 'ArrowDown' }),
          Select.PressedSelectKey({ key: 'ArrowDown' }),
        ],
        singleProps,
        openedDown,
      )
      expect(Select.activeValueOf(atCherry, singleProps)).toEqual(
        Option.some('cherry'),
      )
      expect(Select.activeDescendantIdOf(atCherry, singleProps)).toEqual(
        Option.some('fruit-option-3'),
      )

      // Default loop: false clamps at ends; loop: true wraps around
      const atEnd = fold(
        [
          Select.PressedSelectKey({ key: 'End' }),
          Select.PressedSelectKey({ key: 'ArrowDown' }),
        ],
        singleProps,
        atCherry,
      )
      expect(Select.activeValueOf(atEnd, singleProps)).toEqual(
        Option.some('dark-cherry'),
      )

      const wrapped = fold(
        [Select.PressedSelectKey({ key: 'ArrowDown' })],
        { ...singleProps, loop: true },
        atEnd,
      )
      expect(Select.activeValueOf(wrapped, singleProps)).toEqual(
        Option.some('apple'),
      )

      // Enter selects cherry and closes in single mode
      const selectedCherry = fold(
        [Select.PressedSelectKey({ key: 'Enter' })],
        singleProps,
        atCherry,
      )
      expect(Select.isClosed(selectedCherry)).toBe(true)
      expect(Select.selectedValuesOf(selectedCherry)).toEqual(['cherry'])
      expect(Select.displayLabelOf(selectedCherry, singleProps)).toBe('Cherry')
      expect(Select.optionDataStateOf(selectedCherry, 'cherry')).toBe('checked')
      expect(Select.optionDataStateOf(selectedCherry, 'apple')).toBe(
        'unchecked',
      )
      expect(Select.hiddenInputsOf(selectedCherry, singleProps)).toEqual([
        { name: 'fruit', value: 'cherry' },
      ])

      // Re-opening via click highlights the selected item (cherry)
      const reopened = fold(
        [Select.ToggleSelect()],
        singleProps,
        selectedCherry,
      )
      expect(Select.isOpen(reopened)).toBe(true)
      expect(Select.activeValueOf(reopened, singleProps)).toEqual(
        Option.some('cherry'),
      )

      // Tab closes without changing selection
      const tabbedClosed = fold(
        [
          Select.PressedSelectKey({ key: 'ArrowDown' }),
          Select.PressedSelectKey({ key: 'Tab' }),
        ],
        singleProps,
        reopened,
      )
      expect(Select.isClosed(tabbedClosed)).toBe(true)
      expect(Select.selectedValuesOf(tabbedClosed)).toEqual(['cherry'])

      // Alt+ArrowUp closes open popup
      const altClosed = fold(
        [Select.PressedSelectKey({ key: 'ArrowUp', isAlt: true })],
        singleProps,
        reopened,
      )
      expect(Select.isClosed(altClosed)).toBe(true)

      // Closed-trigger horizontal arrows and Home/End cycle single selection directly
      const closedNext = fold(
        [Select.PressedTriggerKey({ key: 'ArrowRight' })],
        singleProps,
        altClosed,
      )
      expect(Select.isClosed(closedNext)).toBe(true)
      expect(Select.selectedValuesOf(closedNext)).toEqual(['date'])

      const closedHome = fold(
        [Select.PressedTriggerKey({ key: 'Home' })],
        singleProps,
        closedNext,
      )
      expect(Select.selectedValuesOf(closedHome)).toEqual(['apple'])

      const closedEnd = fold(
        [Select.PressedTriggerKey({ key: 'End' })],
        singleProps,
        closedHome,
      )
      expect(Select.selectedValuesOf(closedEnd)).toEqual(['dark-cherry'])
    })

    it('supports multiple selection staying open by default, toggling options, clear, and explicit closeOnSelect', () => {
      const opened = fold([Select.OpenSelect()], multiProps)
      expect(Select.isOpen(opened)).toBe(true)

      // Selecting options keeps popup open in Multiple mode
      const twoSelected = fold(
        [
          Select.SelectOption({ value: 'apple' }),
          Select.SelectOption({ value: 'cherry' }),
        ],
        multiProps,
        opened,
      )
      expect(Select.isOpen(twoSelected)).toBe(true)
      expect(Select.selectedValuesOf(twoSelected)).toEqual(['apple', 'cherry'])
      expect(Select.selectedCountOf(twoSelected)).toBe(2)
      expect(Select.displayLabelOf(twoSelected, multiProps)).toBe(
        'Apple, Cherry',
      )

      // Selecting an already-selected option toggles it off
      const onlyCherry = fold(
        [Select.SelectOption({ value: 'apple' })],
        multiProps,
        twoSelected,
      )
      expect(Select.selectedValuesOf(onlyCherry)).toEqual(['cherry'])

      // ClearSelect empties selection when deselectable (default in Multiple)
      const cleared = fold([Select.ClearSelect()], multiProps, onlyCherry)
      expect(Select.isSelectionEmpty(cleared)).toBe(true)
      expect(Select.isOpen(cleared)).toBe(true)

      // Disabled option is ignored
      const disabledAttempt = Select.chart.step(
        cleared,
        Select.SelectOption({ value: 'banana' }),
        multiProps,
      )
      expect(disabledAttempt).toMatchObject({
        _tag: 'Ignored',
        reason: 'ExplicitlyIgnored',
      })

      // Single mode with deselectable: false refuses ClearSelect; deselectable: true permits it
      const singleSelected = fold([Select.SelectOption({ value: 'apple' })])
      expect(
        Select.chart.step(singleSelected, Select.ClearSelect(), singleProps)
          ._tag,
      ).toBe('Ignored')
      const deselectableCleared = fold(
        [Select.ClearSelect()],
        { ...singleProps, deselectable: true },
        singleSelected,
      )
      expect(Select.isSelectionEmpty(deselectableCleared)).toBe(true)
    })
  })

  describe('typeahead while closed and while open via Typeahead and Command.answerAfter', () => {
    it('selects matching option directly while closed, refines multi-character queries including Space, and resets on matching version only', () => {
      // Typing 'd' while closed selects Date (index 4) and emits WaitToClearSelectSearch
      const [afterD, cmdsD] = Select.chart.transition(
        Select.initial,
        Select.PressedTriggerKey({ key: 'd' }),
        singleProps,
      )
      expect(Select.isClosed(afterD)).toBe(true)
      expect(Select.selectedValuesOf(afterD)).toEqual(['date'])
      expect(Select.searchQueryOf(afterD)).toBe('d')
      expect(cmdsD).toHaveLength(1)
      expect(cmdsD[0]?.name).toBe('WaitToClearSelectSearch')

      // Refining with 'a', 'r', 'k', ' ', 'c' selects Dark Cherry (Space does NOT open while searching!)
      const afterDarkC = fold(
        [
          Select.PressedTriggerKey({ key: 'a' }),
          Select.PressedTriggerKey({ key: 'r' }),
          Select.PressedTriggerKey({ key: 'k' }),
          Select.PressedTriggerKey({ key: ' ' }),
          Select.PressedTriggerKey({ key: 'c' }),
        ],
        singleProps,
        afterD,
      )
      expect(Select.isClosed(afterDarkC)).toBe(true)
      expect(Select.selectedValuesOf(afterDarkC)).toEqual(['dark-cherry'])
      expect(Select.searchQueryOf(afterDarkC)).toBe('dark c')

      // Stale ClearedSelectSearch(version: 1) is ignored
      const stale = Select.chart.step(
        afterDarkC,
        Select.ClearedSelectSearch({ version: 1 }),
        singleProps,
      )
      expect(stale).toMatchObject({
        _tag: 'Ignored',
        reason: 'ExplicitlyIgnored',
      })

      // Matching ClearedSelectSearch(version: 6) clears query while preserving selection
      const [cleared] = Select.chart.transition(
        afterDarkC,
        Select.ClearedSelectSearch({ version: 6 }),
        singleProps,
      )
      expect(Select.searchQueryOf(cleared)).toBe('')
      expect(Select.selectedValuesOf(cleared)).toEqual(['dark-cherry'])
      expect(Typeahead.resetMs).toBe(350)
    })

    it('highlights matching option while open without immediately changing selection, and resets on matching version', () => {
      const opened = fold([Select.PressedTriggerKey({ key: 'ArrowDown' })])

      // Typing 'c' while open highlights Cherry (index 3) and schedules WaitToClearSelectSearch
      const [afterC, cmdsC] = Select.chart.transition(
        opened,
        Select.PressedSelectKey({ key: 'c' }),
        singleProps,
      )
      expect(Select.isOpen(afterC)).toBe(true)
      expect(Select.activeValueOf(afterC, singleProps)).toEqual(
        Option.some('cherry'),
      )
      expect(Select.isSelectionEmpty(afterC)).toBe(true)
      expect(Select.searchQueryOf(afterC)).toBe('c')
      expect(cmdsC).toHaveLength(1)
      expect(cmdsC[0]?.name).toBe('WaitToClearSelectSearch')

      // Matching ClearedSelectSearch resets search query
      const [reset] = Select.chart.transition(
        afterC,
        Select.ClearedSelectSearch({ version: 1 }),
        singleProps,
      )
      expect(Select.searchQueryOf(reset)).toBe('')

      // Fresh 'a', 'p', 'r' refines highlight from Apple to Apricot
      const afterApr = fold(
        [
          Select.PressedSelectKey({ key: 'a' }),
          Select.PressedSelectKey({ key: 'p' }),
          Select.PressedSelectKey({ key: 'r' }),
        ],
        singleProps,
        reset,
      )
      expect(Select.activeValueOf(afterApr, singleProps)).toEqual(
        Option.some('apricot'),
      )
    })
  })

  describe('layers dismissal, placement geometry, guards, pointer hover, reconciliation, and atRest', () => {
    it('honors Layers stack order, dismissOnEscape, dismissOnOutsidePress, and insideIds', () => {
      const selectLayer = Select.layerOf(singleProps)
      const dialogLayer = Layers.layer('confirm-dialog', { isModal: true })
      const opened = fold([Select.OpenSelect()])

      // Buried under a modal dialog -> Escape, DismissSelect, and outside press are ignored
      const buriedProps: Select.Props = {
        ...singleProps,
        layers: [selectLayer, dialogLayer],
      }
      expect(
        Select.chart.step(
          opened,
          Select.PressedSelectKey({ key: 'Escape' }),
          buriedProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Select.chart.step(opened, Select.DismissSelect(), buriedProps)._tag,
      ).toBe('Ignored')
      expect(
        Select.chart.step(
          opened,
          Select.PressedOutsideSelect({ insideIds: [] }),
          buriedProps,
        )._tag,
      ).toBe('Ignored')

      // Topmost above dialog -> Escape and outside press dismiss, while pressing inside stays open
      const topProps: Select.Props = {
        ...singleProps,
        layers: [dialogLayer, selectLayer],
      }
      expect(
        Select.isClosed(
          fold([Select.PressedSelectKey({ key: 'Escape' })], topProps, opened),
        ),
      ).toBe(true)
      expect(
        Select.isClosed(
          fold(
            [Select.PressedOutsideSelect({ insideIds: ['confirm-dialog'] })],
            topProps,
            opened,
          ),
        ),
      ).toBe(true)
      expect(
        Select.isOpen(
          fold(
            [Select.PressedOutsideSelect({ insideIds: ['fruit'] })],
            topProps,
            opened,
          ),
        ),
      ).toBe(true)

      // dismissOnEscape: false and dismissOnOutsidePress: false are respected
      const guardedProps: Select.Props = {
        ...singleProps,
        dismissOnEscape: false,
        dismissOnOutsidePress: false,
      }
      expect(
        Select.isOpen(
          fold(
            [
              Select.PressedSelectKey({ key: 'Escape' }),
              Select.DismissSelect(),
              Select.PressedOutsideSelect({ insideIds: [] }),
            ],
            guardedProps,
            opened,
          ),
        ),
      ).toBe(true)
    })

    it('delegates popup placement to Placement.place via placeFor', () => {
      const below = Select.placeFor(
        { placement: { gapPx: 4, edgePx: 12 } },
        {
          anchor: { left: 200, top: 100, width: 160, height: 32 },
          size: { width: 200, height: 180 },
          view: { width: 800, height: 600 },
        },
      )
      expect(below).toEqual({ left: 200, top: 136, side: 'Below' })

      const above = Select.placeFor(
        { placement: { gapPx: 4, edgePx: 12 } },
        {
          anchor: { left: 200, top: 500, width: 160, height: 32 },
          size: { width: 200, height: 180 },
          view: { width: 800, height: 600 },
        },
      )
      expect(above).toEqual({ left: 200, top: 316, side: 'Above' })
    })

    it('blocks interaction when disabled or readOnly, deduplicates pointer moves, reconciles items, resets, and preserves selection atRest', () => {
      const disabledProps: Select.Props = { ...singleProps, isDisabled: true }
      const readOnlyProps: Select.Props = { ...singleProps, isReadOnly: true }

      expect(
        Select.isClosed(
          fold(
            [
              Select.OpenSelect(),
              Select.ToggleSelect(),
              Select.PressedTriggerKey({ key: 'ArrowDown' }),
              Select.PressedTriggerKey({ key: 'a' }),
              Select.SelectOption({ value: 'apple' }),
            ],
            disabledProps,
          ),
        ),
      ).toBe(true)
      expect(
        Select.isSelectionEmpty(
          fold([Select.SelectOption({ value: 'apple' })], disabledProps),
        ),
      ).toBe(true)
      expect(
        Select.isClosed(
          fold(
            [
              Select.OpenSelect(),
              Select.ToggleSelect(),
              Select.PressedTriggerKey({ key: 'Enter' }),
              Select.PressedTriggerKey({ key: 'a' }),
            ],
            readOnlyProps,
          ),
        ),
      ).toBe(true)

      // Pointer hover deduplication and leave behavior while open
      const hovered = fold([
        Select.OpenSelect(),
        Select.MovedPointerOverSelectItem({
          index: 1,
          screenX: 120,
          screenY: 240,
        }),
      ])
      expect(Select.activeIndexOf(hovered, singleProps)).toEqual(Option.some(1))
      expect(
        Select.chart.step(
          hovered,
          Select.MovedPointerOverSelectItem({
            index: 3,
            screenX: 120,
            screenY: 240,
          }),
          singleProps,
        )._tag,
      ).toBe('Ignored')
      const left = fold([Select.LeftSelectItem()], singleProps, hovered)
      expect(Select.activeIndexOf(left, singleProps)).toEqual(Option.none())

      // Keyboard highlight stays on LeftSelectItem
      const kbHighlighted = fold([
        Select.PressedTriggerKey({ key: 'ArrowDown' }),
      ])
      expect(
        Select.chart.step(kbHighlighted, Select.LeftSelectItem(), singleProps)
          ._tag,
      ).toBe('Ignored')

      // atRest closes open popup while preserving selection
      const openWithSelection = fold([
        Select.SelectOption({ value: 'cherry' }),
        Select.OpenSelect(),
      ])
      expect(Select.isOpen(openWithSelection)).toBe(true)
      const rested = Select.atRest(openWithSelection)
      expect(Select.isClosed(rested)).toBe(true)
      expect(Select.selectedValuesOf(rested)).toEqual(['cherry'])

      // Reconcile drops removed selected options and invalid active indices
      const shrunkProps: Select.Props = {
        ...singleProps,
        items: [{ value: 'apple', label: 'Apple' }],
      }
      const reconciled = fold(
        [Select.ReconcileSelectItems()],
        shrunkProps,
        openWithSelection,
      )
      expect(Select.isSelectionEmpty(reconciled)).toBe(true)
      expect(Select.activeIndexOf(reconciled, shrunkProps)).toEqual(
        Option.none(),
      )

      // Reset restores defaultValue and closes popup
      const withDefault: Select.Props = {
        ...singleProps,
        defaultValue: ['apricot'],
      }
      const reset = fold([Select.ResetSelect()], withDefault, openWithSelection)
      expect(Select.isClosed(reset)).toBe(true)
      expect(Select.selectedValuesOf(reset)).toEqual(['apricot'])
    })
  })

  describe('reference-stable SlotBinding projection and Part.compose synchronization', () => {
    it('projects Trigger, Content, Option, Label, Description, and Error slots with WAI-ARIA and preserves unchanged references', () => {
      const part = Select.make({ name: 'FruitSelect' })
      const invalidMultiProps: Select.Props = {
        ...multiProps,
        isInvalid: true,
        isRequired: true,
      }

      const closedView = Part.view(part, Select.initial, invalidMultiProps)
      expect(Part.view(part, Select.initial, invalidMultiProps)).toBe(
        closedView,
      )

      const closedTrigger = closedView.slot('Trigger')
      expect(Slot.ariaOf(closedTrigger)).toEqual({
        role: 'combobox',
        id: 'fruit-trigger',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
        'aria-controls': 'fruit-content',
        'aria-labelledby': 'fruit-label',
        'aria-describedby': 'fruit-description fruit-error',
        'aria-required': 'true',
        'aria-invalid': 'true',
        tabindex: '0',
      })
      expect(closedTrigger.gestures).toEqual([
        { gesture: 'Pressed', press: 'ToggleSelect' },
      ])

      const closedContent = closedView.slot('Content')
      expect(Slot.ariaOf(closedContent)).toEqual({
        role: 'listbox',
        id: 'fruit-content',
        'aria-labelledby': 'fruit-label',
        'aria-multiselectable': 'true',
        hidden: '',
      })

      const labelSlot = closedView.slot('Label')
      const descriptionSlot = closedView.slot('Description')
      const errorSlot = closedView.slot('Error')
      expect(Slot.ariaOf(labelSlot)).toEqual({ id: 'fruit-label' })
      expect(Slot.ariaOf(descriptionSlot)).toEqual({ id: 'fruit-description' })
      expect(Slot.ariaOf(errorSlot)).toEqual({ id: 'fruit-error' })

      // Valid props hide Error slot and omit errorId from aria-describedby
      const validView = Part.view(Select.part, Select.initial, singleProps)
      expect(Slot.ariaOf(validView.slot('Trigger'))['aria-describedby']).toBe(
        'fruit-description',
      )
      expect(Slot.ariaOf(validView.slot('Error'))).toEqual({
        id: 'fruit-error',
        hidden: '',
      })

      // Open on ArrowDown and select apple -> Content unhidden with activeId, Option slots updated
      const openState = fold(
        [
          Select.PressedTriggerKey({ key: 'ArrowDown' }),
          Select.SelectOption({ value: 'apple' }),
        ],
        invalidMultiProps,
      )
      const openView = Part.view(part, openState, invalidMultiProps)
      expect(Slot.ariaOf(openView.slot('Trigger'))['aria-expanded']).toBe(
        'true',
      )
      expect(Slot.ariaOf(openView.slot('Content'))).toEqual({
        role: 'listbox',
        id: 'fruit-content',
        'aria-labelledby': 'fruit-label',
        'aria-multiselectable': 'true',
        'aria-activedescendant': 'fruit-option-0',
        tabindex: '0',
      })
      expect(Slot.ariaOf(openView.slot('Option', 'apple'))).toEqual({
        role: 'option',
        id: 'fruit-option-0',
        'aria-selected': 'true',
        'aria-current': 'true',
      })
      expect(Slot.ariaOf(openView.slot('Option', 'banana'))).toEqual({
        role: 'option',
        id: 'fruit-option-2',
        'aria-selected': 'false',
        'aria-current': 'false',
        'aria-disabled': 'true',
      })

      // Reference stability across consecutive renders (closed -> open -> moved):
      // unchanged Label, Description, Error, and untouched Cherry Option keep exact references
      expect(openView.slot('Label')).toBe(labelSlot)
      expect(openView.slot('Description')).toBe(descriptionSlot)
      expect(openView.slot('Error')).toBe(errorSlot)
      const cherryBefore = openView.slot('Option', 'cherry')
      const movedState = fold(
        [Select.PressedSelectKey({ key: 'ArrowDown' })],
        invalidMultiProps,
        openState,
      )
      const movedView = Part.view(part, movedState, invalidMultiProps)
      expect(movedView.slot('Label')).toBe(labelSlot)
      expect(movedView.slot('Description')).toBe(descriptionSlot)
      expect(movedView.slot('Error')).toBe(errorSlot)
      expect(movedView.slot('Option', 'cherry')).toBe(cherryBefore)
      expect(movedView.slot('Option', 'apricot')).not.toBe(
        openView.slot('Option', 'apricot'),
      )
    })

    it('syncs under Domain by default and supports deviceOnly() omitting state from encoded Model', () => {
      const BaseModel = S.Struct({ count: S.Number })
      const BaseMessage = S.Union([
        Catalog.action('Bump', {
          what: 'Bumps',
          why: 'To bump',
          meta: { label: 'Bump', keys: [] },
        }),
      ])
      const Base = makeProgram({
        id: 'select-sync-test',
        version: 1,
        Model: BaseModel,
        Message: BaseMessage,
        init: () => [{ count: 0 }, []],
        update: (model: typeof BaseModel.Type) => [model, []],
      })

      const syncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Select.make(), () => singleProps)],
      })
      expect(
        syncedApp.synchronization?.messageCategory(
          Select.SelectOption({ value: 'apple' }),
        ),
      ).toBe('Domain')
      expect(
        syncedApp.synchronization?.paceOf?.(
          Select.SelectOption({ value: 'apple' }),
        ),
      ).toEqual(Synced())

      const localApp = Part.compose({
        of: Base,
        parts: [Part.given(Select.deviceOnly(), () => singleProps)],
      })
      expect(
        localApp.synchronization?.paceOf?.(
          Select.SelectOption({ value: 'apple' }),
        ),
      ).toEqual(Device({ because: 'OwnView' }))
      const [localInit] = localApp.init()
      expect(S.encodeSync(localApp.Model)(localInit)).toEqual({ count: 0 })
    })
  })
})
