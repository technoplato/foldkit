import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as PointerDrag from './pointerDrag.js'
import * as Slider from './slider.js'
import * as Slot from './slot.js'

const baseProps: Slider.Props = {
  id: 'volume',
  min: 0,
  max: 100,
  step: 5,
  hasLabel: true,
  defaultValues: [25],
}

const step = (
  state: Slider.State,
  message: Slider.Message,
  props: Slider.Props = baseProps,
): Slider.State => Slider.chart.transition(state, message, props)[0]

describe('Slider Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(Block.problemsOf({ name: 'Slider', chart: Slider.chart })).toEqual(
      [],
    )
    expect(Part.problemsOf(Slider.part)).toEqual([])
    expect(Part.problemsOf(Slider.make({ sampleMs: 100 }))).toEqual([])
    expect(Part.problemsOf(Slider.make({ defaultValues: [20, 80] }))).toEqual(
      [],
    )
    expect(Part.problemsOf(Slider.deviceOnly())).toEqual([])

    Slider.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('derives element IDs, point-to-value geometry, and single/multi-thumb readings', () => {
    expect(Slider.rootId('volume')).toBe('volume-root')
    expect(Slider.trackId('volume')).toBe('volume-track')
    expect(Slider.rangeId('volume')).toBe('volume-range')
    expect(Slider.labelId('volume')).toBe('volume-label')
    expect(Slider.thumbId('volume')).toBe('volume-thumb')
    expect(Slider.thumbId('price', 0)).toBe('price-thumb-0')
    expect(Slider.thumbId('price', 1)).toBe('price-thumb-1')
    expect(Slider.hiddenInputId('volume')).toBe('volume-input')
    expect(Slider.hiddenInputId('price', 1)).toBe('price-input-1')

    const horizontalRect: PointerDrag.Rect = {
      x: 100,
      y: 0,
      width: 200,
      height: 20,
    }
    expect(
      Slider.valueFromPoint({ x: 200, y: 10 }, horizontalRect, baseProps),
    ).toBe(50)
    expect(
      Slider.valueFromPoint({ x: 150, y: 10 }, horizontalRect, {
        ...baseProps,
        direction: 'Rtl',
      }),
    ).toBe(75)
    expect(
      Slider.valueFromPoint({ x: 150, y: 10 }, horizontalRect, {
        ...baseProps,
        isInverted: true,
      }),
    ).toBe(75)

    // Vertical slider defaults to bottom=min, top=max; isInverted flips to top=min, bottom=max
    const verticalRect: PointerDrag.Rect = {
      x: 0,
      y: 0,
      width: 20,
      height: 100,
    }
    expect(
      Slider.valueFromPoint({ x: 10, y: 25 }, verticalRect, {
        ...baseProps,
        orientation: 'Vertical',
      }),
    ).toBe(75)
    expect(
      Slider.valueFromPoint({ x: 10, y: 25 }, verticalRect, {
        ...baseProps,
        orientation: 'Vertical',
        isInverted: true,
      }),
    ).toBe(25)

    expect(Slider.percentStringOf(0.5)).toBe('50%')
    expect(Slider.percentStringOf(0.33333)).toBe('33.33%')

    const single = Slider.initialValue(40)
    expect(Slider.valueOf(single)).toBe(40)
    expect(Slider.fractionOf(single, baseProps)).toBe(0.4)
    expect(Slider.rangeFractionsOf(single, baseProps)).toEqual({
      start: 0,
      end: 0.4,
    })

    const range = Slider.initialValues([20, 80])
    expect(Slider.valuesOf(range)).toEqual([20, 80])
    expect(Slider.valueOf(range, 1)).toBe(80)
    expect(Slider.rangeFractionsOf(range, baseProps)).toEqual({
      start: 0.2,
      end: 0.8,
    })
  })

  it('handles keyboard navigation across orientation, RTL, inversion, Shift+Arrow, largeStep, and bounds', () => {
    expect(Slider.resolveSliderKey('ArrowRight')).toEqual(
      Option.some('StepIncrement'),
    )
    expect(Slider.resolveSliderKey('ArrowLeft')).toEqual(
      Option.some('StepDecrement'),
    )
    expect(Slider.resolveSliderKey('ArrowUp')).toEqual(
      Option.some('StepIncrement'),
    )
    expect(Slider.resolveSliderKey('ArrowDown')).toEqual(
      Option.some('StepDecrement'),
    )
    expect(Slider.resolveSliderKey('PageUp')).toEqual(
      Option.some('PageIncrement'),
    )
    expect(Slider.resolveSliderKey('PageDown')).toEqual(
      Option.some('PageDecrement'),
    )
    expect(Slider.resolveSliderKey('Home')).toEqual(Option.some('Min'))
    expect(Slider.resolveSliderKey('End')).toEqual(Option.some('Max'))
    expect(Slider.resolveSliderKey('ArrowRight', { isShift: true })).toEqual(
      Option.some('PageIncrement'),
    )
    expect(Slider.resolveSliderKey('ArrowLeft', { direction: 'Rtl' })).toEqual(
      Option.some('StepIncrement'),
    )
    expect(Slider.resolveSliderKey('ArrowRight', { isInverted: true })).toEqual(
      Option.some('StepDecrement'),
    )
    expect(
      Slider.resolveSliderKey('ArrowDown', {
        orientation: 'Vertical',
        isInverted: true,
      }),
    ).toEqual(Option.some('StepIncrement'))
    expect(Slider.resolveSliderKey('Enter')).toEqual(Option.none())

    const s0 = Slider.initialValue(50)
    const s1 = step(s0, Slider.PressedSliderKey({ key: 'ArrowRight' }))
    expect(Slider.valueOf(s1)).toBe(55)
    expect(Slider.isFocused(s1)).toBe(true)

    const s2 = step(s1, Slider.PressedSliderKey({ key: 'PageUp' }))
    expect(Slider.valueOf(s2)).toBe(100) // default largeStep = 10 * 5 = 50 -> clamped to 100

    const s3 = step(
      Slider.initialValue(50),
      Slider.PressedSliderKey({ key: 'PageDown' }),
      { ...baseProps, largeStep: 20 },
    )
    expect(Slider.valueOf(s3)).toBe(30)

    expect(
      Slider.valueOf(step(s3, Slider.PressedSliderKey({ key: 'Home' }))),
    ).toBe(0)
    expect(
      Slider.valueOf(step(s3, Slider.PressedSliderKey({ key: 'End' }))),
    ).toBe(100)

    // Explicit StepSlider Catalog action
    const stepped = step(
      Slider.initialValue(25),
      Slider.StepSlider({ direction: 'StepDecrement' }),
    )
    expect(Slider.valueOf(stepped)).toBe(20)
    expect(Slider.isFocused(stepped)).toBe(true)

    const blurred = step(stepped, Slider.BlurSlider())
    expect(Slider.isIdle(blurred)).toBe(true)
    expect(Slider.valueOf(blurred)).toBe(20)
  })

  it('handles thumb press, bubbled track absorption, track press, drag move, release, and Escape cancel', () => {
    const start = Slider.initialValue(50)

    // Thumb press starts drag without shifting value
    const thumbDown = step(
      start,
      Slider.BeginThumbDrag({ thumbIndex: 0, pointerId: 1, x: 50, y: 10 }),
    )
    expect(Slider.isDragging(thumbDown)).toBe(true)
    expect(Slider.valueOf(thumbDown)).toBe(50)
    expect(Slider.originValuesOf(thumbDown)).toEqual(Option.some([50]))
    expect(Slider.isThumbDragging(thumbDown, 0)).toBe(true)

    // Bubbled PressSliderTrack while dragging is absorbed
    const absorbed = step(
      thumbDown,
      Slider.PressSliderTrack({ pointerId: 1, x: 48, y: 10, value: 45 }),
    )
    expect(Slider.valueOf(absorbed)).toBe(50)

    // Other pointerId is ignored during drag
    const wrongPointer = step(
      absorbed,
      Slider.MoveSliderDrag({ pointerId: 99, x: 90, y: 10, value: 90 }),
    )
    expect(Slider.valueOf(wrongPointer)).toBe(50)

    // Matching pointerId moves thumb with snapping
    const moved = step(
      absorbed,
      Slider.MoveSliderDrag({ pointerId: 1, x: 82, y: 10, value: 82 }),
    )
    expect(Slider.valueOf(moved)).toBe(80)

    // Escape during drag restores originValues and returns to Idle
    const cancelledByEscape = step(
      moved,
      Slider.PressedSliderKey({ key: 'Escape' }),
    )
    expect(Slider.isIdle(cancelledByEscape)).toBe(true)
    expect(Slider.valueOf(cancelledByEscape)).toBe(50)
    expect(PointerDrag.isIdle(Slider.dragOf(cancelledByEscape))).toBe(true)

    // Track press snaps value immediately, drag moves, and release commits & focuses
    const trackDown = step(
      start,
      Slider.PressSliderTrack({ pointerId: 2, x: 75, y: 10, value: 74 }),
    )
    expect(Slider.isDragging(trackDown)).toBe(true)
    expect(Slider.valueOf(trackDown)).toBe(75)
    expect(Slider.originValuesOf(trackDown)).toEqual(Option.some([50]))

    const dragged = step(
      trackDown,
      Slider.MoveSliderDrag({ pointerId: 2, x: 90, y: 10, value: 90 }),
    )
    expect(Slider.valueOf(dragged)).toBe(90)

    const released = step(dragged, Slider.ReleaseSliderDrag({ pointerId: 2 }))
    expect(Slider.isFocused(released)).toBe(true)
    expect(Slider.valueOf(released)).toBe(90)
    expect(Slider.isThumbFocused(released, 0)).toBe(true)

    // Explicit CancelSliderDrag restores originValues
    const dragAgain = step(
      released,
      Slider.PressSliderTrack({ pointerId: 3, x: 10, y: 10, value: 10 }),
    )
    expect(Slider.valueOf(dragAgain)).toBe(10)
    const cancelled = step(dragAgain, Slider.CancelSliderDrag({ pointerId: 3 }))
    expect(Slider.isIdle(cancelled)).toBe(true)
    expect(Slider.valueOf(cancelled)).toBe(90)
  })

  it('supports multi-thumb range sliders with closest thumb, minStepsBetweenThumbs, and collision modes', () => {
    const rangeProps: Slider.Props = {
      id: 'price',
      min: 0,
      max: 100,
      step: 5,
      minStepsBetweenThumbs: 2, // gap = 10
      defaultValues: [20, 80],
    }
    const initial = Slider.initialValues([20, 80])

    expect(Slider.thumbBoundsAt([20, 80], 0, rangeProps)).toEqual({
      min: 0,
      max: 70,
    })
    expect(Slider.thumbBoundsAt([20, 80], 1, rangeProps)).toEqual({
      min: 30,
      max: 100,
    })

    // Track press at 72 snaps closest thumb (index 1) to 70
    const pressedUpper = step(
      initial,
      Slider.PressSliderTrack({ pointerId: 1, x: 72, y: 0, value: 72 }),
      rangeProps,
    )
    expect(Slider.valuesOf(pressedUpper)).toEqual([20, 70])
    expect(Slider.activeThumbIndexOf(pressedUpper)).toEqual(Option.some(1))

    // Dragging thumb 1 past thumb 0 stops at 20 + gap (30) under default 'None' collision
    const blocked = step(
      pressedUpper,
      Slider.MoveSliderDrag({ pointerId: 1, x: 10, y: 0, value: 10 }),
      rangeProps,
    )
    expect(Slider.valuesOf(blocked)).toEqual([20, 30])

    // Push collision mode pushes thumb 0 left while preserving gap
    const pushProps: Slider.Props = {
      ...rangeProps,
      thumbCollisionBehavior: 'Push',
    }
    const pushed = step(
      pressedUpper,
      Slider.MoveSliderDrag({ pointerId: 1, x: 15, y: 0, value: 15 }),
      pushProps,
    )
    expect(Slider.valuesOf(pushed)).toEqual([5, 15])

    // Swap collision mode crosses over neighbor and swaps activeThumbIndex
    const swapProps: Slider.Props = {
      ...rangeProps,
      minStepsBetweenThumbs: 0,
      thumbCollisionBehavior: 'Swap',
    }
    const startLower = step(
      initial,
      Slider.BeginThumbDrag({ thumbIndex: 0, pointerId: 5, x: 20, y: 0 }),
      swapProps,
    )
    const swapped = step(
      startLower,
      Slider.MoveSliderDrag({ pointerId: 5, x: 90, y: 0, value: 90 }),
      swapProps,
    )
    expect(Slider.valuesOf(swapped)).toEqual([80, 90])
    expect(Slider.activeThumbIndexOf(swapped)).toEqual(Option.some(1))

    // Escape after swap restores original [20, 80]
    const restored = step(
      swapped,
      Slider.PressedSliderKey({ key: 'Escape' }),
      swapProps,
    )
    expect(Slider.valuesOf(restored)).toEqual([20, 80])

    // Stacked thumbs pick the movable thumb toward targetValue
    expect(Slider.closestThumbIndex([50, 50], 70, rangeProps)).toBe(1)
    expect(Slider.closestThumbIndex([50, 50], 30, rangeProps)).toBe(0)
    expect(Slider.closestThumbIndex([100, 100], 100, rangeProps)).toBe(0)
  })

  it('respects isDisabled, isReadOnly, and ResetSlider', () => {
    const start = Slider.initialValue(40)
    const disabled: Slider.Props = { ...baseProps, isDisabled: true }
    const readOnly: Slider.Props = { ...baseProps, isReadOnly: true }

    expect(step(start, Slider.SetSliderValue({ value: 80 }), disabled)).toEqual(
      start,
    )
    expect(
      step(start, Slider.StepSlider({ direction: 'StepIncrement' }), disabled),
    ).toEqual(start)
    expect(
      step(start, Slider.FocusSliderThumb({ thumbIndex: 0 }), disabled),
    ).toEqual(start)
    expect(
      step(
        start,
        Slider.PressSliderTrack({ pointerId: 1, x: 80, y: 0, value: 80 }),
        disabled,
      ),
    ).toEqual(start)

    // ReadOnly still allows focusing the thumb for screen-reader inspection, but refuses value changes
    const focusedReadOnly = step(
      start,
      Slider.FocusSliderThumb({ thumbIndex: 0 }),
      readOnly,
    )
    expect(Slider.isFocused(focusedReadOnly)).toBe(true)
    expect(
      step(
        focusedReadOnly,
        Slider.PressedSliderKey({ key: 'ArrowRight' }),
        readOnly,
      ),
    ).toEqual(focusedReadOnly)

    // Reset restores props.defaultValues
    const reset = step(Slider.initialValue(90), Slider.ResetSlider(), baseProps)
    expect(Slider.isIdle(reset)).toBe(true)
    expect(Slider.valueOf(reset)).toBe(25)
  })

  it('projects reference-stable SlotBindings with WAI-ARIA across Root, Track, Range, Thumb, and Label', () => {
    const props: Slider.Props = {
      id: 'price',
      min: 0,
      max: 100,
      step: 5,
      minStepsBetweenThumbs: 2,
      orientation: 'Horizontal',
      hasLabel: true,
      thumbLabels: ['Minimum price', 'Maximum price'],
      valueTexts: ['$20', '$80'],
    }
    const state = Slider.initialValues([20, 80])
    const first = Part.view(Slider.part, state, props)
    const second = Part.view(Slider.part, state, { ...props })
    expect(second).toBe(first)
    expect(second.slot('Thumb', '0')).toBe(first.slot('Thumb', '0'))

    const firstRoot = first.slot('Root')
    const firstTrack = first.slot('Track')
    const firstRange = first.slot('Range')
    const firstLabel = first.slot('Label')
    const firstThumb0 = first.slot('Thumb', '0')
    const firstThumb1 = first.slot('Thumb', '1')

    expect(Slot.ariaOf(firstRoot)).toEqual({
      id: 'price-root',
      'aria-orientation': 'horizontal',
    })
    expect(Slot.ariaOf(firstTrack)).toEqual({
      id: 'price-track',
      'aria-orientation': 'horizontal',
    })
    expect(Slot.ariaOf(firstRange)).toEqual({
      id: 'price-range',
      'aria-orientation': 'horizontal',
    })
    expect(Slot.ariaOf(firstLabel)).toEqual({
      id: 'price-label',
    })
    expect(Slot.ariaOf(firstThumb0)).toEqual({
      role: 'slider',
      id: 'price-thumb-0',
      'aria-orientation': 'horizontal',
      'aria-valuemin': '0',
      'aria-valuemax': '70',
      'aria-valuenow': '20',
      'aria-valuetext': '$20',
      'aria-label': 'Minimum price',
      tabindex: '0',
    })
    expect(Slot.ariaOf(firstThumb1)).toEqual({
      role: 'slider',
      id: 'price-thumb-1',
      'aria-orientation': 'horizontal',
      'aria-valuemin': '30',
      'aria-valuemax': '100',
      'aria-valuenow': '80',
      'aria-valuetext': '$80',
      'aria-label': 'Maximum price',
      tabindex: '0',
    })

    // When thumb 0 moves, Root, Track, Range, and Label keep exact object identity
    const moved = step(
      state,
      Slider.SetSliderValue({ value: 30, thumbIndex: 0 }),
      props,
    )
    const after = Part.view(Slider.part, moved, props)
    expect(after.slot('Root')).toBe(firstRoot)
    expect(after.slot('Track')).toBe(firstTrack)
    expect(after.slot('Range')).toBe(firstRange)
    expect(after.slot('Label')).toBe(firstLabel)
    expect(after.slot('Thumb', '0')).not.toBe(firstThumb0)
    expect(Slot.ariaOf(after.slot('Thumb', '0'))['aria-valuenow']).toBe('30')
    expect(Slot.ariaOf(after.slot('Thumb', '1'))['aria-valuemin']).toBe('40')

    // Single-thumb projection without choice uses `${id}-thumb` and aria-labelledby
    const singleView = Part.view(Slider.part, Slider.initialValue(40), {
      ...baseProps,
      valueText: '40%',
      isReadOnly: true,
    })
    expect(Slot.ariaOf(singleView.slot('Thumb'))).toEqual({
      role: 'slider',
      id: 'volume-thumb',
      'aria-orientation': 'horizontal',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '40',
      'aria-valuetext': '40%',
      'aria-labelledby': 'volume-label',
      'aria-readonly': 'true',
      tabindex: '0',
    })
  })

  it('derives Pace.Sampled on drag moves, Pace.Synced on discrete actions, rests cleanly, and supports deviceOnly', () => {
    const Base = make({
      id: 'slider-sync-test',
      version: 1,
      Model: S.Struct({ count: S.Number }),
      Message: S.Union([
        Catalog.action('Bump', {
          what: 'Bumps',
          why: 'To bump',
          meta: { label: 'Bump', keys: [] },
        }),
      ]),
      init: () => [{ count: 0 }, []],
      update: model => [{ count: model.count + 1 }, []],
    })

    const syncedApp = Part.compose({
      of: Base,
      parts: [
        Part.given(
          Slider.make({ defaultValue: 25, sampleMs: 75 }),
          () => baseProps,
        ),
      ],
    })
    expect(
      syncedApp.synchronization?.paceOf?.(
        Slider.MoveSliderDrag({ pointerId: 1, x: 50, y: 0, value: 50 }),
      ),
    ).toEqual(Pace.Sampled({ everyMs: 75 }))
    expect(
      syncedApp.synchronization?.paceOf?.(Slider.ReleaseSliderDrag({})),
    ).toEqual(Pace.Synced())
    expect(
      syncedApp.synchronization?.paceOf?.(
        Slider.StepSlider({ direction: 'StepIncrement' }),
      ),
    ).toEqual(Pace.Synced())
    expect(
      syncedApp.synchronization?.isLocalOnly?.(
        Slider.MoveSliderDrag({ pointerId: 1, x: 50, y: 0, value: 50 }),
      ),
    ).toBe(false)

    // atRest / projectLocal returns Dragging to Idle while preserving the settled values
    const [initialModel] = syncedApp.init()
    const [draggingModel] = syncedApp.update(
      initialModel,
      Slider.PressSliderTrack({ pointerId: 1, x: 60, y: 0, value: 60 }),
    )
    expect(Slider.isDragging(draggingModel.parts['Slider'])).toBe(true)
    const rested = syncedApp.synchronization?.projectLocal?.(draggingModel)
    expect(rested?.parts['Slider']).toEqual(Slider.initialValue(60))

    // deviceOnly omits Slider state from synced log and encoded Model
    const localApp = Part.compose({
      of: Base,
      parts: [
        Part.given(
          Slider.deviceOnly({ name: 'LocalSlider', defaultValue: 50 }),
          () => baseProps,
        ),
      ],
    })
    expect(
      localApp.synchronization?.paceOf?.(
        Slider.MoveSliderDrag({ pointerId: 1, x: 80, y: 0, value: 80 }),
      ),
    ).toEqual(Pace.Device({ because: 'OwnView' }))
    expect(
      localApp.synchronization?.isLocalOnly?.(
        Slider.SetSliderValue({ value: 80 }),
      ),
    ).toBe(true)

    const [localInit] = localApp.init()
    const [afterLocal] = localApp.update(
      localInit,
      Slider.SetSliderValue({ value: 80 }),
    )
    const encoded = S.encodeSync(localApp.Model)(afterLocal)
    expect(encoded).toEqual({ count: 0 })

    // JSON round-trip of State and Message
    const draggingState = draggingModel.parts['Slider']
    expect(
      S.decodeSync(Slider.State)(S.encodeSync(Slider.State)(draggingState)),
    ).toEqual(draggingState)
    const msg = Slider.MoveSliderDrag({ pointerId: 1, x: 60, y: 0, value: 60 })
    expect(
      S.decodeSync(Slider.Message)(S.encodeSync(Slider.Message)(msg)),
    ).toEqual(msg)
  })
})
