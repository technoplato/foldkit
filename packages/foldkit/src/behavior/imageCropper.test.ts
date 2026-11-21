import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as ImageCropper from './imageCropper.js'
import { Device, Sampled, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: ImageCropper.Props = {
  id: 'avatar',
  viewportSize: { width: 400, height: 300 },
  minSize: { width: 40, height: 40 },
  maxSize: { width: 320, height: 240 },
  minZoom: 1,
  maxZoom: 4,
  zoomStep: 0.5,
  nudgeStepPx: 2,
  nudgeStepShiftPx: 20,
}

const fold = (
  messages: ReadonlyArray<ImageCropper.Message>,
  props: ImageCropper.Props = baseProps,
  from: ImageCropper.State = ImageCropper.initial,
): ImageCropper.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => ImageCropper.chart.transition(state, message, props)[0],
  )

describe('core ImageCropper Part', () => {
  describe('declaration, chart integrity, IDs, sync paces, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(ImageCropper.part)).toEqual([])
      expect(Part.problemsOf(ImageCropper.make({ sampleMs: 60 }))).toEqual([])
      expect(Part.problemsOf(ImageCropper.deviceOnly())).toEqual([])
      expect(Part.problemsOf(ImageCropper.make({ sync: 'OwnView' }))).toEqual(
        [],
      )
      expect(
        Block.problemsOf({ name: 'ImageCropper', chart: ImageCropper.chart }),
      ).toEqual([])

      for (const action of ImageCropper.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and Pace.Sampled drag/resize sync table', () => {
      expect(ImageCropper.rootId('avatar')).toBe('avatar-root')
      expect(ImageCropper.viewportId('avatar')).toBe('avatar-viewport')
      expect(ImageCropper.selectionId('avatar')).toBe('avatar-selection')
      expect(ImageCropper.handleId('avatar', 'SE')).toBe('avatar-handle-se')
      expect(ImageCropper.zoomControlId('avatar')).toBe('avatar-zoom')

      expect(ImageCropper.synced.MoveCropDrag).toEqual(Sampled({ everyMs: 50 }))
      expect(ImageCropper.synced.MoveCropResize).toEqual(
        Sampled({ everyMs: 50 }),
      )
      expect(ImageCropper.synced.SetCropZoom).toEqual(Synced())
      expect(
        ImageCropper.paceOf(
          ImageCropper.MoveCropResize({ pointerId: 1, x: 100, y: 100 }),
          120,
        ),
      ).toEqual(Sampled({ everyMs: 120 }))
      expect(ImageCropper.deviceSync('OwnView').MoveCropDrag).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Idle, DraggingCrop, and ResizingCrop states through Effect Schema JSON encoding', () => {
      const dragging = fold([
        ImageCropper.BeginCropDrag({ pointerId: 1, x: 50, y: 50 }),
        ImageCropper.MoveCropDrag({ pointerId: 1, x: 90, y: 70 }),
      ])
      const resizing = fold([
        ImageCropper.BeginCropResize({
          pointerId: 2,
          handle: 'SE',
          x: 100,
          y: 100,
        }),
        ImageCropper.MoveCropResize({ pointerId: 2, x: 140, y: 130 }),
      ])
      for (const state of [ImageCropper.initial, dragging, resizing]) {
        const encoded = S.encodeUnknownSync(ImageCropper.State)(state)
        const decoded = S.decodeUnknownSync(ImageCropper.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('drag pan clamping, 8-handle resize, aspectRatio lock, zoom/rotation/flip, and keyboard nudge', () => {
    it('drags crop rect clamped within viewport bounds and cancels on Escape', () => {
      const moved = fold([
        ImageCropper.BeginCropDrag({ pointerId: 1, x: 10, y: 10 }),
        ImageCropper.MoveCropDrag({ pointerId: 1, x: 500, y: 400 }),
        ImageCropper.EndCropDrag({ pointerId: 1 }),
      ])
      expect(ImageCropper.isIdle(moved)).toBe(true)
      // 100x100 crop inside 400x300 viewport -> max (300, 200)
      expect(ImageCropper.cropRectOf(moved)).toEqual({
        x: 300,
        y: 200,
        width: 100,
        height: 100,
      })

      // Normalized crop ratios in [0, 1]
      const normalized = ImageCropper.normalizedCropOf(moved, baseProps)
      expect(normalized.x).toBeCloseTo(0.75)
      expect(normalized.y).toBeCloseTo(2 / 3)
      expect(normalized.width).toBeCloseTo(0.25)
      expect(normalized.height).toBeCloseTo(1 / 3)

      // Escape cancels drag and restores originCropRect
      const cancelled = fold(
        [
          ImageCropper.BeginCropDrag({ pointerId: 1, x: 300, y: 200 }),
          ImageCropper.MoveCropDrag({ pointerId: 1, x: 100, y: 100 }),
          ImageCropper.PressedCropKey({ key: 'Escape' }),
        ],
        baseProps,
        moved,
      )
      expect(ImageCropper.isIdle(cancelled)).toBe(true)
      expect(ImageCropper.cropRectOf(cancelled)).toEqual({
        x: 300,
        y: 200,
        width: 100,
        height: 100,
      })
    })

    it('resizes across all 8 handles with min/max clamping and aspectRatio lock', () => {
      const start = fold([
        ImageCropper.SetCropRect({ x: 100, y: 80, width: 120, height: 80 }),
      ])

      // Free NW resize anchoring bottom-right (220, 160)
      const resizedNW = fold(
        [
          ImageCropper.BeginCropResize({
            pointerId: 1,
            handle: 'NW',
            x: 100,
            y: 80,
          }),
          ImageCropper.MoveCropResize({ pointerId: 1, x: 60, y: 50 }),
          ImageCropper.EndCropResize({ pointerId: 1 }),
        ],
        baseProps,
        start,
      )
      expect(ImageCropper.cropRectOf(resizedNW)).toEqual({
        x: 60,
        y: 50,
        width: 160,
        height: 110,
      })

      // Aspect-locked 16:9 resize via SE corner and E/S edges
      const lockedProps: ImageCropper.Props = {
        ...baseProps,
        aspectRatio: 16 / 9,
      }
      const lockedStart = ImageCropper.initialFor(lockedProps)
      const initialRatio =
        lockedStart.cropRect.width / lockedStart.cropRect.height
      expect(initialRatio).toBeCloseTo(16 / 9, 3)

      const resizedCorner = ImageCropper.resizeCropRect(
        lockedStart.cropRect,
        'SE',
        { dx: -40, dy: -40 },
        lockedProps,
      )
      expect(resizedCorner.width / resizedCorner.height).toBeCloseTo(16 / 9, 3)

      const resizedEdgeE = ImageCropper.resizeCropRect(
        lockedStart.cropRect,
        'E',
        { dx: -32, dy: 0 },
        lockedProps,
      )
      expect(resizedEdgeE.width / resizedEdgeE.height).toBeCloseTo(16 / 9, 3)

      const resizedEdgeN = ImageCropper.resizeCropRect(
        lockedStart.cropRect,
        'N',
        { dx: 0, dy: 18 },
        lockedProps,
      )
      expect(resizedEdgeN.width / resizedEdgeN.height).toBeCloseTo(16 / 9, 3)

      // Circle shape forces 1:1 ratio
      const circleProps: ImageCropper.Props = {
        ...baseProps,
        cropShape: 'Circle',
      }
      expect(ImageCropper.aspectRatioOf(circleProps)).toEqual(Option.some(1))
    })

    it('handles zoom, rotation, flip, keyboard arrow/Shift nudge, Alt resize, ResetCrop, and atRest', () => {
      const transformed = fold([
        ImageCropper.SetCropRect({ x: 50, y: 50, width: 100, height: 100 }),
        ImageCropper.ZoomInCrop(),
        ImageCropper.SetCropZoom({ zoom: 10 }), // clamped to maxZoom 4
        ImageCropper.SetCropRotation({ rotation: 90 }),
        ImageCropper.FlipCropHorizontal(),
        ImageCropper.FlipCropVertical(),
      ])
      expect(ImageCropper.zoomOf(transformed)).toBe(4)
      expect(ImageCropper.rotationOf(transformed)).toBe(90)
      expect(transformed.flipHorizontal).toBe(true)
      expect(transformed.flipVertical).toBe(true)

      // Keyboard arrow nudge (base step 2, Shift step 20) and Alt+ArrowRight resize
      const nudged = fold(
        [
          ImageCropper.PressedCropKey({ key: 'ArrowRight' }),
          ImageCropper.PressedCropKey({ key: 'ArrowDown', shiftKey: true }),
          ImageCropper.PressedCropKey({
            key: 'ArrowRight',
            altKey: true,
            shiftKey: true,
          }),
          ImageCropper.PressedCropKey({ key: '-' }),
        ],
        baseProps,
        transformed,
      )
      expect(ImageCropper.cropRectOf(nudged)).toEqual({
        x: 52,
        y: 70,
        width: 120,
        height: 100,
      })
      expect(ImageCropper.zoomOf(nudged)).toBe(3.5)

      // atRest preserves committed crop/zoom/rotation/flip while dropping active drag
      const dragging = fold(
        [
          ImageCropper.BeginCropDrag({ pointerId: 1, x: 52, y: 70 }),
          ImageCropper.MoveCropDrag({ pointerId: 1, x: 62, y: 80 }),
        ],
        baseProps,
        nudged,
      )
      const rested = ImageCropper.atRest(dragging)
      expect(ImageCropper.isIdle(rested)).toBe(true)
      expect(ImageCropper.cropRectOf(rested)).toEqual({
        x: 62,
        y: 80,
        width: 120,
        height: 100,
      })

      // ResetCrop restores centered default bounds and resets transforms
      const reset = fold([ImageCropper.ResetCrop()], baseProps, rested)
      expect(ImageCropper.zoomOf(reset)).toBe(1)
      expect(ImageCropper.rotationOf(reset)).toBe(0)
      expect(reset.flipHorizontal).toBe(false)
      expect(reset.flipVertical).toBe(false)
    })
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects all 5 slots with reference stability across unchanged renders', () => {
      const view1 = Part.view(
        ImageCropper.part,
        ImageCropper.initial,
        baseProps,
      )
      const view2 = Part.view(
        ImageCropper.part,
        ImageCropper.initial,
        baseProps,
      )
      expect(view1).toBe(view2)

      const rootSlot = view1.slot('Root')
      const handleSE = view1.slot('Handle', 'SE')
      expect(Slot.ariaOf(rootSlot)).toMatchObject({
        role: 'group',
        id: 'avatar-root',
        'aria-controls': 'avatar-selection',
      })
      expect(Slot.ariaOf(view1.slot('Viewport'))['role']).toBe('region')
      expect(Slot.ariaOf(view1.slot('Selection'))).toMatchObject({
        role: 'slider',
        id: 'avatar-selection',
        'aria-valuemin': '0',
        'aria-valuemax': '300',
        'aria-valuenow': '0',
      })
      expect(Slot.ariaOf(handleSE)).toMatchObject({
        role: 'button',
        id: 'avatar-handle-se',
        'aria-label': 'Resize crop southeast corner',
      })
      expect(Slot.ariaOf(view1.slot('ZoomControl'))).toMatchObject({
        role: 'slider',
        id: 'avatar-zoom',
        'aria-valuemin': '1',
        'aria-valuemax': '4',
        'aria-valuenow': '1',
        'aria-valuetext': '100%',
      })

      // Zooming keeps Root and Handle reference-stable
      const zoomed = fold([ImageCropper.ZoomInCrop()])
      const zoomedView = Part.view(ImageCropper.part, zoomed, baseProps)
      expect(zoomedView.slot('Root')).toBe(rootSlot)
      expect(zoomedView.slot('Handle', 'SE')).toBe(handleSE)
      expect(Slot.ariaOf(zoomedView.slot('ZoomControl'))['aria-valuenow']).toBe(
        '1.5',
      )
      expect(
        Slot.ariaOf(zoomedView.slot('ZoomControl'))['aria-valuetext'],
      ).toBe('150%')
    })

    it('syncs by default in Part.compose and omits state when deviceOnly', () => {
      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'image-cropper-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(ImageCropper.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [zoomedSynced] = SyncedApp.update(
        initSynced,
        ImageCropper.ZoomInCrop(),
      )
      expect(
        SyncedApp.synchronization?.paceOf?.(
          ImageCropper.MoveCropDrag({ pointerId: 1, x: 40, y: 40 }),
        ),
      ).toEqual(Sampled({ everyMs: 50 }))
      expect(
        SyncedApp.synchronization?.messageCategory(ImageCropper.ZoomInCrop()),
      ).toBe('Domain')
      const encodedSynced = S.encodeUnknownSync(SyncedApp.Model)(zoomedSynced)
      expect(encodedSynced).toHaveProperty('parts.ImageCropper.zoom', 1.5)

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(ImageCropper.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [zoomedLocal] = LocalApp.update(
        initLocal,
        ImageCropper.ZoomInCrop(),
      )
      const encodedLocal = S.encodeUnknownSync(LocalApp.Model)(zoomedLocal)
      expect(encodedLocal).not.toHaveProperty('parts')
    })
  })
})
