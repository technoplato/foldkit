import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  findEnabledFrom,
  firstEnabled,
  lastEnabled,
  moveOfKey,
  resolveKey,
  stepEnabled,
  wrapIndex,
} from './rovingFocus.js'

describe('rovingFocus', () => {
  describe('wrapIndex', () => {
    it('wraps positive and negative indices cleanly', () => {
      expect(wrapIndex(0, 4)).toBe(0)
      expect(wrapIndex(4, 4)).toBe(0)
      expect(wrapIndex(-1, 4)).toBe(3)
      expect(wrapIndex(-5, 4)).toBe(3)
      expect(wrapIndex(2, 0)).toBe(0)
    })
  })

  describe('moveOfKey', () => {
    it('maps vertical arrow keys, Home, End, PageUp, and PageDown by default', () => {
      expect(moveOfKey('ArrowDown')).toEqual(Option.some('Next'))
      expect(moveOfKey('ArrowUp')).toEqual(Option.some('Previous'))
      expect(moveOfKey('Home')).toEqual(Option.some('First'))
      expect(moveOfKey('PageUp')).toEqual(Option.some('First'))
      expect(moveOfKey('End')).toEqual(Option.some('Last'))
      expect(moveOfKey('PageDown')).toEqual(Option.some('Last'))
      expect(moveOfKey('ArrowRight')).toEqual(Option.none())
      expect(moveOfKey('ArrowLeft')).toEqual(Option.none())
      expect(moveOfKey('Enter')).toEqual(Option.none())
    })

    it('maps horizontal arrow keys respecting LTR and RTL direction', () => {
      expect(moveOfKey('ArrowRight', { orientation: 'Horizontal' })).toEqual(
        Option.some('Next'),
      )
      expect(moveOfKey('ArrowLeft', { orientation: 'Horizontal' })).toEqual(
        Option.some('Previous'),
      )
      expect(moveOfKey('ArrowDown', { orientation: 'Horizontal' })).toEqual(
        Option.none(),
      )

      expect(
        moveOfKey('ArrowLeft', { orientation: 'Horizontal', direction: 'Rtl' }),
      ).toEqual(Option.some('Next'))
      expect(
        moveOfKey('ArrowRight', {
          orientation: 'Horizontal',
          direction: 'Rtl',
        }),
      ).toEqual(Option.some('Previous'))
    })

    it('accepts both axes when orientation is Both and can disable page keys', () => {
      expect(moveOfKey('ArrowDown', { orientation: 'Both' })).toEqual(
        Option.some('Next'),
      )
      expect(moveOfKey('ArrowRight', { orientation: 'Both' })).toEqual(
        Option.some('Next'),
      )
      expect(moveOfKey('PageUp', { pageKeys: false })).toEqual(Option.none())
      expect(moveOfKey('PageDown', { pageKeys: false })).toEqual(Option.none())
    })
  })

  describe('stepEnabled and resolveKey', () => {
    it('wraps around enabled items by default and skips disabled items', () => {
      // Indices: 0 (enabled), 1 (disabled), 2 (enabled), 3 (disabled)
      const isDisabled = (index: number) => index === 1 || index === 3

      expect(firstEnabled(4, isDisabled)).toEqual(Option.some(0))
      expect(lastEnabled(4, isDisabled)).toEqual(Option.some(2))
      expect(findEnabledFrom(4, 1, 1, isDisabled)).toEqual(Option.some(2))

      expect(
        stepEnabled({
          count: 4,
          current: Option.some(0),
          move: 'Next',
          isDisabled,
        }),
      ).toEqual(Option.some(2))
      expect(
        stepEnabled({
          count: 4,
          current: Option.some(2),
          move: 'Next',
          isDisabled,
        }),
      ).toEqual(Option.some(0))
      expect(
        stepEnabled({
          count: 4,
          current: Option.some(0),
          move: 'Previous',
          isDisabled,
        }),
      ).toEqual(Option.some(2))
      expect(
        stepEnabled({
          count: 4,
          current: Option.some(2),
          move: 'Previous',
          isDisabled,
        }),
      ).toEqual(Option.some(0))
    })

    it('clamps at edges when loop is false', () => {
      const isDisabled = (index: number) => index === 0 || index === 3
      // Enabled indices: 1, 2
      expect(
        stepEnabled({
          count: 4,
          current: Option.some(2),
          move: 'Next',
          isDisabled,
          loop: false,
        }),
      ).toEqual(Option.some(2))
      expect(
        stepEnabled({
          count: 4,
          current: Option.some(1),
          move: 'Previous',
          isDisabled,
          loop: false,
        }),
      ).toEqual(Option.some(1))
      expect(
        stepEnabled({
          count: 4,
          current: Option.some(1),
          move: 'Next',
          isDisabled,
          loop: false,
        }),
      ).toEqual(Option.some(2))
    })

    it('enters from None at first enabled on Next and last enabled on Previous', () => {
      const isDisabled = (index: number) => index === 0 || index === 3
      expect(
        stepEnabled({
          count: 4,
          current: Option.none(),
          move: 'Next',
          isDisabled,
        }),
      ).toEqual(Option.some(1))
      expect(
        stepEnabled({
          count: 4,
          current: Option.none(),
          move: 'Previous',
          isDisabled,
        }),
      ).toEqual(Option.some(2))
    })

    it('returns None when the list is empty or every item is disabled', () => {
      expect(
        stepEnabled({ count: 0, current: Option.none(), move: 'Next' }),
      ).toEqual(Option.none())
      expect(
        stepEnabled({
          count: 3,
          current: Option.some(0),
          move: 'Next',
          isDisabled: () => true,
        }),
      ).toEqual(Option.none())
      expect(
        stepEnabled({
          count: 3,
          current: Option.some(0),
          move: 'Next',
          isDisabled: () => true,
          loop: false,
        }),
      ).toEqual(Option.none())
    })

    it('resolves Home, End, and arrow keys directly', () => {
      const isDisabled = (index: number) => index === 0 || index === 4
      expect(
        resolveKey({
          key: 'Home',
          count: 5,
          current: Option.some(3),
          isDisabled,
        }),
      ).toEqual(Option.some(1))
      expect(
        resolveKey({
          key: 'End',
          count: 5,
          current: Option.some(1),
          isDisabled,
        }),
      ).toEqual(Option.some(3))
      expect(
        resolveKey({
          key: 'ArrowRight',
          count: 5,
          current: Option.some(1),
          isDisabled,
          orientation: 'Horizontal',
        }),
      ).toEqual(Option.some(2))
      expect(
        resolveKey({
          key: 'a',
          count: 5,
          current: Option.some(1),
          isDisabled,
        }),
      ).toEqual(Option.none())
    })
  })
})
