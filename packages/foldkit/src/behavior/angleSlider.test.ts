import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as AngleSlider from './angleSlider.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const baseProps: AngleSlider.Props = {
  id: 'gradient-angle',
  step: 15,
  largeStep: 45,
  defaultValue: 90,
  label: 'Gradient direction',
}

const step = (
  state: AngleSlider.State,
  message: AngleSlider.Message,
  props: AngleSlider.Props = baseProps,
): AngleSlider.State => AngleSlider.chart.transition(state, message, props)[0]

describe('AngleSlider Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'AngleSlider', chart: AngleSlider.chart }),
    ).toEqual([])
    expect(Part.problemsOf(AngleSlider.part)).toEqual([])
    expect(
      Part.problemsOf(
        AngleSlider.make({ defaultValue: 90, step: 15, sampleMs: 75 }),
      ),
    ).toEqual([])
    expect(Part.problemsOf(AngleSlider.deviceOnly())).toEqual([])

    AngleSlider.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('computes wrapping normalizeAngle, snapAngle, and clockwise atan2 angleFromPoint from 12 oclock', () => {
    expect(AngleSlider.rootId('dial')).toBe('dial-root')
    expect(AngleSlider.controlId('dial')).toBe('dial-control')
    expect(AngleSlider.thumbId('dial')).toBe('dial-thumb')

    expect(AngleSlider.normalizeAngle(0)).toBe(0)
    expect(AngleSlider.normalizeAngle(360)).toBe(0)
    expect(AngleSlider.normalizeAngle(375)).toBe(15)
    expect(AngleSlider.normalizeAngle(-30)).toBe(330)
    expect(AngleSlider.normalizeAngle(-360)).toBe(0)

    expect(AngleSlider.snapAngle(14, 15)).toBe(15)
    expect(AngleSlider.snapAngle(355, 15)).toBe(0)
    expect(AngleSlider.snapAngle(-15, 15)).toBe(345)

    // Clockwise from 12 o'clock around center (50, 50)
    expect(AngleSlider.angleFromPoint(50, 50, 50, 0)).toBe(0)
    expect(AngleSlider.angleFromPoint(50, 50, 100, 0)).toBe(45)
    expect(AngleSlider.angleFromPoint(50, 50, 100, 50)).toBe(90)
    expect(AngleSlider.angleFromPoint(50, 50, 100, 100)).toBe(135)
    expect(AngleSlider.angleFromPoint(50, 50, 50, 100)).toBe(180)
    expect(AngleSlider.angleFromPoint(50, 50, 0, 100)).toBe(225)
    expect(AngleSlider.angleFromPoint(50, 50, 0, 50)).toBe(270)
    expect(AngleSlider.angleFromPoint(50, 50, 0, 0)).toBe(315)
  })

  it('handles PointerDrag rotation, wrong-pointer ignore, release commit, and Escape/cancel rollback', () => {
    const start = AngleSlider.initialAngle(90)

    // Press at 6 o'clock -> snaps to 180°
    const dragging = step(
      start,
      AngleSlider.BeginAngleDrag({
        pointerId: 1,
        centerX: 50,
        centerY: 50,
        pointX: 50,
        pointY: 100,
      }),
    )
    expect(AngleSlider.isDragging(dragging)).toBe(true)
    expect(AngleSlider.angleOf(dragging)).toBe(180)

    // Move to 9 o'clock -> 270°
    const moved = step(
      dragging,
      AngleSlider.MoveAngleDrag({
        pointerId: 1,
        centerX: 50,
        centerY: 50,
        pointX: 0,
        pointY: 50,
      }),
    )
    expect(AngleSlider.angleOf(moved)).toBe(270)

    // Wrong pointer is ignored
    const ignored = step(
      moved,
      AngleSlider.MoveAngleDrag({
        pointerId: 2,
        centerX: 50,
        centerY: 50,
        pointX: 50,
        pointY: 0,
      }),
    )
    expect(AngleSlider.angleOf(ignored)).toBe(270)

    // Escape cancels drag and restores originAngle (90°)
    const cancelled = step(
      moved,
      AngleSlider.PressedAngleKey({ key: 'Escape' }),
    )
    expect(AngleSlider.isIdle(cancelled)).toBe(true)
    expect(AngleSlider.angleOf(cancelled)).toBe(90)

    // Release commits current angle
    const dragging2 = step(
      start,
      AngleSlider.BeginAngleDrag({
        pointerId: 4,
        centerX: 50,
        centerY: 50,
        pointX: 100,
        pointY: 100,
      }),
    )
    const committed = step(
      dragging2,
      AngleSlider.EndAngleDrag({ pointerId: 4 }),
    )
    expect(AngleSlider.isIdle(committed)).toBe(true)
    expect(AngleSlider.angleOf(committed)).toBe(135)
  })

  it('supports keyboard Arrow/PageUp/PageDown/Home/End wrapping and disabled/readOnly guards', () => {
    const s0 = AngleSlider.initialAngle(0)
    // Wrapping counterclockwise past 0 goes to 345 (step = 15)
    const decWrap = step(s0, AngleSlider.PressedAngleKey({ key: 'ArrowLeft' }))
    expect(AngleSlider.angleOf(decWrap)).toBe(345)

    // Wrapping clockwise past 345 goes to 0
    const incWrap = step(
      decWrap,
      AngleSlider.PressedAngleKey({ key: 'ArrowRight' }),
    )
    expect(AngleSlider.angleOf(incWrap)).toBe(0)

    const pageUp = step(incWrap, AngleSlider.PressedAngleKey({ key: 'PageUp' }))
    expect(AngleSlider.angleOf(pageUp)).toBe(45)

    const pageDown = step(
      pageUp,
      AngleSlider.PressedAngleKey({ key: 'PageDown' }),
    )
    expect(AngleSlider.angleOf(pageDown)).toBe(0)

    const atEnd = step(pageDown, AngleSlider.PressedAngleKey({ key: 'End' }))
    expect(AngleSlider.angleOf(atEnd)).toBe(345)

    const atHome = step(atEnd, AngleSlider.PressedAngleKey({ key: 'Home' }))
    expect(AngleSlider.angleOf(atHome)).toBe(0)

    const reset = step(atHome, AngleSlider.ResetAngle())
    expect(AngleSlider.angleOf(reset)).toBe(90)

    // Disabled and readOnly block changes
    const disabledProps: AngleSlider.Props = { ...baseProps, isDisabled: true }
    expect(
      AngleSlider.angleOf(
        step(reset, AngleSlider.SetAngle({ angle: 180 }), disabledProps),
      ),
    ).toBe(90)
    expect(
      AngleSlider.angleOf(
        step(
          reset,
          AngleSlider.PressedAngleKey({ key: 'ArrowRight' }),
          disabledProps,
        ),
      ),
    ).toBe(90)

    const readOnlyProps: AngleSlider.Props = { ...baseProps, isReadOnly: true }
    expect(
      AngleSlider.angleOf(
        step(reset, AngleSlider.StepAngle({ delta: 30 }), readOnlyProps),
      ),
    ).toBe(90)
  })

  it('projects reference-stable SlotBindings with Slider ARIA and composes with Sampled sync', () => {
    const state = AngleSlider.initialAngle(135)
    const view1 = Part.view(AngleSlider.part, state, baseProps)
    const view2 = Part.view(AngleSlider.part, state, baseProps)
    expect(view1).toBe(view2)

    const rootSlot = view1.slot('Root')
    const controlSlot = view1.slot('Control')
    const thumbSlot = view1.slot('Thumb')

    expect(Slot.ariaOf(thumbSlot)).toMatchObject({
      id: 'gradient-angle-thumb',
      role: 'slider',
      'aria-valuemin': '0',
      'aria-valuemax': '360',
      'aria-valuenow': '135',
      'aria-valuetext': '135°',
      'aria-label': 'Gradient direction',
      tabindex: '0',
    })

    // Updating angle preserves Root and Control binding references
    const nextState = step(state, AngleSlider.SetAngle({ angle: 270 }))
    const nextView = Part.view(AngleSlider.part, nextState, baseProps)
    expect(nextView.slot('Root')).toBe(rootSlot)
    expect(nextView.slot('Control')).toBe(controlSlot)
    expect(nextView.slot('Thumb')).not.toBe(thumbSlot)
    expect(Slot.ariaOf(nextView.slot('Thumb'))['aria-valuetext']).toBe('270°')

    // atRest returns Idle while keeping angle
    const dragging = step(
      nextState,
      AngleSlider.BeginAngleDrag({
        pointerId: 1,
        centerX: 50,
        centerY: 50,
        pointX: 50,
        pointY: 100,
      }),
    )
    const resting = AngleSlider.atRest(dragging)
    expect(AngleSlider.isIdle(resting)).toBe(true)
    expect(AngleSlider.angleOf(resting)).toBe(180)

    const Base = make({
      id: 'angle-slider-test',
      version: 1,
      Model: S.Struct({ ready: S.Boolean }),
      Message: S.Union([
        Catalog.action('Ping', {
          what: 'Pings',
          why: 'To verify',
          meta: { label: 'Ping', keys: [] },
        }),
      ]),
      init: () => [{ ready: true }, []],
      update: model => [model, []],
    })
    const SyncedApp = Part.compose({
      of: Base,
      parts: [
        Part.given(
          AngleSlider.make({ defaultValue: 90, sampleMs: 60 }),
          () => baseProps,
        ),
      ],
    })
    expect(
      SyncedApp.synchronization?.messageCategory(
        AngleSlider.SetAngle({ angle: 45 }),
      ),
    ).toBe('Domain')
    expect(
      SyncedApp.synchronization?.paceOf?.(
        AngleSlider.MoveAngleDrag({
          pointerId: 1,
          centerX: 50,
          centerY: 50,
          pointX: 100,
          pointY: 50,
        }),
      ),
    ).toEqual(Pace.Sampled({ everyMs: 60 }))
    expect(
      SyncedApp.synchronization?.paceOf?.(
        AngleSlider.EndAngleDrag({ pointerId: 1 }),
      ),
    ).toEqual(Pace.Synced())

    const LocalApp = Part.compose({
      of: Base,
      parts: [Part.given(AngleSlider.deviceOnly(), () => baseProps)],
    })
    expect(
      LocalApp.synchronization?.isLocalOnly?.(
        AngleSlider.SetAngle({ angle: 45 }),
      ),
    ).toBe(true)
  })
})
