import {
  Array,
  Duration,
  Effect,
  Match as M,
  Schema as S,
  SchemaTransformation,
} from 'effect'
import { describe, expect, it } from 'vitest'

import * as ActionMenu from '../actionMenu/actionMenu.js'
import * as Catalog from '../catalog/catalog.js'
import { formatTailRow } from '../cli/tail.js'
import { type ProgramHandle, bind } from '../interaction/bind.js'
import { keyInput } from '../interaction/interaction.js'
import {
  effectiveFocusOf,
  noTerminalFocus,
  pressTerminalKeyAt,
} from '../interaction/terminalFocus.js'
import * as Navigation from '../navigation/public.js'
import { compose } from '../program/compose.js'
import { make } from '../program/program.js'
import { List } from '../renderers/elements.js'
import * as Route from '../route/parser.js'
import { start } from '../runtime/start.js'
import { Memory, makeMemoryStore } from '../runtime/syncEngine.js'
import { ts } from '../schema/index.js'
import * as Session from './session.js'

const handleOf = <Model, Message>(
  started: Readonly<{
    readModel: () => Model
    observeModel: (listener: (model: Model) => void) => () => void
    send: (message: Message) => void
  }>,
): ProgramHandle<Model, Message> => ({
  readModel: started.readModel,
  subscribe: listener => started.observeModel(listener),
  send: started.send,
  stop: () => Promise.resolve(),
})

const Home = ts('Home')

const OpenBook = Catalog.action('OpenBook', {
  fields: { slug: S.String },
  what: 'Opens one book',
  why: 'To read it',
  choose: {
    field: 'slug',
    prompt: 'Which book?',
    token: S.String,
    choicesOf: () => [
      {
        value: 'a-new-earth',
        title: 'A New Earth',
        availability: Catalog.Enabled(),
      },
      {
        value: 'small-hours',
        title: 'Small Hours',
        availability: Catalog.Enabled(),
      },
      {
        value: 'salt-road',
        title: 'Salt Road',
        availability: Catalog.Enabled(),
      },
    ],
    nothingToChoose: 'no books',
  },
  meta: {
    label: 'Open',
    keys: [],
  },
})

const NextPage = Catalog.action('NextPage', {
  what: 'Turns to the next page',
  why: 'To read on',
  meta: { label: 'Next page', keys: ['ArrowRight'] },
})

const BooksMessage = S.Union([OpenBook, NextPage])
type BooksMessage = typeof BooksMessage.Type

const BooksModel = S.Struct({
  opened: S.Array(S.String),
  page: S.Number,
})
type BooksModel = typeof BooksModel.Type

const ChildBooks = make({
  id: 'synced-focus-books',
  version: 1,
  Model: BooksModel,
  Message: BooksMessage,
  catalog: Catalog.make([OpenBook, NextPage]),
  navigation: Navigation.screens({
    slug: 'books',
    root: Navigation.rootScreen(Home, Route.here, { title: () => 'Library' }),
  }),
  screen: () =>
    List({
      label: 'Books',
      items: [
        {
          key: 'a-new-earth',
          title: 'A New Earth',
          action: 'OpenBook:a-new-earth',
        },
        {
          key: 'small-hours',
          title: 'Small Hours',
          action: 'OpenBook:small-hours',
        },
        {
          key: 'salt-road',
          title: 'Salt Road',
          action: 'OpenBook:salt-road',
        },
      ],
    }),
  init: () => [{ opened: [], page: 1 }, []],
  update: (model: BooksModel, message: BooksMessage) =>
    M.value(message).pipe(
      M.withReturnType<readonly [BooksModel, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        OpenBook: ({ slug }) => [
          { ...model, opened: [...model.opened, slug] },
          [],
        ],
        NextPage: () => [{ ...model, page: model.page + 1 }, []],
      }),
    ),
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
  },
})

const App = ActionMenu.compose({
  of: Session.compose({ of: ChildBooks, initialMode: 'Mirror' }),
})

const MessageRow = S.Struct({
  id: S.String,
  body: S.String,
  from: S.String,
  createdAtMs: S.Number,
})

const SnapshotRow = S.Struct({
  id: S.String,
  payload: S.String,
  asOf: S.String,
  at: S.Number,
})

const MessageWire = MessageRow.pipe(
  S.decodeTo(
    S.fromJsonString(App.Message),
    SchemaTransformation.transform({
      decode: row => row.body,
      encode: body => ({ id: '', body, from: '', createdAtMs: 0 }),
    }),
  ),
)

const SnapshotWire = SnapshotRow.pipe(
  S.decodeTo(
    S.fromJsonString(App.Model),
    SchemaTransformation.transform({
      decode: row => row.payload,
      encode: payload => ({ id: 'snap', payload, asOf: '', at: 0 }),
    }),
  ),
)

