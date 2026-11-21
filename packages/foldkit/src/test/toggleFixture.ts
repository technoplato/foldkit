import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as Toggle from '../behavior/toggle.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Toggle Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Toggle- or
// Button-specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the toolbar heading',
  why: 'To title the toggle button view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'toggle-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Formatting' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: Toggle.Props = {
  id: 'fixture-toggle',
  type: 'button',
}

const noView: Part.View<Toggle.State> = {
  state: Toggle.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const toggleScreen = (
  _model: FixtureModel,
  toggleView: Part.View<Toggle.State>,
  props: Toggle.Props = defaultProps,
): UiNode => {
  const isDisabled = !Toggle.isInteractive(props)
  return Column(
    { gap: 1 },
    Row(
      { gap: 1 },
      Button({
        label: 'Mute audio',
        action: Toggle.ToggleButton.tag,
        disabled: isDisabled,
        slot: toggleView.slot('Button'),
      }),
    ),
    Row(
      { gap: 1 },
      Button({
        label: 'Mute audio label',
        action: Toggle.ToggleButton.tag,
        disabled: isDisabled,
        slot: toggleView.slot('Label'),
      }),
    ),
    Box(
      { padding: 1, slot: toggleView.slot('Description') },
      Text('Silences playback audio'),
    ),
  )
}

export const makeApp = (overrides: Partial<Toggle.Props> = {}) => {
  const resolvedProps: Toggle.Props = { ...defaultProps, ...overrides }
  const part = Toggle.make({
    name: 'Toggle',
    ...(resolvedProps.defaultPressed === undefined
      ? {}
      : { defaultPressed: resolvedProps.defaultPressed }),
  })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        toggleScreen(model, views['Toggle'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Toggle.Props
  model: () => Model
  toggleState: () => Toggle.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Toggle.Message) => void
}>

export const start = (overrides: Partial<Toggle.Props> = {}): Running => {
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
    toggleState: () => held.model.parts['Toggle'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
