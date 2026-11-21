import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as Slider from '../behavior/slider.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Slider Part once, driven by the
// HTML, React, and React Native generic host tests. Every painter draws this
// same screen tree through its own generic host with zero Slider-specific
// painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the slider heading',
  why: 'To title the slider view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'slider-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Volume' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: Slider.Props = {
  id: 'fixture-slider',
  min: 0,
  max: 100,
  step: 5,
  hasLabel: true,
  defaultValues: [25],
}

const noView: Part.View<Slider.State> = {
  state: Slider.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const sliderScreen = (
  model: FixtureModel,
  sliderView: Part.View<Slider.State>,
  props: Slider.Props = defaultProps,
): UiNode => {
  const values = Slider.valuesOf(sliderView.state)
  const isDisabled = Slider.isDisabledOf(props)
  const isMulti = values.length > 1
  const thumbNodes = Array.map(values, (_value, index) => {
    const thumbLabel = Option.getOrElse(
      props.thumbLabels === undefined
        ? Option.none<string>()
        : Array.get(props.thumbLabels, index),
      () => {
        if (isMulti) {
          return index === 0 ? 'Minimum' : 'Maximum'
        } else {
          return props.label ?? model.heading
        }
      },
    )
    return Button({
      label: thumbLabel,
      action: Part.pressOf(
        Slider.FocusSliderThumb.tag,
        Option.some(index.toString()),
      ),
      disabled: isDisabled,
      slot: isMulti
        ? sliderView.slot('Thumb', index.toString())
        : sliderView.slot('Thumb'),
    })
  })
  const range = Slider.rangeFractionsOf(sliderView.state, props)

  return Column(
    { gap: 1, slot: sliderView.slot('Root') },
    Box(
      { padding: 0, slot: sliderView.slot('Label') },
      Text(props.label ?? model.heading),
    ),
    Row(
      { gap: 1, slot: sliderView.slot('Track') },
      Box(
        { padding: 0, slot: sliderView.slot('Range') },
        Text(
          `${Slider.percentStringOf(range.start)}-${Slider.percentStringOf(range.end)}`,
        ),
      ),
      ...thumbNodes,
    ),
  )
}

export type FixtureOptions = Readonly<{
  sampleMs?: number
  defaultValue?: number
  defaultValues?: ReadonlyArray<number>
  formatValue?: (value: number, index: number) => string
}>

export const makeApp = (
  overrides: Partial<Slider.Props> = {},
  options: FixtureOptions = {},
) => {
  const resolvedProps: Slider.Props = { ...defaultProps, ...overrides }
  const initialValues =
    options.defaultValues ??
    (options.defaultValue === undefined
      ? resolvedProps.defaultValues
      : [options.defaultValue])
  const part = Slider.make({
    name: 'Slider',
    ...(initialValues === undefined ? {} : { defaultValues: initialValues }),
    ...(options.sampleMs === undefined ? {} : { sampleMs: options.sampleMs }),
    ...(resolvedProps.min === undefined ? {} : { min: resolvedProps.min }),
    ...(resolvedProps.step === undefined ? {} : { step: resolvedProps.step }),
  })
  const propsFor = (
    model: Readonly<{ parts: Readonly<Record<string, Slider.State>> }>,
  ): Slider.Props => {
    const formatValue = options.formatValue
    if (formatValue === undefined) {
      return resolvedProps
    }
    const current = model.parts['Slider'] ?? Slider.initial
    return {
      ...resolvedProps,
      valueTexts: Array.map(Slider.valuesOf(current), (value, index) =>
        formatValue(value, index),
      ),
    }
  }
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, propsFor)],
      screen: (model, views) =>
        sliderScreen(model, views['Slider'] ?? noView, propsFor(model)),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Slider.Props
  model: () => Model
  sliderState: () => Slider.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Slider.Message) => void
}>

export const start = (
  overrides: Partial<Slider.Props> = {},
  options: FixtureOptions = {},
): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides, options)
  const [initialModel] = composed.init()
  const held: { model: Model } = { model: initialModel }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel] = composed.update(held.model, message)
    held.model = nextModel
  }

  const press = (tag: string): void => {
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    sliderState: () => held.model.parts['Slider'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
