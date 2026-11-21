import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as VirtualList from './virtualList.js'

const baseProps: VirtualList.Props = {
  id: 'rows',
  label: 'Audit log',
  itemCount: 100,
  rowHeightPx: 30,
  overscan: 2,
}

const fold = (
  messages: ReadonlyArray<VirtualList.Message>,
  props: VirtualList.Props = baseProps,
  from: VirtualList.State = VirtualList.initial,
): VirtualList.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => VirtualList.chart.transition(state, message, props)[0],
  )

describe('core VirtualList Part', () => {
  describe('declaration, chart integrity, IDs, and schema serialization', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(VirtualList.part)).toEqual([])
      expect(Part.problemsOf(VirtualList.deviceOnly())).toEqual([])
      expect(Part.problemsOf(VirtualList.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Part.problemsOf(VirtualList.make({ initialContainerHeight: 300 })),
      ).toEqual([])
      expect(
        Block.problemsOf({ name: 'VirtualList', chart: VirtualList.chart }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'VirtualListMeasured',
          chart: VirtualList.chartOf(VirtualList.initialMeasured(300)),
        }),
      ).toEqual([])

      for (const action of VirtualList.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs cleanly', () => {
      expect(VirtualList.viewportId('rows')).toBe('rows-viewport')
      expect(VirtualList.contentId('rows')).toBe('rows-content')
      expect(VirtualList.itemId('rows', 7)).toBe('rows-item-7')
    })

    it('round-trips Unmeasured and Measured states through Effect Schema JSON encoding', () => {
      const measured = fold([
        VirtualList.MeasuredViewport({ containerHeight: 300 }),
        VirtualList.ScrollToIndex({ index: 25, align: 'Center' }),
      ])
      for (const state of [VirtualList.initial, measured]) {
        const encoded = S.encodeUnknownSync(VirtualList.State)(state)
        const decoded = S.decodeUnknownSync(VirtualList.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('measurement lifecycle, windowing, and monotonic-versioned pendingScroll', () => {
    it('returns None for visibleWindowOf while Unmeasured and computes fixed & variable windows once Measured', () => {
      expect(VirtualList.isUnmeasured(VirtualList.initial)).toBe(true)
      expect(
        VirtualList.visibleWindowOf(VirtualList.initial, baseProps),
      ).toEqual(Option.none())

      const measured = fold([
        VirtualList.MeasuredViewport({ containerHeight: 300 }),
      ])
      expect(VirtualList.isMeasured(measured)).toBe(true)
      expect(VirtualList.containerHeightOf(measured)).toEqual(Option.some(300))
      expect(VirtualList.visibleWindowOf(measured, baseProps)).toEqual(
        Option.some({
          startIndex: 0,
          endIndex: 12,
          topSpacerHeight: 0,
          bottomSpacerHeight: 88 * 30,
          totalHeight: 100 * 30,
        }),
      )

      const scrolled = fold(
        [VirtualList.ScrolledViewport({ scrollTop: 600 })],
        baseProps,
        measured,
      )
      expect(VirtualList.scrollTopOf(scrolled)).toBe(600)
      expect(VirtualList.visibleWindowOf(scrolled, baseProps)).toEqual(
        Option.some({
          startIndex: 18,
          endIndex: 32,
          topSpacerHeight: 18 * 30,
          bottomSpacerHeight: 68 * 30,
          totalHeight: 100 * 30,
        }),
      )

      const variableProps: VirtualList.Props = {
        id: 'variable',
        itemCount: 5,
        rowHeightPx: 30,
        itemHeights: [10, 20, 30, 40, 50],
        overscan: 0,
      }
      const variableMeasured = fold(
        [
          VirtualList.MeasuredViewport({ containerHeight: 60 }),
          VirtualList.ScrolledViewport({ scrollTop: 25 }),
        ],
        variableProps,
      )
      expect(
        VirtualList.visibleWindowOf(variableMeasured, variableProps),
      ).toEqual(
        Option.some({
          startIndex: 1,
          endIndex: 4,
          topSpacerHeight: 10,
          bottomSpacerHeight: 50,
          totalHeight: 150,
        }),
      )
    })

    it('tracks monotonic pendingScroll versions, ignores stale completions, and restores initialScrollTop on first measurement', () => {
      const measured = fold([
        VirtualList.MeasuredViewport({ containerHeight: 300 }),
      ])
      const firstScroll = fold(
        [VirtualList.ScrollToIndex({ index: 20, align: 'Start' })],
        baseProps,
        measured,
      )
      expect(VirtualList.pendingScrollVersionOf(firstScroll)).toBe(1)
      expect(VirtualList.isScrollingToIndex(firstScroll)).toBe(true)
      expect(VirtualList.scrollTopOf(firstScroll)).toBe(600)

      const secondScroll = fold(
        [VirtualList.ScrollToIndex({ index: 40, align: 'Center' })],
        baseProps,
        firstScroll,
      )
      expect(VirtualList.pendingScrollVersionOf(secondScroll)).toBe(2)
      expect(VirtualList.scrollTopOf(secondScroll)).toBe(1065)

      // Stale completion for version 1 is ignored
      const afterStale = fold(
        [VirtualList.CompletedApplyScroll({ version: 1 })],
        baseProps,
        secondScroll,
      )
      expect(VirtualList.isScrollingToIndex(afterStale)).toBe(true)

      // Matching completion clears pendingScroll to Idle
      const afterCurrent = fold(
        [VirtualList.CompletedApplyScroll({ version: 2 })],
        baseProps,
        afterStale,
      )
      expect(VirtualList.isScrollingToIndex(afterCurrent)).toBe(false)

      // ScrollToBottom and ScrollToTop jump to the boundaries
      const atBottom = fold(
        [VirtualList.ScrollToBottom()],
        baseProps,
        afterCurrent,
      )
      expect(VirtualList.scrollTopOf(atBottom)).toBe(2700)
      const atTop = fold([VirtualList.ScrollToTop()], baseProps, atBottom)
      expect(VirtualList.scrollTopOf(atTop)).toBe(0)

      // Initial non-zero scrollTop schedules a pending restore on first measurement
      const restored = fold(
        [VirtualList.MeasuredViewport({ containerHeight: 300 })],
        baseProps,
        VirtualList.initialAt(600),
      )
      expect(VirtualList.isScrollingToIndex(restored)).toBe(true)
      expect(VirtualList.pendingScrollVersionOf(restored)).toBe(1)
    })
  })

  describe('slots, reference stability, sync, rest, and Part.compose', () => {
    it('projects reference-stable SlotBindings for Viewport, Content, and Item', () => {
      const initialView = Part.view(
        VirtualList.part,
        VirtualList.initial,
        baseProps,
      )
      expect(
        Part.view(VirtualList.part, VirtualList.initial, { ...baseProps }),
      ).toBe(initialView)

      const viewportAria = Slot.ariaOf(initialView.slot('Viewport'))
      expect(viewportAria['role']).toBe('region')
      expect(viewportAria['id']).toBe('rows-viewport')
      expect(viewportAria['aria-label']).toBe('Audit log')
      expect(viewportAria['aria-valuemin']).toBe('0')
      expect(viewportAria['aria-valuemax']).toBe('3000')
      expect(viewportAria['aria-valuenow']).toBe('0')

      expect(Slot.ariaOf(initialView.slot('Content'))['hidden']).toBe('')
      const itemZeroBefore = initialView.slot('Item', '0')
      expect(Slot.ariaOf(itemZeroBefore)['role']).toBe('option')
      expect(Slot.ariaOf(itemZeroBefore)['aria-current']).toBe('false')

      const measuredAndScrolled = fold([
        VirtualList.MeasuredViewport({ containerHeight: 300 }),
        VirtualList.ScrollToIndex({ index: 20 }),
      ])
      const activeView = Part.view(
        VirtualList.part,
        measuredAndScrolled,
        baseProps,
      )
      expect(Slot.ariaOf(activeView.slot('Viewport'))['aria-valuenow']).toBe(
        '600',
      )
      expect(Slot.ariaOf(activeView.slot('Content'))['hidden']).toBeUndefined()
      expect(Slot.ariaOf(activeView.slot('Item', '20'))['aria-current']).toBe(
        'true',
      )
      expect(activeView.slot('Item', '0')).toBe(itemZeroBefore)
    })

    it('clears pendingScroll in atRest and composes cleanly in synced and deviceOnly modes', () => {
      const scrolling = fold([
        VirtualList.MeasuredViewport({ containerHeight: 300 }),
        VirtualList.ScrollToIndex({ index: 15 }),
      ])
      const rested = VirtualList.atRest(scrolling)
      expect(VirtualList.isMeasured(rested)).toBe(true)
      expect(VirtualList.scrollTopOf(rested)).toBe(450)
      expect(VirtualList.isScrollingToIndex(rested)).toBe(false)

      expect(VirtualList.synced.ScrollToIndex).toEqual(Synced())
      expect(VirtualList.deviceSync('OwnView').ScrollToIndex).toEqual(
        Device({ because: 'OwnView' }),
      )

      const KeepCount = Catalog.action('KeepCount', {
        what: 'Keeps the row count unchanged',
        why: 'To verify local part composition in a minimal Program',
        meta: { label: 'Keep count', keys: [] },
      })
      const Base = makeProgram({
        id: 'virtual-list-compose-test',
        version: 1,
        Model: S.Struct({ count: S.Number }),
        Message: Catalog.make([KeepCount]).Message,
        init: () => [{ count: 100 }, []],
        update: (model: Readonly<{ count: number }>) => [model, []],
      })
      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(VirtualList.deviceOnly(), () => baseProps)],
      })
      const [localModel] = LocalApp.init()
      expect(S.encodeUnknownSync(LocalApp.Model)(localModel)).toEqual({
        count: 100,
      })
    })
  })
})
