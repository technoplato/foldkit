import { Array, Duration, Effect, Fiber, Option, Schema as S } from 'effect'
import { TestClock } from 'effect/testing'

import * as Part from '../behavior/part.js'
import * as Select from '../behavior/select.js'
import * as Catalog from '../catalog/catalog.js'
import { type ProgramCommand, make } from '../program/program.js'
import { Box, Button, Column, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Select Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Select-
// specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the select heading',
  why: 'To title the select view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'select-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Favorite fruit' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const items: ReadonlyArray<Select.Item> = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana', isDisabled: true },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
]

export const defaultProps: Select.Props = {
  id: 'fixture-select',
  placeholder: 'Choose a fruit',
  hasLabel: true,
  hasDescription: true,
  hasError: true,
  name: 'fruit',
  items,
}

const noView: Part.View<Select.State> = {
  state: Select.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const selectScreen = (
  model: FixtureModel,
  select: Part.View<Select.State>,
  props: Select.Props = defaultProps,
): UiNode => {
  const triggerLabel = Select.displayLabelOf(select.state, props) || 'Select'
  const optionNodes = Array.map(props.items, item =>
    Button({
      label: item.label,
      action: Part.pressOf(Select.SelectOption.tag, Option.some(item.value)),
      disabled: Select.isOptionDisabled(props, item.value),
      slot: select.slot('Option', item.value),
    }),
  )

  return Column(
    { gap: 1 },
    Box(
      { padding: 0, slot: select.slot('Label') },
      Text(props.label ?? model.heading),
    ),
    Button({
      label: triggerLabel,
      action: Select.ToggleSelect.tag,
      disabled: Select.isDisabledOf(props),
      slot: select.slot('Trigger'),
    }),
    Column({ gap: 1, slot: select.slot('Content') }, ...optionNodes),
    ...(Select.isOpen(select.state)
      ? [
          Button({
            label: 'Dismiss select',
            action: Select.DismissSelect.tag,
            slot: select.slot('Backdrop'),
          }),
        ]
      : []),
    Box(
      { padding: 0, slot: select.slot('Description') },
      Text('Pick one or more fruits'),
    ),
    Box(
      { padding: 0, slot: select.slot('Error') },
      Text('Please choose a fruit'),
    ),
  )
}

export const makeApp = (overrides: Partial<Select.Props> = {}) => {
  const resolvedProps: Select.Props = { ...defaultProps, ...overrides }
  const part = Select.make({
    name: 'Select',
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
        selectScreen(model, views['Select'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

type Waiting = Readonly<{ dueMs: number; command: ProgramCommand<any, any> }>

export type Running = Readonly<{
  props: Select.Props
  model: () => Model
  selectState: () => Select.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Select.Message) => void
  elapse: (ms: number) => Promise<void>
}>

const afterMsOf = (command: ProgramCommand<any, any>): number => {
  const afterMs = command.args?.['afterMs']
  return typeof afterMs === 'number' ? afterMs : 0
}

const answerOf = (command: ProgramCommand<any, any>): Promise<unknown> =>
  Effect.runPromise(
    Effect.gen(function* () {
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      const wait = command.effect as Effect.Effect<unknown>
      const fiber = yield* Effect.forkChild(wait)
      yield* TestClock.adjust(Duration.millis(afterMsOf(command)))
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestClock.layer())),
  )

export const start = (overrides: Partial<Select.Props> = {}): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides)
  const [initialModel] = composed.init()
  const held: {
    model: Model
    nowMs: number
    waiting: ReadonlyArray<Waiting>
  } = { model: initialModel, nowMs: 0, waiting: [] }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel, commands] = composed.update(held.model, message)
    held.model = nextModel
    held.waiting = [
      ...held.waiting,
      ...Array.map(commands, command => ({
        dueMs: held.nowMs + afterMsOf(command),
        command,
      })),
    ]
  }

  const press = (tag: string): void => {
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  const elapse = async (ms: number): Promise<void> => {
    held.nowMs = held.nowMs + ms
    const due = Array.filter(held.waiting, each => each.dueMs <= held.nowMs)
    held.waiting = Array.filter(held.waiting, each => each.dueMs > held.nowMs)
    for (const each of due) {
      const answer = await answerOf(each.command)
      if (typeof answer === 'object' && answer !== null && '_tag' in answer) {
        sendMessage(S.decodeUnknownSync(composed.Message)(answer))
      }
    }
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    selectState: () => held.model.parts['Select'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
    elapse,
  }
}
