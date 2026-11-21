import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as FocusScope from './focusScope.js'
import * as Layers from './layers.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Popover from './popover.js'
import * as Slot from './slot.js'

const baseProps: Popover.Props = {
  id: 'details',
  focusableIds: ['details-input', 'details-close', 'details-apply'],
}

const modalProps: Popover.Props = {
  ...baseProps,
  isModal: true,
}

const fold = (
  messages: ReadonlyArray<Popover.Message>,
  props: Popover.Props = baseProps,
  from: Popover.State = Popover.initial,
): Popover.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Popover.chart.transition(state, message, props)[0],
  )

describe('core Popover Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Popover.part)).toEqual([])
      expect(Part.problemsOf(Popover.deviceOnly())).toEqual([])
      expect(
        Block.problemsOf({ name: 'Popover', chart: Popover.chart }),
      ).toEqual([])
      for (const action of Popover.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })
  })

  describe('element IDs and pure lifecycle helpers', () => {
    it('derives all six element IDs consistently from the base id', () => {
      expect(Popover.buttonId('filters')).toBe('filters-button')
      expect(Popover.panelId('filters')).toBe('filters-panel')
      expect(Popover.backdropId('filters')).toBe('filters-backdrop')
      expect(Popover.titleId('filters')).toBe('filters-title')
      expect(Popover.descriptionId('filters')).toBe('filters-description')
      expect(Popover.closeButtonId('filters')).toBe('filters-close')
    })

    it('exposes animation visibility, pointer, click, blur, and key decision helpers for thin painters', () => {
      expect(Popover.isLeavingPhase('LeaveStart')).toBe(true)
      expect(Popover.isLeavingPhase('LeaveAnimating')).toBe(true)
      expect(Popover.isLeavingPhase('Idle')).toBe(false)

      expect(Popover.isVisible({ isOpen: false, isLeaving: false })).toBe(false)
      expect(Popover.isVisible({ isOpen: true, isLeaving: false })).toBe(true)
      expect(Popover.isVisible({ isOpen: false, isLeaving: true })).toBe(true)

      expect(Popover.isPrimaryMousePointer('mouse', 0)).toBe(true)
      expect(Popover.isPrimaryMousePointer('mouse', 2)).toBe(false)
      expect(Popover.isPrimaryMousePointer('touch', 0)).toBe(false)

      expect(Popover.isMousePointerType(Option.some('mouse'))).toBe(true)
      expect(Popover.isMousePointerType(Option.some('touch'))).toBe(false)
      expect(Popover.isMousePointerType(Option.none())).toBe(false)

      expect(
        Popover.pointerDownDecision({
          isOpen: false,
          pointerType: 'mouse',
          button: 0,
        }),
      ).toBe('Open')
      expect(
        Popover.pointerDownDecision({
          isOpen: true,
          pointerType: 'mouse',
          button: 0,
        }),
      ).toBe('Close')
      expect(
        Popover.pointerDownDecision({
          isOpen: false,
          pointerType: 'mouse',
          button: 2,
        }),
      ).toBe('RecordOnly')
      expect(
        Popover.pointerDownDecision({
          isOpen: false,
          pointerType: 'touch',
          button: 0,
        }),
      ).toBe('RecordOnly')

      expect(
        Popover.buttonClickDecision({
          isOpen: false,
          maybeLastButtonPointerType: Option.some('mouse'),
        }),
      ).toBe('IgnoreMouseClick')
      expect(
        Popover.buttonClickDecision({
          isOpen: false,
          maybeLastButtonPointerType: Option.some('touch'),
        }),
      ).toBe('Open')
      expect(
        Popover.buttonClickDecision({
          isOpen: true,
          maybeLastButtonPointerType: Option.none(),
        }),
      ).toBe('Close')

      expect(
        Popover.panelBlurDecision({
          isOpen: true,
          contentFocus: false,
          maybeLastButtonPointerType: Option.none(),
        }),
      ).toBe('CloseWithoutFocus')
      expect(
        Popover.panelBlurDecision({
          isOpen: true,
          contentFocus: true,
          maybeLastButtonPointerType: Option.none(),
        }),
      ).toBe('Ignore')
      expect(
        Popover.panelBlurDecision({
          isOpen: true,
          contentFocus: false,
          maybeLastButtonPointerType: Option.some('mouse'),
        }),
      ).toBe('Ignore')
      expect(
        Popover.panelBlurDecision({
          isOpen: false,
          contentFocus: false,
          maybeLastButtonPointerType: Option.none(),
        }),
      ).toBe('Ignore')

      expect(Popover.triggerKeyDecision({ isOpen: false, key: 'Enter' })).toBe(
        'Open',
      )
      expect(Popover.triggerKeyDecision({ isOpen: false, key: ' ' })).toBe(
        'Open',
      )
      expect(
        Popover.triggerKeyDecision({ isOpen: false, key: 'ArrowDown' }),
      ).toBe('Open')
      expect(Popover.triggerKeyDecision({ isOpen: true, key: 'Enter' })).toBe(
        'Close',
      )
      expect(Popover.triggerKeyDecision({ isOpen: true, key: 'Escape' })).toBe(
        'Close',
      )
      expect(Popover.triggerKeyDecision({ isOpen: false, key: 'Escape' })).toBe(
        'Ignore',
      )
      expect(Popover.triggerKeyDecision({ isOpen: false, key: 'a' })).toBe(
        'Ignore',
      )
      expect(Popover.isSpaceScrollKey(' ')).toBe(true)
      expect(Popover.isSpaceScrollKey('Enter')).toBe(false)
      expect(Popover.isEscapeKey('Escape')).toBe(true)
      expect(Popover.isEscapeKey('Tab')).toBe(false)
    })
  })

  describe('open, close, toggle, and disabled trigger', () => {
    it('opens, resolves initial focus, closes, and restores focus to trigger button by default', () => {
      const opened = fold([Popover.OpenPopover()])
      expect(Popover.isOpen(opened)).toBe(true)
      expect(Popover.focusedIdOf(opened)).toEqual(Option.some('details-input'))
      expect(Popover.previouslyFocusedIdOf(opened)).toEqual(
        Option.some('details-button'),
      )
      expect(Popover.returnFocusIdOf(opened)).toEqual(Option.none())

      const closed = fold([Popover.ClosePopover()], baseProps, opened)
      expect(Popover.isOpen(closed)).toBe(false)
      expect(Popover.returnFocusIdOf(closed)).toEqual(
        Option.some('details-button'),
      )
    })

    it('toggles between Closed and Open via TogglePopover', () => {
      const opened = fold([Popover.TogglePopover()])
      expect(Popover.isOpen(opened)).toBe(true)

      const closed = fold([Popover.TogglePopover()], baseProps, opened)
      expect(Popover.isOpen(closed)).toBe(false)
      expect(Popover.returnFocusIdOf(closed)).toEqual(
        Option.some('details-button'),
      )
    })

    it('records trigger value and explicit previously focused ID on OpenedPopover', () => {
      const opened = fold([
        Popover.OpenedPopover({
          maybeTriggerValue: Option.some('row-42'),
          maybePreviouslyFocusedId: Option.some('row-42-trigger'),
        }),
      ])
      expect(Popover.triggerValueOf(opened)).toEqual(Option.some('row-42'))
      expect(Popover.previouslyFocusedIdOf(opened)).toEqual(
        Option.some('row-42-trigger'),
      )

      const switched = fold(
        [
          Popover.OpenedPopover({
            maybeTriggerValue: Option.some('row-99'),
            maybePreviouslyFocusedId: Option.some('row-99-trigger'),
          }),
        ],
        baseProps,
        opened,
      )
      expect(Popover.triggerValueOf(switched)).toEqual(Option.some('row-99'))

      const closed = fold([Popover.ClosePopover()], baseProps, switched)
      expect(Popover.returnFocusIdOf(closed)).toEqual(
        Option.some('row-99-trigger'),
      )
    })

    it('refuses opening when isDisabled is true', () => {
      const disabledProps: Popover.Props = { ...baseProps, isDisabled: true }
      expect(Popover.isOpen(fold([Popover.OpenPopover()], disabledProps))).toBe(
        false,
      )
      expect(
        Popover.isOpen(fold([Popover.TogglePopover()], disabledProps)),
      ).toBe(false)
      expect(
        Popover.isOpen(
          fold(
            [
              Popover.PressedPointerOnButton({
                pointerType: 'mouse',
                button: 0,
              }),
            ],
            disabledProps,
          ),
        ),
      ).toBe(false)
      expect(
        Popover.isOpen(
          fold([Popover.PressedTriggerKey({ key: 'Enter' })], disabledProps),
        ),
      ).toBe(false)
    })
  })

  describe('mouse pointer-down toggle and click/blur suppression', () => {
    it('opens on primary mouse pointer-down, suppresses following click and blur, then clears pointer type', () => {
      const opened = fold([
        Popover.PressedPointerOnButton({ pointerType: 'mouse', button: 0 }),
      ])
      expect(Popover.isOpen(opened)).toBe(true)
      expect(Popover.lastButtonPointerTypeOf(opened)).toEqual(
        Option.some('mouse'),
      )

      // Blur caused by mousedown on trigger does not close while mouse pointer type is active
      const afterBlur = fold([Popover.BlurredPopoverPanel()], baseProps, opened)
      expect(Popover.isOpen(afterBlur)).toBe(true)

      // Following mouse click is suppressed and clears maybeLastButtonPointerType
      const afterClick = fold(
        [Popover.ClickedPopoverButton()],
        baseProps,
        afterBlur,
      )
      expect(Popover.isOpen(afterClick)).toBe(true)
      expect(Popover.lastButtonPointerTypeOf(afterClick)).toEqual(Option.none())
    })

    it('closes on primary mouse pointer-down while open, preserves pointer type until IgnoredMouseClick', () => {
      const opened = fold([Popover.OpenPopover()])
      const closed = fold(
        [Popover.PressedPointerOnButton({ pointerType: 'mouse', button: 0 })],
        baseProps,
        opened,
      )
      expect(Popover.isOpen(closed)).toBe(false)
      expect(Popover.returnFocusIdOf(closed)).toEqual(
        Option.some('details-button'),
      )
      expect(Popover.lastButtonPointerTypeOf(closed)).toEqual(
        Option.some('mouse'),
      )

      // Following click does NOT immediately reopen
      const afterClick = fold(
        [Popover.ClickedPopoverButton()],
        baseProps,
        closed,
      )
      expect(Popover.isOpen(afterClick)).toBe(false)
      expect(Popover.lastButtonPointerTypeOf(afterClick)).toEqual(Option.none())

      // Explicit IgnoredMouseClick also clears maybeLastButtonPointerType
      const reopened = fold([
        Popover.PressedPointerOnButton({ pointerType: 'mouse', button: 0 }),
      ])
      const cleared = fold([Popover.IgnoredMouseClick()], baseProps, reopened)
      expect(Popover.isOpen(cleared)).toBe(true)
      expect(Popover.lastButtonPointerTypeOf(cleared)).toEqual(Option.none())
    })

    it('records touch, pen, and right-click pointer-down without toggling; touch toggles on click', () => {
      const afterTouchDown = fold([
        Popover.PressedPointerOnButton({ pointerType: 'touch', button: 0 }),
      ])
      expect(Popover.isOpen(afterTouchDown)).toBe(false)
      expect(Popover.lastButtonPointerTypeOf(afterTouchDown)).toEqual(
        Option.some('touch'),
      )

      const afterTouchClick = fold(
        [Popover.ClickedPopoverButton()],
        baseProps,
        afterTouchDown,
      )
      expect(Popover.isOpen(afterTouchClick)).toBe(true)
      expect(Popover.lastButtonPointerTypeOf(afterTouchClick)).toEqual(
        Option.none(),
      )

      const afterRightClick = fold(
        [Popover.PressedPointerOnButton({ pointerType: 'mouse', button: 2 })],
        baseProps,
        afterTouchClick,
      )
      expect(Popover.isOpen(afterRightClick)).toBe(true)
      expect(Popover.lastButtonPointerTypeOf(afterRightClick)).toEqual(
        Option.some('mouse'),
      )
    })
  })

  describe('panel blur dismissal and contentFocus mode', () => {
    it('closes on BlurredPopoverPanel without returning focus to the trigger button', () => {
      const opened = fold([Popover.OpenPopover()])
      const blurred = fold([Popover.BlurredPopoverPanel()], baseProps, opened)
      expect(Popover.isOpen(blurred)).toBe(false)
      expect(Popover.returnFocusIdOf(blurred)).toEqual(Option.none())
      expect(Popover.lastButtonPointerTypeOf(blurred)).toEqual(Option.none())
    })

    it('keeps popover open on BlurredPopoverPanel and defers auto-focus when contentFocus is true', () => {
      const contentFocusProps: Popover.Props = {
        ...baseProps,
        contentFocus: true,
      }
      const opened = fold([Popover.OpenPopover()], contentFocusProps)
      expect(Popover.isOpen(opened)).toBe(true)
      expect(Popover.focusedIdOf(opened)).toEqual(Option.none())

      const blurred = fold(
        [Popover.BlurredPopoverPanel()],
        contentFocusProps,
        opened,
      )
      expect(Popover.isOpen(blurred)).toBe(true)

      const hygiene = Popover.hygieneOf(opened, contentFocusProps)
      expect(hygiene.isPanelFocusable).toBe(false)
      expect(hygiene.closesOnPanelBlur).toBe(false)
    })
  })

  describe('modal vs non-modal hygiene and defaults', () => {
    it('defaults to non-modal (no scroll lock, no inert others, no focus trap)', () => {
      const opened = fold([Popover.OpenPopover()], baseProps)
      expect(Popover.hygieneOf(opened, baseProps)).toEqual({
        shouldLockScroll: false,
        shouldInertOthers: false,
        isOutsidePointerBlocked: false,
        isTrappingFocus: false,
        isFocusPaused: false,
        isPanelFocusable: true,
        closesOnPanelBlur: true,
        maybeFocusedId: Option.some('details-input'),
        maybeReturnFocusId: Option.none(),
      })

      const closed = fold([Popover.ClosePopover()], baseProps, opened)
      expect(Popover.hygieneOf(closed, baseProps)).toEqual({
        shouldLockScroll: false,
        shouldInertOthers: false,
        isOutsidePointerBlocked: false,
        isTrappingFocus: false,
        isFocusPaused: false,
        isPanelFocusable: true,
        closesOnPanelBlur: false,
        maybeFocusedId: Option.none(),
        maybeReturnFocusId: Option.some('details-button'),
      })
    })

    it('enables scroll lock, inert others, pointer blocking, and focus trap when isModal is true', () => {
      const opened = fold([Popover.OpenPopover()], modalProps)
      expect(Popover.hygieneOf(opened, modalProps)).toEqual({
        shouldLockScroll: true,
        shouldInertOthers: true,
        isOutsidePointerBlocked: true,
        isTrappingFocus: true,
        isFocusPaused: false,
        isPanelFocusable: true,
        closesOnPanelBlur: true,
        maybeFocusedId: Option.some('details-input'),
        maybeReturnFocusId: Option.none(),
      })
    })
  })

  describe('layer-aware Escape and outside-press dismissal', () => {
    it('dismisses on Escape and outside press when topmost, and refuses when buried beneath another layer', () => {
      const opened = fold([Popover.OpenPopover()], baseProps)

      // Topmost -> Escape dismisses and restores focus
      const escaped = fold(
        [Popover.PressedPopoverKey({ key: 'Escape' })],
        baseProps,
        opened,
      )
      expect(Popover.isOpen(escaped)).toBe(false)
      expect(Popover.returnFocusIdOf(escaped)).toEqual(
        Option.some('details-button'),
      )

      // Buried beneath a nested menu -> Escape and outside press leave popover open
      const buriedProps: Popover.Props = {
        ...baseProps,
        layers: [
          Popover.layerOf(baseProps),
          Layers.layer('nested-menu', { isModal: false }),
        ],
      }
      expect(
        Popover.isOpen(
          fold(
            [Popover.PressedPopoverKey({ key: 'Escape' })],
            buriedProps,
            opened,
          ),
        ),
      ).toBe(true)
      expect(
        Popover.isOpen(fold([Popover.DismissPopover()], buriedProps, opened)),
      ).toBe(true)
      expect(
        Popover.isOpen(
          fold(
            [Popover.PressedOutsidePopover({ insideIds: [] })],
            buriedProps,
            opened,
          ),
        ),
      ).toBe(true)
    })

    it('respects dismissOnEscape: false, dismissOnOutsidePress: false, insideIds, and shouldRestoreFocus: false', () => {
      const guardedProps: Popover.Props = {
        ...baseProps,
        dismissOnEscape: false,
        dismissOnOutsidePress: false,
      }
      const opened = fold([Popover.OpenPopover()], guardedProps)

      expect(
        Popover.isOpen(
          fold(
            [Popover.PressedPopoverKey({ key: 'Escape' })],
            guardedProps,
            opened,
          ),
        ),
      ).toBe(true)
      expect(
        Popover.isOpen(
          fold(
            [Popover.PressedTriggerKey({ key: 'Escape' })],
            guardedProps,
            opened,
          ),
        ),
      ).toBe(true)
      expect(
        Popover.isOpen(fold([Popover.DismissPopover()], guardedProps, opened)),
      ).toBe(true)

      // Press inside the popover's own id does not dismiss
      const openNormal = fold([Popover.OpenPopover()], baseProps)
      expect(
        Popover.isOpen(
          fold(
            [Popover.PressedOutsidePopover({ insideIds: ['details'] })],
            baseProps,
            openNormal,
          ),
        ),
      ).toBe(true)

      // Press outside with shouldRestoreFocus: false closes without restoring focus
      const outsideClosed = fold(
        [
          Popover.PressedOutsidePopover({
            insideIds: [],
            shouldRestoreFocus: false,
          }),
        ],
        baseProps,
        openNormal,
      )
      expect(Popover.isOpen(outsideClosed)).toBe(false)
      expect(Popover.returnFocusIdOf(outsideClosed)).toEqual(Option.none())
    })

    it('opens and closes from trigger keyboard activation (Enter, Space, ArrowDown, Escape)', () => {
      const opened = fold([Popover.PressedTriggerKey({ key: 'ArrowDown' })])
      expect(Popover.isOpen(opened)).toBe(true)

      const closedByEscape = fold(
        [Popover.PressedTriggerKey({ key: 'Escape' })],
        baseProps,
        opened,
      )
      expect(Popover.isOpen(closedByEscape)).toBe(false)

      const openedBySpace = fold([Popover.PressedTriggerKey({ key: ' ' })])
      expect(Popover.isOpen(openedBySpace)).toBe(true)

      const closedByEnter = fold(
        [Popover.PressedTriggerKey({ key: 'Enter' })],
        baseProps,
        openedBySpace,
      )
      expect(Popover.isOpen(closedByEnter)).toBe(false)
    })
  })

  describe('FocusScope trapping, wrapping, reclamation, branches, and unmount', () => {
    it('traps and wraps Tab / Shift+Tab when modal and passes through when non-modal', () => {
      // Non-modal: Tab passes through (focusedId unchanged)
      const openNonModal = fold([Popover.OpenPopover()], baseProps)
      const nonModalTabbed = fold(
        [Popover.PressedPopoverKey({ key: 'Tab' })],
        baseProps,
        openNonModal,
      )
      expect(Popover.focusedIdOf(nonModalTabbed)).toEqual(
        Option.some('details-input'),
      )

      // Modal: Tab steps forward and wraps; Shift+Tab wraps backward
      const openModal = fold([Popover.OpenPopover()], modalProps)
      const step1 = fold(
        [Popover.PressedPopoverKey({ key: 'Tab' })],
        modalProps,
        openModal,
      )
      expect(Popover.focusedIdOf(step1)).toEqual(Option.some('details-close'))

      const step2 = fold(
        [Popover.PressedPopoverKey({ key: 'Tab' })],
        modalProps,
        step1,
      )
      expect(Popover.focusedIdOf(step2)).toEqual(Option.some('details-apply'))

      const wrappedForward = fold(
        [Popover.PressedPopoverKey({ key: 'Tab' })],
        modalProps,
        step2,
      )
      expect(Popover.focusedIdOf(wrappedForward)).toEqual(
        Option.some('details-input'),
      )

      const wrappedBackward = fold(
        [Popover.PressedPopoverKey({ key: 'Tab', shiftKey: true })],
        modalProps,
        wrappedForward,
      )
      expect(Popover.focusedIdOf(wrappedBackward)).toEqual(
        Option.some('details-apply'),
      )
    })

    it('reclaims escaped focus when trapped, allows registered branches, and pauses beneath nested focus scopes', () => {
      const branchedProps: Popover.Props = {
        ...modalProps,
        branches: ['portalled-tooltip'],
      }
      const opened = fold([Popover.OpenPopover()], branchedProps)
      const focusedApply = fold(
        [Popover.FocusedPopoverElement({ targetId: 'details-apply' })],
        branchedProps,
        opened,
      )
      expect(Popover.focusedIdOf(focusedApply)).toEqual(
        Option.some('details-apply'),
      )

      // Escaped focus outside scope is reclaimed to last focused element
      const reclaimed = fold(
        [Popover.FocusedPopoverElement({ targetId: 'outside-nav' })],
        branchedProps,
        focusedApply,
      )
      expect(Popover.focusedIdOf(reclaimed)).toEqual(
        Option.some('details-apply'),
      )

      // Branch element counts as inside scope
      const onBranch = fold(
        [Popover.FocusedPopoverElement({ targetId: 'portalled-tooltip' })],
        branchedProps,
        focusedApply,
      )
      expect(Popover.focusedIdOf(onBranch)).toEqual(
        Option.some('portalled-tooltip'),
      )

      // Paused beneath a nested focus scope -> Tab passes through and outside focus is not reclaimed
      const scope = Option.getOrThrow(
        Popover.focusScopeOf(focusedApply, branchedProps),
      )
      const pausedProps: Popover.Props = {
        ...branchedProps,
        focusScopes: [
          scope,
          FocusScope.scope('child-dialog', { isTrapped: true }),
        ],
      }
      expect(Popover.isFocusScopePaused(focusedApply, pausedProps)).toBe(true)
      const pausedTab = fold(
        [Popover.PressedPopoverKey({ key: 'Tab' })],
        pausedProps,
        focusedApply,
      )
      expect(Popover.focusedIdOf(pausedTab)).toEqual(
        Option.some('details-apply'),
      )
    })

    it('handles UnmountedPopover with restoreFocus overrides and explicit maybeReturnFocusId', () => {
      const propsWithReturn: Popover.Props = {
        ...baseProps,
        maybeReturnFocusId: Option.some('preferred-target'),
      }
      const opened = fold([Popover.OpenPopover()], propsWithReturn)
      const unmountedDefault = fold(
        [Popover.UnmountedPopover({})],
        propsWithReturn,
        opened,
      )
      expect(Popover.isOpen(unmountedDefault)).toBe(false)
      expect(Popover.returnFocusIdOf(unmountedDefault)).toEqual(
        Option.some('preferred-target'),
      )

      const unmountedNoRestore = fold(
        [Popover.UnmountedPopover({ restoreFocus: false })],
        propsWithReturn,
        opened,
      )
      expect(Popover.returnFocusIdOf(unmountedNoRestore)).toEqual(Option.none())
    })
  })

  describe('anchor placement via Placement.place', () => {
    it('places below anchor when room fits, flips above near bottom, and honors placement overrides', () => {
      const below = Popover.placeFor(baseProps, {
        anchor: { left: 200, top: 100, width: 80, height: 32 },
        size: { width: 220, height: 140 },
        view: { width: 1000, height: 800 },
      })
      expect(below).toEqual({ left: 200, top: 140, side: 'Below' })

      const above = Popover.placeFor(baseProps, {
        anchor: { left: 200, top: 700, width: 80, height: 32 },
        size: { width: 220, height: 140 },
        view: { width: 1000, height: 800 },
      })
      expect(above).toEqual({ left: 200, top: 552, side: 'Above' })

      const custom = Popover.placeFor(
        { placement: { gapPx: 12, edgePx: 16 } },
        {
          anchor: { left: 900, top: 100, width: 80, height: 32 },
          size: { width: 220, height: 140 },
          view: { width: 1000, height: 800 },
        },
      )
      expect(custom).toEqual({ left: 764, top: 144, side: 'Below' })
    })
  })

  describe('synchronization defaults and device-only option', () => {
    const DummyModel = S.Struct({ title: S.String })
    const DummyAction = Catalog.action('KeepDummy', {
      what: 'Keeps the title unchanged',
      why: 'To verify part composition',
      meta: { label: 'Keep', keys: [] },
    })
    const dummyCatalog = Catalog.make([DummyAction])
    const BaseProgram = makeProgram({
      id: 'popover-sync-test',
      version: 1,
      Model: DummyModel,
      Message: dummyCatalog.Message,
      init: () => [{ title: 'Filters' }, []],
      update: model => [model, []],
      catalog: dummyCatalog,
    })

    it('syncs Popover state and Messages by default (Navigation category)', () => {
      const SyncedApp = Part.compose({
        of: BaseProgram,
        parts: [Part.given(Popover.part, () => baseProps)],
      })
      const [model] = SyncedApp.init()
      const sync = Option.getOrThrow(
        Option.fromNullishOr(SyncedApp.synchronization),
      )

      expect(sync.messageCategory(Popover.OpenPopover())).toBe('Navigation')
      expect(sync.isLocalOnly?.(Popover.OpenPopover())).toBe(false)
      expect(sync.paceOf?.(Popover.OpenPopover())).toEqual(Synced())
      expect(sync.paceOf?.(Popover.ClosePopover())).toEqual(Synced())

      const encoded = S.encodeUnknownSync(SyncedApp.Model)(model)
      expect(encoded).toMatchObject({
        title: 'Filters',
        parts: { Popover: { _tag: 'Closed' } },
      })
    })

    it('keeps Popover device-only when configured with Popover.deviceOnly() or sync: OwnView', () => {
      const LocalPopover = Popover.deviceOnly({ name: 'LocalPopover' })
      const LocalApp = Part.compose({
        of: BaseProgram,
        parts: [Part.given(LocalPopover, () => baseProps)],
      })
      const [model] = LocalApp.init()
      const sync = Option.getOrThrow(
        Option.fromNullishOr(LocalApp.synchronization),
      )

      expect(sync.isLocalOnly?.(Popover.OpenPopover())).toBe(true)
      expect(sync.paceOf?.(Popover.OpenPopover())).toEqual(
        Device({ because: 'OwnView' }),
      )

      const encoded = S.encodeUnknownSync(LocalApp.Model)(model)
      expect(JSON.stringify(encoded)).not.toContain('LocalPopover')

      const [opened] = LocalApp.update(model, Popover.OpenPopover())
      const kept = sync.keepOnRefold?.(opened, model)
      expect(kept?.parts['LocalPopover']).toEqual(opened.parts['LocalPopover'])
    })
  })

  describe('reference-stable projection, WAI-ARIA, and boxLayerOf', () => {
    it('projects full WAI-ARIA and preserves identical SlotBinding references for untouched slots', () => {
      const popoverPart = Popover.make({ name: 'StablePopover' })
      const opened = fold([Popover.OpenPopover()], modalProps)

      const v1 = Part.view(popoverPart, opened, modalProps)
      const triggerBefore = v1.slot('Trigger')
      const panelBefore = v1.slot('Panel')
      const titleBefore = v1.slot('Title')
      const descriptionBefore = v1.slot('Description')
      const backdropBefore = v1.slot('Backdrop')
      const closeBefore = v1.slot('CloseButton')

      const v2 = Part.view(popoverPart, opened, { ...modalProps })
      expect(v2).toBe(v1)
      expect(v2.slot('Trigger')).toBe(triggerBefore)
      expect(v2.slot('Panel')).toBe(panelBefore)

      expect(Slot.ariaOf(triggerBefore)).toEqual({
        role: 'button',
        id: 'details-button',
        'aria-controls': 'details-panel',
        'aria-haspopup': 'dialog',
        'aria-expanded': 'true',
      })
      expect(Slot.ariaOf(panelBefore)).toEqual({
        role: 'dialog',
        id: 'details-panel',
        'aria-modal': 'true',
        'aria-labelledby': 'details-title',
        'aria-describedby': 'details-description',
        'aria-activedescendant': 'details-input',
      })
      expect(Slot.ariaOf(closeBefore)).toEqual({
        role: 'button',
        id: 'details-close',
        'aria-current': 'false',
      })
      expect(Slot.ariaOf(titleBefore)).toEqual({ id: 'details-title' })
      expect(Slot.ariaOf(descriptionBefore)).toEqual({
        id: 'details-description',
      })
      expect(Slot.ariaOf(backdropBefore)).toEqual({ id: 'details-backdrop' })

      // Moving focus inside popover updates Panel and CloseButton while keeping other slots reference-identical
      const tabbed = fold(
        [Popover.PressedPopoverKey({ key: 'Tab' })],
        modalProps,
        opened,
      )
      const v3 = Part.view(popoverPart, tabbed, modalProps)
      expect(v3).not.toBe(v1)
      expect(v3.slot('Trigger')).toBe(triggerBefore)
      expect(v3.slot('Title')).toBe(titleBefore)
      expect(v3.slot('Description')).toBe(descriptionBefore)
      expect(v3.slot('Backdrop')).toBe(backdropBefore)
      expect(v3.slot('Panel')).not.toBe(panelBefore)
      expect(v3.slot('CloseButton')).not.toBe(closeBefore)
      expect(Slot.ariaOf(v3.slot('Panel'))['aria-activedescendant']).toBe(
        'details-close',
      )
      expect(Slot.ariaOf(v3.slot('CloseButton'))['aria-current']).toBe('true')
    })

    it('projects non-modal aria-modal false, optional title/description omission, and Panel vs Dialog boxLayerOf', () => {
      const nonModalPart = Popover.make({ name: 'NonModalPopover' })
      const nonModalProps: Popover.Props = {
        id: 'info',
        label: 'Info popover',
        hasDescription: false,
      }
      const openedNonModal = fold([Popover.OpenPopover()], nonModalProps)
      const nonModalView = Part.view(
        nonModalPart,
        openedNonModal,
        nonModalProps,
      )

      expect(Slot.ariaOf(nonModalView.slot('Panel'))).toEqual({
        role: 'dialog',
        id: 'info-panel',
        'aria-modal': 'false',
        'aria-label': 'Info popover',
        'aria-activedescendant': 'info-panel',
      })
      expect(Popover.boxLayerOf(nonModalView, nonModalProps)).toEqual({
        layer: {
          kind: 'Panel',
          label: 'Info popover',
          dismissToken: Popover.DismissPopover.tag,
        },
      })

      const modalView = Part.view(
        nonModalPart,
        fold([Popover.OpenPopover()], modalProps),
        modalProps,
      )
      expect(Popover.boxLayerOf(modalView, modalProps)).toEqual({
        layer: {
          kind: 'Dialog',
          label: 'details',
          dismissToken: Popover.DismissPopover.tag,
        },
      })

      const closedView = Part.view(nonModalPart, Popover.initial, nonModalProps)
      expect(Popover.boxLayerOf(closedView, nonModalProps)).toEqual({})
    })
  })
})
