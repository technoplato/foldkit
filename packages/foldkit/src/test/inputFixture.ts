import { Array, Option, Schema as S } from 'effect'

import * as Input from '../behavior/input.js'
import * as Part from '../behavior/part.js'
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

// NOTE: shared test Program composing the core Input Part once, driven by the
// HTML, React, and React Native generic host tests. Every painter draws this
// same screen tree through its own generic host with zero Input-specific
// painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the form heading',
  why: 'To title the input form view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'input-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Profile' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: Input.Props = {
  id: 'fixture-input',
  placeholder: 'Enter display name',
  name: 'displayName',
  hasLabel: true,
  hasDescription: true,
  hasError: true,
}

const noView: Part.View<Input.State> = {
  state: Input.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const inputScreen = (
  _model: FixtureModel,
  inputView: Part.View<Input.State>,
  props: Input.Props = defaultProps,
): UiNode => {
  const isDisabled = !Input.canInput(props)
  return Column(
    { gap: 1 },
    Row(
      { gap: 1 },
      Button({
        label: 'Display name label',
        action: Input.BeginEdit.tag,
        disabled: isDisabled,
        slot: inputView.slot('Label'),
      }),
    ),
    Row(
      { gap: 1 },
      TextInput({
        value: Input.draftOf(inputView.state),
        placeholder: props.placeholder ?? 'Enter text',
        token: `${Input.ChangeInput.tag}:`,
        focusToken: Input.BeginEdit.tag,
        blurToken: Input.CommitInput.tag,
        slot: inputView.slot('Input'),
      }),
      Button({
        label: Input.visibilityLabelOf(inputView.state),
        action: Input.TogglePasswordVisibility.tag,
        disabled: isDisabled,
        slot: inputView.slot('VisibilityToggle'),
      }),
      Button({
        label: 'Clear',
        action: Input.ClearInput.tag,
        disabled: isDisabled,
        slot: inputView.slot('ClearButton'),
      }),
    ),
    Box(
      { padding: 1, slot: inputView.slot('Description') },
      Text('Shown on your public profile'),
    ),
    Box(
      { padding: 1, slot: inputView.slot('Error') },
      Text('Display name is required'),
    ),
  )
}

export const makeApp = (
  overrides: Partial<Input.Props> = {},
  options: Readonly<{ settleMs?: number; isSecret?: boolean }> = {},
) => {
  const resolvedProps: Input.Props = { ...defaultProps, ...overrides }
  const partOptions: Omit<Input.MakeOptions, 'sync'> = {
    name: 'Input',
    ...(resolvedProps.defaultValue === undefined
      ? {}
      : { defaultValue: resolvedProps.defaultValue }),
    ...(options.settleMs === undefined ? {} : { settleMs: options.settleMs }),
  }
  const part =
    options.isSecret === true
      ? Input.secret(partOptions)
      : Input.make(partOptions)
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        inputScreen(model, views['Input'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Input.Props
  model: () => Model
  inputState: () => Input.State
  tree: () => UiNode
  press: (tag: string) => void
  type: (token: string, value: string) => void
  send: (message: Input.Message) => void
}>

const changePrefix = `${Input.ChangeInput.tag}:`

export const start = (
  overrides: Partial<Input.Props> = {},
  options: Readonly<{ settleMs?: number; isSecret?: boolean }> = {},
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
      sendMessage(Input.ChangeInput({ value: '' }))
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
    inputState: () => held.model.parts['Input'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    type,
    send: sendMessage,
  }
}
