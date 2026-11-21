import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as Switch from '../behavior/switch.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Switch Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Switch-specific
// painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the settings heading',
  why: 'To title the switch settings view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'switch-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Notifications' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: Switch.Props = {
  id: 'fixture-switch',
  name: 'notifications',
  value: 'enabled',
}

const noView: Part.View<Switch.State> = {
  state: Switch.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const switchScreen = (
  _model: FixtureModel,
  switchView: Part.View<Switch.State>,
): UiNode =>
  Column(
    { gap: 1 },
    Row(
      { gap: 1 },
      Button({
        label: 'Notifications',
        action: Switch.ToggleSwitch.tag,
        slot: switchView.slot('Control'),
      }),
    ),
    Row(
      { gap: 1 },
      Button({
        label: 'Notifications label',
        action: Switch.ToggleSwitch.tag,
        slot: switchView.slot('Label'),
      }),
    ),
    Box(
      { padding: 1, slot: switchView.slot('Description') },
      Text('Receive notifications when updates arrive'),
    ),
  )

export const makeApp = (overrides: Partial<Switch.Props> = {}) => {
  const resolvedProps: Switch.Props = { ...defaultProps, ...overrides }
  const part = Switch.make({
    name: 'Switch',
    ...(resolvedProps.defaultChecked === undefined
      ? {}
      : { defaultChecked: resolvedProps.defaultChecked }),
  })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) => switchScreen(model, views['Switch'] ?? noView),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Switch.Props
  model: () => Model
  switchState: () => Switch.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Switch.Message) => void
}>

export const start = (overrides: Partial<Switch.Props> = {}): Running => {
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
    switchState: () => held.model.parts['Switch'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
