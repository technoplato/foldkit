import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import * as VirtualWindow from './virtualWindow.js'

describe('VirtualWindow block', () => {
  describe('clampIndex, prefixOffsets, totalHeightOf, offsetAt, and itemHeightAt', () => {
    it('clamps indices cleanly into [0, itemCount]', () => {
      expect(VirtualWindow.clampIndex(-5, 10)).toBe(0)
      expect(VirtualWindow.clampIndex(0, 10)).toBe(0)
      expect(VirtualWindow.clampIndex(4, 10)).toBe(4)
      expect(VirtualWindow.clampIndex(15, 10)).toBe(10)
      expect(VirtualWindow.clampIndex(3, 0)).toBe(0)
    })

    it('builds cumulative prefix offsets and reads offsets and item heights safely', () => {
      const offsets = VirtualWindow.prefixOffsets([10, 20, 30, 40, 50])
      expect(offsets).toEqual([0, 10, 30, 60, 100, 150])
      expect(VirtualWindow.totalHeightOf(offsets)).toBe(150)
      expect(VirtualWindow.offsetAt(offsets, -2)).toBe(0)
      expect(VirtualWindow.offsetAt(offsets, 0)).toBe(0)
      expect(VirtualWindow.offsetAt(offsets, 2)).toBe(30)
      expect(VirtualWindow.offsetAt(offsets, 5)).toBe(150)
      expect(VirtualWindow.offsetAt(offsets, 99)).toBe(150)

      expect(VirtualWindow.itemHeightAt(offsets, 0)).toBe(10)
      expect(VirtualWindow.itemHeightAt(offsets, 2)).toBe(30)
      expect(VirtualWindow.itemHeightAt(offsets, 4)).toBe(50)
      expect(VirtualWindow.itemHeightAt(offsets, 5)).toBe(0)
      expect(VirtualWindow.itemHeightAt(offsets, -1)).toBe(0)

      expect(VirtualWindow.prefixOffsets([])).toEqual([0])
      expect(VirtualWindow.totalHeightOf([])).toBe(0)
      expect(VirtualWindow.offsetAt([], 0)).toBe(0)
    })
  })

  describe('binary search findFirstVisibleIndex and findLastVisibleIndex', () => {
    const offsets = VirtualWindow.prefixOffsets([10, 20, 30, 40, 50])

    it('finds first and last visible indices accurately across boundaries', () => {
      expect(VirtualWindow.findFirstVisibleIndex(offsets, -10)).toBe(0)
      expect(VirtualWindow.findFirstVisibleIndex(offsets, 0)).toBe(0)
      expect(VirtualWindow.findFirstVisibleIndex(offsets, 9)).toBe(0)
      expect(VirtualWindow.findFirstVisibleIndex(offsets, 10)).toBe(1)
      expect(VirtualWindow.findFirstVisibleIndex(offsets, 25)).toBe(1)
      expect(VirtualWindow.findFirstVisibleIndex(offsets, 149)).toBe(4)
      expect(VirtualWindow.findFirstVisibleIndex(offsets, 150)).toBe(5)
      expect(VirtualWindow.findFirstVisibleIndex(offsets, 1000)).toBe(5)

      expect(VirtualWindow.findLastVisibleIndex(offsets, 0)).toBe(0)
      expect(VirtualWindow.findLastVisibleIndex(offsets, 10)).toBe(1)
      expect(VirtualWindow.findLastVisibleIndex(offsets, 60)).toBe(3)
      expect(VirtualWindow.findLastVisibleIndex(offsets, 85)).toBe(4)
      expect(VirtualWindow.findLastVisibleIndex(offsets, 150)).toBe(5)
      expect(VirtualWindow.findLastVisibleIndex(offsets, 1060)).toBe(5)

      expect(VirtualWindow.findFirstVisibleIndex([0], 0)).toBe(0)
      expect(VirtualWindow.findLastVisibleIndex([0], 100)).toBe(0)
    })
  })

  describe('computeFixedWindow and computeVariableWindow', () => {
    it('computes fixed windows with overscan, clamping, and empty handling', () => {
      expect(
        VirtualWindow.computeFixedWindow({
          itemCount: 1000,
          rowHeightPx: 30,
          scrollTop: 0,
          containerHeight: 300,
          overscan: 0,
        }),
      ).toEqual({
        startIndex: 0,
        endIndex: 10,
        topSpacerHeight: 0,
        bottomSpacerHeight: 990 * 30,
        totalHeight: 1000 * 30,
      })

      expect(
        VirtualWindow.computeFixedWindow({
          itemCount: 1000,
          rowHeightPx: 30,
          scrollTop: 600,
          containerHeight: 300,
          overscan: 5,
        }),
      ).toEqual({
        startIndex: 15,
        endIndex: 35,
        topSpacerHeight: 15 * 30,
        bottomSpacerHeight: 965 * 30,
        totalHeight: 1000 * 30,
      })

      expect(
        VirtualWindow.computeFixedWindow({
          itemCount: 0,
          rowHeightPx: 30,
          scrollTop: 0,
          containerHeight: 300,
          overscan: 5,
        }),
      ).toEqual({
        startIndex: 0,
        endIndex: 0,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        totalHeight: 0,
      })
    })

    it('computes variable windows and agrees exactly with fixed windows for uniform heights', () => {
      const offsets = VirtualWindow.prefixOffsets([10, 20, 30, 40, 50])
      expect(
        VirtualWindow.computeVariableWindow({
          offsets,
          scrollTop: 25,
          containerHeight: 60,
          overscan: 0,
        }),
      ).toEqual({
        startIndex: 1,
        endIndex: 4,
        topSpacerHeight: 10,
        bottomSpacerHeight: 50,
        totalHeight: 150,
      })

      expect(
        VirtualWindow.computeVariableWindow({
          offsets,
          scrollTop: 25,
          containerHeight: 60,
          overscan: 1,
        }),
      ).toEqual({
        startIndex: 0,
        endIndex: 5,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        totalHeight: 150,
      })

      const uniformHeights = Array.makeBy(50, () => 30)
      const fixed = VirtualWindow.computeFixedWindow({
        itemCount: 50,
        rowHeightPx: 30,
        scrollTop: 600,
        containerHeight: 300,
        overscan: 5,
      })
      const variable = VirtualWindow.computeVariableWindow({
        offsets: VirtualWindow.prefixOffsets(uniformHeights),
        scrollTop: 600,
        containerHeight: 300,
        overscan: 5,
      })
      expect(variable).toEqual(fixed)
    })
  })

  describe('scrollOffsetForIndex alignment (Start | Center | End | Auto)', () => {
    it('computes Start, Center, End, and Auto targets for fixed and variable lists', () => {
      expect(
        VirtualWindow.scrollOffsetForIndex({
          index: 20,
          itemCount: 100,
          rowHeightPx: 30,
          containerHeight: 300,
          align: 'Start',
        }),
      ).toBe(600)

      expect(
        VirtualWindow.scrollOffsetForIndex({
          index: 20,
          itemCount: 100,
          rowHeightPx: 30,
          containerHeight: 300,
          align: 'Center',
        }),
      ).toBe(465)

      expect(
        VirtualWindow.scrollOffsetForIndex({
          index: 20,
          itemCount: 100,
          rowHeightPx: 30,
          containerHeight: 300,
          align: 'End',
        }),
      ).toBe(330)

      // Auto: below viewport scrolls to End, inside viewport stays put, above viewport scrolls to Start
      expect(
        VirtualWindow.scrollOffsetForIndex({
          index: 20,
          itemCount: 100,
          rowHeightPx: 30,
          containerHeight: 300,
          currentScrollTop: 0,
          align: 'Auto',
        }),
      ).toBe(330)

      expect(
        VirtualWindow.scrollOffsetForIndex({
          index: 20,
          itemCount: 100,
          rowHeightPx: 30,
          containerHeight: 300,
          currentScrollTop: 500,
          align: 'Auto',
        }),
      ).toBe(500)

      expect(
        VirtualWindow.scrollOffsetForIndex({
          index: 20,
          itemCount: 100,
          rowHeightPx: 30,
          containerHeight: 300,
          currentScrollTop: 900,
          align: 'Auto',
        }),
      ).toBe(600)

      // Variable heights with clamping at bottom edge
      const offsets = VirtualWindow.prefixOffsets([20, 40, 60, 80, 100])
      expect(
        VirtualWindow.scrollOffsetForIndex({
          index: 3,
          offsets,
          containerHeight: 100,
          align: 'Start',
        }),
      ).toBe(120)

      expect(
        VirtualWindow.scrollOffsetForIndex({
          index: 4,
          offsets,
          containerHeight: 100,
          align: 'Start',
        }),
      ).toBe(200)

      expect(
        VirtualWindow.scrollOffsetForIndex({
          index: 2,
          offsets,
          containerHeight: 100,
          align: 'Center',
        }),
      ).toBe(40)
    })
  })
})
