import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as Tooltip from '../behavior/tooltip.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Tooltip Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Tooltip-specific
// painter code.

export const FixtureModel = S.Struct({
  hint: S.String,
  confirmedCount: S.Number,
})
export type FixtureModel = typeof FixtureModel.Type

const ConfirmAction = Catalog.action('ConfirmAction', {
  what: 'Runs the primary button action',
  why: 'To verify the trigger keeps its own primary action beside its tooltip',
  meta: { label: 'Save', keys: [] },
})

const fixtureCatalog = Catalog.make([ConfirmAction])

const BaseProgram = make({
  id: 'tooltip-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ hint: 'Saves your changes', confirmedCount: 0 }, []],
  update: (model: FixtureModel) => [
    { ...model, confirmedCount: model.confirmedCount + 1 },
    [],
  ],
  catalog: fixtureCatalog,
})

export const defaultProps: Tooltip.Props = {
  id: 'fixture-tooltip',
  showDelayMs: 500,
  closeDelayMs: 0,
  label: 'Save document',
}

const noView: Part.View<Tooltip.State> = {
  state: Tooltip.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const tooltipScreen = (
  model: FixtureModel,
  tooltip: Part.View<Tooltip.State>,
  props: Tooltip.Props = defaultProps,
): UiNode =>
  Column(
    { gap: 1 },
    Button({
      label: 'Save',
      action: ConfirmAction.tag,
      disabled: Tooltip.isDisabledOf(props),
      slot: tooltip.slot('Trigger'),
    }),
    Box({ padding: 1, slot: tooltip.slot('Content') }, Text(model.hint)),
    ...(Tooltip.isOpen(tooltip.state)
      ? [
          Button({
            label: 'Hide tooltip',
            action: Tooltip.HideTooltip.tag,
          }),
        ]
      : []),
  )

export const makeApp = (overrides: Partial<Tooltip.Props> = {}) => {
  const resolvedProps: Tooltip.Props = {
    ...defaultProps,
    ...overrides,
  }
  const part = Tooltip.make({ name: 'Tooltip' })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        tooltipScreen(model, views['Tooltip'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props: appProps } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Tooltip.Props
  model: () => Model
  tooltipState: () => Tooltip.State
  lastCommands: () => ReadonlyArray<
    Readonly<{ name: string; args?: Record<string, unknown> }>
  >
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Tooltip.Message) => void
}>

export const start = (overrides: Partial<Tooltip.Props> = {}): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides)
  const [initialModel] = composed.init()
  const held: {
    model: Model
    commands: ReadonlyArray<
      Readonly<{ name: string; args?: Record<string, unknown> }>
    >
  } = { model: initialModel, commands: [] }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel, nextCommands] = composed.update(held.model, message)
    held.model = nextModel
    held.commands = nextCommands
  }

  const press = (tag: string): void => {
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    tooltipState: () => held.model.parts['Tooltip'],
    lastCommands: () => held.commands,
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
