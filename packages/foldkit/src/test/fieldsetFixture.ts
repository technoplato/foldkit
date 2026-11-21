import { Array, Option, Schema as S } from 'effect'

import * as Fieldset from '../behavior/fieldset.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Fieldset Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero
// Fieldset-specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the fieldset heading',
  why: 'To title the form section',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'fieldset-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Account' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: Fieldset.Props = {
  id: 'fixture-fieldset',
  fieldOrder: ['name', 'email'],
  hasLegend: true,
  hasDescription: true,
  hasError: true,
}

const noView: Part.View<Fieldset.State> = {
  state: Fieldset.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const fieldsetScreen = (
  _model: FixtureModel,
  fieldsetView: Part.View<Fieldset.State>,
  props: Fieldset.Props = defaultProps,
): UiNode => {
  const emailError = Option.getOrElse(
    Fieldset.fieldErrorOf(fieldsetView.state, 'email'),
    () => '',
  )
  const formError = Option.getOrElse(
    Fieldset.maybeFormErrorOf(fieldsetView.state),
    () => '',
  )
  const isGroupDisabled = Fieldset.isDisabled(fieldsetView.state, props)
  const isSubmitDisabled = !Fieldset.canSubmit(fieldsetView.state, props)

  return Box(
    { padding: 1, slot: fieldsetView.slot('Fieldset') },
    Column(
      { gap: 1 },
      Box(
        { padding: 0, slot: fieldsetView.slot('Legend') },
        Text('Account details'),
      ),
      Box(
        { padding: 0, slot: fieldsetView.slot('Description') },
        Text('Manage contact settings for the account.'),
      ),
      Box(
        { padding: 0, slot: fieldsetView.slot('FieldError', 'email') },
        Text(emailError),
      ),
      Box(
        { padding: 0, slot: fieldsetView.slot('FieldError') },
        Text(formError),
      ),
      Row(
        { gap: 1 },
        Button({
          label: 'Submit',
          action: Fieldset.AttemptSubmit.tag,
          disabled: isSubmitDisabled,
          slot: fieldsetView.slot('SubmitButton'),
        }),
        Button({
          label: 'Reset',
          action: Fieldset.ResetFieldset.tag,
          disabled: isGroupDisabled,
          slot: fieldsetView.slot('ResetButton'),
        }),
      ),
    ),
  )
}

export const makeApp = (
  overrides: Partial<Fieldset.Props> = {},
  options: Readonly<{ defaultDisabled?: boolean }> = {},
) => {
  const resolvedProps: Fieldset.Props = { ...defaultProps, ...overrides }
  const part = Fieldset.make({
    name: 'Fieldset',
    ...(options.defaultDisabled === undefined
      ? {}
      : { defaultDisabled: options.defaultDisabled }),
  })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        fieldsetScreen(model, views['Fieldset'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Fieldset.Props
  model: () => Model
  fieldsetState: () => Fieldset.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Fieldset.Message) => void
}>

export const start = (
  overrides: Partial<Fieldset.Props> = {},
  options: Readonly<{ defaultDisabled?: boolean }> = {},
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
    fieldsetState: () => held.model.parts['Fieldset'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
