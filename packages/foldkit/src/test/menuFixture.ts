import { Array, Duration, Effect, Fiber, Option, Schema as S } from 'effect'
import { TestClock } from 'effect/testing'

import * as Menu from '../behavior/menu.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { type ProgramCommand, make } from '../program/program.js'
import { Button, Column, List } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Menu Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Menu-specific
// painter code.

const Row = S.Struct({ slug: S.String, name: S.String })

export const FixtureModel = S.Struct({
  rows: S.Array(Row),
  chosen: S.Array(S.String),
})
export type FixtureModel = typeof FixtureModel.Type

const OpenRow = Catalog.action('OpenRow', {
  fields: { slug: S.String },
  choose: {
    field: 'slug',
    noun: 'row',
    prompt: 'Open which row?',
    token: S.String,
    choicesOf: (model: FixtureModel) =>
      Array.map(model.rows, row => ({ value: row.slug, title: row.name })),
    nothingToChoose: 'No rows',
  },
  what: 'Opens a row',
  why: 'To view it',
  meta: { label: 'Open', keys: [] },
})

const fixtureCatalog = Catalog.make([OpenRow])

const BaseProgram = make({
  id: 'menu-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [
    {
      rows: [
        { slug: 'salt-road', name: 'Salt Road' },
        { slug: 'a-tin-comet', name: 'A Tin Comet' },
      ],
      chosen: [],
    },
    [],
  ],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, chosen: [...model.chosen, message.slug] }, []],
  catalog: fixtureCatalog,
})

export const items: ReadonlyArray<Menu.Item> = [
  { value: 'edit', label: 'Edit' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'archive', label: 'Archive', isDisabled: true },
  { value: 'delete', label: 'Delete' },
]

export const props: Menu.Props = {
  id: 'fixture-menu',
  items,
}

const noView: Part.View<Menu.State> = {
  state: Menu.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const menuScreen = (
  model: FixtureModel,
  menu: Part.View<Menu.State>,
): UiNode =>
  Column(
    { gap: 1 },
    List({
      label: 'Items',
      items: Array.map(model.rows, row => ({
        key: row.slug,
        title: row.name,
        action: `OpenRow:${row.slug}`,
        slot: menu.slot('ContextTrigger', row.slug),
      })),
      ...Menu.itemMenuOf(menu, props),
    }),
    Button({
      label: 'Menu trigger',
      action: Menu.ToggleMenu.tag,
      slot: menu.slot('Trigger'),
    }),
    ...(Menu.isOpen(menu.state)
      ? [
          ...Array.map(items, item =>
            Button({
              label: item.label,
              action: Part.pressOf(
                Menu.SelectMenuItem.tag,
                Option.some(item.value),
              ),
              disabled: item.isDisabled === true,
              slot: menu.slot('Item', item.value),
            }),
          ),
          Button({
            label: 'Dismiss menu',
            action: Menu.DismissMenu.tag,
            slot: menu.slot('Backdrop'),
          }),
        ]
      : []),
  )

export const App = Part.compose({
  of: BaseProgram,
  parts: [Part.given(Menu.part, () => props)],
  screen: (model, views) => menuScreen(model, views['Menu'] ?? noView),
})

export type Model = typeof App.Model.Type

type Waiting = Readonly<{ dueMs: number; command: ProgramCommand<any, any> }>

export type Running = Readonly<{
  model: () => Model
  menuState: () => Menu.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Menu.Message) => void
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

export const start = (): Running => {
  const [initialModel] = App.init()
  const held: {
    model: Model
    nowMs: number
    waiting: ReadonlyArray<Waiting>
  } = { model: initialModel, nowMs: 0, waiting: [] }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel, commands] = App.update(held.model, message)
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
    const messages = App.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  const elapse = async (ms: number): Promise<void> => {
    held.nowMs = held.nowMs + ms
    const due = Array.filter(held.waiting, each => each.dueMs <= held.nowMs)
    held.waiting = Array.filter(held.waiting, each => each.dueMs > held.nowMs)
    for (const each of due) {
      const answer = await answerOf(each.command)
      if (typeof answer === 'object' && answer !== null && '_tag' in answer) {
        sendMessage(S.decodeUnknownSync(App.Message)(answer))
      }
    }
  }

  return {
    model: () => held.model,
    menuState: () => held.model.parts['Menu'],
    tree: () => App.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
    elapse,
  }
}
