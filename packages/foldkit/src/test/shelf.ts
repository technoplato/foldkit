import {
  Array,
  Duration,
  Effect,
  Fiber,
  Match as M,
  Option,
  Schema as S,
} from 'effect'
import { TestClock } from 'effect/testing'

import * as LongPress from '../behavior/longPress.js'
import { Synced } from '../behavior/pace.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { define, to } from '../experimental/machine/machine.js'
import { type ProgramCommand, make } from '../program/program.js'
import { Button, Column, List } from '../renderers/elements.js'
import type { ItemMenu, UiNode } from '../renderers/types.js'
import { ts } from '../schema/index.js'

// NOTE: this is a made-up Program for the tests of a painter's host: a
// shelf of two titles that are no real books, a menu a hold or the second
// button opens on a row, and a pin a hold or the second button sets on a
// button. Every painter's gesture test paints this one screen with its own
// painter, does the same thing a person does, and reads the same Model.

// SHELF

const Title = S.Struct({ slug: S.String, name: S.String })

/** The shelf's own Model: its titles, and the ones that were opened. */
export const ShelfModel = S.Struct({
  titles: S.Array(Title),
  opened: S.Array(S.String),
})
/** The shelf's own Model. */
export type ShelfModel = typeof ShelfModel.Type

const titlesAsChoices = (model: ShelfModel) =>
  Array.map(model.titles, title => ({ value: title.slug, title: title.name }))

/** Opens a title: a tap on its row. */
export const Open = Catalog.action('Open', {
  fields: { slug: S.String },
  choose: {
    field: 'slug',
    noun: 'title',
    prompt: 'Open which title?',
    token: S.String,
    choicesOf: titlesAsChoices,
    nothingToChoose: 'The shelf is empty',
  },
  what: 'Opens a title',
  why: 'To read it',
  meta: { label: 'Open', keys: [] },
})

const shelfCatalog = Catalog.make([Open])

/** The shelf with no parts: two made-up titles and one Action. */
export const ShelfProgram = make({
  id: 'shelf',
  version: 1,
  Model: ShelfModel,
  Message: shelfCatalog.Message,
  init: () => [
    {
      titles: [
        { slug: 'salt-road', name: 'Salt Road' },
        { slug: 'a-tin-comet', name: 'A Tin Comet' },
      ],
      opened: [],
    },
    [],
  ],
  update: (model: ShelfModel, message: typeof shelfCatalog.Message.Type) => [
    { ...model, opened: [...model.opened, message.slug] },
    [],
  ],
  catalog: shelfCatalog,
})

// TITLE MENU

/** No title's menu is open. */
export const Closed = ts('Closed')
/** The menu of the title `key` is open. */
export const OpenOn = ts('OpenOn', { key: S.String })

const MenuState = S.Union([Closed, OpenOn])
type MenuState = typeof MenuState.Type

/** Opens a title's menu: a hold on its row, or the second button. */
export const ShowTitleMenu = Catalog.action('ShowTitleMenu', {
  fields: { key: S.String },
  choose: {
    field: 'key',
    noun: 'title',
    prompt: 'Show the menu of which title?',
    token: S.String,
    choicesOf: titlesAsChoices,
    nothingToChoose: 'The shelf is empty',
  },
  what: 'Opens the menu of a title',
  why: 'To see what can be done with the title',
  meta: { label: 'Menu', keys: [] },
})

/** Closes the open menu. */
export const CloseTitleMenu = Catalog.action('CloseTitleMenu', {
  what: 'Closes the menu of a title',
  why: 'To go back to the shelf',
  meta: { label: 'Close', keys: [] },
})

const MenuMessage = S.Union([ShowTitleMenu, CloseTitleMenu])
type MenuMessage = typeof MenuMessage.Type

