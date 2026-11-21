import {
  AngleSlider,
  ColorPicker,
  ScrollArea,
  Splitter,
  TableOfContents,
  TimedHint,
} from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { Cluster3Fixture } from 'foldkit/test'
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

// NOTE: proves all six Cluster 3 core Parts (Steps, TableOfContents,
// ScrollArea, Splitter, AngleSlider, ColorPicker) on the React Native painter
// through the existing generic RN host (`interaction/host.ts`), with zero
// widget-specific painter logic.

const stage = (overrides: Cluster3Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster3Fixture.start(overrides)
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

describe('Cluster 3 core Parts on the React Native generic host', () => {
  it('paints Steps (#38) and TableOfContents (#39) accessibility state and handles presses', () => {
    const staged = stage()

    // Steps
    expect(propsOf(staged.buttonNamed('Shipping'))['accessibilityRole']).toBe(
      'tab',
    )
    expect(
      propsOf(staged.buttonNamed('Shipping'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(staged.viewWithId('fixture-steps-content-1'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    callProp(staged.buttonNamed('Next step'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Payment'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(staged.viewWithId('fixture-steps-content-1'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    // TableOfContents
    expect(
      propsOf(staged.buttonNamed('Introduction'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    callProp(staged.buttonNamed('API'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('API'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    staged.fixture.send(
      TableOfContents.ObserveScroll({
        scrollTop: 390,
        positions: { intro: 0, guide: 400, api: 900 },
      }),
    )
    expect(
      propsOf(staged.buttonNamed('Guide'))['accessibilityState'],
    ).toMatchObject({ selected: true })
  })

  it('paints ScrollArea (#40) and Splitter (#41) adjustable accessibility values and collapse state', () => {
    const staged = stage()

    // ScrollArea
    expect(
      propsOf(staged.viewWithId('fixture-scroll-scrollbar'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    staged.fixture.send(ScrollArea.BeginThumbDrag({ pointerId: 1, x: 0, y: 0 }))
    staged.fixture.send(ScrollArea.MoveThumbDrag({ pointerId: 1, x: 0, y: 80 }))
    const scrollbar = staged.viewWithId('fixture-scroll-scrollbar')
    expect(propsOf(scrollbar)['accessibilityRole']).toBe('adjustable')
    expect(propsOf(scrollbar)['accessibilityElementsHidden']).toBeUndefined()
    expect(propsOf(scrollbar)['accessibilityValue']).toEqual({
      min: 0,
      max: 800,
      now: 400,
    })

    staged.fixture.send(ScrollArea.EndThumbDrag({ pointerId: 1 }))
    const version = TimedHint.versionOf(
      staged.fixture.scrollAreaState().hideHint,
    )
    staged.fixture.send(ScrollArea.ElapsedScrollbarHide({ version }))
    expect(
      propsOf(staged.viewWithId('fixture-scroll-scrollbar'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    // Splitter
    const handle = staged.buttonNamed('Resize divider')
    expect(propsOf(handle)['accessibilityRole']).toBe('adjustable')
    expect(propsOf(handle)['accessibilityValue']).toEqual({
      min: 0,
      max: 60,
      now: 30,
      text: '30%',
    })

    staged.fixture.send(
      Splitter.PressedSplitterKey({ handleIndex: 0, key: 'ArrowRight' }),
    )
    expect(
      propsOf(staged.buttonNamed('Resize divider'))['accessibilityValue'],
    ).toEqual({
      min: 0,
      max: 60,
      now: 35,
      text: '35%',
    })

    callProp(staged.buttonNamed('Resize divider'), 'onPress')
    expect(
      propsOf(staged.viewWithId('fixture-splitter-panel-sidebar'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)
  })

  it('paints AngleSlider (#42) and ColorPicker (#43) adjustable values, swatches, and popup visibility', () => {
    const staged = stage()

    // AngleSlider
    const angleThumb = staged.buttonNamed('Angle dial')
    expect(propsOf(angleThumb)['accessibilityRole']).toBe('adjustable')
    expect(propsOf(angleThumb)['accessibilityValue']).toEqual({
      min: 0,
      max: 360,
      now: 90,
      text: '90°',
    })

    staged.fixture.send(AngleSlider.PressedAngleKey({ key: 'ArrowRight' }))
    expect(
      propsOf(staged.buttonNamed('Angle dial'))['accessibilityValue'],
    ).toEqual({
      min: 0,
      max: 360,
      now: 105,
      text: '105°',
    })

    // ColorPicker
    expect(
      propsOf(staged.viewWithId('fixture-color-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)

    callProp(staged.buttonNamed('Color trigger'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Color trigger'))['accessibilityState'],
    ).toMatchObject({ expanded: true })
    expect(
      propsOf(staged.viewWithId('fixture-color-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBeUndefined()

    callProp(staged.buttonNamed('#00ff00'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('#00ff00'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(staged.buttonNamed('Hue channel'))['accessibilityValue'],
    ).toEqual({
      min: 0,
      max: 360,
      now: 120,
      text: '120°',
    })

    staged.fixture.send(ColorPicker.PressedColorPickerKey({ key: 'Escape' }))
    expect(
      propsOf(staged.viewWithId('fixture-color-content'))[
        'accessibilityElementsHidden'
      ],
    ).toBe(true)
  })
})
