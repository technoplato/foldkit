import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Block from './block.js'
import * as Pace from './pace.js'
import * as PointerDrag from './pointerDrag.js'

const step = (
  state: PointerDrag.State,
  message: PointerDrag.Message,
  props: PointerDrag.Props = {},
): PointerDrag.State => PointerDrag.chart.transition(state, message, props)[0]

describe('PointerDrag block', () => {
  it('has no unreachable states or dead transitions', () => {
    expect(
      Block.problemsOf({ name: 'PointerDrag', chart: PointerDrag.chart }),
    ).toEqual([])
  })

  it('starts idle, activates immediately when thresholdPx is 0, tracks delta, and commits on EndDrag', () => {
    expect(PointerDrag.initial).toEqual(PointerDrag.Idle())
    expect(PointerDrag.isIdle(PointerDrag.initial)).toBe(true)
    expect(PointerDrag.isDragging(PointerDrag.initial)).toBe(false)
    expect(PointerDrag.isActivated(PointerDrag.initial)).toBe(false)
    expect(PointerDrag.pointerIdOf(PointerDrag.initial)).toEqual(Option.none())
    expect(PointerDrag.originValueOf(PointerDrag.initial)).toEqual(
      Option.none(),
    )
    expect(PointerDrag.deltaOf(PointerDrag.initial)).toEqual({ dx: 0, dy: 0 })
    expect(PointerDrag.axisDeltaOf(PointerDrag.initial)).toBe(0)

    const started = step(
      PointerDrag.initial,
      PointerDrag.StartDrag({ pointerId: 7, x: 100, y: 20, originValue: 50 }),
    )
    expect(started).toEqual(
      PointerDrag.Dragging({
        pointerId: 7,
        startX: 100,
        startY: 20,
        currentX: 100,
        currentY: 20,
        originValue: 50,
        isActivated: true,
      }),
    )
    expect(PointerDrag.isDragging(started)).toBe(true)
    expect(PointerDrag.isActivated(started)).toBe(true)
    expect(PointerDrag.pointerIdOf(started)).toEqual(Option.some(7))
    expect(PointerDrag.originValueOf(started)).toEqual(Option.some(50))

    const moved = step(
      started,
      PointerDrag.MoveDrag({ pointerId: 7, x: 145, y: 32 }),
    )
    expect(PointerDrag.deltaOf(moved)).toEqual({ dx: 45, dy: 12 })
    expect(PointerDrag.axisDeltaOf(moved, { axis: 'Horizontal' })).toBe(45)
    expect(
      PointerDrag.axisDeltaOf(moved, { axis: 'Horizontal', direction: 'Rtl' }),
    ).toBe(-45)
    expect(
      PointerDrag.axisDeltaOf(moved, {
        axis: 'Horizontal',
        direction: 'Rtl',
        isInverted: true,
      }),
    ).toBe(45)
    expect(PointerDrag.axisDeltaOf(moved, { axis: 'Vertical' })).toBe(12)
    expect(
      PointerDrag.axisDeltaOf(moved, { axis: 'Vertical', isInverted: true }),
    ).toBe(-12)
    expect(PointerDrag.axisDeltaOf(moved, { axis: 'Both' })).toBeCloseTo(
      Math.hypot(45, 12),
    )

    const ended = step(moved, PointerDrag.EndDrag({ pointerId: 7 }))
    expect(ended).toEqual(PointerDrag.Idle())
    expect(PointerDrag.isIdle(ended)).toBe(true)
  })

  it('waits for thresholdPx along the configured axis before activating and stays activated once crossed', () => {
    const horizontal: PointerDrag.Props = {
      axis: 'Horizontal',
      thresholdPx: 8,
    }
    const started = step(
      PointerDrag.initial,
      PointerDrag.StartDrag({ pointerId: 1, x: 10, y: 10, originValue: 0 }),
      horizontal,
    )
    expect(PointerDrag.isDragging(started)).toBe(true)
    expect(PointerDrag.isActivated(started)).toBe(false)

    // Large vertical move does not activate a Horizontal drag
    const verticalDrift = step(
      started,
      PointerDrag.MoveDrag({ pointerId: 1, x: 15, y: 80 }),
      horizontal,
    )
    expect(PointerDrag.isActivated(verticalDrift)).toBe(false)

    // Crossing horizontal threshold activates the drag
    const crossed = step(
      verticalDrift,
      PointerDrag.MoveDrag({ pointerId: 1, x: 18, y: 80 }),
      horizontal,
    )
    expect(PointerDrag.isActivated(crossed)).toBe(true)

    // Moving back near start keeps isActivated true
    const backNearStart = step(
      crossed,
      PointerDrag.MoveDrag({ pointerId: 1, x: 11, y: 10 }),
      horizontal,
    )
    expect(PointerDrag.isActivated(backNearStart)).toBe(true)

    // Both axis uses Euclidean distance
    const both: PointerDrag.Props = { axis: 'Both', thresholdPx: 5 }
    const startBoth = step(
      PointerDrag.initial,
      PointerDrag.StartDrag({ pointerId: 2, x: 0, y: 0, originValue: 0 }),
      both,
    )
    const diagonalShort = step(
      startBoth,
      PointerDrag.MoveDrag({ pointerId: 2, x: 2, y: 2 }),
      both,
    )
    expect(PointerDrag.isActivated(diagonalShort)).toBe(false)
    const diagonalThreshold = step(
      diagonalShort,
      PointerDrag.MoveDrag({ pointerId: 2, x: 3, y: 4 }),
      both,
    )
    expect(PointerDrag.isActivated(diagonalThreshold)).toBe(true)
  })

  it('ignores non-matching pointerIds while dragging and supports Escape / pointercancel cancellation', () => {
    const started = step(
      PointerDrag.initial,
      PointerDrag.StartDrag({ pointerId: 1, x: 20, y: 30, originValue: 40 }),
    )

    // Second StartDrag while dragging is ignored
    expect(
      step(
        started,
        PointerDrag.StartDrag({ pointerId: 2, x: 99, y: 99, originValue: 99 }),
      ),
    ).toEqual(started)

    // Move, End, and Cancel from another pointerId are ignored
    expect(
      step(started, PointerDrag.MoveDrag({ pointerId: 2, x: 80, y: 30 })),
    ).toEqual(started)
    expect(step(started, PointerDrag.EndDrag({ pointerId: 2 }))).toEqual(
      started,
    )
    expect(step(started, PointerDrag.CancelDrag({ pointerId: 2 }))).toEqual(
      started,
    )

    // Escape cancel (omitted pointerId) cancels active drag while originValue was captured
    expect(PointerDrag.isCancelKey('Escape')).toBe(true)
    expect(PointerDrag.isCancelKey('Enter')).toBe(false)
    expect(PointerDrag.originValueOf(started)).toEqual(Option.some(40))
    const cancelled = step(started, PointerDrag.CancelDrag({}))
    expect(cancelled).toEqual(PointerDrag.Idle())
  })

  it('rejects StartDrag and MoveDrag when disabled or readOnly, yet allows EndDrag/CancelDrag recovery', () => {
    const disabled: PointerDrag.Props = { isDisabled: true }
    const readOnly: PointerDrag.Props = { isReadOnly: true }
    expect(PointerDrag.canDrag(disabled)).toBe(false)
    expect(PointerDrag.canDrag(readOnly)).toBe(false)

    expect(
      step(
        PointerDrag.initial,
        PointerDrag.StartDrag({ pointerId: 1, x: 0, y: 0, originValue: 10 }),
        disabled,
      ),
    ).toEqual(PointerDrag.Idle())

    const dragging = step(
      PointerDrag.initial,
      PointerDrag.StartDrag({ pointerId: 1, x: 0, y: 0, originValue: 10 }),
    )
    expect(
      step(
        dragging,
        PointerDrag.MoveDrag({ pointerId: 1, x: 50, y: 0 }),
        disabled,
      ),
    ).toEqual(dragging)
    expect(step(dragging, PointerDrag.CancelDrag({}), disabled)).toEqual(
      PointerDrag.Idle(),
    )
    expect(step(dragging, PointerDrag.EndDrag({}), readOnly)).toEqual(
      PointerDrag.Idle(),
    )
  })

  it('syncs MoveDrag via Pace.Sampled (50 ms default) and Start/End/Cancel via Pace.Synced', () => {
    expect(PointerDrag.defaultSampleMs).toBe(50)
    expect(
      PointerDrag.paceOf(PointerDrag.MoveDrag({ pointerId: 1, x: 10, y: 0 })),
    ).toEqual(Pace.Sampled({ everyMs: 50 }))
    expect(
      PointerDrag.paceOf(PointerDrag.MoveDrag({ pointerId: 1, x: 10, y: 0 }), {
        sampleMs: 100,
      }),
    ).toEqual(Pace.Sampled({ everyMs: 100 }))
    expect(
      PointerDrag.paceOf(
        PointerDrag.StartDrag({ pointerId: 1, x: 0, y: 0, originValue: 0 }),
      ),
    ).toEqual(Pace.Synced())
    expect(PointerDrag.paceOf(PointerDrag.EndDrag({}))).toEqual(Pace.Synced())
    expect(PointerDrag.paceOf(PointerDrag.CancelDrag({}))).toEqual(
      Pace.Synced(),
    )

    const firstMove = Pace.arrived(Pace.empty, {
      part: 'Slider',
      key: 'Slider.MoveDrag',
      sync: PointerDrag.paceOf(
        PointerDrag.MoveDrag({ pointerId: 1, x: 10, y: 0 }),
      ),
      atMs: 1000,
    })
    expect(firstMove.write).toEqual(['Slider.MoveDrag'])

    // Within 50 ms window: queued until 1050 ms
    const throttled = Pace.arrived(firstMove.queue, {
      part: 'Slider',
      key: 'Slider.MoveDrag',
      sync: PointerDrag.paceOf(
        PointerDrag.MoveDrag({ pointerId: 1, x: 25, y: 0 }),
      ),
      atMs: 1020,
    })
    expect(throttled.write).toEqual([])
    expect(throttled.maybeNextAtMs).toEqual(Option.some(1050))

    // Due at 1050 ms
    const sampledFlush = Pace.due(throttled.queue, 1050)
    expect(sampledFlush.write).toEqual(['Slider.MoveDrag'])

    // EndDrag (Synced) flushes any waiting MoveDrag before itself
    const waiting = Pace.arrived(sampledFlush.queue, {
      part: 'Slider',
      key: 'Slider.MoveDrag',
      sync: PointerDrag.paceOf(
        PointerDrag.MoveDrag({ pointerId: 1, x: 60, y: 0 }),
      ),
      atMs: 1065,
    })
    const committed = Pace.arrived(waiting.queue, {
      part: 'Slider',
      key: 'Slider.EndDrag',
      sync: PointerDrag.paceOf(PointerDrag.EndDrag({})),
      atMs: 1070,
    })
    expect(committed.write).toEqual(['Slider.MoveDrag', 'Slider.EndDrag'])
  })

  it('provides pure geometry, clamping, snapping, RTL/inverted fraction mapping, and stepping math', () => {
    expect(PointerDrag.clampValue(120, 0, 100)).toBe(100)
    expect(PointerDrag.clampValue(-5, 0, 100)).toBe(0)
    expect(PointerDrag.clampValue(50, 100, 0)).toBe(50)

    expect(PointerDrag.decimalCountOf(1)).toBe(0)
    expect(PointerDrag.decimalCountOf(0.05)).toBe(2)
    expect(PointerDrag.decimalCountOf(1e-7)).toBe(7)
    expect(PointerDrag.decimalCountOf(0)).toBe(0)

    expect(PointerDrag.snapToStep(3, 0, 10, 2)).toBe(4)
    expect(PointerDrag.snapToStep(4.7, 0, 10, 2)).toBe(4)
    expect(PointerDrag.snapToStep(0.3, 0, 1, 0.1)).toBe(0.3)
    expect(PointerDrag.snapToStep(99, 0, 10, 1)).toBe(10)
    expect(PointerDrag.snapToStep(-5, 0, 10, 1)).toBe(0)
    expect(PointerDrag.snapToStep(3.7, 0, 10, 0)).toBe(3.7)

    const rect: PointerDrag.Rect = { x: 100, y: 50, width: 200, height: 100 }
    expect(PointerDrag.fractionFromPoint({ x: 150, y: 75 }, rect)).toBe(0.25)
    expect(
      PointerDrag.fractionFromPoint({ x: 150, y: 75 }, rect, {
        direction: 'Rtl',
      }),
    ).toBe(0.75)
    expect(
      PointerDrag.fractionFromPoint({ x: 150, y: 75 }, rect, {
        isInverted: true,
      }),
    ).toBe(0.75)
    expect(
      PointerDrag.fractionFromPoint({ x: 150, y: 75 }, rect, {
        direction: 'Rtl',
        isInverted: true,
      }),
    ).toBe(0.25)
    expect(
      PointerDrag.fractionFromPoint({ x: 150, y: 75 }, rect, {
        axis: 'Vertical',
      }),
    ).toBe(0.25)
    expect(
      PointerDrag.fractionFromPoint({ x: 150, y: 75 }, rect, {
        axis: 'Vertical',
        isInverted: true,
      }),
    ).toBe(0.75)
    expect(
      PointerDrag.fractionFromPoint(
        { x: 150, y: 75 },
        { x: 0, y: 0, width: 0, height: 0 },
      ),
    ).toBe(0)

    expect(
      PointerDrag.fractionsFromPoint({ x: 150, y: 75 }, rect, {
        isInvertedY: true,
      }),
    ).toEqual({ x: 0.25, y: 0.75 })

    expect(PointerDrag.valueFromFraction(0.5, 0, 100)).toBe(50)
    expect(PointerDrag.valueFromFraction(0.24, 0, 100, 10)).toBe(20)
    expect(PointerDrag.valueFromFraction(2, 0, 100)).toBe(100)
    expect(PointerDrag.valueFromFraction(-1, 0, 100)).toBe(0)

    expect(PointerDrag.fractionFromValue(0, 0, 10)).toBe(0)
    expect(PointerDrag.fractionFromValue(5, 0, 10)).toBe(0.5)
    expect(PointerDrag.fractionFromValue(0, -10, 10)).toBe(0.5)
    expect(PointerDrag.fractionFromValue(5, 5, 5)).toBe(0)

    expect(PointerDrag.stepValue(0.2, 0.1, 0, 1, 0.1)).toBe(0.3)
    expect(PointerDrag.stepValue(10, 1, 0, 10, 1)).toBe(10)
    expect(PointerDrag.stepValue(0, -1, 0, 10, 1)).toBe(0)
  })

  it('resets to Idle atRest and round-trips State and Message through JSON Schema', () => {
    const dragging = step(
      PointerDrag.initial,
      PointerDrag.StartDrag({ pointerId: 3, x: 10, y: 20, originValue: 75 }),
    )
    expect(PointerDrag.atRest(dragging)).toEqual(PointerDrag.Idle())

    const encodedState = S.encodeSync(PointerDrag.State)(dragging)
    expect(S.decodeSync(PointerDrag.State)(encodedState)).toEqual(dragging)

    const moveMessage = PointerDrag.MoveDrag({ pointerId: 3, x: 40, y: 20 })
    const encodedMessage = S.encodeSync(PointerDrag.Message)(moveMessage)
    expect(S.decodeSync(PointerDrag.Message)(encodedMessage)).toEqual(
      moveMessage,
    )
    expect(PointerDrag.isMessage(moveMessage)).toBe(true)

    expect(Pace.isSynced(PointerDrag.synced.MoveDrag)).toBe(true)
    expect(Pace.isSynced(PointerDrag.deviceSync().MoveDrag)).toBe(false)
  })
})
