import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Combobox from './combobox.js'
import * as Layers from './layers.js'
import { Device, Settled, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const sampleItems: ReadonlyArray<Combobox.Item> = [
  { value: 'apple', label: 'Apple', keywords: ['pomme'] },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana', isDisabled: true },
  { value: 'creme', label: 'Crème Brûlée' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'dark-cherry', label: 'Dark Cherry' },
]

const singleProps: Combobox.Props = {
  id: 'fruit',
  placeholder: 'Search fruit...',
  hasLabel: true,
  hasDescription: true,
  hasError: true,
  name: 'fruit',
  items: sampleItems,
}

const multiProps: Combobox.Props = {
  ...singleProps,
  selectionMode: 'Multiple',
}

const fold = (
  messages: ReadonlyArray<Combobox.Message>,
  props: Combobox.Props = singleProps,
  from: Combobox.State = Combobox.initial,
): Combobox.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Combobox.chart.transition(state, message, props)[0],
  )

describe('core Combobox Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Combobox.part)).toEqual([])
      expect(Part.problemsOf(Combobox.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Combobox.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Part.problemsOf(
          Combobox.make({
            settleMs: 120,
            defaultValue: ['apple'],
            defaultInputValue: 'Apple',
          }),
        ),
      ).toEqual([])
      expect(
        Block.problemsOf({ name: 'Combobox', chart: Combobox.chart }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'ComboboxSelected',
          chart: Combobox.chartOf(Combobox.initialSelected(['apple'], 'Apple')),
        }),
      ).toEqual([])

      for (const action of Combobox.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs, config readers, and pure thin-painter helpers', () => {
      expect(Combobox.comboboxId('fruit')).toBe('fruit-combobox')
      expect(Combobox.inputId('fruit')).toBe('fruit-input')
      expect(Combobox.triggerId('fruit')).toBe('fruit-trigger')
      expect(Combobox.contentId('fruit')).toBe('fruit-content')
      expect(Combobox.optionId('fruit', 3)).toBe('fruit-option-3')
      expect(Combobox.labelId('fruit')).toBe('fruit-label')
      expect(Combobox.descriptionId('fruit')).toBe('fruit-description')
      expect(Combobox.errorId('fruit')).toBe('fruit-error')
      expect(Combobox.clearButtonId('fruit')).toBe('fruit-clear')
      expect(Combobox.groupId('fruit', 'citrus')).toBe('fruit-group-citrus')
      expect(Combobox.headingId('fruit', 'citrus')).toBe('fruit-heading-citrus')

      expect(Combobox.selectionModeOf({})).toBe('Single')
      expect(Combobox.isMultipleOf({})).toBe(false)
      expect(Combobox.isDeselectableOf({})).toBe(false)
      expect(Combobox.isDeselectableOf({ nullable: true })).toBe(true)
      expect(Combobox.isDeselectableOf({ selectionMode: 'Multiple' })).toBe(
        true,
      )
      expect(Combobox.closeOnSelectOf({})).toBe(true)
      expect(Combobox.closeOnSelectOf({ selectionMode: 'Multiple' })).toBe(
        false,
      )
      expect(Combobox.selectionBehaviorOf({})).toBe('Replace')
      expect(Combobox.selectionBehaviorOf({ selectionMode: 'Multiple' })).toBe(
        'Clear',
      )
      expect(Combobox.canInteract({})).toBe(true)
      expect(Combobox.canInteract({ isDisabled: true })).toBe(false)
      expect(Combobox.canInteract({ isReadOnly: true })).toBe(false)
      expect(
        Combobox.shouldClearOnClose({ isNullable: true, inputValue: '' }),
      ).toBe(true)
      expect(
        Combobox.shouldClearOnClose({ isNullable: true, inputValue: 'a' }),
      ).toBe(false)
      expect(
        Combobox.shouldDeselectOnSelect({
          isNullable: true,
          wasSelected: true,
        }),
      ).toBe(true)
      expect(
        Combobox.isMessage(Combobox.ChangeComboboxInput({ value: 'a' })),
      ).toBe(true)
    })
  })

  describe('opening, live ListFilter filtering, keyboard roving, and single selection', () => {
    it('supports openOnInput, openOnFocus, openOnClick, live diacritic-folded filtering, match ranges, and roving navigation', () => {
      // Focus does not open by default, opens when openOnFocus: true
      expect(
        Combobox.isClosed(fold([Combobox.FocusComboboxInput()], singleProps)),
      ).toBe(true)
      expect(
        Combobox.isOpen(
          fold([Combobox.FocusComboboxInput()], {
            ...singleProps,
            openOnFocus: true,
          }),
        ),
      ).toBe(true)

      // Click does not open by default, opens when openOnClick: true
      expect(
        Combobox.isClosed(fold([Combobox.ClickComboboxInput()], singleProps)),
      ).toBe(true)
      expect(
        Combobox.isOpen(
          fold([Combobox.ClickComboboxInput()], {
            ...singleProps,
            openOnClick: true,
          }),
        ),
      ).toBe(true)

      // Typing opens by default (openOnInput: true), filters via ListFilter, and auto-highlights first match
      const typedCreme = fold([
        Combobox.ChangeComboboxInput({ value: 'creme' }),
      ])
      expect(Combobox.isOpen(typedCreme)).toBe(true)
      expect(Combobox.isFiltering(typedCreme)).toBe(true)
      expect(Combobox.inputValueOf(typedCreme)).toBe('creme')
      expect(Combobox.filterQueryOf(typedCreme)).toBe('creme')
      expect(
        Array.map(
          Combobox.filteredItemsOf(typedCreme, singleProps),
          item => item.value,
        ),
      ).toEqual(['creme'])
      expect(Combobox.activeValueOf(typedCreme, singleProps)).toEqual(
        Option.some('creme'),
      )
      expect(Combobox.activeDescendantIdOf(typedCreme, singleProps)).toEqual(
        Option.some('fruit-option-3'),
      )
      expect(Combobox.matchRangesOf(typedCreme, singleProps, 'creme')).toEqual([
        { start: 0, end: 5 },
      ])

      // Keyword matching works ('pomme' matches Apple)
      const typedKeyword = fold([
        Combobox.ChangeComboboxInput({ value: 'pomme' }),
      ])
      expect(
        Array.map(
          Combobox.filteredItemsOf(typedKeyword, singleProps),
          item => item.value,
        ),
      ).toEqual(['apple'])

      // Fuzzy mode + sortFilteredByScore ranks better matches first
      const fuzzyProps: Combobox.Props = {
        ...singleProps,
        filterMode: 'Fuzzy',
        sortFilteredByScore: true,
      }
      const typedDc = fold(
        [Combobox.ChangeComboboxInput({ value: 'dc' })],
        fuzzyProps,
      )
      expect(
        Array.map(
          Combobox.filteredItemsOf(typedDc, fuzzyProps),
          item => item.value,
        ),
      ).toEqual(['dark-cherry'])

      // Empty filter result reports summary cleanly
      const typedNone = fold([Combobox.ChangeComboboxInput({ value: 'zzzz' })])
      expect(Combobox.isFilteredEmpty(typedNone, singleProps)).toBe(true)
      expect(Combobox.filterSummaryOf(typedNone, singleProps)).toEqual({
        totalCount: 6,
        matchedCount: 0,
        isQueryEmpty: false,
        isEmpty: true,
        hasExactMatch: false,
      })

      // Enter selects highlighted Crème Brûlée, closes, and replaces input with its label
      const selected = fold(
        [Combobox.PressedComboboxKey({ key: 'Enter' })],
        singleProps,
        typedCreme,
      )
      expect(Combobox.isClosed(selected)).toBe(true)
      expect(Combobox.selectedValuesOf(selected)).toEqual(['creme'])
      expect(Combobox.inputValueOf(selected)).toBe('Crème Brûlée')
      expect(Combobox.displayLabelOf(selected, singleProps)).toBe(
        'Crème Brûlée',
      )
      expect(Combobox.hiddenInputsOf(selected, singleProps)).toEqual([
        { name: 'fruit', value: 'creme' },
      ])

      // Reopening via trigger shows ALL unfiltered items while highlighting selected Crème Brûlée
      const reopened = fold([Combobox.ToggleCombobox()], singleProps, selected)
      expect(Combobox.isOpen(reopened)).toBe(true)
      expect(Combobox.isFiltering(reopened)).toBe(false)
      expect(Combobox.filteredItemsOf(reopened, singleProps)).toHaveLength(6)
      expect(Combobox.activeValueOf(reopened, singleProps)).toEqual(
        Option.some('creme'),
      )

      // ArrowUp skips disabled Banana (index 2) -> lands on Apricot (index 1)
      const movedUp = fold(
        [Combobox.PressedComboboxKey({ key: 'ArrowUp' })],
        singleProps,
        reopened,
      )
      expect(Combobox.activeValueOf(movedUp, singleProps)).toEqual(
        Option.some('apricot'),
      )

      // Home -> Apple, End -> Dark Cherry, ArrowDown wraps (loop: true default) -> Apple
      const atEnd = fold(
        [Combobox.PressedComboboxKey({ key: 'End' })],
        singleProps,
        movedUp,
      )
      expect(Combobox.activeValueOf(atEnd, singleProps)).toEqual(
        Option.some('dark-cherry'),
      )
      const wrapped = fold(
        [Combobox.PressedComboboxKey({ key: 'ArrowDown' })],
        singleProps,
        atEnd,
      )
      expect(Combobox.activeValueOf(wrapped, singleProps)).toEqual(
        Option.some('apple'),
      )

      // Shift+Home does not hijack text cursor navigation
      const afterShiftHome = fold(
        [Combobox.PressedComboboxKey({ key: 'Home', isShift: true })],
        singleProps,
        atEnd,
      )
      expect(Combobox.activeValueOf(afterShiftHome, singleProps)).toEqual(
        Option.some('dark-cherry'),
      )

      // IME composing key press is ignored
      const afterComposing = fold(
        [Combobox.PressedComboboxKey({ key: 'Enter', isComposing: true })],
        singleProps,
        atEnd,
      )
      expect(Combobox.isOpen(afterComposing)).toBe(true)

      // Escape closes and restores resting input value
      const escaped = fold(
        [
          Combobox.ChangeComboboxInput({ value: 'uncommitted' }),
          Combobox.PressedComboboxKey({ key: 'Escape' }),
        ],
        singleProps,
        reopened,
      )
      expect(Combobox.isClosed(escaped)).toBe(true)
      expect(Combobox.inputValueOf(escaped)).toBe('Crème Brûlée')
      expect(Combobox.selectedValuesOf(escaped)).toEqual(['creme'])
    })

    it('supports openOnInput: false, AutoComplete inputBehavior, and unfiltered Typeahead highlight mode', () => {
      const manualOpenProps: Combobox.Props = {
        ...singleProps,
        openOnInput: false,
      }
      const typedClosed = fold(
        [Combobox.ChangeComboboxInput({ value: 'ch' })],
        manualOpenProps,
      )
      expect(Combobox.isClosed(typedClosed)).toBe(true)
      expect(Combobox.inputValueOf(typedClosed)).toBe('ch')

      // Opening with ArrowDown carries the dirty draft into ListFilter
      const openedFiltered = fold(
        [Combobox.PressedComboboxKey({ key: 'ArrowDown' })],
        manualOpenProps,
        typedClosed,
      )
      expect(Combobox.isOpen(openedFiltered)).toBe(true)
      expect(
        Array.map(
          Combobox.filteredItemsOf(openedFiltered, manualOpenProps),
          item => item.value,
        ),
      ).toEqual(['cherry', 'dark-cherry'])

      // Unfiltered mode (filter: false) keeps all items visible and highlights prefix match via Typeahead
      const unfilteredProps: Combobox.Props = { ...singleProps, filter: false }
      const typedUnfiltered = fold(
        [Combobox.ChangeComboboxInput({ value: 'ch' })],
        unfilteredProps,
      )
      expect(
        Combobox.filteredItemsOf(typedUnfiltered, unfilteredProps),
      ).toHaveLength(6)
      expect(Combobox.activeValueOf(typedUnfiltered, unfilteredProps)).toEqual(
        Option.some('cherry'),
      )

      // AutoComplete previews highlighted option label in the input while arrowing
      const autoCompleteProps: Combobox.Props = {
        ...singleProps,
        inputBehavior: 'AutoComplete',
      }
      const arrowed = fold(
        [
          Combobox.OpenCombobox(),
          Combobox.PressedComboboxKey({ key: 'ArrowDown' }),
          Combobox.PressedComboboxKey({ key: 'ArrowDown' }),
        ],
        autoCompleteProps,
      )
      expect(Combobox.activeValueOf(arrowed, autoCompleteProps)).toEqual(
        Option.some('apricot'),
      )
      expect(Combobox.inputValueOf(arrowed)).toBe('Apricot')
    })
  })

  describe('multiple selection, Backspace tag removal, allowCustomValue, and nullable', () => {
    it('stays open on selection in Multiple mode, clears query, removes last tag on Backspace when empty, and removes arbitrary values', () => {
      const selectedTwo = fold(
        [
          Combobox.ChangeComboboxInput({ value: 'app' }),
          Combobox.PressedComboboxKey({ key: 'Enter' }),
          Combobox.ChangeComboboxInput({ value: 'cherry' }),
          Combobox.PressedComboboxKey({ key: 'Enter' }),
        ],
        multiProps,
      )
      expect(Combobox.isOpen(selectedTwo)).toBe(true)
      expect(Combobox.selectedValuesOf(selectedTwo)).toEqual([
        'apple',
        'cherry',
      ])
      expect(Combobox.inputValueOf(selectedTwo)).toBe('')
      expect(Combobox.isFiltering(selectedTwo)).toBe(false)
      expect(Combobox.displayLabelOf(selectedTwo, multiProps)).toBe(
        'Apple, Cherry',
      )

      // Backspace when input is non-empty does NOT remove selection
      const typedThenBackspace = fold(
        [
          Combobox.ChangeComboboxInput({ value: 'a' }),
          Combobox.PressedComboboxKey({ key: 'Backspace' }),
        ],
        multiProps,
        selectedTwo,
      )
      expect(Combobox.selectedValuesOf(typedThenBackspace)).toEqual([
        'apple',
        'cherry',
      ])

      // Backspace when input is empty removes the LAST selected value ('cherry')
      const afterBackspace = fold(
        [Combobox.PressedComboboxKey({ key: 'Backspace' })],
        multiProps,
        selectedTwo,
      )
      expect(Combobox.isOpen(afterBackspace)).toBe(true)
      expect(Combobox.selectedValuesOf(afterBackspace)).toEqual(['apple'])

      // Backspace also works when closed with empty input
      const closedWithOne = fold(
        [Combobox.CloseCombobox()],
        multiProps,
        afterBackspace,
      )
      const afterClosedBackspace = fold(
        [Combobox.PressedComboboxKey({ key: 'Backspace' })],
        multiProps,
        closedWithOne,
      )
      expect(Combobox.isSelectionEmpty(afterClosedBackspace)).toBe(true)

      // RemoveComboboxValue drops a specific tag without clearing the rest
      const removedApple = fold(
        [Combobox.RemoveComboboxValue({ value: 'apple' })],
        multiProps,
        selectedTwo,
      )
      expect(Combobox.selectedValuesOf(removedApple)).toEqual(['cherry'])
    })

    it('supports allowCustomValue on Enter and Blur, and Escape cancellation', () => {
      const customProps: Combobox.Props = {
        ...singleProps,
        allowCustomValue: true,
      }

      // Typing custom value not in items and pressing Enter commits it
      const committed = fold(
        [
          Combobox.ChangeComboboxInput({ value: 'Mango' }),
          Combobox.PressedComboboxKey({ key: 'Enter' }),
        ],
        customProps,
      )
      expect(Combobox.isClosed(committed)).toBe(true)
      expect(Combobox.selectedValuesOf(committed)).toEqual(['Mango'])
      expect(Combobox.inputValueOf(committed)).toBe('Mango')
      expect(Combobox.displayLabelOf(committed, customProps)).toBe('Mango')
      expect(Combobox.isCustomValue(committed, customProps)).toBe(true)

      // Blurring while typing another custom value commits it too
      const blurredCustom = fold(
        [
          Combobox.ChangeComboboxInput({ value: 'Papaya' }),
          Combobox.BlurComboboxInput(),
        ],
        customProps,
        committed,
      )
      expect(Combobox.isClosed(blurredCustom)).toBe(true)
      expect(Combobox.selectedValuesOf(blurredCustom)).toEqual(['Papaya'])
      expect(Combobox.inputValueOf(blurredCustom)).toBe('Papaya')

      // Escape cancels an uncommitted edit and restores 'Papaya'
      const cancelled = fold(
        [
          Combobox.ChangeComboboxInput({ value: 'Guava' }),
          Combobox.PressedComboboxKey({ key: 'Escape' }),
        ],
        customProps,
        blurredCustom,
      )
      expect(Combobox.isClosed(cancelled)).toBe(true)
      expect(Combobox.selectedValuesOf(cancelled)).toEqual(['Papaya'])
      expect(Combobox.inputValueOf(cancelled)).toBe('Papaya')
    })

    it('supports nullable clearing on empty blur/close and toggling off the selected item', () => {
      const nullableProps: Combobox.Props = { ...singleProps, nullable: true }

      const selected = fold(
        [Combobox.SelectComboboxOption({ value: 'apple' })],
        nullableProps,
      )
      expect(Combobox.selectedValuesOf(selected)).toEqual(['apple'])
      expect(Combobox.inputValueOf(selected)).toBe('Apple')

      // Selecting already-selected item toggles it off in nullable single mode
      const deselected = fold(
        [Combobox.SelectComboboxOption({ value: 'apple' })],
        nullableProps,
        selected,
      )
      expect(Combobox.isSelectionEmpty(deselected)).toBe(true)
      expect(Combobox.inputValueOf(deselected)).toBe('')

      // Clearing input and blurring clears selection
      const clearedOnBlur = fold(
        [
          Combobox.ChangeComboboxInput({ value: '' }),
          Combobox.BlurComboboxInput(),
        ],
        nullableProps,
        selected,
      )
      expect(Combobox.isClosed(clearedOnBlur)).toBe(true)
      expect(Combobox.isSelectionEmpty(clearedOnBlur)).toBe(true)
      expect(Combobox.inputValueOf(clearedOnBlur)).toBe('')

      // ClearCombobox clears both input and selection
      const clearedAction = fold(
        [Combobox.ClearCombobox()],
        nullableProps,
        selected,
      )
      expect(Combobox.isSelectionEmpty(clearedAction)).toBe(true)
      expect(Combobox.inputValueOf(clearedAction)).toBe('')
    })
  })

  describe('layers dismissal, placement geometry, guards, pointer hover, reconciliation, reset, and atRest', () => {
    it('honors Layers stack order, dismissOnEscape, dismissOnOutsidePress, and insideIds', () => {
      const comboboxLayer = Combobox.layerOf(singleProps)
      const dialogLayer = Layers.layer('confirm-dialog', { isModal: true })
      const opened = fold([Combobox.OpenCombobox()])

      const buriedProps: Combobox.Props = {
        ...singleProps,
        layers: [comboboxLayer, dialogLayer],
      }
      expect(
        Combobox.chart.step(
          opened,
          Combobox.PressedComboboxKey({ key: 'Escape' }),
          buriedProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Combobox.chart.step(opened, Combobox.DismissCombobox(), buriedProps)
          ._tag,
      ).toBe('Ignored')
      expect(
        Combobox.chart.step(
          opened,
          Combobox.PressedOutsideCombobox({ insideIds: [] }),
          buriedProps,
        )._tag,
      ).toBe('Ignored')

      const topProps: Combobox.Props = {
        ...singleProps,
        layers: [dialogLayer, comboboxLayer],
      }
      expect(
        Combobox.isClosed(
          fold(
            [Combobox.PressedComboboxKey({ key: 'Escape' })],
            topProps,
            opened,
          ),
        ),
      ).toBe(true)
      expect(
        Combobox.isClosed(
          fold(
            [
              Combobox.PressedOutsideCombobox({
                insideIds: ['confirm-dialog'],
              }),
            ],
            topProps,
            opened,
          ),
        ),
      ).toBe(true)
      expect(
        Combobox.isOpen(
          fold(
            [Combobox.PressedOutsideCombobox({ insideIds: ['fruit'] })],
            topProps,
            opened,
          ),
        ),
      ).toBe(true)

      const guardedProps: Combobox.Props = {
        ...singleProps,
        dismissOnEscape: false,
        dismissOnOutsidePress: false,
      }
      expect(
        Combobox.isOpen(
          fold(
            [
              Combobox.PressedComboboxKey({ key: 'Escape' }),
              Combobox.DismissCombobox(),
              Combobox.PressedOutsideCombobox({ insideIds: [] }),
            ],
            guardedProps,
            opened,
          ),
        ),
      ).toBe(true)
    })

    it('delegates popup placement to Placement.place via placeFor', () => {
      const below = Combobox.placeFor(
        { placement: { gapPx: 4, edgePx: 12 } },
        {
          anchor: { left: 200, top: 100, width: 220, height: 36 },
          size: { width: 220, height: 180 },
          view: { width: 800, height: 600 },
        },
      )
      expect(below).toEqual({ left: 200, top: 140, side: 'Below' })

      const above = Combobox.placeFor(
        { placement: { gapPx: 4, edgePx: 12 } },
        {
          anchor: { left: 200, top: 500, width: 220, height: 36 },
          size: { width: 220, height: 180 },
          view: { width: 800, height: 600 },
        },
      )
      expect(above).toEqual({ left: 200, top: 316, side: 'Above' })
    })

    it('blocks interaction when disabled or readOnly, deduplicates pointer moves, reconciles items, resets, encodes JSON, and preserves committed selection atRest', () => {
      const disabledProps: Combobox.Props = { ...singleProps, isDisabled: true }
      const readOnlyProps: Combobox.Props = { ...singleProps, isReadOnly: true }

      expect(
        Combobox.isClosed(
          fold(
            [
              Combobox.OpenCombobox(),
              Combobox.ToggleCombobox(),
              Combobox.ChangeComboboxInput({ value: 'app' }),
              Combobox.PressedComboboxKey({ key: 'ArrowDown' }),
              Combobox.SelectComboboxOption({ value: 'apple' }),
            ],
            disabledProps,
          ),
        ),
      ).toBe(true)
      expect(
        Combobox.isClosed(
          fold(
            [
              Combobox.OpenCombobox(),
              Combobox.ChangeComboboxInput({ value: 'app' }),
              Combobox.PressedComboboxKey({ key: 'ArrowDown' }),
            ],
            readOnlyProps,
          ),
        ),
      ).toBe(true)

      // Pointer hover dedup & leave behavior
      const hovered = fold([
        Combobox.OpenCombobox(),
        Combobox.MovedPointerOverComboboxItem({
          value: 'apricot',
          screenX: 120,
          screenY: 240,
        }),
      ])
      expect(Combobox.activeValueOf(hovered, singleProps)).toEqual(
        Option.some('apricot'),
      )
      expect(
        Combobox.chart.step(
          hovered,
          Combobox.MovedPointerOverComboboxItem({
            value: 'cherry',
            screenX: 120,
            screenY: 240,
          }),
          singleProps,
        )._tag,
      ).toBe('Ignored')
      const left = fold([Combobox.LeftComboboxItem()], singleProps, hovered)
      expect(Combobox.activeValueOf(left, singleProps)).toEqual(Option.none())

      // Keyboard highlight stays on LeftComboboxItem
      const kbHighlighted = fold([
        Combobox.PressedComboboxKey({ key: 'ArrowDown' }),
      ])
      expect(
        Combobox.chart.step(
          kbHighlighted,
          Combobox.LeftComboboxItem(),
          singleProps,
        )._tag,
      ).toBe('Ignored')

      // atRest closes open popup while preserving committed selection and committed resting value
      const openWithSelectionAndDraft = fold([
        Combobox.SelectComboboxOption({ value: 'cherry' }),
        Combobox.ChangeComboboxInput({ value: 'ap' }),
      ])
      expect(Combobox.isOpen(openWithSelectionAndDraft)).toBe(true)
      expect(Combobox.inputValueOf(openWithSelectionAndDraft)).toBe('ap')

      const rested = Combobox.atRest(openWithSelectionAndDraft)
      expect(Combobox.isClosed(rested)).toBe(true)
      expect(Combobox.selectedValuesOf(rested)).toEqual(['cherry'])
      expect(Combobox.inputValueOf(rested)).toBe('Cherry')

      // Schema JSON round-trip for Open and Closed states
      expect(
        S.decodeSync(Combobox.State)(
          S.encodeSync(Combobox.State)(openWithSelectionAndDraft),
        ),
      ).toEqual(openWithSelectionAndDraft)
      expect(
        S.decodeSync(Combobox.State)(S.encodeSync(Combobox.State)(rested)),
      ).toEqual(rested)

      // Reconcile drops removed selected options and invalid active values
      const shrunkProps: Combobox.Props = {
        ...singleProps,
        items: [{ value: 'apple', label: 'Apple' }],
      }
      const reconciled = fold(
        [Combobox.ReconcileComboboxItems()],
        shrunkProps,
        openWithSelectionAndDraft,
      )
      expect(Combobox.isSelectionEmpty(reconciled)).toBe(true)

      // Reset restores defaults and closes popup
      const withDefaults: Combobox.Props = {
        ...singleProps,
        defaultValue: ['apricot'],
      }
      const reset = fold(
        [Combobox.ResetCombobox()],
        withDefaults,
        openWithSelectionAndDraft,
      )
      expect(Combobox.isClosed(reset)).toBe(true)
      expect(Combobox.selectedValuesOf(reset)).toEqual(['apricot'])
      expect(Combobox.inputValueOf(reset)).toBe('Apricot')
    })
  })

  describe('reference-stable SlotBinding projection and Part.compose synchronization', () => {
    it('projects Input, Trigger, Content, Option, Label, Description, Error, and ClearButton slots with WAI-ARIA and preserves unchanged references', () => {
      const part = Combobox.make({ name: 'FruitCombobox' })
      const invalidMultiProps: Combobox.Props = {
        ...multiProps,
        isInvalid: true,
        isRequired: true,
      }

      const closedView = Part.view(part, Combobox.initial, invalidMultiProps)
      expect(Part.view(part, Combobox.initial, invalidMultiProps)).toBe(
        closedView,
      )

      const closedInput = closedView.slot('Input')
      expect(Slot.ariaOf(closedInput)).toEqual({
        role: 'combobox',
        id: 'fruit-input',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
        'aria-controls': 'fruit-content',
        'aria-labelledby': 'fruit-label',
        'aria-describedby': 'fruit-description fruit-error',
        'aria-required': 'true',
        'aria-invalid': 'true',
        tabindex: '0',
      })

      const closedTrigger = closedView.slot('Trigger')
      expect(Slot.ariaOf(closedTrigger)).toEqual({
        role: 'button',
        id: 'fruit-trigger',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
        'aria-controls': 'fruit-content',
        'aria-label': 'Toggle options',
        tabindex: '-1',
      })
      expect(closedTrigger.gestures).toEqual([
        { gesture: 'Pressed', press: 'ToggleCombobox' },
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
      const closedClear = closedView.slot('ClearButton')
      expect(Slot.ariaOf(labelSlot)).toEqual({ id: 'fruit-label' })
      expect(Slot.ariaOf(descriptionSlot)).toEqual({ id: 'fruit-description' })
      expect(Slot.ariaOf(errorSlot)).toEqual({ id: 'fruit-error' })
      expect(Slot.ariaOf(closedClear)).toEqual({
        role: 'button',
        id: 'fruit-clear',
        'aria-controls': 'fruit-input',
        'aria-label': 'Clear combobox',
        tabindex: '0',
        hidden: '',
      })

      // Type 'ap' -> opens popup, filters to Apple & Apricot, activeId points to Apple (option-0), ClearButton unhides
      const openState = fold(
        [Combobox.ChangeComboboxInput({ value: 'ap' })],
        invalidMultiProps,
      )
      const openView = Part.view(part, openState, invalidMultiProps)
      expect(Slot.ariaOf(openView.slot('Input'))).toMatchObject({
        role: 'combobox',
        'aria-expanded': 'true',
        'aria-controls': 'fruit-content',
        'aria-activedescendant': 'fruit-option-0',
      })
      expect(Slot.ariaOf(openView.slot('Content'))).toEqual({
        role: 'listbox',
        id: 'fruit-content',
        'aria-labelledby': 'fruit-label',
        'aria-multiselectable': 'true',
      })
      expect(Slot.ariaOf(openView.slot('Option', 'apple'))).toEqual({
        role: 'option',
        id: 'fruit-option-0',
        'aria-selected': 'false',
        'aria-current': 'true',
      })
      expect(Slot.ariaOf(openView.slot('Option', 'banana'))).toEqual({
        role: 'option',
        id: 'fruit-option-2',
        'aria-selected': 'false',
        'aria-current': 'false',
        'aria-disabled': 'true',
      })
      expect(
        Slot.ariaOf(openView.slot('ClearButton'))['hidden'],
      ).toBeUndefined()

      // Reference stability across consecutive renders
      expect(openView.slot('Label')).toBe(labelSlot)
      expect(openView.slot('Description')).toBe(descriptionSlot)
      expect(openView.slot('Error')).toBe(errorSlot)
      const cherryBefore = openView.slot('Option', 'cherry')

      const movedState = fold(
        [Combobox.PressedComboboxKey({ key: 'ArrowDown' })],
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

    it('syncs under Domain with Pace.Settled(200) on ChangeComboboxInput and Pace.Synced on discrete actions, and supports deviceOnly()', () => {
      const BaseModel = S.Struct({ count: S.Number })
      const BaseMessage = S.Union([])
      const Base = makeProgram({
        id: 'combobox-sync-test',
        version: 1,
        Model: BaseModel,
        Message: BaseMessage,
        init: () => [{ count: 0 }, []],
        update: (model: typeof BaseModel.Type) => [model, []],
      })

      const syncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Combobox.make(), () => singleProps)],
      })
      expect(
        syncedApp.synchronization?.messageCategory(
          Combobox.ChangeComboboxInput({ value: 'ap' }),
        ),
      ).toBe('Domain')
      expect(
        syncedApp.synchronization?.paceOf?.(
          Combobox.ChangeComboboxInput({ value: 'ap' }),
        ),
      ).toEqual(Settled({ afterMs: 200 }))
      expect(
        syncedApp.synchronization?.paceOf?.(
          Combobox.SelectComboboxOption({ value: 'apple' }),
        ),
      ).toEqual(Synced())

      const localApp = Part.compose({
        of: Base,
        parts: [Part.given(Combobox.deviceOnly(), () => singleProps)],
      })
      expect(
        localApp.synchronization?.paceOf?.(
          Combobox.ChangeComboboxInput({ value: 'ap' }),
        ),
      ).toEqual(Device({ because: 'OwnView' }))
      const [localInit] = localApp.init()
      expect(S.encodeSync(localApp.Model)(localInit)).toEqual({ count: 0 })
    })
  })
})
