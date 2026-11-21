import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Sampled, Synced } from './pace.js'
import * as Part from './part.js'
import * as SignaturePad from './signaturePad.js'
import * as Slot from './slot.js'

const baseProps: SignaturePad.Props = {
  id: 'contract',
  minPointDistancePx: 5,
  sampleMs: 50,
}

const fold = (
  messages: ReadonlyArray<SignaturePad.Message>,
  props: SignaturePad.Props = baseProps,
  from: SignaturePad.State = SignaturePad.initial,
): SignaturePad.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => SignaturePad.chart.transition(state, message, props)[0],
  )

describe('core SignaturePad Part', () => {
  describe('declaration, chart integrity, IDs, sync paces, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(SignaturePad.part)).toEqual([])
      expect(Part.problemsOf(SignaturePad.make({ sampleMs: 40 }))).toEqual([])
      expect(Part.problemsOf(SignaturePad.deviceOnly())).toEqual([])
      expect(Part.problemsOf(SignaturePad.make({ sync: 'OwnView' }))).toEqual(
        [],
      )
      expect(
        Block.problemsOf({ name: 'SignaturePad', chart: SignaturePad.chart }),
      ).toEqual([])

      for (const action of SignaturePad.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and Pace.Sampled stroke move sync table', () => {
      expect(SignaturePad.rootId('contract')).toBe('contract-root')
      expect(SignaturePad.segmentId('contract')).toBe('contract-segment')
      expect(SignaturePad.clearButtonId('contract')).toBe('contract-clear')
      expect(SignaturePad.undoButtonId('contract')).toBe('contract-undo')

      expect(SignaturePad.synced.MoveSignatureStroke).toEqual(
        Sampled({ everyMs: 50 }),
      )
      expect(SignaturePad.synced.BeginSignatureStroke).toEqual(Synced())
      expect(SignaturePad.synced.EndSignatureStroke).toEqual(Synced())
      expect(SignaturePad.synced.UndoStroke).toEqual(Synced())
      expect(SignaturePad.synced.ClearSignature).toEqual(Synced())
      expect(
        SignaturePad.paceOf(
          SignaturePad.MoveSignatureStroke({ pointerId: 1, x: 20, y: 20 }),
          25,
        ),
      ).toEqual(Sampled({ everyMs: 25 }))
      expect(SignaturePad.deviceSync('OwnView').MoveSignatureStroke).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Idle and Drawing states through Effect Schema JSON encoding', () => {
      const drawing = fold([
        SignaturePad.BeginSignatureStroke({
          pointerId: 1,
          x: 10,
          y: 10,
          pressure: 0.7,
        }),
        SignaturePad.MoveSignatureStroke({
          pointerId: 1,
          x: 20,
          y: 25,
          pressure: 0.8,
        }),
      ])
      const committed = fold(
        [SignaturePad.EndSignatureStroke({ pointerId: 1 })],
        baseProps,
        drawing,
      )
      for (const state of [SignaturePad.initial, drawing, committed]) {
        const encoded = S.encodeUnknownSync(SignaturePad.State)(state)
        const decoded = S.decodeUnknownSync(SignaturePad.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('stroke capture, thinning, SVG path derivation, undo/clear, and guards', () => {
    it('thins points closer than minPointDistancePx and derives pure SVG polyline/quadratic paths', () => {
      expect(SignaturePad.isEmptyOf(SignaturePad.initial)).toBe(true)
      expect(SignaturePad.strokeCountOf(SignaturePad.initial)).toBe(0)
      expect(SignaturePad.strokeToSvgPath([])).toBe('')
      expect(
        SignaturePad.strokeToSvgPath([{ x: 4, y: 8, pressure: 0.5 }]),
      ).toBe('M 4 8 L 4 8')
      expect(
        SignaturePad.strokeToSvgPath([
          { x: 0, y: 0, pressure: 0.5 },
          { x: 10, y: 20, pressure: 0.5 },
        ]),
      ).toBe('M 0 0 L 10 20')

      const drawing = fold([
        SignaturePad.BeginSignatureStroke({
          pointerId: 1,
          x: 0,
          y: 0,
          pressure: 0.6,
        }),
        // Distance 2 < minPointDistancePx (5): thinned out
        SignaturePad.MoveSignatureStroke({
          pointerId: 1,
          x: 2,
          y: 0,
          pressure: 0.6,
        }),
        // Distance 10 >= 5: accepted
        SignaturePad.MoveSignatureStroke({
          pointerId: 1,
          x: 10,
          y: 10,
          pressure: 0.8,
        }),
        // Another pointer ignored
        SignaturePad.MoveSignatureStroke({
          pointerId: 2,
          x: 50,
          y: 50,
          pressure: 0.9,
        }),
        // Distance ~14.1 >= 5: accepted
        SignaturePad.MoveSignatureStroke({
          pointerId: 1,
          x: 20,
          y: 0,
          pressure: 0.7,
        }),
      ])

      expect(SignaturePad.isDrawing(drawing)).toBe(true)
      expect(SignaturePad.isEmptyOf(drawing)).toBe(false)
      expect(SignaturePad.currentStrokeOf(drawing)).toHaveLength(3)
      const livePaths = SignaturePad.allPathsOf(drawing)
      expect(livePaths).toHaveLength(1)
      expect(livePaths[0]).toBe('M 0 0 Q 10 10 15 5 L 20 0')
      expect(SignaturePad.currentPathOf(drawing)).toEqual(
        Option.some('M 0 0 Q 10 10 15 5 L 20 0'),
      )

      const committed = fold(
        [SignaturePad.EndSignatureStroke({ pointerId: 1 })],
        baseProps,
        drawing,
      )
      expect(SignaturePad.isIdle(committed)).toBe(true)
      expect(SignaturePad.strokeCountOf(committed)).toBe(1)
      expect(SignaturePad.allPathsOf(committed)).toEqual([
        'M 0 0 Q 10 10 15 5 L 20 0',
      ])
    })

    it('accumulates multiple strokes, supports UndoStroke, ClearSignature, Escape cancel, atRest, and disabled/readOnly guards', () => {
      const twoStrokes = fold([
        SignaturePad.BeginSignatureStroke({ pointerId: 1, x: 0, y: 0 }),
        SignaturePad.MoveSignatureStroke({ pointerId: 1, x: 10, y: 0 }),
        SignaturePad.EndSignatureStroke({ pointerId: 1 }),
        SignaturePad.BeginSignatureStroke({ pointerId: 2, x: 0, y: 20 }),
        SignaturePad.MoveSignatureStroke({ pointerId: 2, x: 15, y: 20 }),
        SignaturePad.EndSignatureStroke({ pointerId: 2 }),
      ])
      expect(SignaturePad.strokeCountOf(twoStrokes)).toBe(2)

      // Escape cancels an in-progress third stroke without losing prior two
      const cancelledThird = fold(
        [
          SignaturePad.BeginSignatureStroke({ pointerId: 3, x: 5, y: 5 }),
          SignaturePad.MoveSignatureStroke({ pointerId: 3, x: 25, y: 25 }),
          SignaturePad.PressedSignatureKey({ key: 'Escape' }),
        ],
        baseProps,
        twoStrokes,
      )
      expect(SignaturePad.isIdle(cancelledThird)).toBe(true)
      expect(SignaturePad.strokeCountOf(cancelledThird)).toBe(2)

      // atRest preserves committed strokes and discards active stroke
      const activeThird = fold(
        [SignaturePad.BeginSignatureStroke({ pointerId: 3, x: 5, y: 5 })],
        baseProps,
        twoStrokes,
      )
      const rested = SignaturePad.atRest(activeThird)
      expect(SignaturePad.isIdle(rested)).toBe(true)
      expect(SignaturePad.strokeCountOf(rested)).toBe(2)

      // Undo removes last committed stroke
      const afterUndo = fold(
        [SignaturePad.UndoStroke()],
        baseProps,
        cancelledThird,
      )
      expect(SignaturePad.strokeCountOf(afterUndo)).toBe(1)

      // Read-only and disabled block drawing, undo, and clear
      const readOnlyProps: SignaturePad.Props = {
        ...baseProps,
        isReadOnly: true,
      }
      expect(
        SignaturePad.strokeCountOf(
          fold([SignaturePad.ClearSignature()], readOnlyProps, afterUndo),
        ),
      ).toBe(1)
      expect(
        SignaturePad.isDrawing(
          fold(
            [SignaturePad.BeginSignatureStroke({ pointerId: 4, x: 0, y: 0 })],
            { ...baseProps, isDisabled: true },
            afterUndo,
          ),
        ),
      ).toBe(false)

      // ClearSignature empties strokes when interactive
      const cleared = fold(
        [SignaturePad.ClearSignature()],
        baseProps,
        afterUndo,
      )
      expect(SignaturePad.isEmptyOf(cleared)).toBe(true)
      expect(SignaturePad.strokeCountOf(cleared)).toBe(0)
    })
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects all 4 slots with reference stability across unchanged renders', () => {
      const view1 = Part.view(
        SignaturePad.part,
        SignaturePad.initial,
        baseProps,
      )
      const view2 = Part.view(
        SignaturePad.part,
        SignaturePad.initial,
        baseProps,
      )
      expect(view1).toBe(view2)

      const rootSlot = view1.slot('Root')
      expect(Slot.ariaOf(rootSlot)).toMatchObject({
        role: 'group',
        id: 'contract-root',
        'aria-label': 'Signature pad',
        tabindex: '0',
      })
      expect(Slot.ariaOf(view1.slot('Segment'))['hidden']).toBe('')
      expect(Slot.ariaOf(view1.slot('ClearButton'))['aria-disabled']).toBe(
        'true',
      )
      expect(Slot.ariaOf(view1.slot('UndoButton'))['aria-disabled']).toBe(
        'true',
      )

      const signed = fold([
        SignaturePad.BeginSignatureStroke({ pointerId: 1, x: 0, y: 0 }),
        SignaturePad.MoveSignatureStroke({ pointerId: 1, x: 12, y: 0 }),
        SignaturePad.EndSignatureStroke({ pointerId: 1 }),
      ])
      const signedView = Part.view(SignaturePad.part, signed, baseProps)
      expect(signedView.slot('Root')).toBe(rootSlot)
      expect(Slot.ariaOf(signedView.slot('Segment'))['hidden']).toBeUndefined()
      expect(Slot.ariaOf(signedView.slot('Segment'))['aria-label']).toBe(
        '1 stroke',
      )
      expect(Slot.ariaOf(signedView.slot('ClearButton'))['aria-disabled']).toBe(
        'false',
      )
      expect(Slot.ariaOf(signedView.slot('UndoButton'))['aria-disabled']).toBe(
        'false',
      )
    })

    it('syncs by default in Part.compose and omits state when deviceOnly', () => {
      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'signature-pad-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(SignaturePad.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [s1] = SyncedApp.update(
        initSynced,
        SignaturePad.BeginSignatureStroke({ pointerId: 1, x: 0, y: 0 }),
      )
      const [s2] = SyncedApp.update(
        s1,
        SignaturePad.EndSignatureStroke({ pointerId: 1 }),
      )
      expect(
        SyncedApp.synchronization?.paceOf?.(
          SignaturePad.MoveSignatureStroke({ pointerId: 1, x: 20, y: 20 }),
        ),
      ).toEqual(Sampled({ everyMs: 50 }))
      expect(
        SyncedApp.synchronization?.messageCategory(
          SignaturePad.ClearSignature(),
        ),
      ).toBe('Domain')
      const encodedSynced = S.encodeUnknownSync(SyncedApp.Model)(s2)
      expect(encodedSynced).toHaveProperty('parts.SignaturePad._tag', 'Idle')

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(SignaturePad.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [l1] = LocalApp.update(
        initLocal,
        SignaturePad.BeginSignatureStroke({ pointerId: 1, x: 0, y: 0 }),
      )
      const encodedLocal = S.encodeUnknownSync(LocalApp.Model)(l1)
      expect(encodedLocal).not.toHaveProperty('parts')
    })
  })
})
