import { Array, Option, Schema as S } from 'effect'

import * as FileDrop from '../behavior/fileDrop.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core FileDrop Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero
// FileDrop-specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
  openedPickerCount: S.Number,
})
export type FixtureModel = typeof FixtureModel.Type

const OpenPicker = Catalog.action('OpenPicker', {
  what: 'Requests the platform file chooser',
  why: 'To select files without dragging them',
  meta: { label: 'Choose files', keys: [] },
})

const fixtureCatalog = Catalog.make([OpenPicker])

const BaseProgram = make({
  id: 'file-drop-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Attachments', openedPickerCount: 0 }, []],
  update: (model: FixtureModel) => [
    { ...model, openedPickerCount: model.openedPickerCount + 1 },
    [],
  ],
  catalog: fixtureCatalog,
})

export const defaultProps: FileDrop.Props = {
  id: 'fixture-file-drop',
  label: 'Upload documents',
  accept: ['application/pdf', 'image/*'],
  multiple: true,
  maxFiles: 2,
  maxFileSize: 10_000,
}

const noView: Part.View<FileDrop.State> = {
  state: FileDrop.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const fileDropScreen = (
  model: FixtureModel,
  dropView: Part.View<FileDrop.State>,
  props: FileDrop.Props = defaultProps,
): UiNode => {
  const interactive = FileDrop.isInteractive(props)
  const canClear =
    interactive &&
    (FileDrop.hasAnyFiles(dropView.state) ||
      FileDrop.hasNonFileDrop(dropView.state))
  const fileRows = Array.map(FileDrop.acceptedFilesOf(dropView.state), file =>
    Row(
      { gap: 1, slot: dropView.slot('Item', file.name) },
      Text(file.name),
      Button({
        label: `Remove ${file.name}`,
        action: Part.pressOf(FileDrop.RemoveFile.tag, Option.some(file.name)),
        disabled: !interactive,
        slot: dropView.slot('RemoveButton', file.name),
      }),
    ),
  )

  return Column(
    { gap: 1, slot: dropView.slot('Dropzone') },
    Text(model.heading),
    Row(
      { gap: 1 },
      Button({
        label: 'Choose files',
        action: OpenPicker.tag,
        disabled: !interactive,
        slot: dropView.slot('Trigger'),
      }),
      Button({
        label: 'Clear files',
        action: FileDrop.ClearFiles.tag,
        disabled: !canClear,
        slot: dropView.slot('ClearButton'),
      }),
    ),
    ...fileRows,
  )
}

export const makeApp = (overrides: Partial<FileDrop.Props> = {}) => {
  const resolvedProps: FileDrop.Props = { ...defaultProps, ...overrides }
  const part = FileDrop.make({ name: 'FileDrop' })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        fileDropScreen(model, views['FileDrop'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: FileDrop.Props
  model: () => Model
  fileDropState: () => FileDrop.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: FileDrop.Message) => void
}>

export const start = (overrides: Partial<FileDrop.Props> = {}): Running => {
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
    fileDropState: () => held.model.parts['FileDrop'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