const menuChart = define({ state: MenuState, message: MenuMessage })({
  initial: Closed(),
  states: {
    Closed: {
      on: {
        ShowTitleMenu: to('OpenOn', ({ message }) =>
          OpenOn({ key: message.key }),
        ),
      },
    },
    OpenOn: {
      on: {
        ShowTitleMenu: to('OpenOn', ({ message }) =>
          OpenOn({ key: message.key }),
        ),
        CloseTitleMenu: to('Closed', () => Closed()),
      },
    },
  },
})

const isOpenOn = (state: MenuState, key: string): boolean =>
  state._tag === 'OpenOn' && state.key === key

/**
 * A menu on a row of a list, as a part: a hold on the row or the second
 * button opens it, and the row says whether its menu is open.
 */
export const TitleMenu = Part.define<MenuState, MenuMessage>({
  name: 'TitleMenu',
  State: MenuState,
  Message: MenuMessage,
  chart: menuChart,
  actions: [ShowTitleMenu, CloseTitleMenu],
  sync: { ShowTitleMenu: Synced(), CloseTitleMenu: Synced() },
  slots: {
    Row: {
      focus: 'None',
      gestures: [
        { gesture: 'HeldLong', becomes: 'ShowTitleMenu' },
        { gesture: 'PressedSecondary', becomes: 'ShowTitleMenu' },
      ],
    },
  },
  atRest: () => Closed(),
  project: (state, _props, _slot, maybeChoice) => ({
    isExpanded: Option.exists(maybeChoice, key => isOpenOn(state, key)),
  }),
})

/**
 * The open menu as the fields a List takes, or none while it is closed.
 *
 * @example
 * ```typescript
 * List({ label: 'Library', items, ...menuOf(views.TitleMenu) })
 * ```
 */
export const menuOf = (
  menu: Part.View<MenuState>,
): Readonly<{ menu?: ItemMenu }> =>
  M.value(menu.state).pipe(
    M.withReturnType<Readonly<{ menu?: ItemMenu }>>(),
    M.tagsExhaustive({
      Closed: () => ({}),
      OpenOn: ({ key }) => ({
        menu: {
          key,
          items: [{ action: `Open:${key}`, label: 'Open' }],
          dismissAction: 'CloseTitleMenu',
        },
      }),
    }),
  )

// PIN

/** The shelf is not pinned. */
export const Unpinned = ts('Unpinned')
/** The shelf is pinned. */
export const Pinned = ts('Pinned')

const PinState = S.Union([Unpinned, Pinned])
type PinState = typeof PinState.Type

/** Pins the shelf, or lets it go: a hold on the pin, or the second button. */
export const TogglePin = Catalog.action('TogglePin', {
  what: 'Pins the shelf, or lets it go',
  why: 'To keep the shelf at hand',
  meta: { label: 'Pin', keys: [] },
})

const PinMessage = S.Union([TogglePin])
type PinMessage = typeof PinMessage.Type

const pinChart = define({ state: PinState, message: PinMessage })({
  initial: Unpinned(),
  states: {
    Unpinned: { on: { TogglePin: to('Pinned', () => Pinned()) } },
    Pinned: { on: { TogglePin: to('Unpinned', () => Unpinned()) } },
  },
})

/**
 * A second part, on another kind of node: a button a hold or the second
 * button pins. No painter names it.
 */
export const Pin = Part.define<PinState, PinMessage>({
  name: 'Pin',
  State: PinState,
  Message: PinMessage,
  chart: pinChart,
  actions: [TogglePin],
  sync: { TogglePin: Synced() },
  slots: {
    Button: {
      role: 'Button',
      focus: 'None',
      gestures: [
        { gesture: 'HeldLong', becomes: 'TogglePin' },
        { gesture: 'PressedSecondary', becomes: 'TogglePin' },
      ],
    },
  },
  atRest: state => state,
  project: state => ({ isCurrent: state._tag === 'Pinned' }),
})

// SCREEN

