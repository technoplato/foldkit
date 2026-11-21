import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as Textarea from '../behavior/textarea.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import {
  Box,
  Button,
  Column,
  Row,
  Text,
  TextInput,
} from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Textarea Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero
// Textarea-specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the form heading',
  why: 'To title the multiline notes view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'textarea-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Notes' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: Textarea.Props = {
  id: 'fixture-textarea',
  placeholder: 'Enter notes',
  name: 'notes',
  hasLabel: true,
  hasDescription: true,
  hasError: true,
}

const noView: Part.View<Textarea.State> = {
  state: Textarea.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const textareaScreen = (
  _model: FixtureModel,
  textareaView: Part.View<Textarea.State>,
  props: Textarea.Props = defaultProps,
): UiNode => {
  const isDisabled = !Textarea.canInput(props)
  return Column(
    { gap: 1 },
    Row(
      { gap: 1 },
      Button({
        label: 'Notes label',
        action: Textarea.BeginEdit.tag,
        disabled: isDisabled,
        slot: textareaView.slot('Label'),
      }),
    ),
    Row(
      { gap: 1 },
      TextInput({
        value: Textarea.draftOf(textareaView.state),
        placeholder: props.placeholder ?? 'Enter notes',
        token: `${Textarea.ChangeTextarea.tag}:`,
        focusToken: Textarea.BeginEdit.tag,
        blurToken: Textarea.CommitTextarea.tag,
        slot: textareaView.slot('Textarea'),
      }),
      Button({
        label: 'Clear',
        action: Textarea.ClearTextarea.tag,
        disabled: isDisabled,
        slot: textareaView.slot('ClearButton'),
      }),
    ),
    Box(
      { padding: 1, slot: textareaView.slot('Description') },
      Text('Write multiline notes with line breaks'),
    ),
    Box(
      { padding: 1, slot: textareaView.slot('Error') },
      Text('Notes are required'),
    ),
  )
}

export const makeApp = (
  overrides: Partial<Textarea.Props> = {},
  options: Readonly<{ settleMs?: number; isDeviceOnly?: boolean }> = {},
) => {
  const resolvedProps: Textarea.Props = { ...defaultProps, ...overrides }
  const partOptions: Omit<Textarea.MakeOptions, 'sync'> = {
    name: 'Textarea',
    ...(resolvedProps.defaultValue === undefined
      ? {}
      : { defaultValue: resolvedProps.defaultValue }),
    ...(options.settleMs === undefined ? {} : { settleMs: options.settleMs }),
  }
  const part =
    options.isDeviceOnly === true
      ? Textarea.deviceOnly(partOptions)
      : Textarea.make(partOptions)
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        textareaScreen(model, views['Textarea'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Textarea.Props
  model: () => Model
  textareaState: () => Textarea.State
  tree: () => UiNode
  press: (tag: string) => void
  type: (token: string, value: string) => void
  send: (message: Textarea.Message) => void
}>

const changePrefix = `${Textarea.ChangeTextarea.tag}:`

export const start = (
  overrides: Partial<Textarea.Props> = {},
  options: Readonly<{ settleMs?: number; isDeviceOnly?: boolean }> = {},
): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides, options)
  const [initialModel] = composed.init()
  const held: { model: Model } = { model: initialModel }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel] = composed.update(held.model, message)
    held.model = nextModel
  }

  const press = (tag: string): void => {
    if (tag === changePrefix) {
      sendMessage(Textarea.ChangeTextarea({ value: '' }))
      return
    }
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  const type = (token: string, value: string): void => {
    press(`${token}${value}`)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    textareaState: () => held.model.parts['Textarea'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    type,
    send: sendMessage,
  }
}
