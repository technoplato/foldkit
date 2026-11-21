import { Slider } from 'foldkit/behavior'
import { SliderFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Slider Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Slider-specific painter
// logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (
  overrides: Partial<Slider.Props> = {},
  options: SliderFixture.FixtureOptions = {},
) => {
  const fixture = SliderFixture.start(overrides, options)
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        const tag = button.action ?? button.token
        if (tag !== undefined) {
          fixture.press(tag)
        }
      },
    })
  const view = render(painted())
  const repaint = (): void => {
    act(() => {
      view.rerender(painted())
    })
  }
  const elementWith = (selector: string): HTMLElement => {
    const found = view.container.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted slider fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Slider Part on the React generic host', () => {
  it('projects slider WAI-ARIA, handles stepping, drag move/release, and Escape cancel', () => {
    const staged = stage({}, { formatValue: value => `${value.toString()}%` })

    expect(
      staged
        .elementWith('#fixture-slider-root')
        .getAttribute('aria-orientation'),
    ).toBe('horizontal')
    const thumb = staged.elementWith('#fixture-slider-thumb')
    expect(thumb.getAttribute('role')).toBe('slider')
    expect(thumb.getAttribute('aria-valuemin')).toBe('0')
    expect(thumb.getAttribute('aria-valuemax')).toBe('100')
    expect(thumb.getAttribute('aria-valuenow')).toBe('25')
    expect(thumb.getAttribute('aria-valuetext')).toBe('25%')
    expect(thumb.getAttribute('aria-labelledby')).toBe('fixture-slider-label')
    expect(thumb.getAttribute('tabindex')).toBe('0')

    // Click thumb to focus, then step via keyboard
    fireEvent.click(thumb)
    staged.fixture.send(Slider.PressedSliderKey({ key: 'ArrowRight' }))
    staged.repaint()
    expect(Slider.valueOf(staged.fixture.sliderState())).toBe(30)
    expect(
      staged.elementWith('#fixture-slider-thumb').getAttribute('aria-valuenow'),
    ).toBe('30')
    expect(
      staged
        .elementWith('#fixture-slider-thumb')
        .getAttribute('aria-valuetext'),
    ).toBe('30%')

    // Track press + drag move + release commits new value
    staged.fixture.send(
      Slider.PressSliderTrack({ pointerId: 1, x: 60, y: 0, value: 60 }),
    )
    staged.fixture.send(
      Slider.MoveSliderDrag({ pointerId: 1, x: 75, y: 0, value: 75 }),
    )
    staged.fixture.send(Slider.ReleaseSliderDrag({ pointerId: 1 }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-slider-thumb').getAttribute('aria-valuenow'),
    ).toBe('75')

    // Escape during drag restores pre-drag value
    staged.fixture.send(
      Slider.PressSliderTrack({ pointerId: 2, x: 10, y: 0, value: 10 }),
    )
    staged.fixture.send(Slider.PressedSliderKey({ key: 'Escape' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-slider-thumb').getAttribute('aria-valuenow'),
    ).toBe('75')
  })

  it('projects multi-thumb range ARIA bounds', () => {
    const range = stage(
      {
        minStepsBetweenThumbs: 2,
        thumbLabels: ['Start', 'End'],
      },
      { defaultValues: [20, 80] },
    )

    expect(
      range
        .elementWith('#fixture-slider-thumb-0')
        .getAttribute('aria-valuemax'),
    ).toBe('70')
    expect(
      range
        .elementWith('#fixture-slider-thumb-1')
        .getAttribute('aria-valuemin'),
    ).toBe('30')

    range.fixture.send(
      Slider.StepSlider({ direction: 'StepIncrement', thumbIndex: 0 }),
    )
    range.repaint()
    expect(
      range
        .elementWith('#fixture-slider-thumb-0')
        .getAttribute('aria-valuenow'),
    ).toBe('25')
    expect(
      range
        .elementWith('#fixture-slider-thumb-1')
        .getAttribute('aria-valuemin'),
    ).toBe('35')
  })

  it('projects disabled ARIA and blocks updates when disabled', () => {
    const disabled = stage({ isDisabled: true })
    expect(
      disabled
        .elementWith('#fixture-slider-thumb')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    disabled.fixture.send(Slider.SetSliderValue({ value: 90 }))
    disabled.repaint()
    expect(
      disabled
        .elementWith('#fixture-slider-thumb')
        .getAttribute('aria-valuenow'),
    ).toBe('25')
  })

  it('projects readOnly ARIA and blocks updates when readOnly', () => {
    const readOnly = stage({ isReadOnly: true })
    expect(
      readOnly
        .elementWith('#fixture-slider-thumb')
        .getAttribute('aria-readonly'),
    ).toBe('true')
    readOnly.fixture.send(Slider.SetSliderValue({ value: 90 }))
    readOnly.repaint()
    expect(
      readOnly
        .elementWith('#fixture-slider-thumb')
        .getAttribute('aria-valuenow'),
    ).toBe('25')
  })
})
