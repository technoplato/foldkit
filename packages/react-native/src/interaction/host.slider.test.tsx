import { Slider } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { SliderFixture } from 'foldkit/test'
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

// NOTE: proves the core Slider Part on the React Native painter through the
// existing generic RN host (`interaction/host.ts`), with zero Slider-specific
// painter logic.

const stage = (
  overrides: Partial<Slider.Props> = {},
  options: SliderFixture.FixtureOptions = {},
) => {
  const fixture = SliderFixture.start(overrides, options)
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

describe('core Slider Part on the React Native generic host', () => {
  it('paints adjustable accessibilityRole and accessibilityValue, updating through step, drag, and Escape cancel', () => {
    const staged = stage({}, { formatValue: value => `${value.toString()}%` })

    expect(propsOf(staged.viewWithId('fixture-slider-root'))['nativeID']).toBe(
      'fixture-slider-root',
    )
    expect(propsOf(staged.viewWithId('fixture-slider-track'))['nativeID']).toBe(
      'fixture-slider-track',
    )
    expect(propsOf(staged.viewWithId('fixture-slider-range'))['nativeID']).toBe(
      'fixture-slider-range',
    )
    expect(propsOf(staged.viewWithId('fixture-slider-label'))['nativeID']).toBe(
      'fixture-slider-label',
    )

    const thumb = staged.buttonNamed('Volume')
    expect(propsOf(thumb)['accessibilityRole']).toBe('adjustable')
    expect(propsOf(thumb)['accessibilityValue']).toEqual({
      min: 0,
      max: 100,
      now: 25,
      text: '25%',
    })
    expect(propsOf(thumb)['accessibilityState']).toMatchObject({
      disabled: false,
    })

    // Focus via press, then step increment
    callProp(thumb, 'onPress')
    expect(Slider.isFocused(staged.fixture.sliderState())).toBe(true)

    staged.fixture.press('StepSlider:StepIncrement')
    expect(propsOf(staged.buttonNamed('Volume'))['accessibilityValue']).toEqual(
      {
        min: 0,
        max: 100,
        now: 30,
        text: '30%',
      },
    )

    // Drag move updates accessibilityValue, Escape cancel restores 30
    staged.fixture.send(
      Slider.PressSliderTrack({ pointerId: 1, x: 80, y: 0, value: 80 }),
    )
    expect(propsOf(staged.buttonNamed('Volume'))['accessibilityValue']).toEqual(
      {
        min: 0,
        max: 100,
        now: 80,
        text: '80%',
      },
    )

    staged.fixture.send(Slider.PressedSliderKey({ key: 'Escape' }))
    expect(propsOf(staged.buttonNamed('Volume'))['accessibilityValue']).toEqual(
      {
        min: 0,
        max: 100,
        now: 30,
        text: '30%',
      },
    )
  })

  it('paints multi-thumb accessibilityValue bounds and blocks edits when disabled or readOnly', () => {
    const range = stage(
      {
        minStepsBetweenThumbs: 2,
        thumbLabels: ['Min', 'Max'],
      },
      { defaultValues: [20, 80] },
    )

    expect(propsOf(range.buttonNamed('Min'))['accessibilityRole']).toBe(
      'adjustable',
    )
    expect(propsOf(range.buttonNamed('Min'))['accessibilityValue']).toEqual({
      min: 0,
      max: 70,
      now: 20,
    })
    expect(propsOf(range.buttonNamed('Max'))['accessibilityValue']).toEqual({
      min: 30,
      max: 100,
      now: 80,
    })

    const disabled = stage({ isDisabled: true })
    expect(
      propsOf(disabled.buttonNamed('Volume'))['accessibilityState'],
    ).toMatchObject({ disabled: true })
    disabled.fixture.send(Slider.SetSliderValue({ value: 90 }))
    expect(
      propsOf(disabled.buttonNamed('Volume'))['accessibilityValue'],
    ).toEqual({
      min: 0,
      max: 100,
      now: 25,
    })

    const readOnly = stage({ isReadOnly: true })
    readOnly.fixture.send(Slider.SetSliderValue({ value: 90 }))
    expect(
      propsOf(readOnly.buttonNamed('Volume'))['accessibilityValue'],
    ).toEqual({
      min: 0,
      max: 100,
      now: 25,
    })
  })
})
