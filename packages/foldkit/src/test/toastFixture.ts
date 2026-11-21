import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as Presence from '../behavior/presence.js'
import * as Toast from '../behavior/toast.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Toast Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Toast-specific
// painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the page heading',
  why: 'To title the notifications view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'toast-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Notifications Demo' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: Toast.Props = {
  id: 'fixture-toast',
  position: 'BottomRight',
  defaultDurationMs: 4000,
  label: 'Notifications',
}

const noView: Part.View<Toast.State> = {
  state: Toast.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const toastScreen = (
  _model: FixtureModel,
  toast: Part.View<Toast.State>,
  props: Toast.Props = defaultProps,
): UiNode => {
  const entries = Toast.entriesOf(toast.state)
  const entryNodes = Array.map(entries, entry =>
    Row(
      { gap: 1, slot: toast.slot('Entry', entry.id) },
      Column(
        { gap: 0 },
        Box(
          { padding: 0, slot: toast.slot('Title', entry.id) },
          Text(entry.title),
        ),
        ...Option.match(entry.maybeDescription, {
          onNone: () => [],
          onSome: description => [
            Box(
              { padding: 0, slot: toast.slot('Description', entry.id) },
              Text(description),
            ),
          ],
        }),
      ),
      Button({
        label: `Dismiss ${entry.title}`,
        action: Part.pressOf(Toast.DismissToast.tag, Option.some(entry.id)),
        disabled: Presence.isLeaving(entry.presence),
        slot: toast.slot('DismissButton', entry.id),
      }),
    ),
  )

  return Column(
    { gap: 1 },
    Button({
      label: 'Dismiss all',
      action: Toast.DismissAllToasts.tag,
    }),
    Box({ padding: 0, slot: toast.slot('Region') }, ...entryNodes),
    Text(Toast.positionOf(props)),
  )
}

export const makeApp = (overrides: Partial<Toast.Props> = {}) => {
  const resolvedProps: Toast.Props = {
    ...defaultProps,
    ...overrides,
  }
  const part = Toast.make({ name: 'Toast' })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        toastScreen(model, views['Toast'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props: appProps } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Toast.Props
  model: () => Model
  toastState: () => Toast.State
  lastCommands: () => ReadonlyArray<
    Readonly<{ name: string; args?: Record<string, unknown> }>
  >
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Toast.Message) => void
}>

export const start = (overrides: Partial<Toast.Props> = {}): Running => {
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
    toastState: () => held.model.parts['Toast'],
    lastCommands: () => held.commands,
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
