import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as AngleSlider from '../behavior/angleSlider.js'
import * as ColorPicker from '../behavior/colorPicker.js'
import * as ScrollArea from '../behavior/scrollArea.js'
import * as Splitter from '../behavior/splitter.js'
import * as TableOfContents from '../behavior/tableOfContents.js'
import * as TimedHint from '../behavior/timedHint.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as Cluster3Fixture from '../test/cluster3Fixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves all six Cluster 3 core Parts (Steps, TableOfContents,
// ScrollArea, Splitter, AngleSlider, ColorPicker) on the HTML painter through
// the existing generic `htmlHost` (`slotAttributesOf`), with zero
// widget-specific painter logic.

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

const stage = (overrides: Cluster3Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster3Fixture.start(overrides)
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
    throw new Error(`the painted cluster3 fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('Cluster 3 core Parts on the HTML generic host', () => {
  it('proves Steps (#38) and TableOfContents (#39) ARIA and interaction through generic slot attributes', () => {
    const staged = stage()

    // Steps: initial step 0 active, content 1 hidden, Next advances
    expect(
      staged
        .elementWith('#fixture-steps-root')
        .getAttribute('aria-orientation'),
    ).toBe('horizontal')
    expect(
      staged
        .elementWith('#fixture-steps-trigger-0')
        .getAttribute('aria-current'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-steps-content-1').hasAttribute('hidden'),
    ).toBe(true)

    staged.elementWith('#fixture-steps-next').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-steps-trigger-1')
        .getAttribute('aria-current'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-steps-content-1').hasAttribute('hidden'),
    ).toBe(false)

    // TableOfContents: initial intro active, scroll-spy activates guide, click selects api
    expect(
      staged
        .elementWith('#fixture-toc-item-intro')
        .getAttribute('aria-current'),
    ).toBe('true')
    staged.fixture.send(
      TableOfContents.ObserveScroll({
        scrollTop: 390,
        positions: { intro: 0, guide: 400, api: 900 },
      }),
    )
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-toc-item-guide')
        .getAttribute('aria-current'),
    ).toBe('true')

    staged.elementWith('#fixture-toc-item-api').click()
    staged.repaint()
    expect(
      staged.elementWith('#fixture-toc-item-api').getAttribute('aria-current'),
    ).toBe('true')
  })

  it('proves ScrollArea (#40) and Splitter (#41) ARIA, thumb drag, auto-hide, and collapse through generic slot attributes', () => {
    const staged = stage()

    // ScrollArea: Scroll visibility starts hidden, thumb drag reveals and updates valueNow, elapsed hides
    expect(
      staged.elementWith('#fixture-scroll-scrollbar').hasAttribute('hidden'),
    ).toBe(true)

    staged.fixture.send(ScrollArea.BeginThumbDrag({ pointerId: 1, x: 0, y: 0 }))
    staged.fixture.send(ScrollArea.MoveThumbDrag({ pointerId: 1, x: 0, y: 80 }))
    staged.repaint()
    const scrollbar = staged.elementWith('#fixture-scroll-scrollbar')
    expect(scrollbar.hasAttribute('hidden')).toBe(false)
    expect(scrollbar.getAttribute('role')).toBe('slider')
    expect(scrollbar.getAttribute('aria-valuenow')).toBe('400')

    staged.fixture.send(ScrollArea.EndThumbDrag({ pointerId: 1 }))
    expect(staged.fixture.lastCommandNames()).toContain('WaitForScrollbarHide')
    const version = TimedHint.versionOf(
      staged.fixture.scrollAreaState().hideHint,
    )
    staged.fixture.send(ScrollArea.ElapsedScrollbarHide({ version }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-scroll-scrollbar').hasAttribute('hidden'),
    ).toBe(true)

    // Splitter: ResizeTrigger projects role=slider, keyboard + Enter collapse/expand update ARIA
    const handle = staged.elementWith('#fixture-splitter-handle-0')
    expect(handle.getAttribute('role')).toBe('slider')
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal')
    expect(handle.getAttribute('aria-valuemin')).toBe('0')
    expect(handle.getAttribute('aria-valuemax')).toBe('60')
    expect(handle.getAttribute('aria-valuenow')).toBe('30')

    staged.fixture.send(
      Splitter.PressedSplitterKey({ handleIndex: 0, key: 'ArrowRight' }),
    )
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-splitter-handle-0')
        .getAttribute('aria-valuenow'),
    ).toBe('35')

    staged.elementWith('#fixture-splitter-handle-0').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-splitter-handle-0')
        .getAttribute('aria-valuenow'),
    ).toBe('0')
    expect(
      staged
        .elementWith('#fixture-splitter-panel-sidebar')
        .hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves AngleSlider (#42) and ColorPicker (#43) ARIA, drag, swatches, and popup dismissal through generic slot attributes', () => {
    const staged = stage()

    // AngleSlider: 0..360 slider ARIA with degree valueText, drag and keyboard updates
    const angleThumb = staged.elementWith('#fixture-angle-thumb')
    expect(angleThumb.getAttribute('role')).toBe('slider')
    expect(angleThumb.getAttribute('aria-valuemin')).toBe('0')
    expect(angleThumb.getAttribute('aria-valuemax')).toBe('360')
    expect(angleThumb.getAttribute('aria-valuenow')).toBe('90')
    expect(angleThumb.getAttribute('aria-valuetext')).toBe('90°')

    staged.fixture.send(
      AngleSlider.BeginAngleDrag({
        pointerId: 1,
        centerX: 50,
        centerY: 50,
        pointX: 50,
        pointY: 100,
      }),
    )
    staged.repaint()
    expect(
      staged.elementWith('#fixture-angle-thumb').getAttribute('aria-valuetext'),
    ).toBe('180°')

    staged.fixture.send(AngleSlider.EndAngleDrag({ pointerId: 1 }))
    staged.fixture.send(AngleSlider.PressedAngleKey({ key: 'PageUp' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-angle-thumb').getAttribute('aria-valuenow'),
    ).toBe('225')

    // ColorPicker: closed initially, click Trigger opens Dialog, click swatch updates color, Escape dismisses
    expect(
      staged.elementWith('#fixture-color-content').hasAttribute('hidden'),
    ).toBe(true)
    staged.elementWith('#fixture-color-trigger').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-color-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-color-content').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged.elementWith('#fixture-color-content').getAttribute('role'),
    ).toBe('dialog')

    staged.elementWith('#fixture-color-swatch-00ff00').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-color-swatch-00ff00')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-color-channel-hue')
        .getAttribute('aria-valuenow'),
    ).toBe('120')

    staged.fixture.send(ColorPicker.PressedColorPickerKey({ key: 'Escape' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-color-content').hasAttribute('hidden'),
    ).toBe(true)
  })
})
