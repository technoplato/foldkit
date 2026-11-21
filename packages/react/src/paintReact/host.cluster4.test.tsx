import { Option } from 'effect'
import {
  Carousel,
  FloatingPanel,
  ImageCropper,
  Marquee,
  SignaturePad,
  Tour,
} from 'foldkit/behavior'
import { Cluster4Fixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves all 6 Cluster 4 core Parts (Carousel, FloatingPanel,
// ImageCropper, SignaturePad, Tour, Marquee) on the React painter through the
// existing generic React host (`paintReact/host.tsx`), with zero
// widget-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Cluster4Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster4Fixture.start(overrides)
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
    throw new Error(`the painted cluster4 fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('Cluster 4 core Parts on the React generic host', () => {
  it('proves Carousel: navigates via NextButton and Indicator and toggles autoplay', () => {
    const staged = stage()
    fireEvent.click(staged.elementWith('#fixture-carousel-next'))
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

    fireEvent.click(staged.elementWith('#fixture-carousel-indicator-2'))
    staged.repaint()
    expect(
      Carousel.pageOf(
        staged.fixture.carouselState(),
        staged.fixture.props.carousel,
      ),
    ).toBe(2)

    fireEvent.click(staged.elementWith('#fixture-carousel-prev'))
    staged.repaint()
    fireEvent.click(staged.elementWith('#fixture-carousel-autoplay'))
    staged.repaint()
    expect(Carousel.isAutoplaying(staged.fixture.carouselState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-carousel-autoplay')
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('proves FloatingPanel: opens, resizes SE handle, minimizes/restores, and closes', () => {
    const staged = stage()
    staged.fixture.send(FloatingPanel.OpenFloatingPanel())
    staged.repaint()
    expect(staged.elementWith('#fixture-panel-root').getAttribute('role')).toBe(
      'dialog',
    )

    staged.fixture.send(
      FloatingPanel.BeginFloatingPanelResize({
        pointerId: 1,
        axis: 'SE',
        x: 420,
        y: 320,
      }),
    )
    staged.fixture.send(
      FloatingPanel.MoveFloatingPanelResize({ pointerId: 1, x: 470, y: 360 }),
    )
    staged.fixture.send(FloatingPanel.EndFloatingPanelResize({ pointerId: 1 }))
    staged.repaint()
    expect(FloatingPanel.sizeOf(staged.fixture.floatingPanelState())).toEqual(
      Option.some({ width: 370, height: 280 }),
    )

    fireEvent.click(staged.elementWith('#fixture-panel-minimize'))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-panel-body').hasAttribute('hidden'),
    ).toBe(true)

    fireEvent.click(staged.elementWith('#fixture-panel-close'))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-panel-root').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves ImageCropper: zooms via ZoomControl and updates selection slider ARIA on resize', () => {
    const staged = stage()
    fireEvent.click(staged.elementWith('#fixture-cropper-zoom'))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-cropper-zoom').getAttribute('aria-valuenow'),
    ).toBe('1.5')

    staged.fixture.send(
      ImageCropper.BeginCropDrag({ pointerId: 1, x: 0, y: 0 }),
    )
    staged.fixture.send(
      ImageCropper.MoveCropDrag({ pointerId: 1, x: 50, y: 40 }),
    )
    staged.fixture.send(ImageCropper.EndCropDrag({ pointerId: 1 }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-cropper-selection')
        .getAttribute('aria-valuenow'),
    ).toBe('50')
  })

  it('proves SignaturePad: draws stroke, reveals Segment, undoes via UndoButton', () => {
    const staged = stage()
    staged.fixture.send(
      SignaturePad.BeginSignatureStroke({ pointerId: 1, x: 0, y: 0 }),
    )
    staged.fixture.send(
      SignaturePad.MoveSignatureStroke({ pointerId: 1, x: 10, y: 15 }),
    )
    staged.fixture.send(SignaturePad.EndSignatureStroke({ pointerId: 1 }))
    staged.repaint()

    expect(
      staged.elementWith('#fixture-signature-segment').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      SignaturePad.allPathsOf(staged.fixture.signaturePadState()),
    ).toHaveLength(1)

    fireEvent.click(staged.elementWith('#fixture-signature-undo'))
    staged.repaint()
    expect(SignaturePad.isEmptyOf(staged.fixture.signaturePadState())).toBe(
      true,
    )
    expect(
      staged.elementWith('#fixture-signature-segment').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves Tour: starts, advances to completion via NextButton, and updates spotlight visibility', () => {
    const staged = stage()
    staged.fixture.send(Tour.StartTour())
    staged.repaint()
    expect(
      staged.elementWith('#fixture-tour-content').getAttribute('role'),
    ).toBe('dialog')
    expect(
      staged.elementWith('#fixture-tour-spotlight').hasAttribute('hidden'),
    ).toBe(false)

    // Step 0 -> Step 1 -> Step 2 (no targetRect -> spotlight hidden) -> Complete
    fireEvent.click(staged.elementWith('#fixture-tour-next'))
    staged.repaint()
    fireEvent.click(staged.elementWith('#fixture-tour-next'))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-tour-spotlight').hasAttribute('hidden'),
    ).toBe(true)
    expect(
      staged.elementWith('#fixture-tour-next').getAttribute('aria-label'),
    ).toBe('Finish tour')

    fireEvent.click(staged.elementWith('#fixture-tour-next'))
    staged.repaint()
    expect(Tour.endedReasonOf(staged.fixture.tourState())).toEqual(
      Option.some('Completed'),
    )
    expect(
      staged.elementWith('#fixture-tour-content').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves Marquee: toggles pause via ToggleButton and pauses/resumes on hover', () => {
    const staged = stage()
    fireEvent.click(staged.elementWith('#fixture-marquee-toggle'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-marquee-toggle')
        .getAttribute('aria-pressed'),
    ).toBe('true')

    fireEvent.click(staged.elementWith('#fixture-marquee-toggle'))
    staged.repaint()
    expect(Marquee.isRunning(staged.fixture.marqueeState())).toBe(true)

    staged.fixture.send(Marquee.EnteredMarquee())
    staged.repaint()
    expect(Marquee.isPaused(staged.fixture.marqueeState())).toBe(true)

    staged.fixture.send(Marquee.LeftMarquee())
    staged.repaint()
    expect(Marquee.isRunning(staged.fixture.marqueeState())).toBe(true)
  })
})
