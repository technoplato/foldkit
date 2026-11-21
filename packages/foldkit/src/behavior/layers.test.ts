import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  canDismissOnEscape,
  canDismissOnOutsidePress,
  dismissibleAbove,
  escapeTarget,
  highestModal,
  indexOf,
  isOutsidePointerBlocked,
  isPointerEnabled,
  isTop,
  layer,
  outsidePressTarget,
  popped,
  pushed,
  top,
  without,
} from './layers.js'

describe('dismissable layers', () => {
  const popover = layer('popover')
  const dialog = layer('dialog', { isModal: true })
  const menu = layer('menu')
  const submenu = layer('submenu')
  const alert = layer('alert', {
    isModal: true,
    dismissesOnEscape: false,
    dismissesOnOutsidePress: false,
  })

  it('tracks stack order bottom-to-top with push, pop, and remove', () => {
    const one = pushed([], dialog)
    const two = pushed(one, menu)
    expect(top(two)).toEqual(Option.some(menu))
    expect(indexOf(two, 'dialog')).toEqual(Option.some(0))
    expect(indexOf(two, 'menu')).toEqual(Option.some(1))
    expect(indexOf(two, 'missing')).toEqual(Option.none())
    expect(isTop(two, 'menu')).toBe(true)
    expect(isTop(two, 'dialog')).toBe(false)

    // Re-pushing an existing id moves it to the top.
    const moved = pushed(two, dialog)
    expect(top(moved)).toEqual(Option.some(dialog))
    expect(moved).toHaveLength(2)

    expect(popped(two)).toEqual([dialog])
    expect(popped([])).toEqual([])
    expect(without(two, 'dialog')).toEqual([menu])
  })

  it('routes Escape only to the topmost layer that permits Escape', () => {
    const stack = [dialog, menu]
    expect(escapeTarget(stack)).toEqual(Option.some(menu))
    expect(canDismissOnEscape(stack, 'menu')).toBe(true)
    expect(canDismissOnEscape(stack, 'dialog')).toBe(false)

    // After closing the menu, Escape now targets the dialog beneath it.
    const afterMenuClosed = popped(stack)
    expect(escapeTarget(afterMenuClosed)).toEqual(Option.some(dialog))
    expect(canDismissOnEscape(afterMenuClosed, 'dialog')).toBe(true)

    // A non-escape-dismissable top layer absorbs Escape rather than leaking it beneath.
    const blocked = [dialog, alert]
    expect(escapeTarget(blocked)).toEqual(Option.none())
    expect(canDismissOnEscape(blocked, 'alert')).toBe(false)
    expect(canDismissOnEscape(blocked, 'dialog')).toBe(false)
  })

  it('routes outside presses to the topmost layer unless the press is inside it', () => {
    const stack = [dialog, menu]
    expect(outsidePressTarget(stack, [])).toEqual(Option.some(menu))
    expect(outsidePressTarget(stack, ['dialog'])).toEqual(Option.some(menu))
    expect(outsidePressTarget(stack, ['menu'])).toEqual(Option.none())
    expect(canDismissOnOutsidePress(stack, 'menu', ['dialog'])).toBe(true)
    expect(canDismissOnOutsidePress(stack, 'menu', ['menu'])).toBe(false)
    expect(canDismissOnOutsidePress(stack, 'dialog', [])).toBe(false)

    expect(outsidePressTarget([alert], [])).toEqual(Option.none())
  })

  it('distinguishes modal and non-modal pointer blocking', () => {
    expect(highestModal([popover, menu])).toEqual(Option.none())
    expect(isOutsidePointerBlocked([popover, menu])).toBe(false)
    expect(isPointerEnabled([popover, menu], 'popover')).toBe(true)
    expect(isPointerEnabled([popover, menu], 'page')).toBe(true)

    const modalStack = [popover, dialog, menu]
    expect(highestModal(modalStack)).toEqual(Option.some(dialog))
    expect(isOutsidePointerBlocked(modalStack)).toBe(true)
    expect(isPointerEnabled(modalStack, 'menu')).toBe(true)
    expect(isPointerEnabled(modalStack, 'dialog')).toBe(true)
    expect(isPointerEnabled(modalStack, 'popover')).toBe(false)
    expect(isPointerEnabled(modalStack, 'page')).toBe(false)
  })

  it('cascades nested outside presses cleanly and stops at inside layers, non-dismissable layers, or modal boundaries', () => {
    const nested = [menu, submenu]
    expect(dismissibleAbove(nested, [])).toEqual([submenu, menu])
    expect(dismissibleAbove(nested, ['menu'])).toEqual([submenu])
    expect(dismissibleAbove(nested, ['submenu'])).toEqual([])

    const modalStack = [popover, dialog, menu]
    // Stops after dismissing the modal dialog; the popover beneath the modal is shielded.
    expect(dismissibleAbove(modalStack, [])).toEqual([menu, dialog])
    // Pressing inside the dialog closes only the menu above it.
    expect(dismissibleAbove(modalStack, ['dialog'])).toEqual([menu])

    // Stops before an alert that refuses outside press.
    expect(dismissibleAbove([alert, menu], [])).toEqual([menu])
  })
})
