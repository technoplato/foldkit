import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Pagination from './pagination.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const defaultProps: Pagination.Props = {
  id: 'results',
  count: 100,
  siblingCount: 1,
  boundaryCount: 1,
}

const step = (
  state: Pagination.State,
  message: Pagination.Message,
  props: Pagination.Props = defaultProps,
): Pagination.State => Pagination.chart.transition(state, message, props)[0]

describe('Pagination Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'Pagination', chart: Pagination.chart }),
    ).toEqual([])
    expect(Part.problemsOf(Pagination.part)).toEqual([])
    expect(Pagination.part.category).toBe('Navigation')
    expect(
      Part.problemsOf(
        Pagination.make({
          name: 'CatalogPages',
          defaultPage: 2,
          defaultPageSize: 20,
        }),
      ),
    ).toEqual([])
    expect(Part.problemsOf(Pagination.deviceOnly())).toEqual([])

    Pagination.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('computes totalPagesOf, sliceRangeOf, sliceOf, and pageRangeOf with ellipses', () => {
    expect(Pagination.totalPagesOf(Pagination.initial, defaultProps)).toBe(10)
    expect(Pagination.totalPagesOf(Pagination.initial, { count: 0 })).toBe(0)
    expect(Pagination.totalPagesOf(Pagination.initial, { count: 25 })).toBe(3)

    // Slice ranges
    expect(
      Pagination.sliceRangeOf(Pagination.initialPage(1, 10), { count: 25 }),
    ).toEqual({ startIndex: 0, endIndex: 10 })
    expect(
      Pagination.sliceRangeOf(Pagination.initialPage(3, 10), { count: 25 }),
    ).toEqual({ startIndex: 20, endIndex: 25 })
    expect(
      Pagination.sliceRangeOf(Pagination.initialPage(1, 10), { count: 0 }),
    ).toEqual({ startIndex: 0, endIndex: 0 })
    expect(
      Pagination.sliceOf(
        ['a', 'b', 'c', 'd', 'e'],
        Pagination.initialPage(2, 2),
      ),
    ).toEqual(['c', 'd'])

    // Page range on page 1 of 10: [1, 2, 3, 4, 5, ellipsis-end, 10]
    expect(
      Pagination.pageRangeOf(Pagination.initialPage(1, 10), defaultProps),
    ).toEqual([
      Pagination.Page({ value: 1 }),
      Pagination.Page({ value: 2 }),
      Pagination.Page({ value: 3 }),
      Pagination.Page({ value: 4 }),
      Pagination.Page({ value: 5 }),
      Pagination.Ellipsis({ key: Pagination.endEllipsisKey }),
      Pagination.Page({ value: 10 }),
    ])

    // Page range on middle page 5 of 10: [1, ellipsis-start, 4, 5, 6, ellipsis-end, 10]
    expect(
      Pagination.pageRangeOf(Pagination.initialPage(5, 10), defaultProps),
    ).toEqual([
      Pagination.Page({ value: 1 }),
      Pagination.Ellipsis({ key: Pagination.startEllipsisKey }),
      Pagination.Page({ value: 4 }),
      Pagination.Page({ value: 5 }),
      Pagination.Page({ value: 6 }),
      Pagination.Ellipsis({ key: Pagination.endEllipsisKey }),
      Pagination.Page({ value: 10 }),
    ])

    // Page range on last page 10 of 10: [1, ellipsis-start, 6, 7, 8, 9, 10]
    expect(
      Pagination.pageRangeOf(Pagination.initialPage(10, 10), defaultProps),
    ).toEqual([
      Pagination.Page({ value: 1 }),
      Pagination.Ellipsis({ key: Pagination.startEllipsisKey }),
      Pagination.Page({ value: 6 }),
      Pagination.Page({ value: 7 }),
      Pagination.Page({ value: 8 }),
      Pagination.Page({ value: 9 }),
      Pagination.Page({ value: 10 }),
    ])

    // Small totalPages needs no ellipsis
    expect(
      Pagination.pageRangeOf(Pagination.initialPage(2, 10), { count: 50 }),
    ).toEqual([
      Pagination.Page({ value: 1 }),
      Pagination.Page({ value: 2 }),
      Pagination.Page({ value: 3 }),
      Pagination.Page({ value: 4 }),
      Pagination.Page({ value: 5 }),
    ])

    // Empty count yields empty range
    expect(Pagination.pageRangeOf(Pagination.initial, { count: 0 })).toEqual([])
  })

  it('handles next, prev, first, last, goToPage, setPageSize, bounds clamping, and disabled guards', () => {
    expect(Pagination.canGoPrev(Pagination.initial, defaultProps)).toBe(false)
    expect(Pagination.canGoNext(Pagination.initial, defaultProps)).toBe(true)
    expect(Pagination.previousPageOf(Pagination.initial, defaultProps)).toEqual(
      Option.none(),
    )
    expect(Pagination.nextPageOf(Pagination.initial, defaultProps)).toEqual(
      Option.some(2),
    )

    // Pure helpers + chart actions
    const p2 = step(Pagination.initial, Pagination.NextPage())
    expect(p2.page).toBe(2)
    expect(Pagination.prev(p2, defaultProps).page).toBe(1)

    const pLast = step(p2, Pagination.LastPage())
    expect(pLast.page).toBe(10)
    expect(Pagination.canGoNext(pLast, defaultProps)).toBe(false)
    expect(step(pLast, Pagination.NextPage())).toEqual(pLast)

    const pFirst = step(pLast, Pagination.FirstPage())
    expect(pFirst.page).toBe(1)
    expect(step(pFirst, Pagination.PrevPage())).toEqual(pFirst)

    // Bounds clamping on GoToPage
    expect(step(pFirst, Pagination.GoToPage({ page: 999 })).page).toBe(10)
    expect(step(pLast, Pagination.GoToPage({ page: -5 })).page).toBe(1)

    // setPageSize clamps active page when totalPages shrinks
    const resized = step(pLast, Pagination.SetPageSize({ pageSize: 25 }))
    expect(resized.pageSize).toBe(25)
    expect(resized.page).toBe(4)

    // Invalid pageSize ignored
    expect(step(resized, Pagination.SetPageSize({ pageSize: 0 }))).toEqual(
      resized,
    )

    // Reset restores defaults
    const reset = step(resized, Pagination.ResetPagination(), {
      ...defaultProps,
      defaultPage: 3,
      defaultPageSize: 20,
    })
    expect(reset).toEqual(Pagination.Active({ page: 3, pageSize: 20 }))

    // Disabled guard blocks every navigation change
    const disabledProps: Pagination.Props = {
      ...defaultProps,
      isDisabled: true,
    }
    expect(step(p2, Pagination.NextPage(), disabledProps)).toEqual(p2)
    expect(step(p2, Pagination.PrevPage(), disabledProps)).toEqual(p2)
    expect(step(p2, Pagination.GoToPage({ page: 5 }), disabledProps)).toEqual(
      p2,
    )
    expect(
      step(p2, Pagination.SetPageSize({ pageSize: 25 }), disabledProps),
    ).toEqual(p2)
  })

  it('declares sync, atRest, JSON round-trip, and reference-stable SlotBindings', () => {
    expect(Pagination.synced.GoToPage).toEqual(Pace.Synced())
    expect(Pagination.deviceSync().GoToPage).toEqual(
      Pace.Device({ because: 'OwnView' }),
    )

    const p5 = Pagination.initialPage(5, 10)
    expect(Pagination.atRest(p5)).toBe(p5)

    const encoded = S.encodeSync(Pagination.State)(p5)
    expect(S.decodeUnknownSync(Pagination.State)(encoded)).toEqual(p5)

    const view1 = Part.view(Pagination.part, p5, defaultProps)
    const view2 = Part.view(Pagination.part, p5, { ...defaultProps })
    expect(view1).toBe(view2)
    expect(view1.slot('PageButton', '5')).toBe(view2.slot('PageButton', '5'))

    expect(Slot.ariaOf(view1.slot('Root'))['role']).toBe('region')
    expect(Slot.ariaOf(view1.slot('PrevButton'))['aria-disabled']).toBe('false')
    expect(Slot.ariaOf(view1.slot('NextButton'))['aria-disabled']).toBe('false')
    expect(Slot.ariaOf(view1.slot('PageButton', '5'))['aria-current']).toBe(
      'true',
    )
    expect(Slot.ariaOf(view1.slot('PageButton', '4'))['aria-current']).toBe(
      'false',
    )
    expect(
      Slot.ariaOf(view1.slot('Ellipsis', Pagination.startEllipsisKey))['id'],
    ).toBe('results-ellipsis-start')

    const root1 = view1.slot('Root')
    const page1 = view1.slot('PageButton', '1')
    const page6 = view1.slot('PageButton', '6')
    const p6 = step(p5, Pagination.NextPage())
    const view3 = Part.view(Pagination.part, p6, defaultProps)
    expect(view3.slot('Root')).toBe(root1)
    expect(view3.slot('PageButton', '1')).toBe(page1)
    expect(view3.slot('PageButton', '6')).not.toBe(page6)
  })
})
