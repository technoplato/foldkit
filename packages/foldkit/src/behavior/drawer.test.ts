import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Drawer from './drawer.js'
import * as FocusScope from './focusScope.js'
import * as Layers from './layers.js'
import { Device, Sampled, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: Drawer.Props = {
  id: 'filters',
  edge: 'Bottom',
  snapPoints: [0.5, 1],
  defaultSnapPoint: 1,
  contentSizePx: 400,
  focusableIds: ['filters-search', 'filters-apply', 'filters-close'],
}

const fold = (
  messages: ReadonlyArray<Drawer.Message>,
  props: Drawer.Props = baseProps,
  from: Drawer.State = Drawer.initial,
): Drawer.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Drawer.chart.transition(state, message, props)[0],
  )

describe('core Drawer Part', () => {
  describe('declaration, chart integrity, IDs, sync paces, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Drawer.part)).toEqual([])
      expect(Part.problemsOf(Drawer.make({ sampleMs: 100 }))).toEqual([])
      expect(Part.problemsOf(Drawer.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Drawer.make({ sync: 'OwnView' }))).toEqual([])
      expect(Block.problemsOf({ name: 'Drawer', chart: Drawer.chart })).toEqual(
        [],
      )

      for (const action of Drawer.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs, edge orientations, and Pace.Sampled drag sync table', () => {
      expect(Drawer.triggerId('filters')).toBe('filters-trigger')
      expect(Drawer.backdropId('filters')).toBe('filters-backdrop')
      expect(Drawer.contentId('filters')).toBe('filters-content')
      expect(Drawer.titleId('filters')).toBe('filters-title')
      expect(Drawer.descriptionId('filters')).toBe('filters-description')
      expect(Drawer.closeButtonId('filters')).toBe('filters-close')
      expect(Drawer.grabberId('filters')).toBe('filters-grabber')

      expect(Drawer.edgeOf({})).toBe('Bottom')
      expect(Drawer.orientationOf({ edge: 'Bottom' })).toBe('Vertical')
      expect(Drawer.orientationOf({ edge: 'Top' })).toBe('Vertical')
      expect(Drawer.orientationOf({ edge: 'Left' })).toBe('Horizontal')
      expect(Drawer.orientationOf({ edge: 'Right' })).toBe('Horizontal')
      expect(Drawer.isInvertedSwipeOf({ edge: 'Bottom' })).toBe(false)
      expect(Drawer.isInvertedSwipeOf({ edge: 'Top' })).toBe(true)
      expect(Drawer.isInvertedSwipeOf({ edge: 'Right' })).toBe(false)
      expect(Drawer.isInvertedSwipeOf({ edge: 'Left' })).toBe(true)

      expect(Drawer.synced.MoveDrawerDrag).toEqual(Sampled({ everyMs: 50 }))
      expect(Drawer.synced.OpenDrawer).toEqual(Synced())
      expect(Drawer.synced.ReleaseDrawerDrag).toEqual(Synced())
      expect(
        Drawer.paceOf(
          Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 120 }),
          100,
        ),
      ).toEqual(Sampled({ everyMs: 100 }))
      expect(Drawer.deviceSync('OwnView').MoveDrawerDrag).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Closed, Open, and Dragging states through Effect Schema JSON encoding', () => {
      const open = fold([Drawer.OpenDrawer()])
      const dragging = fold([
        Drawer.OpenDrawer(),
        Drawer.BeginDrawerDrag({ pointerId: 1, x: 10, y: 100 }),
        Drawer.MoveDrawerDrag({ pointerId: 1, x: 10, y: 180 }),
      ])
      for (const state of [Drawer.initial, open, dragging]) {
        const encoded = S.encodeUnknownSync(Drawer.State)(state)
        const decoded = S.decodeUnknownSync(Drawer.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('open/close, Layers dismissal, and FocusScope trapping/restoration', () => {
    it('opens at defaultSnapPoint, traps Tab/Shift+Tab, reclaims escaped focus, and restores return focus on close', () => {
      const opened = fold([
        Drawer.OpenedDrawer({
          maybeTriggerValue: Option.some('filter-btn'),
          maybePreviouslyFocusedId: Option.some('open-filters-btn'),
        }),
      ])
      expect(Drawer.isOpen(opened)).toBe(true)
      expect(Drawer.dataStateOf(opened)).toBe('open')
      expect(Drawer.activeSnapPointOf(opened)).toEqual(Option.some(1))
      expect(Drawer.focusedIdOf(opened)).toEqual(Option.some('filters-search'))
      expect(Drawer.previouslyFocusedIdOf(opened)).toEqual(
        Option.some('open-filters-btn'),
      )
      expect(Drawer.triggerValueOf(opened)).toEqual(Option.some('filter-btn'))

      const hygiene = Drawer.hygieneOf(opened, baseProps)
      expect(hygiene.shouldLockScroll).toBe(true)
      expect(hygiene.shouldInertOthers).toBe(true)
      expect(hygiene.isOutsidePointerBlocked).toBe(true)
      expect(hygiene.isTrappingFocus).toBe(true)
      expect(hygiene.isDragging).toBe(false)
      expect(hygiene.openPercentage).toBe(1)

      // Tab cycles through focusables and wraps
      const tabbed1 = fold(
        [Drawer.PressedDrawerKey({ key: 'Tab' })],
        baseProps,
        opened,
      )
      expect(Drawer.focusedIdOf(tabbed1)).toEqual(Option.some('filters-apply'))
      const tabbed2 = fold(
        [
          Drawer.PressedDrawerKey({ key: 'Tab' }),
          Drawer.PressedDrawerKey({ key: 'Tab' }),
        ],
        baseProps,
        tabbed1,
      )
      expect(Drawer.focusedIdOf(tabbed2)).toEqual(Option.some('filters-search'))

      // Outside focus is reclaimed to last focused inside scope
      const reclaimed = fold(
        [Drawer.FocusedDrawerElement({ targetId: 'page-header' })],
        baseProps,
        tabbed1,
      )
      expect(Drawer.focusedIdOf(reclaimed)).toEqual(
        Option.some('filters-apply'),
      )

      // Close restores focus to previously focused element
      const closed = fold([Drawer.CloseDrawer()], baseProps, reclaimed)
      expect(Drawer.isOpen(closed)).toBe(false)
      expect(Drawer.returnFocusIdOf(closed)).toEqual(
        Option.some('open-filters-btn'),
      )
    })

    it('honors Layers stack order for Escape and outside press, and pauses FocusScope beneath nested scopes', () => {
      const stackedProps: Drawer.Props = {
        ...baseProps,
        layers: [
          Layers.layer('filters', { isModal: true }),
          Layers.layer('nested-menu'),
        ],
        focusScopes: [
          FocusScope.scope('filters', { containerId: 'filters-content' }),
          FocusScope.scope('nested-dialog', { containerId: 'nested-panel' }),
        ],
      }

      const opened = fold([Drawer.OpenDrawer()], stackedProps)
      expect(Drawer.isFocusScopePaused(opened, stackedProps)).toBe(true)

      // Not topmost layer: Escape, DismissDrawer, and outside press are ignored
      expect(
        Drawer.isOpen(
          fold(
            [Drawer.PressedDrawerKey({ key: 'Escape' })],
            stackedProps,
            opened,
          ),
        ),
      ).toBe(true)
      expect(
        Drawer.isOpen(fold([Drawer.DismissDrawer()], stackedProps, opened)),
      ).toBe(true)
      expect(
        Drawer.isOpen(
          fold(
            [Drawer.PressedOutsideDrawer({ insideIds: [] })],
            stackedProps,
            opened,
          ),
        ),
      ).toBe(true)

      // Topmost layer: Escape and outside press dismiss; inside press does not
      const topOpen = fold([Drawer.OpenDrawer()], baseProps)
      expect(
        Drawer.isOpen(
          fold(
            [Drawer.PressedOutsideDrawer({ insideIds: ['filters'] })],
            baseProps,
            topOpen,
          ),
        ),
      ).toBe(true)
      expect(
        Drawer.isOpen(
          fold(
            [Drawer.PressedOutsideDrawer({ insideIds: [] })],
            baseProps,
            topOpen,
          ),
        ),
      ).toBe(false)
      expect(
        Drawer.isOpen(
          fold(
            [Drawer.PressedDrawerKey({ key: 'Escape' })],
            baseProps,
            topOpen,
          ),
        ),
      ).toBe(false)
    })

    it('blocks outside press on alertdialog drawers by default', () => {
      const alertProps: Drawer.Props = {
        ...baseProps,
        role: 'alertdialog',
      }
      const opened = fold([Drawer.OpenDrawer()], alertProps)
      expect(Drawer.focusedIdOf(opened)).toEqual(Option.some('filters-close'))
      expect(
        Drawer.isOpen(fold([Drawer.DismissDrawer()], alertProps, opened)),
      ).toBe(true)
    })
  })

  describe('snap points, edge swipe axes, swipe-to-dismiss velocity and threshold, and drag cancel', () => {
    it('drags along Bottom edge, snaps to closest snap point on release, and supports SetDrawerSnapPoint', () => {
      const opened = fold([Drawer.OpenDrawer()], baseProps)
      expect(Drawer.activeSnapPointOf(opened)).toEqual(Option.some(1))

      // Drag down 180 px (45% of 400px -> closest to snap point 0.5 at offset 200px)
      const dragging = fold(
        [
          Drawer.BeginDrawerDrag({ pointerId: 1, x: 0, y: 100 }),
          Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 280 }),
        ],
        baseProps,
        opened,
      )
      expect(Drawer.isDragging(dragging)).toBe(true)
      expect(Drawer.dragOffsetPxOf(dragging, baseProps)).toBe(180)
      expect(Drawer.openPercentageOf(dragging, baseProps)).toBeCloseTo(0.55)

      // Other pointerId is ignored
      const ignoredPointer = fold(
        [Drawer.MoveDrawerDrag({ pointerId: 2, x: 0, y: 390 })],
        baseProps,
        dragging,
      )
      expect(Drawer.dragOffsetPxOf(ignoredPointer, baseProps)).toBe(180)

      // Release settles onto snap point 0.5
      const snapped = fold(
        [Drawer.ReleaseDrawerDrag({ pointerId: 1, velocityPxPerSec: 0 })],
        baseProps,
        dragging,
      )
      expect(Drawer.isOpen(snapped)).toBe(true)
      expect(Drawer.isDragging(snapped)).toBe(false)
      expect(Drawer.activeSnapPointOf(snapped)).toEqual(Option.some(0.5))
      expect(Drawer.dragOffsetPxOf(snapped, baseProps)).toBe(200)

      // SetDrawerSnapPoint jumps back to 1
      const expanded = fold(
        [Drawer.SetDrawerSnapPoint({ snapPoint: 1 })],
        baseProps,
        snapped,
      )
      expect(Drawer.activeSnapPointOf(expanded)).toEqual(Option.some(1))
    })

    it('dismisses when drag crosses closeThreshold or swipeVelocityThreshold, and supports all four edges', () => {
      // Bottom drawer: drag past threshold (320px > 300px dismiss threshold for [0.5, 1])
      const dismissedByDistance = fold(
        [
          Drawer.OpenDrawer(),
          Drawer.BeginDrawerDrag({ pointerId: 1, x: 0, y: 0 }),
          Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 320 }),
          Drawer.ReleaseDrawerDrag({ pointerId: 1, velocityPxPerSec: 0 }),
        ],
        baseProps,
      )
      expect(Drawer.isOpen(dismissedByDistance)).toBe(false)

      // High velocity swipe dismisses even on modest displacement
      const singleSnapProps: Drawer.Props = {
        ...baseProps,
        snapPoints: [1],
        swipeVelocityThreshold: 500,
      }
      const dismissedByVelocity = fold(
        [
          Drawer.OpenDrawer(),
          Drawer.BeginDrawerDrag({ pointerId: 1, x: 0, y: 0 }),
          Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 60 }),
          Drawer.ReleaseDrawerDrag({ pointerId: 1, velocityPxPerSec: 700 }),
        ],
        singleSnapProps,
      )
      expect(Drawer.isOpen(dismissedByVelocity)).toBe(false)

      // Left edge dismisses by dragging left (-dx)
      const leftProps: Drawer.Props = {
        ...singleSnapProps,
        edge: 'Left',
      }
      const leftDismissed = fold(
        [
          Drawer.OpenDrawer(),
          Drawer.BeginDrawerDrag({ pointerId: 1, x: 300, y: 0 }),
          Drawer.MoveDrawerDrag({ pointerId: 1, x: 50, y: 0 }),
          Drawer.ReleaseDrawerDrag({ pointerId: 1 }),
        ],
        leftProps,
      )
      expect(Drawer.isOpen(leftDismissed)).toBe(false)

      // Right edge dismisses by dragging right (+dx)
      const rightProps: Drawer.Props = {
        ...singleSnapProps,
        edge: 'Right',
      }
      const rightDismissed = fold(
        [
          Drawer.OpenDrawer(),
          Drawer.BeginDrawerDrag({ pointerId: 1, x: 50, y: 0 }),
          Drawer.MoveDrawerDrag({ pointerId: 1, x: 300, y: 0 }),
          Drawer.ReleaseDrawerDrag({ pointerId: 1 }),
        ],
        rightProps,
      )
      expect(Drawer.isOpen(rightDismissed)).toBe(false)

      // Top edge dismisses by dragging up (-dy)
      const topProps: Drawer.Props = {
        ...singleSnapProps,
        edge: 'Top',
      }
      const topDismissed = fold(
        [
          Drawer.OpenDrawer(),
          Drawer.BeginDrawerDrag({ pointerId: 1, x: 0, y: 300 }),
          Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 50 }),
          Drawer.ReleaseDrawerDrag({ pointerId: 1 }),
        ],
        topProps,
      )
      expect(Drawer.isOpen(topDismissed)).toBe(false)
    })

    it('respects snapToSequentialPoints, isSwipeDismissible: false, CancelDrawerDrag, and atRest', () => {
      const seqProps: Drawer.Props = {
        ...baseProps,
        snapPoints: [0.3, 0.6, 1],
        defaultSnapPoint: 1,
        snapToSequentialPoints: true,
      }
      const stepped = fold(
        [
          Drawer.OpenDrawer(),
          Drawer.BeginDrawerDrag({ pointerId: 1, x: 0, y: 0 }),
          Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 50 }),
          Drawer.ReleaseDrawerDrag({ pointerId: 1, velocityPxPerSec: 600 }),
        ],
        seqProps,
      )
      expect(Drawer.isOpen(stepped)).toBe(true)
      expect(Drawer.activeSnapPointOf(stepped)).toEqual(Option.some(0.6))

      // Non-dismissible drawer snaps to lowest point instead of closing
      const pinnedProps: Drawer.Props = {
        ...baseProps,
        isSwipeDismissible: false,
      }
      const stayedOpen = fold(
        [
          Drawer.OpenDrawer(),
          Drawer.BeginDrawerDrag({ pointerId: 1, x: 0, y: 0 }),
          Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 500 }),
          Drawer.ReleaseDrawerDrag({ pointerId: 1, velocityPxPerSec: 1200 }),
        ],
        pinnedProps,
      )
      expect(Drawer.isOpen(stayedOpen)).toBe(true)
      expect(Drawer.activeSnapPointOf(stayedOpen)).toEqual(Option.some(0.5))

      // CancelDrawerDrag restores originSnapPoint
      const dragging = fold([
        Drawer.OpenDrawer(),
        Drawer.BeginDrawerDrag({ pointerId: 1, x: 0, y: 0 }),
        Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 300 }),
      ])
      const cancelled = fold(
        [Drawer.CancelDrawerDrag({ pointerId: 1 })],
        baseProps,
        dragging,
      )
      expect(Drawer.isOpen(cancelled)).toBe(true)
      expect(Drawer.isDragging(cancelled)).toBe(false)
      expect(Drawer.activeSnapPointOf(cancelled)).toEqual(Option.some(1))

      // atRest always closes
      expect(Drawer.atRest(dragging)).toEqual(Drawer.initial)
    })
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects all 7 slots with reference stability across unchanged renders', () => {
      const closedView1 = Part.view(Drawer.part, Drawer.initial, baseProps)
      const closedView2 = Part.view(Drawer.part, Drawer.initial, baseProps)
      expect(closedView1).toBe(closedView2)

      const triggerClosed = closedView1.slot('Trigger')
      const contentClosed = closedView1.slot('Content')
      const titleClosed = closedView1.slot('Title')
      const grabberClosed = closedView1.slot('Grabber')

      expect(Slot.ariaOf(triggerClosed)).toMatchObject({
        role: 'button',
        id: 'filters-trigger',
        'aria-expanded': 'false',
        'aria-controls': 'filters-content',
        'aria-haspopup': 'dialog',
      })
      expect(Slot.ariaOf(contentClosed)).toMatchObject({
        role: 'dialog',
        id: 'filters-content',
        'aria-modal': 'true',
        'aria-labelledby': 'filters-title',
        'aria-describedby': 'filters-description',
        hidden: '',
      })
      expect(Slot.ariaOf(grabberClosed)).toMatchObject({
        id: 'filters-grabber',
        'aria-orientation': 'vertical',
      })

      const opened = fold([Drawer.OpenDrawer()], baseProps)
      const openView = Part.view(Drawer.part, opened, baseProps)
      expect(openView.slot('Title')).toBe(titleClosed)
      expect(openView.slot('Grabber')).toBe(grabberClosed)
      expect(Slot.ariaOf(openView.slot('Trigger'))['aria-expanded']).toBe(
        'true',
      )
      expect(Slot.ariaOf(openView.slot('Content'))['hidden']).toBeUndefined()
      expect(
        Slot.ariaOf(openView.slot('Content'))['aria-activedescendant'],
      ).toBe('filters-search')
      expect(Slot.ariaOf(openView.slot('Backdrop'))['hidden']).toBeUndefined()
      expect(Slot.ariaOf(openView.slot('CloseButton'))['role']).toBe('button')
      expect(Slot.ariaOf(openView.slot('Description'))['id']).toBe(
        'filters-description',
      )
    })

    it('syncs by default in Part.compose and omits state when deviceOnly', () => {
      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'drawer-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Drawer.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [openSynced] = SyncedApp.update(initSynced, Drawer.OpenDrawer())
      expect(
        SyncedApp.synchronization?.paceOf?.(
          Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 40 }),
        ),
      ).toEqual(Sampled({ everyMs: 50 }))
      expect(
        SyncedApp.synchronization?.messageCategory(Drawer.OpenDrawer()),
      ).toBe('Navigation')
      const encodedSynced = S.encodeUnknownSync(SyncedApp.Model)(openSynced)
      expect(encodedSynced).toHaveProperty('parts.Drawer._tag', 'Open')

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(Drawer.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [openLocal] = LocalApp.update(initLocal, Drawer.OpenDrawer())
      const encodedLocal = S.encodeUnknownSync(LocalApp.Model)(openLocal)
      expect(encodedLocal).not.toHaveProperty('parts')
    })
  })
})
