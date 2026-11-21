import { Array, Option, Schema as S } from 'effect'

import * as Checkbox from '../behavior/checkbox.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Checkbox Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Checkbox-specific
// painter code.

export const FixtureModel = S.Struct({
  submittedCount: S.Number,
})
export type FixtureModel = typeof FixtureModel.Type

const SubmitForm = Catalog.action('SubmitForm', {
  what: 'Submits the form',
  why: 'To record the chosen preferences',
  meta: { label: 'Submit', keys: [] },
})

const fixtureCatalog = Catalog.make([SubmitForm])

const BaseProgram = make({
  id: 'checkbox-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ submittedCount: 0 }, []],
  update: (model: FixtureModel) => [
    { submittedCount: model.submittedCount + 1 },
    [],
  ],
  catalog: fixtureCatalog,
})

export const defaultProps: Checkbox.Props = {
  id: 'fixture-checkbox',
  hasLabel: true,
  hasDescription: true,
  name: 'terms',
}

const noView: Part.View<Checkbox.State> = {
  state: Checkbox.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const checkboxScreen = (
  _model: FixtureModel,
  checkbox: Part.View<Checkbox.State>,
  props: Checkbox.Props = defaultProps,
): UiNode => {
  const isDisabled = !Checkbox.isInteractiveOf(props)
  return Column(
    { gap: 1 },
    Row(
      { gap: 1 },
      Box(
        {},
        Button({
          label: props.label ?? 'Accept terms checkbox',
          action: Checkbox.ToggleCheckbox.tag,
          disabled: isDisabled,
          slot: checkbox.slot('Control'),
        }),
      ),
      Box(
        {},
        Button({
          label: 'Accept terms',
          action: Checkbox.ToggleCheckbox.tag,
          disabled: isDisabled,
          slot: checkbox.slot('Label'),
        }),
      ),
    ),
    Box(
      { padding: 0, slot: checkbox.slot('Description') },
      Text('You agree to the terms of service.'),
    ),
  )
}

export const makeApp = (
  overrides: Partial<Checkbox.Props> = {},
  options: Readonly<{ initial?: Checkbox.State }> = {},
) => {
  const resolvedProps: Checkbox.Props = {
    ...defaultProps,
    ...overrides,
  }
  const part = Checkbox.make({
    name: 'Checkbox',
    ...(options.initial === undefined ? {} : { initial: options.initial }),
  })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        checkboxScreen(model, views['Checkbox'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props: fixtureProps } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Checkbox.Props
  model: () => Model
  checkboxState: () => Checkbox.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Checkbox.Message) => void
}>

const runApp = (
  composed: typeof App,
  resolvedProps: Checkbox.Props,
): Running => {
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
    checkboxState: () => held.model.parts['Checkbox'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}

export const start = (
  overrides: Partial<Checkbox.Props> = {},
  options: Readonly<{ initial?: Checkbox.State }> = {},
): Running => {
  const { App: composed, props } = makeApp(overrides, options)
  return runApp(composed, props)
}
