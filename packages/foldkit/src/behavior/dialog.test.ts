import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Dialog from './dialog.js'
import * as FocusScope from './focusScope.js'
import * as Layers from './layers.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: Dialog.Props = {
  id: 'confirm',
  focusableIds: ['confirm-input', 'confirm-close', 'confirm-submit'],
}

const fold = (
  messages: ReadonlyArray<Dialog.Message>,
  props: Dialog.Props = baseProps,
  from: Dialog.State = Dialog.initial,
): Dialog.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Dialog.chart.transition(state, message, props)[0],
  )

describe('core Dialog Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Dialog.part)).toEqual([])
      expect(Part.problemsOf(Dialog.deviceOnly())).toEqual([])
      expect(Block.problemsOf({ name: 'Dialog', chart: Dialog.chart })).toEqual(
        [],
      )
      for (const action of Dialog.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })
  })

  describe('element IDs and pure lifecycle helpers', () => {
    it('derives all six element IDs consistently from the base id', () => {
      expect(Dialog.titleId('settings')).toBe('settings-dialog-title')
      expect(Dialog.descriptionId('settings')).toBe(
        'settings-dialog-description',
      )
      expect(Dialog.panelId('settings')).toBe('settings-panel')
      expect(Dialog.backdropId('settings')).toBe('settings-backdrop')
      expect(Dialog.triggerId('settings')).toBe('settings-trigger')
      expect(Dialog.closeButtonId('settings')).toBe('settings-close')
    })

    it('exposes open/close/visibility/unmount decision helpers for thin painters', () => {
      expect(Dialog.isLeavingPhase('LeaveStart')).toBe(true)
      expect(Dialog.isLeavingPhase('LeaveAnimating')).toBe(true)
      expect(Dialog.isLeavingPhase('Idle')).toBe(false)

      expect(Dialog.isVisible({ isOpen: false, isLeaving: false })).toBe(false)
      expect(Dialog.isVisible({ isOpen: true, isLeaving: false })).toBe(true)
      expect(Dialog.isVisible({ isOpen: false, isLeaving: true })).toBe(true)

      expect(Dialog.canOpen(false)).toBe(true)
      expect(Dialog.canOpen(true)).toBe(false)

      expect(Dialog.closeDecision({ isOpen: true, isLeaving: true })).toBe(
        'Ignore',
      )
      expect(Dialog.closeDecision({ isOpen: false, isLeaving: true })).toBe(
        'Ignore',
      )
      expect(Dialog.closeDecision({ isOpen: true, isLeaving: false })).toBe(
        'Close',
      )
      expect(Dialog.closeDecision({ isOpen: false, isLeaving: false })).toBe(
        'NoOp',
      )

      expect(
        Dialog.shouldReleaseOnUnmount({
          isOpen: false,
          isTransitionIdle: true,
        }),
      ).toBe(false)
      expect(
        Dialog.shouldReleaseOnUnmount({
          isOpen: true,
          isTransitionIdle: true,
        }),
      ).toBe(true)
      expect(
        Dialog.shouldReleaseOnUnmount({
          isOpen: false,
          isTransitionIdle: false,
        }),
      ).toBe(true)

      expect(
        Dialog.initialFocusSelectorOf(Option.none(), '[data-initial]'),
      ).toBe('[data-initial]')
      expect(
        Dialog.initialFocusSelectorOf(Option.some('#search'), '[data-initial]'),
      ).toBe('#search')
    })
  })

  describe('open, close, toggle, and focus scope lifecycle', () => {
    it('opens, resolves initial focus, closes, and restores return focus to previously focused element', () => {
      const opened = fold([Dialog.OpenDialog()])
      expect(Dialog.isOpen(opened)).toBe(true)
      expect(Dialog.focusedIdOf(opened)).toEqual(Option.some('confirm-input'))
      expect(Dialog.previouslyFocusedIdOf(opened)).toEqual(
        Option.some('confirm-trigger'),
      )
      expect(Dialog.returnFocusIdOf(opened)).toEqual(Option.none())

      const closed = fold([Dialog.CloseDialog()], baseProps, opened)
      expect(Dialog.isOpen(closed)).toBe(false)
      expect(Dialog.returnFocusIdOf(closed)).toEqual(
        Option.some('confirm-trigger'),
      )

      const toggledOpen = fold([Dialog.ToggleDialog()], baseProps, closed)
      expect(Dialog.isOpen(toggledOpen)).toBe(true)
      const toggledClosed = fold(
        [Dialog.ToggleDialog()],
        baseProps,
        toggledOpen,
      )
      expect(Dialog.isOpen(toggledClosed)).toBe(false)
    })

    it('honors explicit initial focus, container fallback, explicit return focus, and restoreFocus: false', () => {
      const withExplicit: Dialog.Props = {
        ...baseProps,
        maybeInitialFocusId: Option.some('confirm-submit'),
        maybeReturnFocusId: Option.some('post-close-target'),
      }
      const opened = fold([Dialog.OpenDialog()], withExplicit)
      expect(Dialog.focusedIdOf(opened)).toEqual(Option.some('confirm-submit'))

      const closed = fold([Dialog.CloseDialog()], withExplicit, opened)
      expect(Dialog.returnFocusIdOf(closed)).toEqual(
        Option.some('post-close-target'),
      )

      // Empty focusables fall back to panelId
      const emptyProps: Dialog.Props = { id: 'empty', focusableIds: [] }
      const openedEmpty = fold([Dialog.OpenDialog()], emptyProps)
      expect(Dialog.focusedIdOf(openedEmpty)).toEqual(
        Option.some('empty-panel'),
      )

      // restoreFocus: false suppresses return focus
      const noRestoreProps: Dialog.Props = { ...baseProps, restoreFocus: false }
      const openedNoRestore = fold([Dialog.OpenDialog()], noRestoreProps)
      const closedNoRestore = fold(
        [Dialog.CloseDialog()],
        noRestoreProps,
        openedNoRestore,
      )
      expect(Dialog.returnFocusIdOf(closedNoRestore)).toEqual(Option.none())

      // OpenedDialog records trigger value and custom previously focused target
      const viaFact = fold([
        Dialog.OpenedDialog({
          maybeTriggerValue: Option.some('row-42'),
          maybePreviouslyFocusedId: Option.some('row-42-delete-btn'),
        }),
      ])
      expect(Dialog.triggerValueOf(viaFact)).toEqual(Option.some('row-42'))
      const closedViaFact = fold([Dialog.CloseDialog()], baseProps, viaFact)
      expect(Dialog.returnFocusIdOf(closedViaFact)).toEqual(
        Option.some('row-42-delete-btn'),
      )
    })

    it('traps Tab and Shift+Tab across focusables, reclaims outside focus, and pauses under nested scopes', () => {
      const opened = fold([Dialog.OpenDialog()])
      expect(Dialog.focusedIdOf(opened)).toEqual(Option.some('confirm-input'))

      // Tab forward across all focusables and wrap back to first
      const step1 = fold(
        [Dialog.PressedDialogKey({ key: 'Tab' })],
        baseProps,
        opened,
      )
      expect(Dialog.focusedIdOf(step1)).toEqual(Option.some('confirm-close'))

      const step2 = fold(
        [Dialog.PressedDialogKey({ key: 'Tab' })],
        baseProps,
        step1,
      )
      expect(Dialog.focusedIdOf(step2)).toEqual(Option.some('confirm-submit'))

      const wrappedForward = fold(
        [Dialog.PressedDialogKey({ key: 'Tab' })],
        baseProps,
        step2,
      )
      expect(Dialog.focusedIdOf(wrappedForward)).toEqual(
        Option.some('confirm-input'),
      )

      // Shift+Tab at first wraps to last
      const wrappedBackward = fold(
        [Dialog.PressedDialogKey({ key: 'Tab', shiftKey: true })],
        baseProps,
        wrappedForward,
      )
      expect(Dialog.focusedIdOf(wrappedBackward)).toEqual(
        Option.some('confirm-submit'),
      )

      // Outside focus is reclaimed back to last focused element
      const reclaimed = fold(
        [Dialog.FocusedDialogElement({ targetId: 'page-footer-link' })],
        baseProps,
        wrappedBackward,
      )
      expect(Dialog.focusedIdOf(reclaimed)).toEqual(
        Option.some('confirm-submit'),
      )

      // Focus inside scope updates tracked focused element
      const movedInside = fold(
        [Dialog.FocusedDialogElement({ targetId: 'confirm-close' })],
        baseProps,
        reclaimed,
      )
      expect(Dialog.focusedIdOf(movedInside)).toEqual(
        Option.some('confirm-close'),
      )

      // When a nested scope sits above this dialog, this scope is paused and Tab passes through (Ignored)
      const parentScope = Option.getOrThrow(
        Dialog.focusScopeOf(movedInside, baseProps),
      )
      const nestedScope = FocusScope.scope('nested-dialog')
      const pausedProps: Dialog.Props = {
        ...baseProps,
        focusScopes: [parentScope, nestedScope],
      }
      expect(Dialog.isFocusScopePaused(movedInside, pausedProps)).toBe(true)
      expect(
        Dialog.chart.step(
          movedInside,
          Dialog.PressedDialogKey({ key: 'Tab' }),
          pausedProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Dialog.chart.step(
          movedInside,
          Dialog.FocusedDialogElement({ targetId: 'nested-dialog-input' }),
          pausedProps,
        )._tag,
      ).toBe('Ignored')
    })
  })

  describe('dialog vs alertdialog, modal vs non-modal, and layer dismissal', () => {
    it('defaults alertdialog to dismissOnOutsidePress: false and prefers closeButtonId for initial focus', () => {
      const alertProps: Dialog.Props = {
        id: 'delete',
        role: 'alertdialog',
        focusableIds: ['delete-confirm', 'delete-close'],
      }
      expect(Dialog.isAlertDialog(alertProps)).toBe(true)
      expect(Dialog.isModalOf(alertProps)).toBe(true)
      expect(Dialog.dismissesOnOutsidePressOf(alertProps)).toBe(false)
      expect(Dialog.dismissesOnEscapeOf(alertProps)).toBe(true)

      const opened = fold([Dialog.OpenDialog()], alertProps)
      expect(Dialog.focusedIdOf(opened)).toEqual(Option.some('delete-close'))

      // Outside press and DismissDialog (backdrop) are refused for alertdialog
      expect(
        Dialog.chart.step(opened, Dialog.DismissDialog(), alertProps)._tag,
      ).toBe('Ignored')
      expect(
        Dialog.chart.step(
          opened,
          Dialog.PressedOutsideDialog({ insideIds: [] }),
          alertProps,
        )._tag,
      ).toBe('Ignored')

      // Escape still dismisses unless dismissOnEscape: false
      expect(
        Dialog.isOpen(
          fold(
            [Dialog.PressedDialogKey({ key: 'Escape' })],
            alertProps,
            opened,
          ),
        ),
      ).toBe(false)

      // CloseDialog always closes alertdialog
      expect(
        Dialog.isOpen(fold([Dialog.CloseDialog()], alertProps, opened)),
      ).toBe(false)

      // When dismissOnEscape: false, Escape is also refused
      const strictAlertProps: Dialog.Props = {
        ...alertProps,
        dismissOnEscape: false,
      }
      expect(
        Dialog.chart.step(
          opened,
          Dialog.PressedDialogKey({ key: 'Escape' }),
          strictAlertProps,
        )._tag,
      ).toBe('Ignored')
    })

    it('declares scroll-lock, inert-others, and focus-trap for modal dialogs and disables them for non-modal dialogs', () => {
      const modalOpen = fold([Dialog.OpenDialog()], baseProps)
      expect(Dialog.hygieneOf(modalOpen, baseProps)).toEqual({
        shouldLockScroll: true,
        shouldInertOthers: true,
        isOutsidePointerBlocked: true,
        isTrappingFocus: true,
        isFocusPaused: false,
        maybeFocusedId: Option.some('confirm-input'),
        maybeReturnFocusId: Option.none(),
      })

      const nonModalProps: Dialog.Props = { ...baseProps, isModal: false }
      const nonModalOpen = fold([Dialog.OpenDialog()], nonModalProps)
      expect(Dialog.hygieneOf(nonModalOpen, nonModalProps)).toEqual({
        shouldLockScroll: false,
        shouldInertOthers: false,
        isOutsidePointerBlocked: false,
        isTrappingFocus: false,
        isFocusPaused: false,
        maybeFocusedId: Option.some('confirm-input'),
        maybeReturnFocusId: Option.none(),
      })

      // Non-modal outside press with shouldRestoreFocus: false leaves focus on the clicked target
      const closedOutside = fold(
        [
          Dialog.PressedOutsideDialog({
            insideIds: [],
            shouldRestoreFocus: false,
          }),
        ],
        nonModalProps,
        nonModalOpen,
      )
      expect(Dialog.isOpen(closedOutside)).toBe(false)
      expect(Dialog.returnFocusIdOf(closedOutside)).toEqual(Option.none())
    })

    it('routes Escape and outside press through Layers so buried dialogs stay open', () => {
      const dialogLayer = Dialog.layerOf(baseProps)
      const menuLayer = Layers.layer('inner-menu')
      const opened = fold([Dialog.OpenDialog()])

      // Menu is above dialog -> Escape and outside press do NOT close the dialog
      const buriedProps: Dialog.Props = {
        ...baseProps,
        layers: [dialogLayer, menuLayer],
      }
      expect(
        Dialog.chart.step(
          opened,
          Dialog.PressedDialogKey({ key: 'Escape' }),
          buriedProps,
        )._tag,
      ).toBe('Ignored')
      expect(
        Dialog.chart.step(opened, Dialog.DismissDialog(), buriedProps)._tag,
      ).toBe('Ignored')
      expect(
        Dialog.chart.step(
          opened,
          Dialog.PressedOutsideDialog({ insideIds: [] }),
          buriedProps,
        )._tag,
      ).toBe('Ignored')

      // Dialog is topmost -> Escape and outside press close it, press inside keeps it open
      const topProps: Dialog.Props = {
        ...baseProps,
        layers: [dialogLayer],
      }
      expect(
        Dialog.isOpen(
          fold(
            [Dialog.PressedOutsideDialog({ insideIds: ['confirm'] })],
            topProps,
            opened,
          ),
        ),
      ).toBe(true)
      expect(
        Dialog.isOpen(
          fold(
            [Dialog.PressedOutsideDialog({ insideIds: [] })],
            topProps,
            opened,
          ),
        ),
      ).toBe(false)
      expect(
        Dialog.isOpen(
          fold([Dialog.PressedDialogKey({ key: 'Escape' })], topProps, opened),
        ),
      ).toBe(false)
    })

    it('handles UnmountedDialog cleanly with optional restoreFocus override', () => {
      const opened = fold([Dialog.OpenDialog()])
      const unmountedWithRestore = fold(
        [Dialog.UnmountedDialog({})],
        baseProps,
        opened,
      )
      expect(Dialog.isOpen(unmountedWithRestore)).toBe(false)
      expect(Dialog.returnFocusIdOf(unmountedWithRestore)).toEqual(
        Option.some('confirm-trigger'),
      )

      const unmountedWithoutRestore = fold(
        [Dialog.UnmountedDialog({ restoreFocus: false })],
        baseProps,
        opened,
      )
      expect(Dialog.isOpen(unmountedWithoutRestore)).toBe(false)
      expect(Dialog.returnFocusIdOf(unmountedWithoutRestore)).toEqual(
        Option.none(),
      )
    })
  })

  describe('synchronization: synced by default with a device-only option', () => {
    const DummyModel = S.Struct({ title: S.String })
    const DummyAction = Catalog.action('KeepTitle', {
      what: 'Keeps the title unchanged',
      why: 'To verify part composition',
      meta: { label: 'Keep', keys: [] },
    })
    const dummyCatalog = Catalog.make([DummyAction])
    const BaseProgram = makeProgram({
      id: 'dialog-sync-test',
      version: 1,
      Model: DummyModel,
      Message: dummyCatalog.Message,
      init: () => [{ title: 'Settings' }, []],
      update: model => [model, []],
      catalog: dummyCatalog,
    })

    it('syncs Dialog state and Messages by default (Navigation category)', () => {
      const SyncedApp = Part.compose({
        of: BaseProgram,
        parts: [Part.given(Dialog.part, () => baseProps)],
      })
      const [model] = SyncedApp.init()
      const sync = Option.getOrThrow(
        Option.fromNullishOr(SyncedApp.synchronization),
      )

      expect(sync.messageCategory(Dialog.OpenDialog())).toBe('Navigation')
      expect(sync.isLocalOnly?.(Dialog.OpenDialog())).toBe(false)
      expect(sync.paceOf?.(Dialog.OpenDialog())).toEqual(Synced())
      expect(sync.paceOf?.(Dialog.CloseDialog())).toEqual(Synced())

      const encoded = S.encodeUnknownSync(SyncedApp.Model)(model)
      expect(encoded).toMatchObject({
        title: 'Settings',
        parts: { Dialog: { _tag: 'Closed' } },
      })
    })

    it('keeps Dialog device-only when configured with Dialog.deviceOnly()', () => {
      const LocalDialog = Dialog.deviceOnly({ name: 'LocalDialog' })
      const LocalApp = Part.compose({
        of: BaseProgram,
        parts: [Part.given(LocalDialog, () => baseProps)],
      })
      const [model] = LocalApp.init()
      const sync = Option.getOrThrow(
        Option.fromNullishOr(LocalApp.synchronization),
      )

      expect(sync.isLocalOnly?.(Dialog.OpenDialog())).toBe(true)
      expect(sync.paceOf?.(Dialog.OpenDialog())).toEqual(
        Device({ because: 'OwnView' }),
      )

      const encoded = S.encodeUnknownSync(LocalApp.Model)(model)
      expect(JSON.stringify(encoded)).not.toContain('LocalDialog')

      const [opened] = LocalApp.update(model, Dialog.OpenDialog())
      const kept = sync.keepOnRefold?.(opened, model)
      expect(kept?.parts['LocalDialog']).toEqual(opened.parts['LocalDialog'])
    })
  })

  describe('reference-stable projection', () => {
    it('returns identical View and SlotBinding objects for unchanged state and untouched slots', () => {
      const dialogPart = Dialog.make({ name: 'StableDialog' })
      const opened = fold([Dialog.OpenDialog()])

      const v1 = Part.view(dialogPart, opened, baseProps)
      const triggerBefore = v1.slot('Trigger')
      const panelBefore = v1.slot('Panel')
      const titleBefore = v1.slot('Title')
      const descriptionBefore = v1.slot('Description')
      const backdropBefore = v1.slot('Backdrop')
      const closeBefore = v1.slot('CloseButton')

      const v2 = Part.view(dialogPart, opened, { ...baseProps })
      expect(v2).toBe(v1)
      expect(v2.slot('Trigger')).toBe(triggerBefore)
      expect(v2.slot('Panel')).toBe(panelBefore)

      expect(Slot.ariaOf(triggerBefore)).toEqual({
        role: 'button',
        id: 'confirm-trigger',
        'aria-controls': 'confirm-panel',
        'aria-haspopup': 'dialog',
        'aria-expanded': 'true',
      })
      expect(Slot.ariaOf(panelBefore)).toEqual({
        role: 'dialog',
        id: 'confirm-panel',
        'aria-modal': 'true',
        'aria-labelledby': 'confirm-dialog-title',
        'aria-describedby': 'confirm-dialog-description',
        'aria-activedescendant': 'confirm-input',
      })
      expect(Slot.ariaOf(closeBefore)).toEqual({
        role: 'button',
        id: 'confirm-close',
        'aria-current': 'false',
      })

      // AlertDialog role projection
      const alertPart = Dialog.make({ name: 'AlertDialogPart' })
      const alertProps: Dialog.Props = {
        id: 'danger',
        role: 'alertdialog',
        focusableIds: ['danger-close', 'danger-confirm'],
      }
      const alertOpen = fold([Dialog.OpenDialog()], alertProps)
      const alertView = Part.view(alertPart, alertOpen, alertProps)
      expect(Slot.ariaOf(alertView.slot('Panel'))).toEqual({
        role: 'alertdialog',
        id: 'danger-panel',
        'aria-modal': 'true',
        'aria-labelledby': 'danger-dialog-title',
        'aria-describedby': 'danger-dialog-description',
        'aria-activedescendant': 'danger-close',
      })
      expect(Slot.ariaOf(alertView.slot('CloseButton'))).toEqual({
        role: 'button',
        id: 'danger-close',
        'aria-current': 'true',
      })

      // Moving focus inside dialog updates Panel and CloseButton but keeps Trigger, Title, Description, Backdrop identical
      const tabbed = fold(
        [Dialog.PressedDialogKey({ key: 'Tab' })],
        baseProps,
        opened,
      )
      const v3 = Part.view(dialogPart, tabbed, baseProps)
      expect(v3).not.toBe(v1)
      expect(v3.slot('Trigger')).toBe(triggerBefore)
      expect(v3.slot('Title')).toBe(titleBefore)
      expect(v3.slot('Description')).toBe(descriptionBefore)
      expect(v3.slot('Backdrop')).toBe(backdropBefore)
      expect(v3.slot('Panel')).not.toBe(panelBefore)
      expect(v3.slot('CloseButton')).not.toBe(closeBefore)
      expect(Slot.ariaOf(v3.slot('Panel'))['aria-activedescendant']).toBe(
        'confirm-close',
      )
      expect(Slot.ariaOf(v3.slot('CloseButton'))['aria-current']).toBe('true')
    })
  })
})
