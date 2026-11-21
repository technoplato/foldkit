import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as RatingGroup from './ratingGroup.js'
import * as Slot from './slot.js'

const baseProps: RatingGroup.Props = {
  id: 'book-rating',
  count: 5,
  hasLabel: true,
}

const fold = (
  messages: ReadonlyArray<RatingGroup.Message>,
  props: RatingGroup.Props = baseProps,
  from: RatingGroup.State = RatingGroup.initial,
): RatingGroup.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => RatingGroup.chart.transition(state, message, props)[0],
  )

describe('core RatingGroup Part', () => {
  describe('declaration, chart integrity, IDs, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(RatingGroup.part)).toEqual([])
      expect(Part.problemsOf(RatingGroup.make({ defaultValue: 3 }))).toEqual([])
      expect(Part.problemsOf(RatingGroup.deviceOnly())).toEqual([])
      expect(
        Block.problemsOf({ name: 'RatingGroup', chart: RatingGroup.chart }),
      ).toEqual([])

      for (const action of RatingGroup.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs, defaults, and round-trips Idle and Hovering states through JSON Schema', () => {
      expect(RatingGroup.defaultCount).toBe(5)
      expect(RatingGroup.rootId('book-rating')).toBe('book-rating-root')
      expect(RatingGroup.itemId('book-rating', 3)).toBe('book-rating-item-3')
      expect(RatingGroup.labelId('book-rating')).toBe('book-rating-label')
      expect(RatingGroup.itemsOf({})).toEqual([1, 2, 3, 4, 5])

      const hovering = fold([
        RatingGroup.SetRating({ value: 3 }),
        RatingGroup.HoverRatingItem({ index: 4 }),
      ])
      for (const state of [RatingGroup.initial, hovering]) {
        const encoded = S.encodeUnknownSync(RatingGroup.State)(state)
        const decoded = S.decodeUnknownSync(RatingGroup.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('selection, allowHalf 0.5 precision, hover preview, keyboard roving/1-9, and guards', () => {
    it('supports whole-star and allowHalf 0.5 selection, hover preview, and LeaveRatingGroup', () => {
      const halfProps: RatingGroup.Props = { ...baseProps, allowHalf: true }

      // Hover preview over half of star 4 -> displayValue is 3.5 while committed value remains 0
      const hovered = fold(
        [RatingGroup.HoverRatingItem({ index: 4, isHalf: true })],
        halfProps,
      )
      expect(RatingGroup.isHovering(hovered)).toBe(true)
      expect(RatingGroup.hoveredValueOf(hovered)).toEqual(Option.some(3.5))
      expect(RatingGroup.valueOf(hovered, halfProps)).toBe(0)
      expect(RatingGroup.displayValueOf(hovered, halfProps)).toBe(3.5)
      expect(RatingGroup.itemStateOf(hovered, halfProps, 4)).toEqual({
        index: 4,
        isHighlighted: true,
        isHalf: true,
        isChecked: false,
        isTabStop: false,
      })

      // Selecting while hovering commits the hovered 3.5 value
      const committed = fold(
        [RatingGroup.SelectRatingItem({ index: 4 })],
        halfProps,
        hovered,
      )
      expect(RatingGroup.valueOf(committed, halfProps)).toBe(3.5)

      // Leaving returns to Idle preserving committed 3.5
      const left = fold([RatingGroup.LeaveRatingGroup()], halfProps, committed)
      expect(RatingGroup.isHovering(left)).toBe(false)
      expect(RatingGroup.valueOf(left, halfProps)).toBe(3.5)
      expect(RatingGroup.itemStateOf(left, halfProps, 4)).toEqual({
        index: 4,
        isHighlighted: true,
        isHalf: true,
        isChecked: true,
        isTabStop: true,
      })

      // Whole-star mode rounds fractional input to nearest integer
      const whole = fold([RatingGroup.SetRating({ value: 3.4 })], baseProps)
      expect(RatingGroup.valueOf(whole, baseProps)).toBe(3)

      // ClearRating resets to unrated (None)
      const cleared = fold([RatingGroup.ClearRating()], baseProps, whole)
      expect(RatingGroup.maybeValueOf(cleared)).toEqual(Option.none())
      expect(RatingGroup.valueOf(cleared)).toBe(0)
    })

    it('handles Arrow keys (LTR/RTL), Home, End, Space, and digit keys 0-9', () => {
      // ArrowRight steps 0 -> 1 -> 2, ArrowLeft steps back down to 0 (unrated)
      const step1 = fold([RatingGroup.PressedRatingKey({ key: 'ArrowRight' })])
      expect(RatingGroup.valueOf(step1)).toBe(1)
      const step2 = fold(
        [RatingGroup.PressedRatingKey({ key: 'ArrowRight' })],
        baseProps,
        step1,
      )
      expect(RatingGroup.valueOf(step2)).toBe(2)

      // End jumps to 5, Home jumps to 1
      const atEnd = fold(
        [RatingGroup.PressedRatingKey({ key: 'End' })],
        baseProps,
        step2,
      )
      expect(RatingGroup.valueOf(atEnd)).toBe(5)
      const atHome = fold(
        [RatingGroup.PressedRatingKey({ key: 'Home' })],
        baseProps,
        atEnd,
      )
      expect(RatingGroup.valueOf(atHome)).toBe(1)

      // ArrowLeft from 1 clears to 0
      const backToZero = fold(
        [RatingGroup.PressedRatingKey({ key: 'ArrowLeft' })],
        baseProps,
        atHome,
      )
      expect(RatingGroup.maybeValueOf(backToZero)).toEqual(Option.none())

      // Digit keys 1-9 select directly when <= count; 0 clears; > count ignored
      const digit4 = fold([RatingGroup.PressedRatingKey({ key: '4' })])
      expect(RatingGroup.valueOf(digit4)).toBe(4)
      const ignored9 = fold(
        [RatingGroup.PressedRatingKey({ key: '9' })],
        baseProps,
        digit4,
      )
      expect(RatingGroup.valueOf(ignored9)).toBe(4)
      const cleared0 = fold(
        [RatingGroup.PressedRatingKey({ key: '0' })],
        baseProps,
        digit4,
      )
      expect(RatingGroup.maybeValueOf(cleared0)).toEqual(Option.none())

      // Half-star keyboard stepping moves in 0.5 increments
      const halfProps: RatingGroup.Props = { ...baseProps, allowHalf: true }
      const halfStep = fold(
        [
          RatingGroup.PressedRatingKey({ key: 'ArrowRight' }),
          RatingGroup.PressedRatingKey({ key: 'ArrowRight' }),
          RatingGroup.PressedRatingKey({ key: 'ArrowRight' }),
        ],
        halfProps,
      )
      expect(RatingGroup.valueOf(halfStep, halfProps)).toBe(1.5)

      // RTL reverses ArrowLeft / ArrowRight
      const rtlProps: RatingGroup.Props = { ...baseProps, direction: 'Rtl' }
      const rtlStep = fold(
        [RatingGroup.PressedRatingKey({ key: 'ArrowLeft' })],
        rtlProps,
      )
      expect(RatingGroup.valueOf(rtlStep, rtlProps)).toBe(1)
    })

    it('enforces isDisabled, isReadOnly, ResetRating, and atRest', () => {
      const disabledProps: RatingGroup.Props = {
        ...baseProps,
        isDisabled: true,
      }
      expect(
        RatingGroup.valueOf(
          fold(
            [
              RatingGroup.SetRating({ value: 4 }),
              RatingGroup.HoverRatingItem({ index: 3 }),
              RatingGroup.PressedRatingKey({ key: 'ArrowRight' }),
            ],
            disabledProps,
          ),
        ),
      ).toBe(0)

      const readOnlyProps: RatingGroup.Props = {
        ...baseProps,
        isReadOnly: true,
      }
      const initial3 = RatingGroup.initialValue(3)
      const afterReadOnly = fold(
        [
          RatingGroup.SetRating({ value: 5 }),
          RatingGroup.HoverRatingItem({ index: 5 }),
          RatingGroup.PressedRatingKey({ key: 'ArrowRight' }),
        ],
        readOnlyProps,
        initial3,
      )
      expect(RatingGroup.isHovering(afterReadOnly)).toBe(false)
      expect(RatingGroup.valueOf(afterReadOnly)).toBe(3)

      // ResetRating restores defaultValue
      const withDefault: RatingGroup.Props = { ...baseProps, defaultValue: 2 }
      const reset = fold(
        [RatingGroup.SetRating({ value: 5 }), RatingGroup.ResetRating()],
        withDefault,
      )
      expect(RatingGroup.valueOf(reset)).toBe(2)

      // atRest preserves committed rating and clears hover preview
      const hovering = fold([
        RatingGroup.SetRating({ value: 4 }),
        RatingGroup.HoverRatingItem({ index: 2 }),
      ])
      const rested = RatingGroup.atRest(hovering)
      expect(RatingGroup.isHovering(rested)).toBe(false)
      expect(RatingGroup.valueOf(rested)).toBe(4)
    })
  })

  describe('slot projections, reference stability, and Part.compose sync durability', () => {
    it('projects Root, Item, and Label slots with roving tabindex and reference stability', () => {
      const idleView1 = Part.view(
        RatingGroup.part,
        RatingGroup.initial,
        baseProps,
      )
      const idleView2 = Part.view(
        RatingGroup.part,
        RatingGroup.initial,
        baseProps,
      )
      expect(idleView1).toBe(idleView2)

      expect(Slot.ariaOf(idleView1.slot('Root'))).toMatchObject({
        role: 'radiogroup',
        id: 'book-rating-root',
        'aria-orientation': 'horizontal',
        'aria-labelledby': 'book-rating-label',
      })
      const labelIdle = idleView1.slot('Label')
      const star5Idle = idleView1.slot('Item', '5')
      expect(Slot.ariaOf(idleView1.slot('Item', '1'))).toMatchObject({
        role: 'radio',
        id: 'book-rating-item-1',
        'aria-checked': 'false',
        'aria-label': '1 star',
        tabindex: '0',
      })
      expect(Slot.ariaOf(star5Idle)).toMatchObject({
        'aria-checked': 'false',
        'aria-label': '5 stars',
        tabindex: '-1',
      })

      const rated3 = fold([RatingGroup.SetRating({ value: 3 })])
      const ratedView = Part.view(RatingGroup.part, rated3, baseProps)
      expect(ratedView.slot('Label')).toBe(labelIdle)
      expect(ratedView.slot('Item', '5')).toBe(star5Idle)
      expect(Slot.ariaOf(ratedView.slot('Item', '3'))).toMatchObject({
        'aria-checked': 'true',
        'aria-label': '3 stars',
        tabindex: '0',
      })
      expect(Slot.ariaOf(ratedView.slot('Item', '1'))['tabindex']).toBe('-1')
    })

    it('syncs by default under Domain and supports deviceOnly omission', () => {
      expect(RatingGroup.synced.SetRating).toEqual(Synced())
      expect(RatingGroup.deviceSync('OwnView').SetRating).toEqual(
        Device({ because: 'OwnView' }),
      )

      const HostModel = S.Struct({ count: S.Number })
      const HostMsg = S.Struct({ _tag: S.Literal('Tick') })
      const Base = makeProgram({
        id: 'rating-sync-test',
        version: 1,
        Model: HostModel,
        Message: HostMsg,
        init: () => [{ count: 0 }, []],
        update: (model: typeof HostModel.Type) => [model, []],
      })

      const SyncedApp = Part.compose({
        of: Base,
        parts: [Part.given(RatingGroup.part, () => baseProps)],
      })
      const [initSynced] = SyncedApp.init()
      const [ratedSynced] = SyncedApp.update(
        initSynced,
        RatingGroup.SetRating({ value: 4 }),
      )
      expect(
        SyncedApp.synchronization?.messageCategory(
          RatingGroup.SetRating({ value: 4 }),
        ),
      ).toBe('Domain')
      expect(S.encodeUnknownSync(SyncedApp.Model)(ratedSynced)).toHaveProperty(
        'parts.RatingGroup._tag',
        'Idle',
      )

      const LocalApp = Part.compose({
        of: Base,
        parts: [Part.given(RatingGroup.deviceOnly(), () => baseProps)],
      })
      const [initLocal] = LocalApp.init()
      const [ratedLocal] = LocalApp.update(
        initLocal,
        RatingGroup.SetRating({ value: 4 }),
      )
      expect(
        S.encodeUnknownSync(LocalApp.Model)(ratedLocal),
      ).not.toHaveProperty('parts')
    })
  })
})
