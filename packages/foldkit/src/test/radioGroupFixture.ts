import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as RadioGroup from '../behavior/radioGroup.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core RadioGroup Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero RadioGroup-
// specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the radio group heading',
  why: 'To title the radio group view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'radio-group-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Drawing tool' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const options: ReadonlyArray<RadioGroup.Item> = [
  { value: 'brush', label: 'Brush' },
  { value: 'fill', label: 'Fill' },
  { value: 'eraser', label: 'Eraser', isDisabled: true },
  { value: 'lasso', label: 'Lasso' },
]

export const optionDescriptions: Readonly<Record<string, string>> = {
  brush: 'Freehand stroke tool',
  fill: 'Flood-fill closed regions',
  eraser: 'Remove strokes from the canvas',
  lasso: 'Select an arbitrary area',
}

export const defaultProps: RadioGroup.Props = {
  id: 'fixture-radio',
  label: 'Drawing tool',
  name: 'tool',
  options,
}

const noView: Part.View<RadioGroup.State> = {
  state: RadioGroup.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const radioGroupScreen = (
  _model: FixtureModel,
  radioGroup: Part.View<RadioGroup.State>,
  props: RadioGroup.Props = defaultProps,
): UiNode => {
  const optionNodes = Array.map(props.options, item => {
    const isDisabled = props.isDisabled === true || item.isDisabled === true
    const action = Part.pressOf(
      RadioGroup.SelectRadioOption.tag,
      Option.some(item.value),
    )
    return Column(
      { gap: 0 },
      Row(
        { gap: 1 },
        Button({
          label: item.label,
          action,
          disabled: isDisabled,
          slot: radioGroup.slot('Option', item.value),
        }),
      ),
      Row(
        { gap: 1 },
        Button({
          label: `${item.label} label`,
          action,
          disabled: isDisabled,
          slot: radioGroup.slot('Label', item.value),
        }),
      ),
      Box(
        { padding: 1, slot: radioGroup.slot('Description', item.value) },
        Text(optionDescriptions[item.value] ?? item.label),
      ),
    )
  })

  return RadioGroup.orientationOf(props) === 'Horizontal'
    ? Row({ gap: 1, slot: radioGroup.slot('Group') }, ...optionNodes)
    : Column({ gap: 1, slot: radioGroup.slot('Group') }, ...optionNodes)
}

export const makeApp = (overrides: Partial<RadioGroup.Props> = {}) => {
  const resolvedProps: RadioGroup.Props = { ...defaultProps, ...overrides }
  const part = RadioGroup.make({
    name: 'RadioGroup',
    ...(resolvedProps.defaultValue === undefined
      ? {}
      : { defaultValue: resolvedProps.defaultValue }),
  })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        radioGroupScreen(model, views['RadioGroup'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: RadioGroup.Props
  model: () => Model
  radioGroupState: () => RadioGroup.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: RadioGroup.Message) => void
}>

export const start = (overrides: Partial<RadioGroup.Props> = {}): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides)
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
    radioGroupState: () => held.model.parts['RadioGroup'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
