import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Selection from './selection.js'

const sampleItems: ReadonlyArray<Selection.Item> = [
  { value: 'apple' },
  { value: 'banana' },
  { value: 'cherry', isDisabled: true },
  { value: 'date' },
  { value: 'elderberry' },
]

const singleProps: Selection.Props = {
  items: sampleItems,
  mode: 'Single',
}

const multiProps: Selection.Props = {
  items: sampleItems,
  mode: 'Multiple',
}

const step = (
  state: Selection.State,
  message: Selection.Message,
  props: Selection.Props,
): Selection.State => Selection.chart.transition(state, message, props)[0]

describe('Selection block', () => {
  it('passes Block.problemsOf with zero unreachable states or dead transitions', () => {
    expect(
      Block.problemsOf({ name: 'Selection', chart: Selection.chart }),
    ).toEqual([])
    expect(
      Block.problemsOf({
        name: 'SelectionInitialized',
        chart: Selection.chartOf(Selection.initialSelected(['apple'])),
      }),
    ).toEqual([])
  })

  it('starts empty and supports Single mode select, replace, deselectable toggle, and disabled guards', () => {
    expect(Selection.isEmpty(Selection.initial)).toBe(true)
    expect(Selection.selectedOf(Selection.initial)).toEqual([])
    expect(Selection.firstSelectedOf(Selection.initial)).toEqual(Option.none())
    expect(Selection.selectedCountOf(Selection.initial)).toBe(0)
    expect(Selection.anchorOf(Selection.initial)).toEqual(Option.none())
    expect(Selection.isAllSelected(Selection.initial, singleProps)).toBe(false)

    // Select apple
    const s1 = Selection.select(Selection.initial, 'apple', singleProps)
    expect(Selection.isEmpty(s1)).toBe(false)
    expect(Selection.selectedOf(s1)).toEqual(['apple'])
    expect(Selection.isSelected(s1, 'apple')).toBe(true)
    expect(Selection.isSelected(s1, 'banana')).toBe(false)
    expect(Selection.firstSelectedOf(s1, singleProps)).toEqual(
      Option.some('apple'),
    )
    expect(Selection.selectedCountOf(s1)).toBe(1)
    expect(Selection.anchorOf(s1)).toEqual(Option.some('apple'))

    // Selecting disabled or unknown item is a no-op (reference-identical)
    expect(Selection.select(s1, 'cherry', singleProps)).toBe(s1)
    expect(Selection.select(s1, 'missing', singleProps)).toBe(s1)

    // In Single mode, selecting another item replaces selection
    const s2 = Selection.select(s1, 'banana', singleProps)
    expect(Selection.selectedOf(s2)).toEqual(['banana'])
    expect(Selection.anchorOf(s2)).toEqual(Option.some('banana'))

    // Default Single mode is not deselectable: toggle/deselect/clear keep selection
    expect(Selection.toggle(s2, 'banana', singleProps)).toBe(s2)
    expect(Selection.deselect(s2, 'banana', singleProps)).toBe(s2)
    expect(Selection.clear(s2, singleProps)).toBe(s2)

    // Single mode with deselectable: true allows toggling off and clearing
    const deselectableSingle: Selection.Props = {
      ...singleProps,
      deselectable: true,
    }
    const clearedByToggle = Selection.toggle(s2, 'banana', deselectableSingle)
    expect(clearedByToggle).toEqual(Selection.Empty())
    expect(Selection.clear(s2, deselectableSingle)).toEqual(Selection.Empty())

    // SelectAll is refused in Single mode
    expect(Selection.selectAll(s2, singleProps)).toBe(s2)
  })

  it('supports Multiple mode select, deselect, toggle, selectAll, clear, and deselectable: false', () => {
    const s1 = Selection.select(Selection.initial, 'apple', multiProps)
    const s2 = Selection.select(s1, 'date', multiProps)
    expect(Selection.selectedOf(s2)).toEqual(['apple', 'date'])
    expect(Selection.selectedCountOf(s2)).toBe(2)
    expect(Selection.anchorOf(s2)).toEqual(Option.some('date'))
    expect(Selection.isAllSelected(s2, multiProps)).toBe(false)

    // firstSelectedOf respects collection order when props are passed
    const reversed = Selection.initialSelected(['elderberry', 'banana'])
    expect(Selection.firstSelectedOf(reversed)).toEqual(
      Option.some('elderberry'),
    )
    expect(Selection.firstSelectedOf(reversed, multiProps)).toEqual(
      Option.some('banana'),
    )

    // Toggle removes when present and adds when absent
    const s3 = Selection.toggle(s2, 'apple', multiProps)
    expect(Selection.selectedOf(s3)).toEqual(['date'])
    const s4 = Selection.toggle(s3, 'date', multiProps)
    expect(Selection.isEmpty(s4)).toBe(true)

    // Multiple mode with deselectable: false refuses removing the final item
    const nonEmptyMulti: Selection.Props = {
      ...multiProps,
      deselectable: false,
    }
    expect(Selection.deselect(s3, 'date', nonEmptyMulti)).toBe(s3)
    expect(Selection.toggle(s3, 'date', nonEmptyMulti)).toBe(s3)
    expect(Selection.clear(s3, nonEmptyMulti)).toBe(s3)
    expect(
      Selection.selectedOf(Selection.deselect(s2, 'apple', nonEmptyMulti)),
    ).toEqual(['date'])

    // SelectAll picks all enabled items (skipping disabled cherry)
    const all = Selection.selectAll(Selection.initial, multiProps)
    expect(Selection.selectedOf(all)).toEqual([
      'apple',
      'banana',
      'date',
      'elderberry',
    ])
    expect(Selection.isAllSelected(all, multiProps)).toBe(true)

    // disallowSelectAll refuses selectAll
    expect(
      Selection.selectAll(Selection.initial, {
        ...multiProps,
        disallowSelectAll: true,
      }),
    ).toBe(Selection.initial)

    // Clear empties in default Multiple mode
    expect(Selection.clear(all, multiProps)).toEqual(Selection.Empty())
  })

  it('tracks anchor and range end for Shift/extended range selection, skipping disabled items and shrinking on reverse', () => {
    // Click banana -> anchor is banana
    const anchored = Selection.select(Selection.initial, 'banana', multiProps)
    expect(Selection.anchorOf(anchored)).toEqual(Option.some('banana'))

    // Shift+Click elderberry -> selects banana, date, elderberry (skipping disabled cherry)
    const extended = Selection.selectRange(anchored, 'elderberry', multiProps)
    expect(Selection.selectedOf(extended)).toEqual([
      'banana',
      'date',
      'elderberry',
    ])
    expect(Selection.anchorOf(extended)).toEqual(Option.some('banana'))
    expect(Selection.rangeEndOf(extended)).toEqual(Option.some('elderberry'))

    // Reverse direction: Shift+ArrowUp to date -> shrinks range, dropping elderberry
    const shrunk = Selection.selectRange(extended, 'date', multiProps)
    expect(Selection.selectedOf(shrunk)).toEqual(['banana', 'date'])
    expect(Selection.anchorOf(shrunk)).toEqual(Option.some('banana'))
    expect(Selection.rangeEndOf(shrunk)).toEqual(Option.some('date'))

    // Reverse past anchor to apple -> drops date, selects apple and banana
    const crossed = Selection.selectRange(shrunk, 'apple', multiProps)
    expect(Selection.selectedOf(crossed)).toEqual(['apple', 'banana'])
    expect(Selection.anchorOf(crossed)).toEqual(Option.some('banana'))
    expect(Selection.rangeEndOf(crossed)).toEqual(Option.some('apple'))

    // Preserves earlier non-range selections when starting a new range
    const nonContiguous = Selection.select(
      Selection.select(Selection.initial, 'apple', multiProps),
      'date',
      multiProps,
    )
    const extendedTail = Selection.selectRange(
      nonContiguous,
      'elderberry',
      multiProps,
    )
    expect(Selection.selectedOf(extendedTail)).toEqual([
      'apple',
      'date',
      'elderberry',
    ])

    // Uses maybeAnchorOverride when starting a range from Empty
    const fromEmptyOverride = Selection.selectRange(
      Selection.initial,
      'date',
      multiProps,
      Option.some('apple'),
    )
    expect(Selection.selectedOf(fromEmptyOverride)).toEqual([
      'apple',
      'banana',
      'date',
    ])
    expect(Selection.anchorOf(fromEmptyOverride)).toEqual(Option.some('apple'))

    // In Single mode, selectRange collapses to single selection
    const singleRange = Selection.selectRange(
      Selection.select(Selection.initial, 'apple', singleProps),
      'date',
      singleProps,
    )
    expect(Selection.selectedOf(singleRange)).toEqual(['date'])
  })

  it('supports replace, reconcile when item lists change, disabled collection guards, atRest, and JSON round-trip', () => {
    // Replace filters out disabled and missing values, dedupes, and caps to 1 in Single mode
    const replacedMulti = Selection.replace(
      Selection.initial,
      ['apple', 'cherry', 'missing', 'date', 'apple'],
      multiProps,
    )
    expect(Selection.selectedOf(replacedMulti)).toEqual(['apple', 'date'])

    const replacedSingle = Selection.replace(
      Selection.initial,
      ['apple', 'date'],
      singleProps,
    )
    expect(Selection.selectedOf(replacedSingle)).toEqual(['apple'])

    // Reconcile drops removed items and clears stale anchor/rangeEnd
    const rangeState = Selection.selectRange(
      Selection.select(Selection.initial, 'apple', multiProps),
      'elderberry',
      multiProps,
    )
    const narrowedProps: Selection.Props = {
      mode: 'Multiple',
      items: [{ value: 'banana' }, { value: 'date' }],
    }
    const reconciled = Selection.reconcile(rangeState, narrowedProps)
    expect(Selection.selectedOf(reconciled)).toEqual(['banana', 'date'])
    expect(Selection.anchorOf(reconciled)).toEqual(Option.none())
    expect(Selection.rangeEndOf(reconciled)).toEqual(Option.none())

    // Reference-stable when reconciling again with unchanged items
    expect(Selection.reconcile(reconciled, narrowedProps)).toBe(reconciled)

    // Reconcile empties when all selected items disappear
    expect(
      Selection.reconcile(reconciled, {
        mode: 'Multiple',
        items: [{ value: 'fig' }],
      }),
    ).toEqual(Selection.Empty())

    // Disabled collection blocks all mutations
    const disabledMulti: Selection.Props = { ...multiProps, isDisabled: true }
    expect(Selection.select(Selection.initial, 'apple', disabledMulti)).toBe(
      Selection.initial,
    )
    expect(Selection.selectAll(Selection.initial, disabledMulti)).toBe(
      Selection.initial,
    )
    expect(Selection.deselect(replacedMulti, 'apple', disabledMulti)).toBe(
      replacedMulti,
    )
    expect(Selection.clear(replacedMulti, disabledMulti)).toBe(replacedMulti)

    // atRest preserves selection and anchor while clearing transient rangeEnd
    const rested = Selection.atRest(rangeState)
    expect(Selection.selectedOf(rested)).toEqual([
      'apple',
      'banana',
      'date',
      'elderberry',
    ])
    expect(Selection.anchorOf(rested)).toEqual(Option.some('apple'))
    expect(Selection.rangeEndOf(rested)).toEqual(Option.none())

    // JSON round-trip via Schema
    const encode = S.encodeSync(Selection.State)
    const decode = S.decodeUnknownSync(Selection.State)
    expect(decode(encode(Selection.initial))).toEqual(Selection.initial)
    expect(decode(encode(rangeState))).toEqual(rangeState)
  })

  it('drives every transition through Selection.chart and declares sync tables', () => {
    const s1 = step(
      Selection.initial,
      Selection.SelectItem({ value: 'apple' }),
      multiProps,
    )
    const s2 = step(s1, Selection.SelectRange({ value: 'date' }), multiProps)
    expect(Selection.selectedOf(s2)).toEqual(['apple', 'banana', 'date'])

    const s3 = step(s2, Selection.ToggleItem({ value: 'banana' }), multiProps)
    expect(Selection.selectedOf(s3)).toEqual(['apple', 'date'])

    const s4 = step(s3, Selection.SelectAll(), multiProps)
    expect(Selection.isAllSelected(s4, multiProps)).toBe(true)

    const s5 = step(s4, Selection.ClearSelection(), multiProps)
    expect(s5).toEqual(Selection.Empty())

    expect(Selection.synced.SelectItem).toEqual(Pace.Synced())
    expect(Selection.deviceSync('OwnChoice').SelectItem).toEqual(
      Pace.Device({ because: 'OwnChoice' }),
    )
    expect(Selection.isMessage(Selection.SelectAll())).toBe(true)
  })
})
