import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Splitter from './splitter.js'

const twoPanelProps: Splitter.Props = {
  id: 'workspace',
  orientation: 'Horizontal',
  keyboardStep: 5,
  largeStep: 15,
  defaultSizes: [30, 70],
  panels: [
    {
      id: 'sidebar',
      minSize: 20,
      maxSize: 60,
      collapsible: true,
      collapsedSize: 0,
    },
    { id: 'main', minSize: 40, maxSize: 100 },
  ],
}

const threePanelProps: Splitter.Props = {
  id: 'ide',
  orientation: 'Horizontal',
  defaultSizes: [25, 50, 25],
  panels: [
    { id: 'nav', minSize: 15, maxSize: 50 },
    { id: 'editor', minSize: 20, maxSize: 70 },
    { id: 'inspector', minSize: 15, maxSize: 50 },
  ],
}

const step = (
  state: Splitter.State,
  message: Splitter.Message,
  props: Splitter.Props = twoPanelProps,
): Splitter.State => Splitter.chart.transition(state, message, props)[0]

describe('Splitter Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'Splitter', chart: Splitter.chart }),
    ).toEqual([])
    expect(Part.problemsOf(Splitter.part)).toEqual([])
    expect(
      Part.problemsOf(Splitter.make({ defaultSizes: [30, 70], sampleMs: 80 })),
    ).toEqual([])
    expect(Part.problemsOf(Splitter.deviceOnly())).toEqual([])

    Splitter.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('derives element IDs, normalizes sizes to 100, and redistributes deltas across 2 and 3 panels', () => {
    expect(Splitter.rootId('workspace')).toBe('workspace-root')
    expect(Splitter.panelId('workspace', 'sidebar')).toBe(
      'workspace-panel-sidebar',
    )
    expect(Splitter.resizeTriggerId('workspace', 0)).toBe('workspace-handle-0')

    expect(Splitter.normalizeSizes([1, 3])).toEqual([25, 75])
    expect(Splitter.normalizeSizes([], threePanelProps.panels)).toEqual([
      33.3333, 33.3333, 33.3334,
    ])

    // Two-panel clamping respects minSize and maxSize while keeping sum === 100
    const grown = Splitter.resizeByDelta(
      [30, 70],
      0,
      50,
      twoPanelProps.panels,
      'Pointer',
    )
    expect(grown).toEqual([60, 40])

    // Three-panel cascade: shrinking middle past its minSize cascades into third panel
    const cascaded = Splitter.resizeByDelta(
      [25, 30, 45],
      0,
      20,
      threePanelProps.panels,
      'Pointer',
    )
    expect(cascaded).toEqual([45, 20, 35])
    expect(cascaded.reduce((sum, value) => sum + value, 0)).toBe(100)
  })

  it('handles pointer drag resizing, vertical orientation, commit, and Escape/cancel rollback', () => {
    const start = Splitter.initialSizes([30, 70], twoPanelProps.panels)
    const resizing = step(
      start,
      Splitter.BeginResize({ handleIndex: 0, pointerId: 1, x: 300, y: 100 }),
    )
    expect(Splitter.isResizing(resizing)).toBe(true)
    expect(Splitter.activeHandleIndexOf(resizing)).toEqual(Option.some(0))

    // Move +100px in a 1000px container -> +10% => [40, 60]
    const moved = step(
      resizing,
      Splitter.MoveResize({
        pointerId: 1,
        x: 400,
        y: 100,
        containerSizePx: 1000,
      }),
    )
    expect(Splitter.sizesOf(moved)).toEqual([40, 60])

    // Wrong pointer is ignored
    const wrongPointer = step(
      moved,
      Splitter.MoveResize({
        pointerId: 9,
        x: 600,
        y: 100,
        containerSizePx: 1000,
      }),
    )
    expect(Splitter.sizesOf(wrongPointer)).toEqual([40, 60])

    // Escape restores originSizes ([30, 70]) and returns to Idle
    const cancelled = step(
      moved,
      Splitter.PressedSplitterKey({ handleIndex: 0, key: 'Escape' }),
    )
    expect(Splitter.isIdle(cancelled)).toBe(true)
    expect(Splitter.sizesOf(cancelled)).toEqual([30, 70])

    // Vertical orientation drag + commit
    const verticalProps: Splitter.Props = {
      ...twoPanelProps,
      orientation: 'Vertical',
    }
    const vResizing = step(
      start,
      Splitter.BeginResize({ handleIndex: 0, pointerId: 2, x: 0, y: 100 }),
      verticalProps,
    )
    const vMoved = step(
      vResizing,
      Splitter.MoveResize({
        pointerId: 2,
        x: 0,
        y: 250,
        containerSizePx: 1000,
      }),
      verticalProps,
    )
    const vEnded = step(
      vMoved,
      Splitter.EndResize({ pointerId: 2 }),
      verticalProps,
    )
    expect(Splitter.isIdle(vEnded)).toBe(true)
    expect(Splitter.sizesOf(vEnded)).toEqual([45, 55])
  })

  it('supports keyboard Arrow, Shift+Arrow, Home, End, and Enter collapse-expand', () => {
    const start = Splitter.initialSizes([30, 70], twoPanelProps.panels)

    const right = step(
      start,
      Splitter.PressedSplitterKey({ handleIndex: 0, key: 'ArrowRight' }),
    )
    expect(Splitter.sizesOf(right)).toEqual([35, 65])

    const shiftRight = step(
      right,
      Splitter.PressedSplitterKey({
        handleIndex: 0,
        key: 'ArrowRight',
        isShift: true,
      }),
    )
    expect(Splitter.sizesOf(shiftRight)).toEqual([50, 50])

    const atMax = step(
      shiftRight,
      Splitter.PressedSplitterKey({ handleIndex: 0, key: 'End' }),
    )
    expect(Splitter.sizesOf(atMax)).toEqual([60, 40])

    const atMin = step(
      atMax,
      Splitter.PressedSplitterKey({ handleIndex: 0, key: 'Home' }),
    )
    expect(Splitter.sizesOf(atMin)).toEqual([0, 100])
    expect(Splitter.isPanelCollapsed(atMin, 'sidebar', twoPanelProps)).toBe(
      true,
    )

    // Enter toggles expand back to minSize (20) when collapsed via Home
    const expanded = step(
      atMin,
      Splitter.PressedSplitterKey({ handleIndex: 0, key: 'Enter' }),
    )
    expect(Splitter.sizesOf(expanded)).toEqual([20, 80])
    expect(Splitter.isPanelCollapsed(expanded, 'sidebar', twoPanelProps)).toBe(
      false,
    )

    // Collapse from 45 remembers 45 and Enter expands back to 45
    const at45 = step(expanded, Splitter.SetSizes({ sizes: [45, 55] }))
    const collapsed45 = step(
      at45,
      Splitter.PressedSplitterKey({ handleIndex: 0, key: 'Enter' }),
    )
    expect(Splitter.sizesOf(collapsed45)).toEqual([0, 100])
    const restored45 = step(
      collapsed45,
      Splitter.PressedSplitterKey({ handleIndex: 0, key: 'Enter' }),
    )
    expect(Splitter.sizesOf(restored45)).toEqual([45, 55])
  })

  it('projects reference-stable SlotBindings with Slider role on ResizeTrigger and composes with Sampled sync', () => {
    const state = Splitter.initialSizes([35, 65], twoPanelProps.panels)
    const view1 = Part.view(Splitter.part, state, twoPanelProps)
    const view2 = Part.view(Splitter.part, state, twoPanelProps)
    expect(view1).toBe(view2)

    const rootSlot = view1.slot('Root')
    const sidebarSlot = view1.slot('Panel', 'sidebar')
    const triggerSlot = view1.slot('ResizeTrigger', '0')

    expect(Slot.ariaOf(rootSlot)).toMatchObject({
      id: 'workspace-root',
      role: 'group',
      'aria-orientation': 'horizontal',
    })
    expect(Slot.ariaOf(sidebarSlot)['hidden']).toBeUndefined()
    expect(Slot.ariaOf(triggerSlot)).toMatchObject({
      id: 'workspace-handle-0',
      role: 'slider',
      'aria-orientation': 'horizontal',
      'aria-valuemin': '0',
      'aria-valuemax': '60',
      'aria-valuenow': '35',
      'aria-controls': 'workspace-panel-sidebar workspace-panel-main',
      tabindex: '0',
    })

    // Resizing keeps Root and unchanged Panel bindings reference-stable
    const nextState = step(
      state,
      Splitter.ResizeHandle({ handleIndex: 0, deltaPercent: 10 }),
    )
    const nextView = Part.view(Splitter.part, nextState, twoPanelProps)
    expect(nextView.slot('Root')).toBe(rootSlot)
    expect(nextView.slot('Panel', 'sidebar')).toBe(sidebarSlot)
    expect(nextView.slot('ResizeTrigger', '0')).not.toBe(triggerSlot)
    expect(
      Slot.ariaOf(nextView.slot('ResizeTrigger', '0'))['aria-valuenow'],
    ).toBe('45')

    // Collapsing sidebar to 0 marks Panel hidden
    const collapsed = step(
      nextState,
      Splitter.CollapsePanel({ panelId: 'sidebar' }),
    )
    expect(
      Slot.ariaOf(
        Part.view(Splitter.part, collapsed, twoPanelProps).slot(
          'Panel',
          'sidebar',
        ),
      )['hidden'],
    ).toBe('')

    // atRest exits Resizing while preserving settled sizes
    const dragging = step(
      nextState,
      Splitter.BeginResize({ handleIndex: 0, pointerId: 1, x: 0, y: 0 }),
    )
    const resting = Splitter.atRest(dragging)
    expect(Splitter.isIdle(resting)).toBe(true)
    expect(Splitter.sizesOf(resting)).toEqual([45, 55])

    const Base = make({
      id: 'splitter-test',
      version: 1,
      Model: S.Struct({ ready: S.Boolean }),
      Message: S.Union([
        Catalog.action('Ping', {
          what: 'Pings',
          why: 'To verify',
          meta: { label: 'Ping', keys: [] },
        }),
      ]),
      init: () => [{ ready: true }, []],
      update: model => [model, []],
    })
    const SyncedApp = Part.compose({
      of: Base,
      parts: [
        Part.given(
          Splitter.make({ defaultSizes: [30, 70], sampleMs: 75 }),
          () => twoPanelProps,
        ),
      ],
    })
    expect(
      SyncedApp.synchronization?.paceOf?.(
        Splitter.MoveResize({
          pointerId: 1,
          x: 50,
          y: 0,
          containerSizePx: 500,
        }),
      ),
    ).toEqual(Pace.Sampled({ everyMs: 75 }))
    expect(
      SyncedApp.synchronization?.paceOf?.(Splitter.EndResize({ pointerId: 1 })),
    ).toEqual(Pace.Synced())

    const LocalApp = Part.compose({
      of: Base,
      parts: [Part.given(Splitter.deviceOnly(), () => twoPanelProps)],
    })
    expect(LocalApp.synchronization?.isLocalOnly?.(Splitter.ResetSizes())).toBe(
      true,
    )
  })
})
