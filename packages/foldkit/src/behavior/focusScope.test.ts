import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  MoveFocus,
  PassThrough,
  active,
  indexOf,
  isActive,
  isMember,
  isPaused,
  isTargetInScope,
  pausedIds,
  popped,
  pushed,
  resolveInitialFocus,
  resolveOutsideFocus,
  resolveReturnFocus,
  resolveTabKey,
  scope,
  stepTab,
  updateScope,
  without,
} from './focusScope.js'

describe('focusScope block', () => {
  describe('nested scope stack (pause / resume)', () => {
    const parent = scope('settings-dialog', {
      containerId: 'settings-dialog-panel',
      isTrapped: true,
      maybePreviouslyFocusedId: Option.some('settings-trigger'),
    })
    const child = scope('confirm-alert', {
      containerId: 'confirm-alert-panel',
      isTrapped: true,
      maybePreviouslyFocusedId: Option.some('delete-account-btn'),
    })
    const grandChild = scope('help-dialog', {
      containerId: 'help-dialog-panel',
      isTrapped: true,
      maybePreviouslyFocusedId: Option.some('help-link'),
    })

    it('keeps only the topmost scope active and pauses lower scopes until unmount', () => {
      const one = pushed([], parent)
      expect(active(one)).toEqual(Option.some(parent))
      expect(isActive(one, parent.id)).toBe(true)
      expect(isPaused(one, parent.id)).toBe(false)
      expect(pausedIds(one)).toEqual([])

      // Mounting nested child pauses parent and activates child
      const two = pushed(one, child)
      expect(active(two)).toEqual(Option.some(child))
      expect(isActive(two, child.id)).toBe(true)
      expect(isPaused(two, child.id)).toBe(false)
      expect(isActive(two, parent.id)).toBe(false)
      expect(isPaused(two, parent.id)).toBe(true)
      expect(pausedIds(two)).toEqual(['settings-dialog'])
      expect(indexOf(two, 'settings-dialog')).toEqual(Option.some(0))
      expect(indexOf(two, 'confirm-alert')).toEqual(Option.some(1))
      expect(isMember(two, 'missing')).toBe(false)

      // Third scope pauses both beneath it
      const three = pushed(two, grandChild)
      expect(pausedIds(three)).toEqual(['settings-dialog', 'confirm-alert'])
      expect(isActive(three, grandChild.id)).toBe(true)

      // Unmounting middle scope leaves grandchild active and parent still paused
      const withoutMiddle = without(three, child.id)
      expect(isActive(withoutMiddle, grandChild.id)).toBe(true)
      expect(isPaused(withoutMiddle, parent.id)).toBe(true)
      expect(isMember(withoutMiddle, child.id)).toBe(false)

      // Unmounting grandchild resumes parent
      const resumed = popped(withoutMiddle)
      expect(active(resumed)).toEqual(Option.some(parent))
      expect(isActive(resumed, parent.id)).toBe(true)
      expect(isPaused(resumed, parent.id)).toBe(false)
      expect(pausedIds(resumed)).toEqual([])

      // Re-pushing an existing scope moves it to the top without duplicating it
      const promoted = pushed(two, parent)
      expect(promoted).toHaveLength(2)
      expect(isActive(promoted, parent.id)).toBe(true)
      expect(isPaused(promoted, child.id)).toBe(true)

      // Popping an empty stack stays empty
      expect(popped([])).toEqual([])
    })

    it('updates a single scope in place without reordering the stack', () => {
      const stack = pushed(pushed([], parent), child)
      const updated = updateScope(stack, parent.id, current => ({
        ...current,
        maybeLastFocusedId: Option.some('email-input'),
      }))
      expect(isActive(updated, child.id)).toBe(true)
      expect(updated[0]?.maybeLastFocusedId).toEqual(Option.some('email-input'))
    })
  })

  describe('initial focus target resolution', () => {
    it('picks explicit initial focus when present and focusable, else first focusable, else container fallback', () => {
      expect(
        resolveInitialFocus({
          containerId: 'dialog-panel',
          focusableIds: ['name-input', 'cancel-btn', 'save-btn'],
          maybeInitialFocusId: Option.some('cancel-btn'),
        }),
      ).toEqual(Option.some('cancel-btn'))

      // Explicit target absent from focusables falls back to first focusable
      expect(
        resolveInitialFocus({
          containerId: 'dialog-panel',
          focusableIds: ['name-input', 'save-btn'],
          maybeInitialFocusId: Option.some('missing-btn'),
        }),
      ).toEqual(Option.some('name-input'))

      // Explicit target matching container itself is honored
      expect(
        resolveInitialFocus({
          containerId: 'dialog-panel',
          focusableIds: ['name-input', 'save-btn'],
          maybeInitialFocusId: Option.some('dialog-panel'),
        }),
      ).toEqual(Option.some('dialog-panel'))

      // No explicit target picks first focusable
      expect(
        resolveInitialFocus({
          containerId: 'dialog-panel',
          focusableIds: ['name-input', 'save-btn'],
        }),
      ).toEqual(Option.some('name-input'))

      // Empty focusable list falls back to container
      expect(
        resolveInitialFocus({
          containerId: 'dialog-panel',
          focusableIds: [],
        }),
      ).toEqual(Option.some('dialog-panel'))

      // autoFocus: false suppresses initial focus
      expect(
        resolveInitialFocus({
          containerId: 'dialog-panel',
          focusableIds: ['name-input'],
          autoFocus: false,
        }),
      ).toEqual(Option.none())
    })
  })

  describe('Tab and Shift+Tab trapping and wrapping', () => {
    const focusableIds = ['first', 'middle', 'last']

    it('advances linearly within the scope and wraps at first and last when trapped', () => {
      // Forward within scope
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('first'),
          direction: 'Forward',
          isTrapped: true,
        }),
      ).toEqual(
        MoveFocus({
          targetId: 'middle',
          didWrap: false,
          shouldPreventDefault: false,
        }),
      )

      // Forward at last wraps to first
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('last'),
          direction: 'Forward',
          isTrapped: true,
        }),
      ).toEqual(
        MoveFocus({
          targetId: 'first',
          didWrap: true,
          shouldPreventDefault: true,
        }),
      )

      // Backward within scope
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('last'),
          direction: 'Backward',
          isTrapped: true,
        }),
      ).toEqual(
        MoveFocus({
          targetId: 'middle',
          didWrap: false,
          shouldPreventDefault: false,
        }),
      )

      // Backward at first wraps to last
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('first'),
          direction: 'Backward',
          isTrapped: true,
        }),
      ).toEqual(
        MoveFocus({
          targetId: 'last',
          didWrap: true,
          shouldPreventDefault: true,
        }),
      )
    })

    it('redirects outside or container focus back into the scope when trapped', () => {
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('outside-element'),
          direction: 'Forward',
          isTrapped: true,
        }),
      ).toEqual(
        MoveFocus({
          targetId: 'first',
          didWrap: false,
          shouldPreventDefault: true,
        }),
      )

      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.none(),
          direction: 'Backward',
          isTrapped: true,
        }),
      ).toEqual(
        MoveFocus({
          targetId: 'last',
          didWrap: false,
          shouldPreventDefault: true,
        }),
      )
    })

    it('handles empty focusable lists, loop: false, paused scopes, and untrapped scopes', () => {
      // Empty list while trapped holds container
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds: [],
          maybeCurrentId: Option.some('panel'),
          direction: 'Forward',
          isTrapped: true,
        }),
      ).toEqual(
        MoveFocus({
          targetId: 'panel',
          didWrap: false,
          shouldPreventDefault: true,
        }),
      )

      // Empty list while untrapped passes through
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds: [],
          maybeCurrentId: Option.some('panel'),
          direction: 'Forward',
          isTrapped: false,
        }),
      ).toEqual(PassThrough())

      // Trapped with loop: false clamps at edges
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('last'),
          direction: 'Forward',
          isTrapped: true,
          loop: false,
        }),
      ).toEqual(
        MoveFocus({
          targetId: 'last',
          didWrap: false,
          shouldPreventDefault: true,
        }),
      )

      // Paused scope passes through even while trapped
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('last'),
          direction: 'Forward',
          isTrapped: true,
          isPaused: true,
        }),
      ).toEqual(PassThrough())

      // Untrapped without loop passes through
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('last'),
          direction: 'Forward',
          isTrapped: false,
          loop: false,
        }),
      ).toEqual(PassThrough())

      // Untrapped with loop: true wraps inside, passes through outside
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('last'),
          direction: 'Forward',
          isTrapped: false,
          loop: true,
        }),
      ).toEqual(
        MoveFocus({
          targetId: 'first',
          didWrap: true,
          shouldPreventDefault: true,
        }),
      )
      expect(
        stepTab({
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('outside'),
          direction: 'Forward',
          isTrapped: false,
          loop: true,
        }),
      ).toEqual(PassThrough())
    })

    it('resolves keyboard events via resolveTabKey and ignores modifiers, IME composition, and non-Tab keys', () => {
      expect(
        resolveTabKey({
          key: 'Tab',
          shiftKey: true,
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('first'),
          isTrapped: true,
        }),
      ).toEqual(
        MoveFocus({
          targetId: 'last',
          didWrap: true,
          shouldPreventDefault: true,
        }),
      )

      expect(
        resolveTabKey({
          key: 'Enter',
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('first'),
        }),
      ).toEqual(PassThrough())

      expect(
        resolveTabKey({
          key: 'Tab',
          ctrlKey: true,
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('first'),
        }),
      ).toEqual(PassThrough())

      expect(
        resolveTabKey({
          key: 'Tab',
          isComposing: true,
          containerId: 'panel',
          focusableIds,
          maybeCurrentId: Option.some('first'),
        }),
      ).toEqual(PassThrough())
    })
  })

  describe('outside focus reclamation and branches', () => {
    it('reclaims focus to last focused element (or first focusable / container) unless inside scope, in branch, untrapped, or paused', () => {
      const focusableIds = ['cancel', 'confirm']

      expect(
        isTargetInScope(
          { containerId: 'panel', focusableIds, branches: ['portal-popover'] },
          'portal-popover',
        ),
      ).toBe(true)

      // Focus moves inside -> None (allowed)
      expect(
        resolveOutsideFocus({
          containerId: 'panel',
          focusableIds,
          targetId: 'confirm',
          maybeLastFocusedId: Option.some('cancel'),
          isTrapped: true,
        }),
      ).toEqual(Option.none())

      // Focus moves into registered branch -> None (allowed)
      expect(
        resolveOutsideFocus({
          containerId: 'panel',
          focusableIds,
          branches: ['portal-popover'],
          targetId: 'portal-popover',
          maybeLastFocusedId: Option.some('cancel'),
          isTrapped: true,
        }),
      ).toEqual(Option.none())

      // Focus escapes outside -> reclaimed to last focused
      expect(
        resolveOutsideFocus({
          containerId: 'panel',
          focusableIds,
          targetId: 'page-nav',
          maybeLastFocusedId: Option.some('confirm'),
          isTrapped: true,
        }),
      ).toEqual(Option.some('confirm'))

      // Last focused element removed -> falls back to first focusable
      expect(
        resolveOutsideFocus({
          containerId: 'panel',
          focusableIds,
          targetId: 'page-nav',
          maybeLastFocusedId: Option.some('removed-element'),
          isTrapped: true,
        }),
      ).toEqual(Option.some('cancel'))

      // Empty focusables -> falls back to container
      expect(
        resolveOutsideFocus({
          containerId: 'panel',
          focusableIds: [],
          targetId: 'page-nav',
          isTrapped: true,
        }),
      ).toEqual(Option.some('panel'))

      // Paused or untrapped -> None (does not reclaim)
      expect(
        resolveOutsideFocus({
          containerId: 'panel',
          focusableIds,
          targetId: 'page-nav',
          isTrapped: true,
          isPaused: true,
        }),
      ).toEqual(Option.none())
      expect(
        resolveOutsideFocus({
          containerId: 'panel',
          focusableIds,
          targetId: 'page-nav',
          isTrapped: false,
        }),
      ).toEqual(Option.none())
    })
  })

  describe('return focus target resolution on close/unmount', () => {
    it('restores explicit return target, else previously focused, else fallback, unless restoreFocus is false', () => {
      // Explicit return focus wins over previously focused
      expect(
        resolveReturnFocus({
          maybeReturnFocusId: Option.some('next-field'),
          maybePreviouslyFocusedId: Option.some('trigger-btn'),
        }),
      ).toEqual(Option.some('next-field'))

      // Previously focused restored by default
      expect(
        resolveReturnFocus({
          maybePreviouslyFocusedId: Option.some('trigger-btn'),
          maybeFallbackId: Option.some('fallback-btn'),
        }),
      ).toEqual(Option.some('trigger-btn'))

      // Missing previous target falls through to fallback when checked with isPresent
      expect(
        resolveReturnFocus({
          maybePreviouslyFocusedId: Option.some('unmounted-btn'),
          maybeFallbackId: Option.some('trigger-btn'),
          isPresent: id => id === 'trigger-btn',
        }),
      ).toEqual(Option.some('trigger-btn'))

      // restoreFocus: false suppresses restoration completely
      expect(
        resolveReturnFocus({
          restoreFocus: false,
          maybeReturnFocusId: Option.some('next-field'),
          maybePreviouslyFocusedId: Option.some('trigger-btn'),
          maybeFallbackId: Option.some('fallback-btn'),
        }),
      ).toEqual(Option.none())

      // Nothing available -> None
      expect(resolveReturnFocus({})).toEqual(Option.none())
    })
  })
})
