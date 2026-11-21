// @vitest-environment happy-dom
import { Option } from 'effect'
import { describe, expect, it, vi } from 'vitest'

import { bindSurfaceDrag } from './htmlSurfaceDrag.js'

describe('htmlSurfaceDrag', () => {
  it('snapshots rect once on pointerdown, ignores 2nd-finger multi-touch, defers threshold capture, and routes pointercancel + lostpointercapture to onCancel', () => {
    const surface = document.createElement('div')
    let rectReads = 0
    vi.spyOn(surface, 'getBoundingClientRect').mockImplementation(() => {
      rectReads += 1
      return new DOMRect(10, 20, 200, 100)
    })
    const captureSpy = vi.fn()
    surface.setPointerCapture = captureSpy

    const events: Array<string> = []
    const unbind = bindSurfaceDrag<string>(
      surface,
      {
        name: 'TestDrag',
        thresholdPx: 8,
        onStart: sample =>
          Option.some(`start:${sample.pointerId}:${sample.ratioX}`),
        onMove: sample =>
          Option.some(`move:${sample.pointerId}:${sample.ratioX}`),
        onEnd: sample => Option.some(`end:${sample.pointerId}`),
        onCancel: sample => Option.some(`cancel:${sample.pointerId}`),
      },
      msg => {
        events.push(msg)
      },
    )

    try {
      // Idle mouse hover emits nothing and never reads rect
      surface.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'mouse',
          clientX: 50,
          clientY: 50,
        }),
      )
      expect(events).toEqual([])
      expect(rectReads).toBe(0)

      // Finger 1 down: thresholdPx = 8 defers setPointerCapture so child buttons still click
      surface.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: 110,
          clientY: 70,
        }),
      )
      expect(rectReads).toBe(1)
      expect(captureSpy).not.toHaveBeenCalled()
      expect(events).toEqual(['start:1:0.5'])

      // Finger 2 down + move is completely ignored (preserves browser pinch-zoom)
      surface.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 2,
          pointerType: 'touch',
          clientX: 30,
          clientY: 30,
        }),
      )
      surface.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 2,
          pointerType: 'touch',
          clientX: 40,
          clientY: 40,
        }),
      )
      expect(events).toEqual(['start:1:0.5'])

      // Finger 1 moves past 8px threshold -> captures pointer 1, zero extra rect reads!
      surface.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: 210,
          clientY: 70,
        }),
      )
      expect(rectReads).toBe(1)
      expect(captureSpy).toHaveBeenCalledWith(1)
      expect(events).toEqual(['start:1:0.5', 'move:1:1'])

      // lostpointercapture routes to onCancel and resets active pointer so next drag works
      surface.dispatchEvent(
        new PointerEvent('lostpointercapture', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: 210,
          clientY: 70,
        }),
      )
      expect(events).toEqual(['start:1:0.5', 'move:1:1', 'cancel:1'])

      // Subsequent drag starts cleanly and pointercancel also routes to onCancel
      surface.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 3,
          pointerType: 'touch',
          clientX: 10,
          clientY: 20,
        }),
      )
      surface.dispatchEvent(
        new PointerEvent('pointercancel', {
          pointerId: 3,
          pointerType: 'touch',
          clientX: 10,
          clientY: 20,
        }),
      )
      expect(events).toEqual([
        'start:1:0.5',
        'move:1:1',
        'cancel:1',
        'start:3:0',
        'cancel:3',
      ])
    } finally {
      unbind()
    }
  })
})