/**
 * The shelf's screen. The menu is three lines of it: the row's `slot`,
 * `...menuOf(menu)`, and the view it is read from. Nothing here names a
 * Message, a Command, a Subscription or how anything syncs.
 */
export const shelfScreen = (
  model: ShelfModel,
  menu: Part.View<MenuState>,
  pin: Part.View<PinState>,
): UiNode =>
  Column(
    { gap: 1 },
    List({
      label: 'Library',
      items: Array.map(model.titles, title => ({
        key: title.slug,
        title: title.name,
        action: `Open:${title.slug}`,
        slot: menu.slot('Row', title.slug),
      })),
      ...menuOf(menu),
    }),
    Button({
      label: pin.state._tag === 'Pinned' ? 'Unpin the shelf' : 'Pin the shelf',
      slot: pin.slot('Button'),
    }),
  )

/**
 * The shelf with its two parts, composed with one call.
 *
 * @example
 * ```typescript
 * const shelf = Shelf.start()
 * shelf.press('ShowTitleMenu:salt-road')
 * shelf.model().parts.TitleMenu // OpenOn({ key: 'salt-road' })
 * ```
 */
export const App = Part.compose({
  of: ShelfProgram,
  parts: [
    Part.given(TitleMenu, () => undefined),
    Part.given(Pin, () => undefined),
  ],
  screen: (model, views) =>
    shelfScreen(model, views['TitleMenu'] ?? noView, views['Pin'] ?? noView),
})

const noView: Part.View<any> = {
  state: Closed(),
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

/** The shelf's Model with its parts. */
export type Model = typeof App.Model.Type

// RUN

type Waiting = Readonly<{ dueMs: number; command: ProgramCommand<any, any> }>

/**
 * The shelf running in a test, with no runtime and a clock moved by hand:
 * what a painter's host presses goes in at `press`, the waits the Model
 * asked for end when `elapse` reaches them, and the Model and the screen
 * are read back.
 */
export type Running = Readonly<{
  model: () => Model
  tree: () => UiNode
  press: (tag: string) => void
  folded: () => ReadonlyArray<string>
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

/**
 * Starts the shelf for a test.
 *
 * @example
 * ```typescript
 * const shelf = Shelf.start()
 * shelf.press('fk-hold-down:ShowTitleMenu:salt-road')
 * await shelf.elapse(500)
 * shelf.tree() // the List now says a hold completed, with the press to send
 * ```
 */
export const start = (): Running => {
  const [initialModel] = App.init()
  const held: {
    model: Model
    nowMs: number
    waiting: ReadonlyArray<Waiting>
    folded: ReadonlyArray<string>
  } = { model: initialModel, nowMs: 0, waiting: [], folded: [] }
  const send = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel, commands] = App.update(held.model, message)
    held.model = nextModel
    held.folded = [...held.folded, message._tag]
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
    Array.forEach(messages, send)
  }
  const elapse = async (ms: number): Promise<void> => {
    held.nowMs = held.nowMs + ms
    const due = Array.filter(held.waiting, each => each.dueMs <= held.nowMs)
    held.waiting = Array.filter(held.waiting, each => each.dueMs > held.nowMs)
    for (const each of due) {
      const answer = await answerOf(each.command)
      if (typeof answer === 'object' && answer !== null && '_tag' in answer) {
        send(S.decodeUnknownSync(App.Message)(answer))
      }
    }
  }
  return {
    model: () => held.model,
    tree: () => App.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    folded: () => held.folded,
    elapse,
  }
}

/**
 * The Actions a running shelf folded, in order, leaving out what a hold's
 * rule was told on the way. Every painter's gesture test expects the same
 * list for the same thing a person did.
 *
 * @example
 * ```typescript
 * actionsOf(shelf) // ['ShowTitleMenu'] after a hold on Salt Road, on any painter
 * ```
 */
export const actionsOf = (running: Running): ReadonlyArray<string> =>
  Array.filter(running.folded(), tag => !Object.hasOwn(LongPress.sync, tag))
