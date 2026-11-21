import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Slider from '../behavior/slider.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as SliderFixture from '../test/sliderFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Slider Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Slider-specific painter
// logic.

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    attrs?: Readonly<Record<string, string | number | boolean>>
    class?: Readonly<Record<string, boolean>>
    on?: Readonly<Record<string, unknown>>
  }>
  children?: ReadonlyArray<Vnode | string>
  text?: string
}>

const paintedOf = (tree: UiNode, onAction: (tag: string) => void): Vnode => {
  setHtmlRuntime(message => {
    if (typeof message === 'string') {
      onAction(message)
    }
  }, Context.empty())
  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return paintHtml(tree, tag => tag) as unknown as Vnode
  } finally {
    clearHtmlRuntime()
  }
}

const elementOf = (node: Vnode): HTMLElement => {
  const tag = Option.getOrElse(
    Array.head((node.sel ?? 'div').split(/[.#]/u)),
    () => 'div',
  )
  const element = document.createElement(tag === '' ? 'div' : tag)
  Object.entries(node.data?.attrs ?? {}).forEach(([name, value]) => {
    element.setAttribute(name, String(value))
  })
  Object.entries(node.data?.class ?? {}).forEach(([name, isOn]) => {
    if (isOn) {
      element.classList.add(name)
    }
  })
  const clickHandler = node.data?.on?.['click']
  if (typeof clickHandler === 'function') {
    element.addEventListener('click', event => {
      clickHandler(event)
    })
  }
  ;(node.children ?? []).forEach(child => {
    element.append(typeof child === 'string' ? child : elementOf(child))
  })
  if (node.text !== undefined) {
    element.append(node.text)
  }
  return element
}

const roots: Array<HTMLElement> = []

afterEach(() => {
  roots.splice(0).forEach(root => root.remove())
})

const stage = (
  overrides: Partial<Slider.Props> = {},
  options: SliderFixture.FixtureOptions = {},
) => {
  const fixture = SliderFixture.start(overrides, options)
  const root = document.createElement('div')
  document.body.append(root)
  roots.push(root)

  const repaint = (): void => {
    root.replaceChildren(elementOf(paintedOf(fixture.tree(), fixture.press)))
  }
  repaint()

  const elementWith = (selector: string): HTMLElement => {
    const found = root.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted slider fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Slider Part on the HTML generic host', () => {
  it('projects slider WAI-ARIA, handles keyboard stepping, track drag, and Escape cancel through generic slot attributes', () => {
    const staged = stage({}, { formatValue: value => `${value.toString()}%` })

    expect(
      staged
        .elementWith('#fixture-slider-root')
        .getAttribute('aria-orientation'),
    ).toBe('horizontal')
    expect(staged.elementWith('#fixture-slider-track').id).toBe(
      'fixture-slider-track',
    )
    expect(staged.elementWith('#fixture-slider-range').id).toBe(
      'fixture-slider-range',
    )
    expect(staged.elementWith('#fixture-slider-label').id).toBe(
      'fixture-slider-label',
    )

    const thumb = staged.elementWith('#fixture-slider-thumb')
    expect(thumb.getAttribute('role')).toBe('slider')
    expect(thumb.getAttribute('aria-orientation')).toBe('horizontal')
    expect(thumb.getAttribute('aria-valuemin')).toBe('0')
    expect(thumb.getAttribute('aria-valuemax')).toBe('100')
    expect(thumb.getAttribute('aria-valuenow')).toBe('25')
    expect(thumb.getAttribute('aria-valuetext')).toBe('25%')
    expect(thumb.getAttribute('aria-labelledby')).toBe('fixture-slider-label')
    expect(thumb.getAttribute('tabindex')).toBe('0')

    // Click thumb focuses thumb 0; ArrowRight increments by step (5)
    thumb.click()
    staged.fixture.send(Slider.PressedSliderKey({ key: 'ArrowRight' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-slider-thumb').getAttribute('aria-valuenow'),
    ).toBe('30')
    expect(
      staged
        .elementWith('#fixture-slider-thumb')
        .getAttribute('aria-valuetext'),
    ).toBe('30%')

    // Track press snaps, MoveSliderDrag moves, Escape restores pre-drag origin
    staged.fixture.send(
      Slider.PressSliderTrack({ pointerId: 1, x: 70, y: 0, value: 70 }),
    )
    staged.fixture.send(
      Slider.MoveSliderDrag({ pointerId: 1, x: 85, y: 0, value: 85 }),
    )
    staged.repaint()
    expect(
      staged.elementWith('#fixture-slider-thumb').getAttribute('aria-valuenow'),
    ).toBe('85')

    staged.fixture.send(Slider.PressedSliderKey({ key: 'Escape' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-slider-thumb').getAttribute('aria-valuenow'),
    ).toBe('30')

    // Catalog action via generic press token updates value directly
    staged.fixture.press('SetSliderValue:65')
    staged.repaint()
    expect(
      staged.elementWith('#fixture-slider-thumb').getAttribute('aria-valuenow'),
    ).toBe('65')
  })

  it('projects multi-thumb range ARIA bounds, vertical orientation, and disabled/readOnly states', () => {
    const range = stage(
      {
        orientation: 'Vertical',
        minStepsBetweenThumbs: 2,
        thumbLabels: ['Min volume', 'Max volume'],
      },
      { defaultValues: [20, 80] },
    )

    const thumb0 = range.elementWith('#fixture-slider-thumb-0')
    const thumb1 = range.elementWith('#fixture-slider-thumb-1')
    expect(thumb0.getAttribute('role')).toBe('slider')
    expect(thumb0.getAttribute('aria-orientation')).toBe('vertical')
    expect(thumb0.getAttribute('aria-label')).toBe('Min volume')
    expect(thumb0.getAttribute('aria-valuemin')).toBe('0')
    expect(thumb0.getAttribute('aria-valuemax')).toBe('70')
    expect(thumb0.getAttribute('aria-valuenow')).toBe('20')

    expect(thumb1.getAttribute('aria-label')).toBe('Max volume')
    expect(thumb1.getAttribute('aria-valuemin')).toBe('30')
    expect(thumb1.getAttribute('aria-valuemax')).toBe('100')
    expect(thumb1.getAttribute('aria-valuenow')).toBe('80')

    const disabled = stage({ isDisabled: true })
    const disabledThumb = disabled.elementWith('#fixture-slider-thumb')
    expect(disabledThumb.getAttribute('aria-disabled')).toBe('true')
    expect(disabledThumb.getAttribute('tabindex')).toBe('-1')
    disabled.fixture.send(Slider.PressedSliderKey({ key: 'ArrowRight' }))
    disabled.repaint()
    expect(
      disabled
        .elementWith('#fixture-slider-thumb')
        .getAttribute('aria-valuenow'),
    ).toBe('25')

    const readOnly = stage({ isReadOnly: true })
    expect(
      readOnly
        .elementWith('#fixture-slider-thumb')
        .getAttribute('aria-readonly'),
    ).toBe('true')
    readOnly.fixture.send(Slider.PressedSliderKey({ key: 'ArrowRight' }))
    readOnly.repaint()
    expect(
      readOnly
        .elementWith('#fixture-slider-thumb')
        .getAttribute('aria-valuenow'),
    ).toBe('25')
  })
})
