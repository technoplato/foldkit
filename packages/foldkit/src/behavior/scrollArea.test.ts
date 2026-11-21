import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as ScrollArea from './scrollArea.js'
import * as Slot from './slot.js'
import * as TimedHint from './timedHint.js'

const baseProps: ScrollArea.Props = {
  id: 'feed-scroll',
  orientation: 'Vertical',
  scrollbarVisibility: 'Scroll',
  scrollHideDelayMs: 600,
  minThumbPx: 20,
}

const initialOverflow = ScrollArea.initialMeasured({
  viewportSize: 200,
  contentSize: 1000,
  scrollOffset: 0,
})

describe('ScrollArea Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'ScrollArea', chart: ScrollArea.chart }),
    ).toEqual([])
    expect(Part.problemsOf(ScrollArea.part)).toEqual([])
    expect(
      Part.problemsOf(
        ScrollArea.make({ viewportSize: 200, contentSize: 1000, sampleMs: 80 }),
      ),
    ).toEqual([])
    expect(Part.problemsOf(ScrollArea.deviceOnly())).toEqual([])

    ScrollArea.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('computes pure thumbGeometryOf and scrollOffsetFromThumbDrag with minThumbPx clamping', () => {
    expect(ScrollArea.viewportId('feed')).toBe('feed-viewport')
    expect(ScrollArea.scrollbarId('feed')).toBe('feed-scrollbar')
    expect(ScrollArea.thumbId('feed')).toBe('feed-thumb')

    const mid = ScrollArea.thumbGeometryOf({
      viewportSize: 200,
      contentSize: 1000,
      scrollOffset: 400,
    })
    expect(mid).toEqual({
      hasOverflow: true,
      thumbLengthPx: 40,
      thumbLengthRatio: 0.2,
      thumbOffsetPx: 80,
      thumbOffsetRatio: 0.4,
      maxScrollOffset: 800,
      maxThumbOffsetPx: 160,
    })

    // Very tall content clamps thumb length to minThumbPx (20)
    const clamped = ScrollArea.thumbGeometryOf({
      viewportSize: 200,
      contentSize: 10000,
      scrollOffset: 4900,
      minThumbPx: 20,
    })
    expect(clamped.hasOverflow).toBe(true)
    expect(clamped.thumbLengthPx).toBe(20)
    expect(clamped.thumbLengthRatio).toBe(0.1)
    expect(clamped.maxThumbOffsetPx).toBe(180)
    expect(clamped.thumbOffsetPx).toBe(90)

    // No overflow
    const noOverflow = ScrollArea.thumbGeometryOf({
      viewportSize: 200,
      contentSize: 150,
      scrollOffset: 0,
    })
    expect(noOverflow.hasOverflow).toBe(false)
    expect(noOverflow.maxScrollOffset).toBe(0)

    // Inverse thumb drag mapping
    expect(
      ScrollArea.scrollOffsetFromThumbDrag({
        startScrollOffset: 0,
        deltaPx: 80,
        viewportSize: 200,
        contentSize: 1000,
      }),
    ).toBe(400)
    expect(
      ScrollArea.scrollOffsetFromThumbDrag({
        startScrollOffset: 400,
        deltaPx: 500,
        viewportSize: 200,
        contentSize: 1000,
      }),
    ).toBe(800)
    expect(
      ScrollArea.scrollOffsetFromThumbDrag({
        startScrollOffset: 200,
        deltaPx: -500,
        viewportSize: 200,
        contentSize: 1000,
      }),
    ).toBe(0)
  })

  it('auto-hides scrollbar via TimedHint and WaitForScrollbarHide while rejecting stale versions', () => {
    expect(ScrollArea.isScrollbarVisible(initialOverflow, baseProps)).toBe(
      false,
    )

    const [scrolling, scrollCommands] = ScrollArea.chart.transition(
      initialOverflow,
      ScrollArea.ObserveScrollOffset({ scrollOffset: 250 }),
      baseProps,
    )
    expect(ScrollArea.isScrolling(scrolling)).toBe(true)
    expect(scrolling.scrollOffset).toBe(250)
    expect(ScrollArea.isScrollbarVisible(scrolling, baseProps)).toBe(true)
    expect(scrollCommands).toHaveLength(1)
    expect(scrollCommands[0]?.name).toBe('WaitForScrollbarHide')
    const firstVersion = TimedHint.versionOf(scrolling.hideHint)

    // Hover pauses the countdown (bumps version); stale elapsed is ignored
    const [hovered] = ScrollArea.chart.transition(
      scrolling,
      ScrollArea.HoverScrollArea(),
      baseProps,
    )
    const [afterStale] = ScrollArea.chart.transition(
      hovered,
      ScrollArea.ElapsedScrollbarHide({ version: firstVersion }),
      baseProps,
    )
    expect(ScrollArea.isScrolling(afterStale)).toBe(true)

    // Leaving resumes countdown with a fresh WaitForScrollbarHide command
    const [resumed, resumeCommands] = ScrollArea.chart.transition(
      hovered,
      ScrollArea.LeaveScrollArea(),
      baseProps,
    )
    expect(resumeCommands).toHaveLength(1)
    const resumedVersion = TimedHint.versionOf(resumed.hideHint)
    expect(resumedVersion).toBeGreaterThan(firstVersion)

    // Matching version returns to Idle and hides Scroll-mode scrollbar
    const [hidden] = ScrollArea.chart.transition(
      resumed,
      ScrollArea.ElapsedScrollbarHide({ version: resumedVersion }),
      baseProps,
    )
    expect(ScrollArea.isIdle(hidden)).toBe(true)
    expect(ScrollArea.isScrollbarVisible(hidden, baseProps)).toBe(false)
  })

  it('composes PointerDrag for thumb dragging, release countdown, and cancel rollback', () => {
    const [dragging] = ScrollArea.chart.transition(
      initialOverflow,
      ScrollArea.BeginThumbDrag({ pointerId: 1, x: 0, y: 10 }),
      baseProps,
    )
    expect(ScrollArea.isDraggingThumb(dragging)).toBe(true)
    expect(ScrollArea.isScrollbarVisible(dragging, baseProps)).toBe(true)

    // Move by +80px vertically -> scrollOffset becomes 400
    const [moved] = ScrollArea.chart.transition(
      dragging,
      ScrollArea.MoveThumbDrag({ pointerId: 1, x: 0, y: 90 }),
      baseProps,
    )
    expect(moved.scrollOffset).toBe(400)

    // Non-matching pointer is ignored
    const [ignoredMove] = ScrollArea.chart.transition(
      moved,
      ScrollArea.MoveThumbDrag({ pointerId: 2, x: 0, y: 200 }),
      baseProps,
    )
    expect(ignoredMove.scrollOffset).toBe(400)

    // Cancel restores origin scrollOffset (0)
    const [cancelled] = ScrollArea.chart.transition(
      moved,
      ScrollArea.CancelThumbDrag({ pointerId: 1 }),
      baseProps,
    )
    expect(ScrollArea.isIdle(cancelled)).toBe(true)
    expect(cancelled.scrollOffset).toBe(0)

    // Drag and release commits and enters Scrolling with hide command
    const [dragging2] = ScrollArea.chart.transition(
      initialOverflow,
      ScrollArea.BeginThumbDrag({ pointerId: 3, x: 0, y: 0 }),
      baseProps,
    )
    const [moved2] = ScrollArea.chart.transition(
      dragging2,
      ScrollArea.MoveThumbDrag({ pointerId: 3, x: 0, y: 40 }),
      baseProps,
    )
    const [released, releaseCommands] = ScrollArea.chart.transition(
      moved2,
      ScrollArea.EndThumbDrag({ pointerId: 3 }),
      baseProps,
    )
    expect(ScrollArea.isScrolling(released)).toBe(true)
    expect(released.scrollOffset).toBe(200)
    expect(releaseCommands).toHaveLength(1)
  })

  it('honors all four scrollbarVisibility modes (Always, Auto, Scroll, Hover)', () => {
    const noOverflow = ScrollArea.initialMeasured({
      viewportSize: 300,
      contentSize: 200,
    })
    expect(
      ScrollArea.isScrollbarVisible(noOverflow, {
        scrollbarVisibility: 'Always',
      }),
    ).toBe(true)
    expect(
      ScrollArea.isScrollbarVisible(noOverflow, {
        scrollbarVisibility: 'Auto',
      }),
    ).toBe(false)
    expect(
      ScrollArea.isScrollbarVisible(initialOverflow, {
        scrollbarVisibility: 'Auto',
      }),
    ).toBe(true)
    expect(
      ScrollArea.isScrollbarVisible(initialOverflow, {
        scrollbarVisibility: 'Hover',
      }),
    ).toBe(false)

    const [hovered] = ScrollArea.chart.transition(
      initialOverflow,
      ScrollArea.HoverScrollArea(),
      { ...baseProps, scrollbarVisibility: 'Hover' },
    )
    expect(
      ScrollArea.isScrollbarVisible(hovered, { scrollbarVisibility: 'Hover' }),
    ).toBe(true)
    expect(
      ScrollArea.isScrollbarVisible(hovered, { scrollbarVisibility: 'Scroll' }),
    ).toBe(false)
  })

  it('projects reference-stable SlotBindings and composes with Sampled drag/scroll sync and atRest', () => {
    const [scrolled] = ScrollArea.chart.transition(
      initialOverflow,
      ScrollArea.ScrollTo({ offset: 300 }),
      baseProps,
    )
    const view1 = Part.view(ScrollArea.part, scrolled, baseProps)
    const view2 = Part.view(ScrollArea.part, scrolled, baseProps)
    expect(view1).toBe(view2)

    const viewportSlot = view1.slot('Viewport')
    const scrollbarSlot = view1.slot('Scrollbar')
    const thumbSlot = view1.slot('Thumb')

    expect(Slot.ariaOf(viewportSlot)).toMatchObject({
      id: 'feed-scroll-viewport',
      role: 'region',
      tabindex: '0',
    })
    expect(Slot.ariaOf(scrollbarSlot)).toMatchObject({
      id: 'feed-scroll-scrollbar',
      role: 'slider',
      'aria-orientation': 'vertical',
      'aria-controls': 'feed-scroll-viewport',
      'aria-valuemin': '0',
      'aria-valuemax': '800',
      'aria-valuenow': '300',
    })
    expect(Slot.ariaOf(scrollbarSlot)['hidden']).toBeUndefined()
    expect(Slot.ariaOf(thumbSlot)['hidden']).toBeUndefined()

    // Scrolling to another offset keeps Viewport binding reference-stable
    const [scrolledMore] = ScrollArea.chart.transition(
      scrolled,
      ScrollArea.ScrollTo({ offset: 500 }),
      baseProps,
    )
    const nextView = Part.view(ScrollArea.part, scrolledMore, baseProps)
    expect(nextView.slot('Viewport')).toBe(viewportSlot)
    expect(nextView.slot('Scrollbar')).not.toBe(scrollbarSlot)

    // atRest returns Idle while keeping scrollOffset and dimensions
    const resting = ScrollArea.atRest(scrolledMore)
    expect(ScrollArea.isIdle(resting)).toBe(true)
    expect(resting.scrollOffset).toBe(500)

    const Base = make({
      id: 'scroll-area-test',
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
      parts: [Part.given(ScrollArea.make({ sampleMs: 60 }), () => baseProps)],
    })
    expect(
      SyncedApp.synchronization?.paceOf?.(
        ScrollArea.MoveThumbDrag({ pointerId: 1, x: 0, y: 20 }),
      ),
    ).toEqual(Pace.Sampled({ everyMs: 60 }))
    expect(
      SyncedApp.synchronization?.paceOf?.(
        ScrollArea.ObserveScrollOffset({ scrollOffset: 50 }),
      ),
    ).toEqual(Pace.Sampled({ everyMs: 60 }))
    expect(
      SyncedApp.synchronization?.paceOf?.(ScrollArea.ScrollTo({ offset: 50 })),
    ).toEqual(Pace.Synced())

    const LocalApp = Part.compose({
      of: Base,
      parts: [Part.given(ScrollArea.deviceOnly(), () => baseProps)],
    })
    expect(
      LocalApp.synchronization?.isLocalOnly?.(
        ScrollArea.ScrollTo({ offset: 50 }),
      ),
    ).toBe(true)
  })
})
