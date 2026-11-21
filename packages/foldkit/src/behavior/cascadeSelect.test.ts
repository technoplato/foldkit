import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import * as Block from './block.js'
import * as CascadeSelect from './cascadeSelect.js'
import * as Layers from './layers.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const locationTree: ReadonlyArray<CascadeSelect.CascadeNode> = [
  {
    id: 'us',
    label: 'United States',
    children: [
      {
        id: 'ca',
        label: 'California',
        children: [
          { id: 'sf', label: 'San Francisco' },
          { id: 'la', label: 'Los Angeles' },
        ],
      },
      { id: 'ny', label: 'New York' },
    ],
  },
  {
    id: 'eu',
    label: 'Europe',
    isDisabled: true,
    children: [{ id: 'fr', label: 'France' }],
  },
  { id: 'jp', label: 'Japan' },
]

const defaultProps: CascadeSelect.Props = {
  id: 'region',
  nodes: locationTree,
  placeholder: 'Choose location',
  deselectable: true,
  hasLabel: true,
}

const step = (
  state: CascadeSelect.State,
  message: CascadeSelect.Message,
  props: CascadeSelect.Props = defaultProps,
): CascadeSelect.State =>
  CascadeSelect.chart.transition(state, message, props)[0]

describe('CascadeSelect Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'CascadeSelect', chart: CascadeSelect.chart }),
    ).toEqual([])
    expect(Part.problemsOf(CascadeSelect.part)).toEqual([])
    expect(
      Part.problemsOf(
        CascadeSelect.make({ name: 'RegionPicker', defaultValue: ['sf'] }),
      ),
    ).toEqual([])
    expect(Part.problemsOf(CascadeSelect.deviceOnly())).toEqual([])

    CascadeSelect.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('derives visible columns, descends/ascends/roves with keyboard, and selects leaves or branches', () => {
    const opened = step(
      CascadeSelect.initial,
      CascadeSelect.OpenCascadeSelect(),
    )
    expect(CascadeSelect.isOpen(opened)).toBe(true)
    expect(CascadeSelect.expandedPathOf(opened)).toEqual(['us'])

    // Root column + United States children column
    const cols1 = CascadeSelect.columnsOf(opened, defaultProps)
    expect(cols1).toHaveLength(2)
    expect(cols1[0]?.nodes.map(n => n.id)).toEqual(['us', 'eu', 'jp'])
    expect(cols1[1]?.nodes.map(n => n.id)).toEqual(['ca', 'ny'])

    // ArrowDown skips disabled 'eu' and lands on 'jp' (leaf -> 1 column)
    const onJp = step(
      opened,
      CascadeSelect.PressedCascadeKey({ key: 'ArrowDown' }),
    )
    expect(CascadeSelect.expandedPathOf(onJp)).toEqual(['jp'])
    expect(CascadeSelect.columnsOf(onJp, defaultProps)).toHaveLength(1)

    // ArrowUp returns to 'us'
    const backUs = step(
      onJp,
      CascadeSelect.PressedCascadeKey({ key: 'ArrowUp' }),
    )
    expect(CascadeSelect.expandedPathOf(backUs)).toEqual(['us'])

    // ArrowRight descends into 'ca' -> 3 columns visible
    const onCa = step(
      backUs,
      CascadeSelect.PressedCascadeKey({ key: 'ArrowRight' }),
    )
    expect(CascadeSelect.expandedPathOf(onCa)).toEqual(['us', 'ca'])
    expect(CascadeSelect.columnsOf(onCa, defaultProps)).toHaveLength(3)

    // ArrowRight descends into 'sf'
    const onSf = step(
      onCa,
      CascadeSelect.PressedCascadeKey({ key: 'ArrowRight' }),
    )
    expect(CascadeSelect.expandedPathOf(onSf)).toEqual(['us', 'ca', 'sf'])

    // ArrowDown inside depth-2 column moves to 'la'
    const onLa = step(
      onSf,
      CascadeSelect.PressedCascadeKey({ key: 'ArrowDown' }),
    )
    expect(CascadeSelect.expandedPathOf(onLa)).toEqual(['us', 'ca', 'la'])

    // ArrowLeft ascends back to ['us', 'ca']
    const backCa = step(
      onLa,
      CascadeSelect.PressedCascadeKey({ key: 'ArrowLeft' }),
    )
    expect(CascadeSelect.expandedPathOf(backCa)).toEqual(['us', 'ca'])

    // Enter on branch without allowBranchSelect descends into 'sf'
    const descendedByEnter = step(
      backCa,
      CascadeSelect.PressedCascadeKey({ key: 'Enter' }),
    )
    expect(CascadeSelect.isOpen(descendedByEnter)).toBe(true)
    expect(CascadeSelect.expandedPathOf(descendedByEnter)).toEqual([
      'us',
      'ca',
      'sf',
    ])

    // Enter on leaf 'sf' selects and closes
    const selected = step(
      descendedByEnter,
      CascadeSelect.PressedCascadeKey({ key: 'Enter' }),
    )
    expect(CascadeSelect.isClosed(selected)).toBe(true)
    expect(CascadeSelect.selectedIdsOf(selected)).toEqual(['sf'])
    expect(CascadeSelect.selectedPathOf(selected, defaultProps)).toEqual([
      'us',
      'ca',
      'sf',
    ])
    expect(
      CascadeSelect.pathLabelsOf(['us', 'ca', 'sf'], defaultProps),
    ).toEqual(['United States', 'California', 'San Francisco'])
    expect(CascadeSelect.breadcrumbOf(selected, defaultProps)).toBe(
      'United States / California / San Francisco',
    )

    // allowBranchSelect: true allows selecting 'ca' directly
    const branchProps: CascadeSelect.Props = {
      ...defaultProps,
      allowBranchSelect: true,
    }
    const branchSelected = step(
      backCa,
      CascadeSelect.PressedCascadeKey({ key: 'Enter' }),
      branchProps,
    )
    expect(CascadeSelect.selectedIdsOf(branchSelected)).toEqual(['ca'])
    expect(CascadeSelect.breadcrumbOf(branchSelected, branchProps)).toBe(
      'United States / California',
    )

    // Clear removes selection when deselectable
    const cleared = step(selected, CascadeSelect.ClearCascadeSelect())
    expect(CascadeSelect.isSelectionEmpty(cleared)).toBe(true)
    expect(CascadeSelect.breadcrumbOf(cleared, defaultProps)).toBe(
      'Choose location',
    )
  })

  it('supports Placement.placeFor, Layers Escape/outside dismiss, atRest, JSON round-trip, and reference-stable SlotBindings', () => {
    const placed = CascadeSelect.placeFor(
      { placement: { gapPx: 12, edgePx: 10 } },
      {
        anchor: { left: 100, top: 80, width: 140, height: 32 },
        size: { width: 320, height: 200 },
        view: { width: 1024, height: 768 },
      },
    )
    expect(placed).toEqual({ left: 100, top: 124, side: 'Below' })

    const opened = step(
      CascadeSelect.initial,
      CascadeSelect.OpenCascadeSelect(),
    )

    // Blocked when another layer sits above on the stack
    const buriedProps: CascadeSelect.Props = {
      ...defaultProps,
      layers: [
        Layers.layer('region'),
        Layers.layer('other-dialog', { isModal: true }),
      ],
    }
    expect(
      CascadeSelect.isOpen(
        step(
          opened,
          CascadeSelect.PressedCascadeKey({ key: 'Escape' }),
          buriedProps,
        ),
      ),
    ).toBe(true)
    expect(
      CascadeSelect.isOpen(
        step(
          opened,
          CascadeSelect.PressedOutsideCascadeSelect({ insideIds: [] }),
          buriedProps,
        ),
      ),
    ).toBe(true)

    // Dismisses when topmost
    expect(
      CascadeSelect.isClosed(
        step(opened, CascadeSelect.PressedCascadeKey({ key: 'Escape' })),
      ),
    ).toBe(true)
    expect(
      CascadeSelect.isClosed(
        step(
          opened,
          CascadeSelect.PressedOutsideCascadeSelect({ insideIds: [] }),
        ),
      ),
    ).toBe(true)
    expect(
      CascadeSelect.isOpen(
        step(
          opened,
          CascadeSelect.PressedOutsideCascadeSelect({ insideIds: ['region'] }),
        ),
      ),
    ).toBe(true)

    // Sync & atRest & JSON
    expect(CascadeSelect.synced.SelectCascadeOption).toEqual(Pace.Synced())
    expect(CascadeSelect.deviceSync().SelectCascadeOption).toEqual(
      Pace.Device({ because: 'OwnView' }),
    )
    const rested = CascadeSelect.atRest(opened)
    expect(CascadeSelect.isClosed(rested)).toBe(true)

    const encoded = S.encodeSync(CascadeSelect.State)(opened)
    expect(S.decodeUnknownSync(CascadeSelect.State)(encoded)).toEqual(opened)

    // Reference stability and ARIA
    const view1 = Part.view(CascadeSelect.part, opened, defaultProps)
    const view2 = Part.view(CascadeSelect.part, opened, { ...defaultProps })
    expect(view1).toBe(view2)
    expect(view1.slot('Trigger')).toBe(view2.slot('Trigger'))
    expect(Slot.ariaOf(view1.slot('Trigger'))['role']).toBe('combobox')
    expect(Slot.ariaOf(view1.slot('Trigger'))['aria-expanded']).toBe('true')
    expect(Slot.ariaOf(view1.slot('Content'))['aria-activedescendant']).toBe(
      'region-option-us',
    )
    expect(Slot.ariaOf(view1.slot('Option', 'us'))['aria-expanded']).toBe(
      'true',
    )
    expect(Slot.ariaOf(view1.slot('Column', '1'))['hidden']).toBeUndefined()
    expect(Slot.ariaOf(view1.slot('Column', '2'))['hidden']).toBe('')
  })
})
