import { Option } from 'effect'
import {
  Carousel,
  FloatingPanel,
  ImageCropper,
  Marquee,
  SignaturePad,
  Tour,
} from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { Cluster4Fixture } from 'foldkit/test'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { callProp, firstOf, hostsOf, propsOf } from '../test/elements.js'
import { paintTree } from './screen.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)
vi.mock('../theme/themed.js', async () => {
  const { lightLook: look } = await import('./look.js')
  return { useLook: () => look }
})

// NOTE: proves all 6 Cluster 4 core Parts (Carousel, FloatingPanel,
// ImageCropper, SignaturePad, Tour, Marquee) on the React Native painter
// through the existing generic RN host (`interaction/host.ts`), with zero
// widget-specific painter logic.

const stage = (overrides: Cluster4Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster4Fixture.start(overrides)
  const onPress = (button: ButtonNode): void => {
    const tag = button.action ?? button.token
    if (tag !== undefined) {
      fixture.press(tag)
    }
  }
  const painted = (): ReactElement => paintTree(fixture.tree(), { onPress })
  const buttonNamed = (label: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'Pressable'),
      element => propsOf(element)['accessibilityLabel'] === label,
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, buttonNamed, viewWithId }
}

describe('Cluster 4 core Parts on the React Native generic host', () => {
  it('proves Carousel: advances via Next slide press, toggles autoplay, and updates hidden slide accessibility', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-carousel-slide-1'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    callProp(staged.buttonNamed('Next slide'), 'onPress')
    expect(
      Carousel.pageOf(
        staged.fixture.carouselState(),
        staged.fixture.props.carousel,
      ),
    ).toBe(1)
    expect(
      propsOf(staged.viewWithId('fixture-carousel-slide-1'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    callProp(staged.buttonNamed('Toggle autoplay'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Toggle autoplay'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(staged.viewWithId('fixture-carousel-viewport'))[
        'accessibilityLiveRegion'
      ],
    ).toBe('none')
  })

  it('proves FloatingPanel: opens, minimizes hiding body view, maximizes, and closes via press', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-panel-root'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    callProp(staged.buttonNamed('Open panel'), 'onPress')
    expect(
      propsOf(staged.viewWithId('fixture-panel-root'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    callProp(staged.buttonNamed('Minimize panel'), 'onPress')
    expect(
      propsOf(staged.viewWithId('fixture-panel-body'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    callProp(staged.buttonNamed('Maximize panel'), 'onPress')
    expect(FloatingPanel.stageOf(staged.fixture.floatingPanelState())).toBe(
      'Maximized',
    )
    expect(
      propsOf(staged.viewWithId('fixture-panel-body'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    callProp(staged.buttonNamed('Close panel'), 'onPress')
    expect(FloatingPanel.isOpen(staged.fixture.floatingPanelState())).toBe(
      false,
    )
  })

  it('proves ImageCropper: paints adjustable slider accessibility value and zooms via Zoom in crop press', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-cropper-selection'))[
        'accessibilityRole'
      ],
    ).toBe('adjustable')
    expect(
      propsOf(staged.buttonNamed('Zoom in crop'))['accessibilityValue'],
    ).toMatchObject({ min: 1, max: 4, now: 1, text: '100%' })

    callProp(staged.buttonNamed('Zoom in crop'), 'onPress')
    expect(ImageCropper.zoomOf(staged.fixture.imageCropperState())).toBe(1.5)
    expect(
      propsOf(staged.buttonNamed('Zoom in crop'))['accessibilityValue'],
    ).toMatchObject({ now: 1.5, text: '150%' })
  })

  it('proves SignaturePad: draws stroke, unhides Segment view, and clears via Clear signature press', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-signature-segment'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    staged.fixture.send(
      SignaturePad.BeginSignatureStroke({ pointerId: 1, x: 0, y: 0 }),
    )
    staged.fixture.send(
      SignaturePad.MoveSignatureStroke({ pointerId: 1, x: 20, y: 12 }),
    )
    staged.fixture.send(SignaturePad.EndSignatureStroke({ pointerId: 1 }))
    expect(
      propsOf(staged.viewWithId('fixture-signature-segment'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    callProp(staged.buttonNamed('Clear signature'), 'onPress')
    expect(SignaturePad.isEmptyOf(staged.fixture.signaturePadState())).toBe(
      true,
    )
    expect(
      propsOf(staged.viewWithId('fixture-signature-segment'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)
  })

  it('proves Tour: starts via press, unhides dialog and spotlight, steps forward, and dismisses via Close tour', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-tour-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    callProp(staged.buttonNamed('Start tour'), 'onPress')
    expect(
      propsOf(staged.viewWithId('fixture-tour-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()
    expect(
      propsOf(staged.viewWithId('fixture-tour-spotlight'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    callProp(staged.buttonNamed('Next step'), 'onPress')
    expect(
      Tour.stepIndexOf(staged.fixture.tourState(), staged.fixture.props.tour),
    ).toEqual(Option.some(1))

    callProp(staged.buttonNamed('Close tour'), 'onPress')
    expect(Tour.isIdle(staged.fixture.tourState())).toBe(true)
    expect(
      propsOf(staged.viewWithId('fixture-tour-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)
  })

  it('proves Marquee: hides clone track, toggles pause via Toggle marquee press, and tracks finite completion', () => {
    const staged = stage()
    expect(
      propsOf(staged.viewWithId('fixture-marquee-content-1'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    callProp(staged.buttonNamed('Toggle marquee'), 'onPress')
    expect(Marquee.isPaused(staged.fixture.marqueeState())).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Toggle marquee'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    callProp(staged.buttonNamed('Toggle marquee'), 'onPress')
    staged.fixture.send(Marquee.CompletedMarqueeLoop())
    staged.fixture.send(Marquee.CompletedMarqueeLoop())
    expect(
      Marquee.isFinishedOf(
        staged.fixture.marqueeState(),
        staged.fixture.props.marquee,
      ),
    ).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Toggle marquee'))['accessibilityState'],
    ).toMatchObject({ disabled: true })
  })
})
