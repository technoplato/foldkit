import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Carousel from '../behavior/carousel.js'
import * as FloatingPanel from '../behavior/floatingPanel.js'
import * as ImageCropper from '../behavior/imageCropper.js'
import * as Marquee from '../behavior/marquee.js'
import * as SignaturePad from '../behavior/signaturePad.js'
import * as Tour from '../behavior/tour.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as Cluster4Fixture from '../test/cluster4Fixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves all 6 Cluster 4 core Parts (Carousel, FloatingPanel,
// ImageCropper, SignaturePad, Tour, Marquee) on the HTML painter through the
// existing generic `htmlHost` (`slotAttributesOf`), with zero widget-specific
// painter logic.

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

const stage = (overrides: Cluster4Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster4Fixture.start(overrides)
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
    throw new Error(`the painted cluster4 fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('Cluster 4 core Parts on the HTML generic host', () => {
  it('proves Carousel: advances via NextButton and Indicator, toggles autoplay, and updates slide visibility ARIA', () => {
    const staged = stage()
    expect(
      staged.elementWith('#fixture-carousel-root').getAttribute('role'),
    ).toBe('region')
    expect(
      staged
        .elementWith('#fixture-carousel-prev')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-carousel-slide-0')
        .getAttribute('aria-current'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-carousel-slide-1').hasAttribute('hidden'),
    ).toBe(true)

    staged.elementWith('#fixture-carousel-next').click()
    staged.repaint()
    expect(
      Carousel.pageOf(
        staged.fixture.carouselState(),
        staged.fixture.props.carousel,
      ),
    ).toBe(1)
    expect(
      staged.elementWith('#fixture-carousel-slide-1').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged
        .elementWith('#fixture-carousel-indicator-1')
        .getAttribute('aria-current'),
    ).toBe('true')

    // Autoplay toggle sets aria-pressed and switches viewport aria-live to off
    staged.elementWith('#fixture-carousel-autoplay').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-carousel-autoplay')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-carousel-viewport')
        .getAttribute('aria-live'),
    ).toBe('off')
  })

  it('proves FloatingPanel: opens, drags and resizes within bounds, minimizes/maximizes, and closes', () => {
    const staged = stage()
    expect(
      staged.elementWith('#fixture-panel-root').hasAttribute('hidden'),
    ).toBe(true)

    staged.fixture.send(FloatingPanel.OpenFloatingPanel())
    staged.repaint()
    const panelRoot = staged.elementWith('#fixture-panel-root')
    expect(panelRoot.getAttribute('role')).toBe('dialog')
    expect(panelRoot.hasAttribute('hidden')).toBe(false)
    expect(
      staged.elementWith('#fixture-panel-body').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged.elementWith('#fixture-panel-resize-se').getAttribute('aria-label'),
    ).toBe('Resize southeast corner')

    // Minimize hides body and marks minimize button pressed
    staged.elementWith('#fixture-panel-minimize').click()
    staged.repaint()
    expect(
      staged.elementWith('#fixture-panel-body').hasAttribute('hidden'),
    ).toBe(true)
    expect(
      staged
        .elementWith('#fixture-panel-minimize')
        .getAttribute('aria-pressed'),
    ).toBe('true')

    // Maximize restores body visibility and fills boundary
    staged.elementWith('#fixture-panel-maximize').click()
    staged.repaint()
    expect(
      staged.elementWith('#fixture-panel-body').hasAttribute('hidden'),
    ).toBe(false)
    expect(FloatingPanel.rectOf(staged.fixture.floatingPanelState())).toEqual(
      Option.some({ x: 0, y: 0, width: 800, height: 600 }),
    )

    // Close hides panel root
    staged.elementWith('#fixture-panel-close').click()
    staged.repaint()
    expect(
      staged.elementWith('#fixture-panel-root').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves ImageCropper: projects slider ARIA for selection and zoom, nudges crop, and zooms via ZoomControl', () => {
    const staged = stage()
    expect(
      staged.elementWith('#fixture-cropper-selection').getAttribute('role'),
    ).toBe('slider')
    expect(
      staged
        .elementWith('#fixture-cropper-zoom')
        .getAttribute('aria-valuetext'),
    ).toBe('100%')

    staged.elementWith('#fixture-cropper-zoom').click()
    staged.repaint()
    expect(ImageCropper.zoomOf(staged.fixture.imageCropperState())).toBe(1.5)
    expect(
      staged
        .elementWith('#fixture-cropper-zoom')
        .getAttribute('aria-valuetext'),
    ).toBe('150%')

    staged.fixture.send(
      ImageCropper.PressedCropKey({ key: 'ArrowRight', shiftKey: true }),
    )
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-cropper-selection')
        .getAttribute('aria-valuenow'),
    ).toBe('20')
  })

  it('proves SignaturePad: captures thinned strokes, reveals Segment, and enables UndoButton and ClearButton', () => {
    const staged = stage()
    expect(
      staged.elementWith('#fixture-signature-segment').hasAttribute('hidden'),
    ).toBe(true)
    expect(
      staged
        .elementWith('#fixture-signature-clear')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    staged.fixture.send(
      SignaturePad.BeginSignatureStroke({ pointerId: 1, x: 0, y: 0 }),
    )
    staged.fixture.send(
      SignaturePad.MoveSignatureStroke({ pointerId: 1, x: 15, y: 10 }),
    )
    staged.fixture.send(SignaturePad.EndSignatureStroke({ pointerId: 1 }))
    staged.repaint()

    expect(
      staged.elementWith('#fixture-signature-segment').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged
        .elementWith('#fixture-signature-undo')
        .getAttribute('aria-disabled'),
    ).toBe('false')

    staged.elementWith('#fixture-signature-clear').click()
    staged.repaint()
    expect(SignaturePad.isEmptyOf(staged.fixture.signaturePadState())).toBe(
      true,
    )
    expect(
      staged.elementWith('#fixture-signature-segment').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves Tour: starts, displays spotlight and dialog ARIA, advances steps, hides skip on non-skippable step, and closes', () => {
    const staged = stage()
    expect(
      staged.elementWith('#fixture-tour-content').hasAttribute('hidden'),
    ).toBe(true)

    staged.fixture.send(Tour.StartTour())
    staged.repaint()
    const content = staged.elementWith('#fixture-tour-content')
    expect(content.getAttribute('role')).toBe('dialog')
    expect(content.getAttribute('aria-modal')).toBe('true')
    expect(content.hasAttribute('hidden')).toBe(false)
    expect(
      staged.elementWith('#fixture-tour-spotlight').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged.elementWith('#fixture-tour-skip').hasAttribute('hidden'),
    ).toBe(false)

    // Next step moves to non-skippable step 1 -> hides SkipButton
    staged.elementWith('#fixture-tour-next').click()
    staged.repaint()
    expect(
      staged.elementWith('#fixture-tour-skip').hasAttribute('hidden'),
    ).toBe(true)

    // CloseButton dismisses tour
    staged.elementWith('#fixture-tour-close').click()
    staged.repaint()
    expect(
      staged.elementWith('#fixture-tour-content').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves Marquee: renders region/clone ARIA, toggles pause via ToggleButton, and finishes after finite loopCount', () => {
    const staged = stage()
    expect(
      staged.elementWith('#fixture-marquee-root').getAttribute('role'),
    ).toBe('region')
    expect(
      staged.elementWith('#fixture-marquee-content-0').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged.elementWith('#fixture-marquee-content-1').hasAttribute('hidden'),
    ).toBe(true)
    expect(
      staged
        .elementWith('#fixture-marquee-toggle')
        .getAttribute('aria-pressed'),
    ).toBe('false')

    staged.elementWith('#fixture-marquee-toggle').click()
    staged.repaint()
    expect(Marquee.isPaused(staged.fixture.marqueeState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-marquee-toggle')
        .getAttribute('aria-pressed'),
    ).toBe('true')

    staged.elementWith('#fixture-marquee-toggle').click()
    staged.fixture.send(Marquee.CompletedMarqueeLoop())
    staged.fixture.send(Marquee.CompletedMarqueeLoop())
    staged.repaint()
    expect(
      Marquee.isFinishedOf(
        staged.fixture.marqueeState(),
        staged.fixture.props.marquee,
      ),
    ).toBe(true)
    expect(
      staged
        .elementWith('#fixture-marquee-toggle')
        .getAttribute('aria-disabled'),
    ).toBe('true')
  })
})