const SyncedApp = compose.sync({
  of: App,
  snapshot: SnapshotWire,
  message: MessageWire,
})

const waitUntil = (isDone: () => boolean): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 200 && !isDone(); attempt += 1) {
      yield* Effect.sleep(Duration.millis(10))
    }
  })

describe('Synced focus (Scribe #2592)', () => {
  it('collapses a rapid arrow burst into 1 settled Focused row, mirrors to other devices, and formats in tail', async () => {
    const store = makeMemoryStore()

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const desktop = yield* start({
            program: SyncedApp,
            sync: Memory({ store, processor: 'cli-desktop1' }),
          })
          const phone = yield* start({
            program: SyncedApp,
            sync: Memory({ store, processor: 'expo-phone1' }),
          })
          const boundDesktop = bind(SyncedApp, handleOf(desktop))
          const boundPhone = bind(SyncedApp, handleOf(phone))

          let localFocus = noTerminalFocus
          const down = keyInput('ArrowDown')
          // Rapid 3-arrow burst: lands on Salt Road immediately on Desktop.
          localFocus = pressTerminalKeyAt(boundDesktop, down, localFocus).focus
          localFocus = pressTerminalKeyAt(boundDesktop, down, localFocus).focus
          localFocus = pressTerminalKeyAt(boundDesktop, down, localFocus).focus

          expect(boundDesktop.focus()['/books']).toBe('OpenBook:salt-road')
          expect(effectiveFocusOf(boundDesktop)['/books']).toBe(
            'OpenBook:salt-road',
          )
          // Before the 150 ms settle window expires, 0 rows written yet.
          expect(store.messages.length).toBe(0)

          // Wait for Pace.Settled({ afterMs: 150 }) to write 1 coalesced row.
          yield* waitUntil(() => store.messages.length >= 1)
          yield* Effect.sleep(Duration.millis(50))

          const rows = store.messages
          expect(rows.length).toBe(1)

          const decoded = S.decodeUnknownSync(MessageWire)(rows[0])
          expect(decoded).toEqual(
            Session.Focused({
              screen: '/books',
              target: 'OpenBook:salt-road',
            }),
          )

          // Phone receives mirrored focus automatically.
          yield* waitUntil(
            () => boundPhone.focus()['/books'] === 'OpenBook:salt-road',
          )
          expect(boundPhone.focus()['/books']).toBe('OpenBook:salt-road')

          // `books tail` formats Focused cleanly.
          const tailLines = formatTailRow(MessageWire, rows[0])
          expect(Array.join(tailLines, '\n')).toContain('Focused')
          expect(Array.join(tailLines, '\n')).toContain('OpenBook:salt-road')
        }),
      ),
    )
  })

  it('flushes pending Focused ahead of an immediate Enter action in causal order', async () => {
    const store = makeMemoryStore()

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const desktop = yield* start({
            program: SyncedApp,
            sync: Memory({ store, processor: 'cli-desktop2' }),
          })
          const boundDesktop = bind(SyncedApp, handleOf(desktop))

          let localFocus = noTerminalFocus
          localFocus = pressTerminalKeyAt(
            boundDesktop,
            keyInput('ArrowDown'),
            localFocus,
          ).focus
          localFocus = pressTerminalKeyAt(
            boundDesktop,
            keyInput('ArrowDown'),
            localFocus,
          ).focus
          // Immediate Enter before 150 ms settle expires.
          pressTerminalKeyAt(boundDesktop, keyInput('Enter'), localFocus)

          yield* waitUntil(() => store.messages.length >= 2)
          const decoded = Array.map(store.messages, row =>
            S.decodeUnknownSync(MessageWire)(row),
          )
          expect(decoded.map(message => message._tag)).toEqual([
            'Focused',
            'OpenBook',
          ])
        }),
      ),
    )
  })

  it('does not steal ArrowRight from an enabled Catalog shortcut like NextPage (S-05)', async () => {
    const store = makeMemoryStore()

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const desktop = yield* start({
            program: SyncedApp,
            sync: Memory({ store, processor: 'cli-desktop3' }),
          })
          const boundDesktop = bind(SyncedApp, handleOf(desktop))

          const pressed = pressTerminalKeyAt(
            boundDesktop,
            keyInput('ArrowRight'),
            noTerminalFocus,
          )
          expect(pressed.outcome).toBe('Handled')
          const model = desktop.readModel()
          expect(model._tag).toBe('Ready')
          if (model._tag === 'Ready') {
            expect(model.page).toBe(2)
          }
          expect(boundDesktop.focus()['/books']).toBeUndefined()
        }),
      ),
    )
  })
})
