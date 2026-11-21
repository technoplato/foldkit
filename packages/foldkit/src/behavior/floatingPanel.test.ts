import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as FloatingPanel from './floatingPanel.js'
import { Device, Sampled, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: FloatingPanel.Props = {
  id: 'inspector',
  defaultPosition: { x: 100, y: 80 },
  defaultSize: { width: 300, height: 200 },
  minSize: { width: 150, height: 100 },
  maxSize: { width: 600, height: 450 },
  boundaryRect: { x: 0, y: 0, width: 800, height: 600 },
  minimizedHeightPx: 40,
}

const fold = (
  messages: ReadonlyArray<FloatingPanel.Message>,
  props: FloatingPanel.Props = baseProps,
  from: FloatingPanel.State = FloatingPanel.initial,
): FloatingPanel.State =>
  Array.reduce(
    messages,
    from,
    (state, message) =>
      FloatingPanel.chart.transition(state, message, props)[0],
  )

describe('core FloatingPanel Part', () => {
  describe('declaration, chart integrity, IDs, sync paces, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(FloatingPanel.part)).toEqual([])
      expect(Part.problemsOf(FloatingPanel.make({ sampleMs: 75 }))).toEqual([])
      expect(Part.problemsOf(FloatingPanel.deviceOnly())).toEqual([])
      expect(Part.problemsOf(FloatingPanel.make({ sync: 'OwnView' }))).toEqual(
        [],
      )
      expect(
        Block.problemsOf({ name: 'FloatingPanel', chart: FloatingPanel.chart }),
      ).toEqual([])

      for (const action of FloatingPanel.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and Pace.Sampled drag/resize sync table', () => {
      expect(FloatingPanel.rootId('inspector')).toBe('inspector-root')
      expect(FloatingPanel.headerId('inspector')).toBe('inspector-header')
      expect(FloatingPanel.bodyId('inspector')).toBe('inspector-body')
      expect(FloatingPanel.resizeHandleId('inspector', 'NW')).toBe(
        'inspector-resize-nw',
      )
      expect(FloatingPanel.minimizeButtonId('inspector')).toBe(
        'inspector-minimize',
      )
      expect(FloatingPanel.maximizeButtonId('inspector')).toBe(
        'inspector-maximize',
      )
      expect(FloatingPanel.closeButtonId('inspector')).toBe('inspector-close')

      expect(FloatingPanel.synced.MoveFloatingPanelDrag).toEqual(
        Sampled({ everyMs: 50 }),
      )
      expect(FloatingPanel.synced.MoveFloatingPanelResize).toEqual(
        Sampled({ everyMs: 50 }),
      )
      expect(FloatingPanel.synced.OpenFloatingPanel).toEqual(Synced())
      expect(
        FloatingPanel.paceOf(
          FloatingPanel.MoveFloatingPanelResize({ pointerId: 1, x: 50, y: 50 }),
          100,
        ),
      ).toEqual(Sampled({ everyMs: 100 }))
      expect(FloatingPanel.deviceSync('OwnView').MoveFloatingPanelDrag).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Closed, Open, Dragging, and Resizing states through Effect Schema JSON encoding', () => {
      const open = fold([FloatingPanel.OpenFloatingPanel()])
      const dragging = fold([
        FloatingPanel.OpenFloatingPanel(),
        FloatingPanel.BeginFloatingPanelDrag({ pointerId: 1, x: 120, y: 90 }),
        FloatingPanel.MoveFloatingPanelDrag({ pointerId: 1, x: 160, y: 120 }),
      ])
      const resizing = fold([
        FloatingPanel.OpenFloatingPanel(),
        FloatingPanel.BeginFloatingPanelResize({
          pointerId: 2,
          axis: 'SE',
          x: 400,
          y: 280,
        }),
        FloatingPanel.MoveFloatingPanelResize({ pointerId: 2, x: 450, y: 310 }),
      ])
      for (const state of [FloatingPanel.initial, open, dragging, resizing]) {
        const encoded = S.encodeUnknownSync(FloatingPanel.State)(state)
        const decoded = S.decodeUnknownSync(FloatingPanel.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('drag positioning, boundary clamping, keyboard move, and 8-axis resize math', () => {
    it('drags within boundaryRect, restores originPosition on cancel/Escape, and nudges via keyboard', () => {
      const moved = fold([
        FloatingPanel.OpenFloatingPanel(),
        FloatingPanel.BeginFloatingPanelDrag({ pointerId: 1, x: 120, y: 90 }),
        FloatingPanel.MoveFloatingPanelDrag({ pointerId: 1, x: 920, y: 790 }),
        FloatingPanel.EndFloatingPanelDrag({ pointerId: 1 }),
      ])
      expect(FloatingPanel.isOpen(moved)).toBe(true)
      expect(FloatingPanel.isDragging(moved)).toBe(false)
      // Clamped inside 800x600 boundary for 300x200 panel -> max (500, 400)
      expect(FloatingPanel.positionOf(moved)).toEqual(
        Option.some({ x: 500, y: 400 }),
      )

      // Escape during drag restores originPosition
      const cancelled = fold(
        [
          FloatingPanel.BeginFloatingPanelDrag({
            pointerId: 1,
            x: 500,
            y: 400,
          }),
          FloatingPanel.MoveFloatingPanelDrag({ pointerId: 1, x: 300, y: 200 }),
          FloatingPanel.PressedFloatingPanelKey({ key: 'Escape' }),
        ],
        baseProps,
        moved,
      )
      expect(FloatingPanel.isDragging(cancelled)).toBe(false)
      expect(FloatingPanel.positionOf(cancelled)).toEqual(
        Option.some({ x: 500, y: 400 }),
      )

      // Arrow keys nudge position (Shift multiplies by 5)
      const nudged = fold(
        [
          FloatingPanel.PressedFloatingPanelKey({
            key: 'ArrowLeft',
            shiftKey: true,
          }),
          FloatingPanel.PressedFloatingPanelKey({ key: 'ArrowUp' }),
        ],
        baseProps,
        cancelled,
      )
      expect(FloatingPanel.positionOf(nudged)).toEqual(
        Option.some({ x: 450, y: 390 }),
      )
    })

    it('resizes accurately across all 8 ResizeAxis edges/corners, honoring min/max/boundary and lockAspectRatio', () => {
      const origin: FloatingPanel.PanelRect = {
        x: 100,
        y: 100,
        width: 300,
        height: 200,
      }

      // E expands width only
      expect(
        FloatingPanel.resizePanelRect(
          origin,
          { dx: 50, dy: 99 },
          'E',
          baseProps,
        ),
      ).toEqual({ x: 100, y: 100, width: 350, height: 200 })

      // W moves x left while anchoring right edge at 400
      expect(
        FloatingPanel.resizePanelRect(
          origin,
          { dx: -40, dy: 0 },
          'W',
          baseProps,
        ),
      ).toEqual({ x: 60, y: 100, width: 340, height: 200 })

      // N moves y up while anchoring bottom edge at 300
      expect(
        FloatingPanel.resizePanelRect(
          origin,
          { dx: 0, dy: -30 },
          'N',
          baseProps,
        ),
      ).toEqual({ x: 100, y: 70, width: 300, height: 230 })

      // S expands height only
      expect(
        FloatingPanel.resizePanelRect(
          origin,
          { dx: 0, dy: 60 },
          'S',
          baseProps,
        ),
      ).toEqual({ x: 100, y: 100, width: 300, height: 260 })

      // NW anchors bottom-right at (400, 300) and respects minSize (150x100)
      expect(
        FloatingPanel.resizePanelRect(
          origin,
          { dx: 250, dy: 250 },
          'NW',
          baseProps,
        ),
      ).toEqual({ x: 250, y: 200, width: 150, height: 100 })

      // NE anchors bottom-left at (100, 300)
      expect(
        FloatingPanel.resizePanelRect(
          origin,
          { dx: 50, dy: -50 },
          'NE',
          baseProps,
        ),
      ).toEqual({ x: 100, y: 50, width: 350, height: 250 })

      // SW anchors top-right at (400, 100)
      expect(
        FloatingPanel.resizePanelRect(
          origin,
          { dx: -50, dy: 50 },
          'SW',
          baseProps,
        ),
      ).toEqual({ x: 50, y: 100, width: 350, height: 250 })

      // SE clamps at maxSize (600x450) and boundary
      expect(
        FloatingPanel.resizePanelRect(
          origin,
          { dx: 900, dy: 900 },
          'SE',
          baseProps,
        ),
      ).toEqual({ x: 100, y: 100, width: 600, height: 450 })

      // lockAspectRatio keeps 3:2 ratio (300/200 = 1.5)
      const locked = FloatingPanel.resizePanelRect(
        origin,
        { dx: 150, dy: 20 },
        'SE',
        { ...baseProps, lockAspectRatio: true },
      )
      expect(locked.width / locked.height).toBeCloseTo(1.5, 4)
      expect(locked.width).toBe(450)
      expect(locked.height).toBe(300)

      // Chart CancelFloatingPanelResize restores originRect
      const cancelledResize = fold([
        FloatingPanel.OpenFloatingPanel(),
        FloatingPanel.BeginFloatingPanelResize({
          pointerId: 1,
          axis: 'SE',
          x: 400,
          y: 280,
        }),
        FloatingPanel.MoveFloatingPanelResize({ pointerId: 1, x: 520, y: 380 }),
        FloatingPanel.CancelFloatingPanelResize({ pointerId: 1 }),
      ])
      expect(FloatingPanel.isResizing(cancelledResize)).toBe(false)
      expect(FloatingPanel.sizeOf(cancelledResize)).toEqual(
        Option.some({ width: 300, height: 200 }),
      )
    })
  })

  describe('Default / Minimized / Maximized stages preserving restoreRect, persistRect, and atRest', () => {
    it('preserves restoreRect across Minimized -> Maximized -> Default transitions', () => {
      const opened = fold([
        FloatingPanel.OpenFloatingPanel(),
        FloatingPanel.SetFloatingPanelPosition({ x: 120, y: 90 }),
        FloatingPanel.SetFloatingPanelSize({ width: 340, height: 220 }),
      ])
      const originalRect: FloatingPanel.PanelRect = {
        x: 120,
        y: 90,
        width: 340,
        height: 220,
      }

      const minimized = fold(
        [FloatingPanel.MinimizeFloatingPanel()],
        baseProps,
        opened,
      )
      expect(FloatingPanel.stageOf(minimized)).toBe('Minimized')
      expect(FloatingPanel.sizeOf(minimized)).toEqual(
        Option.some({ width: 340, height: 40 }),
      )
      expect(FloatingPanel.restoreRectOf(minimized)).toEqual(
        Option.some(originalRect),
      )
      expect(FloatingPanel.canResize(minimized, baseProps)).toBe(false)

      // Maximizing from Minimized preserves the original Default restoreRect
      const maximized = fold(
        [FloatingPanel.MaximizeFloatingPanel()],
        baseProps,
        minimized,
      )
      expect(FloatingPanel.stageOf(maximized)).toBe('Maximized')
      expect(FloatingPanel.rectOf(maximized)).toEqual(
        Option.some({ x: 0, y: 0, width: 800, height: 600 }),
      )
      expect(FloatingPanel.restoreRectOf(maximized)).toEqual(
        Option.some(originalRect),
      )
      expect(FloatingPanel.canDrag(maximized, baseProps)).toBe(false)

      // Restoring brings back the exact original Default rect
      const restored = fold(
        [FloatingPanel.RestoreFloatingPanel()],
        baseProps,
        maximized,
      )
      expect(FloatingPanel.stageOf(restored)).toBe('Default')
      expect(FloatingPanel.rectOf(restored)).toEqual(Option.some(originalRect))
      expect(FloatingPanel.restoreRectOf(restored)).toEqual(Option.none())

      // persistRect retains rect across Close -> Open
      const persistProps: FloatingPanel.Props = {
        ...baseProps,
        persistRect: true,
      }
      const reopened = fold(
        [FloatingPanel.CloseFloatingPanel(), FloatingPanel.OpenFloatingPanel()],
        persistProps,
        restored,
      )
      expect(FloatingPanel.rectOf(reopened)).toEqual(Option.some(originalRect))

      // atRest always closes
      expect(FloatingPanel.atRest(reopened)).toEqual(FloatingPanel.initial)
    })
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects all 7 slots with reference stability across unchanged renders', () => {
      const closedView1 = Part.view(
        FloatingPanel.part,
        FloatingPanel.initial,
        baseProps,
      )
      const closedView2 = Part.view(
        FloatingPanel.part,
        FloatingPanel.initial,
        baseProps,
      )
      expect(closedView1).toBe(closedView2)
      expect(Slot.ariaOf(closedView1.slot('Root'))['hidden']).toBe('')
      expect(Slot.ariaOf(closedView1.slot('Body'))['hidden']).toBe('')

      const opened = fold([FloatingPanel.OpenFloatingPanel()])
      const openView = Part.view(FloatingPanel.part, opened, baseProps)
      const closeBtn = openView.slot('CloseButton')
      expect(Slot.ariaOf(openView.slot('Root'))).toMatchObject({
        role: 'dialog',
        id: 'inspector-root',
        'aria-modal': 'false',
        'aria-labelledby': 'inspector-header',
      })
      expect(Slot.ariaOf(openView.slot('Root'))['hidden']).toBeUndefined()
      expect(Slot.ariaOf(openView.slot('Body'))['hidden']).toBeUndefined()
      expect(Slot.ariaOf(openView.slot('ResizeHandle', 'SE'))).toMatchObject({
        id: 'inspector-resize-se',
        'aria-label': 'Resize southeast corner',
      })
      expect(Slot.ariaOf(openView.slot('MinimizeButton'))['aria-pressed']).toBe(
        'false',
      )
      expect(Slot.ariaOf(openView.slot('MaximizeButton'))['aria-pressed']).toBe(
        'false',
      )

      const minimized = fold(
        [FloatingPanel.ToggleMinimizeFloatingPanel()],
        baseProps,
        opened,
      )
      const minView = Part.view(FloatingPanel.part, minimized, baseProps)
      expect(minView.slot('CloseButton')).toBe(closeBtn)
      expect(Slot.ariaOf(minView.slot('Body'))['hidden']).toBe('')
      expect(Slot.ariaOf(minView.slot('MinimizeButton'))['aria-pressed']).toBe(
        'true',
      )
    })

    it('syncs by default in Part.compose and omits state when deviceOnly', () => {
      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'floating-panel-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(FloatingPanel.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [openSynced] = SyncedApp.update(
        initSynced,
        FloatingPanel.OpenFloatingPanel(),
      )
      expect(
        SyncedApp.synchronization?.paceOf?.(
          FloatingPanel.MoveFloatingPanelDrag({ pointerId: 1, x: 50, y: 50 }),
        ),
      ).toEqual(Sampled({ everyMs: 50 }))
      expect(
        SyncedApp.synchronization?.messageCategory(
          FloatingPanel.OpenFloatingPanel(),
        ),
      ).toBe('Navigation')
      const encodedSynced = S.encodeUnknownSync(SyncedApp.Model)(openSynced)
      expect(encodedSynced).toHaveProperty('parts.FloatingPanel._tag', 'Open')

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(FloatingPanel.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [openLocal] = LocalApp.update(
        initLocal,
        FloatingPanel.OpenFloatingPanel(),
      )
      const encodedLocal = S.encodeUnknownSync(LocalApp.Model)(openLocal)
      expect(encodedLocal).not.toHaveProperty('parts')
    })
  })
})
